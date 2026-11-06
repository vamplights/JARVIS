import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';
import {renderExampleSignal} from '../modules/card-view.mjs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),money=n=>'$'+Number(n).toFixed(2);
test('Illustrative radar cards have full plans, a dismiss button and no actions that can write real trades',()=>{
 for(const market of ['stocks','crypto']){const html=renderExampleSignal(market,{money});for(const text of ['EXAMPLE','ILLUSTRATIVE VALUES','62%','Entry area','Invalidation / stop','Exit scenarios','Example checks and plan','dismiss-example-signal'])assert.ok(html.includes(text));assert.doesNotMatch(html,/data-signal=|data-log-signal|data-research-options|data-paper|data-hide-signal/);assert.match(html,market==='crypto'?/BTC-USD/:/illustrative contract/);}
});
test('Example market selection routes to its radar and dismissal leaves real signal state untouched',()=>{
 const start=app.indexOf("case 'example-signal':{"),end=app.indexOf("case 'overview-settings':",start),signals=[{id:'real'}],before=structuredClone(signals),context={exampleSignalMarket:null,state:{signals},market:'crypto',navigate:value=>context.route=value,refreshSignalResults:()=>context.refreshed=true,$:()=>({value:context.market}),document:{querySelector:()=>({scrollIntoView(){}})}};
 runInNewContext('this.act=action=>{switch(action){'+app.slice(start,end)+'}};',context);
 context.act('example-signal');assert.equal(context.route,'crypto');assert.equal(context.exampleSignalMarket,'crypto');context.act('dismiss-example-signal');assert.equal(context.exampleSignalMarket,null);assert.equal(context.refreshed,true);context.market='stocks';context.act('example-signal');assert.equal(context.route,'stocks');assert.deepEqual(signals,before);
 assert.match(app,/exampleSignalMarket===market/);
});
