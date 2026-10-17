import {selectedWinEstimate} from './signal-policy.mjs';
import {createRishiPaper} from './rishi-paper-core.mjs';
import {AutoPaper} from './auto-paper.mjs';
import {marketCosts,session,roundTripCost,rewardMetrics} from './engine.mjs';
import {sessionExit} from './beta-strategies.mjs';
import {signalFeatures} from './trend-model.mjs';
import {settingsProfile} from './stats.mjs';
import {writeJSON} from './public-market.mjs';
const PROTOCOL='rishi-forward-v1',MAX=3000;
const direction=s=>s.dir>0?'bullish':'bearish';
export function confirmedForwardEligible(sig,settings,now){
 if(sig.status!=='CONFIRMED'||sig.legacyProfile||sig.replay||sig.demo||sig.inspectionOnly||sig.conflicted||!['stocks','crypto'].includes(sig.market))return false;
 if(!(sig.tf>0&&sig.price>0&&sig.stop>0&&sig.dir*(sig.price-sig.stop)>0)||!Number.isFinite(sig.confirmedAt)||sig.confirmedAt>now)return false;
 // Same fresh-bar check used by Rishi's caller, expressed in JARVIS's closed-candle timestamp.
 return now-sig.confirmedAt<2*sig.tf*60000+15000&&(sig.market!=='stocks'||session(now,settings).regular);
}
function coreContext(row,settings,candles=[],features=row.features||{},prediction=null){
 const raw=row.forwardCore,entry=raw?.fill??candles[0]?.o??row.signalEntry,costs=row.costs||marketCosts(settings,row.market);
 const state={paper:raw?[raw]:[],models:prediction==null?{}:{[row.market]:{}},settings:{backtest:{exitMode:row.forwardExitMode||'2R',stockSlippagePerShare:entry*(costs.feeBps+costs.slippageBps)/10000,stockSpreadPerShare:entry*costs.spreadBps/10000,cryptoSlippagePct:costs.slippageBps/100,cryptoSpreadPct:costs.spreadBps/100}},crypto:{},stocks:{}};
 if(row.market==='crypto')state.crypto[row.symbol]={series:{'1m':{candles}}};else state.stocks[row.symbol]={candles};
 const api=createRishiPaper({S:state,A:{save(){}},newsFeatures:()=>({}),featuresOf:()=>features,predict:()=>({p:prediction}),cryptoSize:(price,stop)=>({ok:true,feeToR:2*price*costs.feeBps/10000/Math.abs(price-stop)}),marketSession:time=>({phase:session(time,settings).regular?'regular':'closed',closeMs:sessionExit(time,settings)+60000})});
 return {state,api};
}
export class RishiForward extends AutoPaper{
 constructor(options){super(options);this.minuteAsset=options.minuteAsset||((row,assets)=>assets[row.symbol]);this.data.forwardSettings??={};for(const row of this.data.rows)if(row.forwardProtocol===PROTOCOL)row.settings=this.data.forwardSettings[row.profile]||row.settings;this.minuteRefresh=new Map();this.refreshing=false;}
 save(){if(!this.file)return;const rows=this.data.rows.map(row=>{if(row.forwardProtocol!==PROTOCOL)return row;const {settings,...stored}=row;return stored;});writeJSON(this.file,{...this.data,rows});}
 observe(signals,assets,now=this.now()){
  const settings=this.settings(),profile=settingsProfile(settings);let changed=false;
  // Keep resolving already-issued legacy rows with their original execution rules.
  const legacyRows=this.data.rows.filter(r=>r.forwardProtocol!==PROTOCOL);
  if(legacyRows.length){const legacy=new AutoPaper({dir:null,settings:this.settings,now:this.now});legacy.data={...this.data,rows:legacyRows};changed=legacy.observe([],assets,now)||changed;}
  const known=new Set(this.data.rows.map(r=>r.id));
  for(const sig of signals){if(!confirmedForwardEligible(sig,settings,now)||assets[sig.symbol]?.replay)continue;const id=[sig.id,profile,'rishi-forward'].join('|');if(known.has(id))continue;known.add(id);
   const estimate=selectedWinEstimate(sig),quote=assets[sig.symbol]?.quote,fresh=quote?.time<=now&&now-quote.time<=(sig.market==='stocks'?settings.stockStaleSeconds:settings.staleSeconds)*1000,costs=marketCosts(settings,sig.market,fresh?quote:null),mult=settings.forwardExitMode==='1.5R'?1.5:2,target=sig.price+sig.dir*mult*Math.abs(sig.price-sig.stop),metrics=rewardMetrics(sig.price,sig.stop,target,sig.market,settings,fresh?quote:null);
   const features=signalFeatures({...sig,target,rr:mult,netRR:metrics.netRR,targetCapped:false});
   this.data.forwardSettings[profile]??=structuredClone(settings);
   const row={id,signalId:sig.id,profile,protocol:'signal-r-v1',forwardProtocol:PROTOCOL,forwardExitMode:settings.forwardExitMode||'2R',source:sig.source,fallback:!!sig.fallback,symbol:sig.symbol,market:sig.market,strategy:sig.strategy,strategies:sig.strategies||[sig.strategy],tf:sig.tf,dir:sig.dir,direction:sig.dir>0?'long':'short',cohort:'confirmed',statusAtObservation:'CONFIRMED',targetCapped:false,signalTargetCapped:!!sig.targetCapped,features,featureTime:sig.confirmedAt,candleClose:sig.confirmedAt,observedAt:now,sequence:this.data.rows.length,horizon:'intraday',signalHorizon:sig.horizon||'intraday',exitStyle:'fixed',predictionExitStyle:'fixed',signalEntry:sig.price,initialStop:sig.stop,stop:sig.stop,target,costs,risk:settings.risk,settings:this.data.forwardSettings[profile],calibration:Number.isFinite(estimate?.probability)?'calibrated':'uncalibrated',probability:estimate?.probability??null,prediction:estimate?.probability??null,expectedR:estimate?.expectedR??null,modelVersion:estimate?.version??null,regime:sig.regime||'Unknown',etHour:sig.etHour,state:'awaiting entry',mfeR:0,maeR:0,expiresAt:sig.market==='crypto'?now+4*3600000:sessionExit(now,settings)+60000};
   const ctx=coreContext(row,settings,[],features,row.probability);ctx.api.recordPaper({id:sig.id,key:id,market:sig.market,symbol:sig.symbol,strategyId:sig.strategy,strategyName:sig.name||sig.strategy,variant:'direct',tf:sig.tf+'m',direction:direction(sig),score:sig.score,regime:sig.regime,entryLow:sig.entryLow??sig.price,entryHigh:sig.entryHigh??sig.price,stop:sig.stop,demo:false},now);row.forwardCore=ctx.state.paper[0];this.data.rows.push(row);changed=true;
  }
  const current=this.data.rows.filter(r=>r.profile===profile&&r.forwardProtocol===PROTOCOL&&!r.forwardArchived);for(const row of current.slice(0,Math.max(0,current.length-MAX))){row.forwardArchived=true;changed=true;}
  for(const row of this.data.rows){if(row.forwardProtocol!==PROTOCOL||row.forwardArchived||row.forwardCore.status!=='open')continue;const raw=row.forwardCore,config=row.settings||this.data.forwardSettings[row.profile],asset=this.minuteAsset(row,assets);let candles=[];
   if(asset?.base===60&&(!asset.source||asset.source===row.source)&&!asset.replay)candles=(asset.bars||[]).filter(b=>b.complete!==false&&Number.isFinite(b.time)&&b.time*1000>=raw.confirmT&&(b.time+60)*1000<=now).sort((a,b)=>a.time-b.time).map(b=>({t:b.time*1000,o:b.open,h:b.high,l:b.low,c:b.close,v:b.volume,closed:true}));
   const before=JSON.stringify(raw),ctx=coreContext(row,config,candles);ctx.api.resolvePaper(now);
   if(!candles.length&&now-raw.confirmT>2*86400000){raw.status='unresolved';raw.note='No complete same-source minute candles after confirmation';}
   if(raw.fill){row.entry=raw.fill;row.initialStop=raw.stop;row.entryAt=row.entryAt??candles[0]?.t;row.entryPriceBasis='subsequent closed 1m candle open';row.size=row.risk/raw.risk;row.target=raw.fill+row.dir*(raw.exitMode==='1.5R'?1.5:2)*raw.risk;row.state='active';row.mfeR=raw.mfeR??0;row.lastMark=candles.at(-1)?.c??row.lastMark;row.lastMarkAt=candles.length?candles.at(-1).t+60000:row.lastMarkAt;if(Number.isFinite(row.lastMark)){const cost=roundTripCost(row.entry,row.lastMark,row.market,{costs:{[row.market]:row.costs}});row.unrealized=((row.lastMark-row.entry)*row.dir-cost)*row.size;}}
   if(raw.status==='closed'){row.state='closed';row.closedAt=raw.exitT;row.exit=raw.exitPx;row.exitReason=raw.why;row.realizedR=raw.r;row.pnl=raw.r*row.risk;row.unrealized=0;}
   else if(raw.status==='skipped'||raw.status==='unresolved'){row.state=raw.status==='skipped'?'missed fill':'unmeasurable';row.reason=raw.note||raw.status;}
   if(before!==JSON.stringify(raw))changed=true;
  }
  if(changed)this.save();return changed;
 }
 async refreshMinuteData(history,now=this.now()){
  if(this.refreshing)return;const pending=[...new Map(this.data.rows.filter(r=>r.forwardProtocol===PROTOCOL&&!r.forwardArchived&&r.forwardCore.status==='open'&&r.market==='crypto').map(r=>[r.symbol,r])).values()].filter(r=>now-(this.minuteRefresh.get(r.symbol)||0)>=60000);if(!pending.length)return;this.refreshing=true;
  try{for(const row of pending){this.minuteRefresh.set(row.symbol,now);await history.download(row.symbol,'crypto',1,{base:60});}}finally{this.refreshing=false;}
 }
 snapshot(options={}){
  const data=this.data;this.data={...data,rows:data.rows.filter(r=>!r.forwardArchived)};
  try{const profile=options.profile||settingsProfile(this.settings()),forward=this.data.rows.some(r=>r.profile===profile&&r.forwardProtocol===PROTOCOL)||profile===settingsProfile(this.settings());const report=super.snapshot({...options,...(forward?{style:'fixed'}:{})});report.forwardTest=forward;report.forwardExitMode=report.rows.find(r=>r.forwardProtocol===PROTOCOL)?.forwardExitMode||this.settings().forwardExitMode||'2R';if(forward)report.note='Automatic forward test: every fresh confirmed live signal, no probability cutoff, closed 1m candle fills, stop before target, selected R target, stock session-close / four-hour crypto exit. Only subsequent same-source closed candles are eligible. Configured per-market costs are included; each R is valued at the fixed dollar risk in All signals. Realistic account adds capital/risk limits. Manual options remain separate.';return report;}finally{this.data=data;}
 }
}
