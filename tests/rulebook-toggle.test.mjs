import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const settle=()=>new Promise(r=>setImmediate(r));
function harness(){
 const requests=[],listeners={},status={setAttribute(){}};
 const cards=['a','b'].map(id=>{const badge={};return {dataset:{rulebookStrategy:id},checked:true,closest:()=>({querySelector:()=>badge}),badge};});
 const state={settings:{strategies:['a','b'],capital:100},rules:{a:{},b:{}}};
 const context={state,document:{querySelectorAll:()=>cards,querySelector:s=>s.includes('status')?status:null,addEventListener:(name,fn)=>listeners[name]=fn},setTimeout,clearTimeout,api:(path,value)=>new Promise((resolve,reject)=>requests.push({path,value:structuredClone(value),resolve,reject}))};
 const start=app.indexOf('let settingsSaveTimer='),end=app.indexOf("document.addEventListener('input',event=>",start);
 runInNewContext(app.slice(start,end),context);
 return {context,cards,status,state,requests,toggle(index,checked){cards[index].checked=checked;listeners.change({target:{...cards[index],matches:()=>true}});}};
}
test('Rulebook checkbox changes serialize partial writes, coalesce rapid edits, and preserve other settings',async()=>{
 const h=harness();h.toggle(0,false);await settle();assert.deepEqual(h.requests[0].value,{strategies:['b']});
 h.toggle(1,false);h.toggle(0,true);await settle();assert.equal(h.requests.length,1);
 h.requests[0].resolve({ok:true});await settle();assert.deepEqual(h.requests[1].value,{strategies:['a']});
 h.requests[1].resolve({ok:true});await settle();assert.deepEqual([...h.state.settings.strategies],['a']);assert.equal(h.state.settings.capital,100);assert.equal(h.cards[0].badge.textContent,'ENABLED');assert.equal(h.cards[1].badge.textContent,'DISABLED');
});
test('Rulebook failed write restores saved state and allows a later retry',async()=>{
 const h=harness();h.toggle(0,false);await settle();h.requests[0].reject(Error('offline'));await settle();
 assert.deepEqual([...h.state.settings.strategies],['a','b']);assert.match(h.status.textContent,/saved selection was restored/);assert.equal(h.cards[0].checked,true);
 h.toggle(0,false);await settle();h.requests[1].resolve({ok:true});await settle();assert.deepEqual([...h.state.settings.strategies],['b']);
});
test('Rulebook and full Settings saves share ordering and retain the latest strategy choice',async()=>{
 const h=harness(),status={setAttribute(){}},form={checkValidity:()=>true,querySelector:()=>status};
 h.context.settingsFormValue=()=>({capital:200,strategies:['a','b']});h.context.scheduleSettingsSave(form,true);await settle();
 h.toggle(0,false);await settle();assert.equal(h.requests.length,1);
 h.requests[0].resolve({ok:true});await settle();assert.deepEqual([...h.state.settings.strategies],['b']);assert.equal(h.requests[1].value.strategies[0],'b');
 h.requests[1].resolve({ok:true});await settle();assert.equal(h.state.settings.capital,200);assert.deepEqual([...h.state.settings.strategies],['b']);
});
test('A queued full Settings save cannot reapply a strategy change rolled back after an error',async()=>{
 const h=harness(),status={setAttribute(){}},form={checkValidity:()=>true,querySelector:()=>status};h.toggle(0,false);await settle();
 h.context.settingsFormValue=()=>({capital:200,strategies:['b']});h.context.scheduleSettingsSave(form,true);await settle();
 h.requests[0].reject(Error('offline'));await settle();assert.deepEqual(h.requests[1].value,{capital:200,strategies:['a','b']});
 h.requests[1].resolve({ok:true});await settle();assert.deepEqual([...h.state.settings.strategies],['a','b']);assert.equal(h.state.settings.capital,200);
});
