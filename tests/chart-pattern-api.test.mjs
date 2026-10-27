import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DEFAULTS} from '../engine.mjs';
import {S,boundary} from './chart-pattern-fixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('Offline API mode settings/history persist separately; strategy settings, alerts, paper and models stay unchanged',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-chart-api-')),port=18792,origin='http://127.0.0.1:'+port;
 const settings={...structuredClone(DEFAULTS),liveSignalsOnly:false},journal=[{id:'kept',decision:'skipped',time:'2026-10-26T18:00Z',market:'stocks',symbol:'SPY',plannedRisk:0}];
 fs.writeFileSync(path.join(dir,'journal-settings.json'),JSON.stringify({settings,journal}));
 const bars=boundary(0,.05).map((b,i,a)=>({...b,time:a[0].time+i*60,source:'Historical import'}));
 fs.writeFileSync(path.join(dir,'import-SPY.json'),JSON.stringify({symbol:'SPY',market:'stocks',base:60,bars,replay:true,quote:null}));
 let child;
 const start=async()=>{child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,JARVIS_PORT:String(port),JARVIS_DATA_DIR:dir,JARVIS_OFFLINE:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',c=>reject(Error('Fixture server exited '+c)));});};
 const stop=async()=>{if(child?.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}};
 const get=route=>fetch(origin+route).then(r=>r.json()),post=x=>fetch(origin+'/api/chart-patterns/settings',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(x)});
 try{await start();const before=await get('/api/state');assert.equal(before.chartPatterns.enabled,false);
  const protectedFile=fs.readFileSync(path.join(dir,'journal-settings.json'),'utf8'),modelBefore=await get('/api/models'),paperBefore=await get('/api/auto-paper'),ledgerBefore=await get('/api/signal-log/export');
  assert.equal((await post({...S,enabled:true,frames:[1]})).status,200);
  for(let i=0;i<12;i++){const chart=await get('/api/chart?symbol=SPY&tf=1');if(!chart.chartPatterns.health['SPY:1'].catchingUp)break;}
  const after=await get('/api/state');assert.ok(after.chartPatterns.recordCount>0);assert.deepEqual(after.settings,before.settings);assert.deepEqual(after.journal,before.journal);assert.deepEqual(after.signals,before.signals);assert.deepEqual(after.risk,before.risk);
  assert.equal(fs.readFileSync(path.join(dir,'journal-settings.json'),'utf8'),protectedFile);assert.deepEqual(await get('/api/models'),modelBefore);assert.deepEqual(await get('/api/auto-paper'),paperBefore);assert.deepEqual(await get('/api/signal-log/export'),ledgerBefore);
  const retained=(await get('/api/chart-patterns/history')).records;assert.ok(retained.length);assert.equal((await post({enabled:false})).status,200);const off=await get('/api/chart?symbol=SPY&tf=1');assert.deepEqual(off.chartPatterns.records,[]);assert.deepEqual((await get('/api/chart-patterns/history')).records,retained);
  await stop();await start();assert.equal((await get('/api/chart-patterns')).enabled,false);assert.deepEqual((await get('/api/chart-patterns/history')).records,retained);
  assert.equal((await post({risk:99})).status,400);assert.equal((await fetch(origin+'/api/chart-patterns/settings',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:'{"enabled":true}'})).status,403);
  assert.equal((await fetch(origin+'/chart-pattern-view.mjs')).status,200);assert.equal((await fetch(origin+'/api/orders')).status,404);
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
