// Browser-only presentation preferences; never saved to application settings.
export const SCANNER_HEIGHT_KEY='jarvis.scanner-panel-heights.v1';
export const SCANNER_HEIGHT_MIN=160,SCANNER_HEIGHT_MAX=1200,SCANNER_HEIGHT_DEFAULT=384;
export function clampScannerHeight(value){return Math.round(Math.max(SCANNER_HEIGHT_MIN,Math.min(SCANNER_HEIGHT_MAX,Number.isFinite(value)?value:SCANNER_HEIGHT_DEFAULT)));}
export function scannerPanelHeights(storage){
 const values={movers:SCANNER_HEIGHT_DEFAULT,inPlay:SCANNER_HEIGHT_DEFAULT};
 try{const saved=JSON.parse(storage?.getItem(SCANNER_HEIGHT_KEY)||'{}');for(const key of Object.keys(values))if(Number.isFinite(saved?.[key]))values[key]=clampScannerHeight(saved[key]);}catch{}
 return {get:key=>values[key],set(key,value){if(!Object.hasOwn(values,key))return;values[key]=clampScannerHeight(value);try{storage?.setItem(SCANNER_HEIGHT_KEY,JSON.stringify(values));}catch{}}};
}
export function installScannerPanelResize(doc,preferences){
 const panels=[['movers','.movers-panel','.movers-table-region','Notable movers'],['inPlay','.in-play-panel','.in-play-list','Stocks in play today']];
 let drag=null;
 const apply=(key,height)=>{preferences.set(key,height);refresh();};
 function refresh(){
  for(const [key,panelSelector,regionSelector,label] of panels){
   const panel=doc.querySelector(panelSelector),region=panel?.querySelector(regionSelector);if(!region)continue;
   region.id='scanner-scroll-'+key;region.style.height=preferences.get(key)+'px';
   let handle=panel.querySelector('[data-scanner-resize]');
   if(!handle){
    handle=doc.createElement('button');handle.type='button';handle.className='scanner-panel-resizer';handle.dataset.scannerResize=key;
    handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','horizontal');handle.setAttribute('aria-label','Resize '+label);
    handle.setAttribute('aria-controls',region.id);handle.setAttribute('aria-valuemin',String(SCANNER_HEIGHT_MIN));handle.setAttribute('aria-valuemax',String(SCANNER_HEIGHT_MAX));
    handle.title='Drag up or down to resize. Arrow keys adjust height; Home/End set minimum/maximum. Double-click to reset.';
    handle.innerHTML='<span aria-hidden="true">↕</span><span>Drag to resize</span><span class="scanner-resize-size" aria-hidden="true"></span>';
    (panel.querySelector(':scope > .panel-disclosure-body')||panel).append(handle);
   }
   const height=preferences.get(key);handle.setAttribute('aria-valuenow',String(height));handle.setAttribute('aria-valuetext',height+' pixels of scrollable content');handle.querySelector('.scanner-resize-size').textContent=height+'px';
  }
 }
 const finish=event=>{if(!drag||event&&event.pointerId!==drag.id)return;const id=drag.id;drag=null;try{doc.body.releasePointerCapture?.(id);}catch{}doc.body.classList.remove('scanner-panel-resizing');};
 doc.addEventListener('pointerdown',event=>{
  const handle=event.target.closest?.('[data-scanner-resize]');if(!handle||event.button!==0)return;
  event.preventDefault();handle.focus({preventScroll:true});drag={id:event.pointerId,key:handle.dataset.scannerResize,y:event.clientY,height:preferences.get(handle.dataset.scannerResize)};
  doc.body.setPointerCapture?.(event.pointerId);doc.body.classList.add('scanner-panel-resizing');
 });
 doc.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();apply(drag.key,drag.height+event.clientY-drag.y);});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])doc.addEventListener(type,finish);
 doc.defaultView?.addEventListener('blur',()=>finish());
 doc.addEventListener('keydown',event=>{
  const handle=event.target.closest?.('[data-scanner-resize]');if(!handle)return;const key=handle.dataset.scannerResize;let height=preferences.get(key);
  if(event.key==='ArrowUp')height-=event.shiftKey?64:16;else if(event.key==='ArrowDown')height+=event.shiftKey?64:16;else if(event.key==='Home')height=SCANNER_HEIGHT_MIN;else if(event.key==='End')height=SCANNER_HEIGHT_MAX;else if(event.key==='Escape'){finish();return;}else return;
  event.preventDefault();apply(key,height);
 });
 doc.addEventListener('dblclick',event=>{const handle=event.target.closest?.('[data-scanner-resize]');if(handle)apply(handle.dataset.scannerResize,SCANNER_HEIGHT_DEFAULT);});
 return {refresh,cancel:()=>finish()};
}
