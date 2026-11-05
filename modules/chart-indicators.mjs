import {barIndex} from './live-chart-data.mjs';
import {parts,session} from './engine.mjs';
// Visual indicator settings are browser-local and independent of strategy settings.
export const DEFAULT_CHART_INDICATORS={emas:[{period:34,color:'#43d9f3',enabled:true}],vwap:{enabled:true,color:'#efbd55'},drawings:true};
export function chartIndicatorSettings(value={}){return {emas:(Array.isArray(value.emas)?value.emas:DEFAULT_CHART_INDICATORS.emas).slice(0,6).map(e=>({period:Math.max(1,Math.min(1000,Math.round(Number(e.period)||34))),color:/^#[\da-f]{6}$/i.test(e.color)?e.color:'#43d9f3',enabled:e.enabled!==false})),vwap:{enabled:value.vwap?.enabled!==false,color:/^#[\da-f]{6}$/i.test(value.vwap?.color)?value.vwap.color:'#efbd55'},drawings:value.drawings!==false};}

export function emaStep(prior,b,period){
 const alpha=2/(period+1),count=(prior?.count||0)+1,value=prior?alpha*b.close+(1-alpha)*prior.value:b.close;
 return {count,value,point:count<period?{time:b.time}:{time:b.time,value}};
}
// Clip chart buckets to exchange hours, including early closes. A 60m
// display bucket containing 09:30 must not inherit the 09:00 premarket high.
export function regularVwapInput(raw,display,width,base,now,calendar,days){
 if(base>=86400)return null;
 let high=-Infinity,low=Infinity,close,volume=0,first,last,count=0,open,stop;
 const end=display.time+width;
 for(let i=barIndex(raw,display.time);i<raw.length&&raw[i].time<end;i++){
  const b=raw[i],day=Math.floor(b.time/86400)*86400;
  let hours=days.get(day);
  if(!hours){const noon=(day+17*3600)*1000,p=parts(noon,'America/New_York'),s=session(noon,calendar);
   const anchor=noon/1000+(570-p.minutes)*60;hours={open:anchor,close:anchor+(s.close-570)*60,enabled:s.tradingDay};days.set(day,hours);}
  if(!hours.enabled||b.time<hours.open||b.time+base>hours.close)continue;
  first??=b.time;last=b.time;open=hours.open;stop=hours.close;
  high=Math.max(high,b.high);low=Math.min(low,b.low);close=b.close;volume+=b.volume||0;if(b.complete!==false)count++;
 }
 if(first==null)return null;
 const start=Math.max(open,display.time),through=Math.min(stop,end);
 return {time:first,chartTime:display.time,high,low,close,volume,end:through,anchor:first===open,
  live:first===start&&count*base===last+base-start&&now>=last*1000&&now<through*1000,
  complete:first===start&&last+base===through&&count*base===through-start&&through*1000<=now};
}
export function vwapStep(prior,b,market,interval,settings){
 const stocks=market==='stocks',pointTime=b.chartTime??b.time,p=parts(b.time*1000,stocks?'America/New_York':'UTC');
 let state=prior?.date===p.date?prior:{date:p.date,pv:0,volume:0,last:null,valid:!stocks};
 if(stocks&&b.chartTime==null&&!session(b.time*1000,settings).regular)return {...state,point:{time:pointTime}};
 let valid=state.valid;
 if(stocks){if(state.last===null)valid=b.anchor??(p.minutes===570);else if(state.end!=null?state.end!==b.time:interval&&b.time-state.last!==interval)valid=false;}
 const volume=state.volume+(b.volume||0),pv=state.pv+(b.high+b.low+b.close)/3*(b.volume||0);
 // An incomplete stock candle is provisional. Replacing it uses the prior
 // closed candle's accumulator, so repeated updates never double count volume.
 const show=valid&&volume&&(b.complete!==false||b.live);
 valid=valid&&(!stocks||b.complete!==false);
 return {date:p.date,volume,pv,last:b.time,end:b.end,valid,point:show?{time:pointTime,value:pv/volume}:{time:pointTime}};
}
export function emaSeries(bars,period){let state;return bars.map(b=>(state=emaStep(state,b,period)).point).filter(p=>p.value!==undefined);}
export function sessionVWAP(bars,market,interval,settings){let state;return bars.map(b=>(state=vwapStep(state,b,market,interval,settings)).point);}
