// Presentation preferences and journal summaries only; never used by strategy or risk engines.
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const THEMES=[['midnight','Midnight','Ink & jade','#93cbbb'],['ocean','Ocean','Slate & blue','#9bbfeb'],['amethyst','Amethyst','Muted violet','#c5b3e5'],['graphite','Graphite','Silver & charcoal','#23272c'],['black-white','Obsidian','Black & silver','#0a0a0c'],['daylight','Daylight','Paper & evergreen','#ffffff']];
const THEME_KEY='jarvis.appearance.theme.v1';
const BROWSER_PREF_KEYS=[
 THEME_KEY,'jarvis.overview.v1','jarvis.sidebar-layout.v1','jarvis.workspace-space.v1',
 'jarvis.panel-disclosures.v1','jarvis.chart.indicators.v1','jarvis.chart.layout.v1',
 'jarvis.scanner-panel-heights.v1','jarvis.movers-sort.v1',
];
const BROWSER_PREF_LIMIT=128*1024;

export function exportBrowserPreferences(storage){
 const preferences={};
 for(const key of BROWSER_PREF_KEYS){
  const value=storage.getItem(key);
  if(value!==null)preferences[key]=value;
 }
 return JSON.stringify({version:1,preferences},null,2);
}

export function importBrowserPreferences(storage,text){
 if(typeof text!=='string'||text.length>BROWSER_PREF_LIMIT)throw Error('The browser preferences file is too large.');
 const data=JSON.parse(text);
 if(data?.version!==1||!data.preferences||typeof data.preferences!=='object'||Array.isArray(data.preferences)){
  throw Error('Choose a browser preferences file exported by JARVIS.');
 }
 const entries=Object.entries(data.preferences);
 for(const [key,value] of entries){
  if(!BROWSER_PREF_KEYS.includes(key)||typeof value!=='string'){
   throw Error('The file contains an unsupported browser preference.');
  }
  if(key===THEME_KEY){
   if(!THEMES.some(([theme])=>theme===value))throw Error('The file contains an unknown theme.');
  }else{
   const parsed=JSON.parse(value);
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('The file contains an invalid browser preference.');
  }
 }
 const previous=new Map(entries.map(([key])=>[key,storage.getItem(key)]));
 const saved=[];
 try{
  for(const [key,value] of entries){
   storage.setItem(key,value);
   saved.push(key);
  }
 }catch(error){
  for(const key of saved.reverse()){
   const value=previous.get(key);
   if(value===null)storage.removeItem(key);
   else storage.setItem(key,value);
  }
  throw error;
 }
 return entries.length;
}

export function installBrowserPreferenceTransfer(doc,storage){
 const notify=message=>{const target=doc.querySelector('[data-browser-prefs-status]');if(target)target.textContent=message;};
 doc.addEventListener('click',event=>{
  const action=event.target.closest?.('[data-browser-prefs]')?.dataset.browserPrefs;
  if(action==='import'){
   doc.querySelector('[data-browser-prefs-file]')?.click();
  }else if(action==='export'){
   try{
    const file=new Blob([exportBrowserPreferences(storage)],{type:'application/json'});
    if(file.size>BROWSER_PREF_LIMIT)throw Error('The browser preferences file is too large.');
    const url=URL.createObjectURL(file),link=doc.createElement('a');
    link.href=url;
    link.download='jarvis-browser-preferences.json';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify('Browser preferences exported.');
   }catch(error){notify(error.message);}
  }else if(action==='reload'){
   doc.defaultView?.location.reload();
  }
 });
 doc.addEventListener('change',async event=>{
  const input=event.target;
  if(!input.matches?.('[data-browser-prefs-file]'))return;
  const file=input.files?.[0];
  input.value='';
  if(!file)return;
  try{
   if(file.size>BROWSER_PREF_LIMIT)throw Error('The browser preferences file is too large.');
   const count=importBrowserPreferences(storage,await file.text());
   notify(count?`Imported ${count} browser preferences. Reload JARVIS to apply them.`:'The file has no browser preferences to apply.');
   const reload=doc.querySelector('[data-browser-prefs="reload"]');
   if(reload)reload.hidden=!count;
  }catch(error){notify(error instanceof SyntaxError?'Choose a valid JARVIS browser preferences JSON file.':error.message);}
 });
}
export function readTheme(storage){try{const id=storage?.getItem(THEME_KEY);return THEMES.some(t=>t[0]===id)?id:'midnight';}catch{return 'midnight';}}
export function applyTheme(doc,id,storage){if(!THEMES.some(t=>t[0]===id))id='midnight';doc.documentElement.dataset.theme=id;for(const b of doc.querySelectorAll('[data-theme-choice]')){const active=b.dataset.themeChoice===id;b.setAttribute('aria-pressed',String(active));b.classList.toggle('selected',active);}try{storage?.setItem(THEME_KEY,id);}catch{}return id;}
export function themeSettings(id){return '<section class="theme-settings" aria-labelledby="theme-settings-title"><div><h2 id="theme-settings-title">Color themes</h2><p>Choose a look. Applies immediately and stays on this browser; trading settings and learning are unchanged.</p></div><div class="theme-grid">'+THEMES.map(([key,name,note,color])=>'<button type="button" data-theme-choice="'+key+'" aria-pressed="'+(key===id)+'" class="theme-choice '+(key===id?'selected':'')+'"><i style="background:'+color+'" aria-hidden="true"></i><span><strong>'+name+'</strong><small>'+note+'</small></span></button>').join('')+'</div><div class="form-actions"><button type="button" data-browser-prefs="export">Export browser preferences</button><button type="button" data-browser-prefs="import">Import browser preferences</button><button type="button" data-browser-prefs="reload" hidden>Reload JARVIS</button><input type="file" accept=".json,application/json" data-browser-prefs-file aria-label="JARVIS browser preferences file" hidden></div><p class="note" data-browser-prefs-status role="status"></p></section>';}
export const pnlTone=n=>Number.isFinite(n)?n>0?'pnl-positive':n<0?'pnl-negative':'pnl-neutral':'pnl-neutral';
function dayKey(time,zone){if(!Number.isFinite(new Date(time).getTime()))return null;const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time)).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day;}
export const JOURNAL_PERIODS=[['today','Today'],['week','This week'],['month','This month'],['all','All time']];
export function journalView(rows,{period='all',sort='newest',now=Date.now(),timezone='America/Los_Angeles'}={}){
 const today=dayKey(now,timezone),date=new Date(today+'T12:00:00Z'),dow=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-dow);const week=date.toISOString().slice(0,10),month=today.slice(0,7)+'-01',start=period==='today'?today:period==='week'?week:period==='month'?month:null;
 const activity=r=>Date.parse(r.closedAt||r.time),filtered=rows.filter(r=>{if(!start)return true;const date=dayKey(r.closedAt||r.time,timezone);return date&&date>=start&&date<=today;});
 const realized=filtered.filter(r=>r.decision==='taken'&&r.closedAt&&Number.isFinite(r.pnl));
 const pnl=realized.reduce((n,r)=>n+r.pnl,0),wins=realized.filter(r=>r.pnl>0).length,losses=realized.filter(r=>r.pnl<0).length;
 const sorted=[...filtered].sort((a,b)=>{if(sort==='highest'||sort==='lowest'){const av=Number.isFinite(a.pnl),bv=Number.isFinite(b.pnl);if(av!==bv)return av?-1:1;if(av&&a.pnl!==b.pnl)return sort==='highest'?b.pnl-a.pnl:a.pnl-b.pnl;}return (sort==='oldest'?1:-1)*((activity(a)||0)-(activity(b)||0));});
 return {rows:sorted,pnl,n:realized.length,wins,losses,winRate:realized.length?wins/realized.length:null,open:filtered.filter(r=>r.decision==='taken'&&!r.closedAt).length,label:JOURNAL_PERIODS.find(x=>x[0]===period)?.[1]||'All time',timezone};
}
export function journalSummary(view,money){return '<div class="journal-period-summary"><div class="metric-tile"><small>'+escape(view.label)+' realized P&amp;L</small><strong class="'+pnlTone(view.pnl)+'">'+money(view.pnl)+'</strong><span>Closed manual trades · '+escape(view.timezone)+'</span></div><div class="metric-tile"><small>Closed trades</small><strong>'+view.n+'</strong><span>'+view.wins+' wins · '+view.losses+' losses</span></div><div class="metric-tile"><small>Trade win rate</small><strong>'+(Number.isFinite(view.winRate)?(view.winRate*100).toFixed(1)+'%':'—')+'</strong><span>Profitable / closed trades · break-even counts as non-winning</span></div></div>';}
