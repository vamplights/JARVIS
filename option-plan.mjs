import {entryExpiresAt,staleFor} from './signal-policy.mjs';
import {parts,session} from './engine.mjs';
export function optionReality(signal,contract,settings){
 const q=contract?.quote;if(!q||!(contract.multiplier>0)||![q.delta,q.theta,q.bid,q.ask].every(Number.isFinite)||q.bid<=0||q.ask<q.bid)return {available:false,blocked:true,reason:'Fresh delta, theta and two-sided option quote required'};
 const days=signal.tf*12/1440,spread=(q.ask-q.bid)*contract.multiplier,risk=signal.size?.plannedRisk||0;
 const scenario=underlying=>{const premium=Math.max(0,q.ask+q.delta*(underlying-signal.price)+q.theta*days-(q.ask-q.bid));return {premium,pnl:(premium-q.ask)*contract.multiplier};};
 const ratio=risk>0?spread/risk:Infinity;
 return {available:true,blocked:ratio>(settings.maxSpreadOfRisk??.25),spreadCost:spread,spreadOfRisk:ratio,target:scenario(signal.target),stop:scenario(signal.stop),horizonDays:days,reason:ratio>(settings.maxSpreadOfRisk??.25)?'Round-trip option spread cost exceeds planned-risk allowance':'Spread cost is within the planned-risk allowance',label:'Estimate using current delta, theta and bid/ask. Ignores IV changes, gamma and fill uncertainty; underlying probabilities do not describe option profit.'};
}
// Shared by signal plans and the options selector; only actual listed dates can be suggested.
export function suggestedExpiry(chain,now=Date.now(),connected=true){
 const checkedAt=chain?.time??null,age=now-checkedAt,fresh=connected&&checkedAt!=null&&age>=-5000&&age<3600000;
 if(!fresh)return {expiration:null,days:null,checkedAt,state:'loading',reason:'Loading listed expirations from Robinhood'};
 const today=parts(now,'America/New_York').date,midnight=Date.parse(today+'T00:00:00Z');
 const dates=[...new Set((chain.items||[]).flatMap(c=>c.expiration_dates||[]))].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).map(expiration=>({expiration,days:Math.round((Date.parse(expiration+'T00:00:00Z')-midnight)/86400000)})).filter(d=>d.days>=0).sort((a,b)=>a.days-b.days);
 return dates.length?{...dates[0],checkedAt,state:'listed',reason:dates[0].days===0?'0DTE · expires today':'No same-day expiry listed; nearest available expiry'}:{expiration:null,days:null,checkedAt,state:'none',reason:'No current or future listed expiry is available'};
}
export function optionContractIssues(c,settings,now=Date.now()){
 const q=c?.quote,issues=[];
 if(c?.tradability!=='tradable')issues.push('contract not tradable');
 if(!Number.isFinite(c?.multiplier)||!(c.multiplier>0))issues.push('contract multiplier missing');
 if(!q)return [...issues,'quote unavailable'];
 if(!Number.isFinite(q.time)||q.time>now+5000||now-q.time>settings.staleSeconds*1000)issues.push('quote stale or time invalid');
 if(!Number.isFinite(q.bid)||!(q.bid>0)||!Number.isFinite(q.ask)||q.ask<q.bid)issues.push('positive two-sided bid/ask missing');
 else if((q.ask-q.bid)/((q.ask+q.bid)/2)*100>(settings.optionMaxSpread??10))issues.push('spread above '+(settings.optionMaxSpread??10)+'%');
 if(!Number.isFinite(q.openInterest))issues.push('open interest unavailable');else if(q.openInterest<(settings.optionMinOI??100))issues.push('open interest below '+(settings.optionMinOI??100));
 if(!Number.isFinite(q.volume))issues.push('volume unavailable');else if(q.volume<(settings.optionMinVolume??20))issues.push('volume below '+(settings.optionMinVolume??20));
 if(!Number.isFinite(q.delta)||Math.abs(q.delta)<.35||Math.abs(q.delta)>.7)issues.push('absolute delta outside 0.35–0.70');
 return issues;
}
export function optionPlanAvailability({signal,options,settings,now=Date.now(),connected=false,expiration,open=true}){
 if(!connected)return {code:'disconnected',reason:'Connect Robinhood to load verified option contracts.'};
 if(!open)return {code:'closed',reason:'Option paper entries require the regular stock session.'};
 if(!expiration)return {code:'expiry',reason:'No current or future listed expiry is available.'};
 if(options?.loading)return {code:'loading',reason:'Option contracts are still loading. Try again when the request finishes.'};
 if(options?.symbol!==signal.symbol||options.expiration&&options.expiration!==expiration)return {code:'selection',reason:'Load '+signal.symbol+' contracts for '+expiration+'; the loaded chain is for a different stock or expiry.'};
 if(options?.error)return {code:'provider',reason:'Option quote request failed: '+options.error};
 const side=signal.dir>0?'call':'put',matching=(options?.contracts||[]).filter(c=>c.type===side&&c.expiration===expiration),counts={};
 for(const c of matching)for(const reason of optionContractIssues(c,settings,now))counts[reason]=(counts[reason]||0)+1;
 const eligible=matching.filter(c=>!optionContractIssues(c,settings,now).length).length;
 return {code:eligible?'ready':'filtered',loaded:matching.length,eligible,rejections:counts,reason:eligible?'Verified matching contracts are available.':matching.length?'Loaded '+matching.length+' '+side.toUpperCase()+' contracts for '+expiration+'; none passes the entry filters: '+Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([reason,n])=>reason+' ('+n+'/'+matching.length+')').join('; ')+'.':'No '+side.toUpperCase()+' contracts for '+expiration+' were returned in the loaded chain.'};
}
export function optionSignalPlan({signal,chain,options,news,history,settings,now=Date.now(),connected=false}){
 const type=signal.dir>0?'call':'put',suggestion=suggestedExpiry(chain,now,connected),chainFresh=suggestion.state!=='loading';
 const expiry=suggestion.expiration?{date:suggestion.expiration,days:suggestion.days}:null,open=session(now,settings).regular;
 const candidates=options?.symbol===signal.symbol&&!options.error&&connected&&open?(options.contracts||[]).filter(c=>c.type===type&&c.expiration===expiry?.date&&optionContractEligible(c,settings,now)).map(c=>({...c,spread:(c.quote.ask-c.quote.bid)/((c.quote.ask+c.quote.bid)/2)*100})).filter(c=>c.spread<=(settings.optionMaxSpread??10)&&c.quote.openInterest>=(settings.optionMinOI??100)&&c.quote.volume>=(settings.optionMinVolume??20)&&Number.isFinite(c.quote.delta)&&Math.abs(c.quote.delta)>=.35&&Math.abs(c.quote.delta)<=.7).sort((a,b)=>Math.abs(Math.abs(a.quote.delta)-.55)-Math.abs(Math.abs(b.quote.delta)-.55)||a.spread-b.spread):[];
 const availability=optionPlanAvailability({signal,options,settings,now,connected,expiration:expiry?.date,open}),contract=candidates[0]||null,cal=history?.calibration,newsFresh=!!(news&&!news.retained&&now-news.checkedAt>=0&&now-news.checkedAt<3600000),companyKey=String(news?.company||'').toLowerCase().replace(/^the /,'').split(/\s+/)[0],headlines=newsFresh?(news.items||[]).filter(n=>(String(n.title||'').toUpperCase().split(/[^A-Z0-9.]+/).includes(signal.symbol)||(companyKey&&companyKey.length>2&&String(n.title||'').toLowerCase().includes(companyKey)))&&n.kind==='Headline'&&n.publishedAt<=now&&now-n.publishedAt<=86400000):[],events=[...new Set(headlines.flatMap(n=>n.themes||[]))],eventRisk=events.some(t=>['Earnings','Regulatory','Deal'].includes(t));
 const sources=new Set((news?.sources||[]).filter(s=>s.ok).map(s=>s.name));
 const components=[{name:'Technical checklist',points:Math.round(.6*signal.score),max:60,detail:'Trend, candle confirmation, volume, structure, entry/stop and underlying spread.'},{name:'Measured forward evidence',points:cal?.eligible?Math.round(.2*cal.score):0,max:20,detail:cal?.eligible?'Conservative matched underlying direction estimate; not option returns.':'Awaiting 100 matched outcomes across 20 sessions.'},{name:'Contract quality',points:contract?10+(contract.quote.volume>=20&&contract.quote.openInterest>=100?5:0):0,max:15,detail:contract?'Fresh bid/ask; configured spread, volume and open-interest limits passed; absolute delta 0.35–0.70. Extra 5 points requires volume ≥20 and open interest ≥100.':'Load the suggested expiry; fresh matching contract data is required.'},{name:'News coverage',points:newsFresh&&sources.size>=2?5:0,max:5,detail:'5 points for recent checks of at least two sources, not for bullish/bearish sentiment.'}];
 const penalty=eventRisk?10:0,raw=Math.max(0,components.reduce((sum,c)=>sum+c.points,0)-penalty),entryConfirmed=signal.status==='CONFIRMED'&&open;
 const confidence=Math.min(raw,!entryConfirmed?49:contract?100:69,signal.context?.events?.warnings?.length?69:100);
 const reasons=[`${signal.direction} ${signal.name} maps to a long ${type.toUpperCase()} idea; this does not select a stock trade or place an order.`,expiry?`Suggested listed expiry: ${expiry.date} (${expiry.days} calendar days). Policy chooses the available 7–21 day expiry closest to 14 days; this is a planning default, not an optimized expiry or a hold-until date.`:chainFresh?'No listed expiration in the 7–21 day planning window.':'Expiration awaiting a recent Robinhood chain check.',`Setup status: ${signal.status==='STALE'&&now>entryExpiresAt(signal,settings)?'SETUP EXPIRED':signal.status}; ${open?'regular session open':'market closed'}. ${entryConfirmed?'Entry rules passed.':'Not an entry recommendation; confidence is capped at 49%.'}`,newsFresh?`${headlines.length} headlines from the past 24 hours; topics: ${events.join(', ')||'no tagged topic'}. Claims and event dates still require verification.`:'News missing or older than one hour; no news-coverage points.',eventRisk?'Unresolved earnings, legal/regulatory or deal headline risk: −10 points. A headline may refer to a past event; this is a conservative review flag, not a verified upcoming event.':'No event-risk deduction; an empty feed is not an event clearance.',contract?`Candidate ${type.toUpperCase()} ${contract.strike}: spread ${contract.spread.toFixed(1)}%, delta ${contract.quote.delta}. IV and theta are shown for review; IV history is tracked separately in Market Context; no options-profit calibration exists.`:'No qualified matching contract loaded. Confidence is capped at 69% even for a confirmed underlying setup.','Keep the signal’s intraday exit/stop plan. The expiry is not a prediction that the move lasts until that date.'];
 if(signal.context?.events?.warnings?.length)reasons.push('Confidence capped at 69% because calendar coverage is incomplete: '+signal.context.events.warnings.join('; '));
 return {availability,reality:contract?optionReality(signal,contract,settings):{available:false,blocked:true,reason:availability.reason},type:type.toUpperCase(),expiration:expiry?.date||null,daysToExpiry:expiry?.days??null,confidence,components,eventPenalty:penalty,entryConfirmed,calibrated:!!cal?.eligible,newsContextUsed:!!history?.newsEvidence?.used,label:!entryConfirmed?'NOT ENTRY-CONFIRMED':!contract?'CONTRACT REVIEW NEEDED':eventRisk?'EVENT REVIEW NEEDED':'CANDIDATE FOR REVIEW',meaning:'Evidence confidence, not a percentage chance of winning. Fixed heuristic weights; options outcomes have not been calibrated.',reasons,newsLinks:headlines.slice(0,4).map(n=>({title:n.title,url:n.url})),contract:contract?{id:contract.id,multiplier:contract.multiplier,bid:contract.quote.bid,strike:contract.strike,expiration:contract.expiration,ask:contract.quote.ask,debit:contract.quote.ask*contract.multiplier,delta:contract.quote.delta,iv:contract.quote.iv,theta:contract.quote.theta,spread:contract.spread,quoteTime:contract.quote.time}:null};
}

export function optionContractEligible(c,settings,now=Date.now()){return optionContractIssues(c,settings,now).length===0;}
