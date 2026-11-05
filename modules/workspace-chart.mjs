import {updateChartTail,volumePoint,upsertChartBar} from './live-chart-data.mjs';
import {openAlpacaConnection} from './live-chart-view.mjs';
import {createChart,CandlestickSeries,HistogramSeries,LineSeries,ColorType} from '../vendor/lightweight-charts/lightweight-charts.standalone.production.mjs';
import {aggregate} from './engine.mjs';
import {patternOverlay,patternsForChart,currentPatternRead} from './chart-pattern-view.mjs';
import {chartIndicatorSettings,emaStep,vwapStep,regularVwapInput} from './chart-indicators.mjs';
let view=null,lastArgs=null;
const KEY='jarvis.chart.indicators.v1',LAYOUT='jarvis.chart.layout.v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function prefs(){try{return chartIndicatorSettings(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return chartIndicatorSettings();}}
export function savedChartLayout(){try{const v=JSON.parse(localStorage.getItem(LAYOUT)||'null');return v&&typeof v.symbol==='string'&&v.symbol.length<=20&&Number.isInteger(v.tf)&&v.tf>=1&&v.tf<=1440?v:null;}catch{return null;}}
export function detachChart(){view?.root.remove();}
export function inlinePatternView(symbol,tf){return view?.symbol===symbol&&view.tf===tf?view.patterns:null;}
function dispose(){if(!view)return;view.events?.close();clearInterval(view.timer);clearTimeout(view.paintTimer);if(view.layoutTimer){clearTimeout(view.layoutTimer);view.persistLayout();}view.chart.remove();view=null;}
export function mountWorkspaceChart({symbol,tf,asset,calendar,patterns,now,onPatterns,selection=''}){lastArgs={symbol,tf,asset,calendar,patterns,now,onPatterns,selection};
 const host=document.querySelector('#workspace-chart');if(!host){dispose();return;}
 if(view&&view.symbol===symbol&&view.tf===tf){host.replaceWith(view.root);view.onPatterns=onPatterns;view.selection=selection;view.inputPatterns=patterns;view.enabled=!!patterns?.enabled;view.calendar=calendar;if(view.mode!=='alpaca')view.useAsset(asset,patterns,now);else if(!view.enabled){view.patterns={...patterns,records:[]};view.overlay.innerHTML='';}view.style();return;}
 dispose();const root=document.createElement('div');root.id='workspace-chart';root.innerHTML=`<div class="chart-toolbar"><button type="button" data-inline-latest>Latest</button><button type="button" data-inline-fit>Fit history</button><button type="button" data-inline-connect>Alpaca connection</button><span class="note" data-chart-source role="status"></span><details class="chart-credit"><summary>TradingView</summary><p><a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView Lightweight Charts™</a><br>Copyright © 2025 TradingView, Inc.</p></details></div><details class="chart-indicator-controls"><summary>Indicators · EMA & VWAP</summary><form data-indicators></form></details><div class="workspace-chart-stage" style="height:400px"><div class="workspace-chart-canvas" aria-label="Interactive candlestick chart"></div><svg class="workspace-pattern-overlay" aria-label="Chart pattern drawings"></svg></div><label class="chart-size-control">Chart height<input data-inline-height type="range" min="240" max="720" step="20" value="400"></label>`;host.replaceWith(root);
 const initialLayout=savedChartLayout();const v=view={root,symbol,tf,calendar,market:asset?.market||(symbol.includes('-')?'crypto':'stocks'),mode:'existing',rows:[],prefs:prefs(),patterns:null,inputPatterns:patterns,enabled:!!patterns?.enabled,onPatterns,selection,source:'Waiting for data',phase:'',last:0};
 const color=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();v.chart=createChart(root.querySelector('.workspace-chart-canvas'),{autoSize:true,layout:{background:{type:ColorType.Solid,color:color('--panel')},textColor:color('--muted'),attributionLogo:false},grid:{vertLines:{color:color('--line')},horzLines:{color:color('--line')}},timeScale:{timeVisible:true,rightOffset:5}});v.candles=v.chart.addSeries(CandlestickSeries,{upColor:'#39b98e',downColor:'#e77484',borderVisible:false,wickUpColor:'#39b98e',wickDownColor:'#e77484'});v.volume=v.chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume'});v.chart.priceScale('volume').applyOptions({scaleMargins:{top:.85,bottom:0},visible:false});v.chart.priceScale('right').applyOptions({scaleMargins:{top:.08,bottom:.2}});v.lines=[];v.overlay=root.querySelector('.workspace-pattern-overlay');
 v.style=()=>v.chart.applyOptions({layout:{background:{type:ColorType.Solid,color:color('--panel')},textColor:color('--muted')},grid:{vertLines:{color:color('--line')},horzLines:{color:color('--line')}}});
 v.draw=()=>{if(view!==v)return;v.overlay.setAttribute('width',v.root.querySelector('.workspace-chart-stage').clientWidth);v.overlay.setAttribute('height',v.root.querySelector('.workspace-chart-stage').clientHeight);v.overlay.style.clipPath='inset(0 '+v.chart.priceScale('right').width()+'px 28px 0)';const matching=v.patterns?.health?.[symbol+':'+tf]?.source===v.source;const read=matching?currentPatternRead(v.patterns,symbol,tf):{};const record=v.selection?patternsForChart(v.patterns,symbol,tf).find(r=>r.id===v.selection):read.selected;v.overlay.innerHTML=v.enabled&&matching&&v.prefs.drawings?patternOverlay(record,v.display||[],i=>v.chart.timeScale().timeToCoordinate(v.display[i].time)??-10000,p=>v.candles.priceToCoordinate(p)??-10000):'';};
 function addLine(options,step){
  const series=v.chart.addSeries(LineSeries,{lineWidth:2,priceLineVisible:false,lastValueVisible:false,...options}),states=[];
  for(const b of v.rows)states.push(step(states.at(-1),b));
  series.setData(states.map(s=>s.point));v.lines.push({series,states,step});
 }
 function chartVWAP(prior,b){
  if(v.market!=='stocks')return vwapStep(prior,b,v.market,tf*60,v.calendar);
  const raw=v.mode==='alpaca'?v.raw:v.assetRaw;
  if(!raw)return {point:{time:b.time}};
  const input=regularVwapInput(raw,b,tf*60,v.mode==='alpaca'?60:v.base,Date.now(),v.calendar,v.sessionDays);
  if(!input)return {...prior,point:{time:b.time}};
  return vwapStep(prior,input,v.market,tf*60,v.calendar);
 }
 v.paint=(initial=false)=>{
  if(view!==v)return;v.sessionDays=new Map();const layout=savedChartLayout(),bars=v.display=v.rows;
  v.candles.setData(bars);v.volume.setData(bars.map(volumePoint));
  for(const line of v.lines)v.chart.removeSeries(line.series);v.lines=[];
  for(const e of v.prefs.emas.filter(e=>e.enabled))addLine({color:e.color,title:'EMA '+e.period},(s,b)=>emaStep(s,b,e.period));
  if(v.prefs.vwap.enabled)addLine({color:v.prefs.vwap.color,lineStyle:2,title:'VWAP'},chartVWAP);
  if(initial&&bars.length){const saved=layout,range=saved?.symbol===symbol&&saved.tf===tf?saved.range:null;v.chart.timeScale().setVisibleLogicalRange(range&&Number.isFinite(range.from)&&Number.isFinite(range.to)&&range.to>range.from?range:{from:Math.max(0,bars.length-100),to:bars.length+5});}v.draw();v.status();};
 // Recompute only the affected aggregate buckets and indicator suffix. A
 // corrected historical minute can alter every later EMA in the session.
 function paintCandles(){
  v.paintTimer=null;if(view!==v||v.dirtyTime==null)return;
  const start=v.dirtyTime;v.dirtyTime=null;
  updateChartTail(v,start,tf,Date.now());
  v.lastPaint=performance.now();v.draw();v.status();
 }
 function onCandle({bar,receivedAt}){
  v.raw??=[];const previous=v.raw.at(-1),action=upsertChartBar(v.raw,bar);
  if(action==='ignored')return;
  const width=tf*60,start=Math.floor(Math.min(bar.time,previous?.time??bar.time)/width)*width;
  v.dirtyTime=Math.min(v.dirtyTime??start,start);v.last=receivedAt;
  if(!v.paintTimer)v.paintTimer=setTimeout(paintCandles,Math.max(0,250-(performance.now()-(v.lastPaint??-250))));
 }
 v.status=()=>{if(view!==v)return;root.querySelector('[data-chart-source]').textContent=v.source+' · '+v.phase+(v.last?' · last data '+new Date(v.last).toLocaleString():'')+(v.last&&Date.now()-v.last>120000?' · no recent updates':'');};
 v.useAsset=(a,p,time)=>{if(!a?.bars?.length){v.phase='Waiting for candles';v.status();return;}const source=a.source||'Unknown source',changed=v.source!==source;v.source=source;v.phase=a.replay?'Historical replay':a.fallback||a.publicData?'Fallback data':a.snapshot?'Quote snapshot':'Existing feed';v.last=a.quote?.time||a.bars.at(-1)?.time*1000;const signature=JSON.stringify([source,a.base,a.bars.length,a.bars[0].time,a.bars.at(-1),a.quote,v.calendar?.earlyCloses,v.calendar?.extraClosures,Math.min(Math.floor(time/(tf*60000)),Math.floor(a.bars.at(-1).time/(tf*60))+1)]);v.patterns=p?.health?.[symbol+':'+tf]?.source===source?p:{...p,records:[],health:{[symbol+':'+tf]:{source,freshness:'unavailable',reason:'Waiting for matching chart-source analysis'}}};if(signature===v.assetSignature){v.draw();v.status();return;}v.assetSignature=signature;v.assetRaw=a.bars;v.base=a.base;v.rows=aggregate(a.bars,tf,a.base,time);v.paint(changed);};
 function settingsForm(){root.querySelector('[data-indicators]').innerHTML=v.prefs.emas.map((e,i)=>`<div class="ema-setting"><label><input type="checkbox" name="enabled${i}" ${e.enabled?'checked':''}> EMA</label><label>Period<input type="number" min="1" max="1000" required name="period${i}" value="${e.period}"></label><label>Color<input type="color" name="color${i}" value="${e.color}"></label><button type="button" data-remove-ema="${i}">Remove</button></div>`).join('')+`<div class="ema-setting"><label><input type="checkbox" name="vwapEnabled" ${v.prefs.vwap.enabled?'checked':''}> VWAP</label><label>Color<input type="color" name="vwapColor" value="${v.prefs.vwap.color}"></label></div><label><input type="checkbox" name="drawings" ${v.prefs.drawings?'checked':''}> Show pattern drawings</label><div class="connection-actions"><button type="button" data-add-ema ${v.prefs.emas.length>=6?'disabled':''}>Add EMA</button><button type="submit">Apply & save</button></div>`;}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(v.prefs));}catch{}v.paint();}
 settingsForm();root.querySelector('[data-indicators]').onsubmit=e=>{e.preventDefault();e.stopPropagation();const f=new FormData(e.currentTarget);v.prefs=chartIndicatorSettings({emas:v.prefs.emas.map((x,i)=>({period:Number(f.get('period'+i)),color:f.get('color'+i),enabled:f.has('enabled'+i)})),vwap:{enabled:f.has('vwapEnabled'),color:f.get('vwapColor')},drawings:f.has('drawings')});save();};root.onclick=e=>{const remove=e.target.closest('[data-remove-ema]');if(remove){v.prefs.emas.splice(Number(remove.dataset.removeEma),1);settingsForm();save();}if(e.target.closest('[data-add-ema]')){v.prefs.emas.push({period:20,color:'#b8a0f0',enabled:true});settingsForm();save();}if(e.target.closest('[data-inline-latest]'))v.chart.timeScale().scrollToRealTime();if(e.target.closest('[data-inline-fit]'))v.chart.timeScale().fitContent();if(e.target.closest('[data-inline-connect]')){openAlpacaConnection();}};
 if(v.market==='crypto')root.querySelector('[data-inline-connect]').hidden=true;
 v.persistLayout=()=>{v.layoutTimer=null;try{localStorage.setItem(LAYOUT,JSON.stringify({symbol,tf,height:Number(root.querySelector('[data-inline-height]').value),range:v.chart.timeScale().getVisibleLogicalRange()}));}catch{}}
 function saveLayout(){clearTimeout(v.layoutTimer);v.layoutTimer=setTimeout(v.persistLayout,250);}
 root.querySelector('[data-inline-height]').oninput=e=>{root.querySelector('.workspace-chart-stage').style.height=e.target.value+'px';v.draw();saveLayout();};v.chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{v.draw();saveLayout();});v.timer=setInterval(()=>{v.status();v.draw();if(v.mode==='alpaca'&&v.enabled)v.analyze();},4000);
 v.analyze=async()=>{if(v.analyzing||view!==v||!v.enabled)return;v.analyzing=true;try{const r=await fetch('/api/alpaca-chart/patterns?'+new URLSearchParams({symbol,tf}));if(!r.ok)throw Error();const p=await r.json();if(view!==v)return;v.patterns=p;v.onPatterns?.(p);v.draw();}catch{if(view===v){v.patterns={enabled:v.enabled,records:[],health:{[symbol+':'+tf]:{source:v.source,freshness:'unavailable',reason:'Matching Alpaca analysis unavailable'}}};v.overlay.innerHTML='';v.onPatterns?.(v.patterns);}}finally{v.analyzing=false;}};
 v.useAsset(asset,patterns,now);if(v.market==='stocks')fetch('/api/alpaca-chart/status').then(r=>r.json()).then(d=>{if(view!==v||!d.configured)return;v.mode='alpaca';v.source='Alpaca IEX';v.last=0;v.phase='Loading history';v.patterns=null;v.rows=[];v.paint();const es=v.events=new EventSource('/api/alpaca-chart/stream?symbol='+encodeURIComponent(symbol));es.addEventListener('status',e=>{if(view!==v)return;v.phase=JSON.parse(e.data).status;v.status();});es.addEventListener('snapshot',e=>{if(view!==v)return;clearTimeout(v.paintTimer);v.paintTimer=null;v.dirtyTime=null;const initial=!v.rows.length;v.raw=JSON.parse(e.data).bars;v.rows=aggregate(v.raw,tf,60,Date.now());v.last=v.raw.at(-1)?.time*1000;v.paint(initial);v.analyze();});es.addEventListener('candle',e=>{if(view!==v)return;onCandle(JSON.parse(e.data));});es.addEventListener('problem',e=>{v.phase=JSON.parse(e.data).message;v.status();});es.onerror=()=>{v.phase='Disconnected · reconnecting';v.status();};}).catch(()=>{v.phase+=' · Alpaca status unavailable';v.status();});
 const saved=initialLayout;if(saved?.symbol===symbol&&saved.tf===tf&&Number.isFinite(saved.height)){const height=Math.max(240,Math.min(720,saved.height));root.querySelector('[data-inline-height]').value=height;root.querySelector('.workspace-chart-stage').style.height=height+'px';}
}

document.addEventListener('alpaca-chart-connection',()=>{if(!view||!lastArgs)return;const old=view.root,host=document.createElement('div');host.id='workspace-chart';old.replaceWith(host);dispose();mountWorkspaceChart(lastArgs);});
