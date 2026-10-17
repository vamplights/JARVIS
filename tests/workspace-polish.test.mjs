import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {actionableSignals} from '../signal-filters.mjs';
import {workspacePreferences,clampSidebarWidth,installSidebarResize} from '../panel-disclosures.mjs';
const now=Date.parse('2026-10-15T15:00:00Z');
const signal=(extra={})=>({id:'SPY-1',symbol:'SPY',market:'stocks',status:'CONFIRMED',confirmedAt:now-60000,tf:3,quoteTime:now-1000,entryQualified:true,...extra});
const opts={settings:{stockStaleSeconds:150,staleSeconds:30},context:{now},session:{stocks:true,crypto:true}};

test('Actionable summaries exclude the 58 retained confirmations that caused the live mismatch',()=>{
 const rows=Array.from({length:58},(_,i)=>signal({id:'legacy-'+i,legacyProfile:true}));assert.equal(actionableSignals(rows,opts).length,0);
 const current=signal();assert.deepEqual(actionableSignals([...rows,current],opts),[current]);
 for(const patch of [{status:'WATCH'},{status:'SETUP FORMING'},{status:'STALE'},{status:'INVALIDATED'},{status:'BLOCKED BY RISK RULE'},{replay:true},{inspectionOnly:true},{conflicted:true},{entryQualified:false},{confirmedAt:now+1},{confirmedAt:now-3600000},{expiresAt:now},{quoteTime:null},{quoteTime:now+6000},{quoteTime:now-150001}])assert.equal(actionableSignals([signal(patch)],opts).length,0,JSON.stringify(patch));
});
test('Entry-ready counts respect market, hidden cards, session, risk and connectivity, even with inactive display enabled',()=>{
 const stock=signal(),crypto=signal({id:'BTC',market:'crypto',symbol:'BTC-USD'}),rows=[stock,crypto];
 assert.deepEqual(actionableSignals(rows,{...opts,market:'crypto'}),[crypto]);assert.deepEqual(actionableSignals(rows,{...opts,market:'stocks'}),[stock]);
 assert.deepEqual(actionableSignals(rows,{...opts,hiddenIds:new Set(['SPY-1'])}),[crypto]);
 assert.deepEqual(actionableSignals(rows,{...opts,session:{stocks:false,crypto:true}}),[crypto]);
 assert.equal(actionableSignals(rows,{...opts,risk:{blocked:true}}).length,0);assert.equal(actionableSignals(rows,{...opts,context:{now,offline:true}}).length,0);
 assert.equal(actionableSignals([signal({legacyProfile:true})],{...opts,settings:{...opts.settings,showInactiveSignals:true}}).length,0);
 assert.equal(actionableSignals([crypto],{...opts,context:{now:now+31000}}).length,0);
});
test('Sidebar width is clamped, restored and stored independently of trading settings',()=>{
 let saved='{}';const storage={getItem:()=>saved,setItem:(_,s)=>saved=s},p=workspacePreferences(storage);
 assert.equal(p.get('sidebarWidth'),218);p.set('sidebarWidth',320);assert.equal(workspacePreferences(storage).get('sidebarWidth'),320);
 p.set('sidebarWidth',900);assert.equal(p.get('sidebarWidth'),420);p.set('sidebarWidth',-20);assert.equal(p.get('sidebarWidth'),180);p.set('sidebarWidth',NaN);assert.equal(p.get('sidebarWidth'),180);
 assert.equal(clampSidebarWidth(420,900),260);assert.equal(clampSidebarWidth(Infinity),218);assert.equal(p.get('sidebarOpen'),true);
});
test('Sidebar divider supports drag, keyboard, cancellation and reset without blocking section reordering',()=>{
 const handlers={},windowHandlers={},styles={},attrs={},classes=new Set();let start=0,end=0;
 const el={closest:()=>el,matches:()=>true,setPointerCapture(){},releasePointerCapture(){},setAttribute:(k,v)=>attrs[k]=v};
 const doc={defaultView:{innerWidth:1280,addEventListener:(k,v)=>windowHandlers[k]=v},body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},addEventListener:(k,v)=>handlers[k]=v,querySelector:s=>s==='.shell'?{style:{setProperty:(k,v)=>styles[k]=v},classList:{toggle(){}}}:s==='.sidebar-resizer'?el:null,querySelectorAll:()=>[]},p=workspacePreferences();
 installSidebarResize(doc,p,{onStart:()=>start++,onEnd:()=>end++});const event={target:el,button:0,pointerId:7,clientX:218,preventDefault(){}};
 handlers.pointerdown(event);handlers.pointermove({...event,clientX:320});assert.equal(p.get('sidebarWidth'),320);assert.equal(styles['--sidebar-width'],'320px');assert.equal(attrs['aria-valuenow'],'320');assert.equal(start,1);
 handlers.pointercancel(event);assert.equal(end,1);assert.ok(!classes.has('sidebar-resizing'));handlers.pointermove({...event,clientX:400});assert.equal(p.get('sidebarWidth'),320);
 handlers.keydown({...event,key:'ArrowRight'});assert.equal(p.get('sidebarWidth'),336);handlers.keydown({...event,key:'Home'});assert.equal(p.get('sidebarWidth'),180);handlers.dblclick(event);assert.equal(p.get('sidebarWidth'),218);
 doc.defaultView.innerWidth=480;handlers.pointerdown(event);assert.equal(start,1);
});
test('Page chrome has one persistent menu and no Study Mode action; stats use the radar filters and readable labels',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../style.css',import.meta.url),'utf8');
 assert.equal((app.match(/data-action="toggle-sidebar"/g)||[]).length,1);assert.ok(!app.includes('toggle-study'));assert.ok(!app.includes('sidebar-close small'));
 assert.match(app,/liveActionable\(radarSignals\(market\),market\)/);assert.match(app,/\+stats\(market\)/);assert.match(app,/ready now/);assert.match(app,/function currentTopPicks/);assert.match(app,/role="separator"/);assert.match(css,/Segoe UI Variable Text/);assert.match(css,/\.stat-value small\{font-family:inherit;font-size:14px/);
});
