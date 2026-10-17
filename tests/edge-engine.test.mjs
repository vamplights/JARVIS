import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,RULES,marketCosts,roundTripCost,rewardMetrics,positionSize,migrateSettings,stopFloor,stockEntryBlocked,applyGates,riskState,adx,evaluate,backtest} from '../engine.mjs';
import {validateSettings} from '../settings.mjs';
const zero={stocks:{feeBps:0,slippageBps:0,spreadBps:0},crypto:{feeBps:0,slippageBps:0,spreadBps:0}};
const permissive={...structuredClone(DEFAULTS),costs:zero,cryptoAfterHours:false,stockNoEntry:[],strategyFrames:Object.fromEntries(Object.keys(RULES).map(k=>[k,[1,3,5]])),filters:{confirmation:false,trend:false,volume:false,chop:false,vwap:false,market:false,spread:false},minScore:0,minRR:.1,maxExtension:20,maxStopATR:20,maxTrades:100};
test('SPY 3m 25bps stop and 2R target have more than 1.5R after stock costs',()=>{
 const r=rewardMetrics(400,399,402,'stocks');assert.ok(r.netRR>1.5);assert.ok(Math.abs(r.netRR-1.73554)<1e-6);assert.ok(r.netRewardRisk<1.5);assert.ok(rewardMetrics(400,399,402,'crypto').netRR<0);
 const stocks=positionSize(400,399,'stocks',{...DEFAULTS,capital:10000,risk:100,riskPercent:1}),crypto=positionSize(400,399,'crypto',{...DEFAULTS,capital:10000,risk:100,riskPercent:1});assert.ok(stocks.size>crypto.size);assert.ok(stocks.plannedRisk<=100);
});
test('SPY 3m engine emits a cost-aware long with a 25bps stop and 2R target',()=>{
 const start=Date.parse('2026-10-09T12:00Z')/1000,prices=Array.from({length:60},(_,i)=>400-i*.01).concat(400),bars=prices.flatMap((price,j)=>Array.from({length:3},(_,i)=>({time:start+(j*3+i)*60,open:j===60?399.4:price-.005,close:price,high:price+.02,low:j===60?399.39:price-.02,volume:100})));
 const settings={...permissive,costs:DEFAULTS.costs,minStopBps:{stocks:25,crypto:25},minRR:1.5},result=evaluate({symbol:'SPY',market:'stocks',bars,base:60,tf:3,settings,now:(bars.at(-1).time+60)*1000}),sig=result.signals.find(s=>s.strategy==='ema-cross');assert.ok(sig);assert.equal(sig.dir,1);assert.equal(sig.stop,400-400*6.6*4/10000);assert.equal(sig.rr,2);assert.ok(sig.netRR>1.5);assert.equal(sig.status,'CONFIRMED');
});
test('Legacy flat costs migrate only to crypto; nested settings and old strategy preferences survive',()=>{
 const old={feeBps:77,slippageBps:4,spreadBps:8,stockFrames:[1,3],strategies:['momentum','ema-cross']},s=migrateSettings(old);assert.deepEqual(s.costs.stocks,DEFAULTS.costs.stocks);assert.deepEqual(s.costs.crypto,{feeBps:77,slippageBps:4,spreadBps:8});assert.equal('feeBps'in s,false);assert.deepEqual(s.stockFrames,[1,3]);assert.ok(s.strategyFrames.momentum.includes(1));
 assert.deepEqual(migrateSettings(s),s);const flagged=migrateSettings(old,{migrateStrategyFrames:true});assert.deepEqual(flagged.stockFrames,[3,5,15]);assert.deepEqual(flagged.strategyFrames.momentum,[]);assert.deepEqual(migrateSettings({}, {existing:false}).strategyFrames,DEFAULTS.strategyFrames);
});
test('Observed bid/ask replaces assumed spread, including a valid zero spread',()=>{
 assert.equal(marketCosts(DEFAULTS,'stocks',{bid:100,ask:100}).spreadBps,0);assert.equal(marketCosts(DEFAULTS,'stocks',{bid:99.9,ask:100.1}).spreadBps.toFixed(1),'20.0');assert.equal(marketCosts(DEFAULTS,'stocks',{bid:101,ask:100}).spreadSource,'assumed');
 assert.ok(roundTripCost(100,102,'stocks',DEFAULTS,{bid:99,ask:101})>roundTripCost(100,102,'stocks',DEFAULTS));
});
test('Stop floors widen long and short stops to both ATR and per-market basis-point bounds',()=>{
 const long=stopFloor(100,99.99,1,.1,'stocks');assert.equal(long.stop,99.736);assert.ok(long.stopATR>=.75);const short=stopFloor(100,100.01,-1,.1,'crypto');assert.equal(short.stop,105.12);
 const atrFloor=stopFloor(100,99.99,1,2,'stocks');assert.equal(atrFloor.stop,98.5);assert.equal(atrFloor.stopATR,.75);assert.equal(stopFloor(100,98,1,1,'stocks').stop,98);
});
test('New defaults disable 1m and plain momentum; saved preferences require the explicit flag',()=>{
 assert.deepEqual(DEFAULTS.stockFrames,[3,5,15]);assert.ok(Object.values(DEFAULTS.strategyFrames).every(frames=>!frames.includes(1)));assert.deepEqual(DEFAULTS.strategyFrames.momentum,[]);
 assert.deepEqual(validateSettings({stockFrames:[5],strategyFrames:{'ema-cross':[5]}},DEFAULTS).stockFrames,[5]);
 assert.throws(()=>validateSettings({strategyFrames:{vwap:[1]}},DEFAULTS));assert.throws(()=>validateSettings({costs:{stocks:{feeBps:-1}}},DEFAULTS));assert.throws(()=>validateSettings({feeBps:0},DEFAULTS));assert.throws(()=>validateSettings({stockNoEntry:['13:30-11:30']},DEFAULTS));
});
test('Eastern no-entry windows are start inclusive, end exclusive and DST-aware; crypto is unaffected',()=>{
 for(const [time,blocked]of [['2026-10-09T13:30Z',true],['2026-10-09T13:35Z',false],['2026-10-09T15:30Z',false],['2026-10-09T17:30Z',false],['2026-11-02T14:30Z',true],['2026-11-02T14:35Z',false]])assert.equal(stockEntryBlocked(Date.parse(time)),blocked,time);
 const now=Date.parse('2026-10-09T16:00Z'),s={...DEFAULTS,cryptoAfterHours:false},sig={status:'CONFIRMED',market:'stocks',price:100,stop:99,atr:1,warnings:[],replay:false},quote={price:100,time:now};assert.equal(applyGates(sig,riskState([],s,now),s,now,quote).status,'CONFIRMED');assert.equal(applyGates({...sig,market:'crypto'},riskState([],s,now),s,now,quote).status,'CONFIRMED');
});
test('ADX uses Wilder smoothing with hand-calculated seed, flat zero and causal output',()=>{
 const bars=[10,11,12,11,10].map(h=>({high:h,low:h-2,close:h-1}));assert.deepEqual(adx(bars,2),[null,null,null,50,50]);
 const trending=Array.from({length:40},(_,i)=>({high:101+i,low:99+i,close:100+i}));assert.equal(adx(trending).at(-1),100);assert.equal(adx(Array(40).fill({high:100,low:100,close:100})).at(-1),0);assert.deepEqual(adx([...trending,{high:200,low:1,close:2}]).slice(0,40),adx(trending));
});
const start=Date.parse('2026-10-08T00:00Z')/1000;
const bars=Array.from({length:240},(_,i)=>{const c=100+Math.sin(i/8)*2,o=i?100+Math.sin((i-1)/8)*2:c;return {time:start+i*300,open:o,high:Math.max(c,o)+.2,low:Math.min(c,o)-.2,close:c,volume:100};});
test('Every emitted signal records regime data and floors; timeframe map suppresses disabled variants',()=>{
 let found=[];for(let n=60;n<85;n++)found.push(...evaluate({symbol:'BTC-USD',market:'crypto',base:300,tf:5,bars:bars.slice(0,n),settings:permissive,now:(bars[n-1].time+300)*1000}).signals);assert.ok(found.length);for(const s of found){assert.ok(Number.isFinite(s.adx));assert.ok(Number.isFinite(s.efficiency));assert.ok(s.stopATR>=DEFAULTS.minStopATR-1e-8);assert.ok(s.stopBps>=25-1e-8);assert.equal(s.targetCapped,s.rr<permissive.minRR);}
 const disabled={...permissive,strategyFrames:Object.fromEntries(Object.keys(RULES).map(k=>[k,[]]))};assert.equal(evaluate({symbol:'BTC-USD',market:'crypto',base:300,tf:5,bars,settings:disabled,now:Infinity}).signals.length,0);
});
test('Backtests record after-cost R, excursions and use market costs with time-of-day gates',()=>{
 const input={symbol:'BTC-USD',market:'crypto',base:300,tf:5,bars,settings:permissive,strategy:'ema-cross'},r=backtest(input);assert.ok(r.trades.length);for(const t of r.trades){assert.equal(t.realizedR,t.pnl/(t.size*Math.abs(t.entry-t.stop)));assert.ok(t.mfeR>=0&&t.maeR<=0);assert.ok(Number.isFinite(t.adx));}
 const stockBars=bars.map(b=>({...b,time:b.time+9*3600})),stockInput={...input,symbol:'SPY',market:'stocks',bars:stockBars},open=backtest(stockInput);assert.ok(open.trades.length);assert.equal(backtest({...stockInput,settings:{...permissive,stockNoEntry:['00:00-23:59']}}).trades.length,0);
});
