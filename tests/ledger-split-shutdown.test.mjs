import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {AutoPaper} from '../modules/auto-paper.mjs';

const settings=()=>({});
const rows=()=>[{id:'a',state:'closed',closedAt:5},{id:'b',state:'active'},{id:'c',state:'missed fill'},{id:'d',state:'awaiting entry'},{id:'e',state:'unmeasurable'}];

test('Closed paper rows move to their own file and reload in the original order',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-split-')),file=path.join(dir,'auto-paper.json'),closedFile=path.join(dir,'auto-paper-closed.json');
 try{
  const original={protocol:'beta010-paper-v1',rows:rows(),reports:{},forwardSettings:{p:{risk:1}}};fs.writeFileSync(file,JSON.stringify(original));
  let ledger=new AutoPaper({dir,settings});assert.deepEqual(ledger.data,original);ledger.save();
  assert.deepEqual(JSON.parse(fs.readFileSync(file+'.before-closed-split','utf8')),original);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')).rows.map(r=>r.id),['b','d']);
  assert.deepEqual(new AutoPaper({dir,settings}).data,original);
  // An open row closes: only then is the closed file written again.
  ledger=new AutoPaper({dir,settings});ledger.save();const before=fs.statSync(closedFile).mtimeMs;
  ledger.data.rows[1].lastMark=7;ledger.save();assert.equal(fs.statSync(closedFile).mtimeMs,before);
  const hotBeforeClose=fs.readFileSync(file);
  Object.assign(ledger.data.rows[1],{state:'closed',closedAt:9});ledger.data.rows.push({id:'f',state:'awaiting entry'});ledger.save();
  assert.deepEqual(new AutoPaper({dir,settings}).data.rows.map(r=>[r.id,r.state]),[['a','closed'],['b','closed'],['c','missed fill'],['d','awaiting entry'],['e','unmeasurable'],['f','awaiting entry']]);
  // Crash after the closed file was written but before the open file: the closed copy wins, nothing is duplicated.
  fs.writeFileSync(file,hotBeforeClose);
  assert.deepEqual(new AutoPaper({dir,settings}).data.rows.map(r=>[r.id,r.state]),[['a','closed'],['b','closed'],['c','missed fill'],['d','awaiting entry'],['e','unmeasurable']]);
  // A missing closed file must stop the load instead of starting from an empty ledger.
  fs.renameSync(closedFile,closedFile+'.gone');assert.throws(()=>new AutoPaper({dir,settings}),/unreadable/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('The first closed paper row survives interruption before the open file is replaced',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-first-close-')),file=path.join(dir,'auto-paper.json');
 try{
  fs.writeFileSync(file,JSON.stringify({rows:[{id:'a',state:'active'},{id:'b',state:'awaiting entry'}]}));
  const ledger=new AutoPaper({dir,settings});ledger.save();const before=fs.readFileSync(file);
  Object.assign(ledger.data.rows[0],{state:'closed',closedAt:10,pnl:5});ledger.save();
  fs.writeFileSync(file,before);
  const recovered=new AutoPaper({dir,settings});assert.deepEqual(recovered.data.rows,ledger.data.rows);
  recovered.save();assert.deepEqual(new AutoPaper({dir,settings}).data.rows,ledger.data.rows);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Shutdown requires the local origin, then exits cleanly',async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-shutdown-')),port=18771,origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,JARVIS_PORT:String(port),JARVIS_DATA_DIR:dir,JARVIS_OFFLINE:'1'},stdio:'ignore',windowsHide:true});
 try{
  for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  // Page data: parts the browser already holds come back by name only, and the pieces rebuild the full view.
  const full=await (await fetch(origin+'/api/state')).json(),first=await (await fetch(origin+'/api/state?have=')).json();
  assert.deepEqual(first.unchanged,[]);const {stateHashes,unchanged,...everything}=first;assert.deepEqual(Object.keys(everything),Object.keys(full));
  const have=Object.entries(stateHashes).map(([key,hash])=>key==='rules'?key+':stale':key+':'+hash).join(',');
  const second=await (await fetch(origin+'/api/state?have='+encodeURIComponent(have))).json();
  assert.ok(second.unchanged.includes('settings')&&!('settings' in second)&&!second.unchanged.includes('rules'));assert.deepEqual(second.rules,full.rules);
  assert.deepEqual({...Object.fromEntries(second.unchanged.map(key=>[key,first[key]])),...second,stateHashes:undefined,unchanged:undefined,now:0},{...full,stateHashes:undefined,unchanged:undefined,now:0});
  // Reads share one view until something changes it.
  assert.equal((await (await fetch(origin+'/api/state')).json()).now,full.now);
  const post=headers=>fetch(origin+'/api/shutdown',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'});
  assert.equal((await post({Origin:'http://evil.example'})).status,403);
  assert.equal((await fetch(origin+'/api/health')).ok,true);
  const exited=once(child,'exit');assert.equal((await post({Origin:origin})).status,200);
  const [code]=await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(Error('server did not exit')),8000))]);
  assert.equal(code,0);
 }finally{child.kill();fs.rmSync(dir,{recursive:true,force:true});}
});
