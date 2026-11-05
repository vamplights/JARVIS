import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';
import {stockWatchlistCandidates,STOCK_WATCHLIST_CHOICES} from '../modules/ui-forms.mjs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function editor(stocks=['SPY','QQQ','META'],write){
 const field={value:''},error={hidden:true},count={},saved=[],button={disabled:false},form={getAttribute:()=> 'watchlist-form',elements:{'watch-symbol':field},querySelector:()=>button};
 let change,submit,html='',closed=false;
 class Data{get(name){return name==='watch-symbol'?field.value:null;}}
 const context={busy:false,watchDraft:[...stocks],state:{settings:{stocks:[...stocks]}},optionsDraft:{symbol:'SPY'},stockWatchlistCandidates,esc:x=>String(x),field:()=>'<input name="watch-symbol">',showDialog:(title,body)=>html=body,document:{addEventListener:(name,fn)=>{if(name==='change')change=fn;else if(name==='submit')submit=fn;}},FormData:Data,api:async(path,value)=>saved.push({path,value:plain(value)}),settingsWriteVersion:0,persistSettings:async value=>{saved.push({path:'/api/settings',value:plain(value)});if(write)await write(value);},refresh:async()=>{},toast:()=>{},$:selector=>selector.includes('data-watchlist-error')?error:selector.includes('data-watch-count')?count:selector==='#dialog'?{close:()=>closed=true}:form};
 const start=app.indexOf('function watchlistDialog(){'),end=app.indexOf("document.addEventListener('change',e=>{const {name,value}",start);
 runInNewContext(app.slice(start,end),context);
 const submitStart=app.indexOf("document.addEventListener('submit',async"),submitEnd=app.indexOf('\n',app.indexOf('finally{busy=false;',submitStart));runInNewContext(app.slice(submitStart,submitEnd),context);
 return {context,field,error,count,saved,button,get html(){return html;},get closed(){return closed;},toggle(symbol,checked){const small={},input={dataset:{watchStock:symbol},checked,matches:()=>true,closest:()=>({querySelector:()=>small})};change({target:input});return input;},save:()=>submit({target:form,preventDefault(){}})};
}

test('Forty stock choices are always selectable; existing saved symbols are retained without mutating settings',()=>{
 const view={settings:{stocks:['META','SPY','BRK.B']},scanner:{membership:{all:{symbols:['OTHER']}}}},before=structuredClone(view);
 assert.equal(STOCK_WATCHLIST_CHOICES.length,40);assert.equal(new Set(STOCK_WATCHLIST_CHOICES).size,40);assert.deepEqual(stockWatchlistCandidates(view),[...STOCK_WATCHLIST_CHOICES,'BRK.B']);assert.deepEqual(view,before);
 const h=editor();h.context.watchlistDialog();for(const symbol of [...STOCK_WATCHLIST_CHOICES,'META'])assert.ok(h.html.includes('data-watch-stock="'+symbol+'"'));
 assert.doesNotMatch(h.html,/watch-action|watch-replace|disabled/);
});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('Checkbox changes autosave the selected list; rapid changes are coalesced and serialized',async()=>{
 let release;const h=editor(['SPY','QQQ','META'],()=>new Promise(resolve=>release=resolve));
 h.toggle('QQQ',false);assert.equal(h.saved.length,1);assert.deepEqual(h.saved[0].value,{stocks:['SPY','META']});
 h.toggle('AMD',true);h.toggle('META',false);assert.equal(h.saved.length,1);assert.deepEqual(plain(h.context.state.settings.stocks),['SPY','QQQ','META']);
 release();await settle();assert.equal(h.saved.length,2);assert.deepEqual(h.saved[1].value,{stocks:['SPY','AMD']});
 release();await settle();assert.deepEqual(plain(h.context.state.settings.stocks),['SPY','AMD']);assert.match(h.count.textContent,/Saved/);assert.equal(h.closed,false);
});
test('Empty watchlist and capacity errors remain inline and preserve the last nonempty selection',async()=>{
 const h=editor(['SPY']);assert.equal(h.toggle('SPY',false).checked,true);assert.equal(h.saved.length,0);assert.deepEqual(plain(h.context.watchDraft),['SPY']);assert.match(h.error.textContent,/at least one/);
 const full=editor(Array.from({length:40},(_,i)=>'A'+i));assert.equal(full.toggle('NVDA',true).checked,false);assert.equal(full.context.watchDraft.length,40);assert.match(full.error.textContent,/40/);await settle();
});
test('Failed latest write rolls back with feedback; subsequent changes can save successfully',async()=>{
 let fail=true;const h=editor(['SPY','QQQ'],async()=>{if(fail)throw Error('Offline');});h.toggle('AMD',true);await settle();assert.deepEqual(plain(h.context.watchDraft),['SPY','QQQ']);assert.deepEqual(plain(h.context.state.settings.stocks),['SPY','QQQ']);assert.match(h.error.textContent,/restored/);assert.equal(h.error.hidden,false);
 fail=false;h.toggle('AMD',true);await settle();assert.deepEqual(plain(h.context.state.settings.stocks),['SPY','QQQ','AMD']);assert.match(h.count.textContent,/Saved/);
});
test('Custom ticker Enter commits and autosaves without closing the editor',async()=>{const h=editor();h.field.value='brk.b';await h.save();await settle();assert.deepEqual(h.saved[0].value,{stocks:['SPY','QQQ','META','BRK.B']});assert.equal(h.closed,false);});

test('Custom symbols validate before joining the draft',()=>{
 const h=editor();h.field.value=' brk.b ';h.context.applyWatchEdit();assert.ok(h.context.watchDraft.includes('BRK.B'));
 for(const symbol of ['SPY','<bad>']){h.field.value=symbol;const before=plain(h.context.watchDraft);assert.throws(()=>h.context.applyWatchEdit());assert.deepEqual(plain(h.context.watchDraft),before);}
});

test('Overview displays every selected stock alongside crypto even before quotes load',()=>{
 const stocks=STOCK_WATCHLIST_CHOICES.slice(0,10),state={settings:{stocks,crypto:['BTC-USD','ETH-USD']},assets:[{symbol:'SPY',quote:{price:100,change:1}}]},before=structuredClone(state);
 const context={state,selected:'AAPL',esc:String,quoteFresh:q=>!!q,money:n=>Number.isFinite(n)?'$'+n:'—',num:String,stockDirection:s=>'<span>Direction '+s+'</span>'};
 const start=app.indexOf('function watchlist(market)'),end=app.indexOf('\nfunction ',start+1);
 runInNewContext(app.slice(start,end),context);
 const html=context.watchlist();
 assert.match(html,/12 ASSETS/);assert.equal((html.match(/class="watch-row /g)||[]).length,12);
 for(const symbol of [...state.settings.crypto,...stocks])assert.ok(html.includes('data-symbol="'+symbol+'"'),symbol);
 assert.match(html,/watch-row selected" data-symbol="AAPL"/);assert.match(html,/NO QUOTE/);assert.match(html,/\$100/);
 assert.equal((context.watchlist('stocks').match(/class="watch-row /g)||[]).length,10);
 assert.equal((context.watchlist('crypto').match(/class="watch-row /g)||[]).length,2);
 assert.deepEqual(state,before);
});
