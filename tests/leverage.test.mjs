import test from 'node:test';
import assert from 'node:assert/strict';
import {cryptoLeveragePlan} from '../leverage.mjs';
import {DEFAULTS} from '../engine.mjs';
const now=Date.now(),settings={...DEFAULTS,capital:500,risk:15,costs:{stocks:{feeBps:0,slippageBps:0,spreadBps:0},crypto:{feeBps:0,slippageBps:0,spreadBps:0}}},signal={symbol:'BTC-USD',market:'crypto',price:100,stop:99,dir:1,score:90,status:'CONFIRMED',replay:false};
const product={productId:'TEST-BTC',unitSize:1,minContracts:1,contractIncrement:1,priceTick:1,maxContracts:5000,sessionOpen:true,quote:{price:100,time:now},fetchedAt:now,intraday:{long:.1,short:.1},overnight:{long:.2,short:.25},fundingRate:0};
const data={products:{'BTC-USD':product},error:null};
test('Planner selects lowest funded leverage, uses whole contracts and enforces risk first',()=>{
 const p=cryptoLeveragePlan(signal,settings,data,now);assert.equal(p.contracts,15);assert.equal(p.suggested,3);assert.equal(p.notional,1500);assert.equal(p.plannedRisk,15);assert.equal(p.levels.length,10);assert.equal(p.levels[2].margin,500);assert.equal(p.levels[4].allowed,true);assert.equal(p.levels[5].allowed,false);assert.equal(p.confidence.probability,null);
 assert.equal(p.levels[2].lossOnMarginPct,3);assert.equal(p.levels[4].lossOnMarginPct,5);
});
test('Unconfirmed, stale and minimum-contract-over-budget setups get no leverage recommendation',()=>{
 assert.equal(cryptoLeveragePlan({...signal,status:'WATCH'},settings,data,now).suggested,null);
 assert.equal(cryptoLeveragePlan(signal,settings,data,now+91000).suggested,null);
 const p=cryptoLeveragePlan(signal,{...settings,risk:.5},data,now);assert.equal(p.contracts,0);assert.equal(p.suggested,null);assert.equal(p.minimumContractRisk,1);assert.match(p.reason,/Minimum contract/);
});
test('Fees and funding reduce size, and short side uses its own margin rate',()=>{
 const p=cryptoLeveragePlan({...signal,dir:-1,stop:101},settings,data,now);assert.equal(p.levels[3].allowed,true);assert.equal(p.levels[4].allowed,false);
 const costly=cryptoLeveragePlan(signal,{...settings,costs:{...settings.costs,crypto:{...settings.costs.crypto,feeBps:25}}},{products:{'BTC-USD':{...product,fundingRate:.001}}},now);assert.ok(costly.contracts<15);assert.ok(costly.plannedRisk<=15);
 assert.equal(cryptoLeveragePlan({...signal,stop:102},settings,data,now).suggested,null);
});
test('Confidence is the same rule score regardless of leverage or account capital',()=>{
 const a=cryptoLeveragePlan(signal,settings,data,now),b=cryptoLeveragePlan(signal,{...settings,capital:1500},data,now);assert.equal(a.suggested,3);assert.equal(b.suggested,1);assert.deepEqual(a.confidence,b.confidence);
});
test('Missing funding or margin data cannot invent a leverage allowance',()=>{
 assert.equal(cryptoLeveragePlan(signal,settings,{products:{'BTC-USD':{...product,fundingRate:null}}},now).suggested,null);
 assert.equal(cryptoLeveragePlan(signal,settings,{products:{'BTC-USD':{...product,overnight:{}}}},now).suggested,null);
});
