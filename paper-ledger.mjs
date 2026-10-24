import {entryExpiresAt,staleFor} from './signal-policy.mjs';
import {optionContractEligible,optionReality} from './option-plan.mjs';
// Persistent forward-only signal observations and simulated fills. No order API is used.
import fs from 'node:fs';import path from 'node:path';
import {metrics,dayKey,riskState,positionSize,session,marketCosts} from './engine.mjs';
import {observeOptionOutcomes} from './option-outcomes.mjs';
import {observeSignalOutcomes} from './signal-outcomes.mjs';
import {analyzeLedger,settingsProfile} from './stats.mjs';
const fresh=(q,now,seconds)=>q&&q.time<=now+5000&&now-q.time<=seconds*1000;
export function performance(rows){
 const closed=rows.filter(t=>t.closedAt&&Number.isFinite(t.pnl)).sort((a,b)=>a.closedAt-b.closedAt),groups=key=>Object.fromEntries([...new Set(closed.map(t=>t[key]))].map(k=>[k,metrics(closed.filter(t=>t[key]===k))]));let equity=0,peak=0;
 return {overall:metrics(closed),byMarket:groups('market'),byStrategy:groups('strategy'),curve:closed.map(t=>{equity+=t.pnl;peak=Math.max(peak,equity);return {time:t.closedAt,equity,drawdown:peak-equity};}),open:rows.filter(t=>!t.closedAt).length};
}
// Shared automatic/manual long-option execution math: full premium plus both fees at risk.
export function optionPaperEntry({ask,multiplier,budget,available,slippageBps,feePerContract}){
 const entry=ask*(1+slippageBps/10000),unitRisk=entry*multiplier+2*feePerContract,size=Number.isFinite(unitRisk)&&unitRisk>0?Math.floor(Math.min(budget,available)/unitRisk):0;
 return {entry,size,reserved:entry*multiplier*size+feePerContract*size};
}
export class PaperLedger{
 constructor(dir){this.file=path.join(dir,'signal-paper-ledger.json');try{this.data=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Signal log cannot be read; original file preserved');this.data={version:1,enabled:false,startedAt:null,initialCapital:1500,riskPercent:1,feePerContract:.65,signals:[],trades:[],universe:[]};}this.data.enabled=false;this.data.observations??=[];this.error=null;this.lastTick=0;}
 save(){try{const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.data));fs.renameSync(tmp,this.file);this.error=null;}catch(e){this.error='Signal/paper log could not be saved: '+e.code;}}
 configure(x,settings){if(typeof x.enabled!=='boolean')throw Error('Choose paper mode on/off');if(x.riskPercent!==undefined&&(!(x.riskPercent>0)||x.riskPercent>10))throw Error('Paper risk percentage must be above 0 and at most 10');if(x.feePerContract!==undefined&&(!(x.feePerContract>=0)||x.feePerContract>100))throw Error('Invalid per-contract fee');if(!this.data.startedAt&&x.enabled){this.data.initialCapital=settings.capital;this.data.startedAt=Date.now();}this.data.enabled=x.enabled;this.data.riskPercent=x.riskPercent??this.data.riskPercent;this.data.feePerContract=x.feePerContract??this.data.feePerContract;this.save();}
 rememberOptionPlan(signal,now){const p=signal.optionPlan;if(!p?.contract||p.reality?.blocked!==false||p.reality?.available!==true||signal.replay||signal.legacyProfile)return;
 const row=this.data.signals.find(r=>r.id===signal.id);if(!row)return;row.optionPlans??={};if(row.optionPlans[p.contract.id])return;row.optionPlans[p.contract.id]={plan:structuredClone(p),signal:structuredClone({...signal,optionPlan:undefined}),issuedAt:now};return true;
 }
 paperTradeOption(signal,contractId,options,settings,now=Date.now()){
  if(!signal?.id||typeof contractId!=='string'||!contractId)throw Error('Choose a signal and its planned option contract');
  const existing=this.data.trades.find(t=>t.source==='manual-click'&&t.signalId===signal.id&&t.contractId===contractId);if(existing)return {trade:existing,duplicate:true};
  const record=this.data.signals.find(r=>r.id===signal.id),issued=record?.optionPlans?.[contractId],frozen=issued?.signal||record?.engineSnapshot||signal,plan=issued?.plan||frozen.optionPlan;
  if(!plan?.contract||plan.contract.id!==contractId||plan.reality?.blocked!==false||plan.reality?.available!==true)throw Error('This contract is not part of an eligible frozen option plan');
  if(!session(now,settings).regular)throw Error('Option paper entries require the regular stock session');
  // Manual clicks are research choices, independent of engine status/window gates.
  if(signal.replay||signal.legacyProfile)throw Error('Replay and older settings-cohort signals cannot be manually paper-traded');
  if(record?.profile&&record.profile!==settingsProfile(settings))throw Error('This signal belongs to an older settings cohort');
  const raw=(options?.contracts||[]).find(c=>c.id===contractId),q=raw?.quote;
  if(options?.error||options?.loading||!raw||!q)throw Error('The chosen contract or current quote is unavailable; reload its option chain');
  if(!optionContractEligible(raw,settings,now)||q.time>now)throw Error('A fresh positive bid/ask, delta/theta, tradable contract, volume, open interest and acceptable spread are required');
  if(raw.multiplier!==plan.contract.multiplier||raw.expiration!==plan.contract.expiration||raw.symbol&&raw.symbol!==frozen.symbol||raw.type&&raw.type.toUpperCase()!==plan.type)throw Error('Loaded contract does not match the frozen plan');
  const reality=optionReality(frozen,raw,settings);if(reality.blocked)throw Error(reality.reason);
  const closed=this.data.trades.filter(t=>t.closedAt),startingCapital=!this.data.startedAt&&!this.data.trades.length?settings.capital:this.data.initialCapital,equity=startingCapital+closed.reduce((n,t)=>n+t.pnl,0),available=Math.max(0,equity-this.data.trades.filter(t=>!t.closedAt).reduce((n,t)=>n+t.reserved,0)),budget=Math.min(settings.risk,Math.max(0,equity)*this.data.riskPercent/100),journal=this.data.trades.map(t=>({id:t.id,decision:'taken',time:new Date(t.openedAt).toISOString(),closedAt:t.closedAt?new Date(t.closedAt).toISOString():null,pnl:t.pnl||0}));
  if(riskState(journal,settings,now).blocked)throw Error('Paper daily trade or loss limit reached');
  const costs=marketCosts(settings,'stocks'),fill=optionPaperEntry({ask:q.ask,multiplier:raw.multiplier,budget,available,slippageBps:costs.slippageBps,feePerContract:this.data.feePerContract});
  if(!(fill.size>0))throw Error('One full option premium plus costs exceeds the paper risk or cash allowance');
  const trade={id:'manual-option:'+signal.id+':'+contractId,signalId:signal.id,contractId,profile:settingsProfile(settings),source:'manual-click',entryMode:'manual',market:'options',symbol:frozen.symbol,strategy:frozen.strategy,tf:frozen.tf,cohort:'manual',dir:1,underlyingDir:frozen.dir,optionType:plan.type,expiration:raw.expiration,multiplier:raw.multiplier,...fill,stop:frozen.stop,target:frozen.target??frozen.price+frozen.dir*Math.abs(frozen.price-frozen.stop)*2,openedAt:now,clickedAt:now,entryQuoteTime:q.time,lastChecked:now,lastBarEnd:now,expiresAt:now+frozen.tf*12*60000,feePerContract:this.data.feePerContract,slippageBps:costs.slippageBps,outcome:'active',pnl:null,optionPlan:structuredClone(plan),assumption:'Manual paper click only. Fresh current ask observed at click plus slippage; full premium and round-trip contract fees at risk. No backdated fill; underlying and option P&L are separate.'};
  if(!this.data.startedAt&&!this.data.trades.length){this.data.initialCapital=startingCapital;this.data.startedAt=now;}this.data.trades.push(trade);this.save();if(this.error){this.data.trades.pop();throw Error(this.error);}return {trade,duplicate:false};
 }
 optionPaperResults({day=null,profile=null}={}){
  const rows=this.data.trades.filter(t=>t.market==='options'&&(!profile||t.profile===profile)).map(t=>({...t,entryAt:t.openedAt,strategies:[t.strategy],entryMode:t.source==='manual-click'?'manual':'automatic',calibration:t.source==='manual-click'?'manual':'automatic',exitReason:t.outcome,realizedR:null,probability:null})),selected=day?rows.filter(t=>t.closedAt&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t.closedAt))===day):rows,p=performance(selected),curve=p.curve.map((v,i)=>{const t=selected.filter(t=>t.closedAt).sort((a,b)=>a.closedAt-b.closedAt)[i];return {...v,pnl:v.equity,win:t?.pnl>0,id:t?.id,symbol:t?.symbol};}),daily={};
  for(const t of rows.filter(t=>t.closedAt)){const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t.closedAt));daily[date]=(daily[date]||0)+t.pnl;}let equity=0;
  return {profile,cohorts:[...new Set(this.data.trades.filter(t=>t.market==='options'&&t.profile).map(t=>t.profile))].map(profile=>({profile,n:this.data.trades.filter(t=>t.profile===profile&&t.market==='options').length})),market:'options',n:p.overall.count,realizedPnl:p.overall.pnl,winRate:p.overall.winRate,profitFactor:p.overall.profitFactor,maxDrawdown:p.overall.maxDrawdown,avgR:null,curve,rows:selected,open:rows.filter(t=>!t.closedAt&&(!day||day===new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))),history:Object.entries(daily).sort().filter(([date])=>!day||date<=day).map(([date,pnl])=>({date,pnl,equity:equity+=pnl})),buckets:{},missedFills:0,unmeasurable:0,realistic:{skipped:[],startingCapital:this.data.initialCapital},manualCount:selected.filter(t=>t.source==='manual-click').length,note:'Actual observed option asks/bids with slippage and per-contract fees. Manual and automatic option legs share the existing simulated paper cash/risk limits. Option P&L is separate from the underlying R, model labels and automatic stock/crypto scenarios.'};
 }
 // One-contract option forward test: confirmation rules remain; premium/cash budgets do not gate simulation.
 observeAutomaticOptions(signals,optionsForSymbol,settings,now=Date.now()){
  this.data.automaticOptionQueue??=[];const profile=settingsProfile(settings);let changed=false;
  for(const s of signals){
   if(s.market!=='stocks'||s.status!=='CONFIRMED'||s.replay||s.legacyProfile||s.demo||s.inspectionOnly||s.conflicted||!Number.isFinite(s.confirmedAt)||s.confirmedAt>now||now>entryExpiresAt(s,settings)||!session(now,settings).regular)continue;
   if(this.data.automaticOptionQueue.some(r=>r.signal.id===s.id&&r.profile===profile)||this.data.trades.some(t=>t.source==='automatic'&&t.signalId===s.id&&t.profile===profile))continue;
   const plan=s.optionPlan;if(!plan?.contract?.id||plan.reality?.available!==true||plan.reality?.blocked!==false)continue;
   this.data.automaticOptionQueue.push({signal:structuredClone(s),profile,queuedAt:now,settings:structuredClone(settings)});changed=true;
  }
  for(const row of this.data.automaticOptionQueue){
   if(row.done)continue;const s=row.signal,cfg=row.settings;
   if(row.profile!==profile||now>entryExpiresAt(s,cfg)){row.done=true;row.skip='Settings changed or entry window expired';changed=true;continue;}
   const current=signals.find(x=>x.id===s.id);if(current?.status!=='CONFIRMED'||!session(now,cfg).regular)continue;
   const plan=s.optionPlan,raw=optionsForSymbol(s.symbol)?.contracts?.find(c=>c.id===plan.contract.id),q=raw?.quote;
   if(!raw||!q||q.time<=row.queuedAt||q.time>now||!optionContractEligible(raw,cfg,now))continue;
   if(raw.multiplier!==plan.contract.multiplier||raw.expiration!==plan.contract.expiration||raw.symbol&&raw.symbol!==s.symbol||raw.type?.toUpperCase()!==plan.type||optionReality(s,raw,cfg).blocked)continue;
   const costs=marketCosts(cfg,'stocks'),entry=q.ask*(1+costs.slippageBps/10000),fill={entry,size:1,reserved:entry*raw.multiplier+this.data.feePerContract};
   this.data.trades.push({id:'auto-option:'+s.id+':'+profile,signalId:s.id,profile,source:'automatic',sizingMode:'one-contract-no-budget',market:'options',symbol:s.symbol,strategy:s.strategy,strategies:s.strategies,tf:s.tf,contractId:raw.id,optionType:plan.type,expiration:raw.expiration,multiplier:raw.multiplier,dir:1,underlyingDir:s.dir,...fill,stop:s.stop,target:s.target,openedAt:now,entryQuoteTime:q.time,lastChecked:now,lastBarEnd:now,expiresAt:now+s.tf*12*60000,feePerContract:this.data.feePerContract,slippageBps:costs.slippageBps,outcome:'active',pnl:null,optionPlan:structuredClone(plan),assumption:'Automatic option-only forward simulation. One contract regardless of premium or simulated cash allowance. Next observed eligible ask plus costs. Underlying stop/target triggers an observed option bid exit; no guaranteed option-dollar stop.'});row.done=true;changed=true;
  }
  this.data.automaticOptionQueue=this.data.automaticOptionQueue.filter(r=>!r.done);if(changed)this.save();
 }
 heldOptionIds(){return [...new Set([...(this.data.optionObservations||[]).filter(r=>!r.closedAt&&r.outcome!=="unmeasurable").map(r=>r.contractId),...this.data.trades.filter(t=>t.market==='options'&&!t.closedAt).map(t=>t.contractId)])];}
 observe(signals,assets,options,settings,now=Date.now(),optionQuotes={}){
  // Signal IDs and paperConsidered enforce deduplication; never discard newly detected observations.
  this.lastTick=now;let changed=observeSignalOutcomes(this.data,signals,assets,settings,now);changed=observeOptionOutcomes(this.data,signals,options,settings,now,optionQuotes)||changed;
  const universe=JSON.stringify({stocks:settings.stocks,crypto:settings.crypto}),last=this.data.universe.at(-1);if(last?.symbols!==universe){this.data.universe.push({time:now,symbols:universe});changed=true;}
  const known=new Map(this.data.signals.map(s=>[s.id,s]));
  for(const s of signals){let row=known.get(s.id);if(!row){const recent=now<=entryExpiresAt(s,settings);row={id:s.id,profile:settingsProfile(settings),timestamp:now,candleClose:s.confirmedAt,symbol:s.symbol,source:s.source,fallback:!!s.fallback,strategies:s.strategies,confluenceCount:s.confluenceCount,market:s.market,strategy:s.strategy,timeframe:s.tf,direction:s.direction,dir:s.dir,entry:s.price,entryRange:s.entry,stop:s.stop,target:s.target??s.price+s.dir*Math.abs(s.price-s.stop)*2,rr:s.rr??2,netRR:s.netRR,signalStatus:s.status,outcome:recent?'active':'expired',expiresAt:now+s.tf*12*60000,lastChecked:now,lastBarEnd:now,firstSeenStatus:s.status,why:s.factors?.find(f=>f.name==='Candle confirmation')?.detail,cohort:s.status==='CONFIRMED'&&s.paperEligible!==false?'confirmed':'raw',targetCapped:s.rr<settings.minRR,regime:s.regime,adx:s.adx??null,efficiency:s.efficiency??null,stopATR:s.stopATR??null,newsIds:s.optionPlan?.newsLinks?.map(n=>n.url)||[],settings:structuredClone(settings)};this.data.signals.push(row);known.set(s.id,row);changed=true;}
   if(!row.engineSnapshot&&(s.frozen||s.status==='CONFIRMED')){row.engineSnapshot=structuredClone(s);changed=true;}if(s.status==='INVALIDATED'&&row.engineSnapshot){row.engineSnapshot.status='INVALIDATED';changed=true;}
   if(this.rememberOptionPlan(s,now))changed=true;
   if(row.signalStatus!==s.status){row.signalStatus=s.status;changed=true;}
   if(this.data.enabled&&s.paperEligible!==false&&s.status==='CONFIRMED'&&row.outcome==='active'&&!row.paperQueued&&now<=entryExpiresAt(s,settings)){row.paperQueued=true;row.paperQueuedAt=now;row.paperSnapshot=structuredClone(s);changed=true;}
  }
  for(const row of this.data.signals){const a=assets[row.symbol],q=a?.quote;if(row.outcome==='active'){
    const bars=(a?.bars||[]).filter(b=>b.complete!==false&&b.time*1000>=row.timestamp&&(b.time+a.base)*1000>row.lastBarEnd&&(b.time+a.base)*1000<=now&&b.time*1000<row.expiresAt).sort((a,b)=>a.time-b.time);
    for(const b of bars){row.lastBarEnd=(b.time+a.base)*1000;const stop=row.dir>0?b.low<=row.stop:b.high>=row.stop,target=row.dir>0?b.high>=row.target:b.low<=row.target;if(stop||target){row.outcome=stop?'stopped out':'hit target';row.outcomeAt=(b.time+a.base)*1000;row.ambiguous=stop&&target;break;}}
    if(row.outcome==='active'&&fresh(q,now,settings.staleSeconds)&&q.time>row.timestamp){if((q.price-row.stop)*row.dir<=0){row.outcome='stopped out';row.outcomeAt=q.time;}else if((q.price-row.target)*row.dir>=0){row.outcome='hit target';row.outcomeAt=q.time;}}
    if(row.outcome==='active'&&now>=row.expiresAt){row.outcome='expired';row.outcomeAt=now;}row.lastChecked=now;changed=true;
   }
   if(!this.data.enabled||!row.paperQueued||row.paperConsidered)continue;
   if(now>entryExpiresAt(row.paperSnapshot||{confirmedAt:row.paperQueuedAt,tf:row.timeframe},settings)||row.outcome!=='active'){row.paperConsidered=true;row.paperSkip='Entry window expired before an eligible forward quote';changed=true;continue;}
   const s=row.paperSnapshot;if(!fresh(q,now,settings.staleSeconds)||q.time<=row.paperQueuedAt)continue;
   row.paperConsidered=true;changed=true;
   // Frozen signal must still qualify at the time of a simulated fill.
   const current=signals.findLast(x=>x.id===row.id&&x.paperEligible!==false);if(current?.status!=='CONFIRMED'){row.paperSkip='Setup no longer confirmed at fill';continue;}
   const closed=this.data.trades.filter(t=>t.closedAt),equity=this.data.initialCapital+closed.reduce((n,t)=>n+t.pnl,0),reserved=this.data.trades.filter(t=>!t.closedAt).reduce((n,t)=>n+t.reserved,0),available=Math.max(0,equity-reserved),budget=Math.min(settings.risk,Math.max(0,equity)*this.data.riskPercent/100),simSettings={...settings,capital:available,risk:budget};
   const journal=this.data.trades.map(t=>({id:t.id,decision:'taken',time:new Date(t.openedAt).toISOString(),closedAt:t.closedAt?new Date(t.closedAt).toISOString():null,pnl:t.pnl||0}));if(riskState(journal,settings,now).blocked){row.paperSkip='Paper daily trade/loss limit';continue;}
   if(this.data.trades.some(t=>!t.closedAt&&t.symbol===row.symbol)){row.paperSkip='Existing paper exposure for this symbol';continue;}
   const dir=s.dir,book=q.bid>0&&q.ask>=q.bid,costs=marketCosts(settings,row.market,q),slip=costs.slippageBps/10000;
   if(!book){row.paperSkip='Usable live bid/ask required';continue;}
   const entry=(dir>0?q.ask:q.bid)*(1+dir*slip),distance=(entry-s.stop)*dir,target=s.target??s.price+dir*Math.abs(s.price-s.stop)*2,cost=(entry+target)*costs.feeBps/10000+entry*(2*slip+(q.ask-q.bid)/((q.ask+q.bid)/2));
   if(distance<=0||(target-entry)*dir<=0||((target-entry)*dir-cost)/(distance+cost)<settings.minRR||Math.abs(entry-s.price)>s.atr*.3){row.paperSkip='Entry moved or net reward/risk insufficient';continue;}
   const size=positionSize(entry,s.stop,row.market,simSettings,q).size;if(!(size>0)){row.paperSkip='Below minimum size within paper risk budget';continue;}
   const id=row.id+':'+now;this.data.trades.push({id,signalId:row.id,market:row.market,symbol:row.symbol,strategy:row.strategy,tf:row.timeframe,cohort:'confirmed',targetCapped:s.rr<settings.minRR,dir,entry,stop:s.stop,target,size,openedAt:now,lastChecked:now,expiresAt:now+row.timeframe*12*60000,reserved:entry*size*(1+costs.feeBps/10000),feeBps:costs.feeBps,slippageBps:costs.slippageBps,mfeR:0,maeR:0,outcome:'active',pnl:null,assumption:dir<0?'Hypothetical stock short; borrow availability and costs unverified':'Paper bid/ask plus configured slippage and fees'});
   // Options are a separate simulated leg, conservatively sized by full premium at risk.
   const c=s.optionPlan?.contract,oq=c&&((options?.contracts||[]).find(x=>x.id===c.id)?.quote||optionQuotes[c.id]);
   if(c&&current.optionPlan?.contract?.id===c.id&&fresh(oq,now,settings.staleSeconds)&&oq.time>row.paperQueuedAt&&oq.bid>0&&oq.ask>=oq.bid){const raw=(options.contracts||[]).find(x=>x.id===c.id),multiplier=raw?.multiplier,fee=this.data.feePerContract,remaining=available-entry*size*(1+costs.feeBps/10000),optionFill=optionPaperEntry({ask:oq.ask,multiplier,budget,available:remaining,slippageBps:costs.slippageBps,feePerContract:fee}),fill=optionFill.entry,qty=multiplier>0?optionFill.size:0;
    if(qty>0&&riskState([...journal,{id,time:new Date(now).toISOString(),decision:'taken'}],settings,now).remaining>0)this.data.trades.push({id:id+':option',signalId:row.id,profile:row.profile,source:'automatic',market:'options',symbol:row.symbol,strategy:row.strategy,contractId:c.id,optionType:s.optionPlan.type,expiration:c.expiration,multiplier,dir:1,underlyingDir:dir,entry:fill,stop:s.stop,target,size:qty,openedAt:now,lastChecked:now,expiresAt:now+row.timeframe*12*60000,reserved:fill*multiplier*qty+fee*qty,feePerContract:fee,slippageBps:costs.slippageBps,outcome:'active',pnl:null,assumption:'Long option entered at future ask plus slippage; exit at observed bid after underlying trigger. Full debit is risk budget; underlying stop cannot cap premium loss.'});else row.optionSkip='One full option premium exceeds paper risk/cash allowance, or daily allowance used';
   }else if(row.market==='stocks')row.optionSkip='No fresh forward quote for a qualified contract at entry';
  }
  for(const t of this.data.trades.filter(t=>!t.closedAt)){
   const a=assets[t.symbol],q=a?.quote,dir=t.market==='options'?t.underlyingDir:t.dir;
   if(t.market!=='options'&&fresh(q,now,settings.staleSeconds)){const r=(q.price-t.entry)*t.dir/Math.abs(t.entry-t.stop);t.mfeR=Math.max(t.mfeR??0,r);t.maeR=Math.min(t.maeR??0,r);}
   t.lastBarEnd??=t.openedAt;
   // Mark at the executable side of the book, including modeled liquidation costs.
   const markQuote=t.market==='options'?optionQuotes[t.contractId]||(options.contracts||[]).find(c=>c.id===t.contractId)?.quote:q;
   t.markFresh=!!(fresh(markQuote,now,settings.staleSeconds)&&markQuote.bid>=0&&markQuote.ask>=markQuote.bid);
   if(t.markFresh){const mark=(t.dir>0?markQuote.bid:markQuote.ask)*(1-t.dir*t.slippageBps/10000),fees=t.market==='options'?2*t.feePerContract*t.size:(mark+t.entry)*t.size*t.feeBps/10000;t.markTime=markQuote.time;t.unrealized=(mark-t.entry)*t.dir*t.size*(t.multiplier||1)-fees;}
   if(!t.exitPending){const bars=(a?.bars||[]).filter(b=>b.complete!==false&&b.time*1000>=t.openedAt&&(b.time+a.base)*1000>t.lastBarEnd&&(b.time+a.base)*1000<=now&&b.time*1000<t.expiresAt).sort((a,b)=>a.time-b.time);
    for(const b of bars){t.lastBarEnd=(b.time+a.base)*1000;const stop=dir>0?b.low<=t.stop:b.high>=t.stop,target=dir>0?b.high>=t.target:b.low<=t.target;if(stop||target){t.exitPending=stop?'stopped out':'hit target';t.triggerTime=(b.time+a.base)*1000;t.ambiguous=stop&&target;break;}}
    if(!t.exitPending&&fresh(q,now,settings.staleSeconds)&&q.time>t.openedAt){if((q.price-t.stop)*dir<=0)t.exitPending='stopped out';else if((q.price-t.target)*dir>=0)t.exitPending='hit target';if(t.exitPending)t.triggerTime=q.time;}
    if(!t.exitPending&&now>=t.expiresAt){t.exitPending='expired';t.triggerTime=now;}t.lastChecked=now;changed=true;
   }
   if(!t.exitPending)continue;
   if(t.market!=='crypto'&&!session(now,settings).regular)continue;
   let quote=t.market==='options'?optionQuotes[t.contractId]||(options.contracts||[]).find(c=>c.id===t.contractId)?.quote:q;
   if(t.market!=='options'&&t.exitPending==='expired'&&!fresh(quote,now,settings.staleSeconds)){const b=(a?.bars||[]).filter(b=>b.complete!==false&&(b.time+a.base)*1000<=t.expiresAt&&(b.time+a.base)*1000>=t.expiresAt-Math.max(a.base*1000,settings.staleSeconds*1000)).at(-1);if(b){const c=marketCosts(settings,t.market),half=b.close*c.spreadBps/20000;quote={bid:b.close-half,ask:b.close+half,time:t.triggerTime};}}
   // Never manufacture an exit while the market/feed is unavailable. Keep exposure visible.
   if(!fresh(quote,now,settings.staleSeconds)||quote.time<t.triggerTime||!(quote.bid>=0)||!(quote.ask>=quote.bid))continue;
   const exit=(t.dir>0?quote.bid:quote.ask)*(1-t.dir*t.slippageBps/10000),multiplier=t.multiplier||1,fees=t.market==='options'?2*t.feePerContract*t.size:(exit+t.entry)*t.size*t.feeBps/10000;
   t.exit=exit;t.closedAt=now;t.pnl=(exit-t.entry)*t.dir*t.size*multiplier-fees;t.realizedR=t.market==='options'?null:t.pnl/(t.size*Math.abs(t.entry-t.stop));t.outcome=t.exitPending;t.exitPending=null;changed=true;
  }
  if(changed)this.save();
 }
 stats(options={}){return analyzeLedger(this.data,options);}
 snapshot(){const open=this.data.trades.filter(t=>!t.closedAt),marks=open.filter(t=>t.markFresh&&Date.now()-t.markTime<=30000&&Number.isFinite(t.unrealized));return {unrealized:marks.reduce((n,t)=>n+t.unrealized,0),markedPositions:marks.length,unpricedPositions:open.length-marks.length,enabled:this.data.enabled,initialCapital:this.data.initialCapital,riskPercent:this.data.riskPercent,feePerContract:this.data.feePerContract,startedAt:this.data.startedAt,error:this.error,signalCount:this.data.signals.length,signals:this.data.signals.slice(-500).reverse(),trades:this.data.trades.slice(-500).reverse(),performance:performance(this.data.trades),coverage:'Forward observations only. Missed intrabar paths and feed outages can change results. Active positions with missing exit quotes remain open. Equity chart is realized P/L. Open positions show separate bid/ask marks after estimated exit costs; stale marks are explicitly labeled.',universeSnapshots:this.data.universe.length};}
}
