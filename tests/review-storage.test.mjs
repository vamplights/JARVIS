import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PaperLedger} from '../modules/paper-ledger.mjs';
import {ChartPatternStore} from '../modules/chart-pattern-store.mjs';
import {ModelReview} from '../modules/model-review.mjs';
import {DEFAULTS} from '../modules/engine.mjs';
import {analyzeLedger,settingsProfile} from '../modules/stats.mjs';
import {ledgerForStorage} from '../modules/ledger-storage.mjs';
import {PATTERN_DEFAULTS} from '../modules/chart-patterns.mjs';

test('Ledger archive preserves report cards, page, IDs, observations and exact frozen records across retry',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-archive-proof-'));
 try{
  const p=new PaperLedger(dir),profile=settingsProfile(DEFAULTS),time=Date.parse('2026-10-28T14:30Z');
  p.data.signals=Array.from({length:510},(_,i)=>({id:'s'+i,profile,timeframe:3,market:'stocks',strategy:'vwap',source:'Robinhood',timestamp:time+i*1000,outcome:i===1?'active':'expired',engineSnapshot:{id:'s'+i,status:'CONFIRMED'},optionPlans:{contract:{issuedAt:time}}}));
  p.data.observations=p.data.signals.map((s,i)=>({id:s.id,key:s.id,profile,protocol:'signal-r-v1',market:'stocks',strategy:'vwap',tf:3,dir:1,etHour:10,cohort:'confirmed',observedAt:time,direction:'long',outcome:i===1?'active':'expired',...(i===1?{}:{closedAt:time+i,realizedR:i%3-1})}));
  const original=JSON.stringify(ledgerForStorage(p.data)),stats=analyzeLedger(p.data),snapshot=p.snapshot();
  const file=p.file;fs.writeFileSync(file,original);
  const history={status:{}},learning={records:{runs:[]}},report=paper=>new ModelReview({dir,settings:()=>DEFAULTS,history,learning,paper}).report(time,[]);
  const before=report(p);
  let migrated=new PaperLedger(dir);
  assert.equal(fs.readFileSync(file+'.before-archive','utf8'),original);
  assert.deepEqual(migrated.allRows('signals'),p.data.signals);assert.deepEqual(migrated.allRows('observations'),p.data.observations);
  assert.deepEqual(migrated.stats(),stats);assert.deepEqual(migrated.snapshot(),snapshot);
  assert.deepEqual(report(migrated),before);assert.equal(migrated.signalById('s0').optionPlans.contract.issuedAt,time);
  assert.ok(migrated.data.signals.some(r=>r.outcome==='active'));assert.ok(migrated.data.observations.some(r=>r.outcome==='active'));
  const manifest=JSON.parse(fs.readFileSync(file)).archiveSegments;assert.equal(manifest.length,1);
  // Simulate interruption between durable segment and atomic hot-file replacement.
  fs.writeFileSync(file,original);migrated=new PaperLedger(dir);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).archiveSegments,manifest);
  assert.deepEqual(fs.readdirSync(path.join(dir,'ledger-archive')),[manifest[0]+'.json']);
  migrated.data.signals.push(...Array.from({length:100},(_,i)=>({id:'later'+i,outcome:'expired'})));migrated.saveSoon();migrated.flush();
  migrated=new PaperLedger(dir);assert.equal(migrated.allRows('signals').length,610);
  const hot=fs.readFileSync(file,'utf8'),segment=path.join(dir,'ledger-archive',manifest[0]+'.json');
  fs.appendFileSync(segment,' ');assert.throws(()=>new PaperLedger(dir),/checksum mismatch/);assert.equal(fs.readFileSync(file,'utf8'),hot);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Pattern retention archives only old terminal records, preserves history and flushes off-request',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-pattern-retention-'));
 try{
  const now=Date.now()/1000,records=['expired','forming','failed','confirmed','expired'].map((status,i)=>({id:String(i),symbol:'SPY',tf:3,source:'IEX',status,points:[],lines:[],lastEvaluatedCandle:now-(i===4?0:172800)}));
  const file=path.join(dir,'chart-pattern-analysis.json'),original=JSON.stringify({version:1,settings:{...PATTERN_DEFAULTS,enabled:true},records});fs.writeFileSync(file,original);
  const p=new ChartPatternStore(dir);assert.equal(p.error,null);assert.deepEqual([...p.records.keys()],['1','3','4']);assert.deepEqual(p.history().records,records);
  assert.equal(p.view('SPY',3).recordCount,5);assert.equal(p.view('SPY',3).records.length,5);assert.equal(fs.readFileSync(file+'.before-archive','utf8'),original);
  const prior=fs.readFileSync(file,'utf8');p.remember({...records.at(-1),id:'new'});p.saveSoon();assert.equal(fs.readFileSync(file,'utf8'),prior);p.flush();
  const restart=new ChartPatternStore(dir);assert.deepEqual(restart.history().records,[...records,{...records.at(-1),id:'new'}]);assert.equal(restart.archived.size,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('A failed deferred save remains eligible for a shutdown flush retry',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-retry-'));
 try{const p=new PaperLedger(dir);p.data.alerts=[{id:'retry'}];
  fs.mkdirSync(p.file+'.tmp');p.saveSoon();assert.match(p.error,/could not be saved/);assert.equal(p.dirty,true);
  fs.rmdirSync(p.file+'.tmp');p.flush();assert.equal(p.error,null);
  assert.deepEqual(new PaperLedger(dir).data.alerts,p.data.alerts);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
