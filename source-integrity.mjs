export function sourceGate(signal,asset){
 if(signal.source&&asset?.source&&signal.source!==asset.source&&!['INVALIDATED','CONFLICTED'].includes(signal.status))return {...signal,status:'STALE',currentSource:asset.source,warnings:[...signal.warnings,'Data provider changed from '+signal.source+' to '+asset.source+'. This old plan cannot use the new source; indicators are rebuilt for new plans.']};
 return signal;
}

// Prefer a fresh live source in provider order. If none is fresh, display the newest
// usable observation, keeping its original timestamp and all stale-data gates.
export function selectMarketAsset(rows,{now=Date.now(),staleSeconds=30,recovering=false}={}){
 const live=a=>!a.replay&&!a.snapshot&&!(a.market==='crypto'&&!a.publicData&&recovering)&&a.bars?.length;
 const timed=a=>a.quote?.price>0&&Number.isFinite(a.quote.time)&&a.quote.time<=now+5000;
 return rows.find(a=>live(a)&&timed(a)&&now-a.quote.time<=staleSeconds*1000)
  ||rows.filter(a=>live(a)&&timed(a)).sort((a,b)=>b.quote.time-a.quote.time)[0]
  ||rows.find(a=>a.publicData&&a.bars?.length)||rows.find(a=>a.bars?.length)||rows[0];
}
