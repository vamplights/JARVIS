import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {DEFAULTS} from '../modules/engine.mjs';
import {SessionLearning} from '../modules/intelligence.mjs';
import {ModelReview} from '../modules/model-review.mjs';
import {LocalCycle} from '../modules/local-cycle.mjs';
import {replayQueue} from '../modules/replay-queue.mjs';

function replay(input){return new Promise((resolve,reject)=>{
 const w=new Worker(new URL('../modules/replay-worker.mjs',import.meta.url),{workerData:input});
 w.once('message',m=>m.error?reject(Error(m.error)):resolve(m.result));w.once('error',reject);
});}
const bars=['2026-10-26','2026-10-27'].flatMap(date=>Array.from({length:390},(_,i)=>({
 time:Date.parse(date+'T13:30Z')/1000+i*60,open:100,high:101,low:99,close:100,volume:100,complete:true
})));
const settings={...structuredClone(DEFAULTS),stocks:['SPY'],crypto:[],stockFrames:[3],strategies:['ema-cross','vwap','ema9-vwap-retest']};
test('An unsupported batch member preserves successful runs before and after it',async()=>{
 const result=await replay({symbol:'SPY',market:'stocks',tf:3,base:60,bars,settings,exitR:2,mode:'walk-forward-batch',strategies:['ema-cross','ema9-vwap-retest','vwap']});
 assert.deepEqual(result.runs.map(r=>r.strategy),['ema-cross','vwap']);assert.match(result.errors[0].message,/dedicated forward/);
});
test('EMA9-enabled daily learning saves other runs and completes Retrain and validate',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-28T22:00Z')});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-cycle-batch-'));
 try{
  const batches=[],learning=new SessionLearning({dir,settings:()=>settings,assets:()=>({SPY:{symbol:'SPY',market:'stocks',source:'Robinhood',base:60,bars}}),news:{cache:{}},batchReplay:true,replay:async input=>{batches.push(input.strategies);return replay(input);}});
  const history={status:{},refreshHistory:async()=>{}},review=new ModelReview({dir,settings:()=>settings,history,paper:{data:{signals:[],observations:[]}},learning});
  const cycle=new LocalCycle({dir,settings:()=>settings,history,review,paper:{report:()=>({markets:{}})},scanner:{scan:async()=>{},data:{},snapshot:()=>({})},resolve:()=>{}});
  await cycle.run('2026-10-28');
  assert.deepEqual(batches,[['ema-cross','vwap']]);assert.equal(learning.error,null);
  assert.deepEqual(learning.records.runs.map(r=>r.strategy),['ema-cross','vwap']);
  assert.ok(cycle.data.cycles['2026-10-28'].complete,cycle.data.cycles['2026-10-28'].error);
  assert.ok(cycle.data.cycles['2026-10-28'].stages.some(s=>s.name==='Retrain and validate'));
  await learning.tick();assert.equal(batches.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Queued replay overlap is FIFO, including after a rejection',async()=>{
 const order=[];let active=0,max=0;const run=replayQueue(async id=>{order.push(id);max=Math.max(max,++active);await new Promise(r=>setImmediate(r));active--;if(!id)throw Error('fixture failure');return id;});
 const results=await Promise.allSettled([run(1),run(0),run(2)]);
 assert.deepEqual(order,[1,0,2]);assert.equal(max,1);assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected','fulfilled']);
});
