export function initialPanelOpen(page,preferences,key,fallback=false){return page==='settings'?false:preferences.isOpen(key,fallback);}
// Presentation-only panel state. Never enters settingsProfile or a trading cohort.
const STORAGE_KEY='jarvis.panel-disclosures.v1';
export function clickablePanelHeader(head,button){
 // Forward plain header clicks through the accessible toggle so state has one owner.
 // Ignore interactive descendants (including labels) to preserve filters and actions.
 head.addEventListener('click',event=>{
  if(event.defaultPrevented||event.target.closest?.('button, a, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable]'))return;
  button.click();
 });
 head.classList.add('clickable-panel-header');
}
export function panelKey(page,title,ordinal=0){return JSON.stringify([page,title.trim().replace(/\s+/g,' ').toLowerCase(),ordinal]);}
export function panelPreferences(storage){let values={};try{const parsed=JSON.parse(storage?.getItem(STORAGE_KEY)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))values=Object.fromEntries(Object.entries(parsed).filter(([k,v])=>k.length<500&&typeof v==='boolean').slice(-300));}catch{}
 return {isOpen:(key,fallback=false)=>Object.hasOwn(values,key)?values[key]:fallback,set(key,open){delete values[key];values[key]=!!open;values=Object.fromEntries(Object.entries(values).slice(-300));try{storage?.setItem(STORAGE_KEY,JSON.stringify(values));}catch{} }};
}
export function enhancePanels(root,{page,preferences}){
 const doc=root.ownerDocument,counts=new Map(),records=[];
 for(const panel of root.querySelectorAll('.panel')){
  const native=panel.tagName==='DETAILS';let head=panel.querySelector(':scope > .panel-head, :scope > .chart-head'),heading=native?panel.querySelector(':scope > summary'):panel.querySelector('h2,h3');
  const title=heading?.textContent.trim()||panel.querySelector('.tagline, .small-label')?.textContent.trim()||'Additional information',identity=panel.id||(head?.classList.contains('chart-head')?'price-chart':title),ordinal=counts.get(identity)||0;counts.set(identity,ordinal+1);
  const key=panelKey(page,identity,ordinal);if(panel.dataset.panelDisclosure)continue;panel.dataset.panelDisclosure=key;
  if(native){panel.open=initialPanelOpen(page,preferences,key,panel.open);panel.addEventListener('toggle',()=>{if(panel.isConnected)preferences.set(key,panel.open);});records.push({panel,set(open){panel.open=open;preferences.set(key,open);}});continue;}
  if(!head){head=doc.createElement('div');head.className='panel-head';if(heading)head.append(heading);else{heading=doc.createElement('h2');heading.textContent=title;head.append(heading);}panel.prepend(head);}
  const body=doc.createElement('div');body.className='panel-disclosure-body';body.id='panel-body-'+encodeURIComponent(key);
  for(const node of [...panel.childNodes])if(node!==head)body.append(node);panel.append(body);
  const button=doc.createElement('button');button.type='button';button.className='small panel-toggle';button.setAttribute('aria-controls',body.id);head.append(button);
  const set=open=>{body.hidden=!open;panel.classList.toggle('panel-collapsed',!open);button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',(open?'Collapse ':'Expand ')+title);button.textContent=open?'▾ Hide':'▸ Show';};
  set(initialPanelOpen(page,preferences,key,panel.id==='chart-pattern-analysis'||head.classList.contains('chart-head')||panel.id==='signal-radar'||panel.id==='news-worth-a-look-v2'||panel.id==='appearance-settings'||['paper-filters-v2','paper-open-v2','paper-closed-v2'].includes(panel.id)||panel.id.startsWith('top-picks-')||title==='Watchlist'||/Worth a look|Notable movers/i.test(title)));
  button.addEventListener('click',()=>{const open=body.hidden;set(open);preferences.set(key,open);});clickablePanelHeader(head,button);records.push({panel,set(open){set(open);preferences.set(key,open);}});
 }
 // Reuse existing controls if an asynchronous panel (e.g. history) was replaced.
 let tools=root.querySelector('.panel-visibility-controls');
 if(!tools&&records.length){tools=doc.createElement('div');tools.className='panel-visibility-controls';tools.setAttribute('aria-label','Panel visibility');for(const [label,open] of [['Expand all panels',true],['Collapse all panels',false]]){const button=doc.createElement('button');button.type='button';button.className='small';button.textContent=label;button.addEventListener('click',()=>{for(const p of root.querySelectorAll('.panel')){if(p.tagName==='DETAILS'){p.open=open;preferences.set(p.dataset.panelDisclosure,open);}else{const toggle=p.querySelector(':scope > .panel-head > .panel-toggle, :scope > .chart-head > .panel-toggle');if(toggle?.getAttribute('aria-expanded')!==String(open))toggle?.click();}}});tools.append(button);}const heading=root.querySelector('.heading, .page-heading');if(heading)heading.after(tools);else root.prepend(tools);}
}
export function revealPanel(target){for(let parent=target;parent;parent=parent.parentElement){if(parent.matches?.('details'))parent.open=true;if(parent.classList?.contains('panel')){parent.querySelector(':scope > .panel-head > .panel-toggle[aria-expanded="false"], :scope > .chart-head > .panel-toggle[aria-expanded="false"]')?.click();}}target.scrollIntoView({block:'start'});}

// Space-saving layout preferences are browser-only; they never change a model cohort.
export function workspacePreferences(storage){const key='jarvis.workspace-space.v1',values={sidebarOpen:true,watchlistOpen:true,sidebarWidth:218};try{const saved=JSON.parse(storage?.getItem(key)||'{}');for(const k of Object.keys(values))if(k==='sidebarWidth'){if(Number.isFinite(saved?.[k]))values[k]=clampSidebarWidth(saved[k]);}else if(typeof saved?.[k]==='boolean')values[k]=saved[k];}catch{}
 return {get:k=>values[k],set(k,value){if(!Object.hasOwn(values,k))return;if(k==='sidebarWidth'){if(!Number.isFinite(value))return;values[k]=clampSidebarWidth(value);}else values[k]=!!value;try{storage?.setItem(key,JSON.stringify(values));}catch{}}};
}
export function applyWorkspaceLayout(doc,preferences){const open=preferences.get('sidebarOpen');doc.querySelector('.shell')?.style?.setProperty('--sidebar-width',clampSidebarWidth(preferences.get('sidebarWidth'))+'px');doc.querySelector('.sidebar-resizer')?.setAttribute('aria-valuenow',String(clampSidebarWidth(preferences.get('sidebarWidth'))));doc.querySelector('.shell')?.classList.toggle('navigation-collapsed',!open);for(const button of doc.querySelectorAll('[data-action="toggle-sidebar"]')){button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',(open?'Hide':'Show')+' navigation');}const drawer=doc.querySelector('#watchlist-drawer');if(drawer)drawer.open=preferences.get('watchlistOpen');}

export function clampSidebarWidth(value,viewport=Infinity){const max=Math.max(180,Math.min(420,viewport-640));return Math.round(Math.max(180,Math.min(max,Number.isFinite(value)?value:218)));}
export function installSidebarResize(doc,preferences,{onStart=()=>{},onEnd=()=>{}}={}){
 let drag=null;const win=doc.defaultView,viewport=()=>win?.innerWidth||1280;
 const apply=width=>{preferences.set('sidebarWidth',clampSidebarWidth(width,viewport()));applyWorkspaceLayout(doc,preferences);};
 const finish=event=>{if(!drag||event&&event.pointerId!==drag.id)return;const saved=drag;drag=null;try{saved.el.releasePointerCapture?.(saved.id);}catch{}doc.body.classList.remove('sidebar-resizing');onEnd();};
 doc.addEventListener('pointerdown',event=>{const el=event.target.closest?.('.sidebar-resizer');if(!el||event.button!==0||viewport()<=600||!preferences.get('sidebarOpen'))return;event.preventDefault();drag={el,id:event.pointerId,x:event.clientX,width:clampSidebarWidth(preferences.get('sidebarWidth'))};el.setPointerCapture?.(event.pointerId);doc.body.classList.add('sidebar-resizing');onStart();});
 doc.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();apply(drag.width+event.clientX-drag.x);});
 doc.addEventListener('pointerup',finish);doc.addEventListener('pointercancel',finish);doc.addEventListener('lostpointercapture',finish);win?.addEventListener('blur',()=>finish());
 doc.addEventListener('keydown',event=>{if(!event.target.matches?.('.sidebar-resizer'))return;let width=preferences.get('sidebarWidth');if(event.key==='ArrowLeft')width-=16;else if(event.key==='ArrowRight')width+=16;else if(event.key==='Home')width=180;else if(event.key==='End')width=420;else if(event.key==='Escape'){finish();return;}else return;event.preventDefault();apply(width);});
 doc.addEventListener('dblclick',event=>{if(event.target.closest?.('.sidebar-resizer'))apply(218);});
 win?.addEventListener('resize',()=>{if(viewport()>600)apply(clampSidebarWidth(preferences.get('sidebarWidth'),viewport()));});
}
