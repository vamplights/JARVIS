import {parts} from './engine.mjs';
// Plain-English labels for the "Settings cohort" dropdown: when the cohort ran, how many trades, and what changed from the cohort before it.
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SETTING_NAMES=[[/^stocks$/,'stock watchlist'],[/^crypto$/,'crypto watchlist'],[/^maxTrades$/,'max trades per day'],[/^maxLosses$/,'max losses'],[/^costs\./,'trading costs'],[/^(stockStaleSeconds|staleSeconds)$/,'stale-quote limit'],[/^liveSignalsOnly$/,'live-only signals'],[/^signalsWatchlistOnly$/,'watchlist-only signals'],[/^strategies$/,'strategy list'],[/^strategyParams/,'strategy parameters'],[/^(cryptoFrames?|stockFrames?)$/,'timeframes'],[/^cryptoVenue$/,'crypto venue'],[/^(risk|riskPercent|capital)$/,'risk / capital'],[/^(minScore|minWatchScore)$/,'minimum score'],[/^(allowOneMinute|callWindowBars|strictContinuations|qualificationMode)$/,'signal rules'],[/^(entryWindowVersion|forwardPaperVersion|experienceVersion)$/,'app update'],[/^forwardExitMode$/,'exit target'],[/^filters\./,'filters'],[/^alerts\./,'alerts']];
function flatSettings(value,prefix='',out={}){if(value&&typeof value==='object'&&!Array.isArray(value)){for(const [k,v] of Object.entries(value))flatSettings(v,prefix+k+'.',out);}else out[prefix.slice(0,-1)]=JSON.stringify(value);return out;}
function settingName(key){const hit=SETTING_NAMES.find(([re])=>re.test(key));if(hit)return hit[1];const top=key.split('.')[0]||key;return top.replace(/([A-Z])/g,' $1').toLowerCase();}
function changedSettings(before,after){if(!before||!after)return null;const a=flatSettings(before),b=flatSettings(after),keys=new Set([...Object.keys(a),...Object.keys(b)]),names=new Set();for(const k of keys)if(a[k]!==b[k])names.add(settingName(k));return [...names];}
function shortDate(ms){const p=parts(ms,'America/New_York').date.split('-');return MONTHS[+p[1]-1]+' '+(+p[2]);}
function dateRange(first,last){const a=shortDate(first),b=shortDate(last);if(a===b)return a;const [am,ad]=a.split(' '),[bm,bd]=b.split(' ');return am===bm?a+'–'+bd:a+' – '+b;}
export function cohortSummaries(rows,forwardSettings={}){
 const by=new Map();for(const r of rows){const c=by.get(r.profile)||{profile:r.profile,n:0,first:Infinity,last:-Infinity,settings:null};c.n++;const t=r.observedAt??r.entryAt??r.openedAt??r.time;if(Number.isFinite(t)){c.first=Math.min(c.first,t);c.last=Math.max(c.last,t);}c.settings??=r.settings||forwardSettings?.[r.profile]||null;by.set(r.profile,c);}
 const ordered=[...by.values()].sort((a,b)=>a.first-b.first),used=new Map();
 ordered.forEach((c,i)=>{const prev=ordered.slice(0,i).reverse().find(p=>p.settings),changes=i===0?null:changedSettings(prev?.settings,c.settings);let label=Number.isFinite(c.first)?dateRange(c.first,c.last)+' · '+c.n+(c.n===1?' signal':' signals'):c.n+(c.n===1?' signal':' signals');
  if(i===0)label+=' · earliest setup';else if(changes&&changes.length)label+=' · changed: '+changes.slice(0,3).join(', ')+(changes.length>3?' +'+(changes.length-3)+' more':'');
  const seen=(used.get(label)||0)+1;used.set(label,seen);c.label=seen>1?label+' ('+seen+')':label;});
 return ordered.map(({profile,n,label})=>({profile,n,label})).reverse();
}
