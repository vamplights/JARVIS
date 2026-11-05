import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';
import {scannerPanel} from '../modules/beta-view.mjs';
import {organizerHTML,normalizeSidebar,moveSection} from '../modules/sidebar-layout.mjs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function settingsEditor(write=async()=>{}){
 const listeners={},status={setAttribute(){}},retry={hidden:true},saved=[],form={id:'settings-form',valid:true,value:{risk:100},checkValidity(){return this.valid;},querySelector:selector=>selector.includes('retry')?retry:status};let timer;
 const context={state:{settings:{risk:100}},api:async(path,value)=>{saved.push(plain(value));await write(value);},settingsFormValue:form=>({...form.value}),setTimeout:fn=>(timer=fn,1),clearTimeout:()=>timer=null,applyCryptoVenuePreset(){},document:{addEventListener:(event,fn)=>listeners[event]=fn}};
 const start=app.indexOf('let settingsSaveTimer='),end=app.indexOf("document.addEventListener('submit',async",start);runInNewContext(app.slice(start,end),context);
 return {context,form,status,retry,saved,event(type,control){listeners[type]({target:{form,tagName:'INPUT',type:'number',...control}});},flush(){timer?.();timer=null;}};
}
test('Settings numeric and text edits commit on change or blur and expose retry on failure',async()=>{
 let fail=true;const h=settingsEditor(async()=>{if(fail)throw Error('Offline');}),control={form:h.form,tagName:'INPUT',type:'number',name:'risk'};
 // Dispatch the same control object to exercise WeakSet commit tracking.
 const listeners={};h.context.document={addEventListener:(type,fn)=>listeners[type]=fn};
 const start=app.indexOf("document.addEventListener('input',event=>{if(event.target.form?.id==='settings-form')"),end=app.indexOf("document.addEventListener('submit',async",start);runInNewContext(app.slice(start,end),h.context);
 h.form.value.risk=125;listeners.input({target:control});assert.match(h.status.textContent,/Unsaved/);assert.equal(h.saved.length,0);listeners.focusout({target:control});h.flush();await settle();assert.match(h.status.textContent,/could not be saved/);assert.equal(h.retry.hidden,false);assert.equal(h.context.state.settings.risk,100);
 fail=false;h.context.scheduleSettingsSave(h.form,true);await settle();assert.equal(h.context.state.settings.risk,125);assert.equal(h.retry.hidden,true);assert.match(h.status.textContent,/saved/);
 h.form.value.label='My schedule';control.type='text';listeners.input({target:control});listeners.change({target:control});listeners.focusout({target:control});h.flush();await settle();assert.equal(h.saved.length,3);assert.equal(h.context.state.settings.label,'My schedule');
 h.form.valid=false;h.form.value.risk=-1;listeners.change({target:control});h.flush();await settle();assert.equal(h.saved.length,3);assert.equal(h.retry.hidden,false);
});
test('Settings writes serialize rapid committed edits and recover after an earlier failed request',async()=>{
 let release,reject;const h=settingsEditor(()=>new Promise((resolve,no)=>{release=resolve;reject=no;}));
 h.form.value.risk=110;h.context.scheduleSettingsSave(h.form,true);await settle();h.form.value.risk=120;h.context.scheduleSettingsSave(h.form,true);h.form.value.risk=130;h.context.scheduleSettingsSave(h.form,true);assert.equal(h.saved.length,1);
 reject(Error('Offline'));await settle();assert.equal(h.saved.length,2);assert.equal(h.saved[1].risk,130);release();await settle();assert.equal(h.context.state.settings.risk,130);assert.match(h.status.textContent,/saved/);
});
test('Organizer drags within and between saved custom groups, retaining keyboard alternatives',()=>{
 const names={stocks:'Stocks',crypto:'Crypto',settings:'Settings'},layout=normalizeSidebar({groups:[{id:'custom',title:'My group',items:['stocks','crypto']},{id:'system',title:'System',items:['settings']}]},names),before=structuredClone(layout),html=organizerHTML(layout,{names,esc:String});
 assert.match(html,/draggable="true" data-organizer-section="stocks"/);assert.match(html,/data-organizer-group="custom"/);assert.match(html,/Group for Stocks/);assert.doesNotMatch(html,/data-group-name|new-sidebar-group|Add group/);
 let saved;const listeners={},context={moveSection,sidebarView:{get:()=>layout},saveSidebar:value=>saved=value,document:{addEventListener:(type,fn)=>listeners[type]=fn,querySelectorAll:()=>[]}};
 const start=app.indexOf('let organizerDrag='),end=app.indexOf("document.addEventListener('change',event=>{const el=event.target;if(el.dataset.sectionGroup)",start);runInNewContext(app.slice(start,end),context);
 const row=id=>({dataset:{organizerSection:id},classList:{add(){}}}),group=id=>({dataset:{organizerGroup:id}}),target=(r,g)=>({closest:selector=>selector.includes('group')?group(g):r?row(r):null});
 listeners.dragstart({target:target('stocks','custom'),dataTransfer:{setData(){}}});listeners.drop({target:target('settings','system'),preventDefault(){}});assert.deepEqual(plain(saved.groups[1].items),['stocks','settings']);assert.equal(saved.groups[0].title,'My group');assert.deepEqual(layout,before);
 listeners.dragstart({target:target('crypto','custom'),dataTransfer:{setData(){}}});listeners.drop({target:target('stocks','custom'),preventDefault(){}});assert.deepEqual(plain(saved.groups[0].items),['crypto','stocks']);
});
test('Stocks in play renders every stock in a labeled scroll region without mutating scanner data',()=>{const data={inPlay:Array.from({length:10},(_,i)=>({symbol:'S'+i,rvol:i,reasons:['Gap']}))},before=structuredClone(data),html=scannerPanel(data);assert.equal((html.match(/class="in-play-row"/g)||[]).length,10);assert.match(html,/class="in-play-list" role="region" aria-label="Stocks in play today\. Scroll to view all stocks\." tabindex="0"/);assert.doesNotMatch(html,/data-in-play-toggle|Show all|Show fewer/);assert.deepEqual(data,before);});
