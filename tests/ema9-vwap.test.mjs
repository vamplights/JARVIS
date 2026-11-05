import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {DEFAULTS,migrateBetaSettings,strategyEnabled,evaluate,backtest} from '../modules/engine.mjs';
import {retestSetups,strategySeries,resolveEma9Paper,EMA9_VWAP,EMA9_PROTOCOL} from '../modules/ema9-vwap.mjs';
import {combineSignals} from '../modules/confluence.mjs';
import {JarvisForward} from '../modules/jarvis-forward.mjs';
const settings=()=>structuredClone(DEFAULTS),start=Date.parse('2026-10-27T13:30:00Z');
const bar=(i,extra={})=>({time:start/1000+i*60,open:100,high:100.1,low:99.9,close:100,volume:100,complete:true,...extra});
const row=(i,extra={})=>({...bar(i*3),date:'2026-10-27',ema:99,vwap:100,...extra});
function sig(symbol='QQQ',time=start+30*60000){return {id:symbol+time,strategy:EMA9_VWAP,status:'CONFIRMED',symbol,source:'Robinhood',dir:1,price:100,stop:99,entryValidAfter:time,expiresAt:time+180000};}
function asset(bars){return {source:'Robinhood',base:60,bars};}
test('Forward integration keeps this stock strategy visible with one dedicated exit scenario',()=>{
 const s=settings(),t=start+1800000,paper=new JarvisForward({dir:null,settings:()=>s});
 paper.observeWithSetupLearning([sig()],{QQQ:asset([])},t);
 paper.observeWithSetupLearning([],{QQQ:asset([bar(30,{high:101,low:99.5})])},t+60000);
 assert.equal(paper.data.rows.length,1);assert.equal(paper.data.rows[0].forwardCore,undefined);assert.equal(paper.data.rows[0].learningOnly,undefined);assert.equal(paper.snapshot({market:'stocks'}).rows.length,1);assert.equal(paper.data.rows[0].target,null);
});
test('First touch must follow the crossover, close beyond both, and occur within five candles; reverse crossings cancel',()=>{
 const initial=[row(0),row(1,{ema:101})],touch=i=>row(i,{ema:101,low:99.8,high:102,close:101.5});
 assert.equal(retestSetups([...initial,touch(2),touch(3)]).length,1);
 assert.equal(retestSetups([...initial,...[2,3,4,5].map(i=>row(i,{ema:101,low:101,high:102})),touch(6)]).length,1);
 assert.equal(retestSetups([...initial,...[2,3,4,5,6].map(i=>row(i,{ema:101,low:101,high:102})),touch(7)]).length,0);
 assert.equal(retestSetups([...initial,row(2),touch(3)]).length,0);
 assert.equal(retestSetups([...initial,row(2,{ema:101,close:100.5})]).length,0);
 const short=[row(0,{ema:101}),row(1),row(2,{close:98,low:97,high:100.2})];assert.equal(retestSetups(short)[0].dir,-1);
});
test('RTH-only indicators require session VWAP anchor and complete contiguous 3m candles',()=>{
 const s=settings(),bars=Array.from({length:60},(_,i)=>bar(i));
 const series=strategySeries([bar(-1),...bars],60,s,start+3600000);assert.equal(series.length,20);assert.equal(series[0].time,start/1000);assert.equal(series[0].vwap,100);assert.equal(series[8].ema,100);
 assert.equal(strategySeries(bars.slice(3),60,s,start+3600000)[0].vwap,null);
 assert.equal(strategySeries(bars.filter((_,i)=>i!==10),60,s,start+3600000).at(-1).vwap,null);
});
test('New strategy is separately enabled only for stocks at 3m and never combines frozen levels with old rules',()=>{
 const s=migrateBetaSettings({...settings(),strategies:['vwap']});assert.ok(s.strategies.includes(EMA9_VWAP));assert.ok(strategyEnabled(EMA9_VWAP,3,s,'stocks'));assert.ok(!strategyEnabled(EMA9_VWAP,5,s,'stocks'));assert.ok(!strategyEnabled(EMA9_VWAP,3,s,'crypto'));
 const base={symbol:'QQQ',market:'stocks',tf:3,confirmedAt:start,dir:1,status:'CONFIRMED',source:'Robinhood'};assert.equal(combineSignals([{...base,strategy:'vwap'},{...base,strategy:EMA9_VWAP}]).length,2);
 assert.equal(evaluate({symbol:'BTC-USD',market:'crypto',bars:[],base:60,tf:3,settings:s,now:start}).signals.length,0);
 assert.throws(()=>backtest({symbol:'QQQ',market:'stocks',bars:[],settings:s,strategy:EMA9_VWAP}),/dedicated forward/);
});
test('Next candle entry uses whole shares at 0.5% risk, fixed stop, costs and adverse gap fills',()=>{
 const s=settings();s.capital=10000;const t=start+1800000,store={rows:[]},g=sig();
 resolveEma9Paper(store,[g],{QQQ:asset([])},s,'p',t);
 resolveEma9Paper(store,[],{QQQ:asset([bar(30,{high:101,low:99.5}),bar(31,{open:98,low:97,high:98.5})])},s,'p',t+120000);
 const r=store.rows[0];assert.equal(r.size,50);assert.equal(r.stop,99);assert.equal(r.exit,98);assert.ok(r.pnl<-100);assert.equal(r.forwardProtocol,EMA9_PROTOCOL);
});
test('Untriggered next candle expires; quote fills never backdate a bar that started before observation',()=>{
 const s=settings(),t=start+1800000,store={rows:[]};resolveEma9Paper(store,[sig()],{QQQ:asset([])},s,'p',t+2000);
 resolveEma9Paper(store,[],{QQQ:asset([bar(30,{high:102})])},s,'p',t+60000);assert.equal(store.rows[0].entryAt,undefined);
 const a={...asset([]),quote:{price:100.2,time:t+61000}};resolveEma9Paper(store,[],{QQQ:a},s,'p',t+61000);assert.equal(store.rows[0].entry,100.2);
 const other={rows:[]};resolveEma9Paper(other,[sig()],{QQQ:asset([])},s,'p',t);resolveEma9Paper(other,[],{QQQ:asset([bar(30,{high:100}),bar(31,{high:100}),bar(32,{high:100})])},s,'p',t+180000);assert.equal(other.rows[0].state,'missed fill');
});
test('One position across symbols and two fills per New York session',()=>{
 const s=settings(),t=start+1800000,store={rows:[]};resolveEma9Paper(store,[sig('QQQ'),sig('SPY')],{},s,'p',t);
 resolveEma9Paper(store,[],{QQQ:asset([bar(30,{high:101,low:99.5})]),SPY:asset([bar(30,{high:101,low:99.5})])},s,'p',t+60000);
 assert.equal(store.rows.filter(r=>r.state==='active').length,1);assert.equal(store.rows.filter(r=>r.state==='missed fill').length,1);
 const first=store.rows.find(r=>r.entryAt);first.closedAt=t+60000;first.pnl=0;first.state='closed';
 for(const [i,minute] of [[1,34],[2,38]]){const g=sig('QQQ',start+minute*60000);resolveEma9Paper(store,[g],{},s,'p',g.entryValidAfter);resolveEma9Paper(store,[],{QQQ:asset([bar(minute,{high:101,low:98})])},s,'p',g.entryValidAfter+60000);}
 assert.equal(store.rows.filter(r=>r.entryAt).length,2);assert.equal(store.rows.at(-1).reason,'Two trades per session');
});
test('EMA close exit fills at next available open, with early-close liquidation before intrabar extremes',()=>{
 const s=settings(),t=start+1800000,store={rows:[]};resolveEma9Paper(store,[sig()],{},s,'p',t);resolveEma9Paper(store,[],{QQQ:asset([bar(30,{high:101,low:99.5})])},s,'p',t+60000);
 const r=store.rows[0];r.pendingEMAExit=true;resolveEma9Paper(store,[],{QQQ:asset([bar(31,{open:102,high:103,low:98})])},s,'p',t+120000);assert.equal(r.exit,102);assert.match(r.exitReason,/EMA9/);
 const early=settings();early.earlyCloses['2026-10-27']='13:00';const second={rows:[]};resolveEma9Paper(second,[sig()],{},early,'p',t);resolveEma9Paper(second,[],{QQQ:asset([bar(30,{high:101,low:99.5}),bar(209,{open:102,low:98})])},early,'p',start+210*60000);assert.equal(second.rows[0].exit,102);assert.equal(second.rows[0].exitReason,'session close');
});

test('Late entry candles fill after expiration, gaps wait for evidence, and absent data ages out',()=>{
 const s=settings(),t=start+1800000,store={rows:[]},quiet=i=>bar(i,{high:100});
 resolveEma9Paper(store,[sig()],{},s,'p',t);
 resolveEma9Paper(store,[],{QQQ:{...asset([quiet(32)]),quote:{price:101,time:t+181000}}},s,'p',t+181000);
 assert.equal(store.rows[0].state,'awaiting entry');
 resolveEma9Paper(store,[],{QQQ:asset([quiet(30),bar(31,{high:101}),quiet(32)])},s,'p',t+240000);
 assert.equal(store.rows[0].entryAt,t+60000);
 const missing={rows:[]};resolveEma9Paper(missing,[sig()],{},s,'p',t);resolveEma9Paper(missing,[],{},s,'p',t+18*60000);assert.equal(missing.rows[0].state,'unmeasurable');
});
test('EMA cache reuses completed series within a bucket and invalidates revised history and new closures',()=>{
 const s=settings(),bars=Array.from({length:12},(_,i)=>bar(i)),series=now=>strategySeries(bars,60,s,now,'TEST','fixture');
 const first=series(start+9*60000);assert.strictEqual(series(start+11*60000),first);
 const next=series(start+12*60000);assert.notStrictEqual(next,first);assert.equal(next.length,4);
 bars[0]={...bars[0],volume:0};assert.notStrictEqual(series(start+12*60000),next);
});
test('Legacy EMA settings migrate, retain distinct frozen variants, and resolve after restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-ema-pool-'));
 try{
  const s=settings(),t=start+1800000,store={rows:[]};
  resolveEma9Paper(store,[sig('QQQ'),sig('SPY')],{},s,'p',t);
  const rows=structuredClone(store.rows);rows[1].settings=structuredClone(s);rows[1].settings.sidebarSubtitle='other';
  const file=path.join(dir,'auto-paper.json'),original=JSON.stringify({rows,forwardSettings:{}});fs.writeFileSync(file,original);
  const p=new JarvisForward({dir,settings:()=>s});p.save();
  assert.equal(fs.readFileSync(file+'.before-ema-settings-pool','utf8'),original);
  const saved=JSON.parse(fs.readFileSync(file));assert.ok(saved.rows.every(r=>!r.settings));assert.deepEqual(saved.forwardSettings.p,s);
  const restored=new JarvisForward({dir,settings:()=>s});assert.deepEqual(restored.data.rows.map(r=>r.settings),rows.map(r=>r.settings));
  restored.observe([],{QQQ:asset([bar(30)])},t+60000);assert.ok(restored.data.rows[0].entryAt);restored.flush();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
