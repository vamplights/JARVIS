import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {scannerPanel} from '../modules/beta-view.mjs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('Options underlying stays in the panel header, associated with the original form, and changing it clears expiry',()=>{
 const context={state:{options:{symbol:'SPY',expirations:['2026-11-06']},settings:{stocks:['SPY','QQQ']},status:{robinhoodLive:{connected:true}}},optionsDraft:{symbol:'',expiration:'2026-11-06',strike:'500'},selected:'QQQ',esc:x=>String(x),field:()=>'<input name="strike">',expiryBanner:s=>'EXPIRY '+s,optionRows:()=> 'CONTRACTS'};
 const selectStart=app.indexOf('const select='),selectEnd=app.indexOf('\n',selectStart);runInNewContext(app.slice(selectStart,selectEnd),context);
 const start=app.indexOf('function optionsPanel()'),end=app.indexOf('function statusRows()',start);runInNewContext(app.slice(start,end),context);const html=context.optionsPanel();
 assert.ok(html.indexOf('name="symbol"')<html.indexOf('id="options-form"'));assert.match(html,/<select form="options-form" name="symbol">/);assert.match(html,/<option value="SPY" selected>/);assert.equal((html.match(/name="symbol"/g)||[]).length,1);assert.equal((html.match(/<form/g)||[]).length,1);assert.ok(html.indexOf('name="expiration"')>html.indexOf('id="options-form"'));
 let input;const expiry={},expiration={};context.document={addEventListener:(name,handler)=>input=handler};context.$=selector=>selector==='#expiry-summary'?expiry:expiration;
 const inputStart=app.indexOf("document.addEventListener('input',e=>{if(e.target.form?.id==='options-form')");runInNewContext(app.slice(inputStart,app.indexOf('\n',inputStart)),context);
 input({target:{form:{id:'options-form'},name:'symbol',value:'QQQ'}});assert.equal(context.optionsDraft.symbol,'QQQ');assert.equal(context.optionsDraft.expiration,'');assert.equal(context.optionsDraft.strike,'500');assert.equal(expiry.innerHTML,'EXPIRY QQQ');assert.match(expiration.innerHTML,/Automatic expiration/);
});
test('Scanner layout retains coverage, memberships, movers, in-play reasons and source issues without changing data',()=>{
 const data={lastScan:1000,trackRecord:{days:12},coverage:{withHistory:8,universe:10,liveQuotes:9,note:'Coverage note'},membership:{nasdaq:{symbols:['AAPL','MSFT'],checkedAt:1000}},movers:[{symbol:'AAPL',change:2,gap:1,rvol:3,relativeSPY:1,reasons:['Momentum'],asOf:1000}],inPlay:[{symbol:'MSFT',rvol:2,reasons:['Opening gap']}],errors:[{message:'Source delayed'}]},before=structuredClone(data),html=scannerPanel(data);
 for(const text of ['12','8','of 10 symbols','9','Coverage note','nasdaq','2 members','scanner-market-grid','Notable movers','AAPL','Stocks in play today','MSFT','Opening gap','Source delayed'])assert.ok(html.includes(text),text);
 assert.ok(html.indexOf('scanner-market-grid')<html.indexOf('Notable movers'));assert.ok(html.indexOf('Stocks in play today')<html.indexOf('<details class="panel"><summary>Source issues'));
 assert.ok(html.indexOf('Stocks in play today')<html.indexOf('Scanner coverage & track record'));
 assert.deepEqual(data,before);
});
