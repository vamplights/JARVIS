import {signalFeatures} from './trend-model.mjs';
import {marketCosts,parts} from './engine.mjs';
import {settingsProfile} from './stats.mjs';
const validQuote=(q,now,seconds)=>q&&q.price>0&&Number.isFinite(q.time)&&q.time<=now+5000&&now-q.time<=seconds*1000;
const returnCost=(row,exit,quote)=>{
 const c=row.costs,exitCosts=marketCosts({costs:{[row.market]:c}},row.market,quote);
 return ((row.entry+exit)*(c.feeBps+c.slippageBps)+(row.entry*c.spreadBps+exit*exitCosts.spreadBps)/2)/10000;
};
export function observeSignalOutcomes(data,signals,assets,settings,now){
 data.observations??=[];const profile=settingsProfile(settings),known=new Set(data.observations.map(r=>r.key));let changed=false;
 for(const s of signals){
  if(s.paperEligible===false||s.conflicted||s.replay||assets[s.symbol]?.replay||assets[s.symbol]?.snapshot||!['CONFIRMED','WATCH','SETUP FORMING','STALE','BLOCKED BY RISK RULE'].includes(s.status)||!(s.price>0&&s.stop>0&&s.target>0)||![-1,1].includes(s.dir))continue;
  const cohort=s.status==='CONFIRMED'?'confirmed':'raw',key=[s.id,cohort,profile].join('|');if(known.has(key))continue;known.add(key);
  data.observations.push({protocol:'signal-r-v1',strategies:s.strategies||[s.strategy],confluenceCount:s.confluenceCount||1,source:s.source,fallback:!!s.fallback,conflicted:!!s.conflicted,candleClose:s.confirmedAt,features:signalFeatures(s),prediction:s.profitEstimate?.probability??null,modelVersion:s.profitEstimate?.version??null,alertedAt:s.alertedAt??null,key,id:s.id,profile,setupKeys:s.setupKeys||[s.setupKey],symbol:s.symbol,market:s.market,strategy:s.strategy,tf:s.tf,direction:s.dir>0?'long':'short',dir:s.dir,cohort,statusAtObservation:s.status,targetCapped:s.targetCapped===true||s.rr<settings.minRR,regime:s.regime||'Unknown',adx:s.adx??null,efficiency:s.efficiency??null,stopATR:s.stopATR??null,etHour:+parts(now,'America/New_York').hour,observedAt:now,referenceSize:s.size?.size??null,signalEntry:s.price,stop:s.stop,target:s.target,rr:s.rr,expiresAt:now+s.tf*12*60000,outcome:'awaiting forward entry',entry:null,mfeR:0,maeR:0,lastBarEnd:now});changed=true;
 }
 for(const row of data.observations){
  if(row.closedAt||row.outcome==='unmeasurable')continue;const a=assets[row.symbol],q=a?.quote,seconds=settings.staleSeconds||30;if(row.source&&a?.source&&a.source!==row.source){if(now>=row.expiresAt){row.outcome='unmeasurable';row.reason='Original data source unavailable at exit';changed=true;}continue;}
  if(row.entry===null){
   // A future quote is required; a historical closed-candle price is not a fill.
   if(!validQuote(q,now,seconds)||q.time<=row.observedAt){if(now>=row.expiresAt){row.outcome='unmeasurable';row.reason='No subsequent fresh entry quote';changed=true;}continue;}
   if((q.price-row.stop)*row.dir<=0||(row.target-q.price)*row.dir<=0||q.time>=row.expiresAt){row.outcome='unmeasurable';row.reason='Entry arrived outside the frozen stop/target or entry window';changed=true;continue;}
   row.entry=q.price;row.entryAt=q.time;row.costs=marketCosts(settings,row.market,q);row.lastBarEnd=q.time;row.outcome='active';changed=true;
  }
  const distance=Math.abs(row.entry-row.stop),excursion=price=>{const r=(price-row.entry)*row.dir/distance;row.mfeR=Math.max(row.mfeR,r);row.maeR=Math.min(row.maeR,r);};let exit=null,exitAt=null,reason=null,exitQuote=null;
  const bars=(a?.bars||[]).filter(b=>b.complete!==false&&b.time*1000>=row.entryAt&&(b.time+a.base)*1000>row.lastBarEnd&&(b.time+a.base)*1000<=Math.min(now,row.expiresAt)).sort((a,b)=>a.time-b.time);
  for(const b of bars){excursion(b.high);excursion(b.low);row.lastBarEnd=(b.time+a.base)*1000;changed=true;const stop=row.dir>0?b.low<=row.stop:b.high>=row.stop,target=row.dir>0?b.high>=row.target:b.low<=row.target;
   if(stop||target){exit=stop?(row.dir>0?Math.min(b.open,row.stop):Math.max(b.open,row.stop)):row.target;exitAt=row.lastBarEnd;reason=stop?'stopped out':'hit target';row.ambiguous=stop&&target;break;}
  }
  if(exit===null&&validQuote(q,now,seconds)&&q.time>row.entryAt&&q.time<=row.expiresAt){excursion(q.price);changed=true;if((q.price-row.stop)*row.dir<=0||(q.price-row.target)*row.dir>=0){exit=q.price;exitAt=q.time;reason=(q.price-row.stop)*row.dir<=0?'stopped out':'hit target';exitQuote=q;}}
  if(exit===null&&now>=row.expiresAt){
   const last=(a?.bars||[]).filter(b=>b.complete!==false&&b.time*1000>=row.entryAt&&(b.time+a.base)*1000<=row.expiresAt&&(b.time+a.base)*1000>=row.expiresAt-Math.max(a.base*1000,seconds*1000)).sort((a,b)=>a.time-b.time).at(-1);
   if(validQuote(q,now,seconds)&&q.time>row.entryAt&&Math.abs(q.time-row.expiresAt)<=seconds*1000){exit=q.price;exitAt=q.time;exitQuote=q;}
   else if(last){exit=last.close;exitAt=(last.time+a.base)*1000;}
   else{row.outcome='unmeasurable';row.reason='Expiry has no fresh quote or final closed bar';changed=true;continue;}
   reason='expired';excursion(exit);
  }
  if(exit!==null){row.exit=exit;row.closedAt=exitAt;row.outcome=reason;row.costPerUnit=returnCost(row,exit,exitQuote);row.grossR=(exit-row.entry)*row.dir/distance;row.costR=row.costPerUnit/distance;row.realizedR=row.grossR-row.costR;changed=true;}
 }return changed;
}
