// Jarvis's model is kept verbatim in jarvis-model-core.mjs. This adapter retains
// local settings cohorts, causal features and embargoed chronological validation.
import {featuresOf,trainLogistic,predict} from './jarvis-model-core.mjs';
import {brierScore} from './trend-model.mjs';
export const CONFIDENCE_PROTOCOL='jarvis-confidence-v2';
export const MIN_HISTORY=15;
const bounded=p=>Math.max(.01,Math.min(.99,p));
const aliases={'EMA trend alignment':'34 EMA slope','Relative volume':'Volume confirmation','Market structure':'Not choppy','Higher-timeframe trend':'HTF trend filter'};
export function confidenceFeatures(s){
 const f=s.features||s;
 return featuresOf({strategyId:s.strategy,variant:s.variant||'direct',direction:(s.dir??f.dir)>0?'bullish':'bearish',score:f.score,
  factors:(f.factors||[]).map(x=>({...x,name:aliases[x.name]||x.name}))},{regime:String(f.regime||'').toLowerCase()});
}
export function fitConfidenceModel(samples,market,now=Date.now()){
 const rows=samples.filter(r=>r.market===market&&Number.isFinite(r.time)&&Number.isFinite(r.closedAt)&&r.closedAt<=now).sort((a,b)=>a.time-b.time),
  outcomes=rows.map(r=>({strategy:r.strategy,variant:r.variant||'direct',tf:r.tf,score:r.features?.score??r.score,closedAt:r.closedAt,y:r.y,realizedR:r.realizedR,source:r.source})),result={market,protocol:CONFIDENCE_PROTOCOL,n:rows.length,outcomes,trainedAt:now};
 if(rows.length<40)return result;
 const cutoff=rows[Math.floor(rows.length*.7)].time,training=rows.filter(r=>r.closedAt+r.tf*12*60000<cutoff),heldOut=rows.filter(r=>r.time>=cutoff);
 if(training.length<20||new Set(training.map(r=>r.y)).size<2)return result;
 const model=trainLogistic(training.map(r=>({x:confidenceFeatures(r),y:r.y,w:r.source==='historical replay'?1:2}))),predictions=heldOut.map(r=>bounded(predict(model,confidenceFeatures(r)).p)),labels=heldOut.map(r=>r.y),brier=brierScore(predictions,labels),baselineBrier=brierScore(labels.map(()=>model.base),labels);
 return {...result,model,trainN:training.length,trainEnd:Math.max(...training.map(r=>r.closedAt)),validationStart:cutoff,validationN:heldOut.length,brier,baselineBrier,beatsBaseline:brier!==null&&brier<baselineBrier};
}
const band=score=>[90,80,70,60,0].find(b=>score>=b);
function historyInfo(past,s){
 const exact=past.filter(r=>r.strategy===s.strategy&&(r.variant||'direct')===(s.variant||'direct')&&r.tf===s.tf),bucket=exact.filter(r=>band(r.score)===band(s.score??s.features?.score)),chosen=bucket.length>=MIN_HISTORY?bucket:exact,
  measured=chosen.filter(r=>Number.isFinite(r.realizedR)),historicalAvgR=measured.length===chosen.length&&measured.length?measured.reduce((n,r)=>n+r.realizedR,0)/measured.length:null;
 // Jarvis's daily review mutes setups whose optimistic 90% win-rate bound is
 // below break-even after at least 40 weighted outcomes. Only past labels count.
 const setup=past.filter(r=>r.strategy===s.strategy&&(r.variant||'direct')===(s.variant||'direct'));
 let n=0,w=0;for(const r of setup){const weight=r.source==='historical replay'?1:2;n+=weight;w+=weight*r.y;}
 const z=1.645,p=n?w/n:0,upper=n?(p+z*z/(2*n)+z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/(1+z*z/n):1,breakeven=s.confidenceExitMode==='1.5R'?1/2.5:1/3;
 return {chosen,matchingN:chosen.length,historicalAvgR,muted:n>=40&&upper<breakeven};
}
export function confidencePrediction(saved,s){
 if(saved?.market&&s.market&&saved.market!==s.market||saved?.protocol!==CONFIDENCE_PROTOCOL)saved=null;
 const asOf=s.confirmedAt??s.features?.asOf,empty={probability:null,kind:'unavailable',label:'Estimated win percent',n:0,drivers:[],expectedR:null,version:CONFIDENCE_PROTOCOL};
 if(!Number.isFinite(asOf))return {...empty,reason:'No causal signal time for an outcome estimate.'};
 const past=(saved?.outcomes||[]).filter(r=>r.closedAt<asOf),history=historyInfo(past,s),{chosen,...info}=history;
 if(saved?.model&&saved.trainEnd<asOf){
  const md=predict(saved.model,confidenceFeatures(s)),validated=saved.validationStart<=asOf&&past.length===saved.outcomes.length;
  return {...info,probability:bounded(md.p),kind:'outcome-model',label:'Estimated win percent',n:saved.trainN,baselineProbability:md.base,drivers:md.drivers.map(d=>({factor:d.label,changePoints:d.pts})),expectedR:null,
   brier:validated?saved.brier:null,baselineBrier:validated?saved.baselineBrier:null,validationN:validated?saved.validationN:0,beatsBaseline:validated?saved.beatsBaseline:false,
   reason:'Outcome-trained model: strategy, direction, rule score, regime and supported individual checks. Preliminary; validation results are reported separately. Underlying outcome, not option-contract profit.',version:CONFIDENCE_PROTOCOL};
 }
 if(chosen.length<MIN_HISTORY)return {...empty,...info,n:chosen.length,required:MIN_HISTORY,reason:'Collecting matching history: '+chosen.length+'/'+MIN_HISTORY+' strategy/timeframe outcomes. No percentage is inferred from a tiny sample or the setup score.'};
 return {...info,probability:bounded(chosen.reduce((n,r)=>n+r.y,0)/chosen.length),kind:'historical',label:'Estimated win percent',n:chosen.length,baselineProbability:past.length?past.reduce((n,r)=>n+r.y,0)/past.length:null,drivers:[],expectedR:null,
  reason:'Historical win rate for matching strategy, variant, timeframe and score band when sufficiently sampled. Preliminary, not a validated prediction or an option-profit estimate.',version:CONFIDENCE_PROTOCOL};
}
