import {staleFor,selectedWinEstimate} from './signal-policy.mjs';
export function explainSignal(s){
 const p=s.parameters||{},ema=p.emaPeriod||34,side=s.dir>0?'above':'below',move=s.dir>0?'up':'down';
 if(p.strictContinuation&&['ema-retest','vwap','momentum-retest','orb5-retest','orb15-retest'].includes(s.strategy)){const label=s.strategy==='ema-retest'?'the moving average':s.strategy==='vwap'?'VWAP':'the breakout level';return 'Price pulled back to '+label+'. A later completed candle must close '+(s.dir>0?'above the previous candle’s high':'below the previous candle’s low')+' within '+(p.resumptionBars||3)+' candles. '+(s.strategy==='ema-retest'?'The initial move must clear the minimum ATR distance.':s.strategy==='vwap'?'The recent VWAP trend and crossing limits must also pass.':'Only the first retest is used.');}
 const descriptions={
  'ema-cross':`Price crossed ${side} the ${ema} EMA (moving average), and the candle finished in that direction.`,
  'ema-retest':`Price returned to the ${ema} EMA, bounced, and closed back ${side} it. The setup looks for the earlier ${move}trend to continue.`,
  vwap:`Price returned to VWAP (the session's average price weighted by trading volume) and closed back ${side} it, in line with the trend.`,
  momentum:`Price broke ${side} the previous ${p.consolidationBars||12} candles' range with a strong closing candle.`,
  'momentum-retest':`After breaking out, price came back to the edge of the earlier range and closed ${side} it again.`,
  orb5:`Price closed ${side} the high/low range made during the first five minutes after the stock market opened.`,
  orb15:`Price closed ${side} the high/low range made during the first fifteen minutes after the stock market opened.`,
  'orb5-retest':`Price revisited the edge of the first five-minute opening range, then closed back ${side} it.`,
  'orb15-retest':`Price revisited the edge of the first fifteen-minute opening range, then closed back ${side} it.`
 };const text=descriptions[s.strategy]||s.name;return s.factors?.find(f=>f.name==='Candle confirmation')?.pass===false?'Still waiting for this pattern: '+text:text;
}
export const factorNames={'EMA trend alignment':'The moving average points the same way','Candle confirmation':'The candle has closed and confirmed the pattern','Relative volume':'Trading activity is strong enough','Market structure':'Price is moving cleanly enough','Entry / invalidation':'Entry, stop and target fit the rules','Spread verified':'The quoted buy/sell price gap is acceptable'};
// Never equate passed-check percentage with a probability of a profitable trade.
export function displayConfidence(s){const p=selectedWinEstimate(s);if(Number.isFinite(p.probability))return {...p,probability:Math.max(.01,Math.min(.99,p.probability)),kind:p.kind||'model',label:'Estimated win percent'};return {...p,probability:null,kind:p.kind||'unavailable',label:'Estimated win percent',n:p.n||0,drivers:p.drivers||[],reason:p.reason||'No eligible earlier outcomes. Setup score is separate from profit probability.'};}
export function riskBlockReason(s){if(s.status!=='BLOCKED BY RISK RULE')return '';const reasons=(s.warnings||[]).filter(w=>/Daily consecutive-loss lockout|Daily trade allowance used|Outside configured entry schedule|Stock no-entry window|already recorded as taken/.test(w));return reasons.map(w=>({'Daily consecutive-loss lockout':'Your consecutive-loss limit was reached for today.','Daily trade allowance used':'Your daily trade allowance has been used.','Outside configured entry schedule':'Outside the allowed entry hours (stock session or configured cutoff).','Stock no-entry window (Eastern time)':'Inside a no-entry time window in your settings.','This signal is already recorded as taken':'This setup is already logged as taken.'}[w]||w)).join(' ')||'An account or entry-schedule rule is blocking this setup.';}
export function probabilityText(s){const p=displayConfidence(s);return Number.isFinite(p.probability)?(p.probability*100).toFixed(0)+'%':'No outcomes yet';}
export function modelExplanation(s,{esc,num}){const p=displayConfidence(s),heuristic=p.kind!=='model';return '<p class="note">'+esc(costsRiskText(s))+'</p><section class="model-explanation"><h2>'+p.label+'</h2><strong class="profit-estimate has-estimate">'+esc(probabilityText(s))+'</strong><p>'+esc(p.reason||'Estimate from earlier measured outcomes.')+'</p>'+(heuristic?'<p class="note">Based on '+(p.n||0)+' earlier '+(p.kind==='outcome-model'?'training':'matching')+' outcomes. '+(Number.isFinite(p.baselineProbability)?'Baseline '+num(p.baselineProbability*100,0)+'%. ':'')+(Number.isFinite(p.brier)?'Later holdout Brier '+num(p.brier,4)+' vs baseline '+num(p.baselineBrier,4)+' across '+p.validationN+' outcomes. ':'')+'No 200-trade or 15-session requirement. Historical fallback needs 15 matching trades; model training starts at 40 market outcomes with an embargoed chronological split. Preliminary estimates are not validated predictions.</p>':'<p>Expected result after costs: <b>'+num(p.expectedR,3)+'R</b> · 90% interval '+(p.interval90?p.interval90.map(v=>num(v,3)+'R').join(' to '):'unavailable')+'. Based on '+p.n+' earlier outcomes in this cohort, including actual time exits.</p><p class="note">Brier score '+num(p.brier,4)+' vs baseline '+num(p.baselineBrier,4)+'; skill '+num(Number.isFinite(p.skillScore)?p.skillScore*100:null,1)+'%. Lower Brier is better. This estimates the underlying setup, not an option contract.</p>')+'<div class="factors">'+(p.drivers||[]).map(d=>'<div class="factor"><span class="'+(d.changePoints>=0?'live':'amber')+'">'+(d.changePoints>=0?'↑':'↓')+'</span><div>'+esc(d.factor)+'</div><b>'+(d.changePoints>=0?'+':'')+num(d.changePoints,1)+' '+'pts'+'</b></div>').join('')+'</div><p class="note">'+(heuristic?'This estimates the underlying strategy after costs, not option-contract profit. It does not override status, freshness or risk rules. Preliminary estimates remain separate from validated alerts and learning labels.':'Profit estimates refer to the primary configured exit style. Paired exit comparisons may have different outcomes. Factors describe model associations relative to its training average. They do not prove what caused a move.')+'</p></section>';}

export function costsRiskText(s){return Number.isFinite(s.costsAsRiskPct)?s.costsAsRiskPct.toFixed(1)+'% of risk in estimated round-trip costs':'Costs as % of risk unavailable';}

// Persist the instrument label with the notice; later signal changes must not relabel it.
export function notificationCategory(item={}){
 if(['Crypto','Option','Stock'].includes(item.category))return item.category;
 if(item.market==='crypto')return 'Crypto';
 if(item.market==='options'||item.market==='option'||item.optionPlan?.contract||item.optionContractId)return 'Option';
 const symbol=item.symbol||String(item.title||'').split(' · ')[0];
 return /-(USD|USDT|USDC)$/.test(symbol)?'Crypto':'Stock';
}

// Display rounding only: never feed rounded levels back into evaluation or fills.
export function signalPrice(value){return Number.isFinite(value)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(value):'—';}
export function groupSignalCards(signals){const groups=new Map();for(const s of signals){const key=[s.market,s.symbol].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}return [...groups.values()];}
export function connectionSummary(state,now=Date.now(),offline=false){
 const status=state.status||{},recent=(t,limit)=>Number.isFinite(t)&&now-t>=-5000&&now-t<=limit;
 const coinbase=!offline&&status.feed==='CONNECTED'&&recent(status.lastMessage,15000),rh=status.robinhoodLive||{},robinhood=!offline&&rh.connected===true;
 const assets=(state.assets||[]).filter(a=>!a.replay),fresh=a=>a.quote?.price>0&&recent(a.quote.time,staleFor(state.settings||{},a.market)*1000),missing=[...new Set([...(state.settings?.stocks||[]),...(state.settings?.crypto||[])])].filter(symbol=>!assets.some(a=>a.symbol===symbol)).length,delayed=assets.filter(a=>!fresh(a)).length+missing;
 const recovering=Boolean(status.recovering===true||Array.isArray(status.recovering)&&status.recovering.length||status.recovering&&typeof status.recovering==='object'&&!Array.isArray(status.recovering)&&Object.keys(status.recovering).length);
 const healthy=!offline&&coinbase&&robinhood&&!delayed&&!status.storageError&&!rh.error&&!recovering&&assets.length>0;
 return {coinbase,robinhood,healthy,label:offline?'Local server offline':status.storageError?'Storage needs attention':rh.error?'Robinhood retrying':recovering?'Recovering data':delayed?delayed+' delayed quotes':healthy?'System healthy':'Check data feeds'};
}

// Member checklists were captured at candle close; current parent gates still apply.
export function strategyDetailMembers(parent){return (parent.members||[parent]).map(m=>({...m,status:parent.status==='CONFIRMED'?m.status:parent.status,quoteTime:parent.quoteTime,conflicted:parent.conflicted}));}
export function resolveSignalDetail(id,current,cached){const live=current.find(s=>s.id===id);if(live)return live;const saved=cached.get(id);return saved?{...saved,status:'STALE',inspectionOnly:true}:null;}

export function timeframeLabel(tf,long=false){return tf===1440?'Daily':tf===60?(long?'1 hour':'1h'):tf>60&&tf%60===0?(tf/60)+(long?' hours':'h'):tf+(long?' minutes':'m');}
export function detailViewSignal(s){return {...s,entry:Array.isArray(s.entry)?s.entry:[s.price,s.price],size:s.size||{},factors:s.factors||[],exits:s.exits||[],warnings:s.warnings||[]};}

// DTE is calendar dates in the option market's Eastern time zone, not 24-hour
// periods or trading sessions. Display controls never change/fabricate a plan.
export function contractExpiry(s,now=Date.now()){
 if(s.market!=='stocks'||!Number.isFinite(now))return null;
 const contract=s.optionPlan?.contract||s.optionResearch?.contracts?.[0],date=contract?.expiration||s.optionPlan?.expiration;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
 const stamp=Date.parse(date+'T00:00:00Z');if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==date)return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value])),today=Date.parse(parts.year+'-'+parts.month+'-'+parts.day+'T00:00:00Z');
 return {date,days:Math.round((stamp-today)/86400000),basis:contract?'contract':'planned'};
}
export function matchesExpiry(s,range='all',now=Date.now()){
 if(range==='all')return true;const e=contractExpiry(s,now),d=e?.days;
 if(range==='unassigned')return !e;if(!e)return false;
 return range==='today'?d===0:range==='one'?d===1:range==='week'?d>=0&&d<=7:range==='month'?d>=8&&d<=30:range==='expired'?d<0:true;
}
export function compareExpiry(a,b,now=Date.now(),farthest=false){
 const x=contractExpiry(a,now),y=contractExpiry(b,now),rank=e=>!e?2:e.days<0?1:0,diff=rank(x)-rank(y);if(diff)return diff;
 if(x&&y&&x.days!==y.days)return x.days<0?y.days-x.days:(farthest?-1:1)*(x.days-y.days);
 return String(a.id||'').localeCompare(String(b.id||''));
}
