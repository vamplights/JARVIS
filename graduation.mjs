import {bootstrapMeanCI,summarizeR} from './stats.mjs';
import {trainingCohortKey} from './confluence.mjs';
export function strategyGraduation(observations,{profile,maxStrategyDrawdownR=15,includeFallbackTraining=false}={}){
 const groups=new Map();for(const row of observations||[]){if(row.profile!==profile||row.cohort!=='confirmed'||row.targetCapped||row.conflicted||row.fallback&&!includeFallbackTraining||!Number.isFinite(row.realizedR))continue;for(const strategy of row.strategies||[row.strategy]){const key=trainingCohortKey(row,strategy);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}}
 return Object.fromEntries([...groups].map(([key,rows])=>{
  rows.sort((a,b)=>a.closedAt-b.closedAt||String(a.key).localeCompare(String(b.key)));const unique=[...new Map(rows.map(r=>[r.key,r])).values()];let sum=0,peak=0,drawdownR=0,candidateAt=null,candidateN=null;
  for(let i=0;i<unique.length;i++){sum+=unique[i].realizedR;peak=Math.max(peak,sum);drawdownR=Math.max(drawdownR,peak-sum);if(candidateAt===null&&i+1>=100&&sum/(i+1)>0){candidateAt=unique[i].closedAt;candidateN=i+1;}}
  const fresh=candidateAt===null?[]:unique.slice(candidateN).filter(r=>r.entryAt>candidateAt),all=summarizeR(unique),next=summarizeR(fresh),recent=unique.slice(-100),recentCI=recent.length===100?bootstrapMeanCI(recent.map(r=>r.realizedR)):null;
  let status=candidateAt===null?'Collecting':'Candidate',reason=candidateAt===null?'Need 100 forward trades with positive average R.':'Waiting for the next 100 fresh trades after qualification.';
  let graduatedAt=null,freshSum=0;for(let i=0;i<fresh.length;i++){freshSum+=fresh[i].realizedR;if(i+1<100||freshSum/(i+1)<=0)continue;const prefix=unique.filter(r=>r.closedAt<=fresh[i].closedAt),ci=bootstrapMeanCI(prefix.map(r=>r.realizedR));if(ci?.[0]>0){graduatedAt=fresh[i].closedAt;break;}}
  if(graduatedAt!==null){status='Graduated';reason='Initial and fresh confirmation samples qualified; graduation is retained unless the suspension rules trigger.';}
  if(drawdownR>maxStrategyDrawdownR||recentCI?.[1]<0){status='Suspended';reason=drawdownR>maxStrategyDrawdownR?'Strategy drawdown exceeds the configured R limit.':'The most recent 100 trades have a 95% upper bound below zero.';}
  return [key,{key,status,reason,n:unique.length,avgR:all.avgR,ci95:all.ci95,candidateAt,candidateN,graduatedAt,freshN:fresh.length,freshAvgR:next.avgR,drawdownR,recentCI,progress:status==='Collecting'?Math.min(100,unique.length):Math.min(100,fresh.length),note:'A real edge around 0.1R can need roughly 400–600 trades to establish. Multiple cohorts can pass by luck; these intervals do not adjust for multiple testing.'}];
 }));
}
