import {aggregate} from './engine.mjs';
// Display-only candle aggregation; never imported by the strategy engine.
export function chartBars(rows,minutes){const span=minutes*60,out=new Map();for(const b of [...rows].sort((a,b)=>a.time-b.time)){const time=Math.floor(b.time/span)*span,old=out.get(time);out.set(time,old?{...old,high:Math.max(old.high,b.high),low:Math.min(old.low,b.low),close:b.close,volume:old.volume+b.volume}:{...b,time});}return [...out.values()];}

// Closed-bar corrections are rare. Ordinary trades only touch the tail.
export function barIndex(rows,time){
 let low=0,high=rows.length;
 while(low<high){const mid=(low+high)>>>1;if(rows[mid].time<time)low=mid+1;else high=mid;}
 return low;
}
export function upsertChartBar(rows,bar,limit=10000){
 const last=rows.at(-1);
 if(!last||bar.time>last.time){rows.push(bar);if(rows.length>limit)rows.shift();return 'append';}
 if(bar.time===last.time){rows[rows.length-1]=bar;return 'latest';}
 const i=barIndex(rows,bar.time);
 if(rows[i]?.time===bar.time){rows[i]=bar;return 'correction';}
 if(!i&&rows.length>=limit)return 'ignored';
 rows.splice(i,0,bar);if(rows.length>limit)rows.shift();return 'insert';
}

export const volumePoint=b=>({time:b.time,value:b.volume||0,color:b.close>=b.open?'#39b98e44':'#e7748444'});
export function updateChartTail({raw,rows,candles,volume,lines},start,tf,now){
  const buckets=aggregate(raw.slice(barIndex(raw,start)),tf,60,now);
  const from=barIndex(rows,start);
  for(const [j,b] of buckets.entries()){
   const i=from+j,historical=i<rows.length-1;rows[i]=b;
   candles.update(b,historical);volume.update(volumePoint(b),historical);
   for(const line of lines){const state=line.step(line.states[i-1],b);line.states[i]=state;line.series.update(state.point,historical);}
  }
}
