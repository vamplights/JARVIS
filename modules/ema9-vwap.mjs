import {aggregate,vwap,parts,session,atr,marketCosts,roundTripCost} from './engine.mjs';
export const EMA9_VWAP='ema9-vwap-retest';
export const EMA9_PROTOCOL='ema9-vwap-paper-v1';
export function strategySeries(bars,base,settings,now){
 if(![60,180].includes(base))return [];
 const rth=bars.filter(b=>{const h=session(b.time*1000,settings);return h.regular&&b.complete!==false;});
 const rows=aggregate(rth,3,base,now).filter(b=>b.complete);let smooth=null;const ev=rows.map((b,i)=>{smooth=smooth==null?b.close:b.close*.2+smooth*.8;return i<8?null:smooth;}),vw=vwap(rows,'stocks',180);
 return rows.map((b,i)=>({...b,ema:ev[i],vwap:vw[i],date:parts(b.time*1000,'America/New_York').date}));
}
export function retestSetups(rows){
 const found=[];let cross=null;
 for(let i=1;i<rows.length;i++){
  const b=rows[i],p=rows[i-1];
  if(b.date!==p.date||b.time-p.time!==180||b.vwap==null||p.vwap==null||b.ema==null||p.ema==null){cross=null;continue;}
  const d=b.ema>b.vwap&&p.ema<=p.vwap?1:b.ema<b.vwap&&p.ema>=p.vwap?-1:0;
  if(d){cross={i,dir:d};continue;}
  if(!cross||i-cross.i>5)continue;
  if(b.low<=b.vwap&&b.high>=b.vwap&&cross.dir*(b.close-b.vwap)>0&&cross.dir*(b.close-b.ema)>0){
   found.push({bar:b,cross:rows[cross.i],dir:cross.dir,index:i});cross=null;
  }
 }
 return found;
}
export function ema9Signals({symbol,market,bars,base=60,tf,settings,now,replay=false}){
 if(market!=='stocks'||tf!==3||!settings.strategies.includes(EMA9_VWAP)||!session(now,settings).regular)return [];
 const rows=strategySeries(bars,base,settings,now),last=rows.at(-1),av=atr(rows).at(-1)||.01;
 return retestSetups(rows).filter(x=>x.bar===last&&now<(x.bar.time+360)*1000).map(({bar,cross,dir})=>{
  const price=dir>0?bar.high:bar.low,stop=Math.round((dir>0?bar.low-.01:bar.high+.01)*10000)/10000,key=[symbol,EMA9_VWAP,cross.time].join(':'),size=Math.floor(Math.min(settings.capital*.005/Math.abs(price-stop),settings.capital/price));
  return {id:key,setupKey:key,setupKeys:[key],symbol,market,tf,strategy:EMA9_VWAP,name:'EMA9 + VWAP · cross & retest',dir,direction:dir>0?'bullish':'bearish',price,entry:[price,price],stop,initialStop:stop,target:null,fixedTargetDisabled:true,exitEMA:9,entryOrder:'stop',entryValidAfter:(bar.time+180)*1000,expiresAt:(bar.time+360)*1000,confirmedAt:(bar.time+180)*1000,crossAt:cross.time*1000,status:'CONFIRMED',score:100,factors:[],warnings:[],atr:av,rr:null,netRR:null,costsAsRiskPct:null,targetCapped:false,regime:'EMA9/VWAP retest',rvol:1,trendAlignment:true,higherAlignment:true,extension:0,size:{size,plannedRisk:size*Math.abs(price-stop),notional:size*price},horizon:'intraday',replay,stopReason:'Confirmation candle extreme plus $0.01; fixed',exitNote:'Fixed initial stop or completed 3m close across EMA9; next available price. Close before session end.'};
 });
}
// Dedicated chronological share simulation: no generic target or alternate trailing scenario.
export function resolveEma9Paper(store,signals,assets,settings,profile,now){
 let changed=false;const known=new Set(store.rows.map(r=>r.id));
 for(const s of signals.filter(s=>s.strategy===EMA9_VWAP&&s.status==='CONFIRMED'&&!s.replay&&!s.fallback&&!s.legacyProfile)){
  const id=[s.id,profile,EMA9_PROTOCOL].join('|');if(known.has(id)||now>=s.expiresAt)continue;known.add(id);
  store.rows.push({id,signalId:s.id,profile,forwardProtocol:EMA9_PROTOCOL,strategy:EMA9_VWAP,strategies:[EMA9_VWAP],symbol:s.symbol,market:'stocks',tf:3,dir:s.dir,source:s.source,exitStyle:'fixed',horizon:'intraday',state:'awaiting entry',signalEntry:s.price,initialStop:s.stop,stop:s.stop,target:null,targetDisabled:true,observedAt:now,validAfter:s.entryValidAfter,expiresAt:s.expiresAt,settings:structuredClone(settings),costs:marketCosts(settings,'stocks'),risk:settings.capital*.005,mfeR:0,maeR:0});changed=true;
 }
 const rows=store.rows.filter(r=>r.forwardProtocol===EMA9_PROTOCOL),events=[];
 for(const r of rows){if(r.closedAt||['missed fill','unmeasurable'].includes(r.state))continue;const a=assets[r.symbol];if(!a||a.source!==r.source||a.base!==60||a.replay)continue;
  const series=strategySeries(a.bars,60,r.settings,now);r._series=series;
  for(const b of a.bars.filter(b=>b.complete!==false&&(b.time+60)*1000<=now&&b.time*1000>=Math.max(r.validAfter,r.observedAt,r.entryAt||0)&&b.time*1000>=(r.lastProcessed??0)).sort((a,b)=>a.time-b.time))events.push({r,b,time:b.time*1000});
  const q=a.quote;if(q?.price>0&&q.time<=now&&now-q.time<=settings.stockStaleSeconds*1000&&q.time>Math.max(r.observedAt,r.lastQuoteAt||0,r.lastProcessed||0))events.push({r,time:q.time,b:{time:q.time/1000,open:q.price,high:q.price,low:q.price,close:q.price,quote:true}});
 }
 events.sort((a,b)=>a.time-b.time||a.r.observedAt-b.r.observedAt||a.r.id.localeCompare(b.r.id));
 function close(r,price,time,why){const unit=(price-r.entry)*r.dir-roundTripCost(r.entry,price,'stocks',{costs:{stocks:r.costs}});Object.assign(r,{exit:price,closedAt:time,exitReason:why,pnl:unit*r.size,realizedR:unit/Math.abs(r.entry-r.initialStop),state:'closed',unrealized:0});}
 for(const {r,b,time} of events){if(r.closedAt||r.state==='missed fill')continue;const h=session(time,r.settings),day=parts(time,'America/New_York').date;if(!h.regular)continue;if(b.quote)r.lastQuoteAt=time;else r.lastProcessed=time+60000;changed=true;
  if(!r.entryAt){
   if(time>=r.expiresAt){r.state='missed fill';r.reason='Next candle did not trigger entry';continue;}
   const through=r.dir>0?b.high>r.signalEntry:b.low<r.signalEntry;if(!through)continue;
   const prior=rows.filter(x=>x.entryAt&&parts(x.entryAt,'America/New_York').date===day&&x.entryAt<=time),active=rows.some(x=>x!==r&&x.entryAt<=time&&x.state!=='unmeasurable'&&(!x.closedAt||x.closedAt>time));
   if(active||prior.length>=2){r.state='missed fill';r.reason=active?'One position at a time':'Two trades per session';continue;}
   if(parts(time,'America/New_York').minutes>=h.close-1){r.state='missed fill';r.reason='Session closing';continue;}
   const entry=r.dir>0?Math.max(b.open,r.signalEntry):Math.min(b.open,r.signalEntry),equity=r.settings.capital+rows.filter(x=>x.profile===r.profile&&x.closedAt<=time).reduce((n,x)=>n+x.pnl,0),distance=r.dir*(entry-r.stop),size=Math.floor(Math.min(equity*.005/distance,equity/entry));
   if(!(distance>0&&size>0)){r.state='missed fill';r.reason='Insufficient buying power';continue;}
   Object.assign(r,{entry,entryAt:time,size,risk:equity*.005,state:'active',entryPriceBasis:'Subsequent observed 1m bar; stop-first ambiguity'});
  }
  if(r.entryAt<time&&r._series.some(c=>(c.time+180)*1000>r.entryAt&&(c.time+180)*1000<=time&&c.ema!=null&&r.dir*(c.close-c.ema)<0))r.pendingEMAExit=true;
  if(r.pendingEMAExit||parts(time,'America/New_York').minutes>=h.close-1){close(r,b.open,time,r.pendingEMAExit?'completed 3m close across EMA9':'session close');continue;}
  if(r.dir>0?b.low<=r.stop:b.high>=r.stop){close(r,r.dir>0?Math.min(b.open,r.stop):Math.max(b.open,r.stop),time+60000,'fixed initial stop');continue;}
  const c=b.quote?r._series.filter(c=>(c.time+180)*1000<=time&&(c.time+180)*1000>r.entryAt).at(-1):r._series.find(c=>(c.time+180)*1000===time+60000);if(c&&r.dir*(c.close-c.ema)<0)r.pendingEMAExit=true;
  r.lastMark=b.close;r.lastMarkAt=time+60000;r.unrealized=((b.close-r.entry)*r.dir-roundTripCost(r.entry,b.close,'stocks',{costs:{stocks:r.costs}}))*r.size;
 }
 for(const r of rows){delete r._series;if(r.state==='awaiting entry'&&now>=r.expiresAt){r.state='missed fill';r.reason='Next candle expired without an observed trigger';changed=true;}if(r.state==='active'){const p=parts(r.entryAt,'America/New_York'),end=Math.floor(r.entryAt/60000)*60000+(session(r.entryAt,r.settings).close-p.minutes)*60000;if(now>=end){r.state='unmeasurable';r.reason='Session exit price unavailable; no overnight position or invented fill';changed=true;}}}
 return changed;
}
