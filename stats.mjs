import {strategyParams} from './strategy-controls.mjs';
import {createHash} from 'node:crypto';
// Version the changed strategy qualification policy so saved results/models stay in their original cohort.
export const settingsProfile=(s,forwardIdentity='jarvis-forward-v1')=>{const {forwardPaperVersion,forwardExitMode,sidebarSubtitle,showInactiveSignals,studyMode,topPicks,publicOptionResearch,entryWindowVersion,alerts,dailyReview,alertMinEV,alertMinProb,maxStrategyDrawdownR,includeFallbackTraining,...cohort}=s;cohort.strategyParams=Object.fromEntries([...new Set([...(s.strategies||[]),...Object.keys(s.strategyParams||{})])].sort().map(id=>[id,strategyParams(s,id)]));if(forwardPaperVersion===1){cohort.forwardPaperVersion=forwardIdentity;cohort.forwardExitMode=forwardExitMode||'2R';}return createHash('sha256').update('continuation-sequence-v3:').update(JSON.stringify(cohort)).digest('hex').slice(0,20);};
export function bootstrapMeanCI(values,{resamples=2000,seed=271828}={}){
 if(values.length<2)return null;
 let state=seed>>>0;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;},means=[];
 for(let i=0;i<resamples;i++){let sum=0;for(let j=0;j<values.length;j++)sum+=values[Math.floor(random()*values.length)];means.push(sum/values.length);}
 means.sort((a,b)=>a-b);return [means[Math.floor(.025*(resamples-1))],means[Math.ceil(.975*(resamples-1))]];
}
export function summarizeR(rows,options={}){
 const values=rows.map(r=>typeof r==='number'?r:r.realizedR).filter(Number.isFinite),n=values.length,wins=values.filter(x=>x>0),losses=values.filter(x=>x<0),sum=a=>a.reduce((n,x)=>n+x,0);
 return {n,winRate:n?wins.length/n:null,avgR:n?sum(values)/n:null,profitFactor:losses.length?sum(wins)/-sum(losses):null,ci95:bootstrapMeanCI(values,options),sample:n<100?'insufficient sample':'sample threshold met'};
}
export function analyzeLedger(data,{profile=null,...options}={}){
 const all=data.observations||[],eligible=all.filter(r=>r.protocol==='signal-r-v1'&&Number.isFinite(r.realizedR)&&(!profile||r.profile===profile)),groups=new Map();
 for(const row of eligible){const dimensions={market:row.market,horizon:row.horizon||'intraday',strategy:row.strategy,tf:row.tf,direction:row.direction,regime:row.regime||'Unknown',etHour:row.etHour,cohort:row.cohort,targetCapped:row.targetCapped===true,profile:row.profile},key=JSON.stringify(dimensions);if(!groups.has(key))groups.set(key,{dimensions,rows:[]});groups.get(key).rows.push(row);}
 return {protocol:'signal-r-v1',profile,total:all.length,measured:eligible.length,pending:all.filter(r=>!r.closedAt&&r.outcome!=='unmeasurable').length,unmeasurable:all.filter(r=>r.outcome==='unmeasurable').length,
  headline:summarizeR(eligible.filter(r=>r.cohort==='confirmed'&&!r.targetCapped),options),
  groups:[...groups.values()].map(g=>({...g.dimensions,...summarizeR(g.rows,options)})).sort((a,b)=>a.strategy.localeCompare(b.strategy)||a.tf-b.tf||a.etHour-b.etHour),
  note:'R uses the frozen entry-to-stop price distance and subtracts market fees, slippage and spread. Headline includes confirmed, uncapped outcomes only. Raw and capped outcomes stay separate. Legacy records without measured R are excluded. Deterministic 95% trade-bootstrap intervals assume independent trades; overlap and market correlation can make them too narrow. n < 100 is insufficient, and a larger sample alone does not establish an edge.'};
}
export function pooledReplayStats(runs,{version=null,...options}={}){
 // Keep only the latest expanding run per symbol/strategy/timeframe. Deduplicate actual
 // OOS trades, never add per-symbol dollar P/L or combine development trades.
 const latest=new Map();for(const r of runs){if(r.kind!=='walk-forward'||version&&r.version!==version)continue;const key=[r.symbol,r.strategy,r.tf,r.version].join('|');if(!latest.has(key)||r.completedAt>=latest.get(key).completedAt)latest.set(key,r);}
 const seen=new Set(),groups=new Map();for(const r of latest.values()){
  const market=r.market||r.trades?.[0]?.market||'Unknown',key=[market,r.strategy,r.tf,r.version].join('|');if(!groups.has(key))groups.set(key,{market,strategy:r.strategy,tf:r.tf,version:r.version,symbols:new Set(),rows:[]});const g=groups.get(key);g.symbols.add(r.symbol);
  for(const t of r.trades||[]){if(t.segment!=='out-of-sample'||!Number.isFinite(t.realizedR)||t.targetCapped)continue;const id=[r.version,r.symbol,r.strategy,r.tf,t.signalId,t.time].join('|');if(seen.has(id))continue;seen.add(id);g.rows.push(t);}
 }
 return [...groups.values()].map(g=>({market:g.market,strategy:g.strategy,tf:g.tf,version:g.version,symbols:[...g.symbols].sort(),...summarizeR(g.rows,options)}));
}
