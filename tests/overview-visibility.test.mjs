import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {overviewPreferences,overviewVisible,OVERVIEW_PAGES} from '../modules/overview-config.mjs';
import {overviewSettingsForm,overviewDashboard} from '../modules/overview-view.mjs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('Legacy preferences migrate without changing prices and partial visibility updates preserve them',()=>{
 let saved=JSON.stringify({symbols:['AAPL','ETH-USD'],period:'week'});const prefs=overviewPreferences({getItem:()=>saved,setItem:(k,v)=>saved=v});
 assert.deepEqual(prefs.get(),{symbols:['AAPL','ETH-USD'],period:'week',alwaysShow:true,pages:['overview']});
 prefs.set({alwaysShow:false,pages:['stocks','settings','stocks','picks','unknown']});
 assert.deepEqual(prefs.get(),{symbols:['AAPL','ETH-USD'],period:'week',alwaysShow:false,pages:['stocks','settings']});
 assert.deepEqual(overviewPreferences({getItem:()=>saved}).get(),prefs.get());
 prefs.set({symbols:['QQQ'],period:'month'});assert.deepEqual(prefs.get().pages,['stocks','settings']);assert.equal(prefs.get().alwaysShow,false);
});
test('Always show overrides remembered pages, selected pages apply when off, and none hides everywhere',()=>{
 const prefs=overviewPreferences();for(const [page] of OVERVIEW_PAGES)assert.equal(overviewVisible(prefs.get(),page),true);
 prefs.set({alwaysShow:false,pages:['settings','intelligence']});for(const [page] of OVERVIEW_PAGES)assert.equal(overviewVisible(prefs.get(),page),['settings','intelligence'].includes(page));
 prefs.set({alwaysShow:true});assert.equal(overviewVisible(prefs.get(),'crypto'),true);assert.deepEqual(prefs.get().pages,['settings','intelligence']);
 prefs.set({alwaysShow:false,pages:[]});for(const [page] of OVERVIEW_PAGES)assert.equal(overviewVisible(prefs.get(),page),false);assert.equal(overviewVisible({alwaysShow:true},'picks'),false);
});
test('Visibility form includes accessible independent controls and Settings always offers recovery',()=>{
 const html=overviewSettingsForm(overviewPreferences().get(),{esc:String});assert.match(html,/Always show on every page/);assert.match(html,/<legend>Show on these pages<\/legend>/);
 assert.equal((html.match(/name="overview-pages"/g)||[]).length,9);assert.doesNotMatch(html,/value="(?:picks|performance|research)"/);assert.doesNotMatch(html,/disabled/);
 const settings=app.slice(app.indexOf('function settingsPage()'),app.indexOf('\n',app.indexOf('function settingsPage()')));assert.match(settings,/data-action="overview-settings"/);
 const dashboard=overviewDashboard({heading:'heading',stats:'',watchlist:'',footer:'',helpers:{esc:String,date:String}});assert.doesNotMatch(dashboard,/overview-ticker/);
 assert.equal((app.match(/id="overview-price-host"/g)||[]).length,1);assert.match(app,/overviewVisible\(overviewView.get\(\),page\)\)loadOverview\(\)/);
});
test('Shared load updates visible bar on Settings without rerendering the page or dialog and coalesces requests',async()=>{
 const definition=app.slice(app.indexOf('async function loadOverview('),app.indexOf('async function refresh('));let calls=0,updates=0,finish;
 const context={page:'settings',overviewLoading:false,overviewLoadedAt:0,overviewRequest:0,overviewView:overviewPreferences(),Date,JSON,URLSearchParams,api:()=>{calls++;return new Promise(resolve=>finish=resolve);},refreshOverviewContent:()=>updates++};
 runInNewContext(definition+';this.load=loadOverview',context);const pending=context.load();await context.load();assert.equal(calls,1);finish({quotes:[]});await pending;assert.equal(updates,1);assert.equal(context.overviewLoading,false);assert.doesNotMatch(definition,/render\(/);
 const update=app.slice(app.indexOf('function refreshOverviewPrices()'),app.indexOf('async function loadOverview('));assert.doesNotMatch(update,/#content.*innerHTML|#dialog/);assert.match(update,/focus\(\{preventScroll:true\}\)/);
});


test('Shell owns one persistent price host below the topbar and outside page content',()=>{
 let markup='';const document={querySelector:()=>({set innerHTML(value){markup=value;}})},definition=app.slice(app.indexOf('function shell()'),app.indexOf('function top()'));
 runInNewContext(definition+';shell()', {document,state:{settings:{}},esc:String,sidebarNav:()=>''});
 assert.equal((markup.match(/id="overview-price-host"/g)||[]).length,1);
 assert.match(markup,/<div class="workspace-header"><header class="topbar">[^]*<\/header><div id="overview-price-host"><\/div><\/div>/);
 const render=app.slice(app.indexOf('function render(){'),app.indexOf('function render(){')+3000);assert.doesNotMatch(render,/priceHost|overview-price-host/);
});
test('Quote refresh retains horizontal position and keyboard focus while eligible pages stay visible',()=>{
 let scroll={scrollLeft:135},focused,cleared=false;const button={},region={},card={focus:options=>focused=options},host={hidden:false,contains:()=>true,querySelector:()=>scroll,querySelectorAll:()=>[button,region,card],replaceChildren:()=>cleared=true,set innerHTML(value){scroll={scrollLeft:0};}};
 const prefs=overviewPreferences();const context={$:()=>host,page:'stocks',overviewView:prefs,overviewVisible,document:{activeElement:card},overviewPriceStrip:()=>'<section></section>',overviewData:{},overviewError:'',networkError:false,esc:String,money:String,date:String};
 const definition=app.slice(app.indexOf('function refreshOverviewPrices()'),app.indexOf('function refreshOverviewContent()'));runInNewContext(definition+';this.update=refreshOverviewPrices',context);context.update();assert.equal(host.hidden,false);assert.equal(scroll.scrollLeft,135);assert.equal(focused.preventScroll,true);
 prefs.set({alwaysShow:false,pages:['settings']});context.update();assert.equal(host.hidden,true);assert.equal(cleared,true);context.page='settings';context.update();assert.equal(host.hidden,false);
});

test('Always show change persists only visibility and preserves draft controls and focus from either entry point',()=>{
 const start=app.indexOf("document.addEventListener('change',e=>{const {name,value}=e.target;");
 const definition=app.slice(start,app.indexOf('\n',start));
 for(const entry of ['gear','settings']){
  let saved,handler,updates=0,loads=0;const storage={getItem:()=>saved,setItem:(key,value)=>saved=value},prefs=overviewPreferences(storage);
  const before=prefs.get(),form={id:'overview-settings-form',symbols:'UNSAVED',period:'month',pages:['crypto']},target={name:'overview-always-show',checked:false,form},activeElement=target;
  const document={activeElement,addEventListener:(event,fn)=>handler=fn};
  runInNewContext(definition,{document,overviewView:prefs,overviewVisible,page:entry==='settings'?'settings':'stocks',refreshOverviewPrices:()=>updates++,loadOverview:()=>loads++});
  handler({target});assert.equal(updates,1);assert.equal(loads,0);assert.equal(document.activeElement,activeElement);
  assert.deepEqual(prefs.get(),{...before,alwaysShow:false});assert.deepEqual(overviewPreferences(storage).get(),prefs.get());
  assert.deepEqual(form,{id:'overview-settings-form',symbols:'UNSAVED',period:'month',pages:['crypto']});
  target.checked=true;handler({target});assert.equal(loads,1);assert.equal(prefs.get().alwaysShow,true);
 }
});

test('An in-flight price request survives visibility toggles and later periodic loads still run',async()=>{
 const definition=app.slice(app.indexOf('async function loadOverview('),app.indexOf('async function refresh('));let finish,calls=0,updates=0;
 const prefs=overviewPreferences(),context={overviewLoading:false,overviewLoadedAt:0,overviewRequest:0,overviewView:prefs,Date,JSON,URLSearchParams,api:()=>{calls++;return new Promise(resolve=>finish=resolve);},refreshOverviewContent:()=>updates++};
 runInNewContext(definition+';this.load=loadOverview',context);
 const pending=context.load();prefs.set({alwaysShow:false});await context.load();finish({quotes:['current']});await pending;
 assert.deepEqual(context.overviewData.quotes,['current']);assert.equal(calls,1);assert.equal(updates,1);
 context.overviewLoadedAt=0;const next=context.load();finish({quotes:['next']});await next;assert.equal(calls,2);assert.deepEqual(context.overviewData.quotes,['next']);
});

test('Customize dialog keeps settings and validation with no explanatory copy',()=>{
 const html=overviewSettingsForm(overviewPreferences().get(),{esc:String});
 assert.doesNotMatch(html,/<small|class="note"|overview-settings-intro/);
 assert.equal((html.match(/<p\b/g)||[]).length,1);assert.match(html,/data-overview-settings-error role="alert" hidden/);
 for(const label of ['Price bar visibility','Change period','Symbols, in display order','Save preferences','Restore default prices'])assert.ok(html.includes(label));
});

test('Other Market Pulse settings save valid completed changes without closing the dialog',()=>{
 const definition=app.slice(app.indexOf('function saveOverviewForm('),app.indexOf('function settingsFormValue('));let handler,updates=0,loads=0;
 const prefs=overviewPreferences(),error={hidden:true},values=new Map([['overview-symbols','aapl, btc-usd'],['overview-period','week']]);
 const form={id:'overview-settings-form',checkValidity:()=>true,querySelectorAll:()=>[{value:'settings'}],querySelector:()=>error};
 class FixtureFormData{get(name){return values.get(name);}}
 runInNewContext(definition,{FormData:FixtureFormData,document:{addEventListener:(event,fn)=>handler=fn},overviewView:prefs,refreshOverviewPrices:()=>updates++,loadOverview:()=>loads++});
 handler({target:{form,name:'overview-period'}});assert.deepEqual(prefs.get(),{symbols:['AAPL','BTC-USD'],period:'week',alwaysShow:true,pages:['settings']});assert.equal(updates,1);assert.equal(loads,1);
 values.set('overview-symbols','INVALID!');handler({target:{form,name:'overview-symbols'}});assert.equal(error.hidden,false);assert.deepEqual(prefs.get().symbols,['AAPL','BTC-USD']);assert.equal(loads,1);
});
