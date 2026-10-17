import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {DEFAULTS,backtest,evaluate} from '../engine.mjs';
import {ReplaySeries} from '../replay-series.mjs';
import {walkForward} from '../walk-forward.mjs';
const start=Date.parse('2026-10-02T00:00Z')/1000,bars=Array.from({length:420},(_,i)=>{const close=100+Math.sin(i/8)*2,open=i?100+Math.sin((i-1)/8)*2:close;return {time:start+i*300,open,close,high:Math.max(open,close)+.2,low:Math.min(open,close)-.2,volume:100,source:'Coinbase Exchange'};});
const settings={...structuredClone(DEFAULTS),cryptoAfterHours:false,minScore:0,minRR:.1,maxExtension:20,maxStopATR:20,maxTrades:100,filters:{confirmation:false,trend:false,volume:false,chop:false,vwap:false,spread:false,regime:false,events:false},costs:{...DEFAULTS.costs,crypto:{feeBps:0,slippageBps:0,spreadBps:0}}},input={symbol:'BTC-USD',market:'crypto',bars,base:300,tf:5,settings,strategy:'ema-cross',exitR:2};
test('Cached replay is exactly equal to the uncached closed-candle engine, including custom periods, gaps and future rows',()=>{
 for(const custom of [{}, {'ema-cross':{emaPeriod:21,trendLookback:5,higherCryptoTF:30}}]){const args={...input,bars:bars.filter((_,i)=>i!==200),settings:{...settings,strategyParams:custom}},cached=backtest(args),uncached=backtest({...args,cacheIndicators:false});assert.deepEqual(cached,uncached);}
 const now=(bars[199].time+300)*1000,prepared=new ReplaySeries(input),cached=evaluate({...input,now,prepared}),live=evaluate({...input,now});assert.deepEqual(cached,live);
 const changed=bars.map((b,i)=>i>=200?{...b,open:1000,high:1001,low:999,close:1000}:b);assert.deepEqual(evaluate({...input,bars:changed,now,prepared:new ReplaySeries({...input,bars:changed})}),cached);
});
test('Batched fixed-strategy workers share causal calculations and retain independent walk-forward results',async()=>{
 const strategies=['ema-cross','ema-retest'],result=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('../replay-worker.mjs',import.meta.url),{workerData:{...input,mode:'walk-forward-batch',strategies}});worker.once('message',m=>m.error?reject(Error(m.error)):resolve(m.result));worker.once('error',reject);});
 assert.equal(result.runs.length,2);for(const [i,strategy]of strategies.entries())assert.deepEqual(result.runs[i],walkForward({...input,strategy}));
});
