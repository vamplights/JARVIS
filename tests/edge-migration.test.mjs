import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DEFAULTS} from '../engine.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('Server migrates old settings atomically with a backup, preserves journal and frozen levels, and flags strategy migration explicitly',async()=>{
 for(const flagged of [false,true]){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-migration-')),port=18767,origin='http://127.0.0.1:'+port,now=Date.now();
  const settings={...structuredClone(DEFAULTS),stockFrames:[1,3],feeBps:77,slippageBps:4,spreadBps:8};delete settings.betaVersion;delete settings.costs;delete settings.strategyFrames;
  const journal=[{id:'old',decision:'skipped',time:new Date(now).toISOString(),market:'stocks',symbol:'SPY',plannedRisk:0}],state={settings,journal};fs.writeFileSync(path.join(dir,'journal-settings.json'),JSON.stringify(state));
  const sig={id:'frozen',symbol:'BTC-USD',market:'crypto',strategy:'ema-cross',tf:5,dir:1,direction:'bullish',price:100,stop:99,target:102,confirmedAt:now,time:now,atr:1,rr:2,netRR:2,score:90,factors:[],warnings:[],status:'CONFIRMED',regime:'Trending'};
  fs.writeFileSync(path.join(dir,'signal-paper-ledger.json'),JSON.stringify({enabled:true,signals:[{id:sig.id,settings,engineSnapshot:sig}],trades:[],universe:[]}));
  const child=spawn(process.execPath,['server.mjs',...(flagged?['--migrate-strategy-frames']:[])],{cwd:root,env:{...process.env,JARVIS_PORT:String(port),JARVIS_DATA_DIR:dir,JARVIS_OFFLINE:'1',JARVIS_MIGRATE_STRATEGY_FRAMES:'0'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  try{
   await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});
   const response=await fetch(origin+'/api/state'),view=await response.json(),saved=JSON.parse(fs.readFileSync(path.join(dir,'journal-settings.json'),'utf8'));assert.equal(response.status,200);assert.deepEqual(saved.journal,journal);assert.equal(saved.settings.costs.stocks.feeBps,.3);assert.equal(saved.settings.costs.crypto.feeBps,77);assert.equal('feeBps'in saved.settings,false);assert.deepEqual(saved.settings.stockFrames,[3,5,15]);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'journal-settings.json.before-beta010-migration'),'utf8')),state);
   if(!flagged){const frozen=view.signals.find(s=>s.id==='frozen');assert.ok(frozen);assert.equal(frozen.stop,99);assert.equal(frozen.price,100);assert.equal(frozen.target,102);assert.equal(frozen.frozen,true);}else assert.deepEqual(saved.settings.strategyFrames.momentum,[]);
   assert.equal((await fetch(origin+'/api/paper')).status,404);assert.equal((await fetch(origin+'/api/orders')).status,404);
  }finally{child.kill();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});}
 }
});
