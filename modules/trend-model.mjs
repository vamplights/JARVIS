// Pure deterministic stock/crypto models. No strategy selection or holdout tuning.
import {trainingCohortKey} from './confluence.mjs';
export const MODEL_PROTOCOL='net-profit-v4-manual-underlying';
const strategies=['ema-cross','ema-retest','vwap','momentum','momentum-retest','orb5','orb5-retest','orb15','orb15-retest','orb-in-play','spy-qqq-momentum','post-earnings','daily-trend'];
export const FEATURE_NAMES=['Trading activity (relative volume)','Trend strength (ADX)','Clean direction (efficiency)','Distance from the average','Stop distance in ATR','Target after costs (R)','EMA agrees with direction','Higher timeframe agrees','Trade direction','Chart timeframe','ET hour sine','ET hour cosine','Number of agreeing strategies',...strategies.map(s=>'Strategy: '+s),'Manual paper selection','Entry delay in candles'];
export function signalFeatures(s){return {asOf:s.confirmedAt,score:s.score,regime:s.regime,factors:(s.factors||[]).map(f=>({name:f.name,pass:f.pass})),confluenceCount:s.confluenceCount||1,strategies:s.strategies||[s.strategy],rvol:s.rvol,adx:s.adx,efficiency:s.efficiency,extension:s.extension,stopATR:s.stopATR,netRR:s.netRR,trendAlignment:s.trendAlignment,higherAlignment:s.higherAlignment,dir:s.dir,tf:s.tf,etHour:s.etHour??(Number.isFinite(s.confirmedAt)?+new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(s.confirmedAt)):NaN)};}
export function assertCausalFeatures(features,candleClose){if(!Number.isFinite(candleClose)||!Number.isFinite(features?.asOf)||features.asOf>candleClose||Object.values(features.timestamps||{}).some(t=>!Number.isFinite(t)||t>candleClose))throw Error('Feature timestamp is after the signal candle close');return true;}
export function featureVector(f,strategy){
 if(!f||!['rvol','adx','efficiency','extension','stopATR','netRR','dir','tf'].every(k=>Number.isFinite(f[k]))||!Number.isFinite(+f.etHour))return null;
 return [Math.min(20,f.rvol),f.adx/100,f.efficiency,Math.min(20,f.extension),f.stopATR,f.netRR,+!!f.trendAlignment,+!!f.higherAlignment,f.dir,f.tf/5,Math.sin(+f.etHour*Math.PI/12),Math.cos(+f.etHour*Math.PI/12),f.confluenceCount||1,...strategies.map(s=>+(f.strategies||[strategy]).includes(s)),+!!f.manualEntry,Math.min(100,Math.max(0,f.entryDelayBars||0))];
}
export const brierScore=(predictions,labels)=>predictions.length&&predictions.length===labels.length?predictions.reduce((sum,p,i)=>sum+(p-labels[i])**2,0)/labels.length:null;
const sigmoid=z=>1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
export function predictProbability(model,x){return sigmoid(model.intercept+x.reduce((sum,v,i)=>sum+(v-model.mean[i])/model.scale[i]*model.weights[i],0));}
export function trainLogistic(rows){
 const n=rows.length,d=FEATURE_NAMES.length,mean=Array(d).fill(0),scale=Array(d).fill(0);
 for(const r of rows)for(let j=0;j<d;j++)mean[j]+=r.x[j]/n;
 for(const r of rows)for(let j=0;j<d;j++)scale[j]+=(r.x[j]-mean[j])**2/n;
 for(let j=0;j<d;j++)scale[j]=Math.sqrt(scale[j])||1;
 const xs=rows.map(r=>r.x.map((v,j)=>(v-mean[j])/scale[j])),base=rows.reduce((n,r)=>n+r.y,0)/n;
 let intercept=Math.log((base+.01)/(1-base+.01));const weights=Array(d).fill(0);
 for(let epoch=0;epoch<400;epoch++){let bias=0;const grad=Array(d).fill(0);for(let i=0;i<n;i++){const e=sigmoid(intercept+xs[i].reduce((v,x,j)=>v+x*weights[j],0))-rows[i].y;bias+=e/n;for(let j=0;j<d;j++)grad[j]+=e*xs[i][j]/n;}intercept-=.05*bias;for(let j=0;j<d;j++)weights[j]-=.05*(grad[j]+.05*weights[j]);}
 return {mean,scale,weights,intercept,baseline:base};
}
export function collectModelSamples(runs,observations,profile,includeFallback=false){
 const latest=new Map();for(const run of runs||[]){if(run.profile!==profile||run.fallback&&!includeFallback)continue;const k=[run.symbol,run.strategy,run.tf,run.source||'legacy'].join('|');if((latest.get(k)?.completedAt||0)<run.completedAt)latest.set(k,run);}
 const rows=[];
 for(const run of latest.values())for(const t of run.trades||[]){if(t.segment!=='out-of-sample'||t.targetCapped||!Number.isFinite(t.realizedR))continue;rows.push({...t,source:'historical replay',id:t.signalId,profile,featureTime:t.featureTime,time:t.time,closedAt:Date.parse(t.closedAt)});}
 for(const r of observations||[]){const manual=r.cohort==='manual'&&r.trainingOrigin==='manual-paper'&&r.trainingVerified===true&&!r.trainingExcludedReason;if(r.profile!==profile||r.protocol!=='signal-r-v1'||r.cohort!=='confirmed'&&!manual||r.targetCapped||!Number.isFinite(r.realizedR))continue;rows.push({...r,source:manual?'manual paper observation':'forward observation',featureTime:r.observedAt,time:r.entryAt});}
 const unique=new Map();for(const r of rows){if(r.fallback&&!includeFallback||r.conflicted&&r.trainingOrigin!=='manual-paper')continue;const x=featureVector(r.features,r.strategy);try{assertCausalFeatures(r.features,r.candleClose);}catch{continue;}if(!x||!Number.isFinite(r.featureTime)||!Number.isFinite(r.time)||!Number.isFinite(r.closedAt)||r.featureTime>r.time||r.closedAt<r.time)continue;const key=[r.symbol,r.tf,r.id,r.time].join('|');unique.set(key,{...r,x,y:+(r.realizedR>0)});}
 // One non-overlapping outcome per symbol: several strategies on one move are not independent trials.
 const end=new Map(),out=[];for(const r of [...unique.values()].sort((a,b)=>a.time-b.time||a.strategy.localeCompare(b.strategy))){if(r.time<(end.get(r.symbol)||0))continue;end.set(r.symbol,r.closedAt);out.push(r);}return out;
}
export function meanInterval90(values){
 if(values.length<2)return null;let seed=8675309;const means=[];
 for(let k=0;k<1000;k++){let sum=0;for(let j=0;j<values.length;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;sum+=values[Math.floor(seed/4294967296*values.length)];}means.push(sum/values.length);}means.sort((a,b)=>a-b);return [means[49],means[950]];
}
function cohortSummaries(rows){
 const groups=new Map();for(const r of rows)for(const strategy of r.strategies||[r.strategy]){const key=trainingCohortKey(r,strategy);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 return Object.fromEntries([...groups].map(([key,a])=>[key,{n:a.length,sessions:new Set(a.map(r=>new Date(r.time).toISOString().slice(0,10))).size,baseRate:a.reduce((n,r)=>n+r.y,0)/a.length,expectedR:a.reduce((n,r)=>n+r.realizedR,0)/a.length,interval90:meanInterval90(a.map(r=>r.realizedR))}]));
}
export function shrunkProbability(model,x,cohort){const weight=cohort.n/(cohort.n+200);return weight*predictProbability(model,x)+(1-weight)*cohort.baseRate;}
export function reliability(predictions,labels){return Array.from({length:5},(_,i)=>{const chosen=predictions.map((p,j)=>({p,y:labels[j]})).filter(r=>r.p>=i/5&&(i===4?r.p<=1:r.p<(i+1)/5));return {range:[i/5,(i+1)/5],n:chosen.length,predicted:chosen.length?chosen.reduce((n,r)=>n+r.p,0)/chosen.length:null,observed:chosen.length?chosen.reduce((n,r)=>n+r.y,0)/chosen.length:null};});}
export function fitMarketModel(samples,market,now=Date.now()){
 const rows=samples.filter(r=>r.market===market).sort((a,b)=>a.time-b.time),day=t=>new Date(t).toISOString().slice(0,10),days=[...new Set(rows.map(r=>day(r.time)))];
 const base={protocol:MODEL_PROTOCOL,market,n:rows.length,trainedAt:now,featureNames:FEATURE_NAMES,sourceCounts:{manual:rows.filter(r=>r.source==='manual paper observation').length},status:'learning',cohorts:cohortSummaries(rows),reason:'Not enough data: need 200 training outcomes across 15 sessions in this strategy/timeframe cohort, plus later validation.'};
 if(days.length<20)return base;
 const cutoffDay=days[Math.max(15,Math.floor(days.length*.75))];if(!cutoffDay)return base;const cutoff=Date.parse(cutoffDay+'T00:00:00Z');
 const train=rows.filter(r=>r.closedAt+r.tf*12*60000<cutoff),test=rows.filter(r=>r.time>=cutoff),cohorts=cohortSummaries(train);
 const both=a=>new Set(a.map(r=>r.y)).size===2;
 if(train.length<200||test.length<50||!both(train)||!both(test))return {...base,cohorts,trainN:train.length,validationN:test.length};
 const model=trainLogistic(train),eligible=test.filter(r=>{const c=cohorts[trainingCohortKey(r)];return c?.n>=200&&c.sessions>=15;}),predictions=eligible.map(r=>shrunkProbability(model,r.x,cohorts[trainingCohortKey(r)])),labels=eligible.map(r=>r.y);
 if(eligible.length<50)return {...base,cohorts,trainN:train.length,validationN:eligible.length};
 const brier=brierScore(predictions,labels),baselineBrier=brierScore(eligible.map(()=>model.baseline),labels),skillScore=baselineBrier>0?1-brier/baselineBrier:0;
 return {...base,...model,cohorts,status:skillScore>0?'experimental':'no edge',reason:skillScore>0?'Estimated net profit for the underlying setup, with a 12-bar time exit. Experimental; stock shorts omit borrow costs.':'No edge over baseline. Model alerts are disabled.',version:market+'-'+now,trainN:train.length,validationN:eligible.length,trainEnd:Math.max(...train.map(r=>r.closedAt)),validationStart:cutoff,validationEnd:Math.max(...eligible.map(r=>r.closedAt)),brier,baselineBrier,skillScore,beatsBaseline:skillScore>0,calibration:reliability(predictions,labels),sources:{replay:train.filter(r=>r.source==='historical replay').length,forward:train.filter(r=>r.source==='forward observation').length,manual:train.filter(r=>r.source==='manual paper observation').length}};
}
export function estimateProfit(model,s){
 const x=featureVector(signalFeatures(s),s.strategy),cohort=model?.cohorts?.[trainingCohortKey(s)],count=cohort?.n||0;
 if(!model?.weights||!x||count<200||cohort.sessions<15)return {probability:null,status:'learning',n:count,required:200,reason:'Not enough data – '+count+'/200 training outcomes; 15 sessions and later validation required.',drivers:[],expectedR:null,interval90:null};
 const probability=shrunkProbability(model,x,cohort),drivers=x.map((v,i)=>{const contribution=(v-model.mean[i])/model.scale[i]*model.weights[i],without=predictProbability({...model,intercept:model.intercept-contribution},x),weight=cohort.n/(cohort.n+200);return {factor:FEATURE_NAMES[i],changePoints:(probability-(weight*without+(1-weight)*cohort.baseRate))*100};}).filter(d=>Math.abs(d.changePoints)>.1).sort((a,b)=>Math.abs(b.changePoints)-Math.abs(a.changePoints)).slice(0,6);
 return {probability,baselineProbability:cohort.baseRate,version:model.version,status:model.status,beatsBaseline:model.beatsBaseline,skillScore:model.skillScore,validationN:model.validationN,brier:model.brier,baselineBrier:model.baselineBrier,n:count,sessions:cohort.sessions,expectedR:cohort.expectedR,interval90:cohort.interval90,drivers,reason:model.reason,label:'Estimated chance of a profitable trade',horizonBars:12};
}
