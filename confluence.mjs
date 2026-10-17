// Combine matching direction/candle/source only. Never average independent frozen plans.
export function combineSignals(signals){
 const groups=new Map();for(const s of signals){const key=[s.symbol,s.market,s.tf,s.confirmedAt,s.horizon||'intraday',s.dir,s.source||'unknown'].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
 return [...groups.values()].map(rows=>{
  // A confirmed strategy qualifies independently; ties use conservative exact primary levels.
  const rank=s=>{const i=['CONFIRMED','WATCH','SETUP FORMING','STALE','BLOCKED BY RISK RULE','INVALIDATED'].indexOf(s.status);return i<0?99:i;};
  const ordered=[...rows].sort((a,b)=>rank(a)-rank(b)||(a.netRR??0)-(b.netRR??0)||a.strategy.localeCompare(b.strategy)),primary=ordered[0];
  const strategies=[...new Set(rows.flatMap(s=>s.strategies||[s.strategy]))].sort();
  return {...primary,id:['combined',primary.symbol,primary.market,primary.tf,primary.confirmedAt,primary.dir,primary.source||'unknown'].join(':'),setupKeys:[...new Set(rows.flatMap(s=>s.setupKeys||[s.setupKey]))].sort(),strategies,confluenceCount:strategies.length,conflicted:false,status:primary.status,name:strategies.length>1?strategies.length+' strategy plans':primary.name,
   members:ordered.map(({members,...s})=>s),warnings:[...(primary.warnings||[])],size:primary.size};
 });
}
export function trainingCohortKey(s,strategy=s.strategy){return [s.market,strategy,s.tf].join('|');}
// Compatibility hook: disagreement between independent strategies is no longer a veto.
export function cancelOpposingSignals(signals,now){return signals;}
