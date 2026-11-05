import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function harness(){
 const handlers={},timers=new Map(),requests=[],state={settings:{capital:100}},status={textContent:'',setAttribute(){}};
 const form={id:'settings-form',value:{capital:101},checkValidity:()=>true,querySelector:()=>status};
 let timer=0;const context={state,document:{addEventListener:(name,fn)=>handlers[name]=fn},settingsFormValue:f=>{if(f.invalid)throw Error('Invalid capital');return structuredClone(f.value);},setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),api:(path,value)=>new Promise((resolve,reject)=>requests.push({path,value,resolve,reject})),applyCryptoVenuePreset:f=>f.value.venuePreset=true};
 const start=app.indexOf('let settingsSaveTimer='),end=app.indexOf("document.addEventListener('submit',async e=>",start);
 runInNewContext(app.slice(start,end)+';this.flush=flushSettingsSave;this.save=scheduleSettingsSave',context);
 return {context,handlers,timers,requests,state,status,form,change(name='capital'){handlers.change({target:{name,form}});},tick(){const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)fn();}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('Settings autosave debounces completed changes and serializes the newest snapshot',async()=>{
 const h=harness();h.change();h.form.value.capital=102;h.change();assert.equal(h.timers.size,1);assert.equal(h.requests.length,0);h.tick();assert.equal(h.requests.length,1);assert.equal(h.requests[0].value.capital,102);
 h.form.value.capital=103;h.change();h.tick();assert.equal(h.requests.length,1);h.form.value.capital=104;h.change();h.tick();
 h.requests[0].resolve({ok:true});await settle();assert.equal(h.requests.length,2);assert.equal(h.requests[1].value.capital,104);assert.equal(h.state.settings.capital,102);
 h.requests[1].resolve({ok:true});await settle();assert.equal(h.state.settings.capital,104);assert.equal(h.status.textContent,'Settings saved.');
});
test('Typing cancels queued saves; incomplete and invalid settings never reach the endpoint',()=>{
 const h=harness();h.change();h.handlers.input({target:{form:h.form}});h.tick();assert.equal(h.requests.length,0);
 h.form.checkValidity=()=>false;h.change();h.tick();assert.equal(h.requests.length,0);assert.match(h.status.textContent,/invalid settings/);
 h.form.checkValidity=()=>true;h.form.invalid=true;h.change();h.tick();assert.equal(h.requests.length,0);assert.match(h.status.textContent,/Invalid capital/);
});
test('Save errors stay visible, explicit Save retries, and venue preset is captured before saving',async()=>{
 const h=harness();h.change('cryptoVenue');h.tick();assert.equal(h.requests[0].value.venuePreset,true);h.requests[0].reject(Error('offline'));await settle();assert.match(h.status.textContent,/could not be saved: offline/);assert.equal(h.state.settings.capital,100);
 h.context.save(h.form,true);assert.equal(h.requests.length,2);h.requests[1].resolve({ok:true});await settle();assert.equal(h.state.settings.capital,101);
});
test('Auto and explicit saves share the complete converter and settings refresh preserves the form',()=>{
 const conversion=app.slice(app.indexOf('function settingsFormValue('),app.indexOf('let settingsSaveTimer='));
 for(const marker of ['validateSettings(s,state.settings)','readAdvancedSettings(s,fd,get,number)',"s.earlyCloses=JSON.parse",'s.stockFrames=','s.strategies=','s.strategyFrames=','s.costs='])assert.ok(conversion.includes(marker),marker);
 assert.match(app,/if\(e.target.id==='settings-form'\)\{scheduleSettingsSave\(e.target,true\);return;\}/);
 assert.match(app,/force&&!\(page==='settings'&&\$\('#settings-form'\)\)/);
 assert.doesNotMatch(app.slice(app.indexOf('let settingsSaveTimer='),app.indexOf("document.addEventListener('submit',async e=>")),/render\(|refresh\(/);
});
import {DEFAULTS,RULES} from '../modules/engine.mjs';
import {PARAMS,strategyParams} from '../modules/strategy-controls.mjs';
import {validateSettings} from '../modules/settings.mjs';
test('Complete real form conversion validates risk, toggles, watchlists, arrays and grouped fields',()=>{
 const values=new Map(),current=structuredClone(DEFAULTS);
 function flatten(value,key=''){if(Array.isArray(value))values.set(key,value.join(', '));else if(value&&typeof value==='object'){for(const [k,v]of Object.entries(value))flatten(v,key?key+'.'+k:k);}else if(typeof value==='boolean'){if(value)values.set(key,'on');}else values.set(key,value==null?'':String(value));}
 flatten(current);values.set('sidebarSubtitle',current.sidebarSubtitle??'Trading intelligence');values.set('earlyCloses',JSON.stringify(current.earlyCloses));
 for(const [k,v]of Object.entries(current.filters))if(v)values.set('filter-'+k,'on');
 for(const tf of current.stockFrames)values.set('stockFrame'+tf,'on');
 for(const id of Object.keys(RULES)){
  if(current.strategies.includes(id))values.set('strategy-'+id,'on');
  values.set('strategyFrames.'+id,(current.strategyFrames[id]||[]).join(','));
  for(const market of ['stocks','crypto'])values.set('strategyMarketFrames.'+market+'.'+id,(current.strategyMarketFrames[market]?.[id]||[]).join(','));
  const params=strategyParams(current,id);for(const [k,d]of Object.entries(PARAMS)){const value=params[k];if(d.boolean){if(value)values.set('param.'+id+'.'+k,'on');}else values.set('param.'+id+'.'+k,value==null?'':String(value));}
 }
 const form={values};class FixtureFormData{constructor(f){this.values=f.values;}get(k){return this.values.get(k)??null;}has(k){return this.values.has(k);}}
 const converter=app.slice(app.indexOf('function settingsFormValue('),app.indexOf('let settingsSaveTimer=')),advanced=app.slice(app.indexOf('function readAdvancedSettings('),app.indexOf('function historyPanel('));
 const context={FormData:FixtureFormData,state:{settings:current,rules:RULES},PARAMS,validateSettings};runInNewContext(converter+advanced+';this.convert=settingsFormValue',context);
 values.set('capital','25000');values.set('risk','125');values.set('stocks','aapl, msft');values.set('crypto','btc-usd, eth-usd');values.set('costs.stocks.feeBps','3');values.delete('filter-events');values.set('dailyReview.enabled','on');
 const converted=context.convert(form);assert.equal(converted.capital,25000);assert.equal(converted.risk,125);assert.deepEqual([...converted.stocks],['AAPL','MSFT']);assert.deepEqual([...converted.crypto],['BTC-USD','ETH-USD']);assert.equal(converted.costs.stocks.feeBps,3);assert.equal(converted.filters.events,false);assert.equal(converted.dailyReview.enabled,true);assert.deepEqual(current,DEFAULTS);
 values.set('capital','');assert.throws(()=>context.convert(form),/capital/);values.set('capital','25000');values.set('earlyCloses','{');assert.throws(()=>context.convert(form));
});



test('A text or number input followed by Tab blur saves even when change is absent; duplicate commit is coalesced',async()=>{
 const h=harness(),control={form:h.form,name:'maxTrades',tagName:'INPUT',type:'number'};
 h.handlers.input({target:control});assert.equal(h.status.textContent,'Unsaved changes');h.form.value={maxTrades:4};h.handlers.focusout({target:control});assert.equal(h.status.textContent,'Saving changes…');assert.equal(h.timers.size,1);
 h.handlers.change({target:control});h.handlers.focusout({target:control});assert.equal(h.timers.size,1);h.tick();assert.equal(h.requests.length,1);assert.equal(h.requests[0].value.maxTrades,4);
 h.requests[0].resolve({ok:true});await settle();assert.equal(h.status.textContent,'Settings saved.');
 h.handlers.focusout({target:control});h.tick();assert.equal(h.requests.length,1);
});
