import {createChart,CandlestickSeries,ColorType} from '../vendor/lightweight-charts/lightweight-charts.standalone.production.mjs';
import {aggregate} from './engine.mjs';
let active;
export function disposeSignalChart(){if(!active)return;clearInterval(active.timer);active.chart.remove();active=null;}
export function mountSignalChart(signal,asset,host,status){
 disposeSignalChart();const color=k=>getComputedStyle(document.documentElement).getPropertyValue(k).trim();
 const chart=createChart(host,{autoSize:true,layout:{background:{type:ColorType.Solid,color:color('--panel')},textColor:color('--muted'),attributionLogo:false},grid:{vertLines:{color:color('--line')},horzLines:{color:color('--line')}},timeScale:{timeVisible:true}}),series=chart.addSeries(CandlestickSeries,{upColor:'#3ddc97',downColor:'#f2727f',borderVisible:false,wickUpColor:'#3ddc97',wickDownColor:'#f2727f'}),v=active={chart};
 for(const [price,title,c] of [[signal.entry?.[0],'Entry',color('--cyan')],[signal.stop,'Stop',color('--red')],[signal.target,'Target',color('--green')]])if(Number.isFinite(price))series.createPriceLine({price,title,color:c,lineWidth:1,lineStyle:2,axisLabelVisible:true});
 let first=true,loading=false;const paint=a=>{if(active!==v)return;const bars=aggregate(a.bars||[],signal.tf,a.base,Date.now());series.setData(bars);if(first&&bars.length){chart.timeScale().setVisibleLogicalRange({from:Math.max(0,bars.length-70),to:bars.length+3});first=false;}status.textContent=(a.source||'Existing feed')+' · '+signal.tf+'m'+(a.quote?.time?' · last data '+new Date(a.quote.time).toLocaleString():'')+(bars.length?'':' · waiting for candles');};
 if(asset?.base<=signal.tf*60)try{paint(asset);}catch{status.textContent='Loading chart history…';}
 const load=async()=>{if(loading||active!==v)return;loading=true;try{const r=await fetch('/api/chart?'+new URLSearchParams({symbol:signal.symbol,tf:signal.tf}));const a=await r.json();if(!r.ok)throw Error(a.error||'Chart unavailable');paint(a);}catch(e){if(active===v)status.textContent='Chart refresh unavailable · '+e.message;}finally{loading=false;}};
 load();v.timer=setInterval(load,15000);
}
