import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {Scanner} from '../modules/scanner.mjs';
import {DEFAULTS} from '../modules/engine.mjs';

test('Scanner uses fresh live Robinhood quotes and backs off failing Yahoo batch and chart feeds',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-scanner-backoff-'));let now=200000,calls=0,charts=0;
 try{
  const scanner=new Scanner({dir,settings:()=>DEFAULTS,now:()=>now,assets:()=>({SPY:{source:'Robinhood',quote:{time:now,price:200}},QQQ:{source:'Robinhood',snapshot:true,quote:{time:now,price:500}}}),
   requests:{fetch:async()=>{calls++;throw Error('HTTP 401');}},history:{yahoo:async()=>{charts++;throw Error('fetch failed');}}});
  assert.deepEqual(Object.keys(await scanner.quotes(['SPY','QQQ'])),['SPY']);assert.deepEqual([calls,charts],[1,1]);
  now+=1000;assert.equal((await scanner.quotes(['SPY','QQQ'])).SPY.source,'Robinhood');assert.deepEqual([calls,charts],[1,1]);
  now+=60000;await scanner.quotes(['QQQ']);assert.deepEqual([calls,charts],[2,2]);assert.equal(scanner.batchRetryAt-now,120000);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Finder launcher resolves trimmed file port, environment override, default and invalid values',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-launcher-'));
 try{fs.mkdirSync(path.join(dir,'scripts'));fs.copyFileSync('scripts/launch-port.mjs',path.join(dir,'scripts/launch-port.mjs'));
  const run=port=>spawnSync(process.execPath,['scripts/launch-port.mjs'],{cwd:dir,env:{...process.env,JARVIS_PORT:port},encoding:'utf8',windowsHide:true});
  assert.match(fs.readFileSync('Start JARVIS.command','utf8'),/node scripts\/launch-port\.mjs/);
  assert.equal(run('').stdout.trim(),'8765');fs.writeFileSync(path.join(dir,'jarvis-port.txt'),' 8766\r\n');assert.equal(run('').stdout.trim(),'8766');assert.equal(run('009000').stdout.trim(),'9000');
  for(const port of ['80','65536','abc','0x2000'])assert.notEqual(run(port).status,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
