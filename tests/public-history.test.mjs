import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PublicMarket,parseYahoo,parseCNBC,historyGaps} from '../public-market.mjs';
import {DEFAULTS} from '../engine.mjs';
const now=Date.parse('2026-10-08T14:05:05Z'),time=now/1000-305,bar={time,open:100,high:102,low:99,close:101,volume:20};
const yahoo={chart:{result:[{timestamp:[time,time+60],indicators:{quote:[{open:[100,101],high:[102,103],low:[99,100],close:[101,102],volume:[20,25]}]},meta:{regularMarketTime:time+120,regularMarketPrice:102}}]}};
const cnbc={barData:{priceBars:[{tradeTime:'20261008100000',tradeTimeinMills:time*1000,open:100,high:102,low:99,close:101,volume:20}]}};
test('Public parsers preserve real timestamps, source tags and absent bid/ask; malformed or empty responses fail clearly',()=>{
 const y=parseYahoo(yahoo,60,now);assert.equal(y.bars.length,2);assert.equal(y.bars[0].source,'Yahoo Finance');assert.equal(y.bars[0].fallback,true);assert.equal(y.quote.bid,null);assert.equal(y.quote.time,(time+120)*1000);const c=parseCNBC(cnbc,now);assert.equal(c.bars.length,1);assert.equal(c.bars[0].source,'CNBC');assert.equal(c.quote.time,(time+60)*1000);
 assert.throws(()=>parseYahoo({chart:{error:{description:'Rate limited'}}},60,now),/Rate limited/);assert.throws(()=>parseCNBC({},now),/no completed/);const invalid=structuredClone(yahoo);invalid.chart.result[0].indicators.quote[0].close=[null,null];assert.throws(()=>parseYahoo(invalid,60,now),/no valid/);
});
test('Yahoo is first fallback; a provider switch replaces indicator history instead of mixing sources',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-public-'));try{let fail=false;const requests=[],p=new PublicMarket({dir,settings:()=>({...DEFAULTS,stocks:['SPY'],crypto:[]}),now:()=>now,request:async url=>{requests.push(url);if(url.includes('yahoo')){if(fail)throw Error('unavailable');return yahoo;}return cnbc;}});await p.tick();assert.equal(p.assets.SPY.bars.length,2);assert.match(requests[0],/yahoo/);fail=true;await p.tick();assert.equal(p.assets.SPY.bars.length,1);assert.equal(p.assets.SPY.bars[0].source,'CNBC');assert.ok(p.assets.SPY.publicData);assert.equal(Object.keys(p.status.errors).length,0);
 p.liveAssets=()=>({SPY:{bars:[bar],quote:{time:now,price:101}}});const n=requests.length;await p.tick();assert.equal(requests.length,n);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('History is stored by symbol, interval and provider, remains incremental, and records gaps without filling them',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-history-'));try{const p=new PublicMarket({dir,settings:()=>({...DEFAULTS,stocks:['SPY'],crypto:[]}),now:()=>now,request:async()=>yahoo}),r=await p.download('SPY','stocks',1);assert.equal(r.bars.length,2);assert.equal(r.source,'Yahoo Finance');assert.equal(r.fallback,true);assert.ok(fs.existsSync(path.join(dir,'history','SPY','60','Yahoo-Finance.json')));assert.ok(fs.existsSync(path.join(dir,'sessions','SPY--Yahoo-Finance.json')));assert.equal(p.history('SPY')[0].count,2);
 const again=await p.download('SPY','stocks',1);assert.equal(again.bars.length,2);const restored=new PublicMarket({dir,settings:()=>({...DEFAULTS,stocks:['SPY'],crypto:[]}),now:()=>now,request:async()=>yahoo});assert.equal(restored.assets.SPY.fallback,true);assert.equal(restored.assets.SPY.bars.length,2);
 const gap=historyGaps([bar,{...bar,time:time+180}],60,'crypto');assert.equal(gap[0].missing,2);assert.equal(historyGaps([bar,{...bar,time:time+86400}],60,'stocks').length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Coinbase history requests obey its 300-candle limit and discard out-of-range/future candles',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-crypto-history-'));try{const requests=[],aligned=Math.floor(now/300000)*300,p=new PublicMarket({dir,settings:()=>DEFAULTS,now:()=>now,request:async url=>{requests.push(url);return [[aligned-300,99,101,100,100,1],[aligned+300,99,101,100,100,1]];}});const r=await p.download('BTC-USD','crypto',2);assert.equal(r.bars.length,1);assert.equal(r.fallback,false);assert.equal(r.bars[0].source,'Coinbase Exchange');assert.ok(requests.length>=2);for(const u of requests){const q=new URL(u).searchParams;assert.ok((Date.parse(q.get('end'))-Date.parse(q.get('start')))/1000<=299*300);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
