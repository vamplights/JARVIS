import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {createRishiPaper} from '../rishi-paper-core.mjs';import {RishiForward,confirmedForwardEligible} from '../rishi-forward.mjs';import {DEFAULTS,migrateSettings} from '../engine.mjs';import {settingsProfile} from '../stats.mjs';import {collectModelSamples} from '../trend-model.mjs';import {ManualOptionSandbox} from '../manual-sandbox.mjs';
const now=Date.parse('2026-10-13T14:00:30Z'),config=()=>({...structuredClone(DEFAULTS),forwardPaperVersion:1,forwardExitMode:'2R',includeFallbackTraining:true});
const signal=(extra={})=>({id:'live',symbol:'SPY',market:'stocks',strategy:'ema-cross',strategies:['ema-cross'],tf:1,dir:1,price:100,stop:99,target:100.3,atr:1,status:'CONFIRMED',confirmedAt:now-30000,source:'test',score:80,rvol:2,adx:30,efficiency:.6,extension:.1,stopATR:1,netRR:.2,trendAlignment:true,higherAlignment:true,profitEstimate:{probability:.01,status:'ready'},...extra});
const bar=(time,o=100,h=100.3,l=99.7,c=100)=>({time:time/1000,open:o,high:h,low:l,close:c,volume:1,complete:true});
const assets=(bars=[],extra={})=>({SPY:{symbol:'SPY',market:'stocks',base:60,source:'test',bars,quote:{price:100,time:now+1000},...extra}});

test('The port retains Rishi’s algorithm body verbatim apart from module dependency/export wiring',()=>{
 const original=fs.readFileSync(new URL('../docs/rishi-paper-original.txt',import.meta.url),'utf8'),body=original.split(/\r?\n/).filter(l=>!l.startsWith('import ')).join('\n').replaceAll('export function ','function '),port=fs.readFileSync(new URL('../rishi-paper-core.mjs',import.meta.url),'utf8');assert.ok(port.replaceAll('\r\n','\n').includes(body.trimEnd()));
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');assert.ok(!app.includes('autoPaperPolicy'));assert.ok(!app.includes("field('Auto-paper minimum profit probability"));
});
test('Original Rishi core matches its long/short stop-first fixtures and 3000-record cap',()=>{
 const t=Date.parse('2026-10-09T12:00Z'),state={paper:[],settings:{backtest:{exitMode:'2R',cryptoSlippagePct:0,cryptoSpreadPct:0}},crypto:{BTC:{series:{'1m':{candles:[]}}}},stocks:{}},core=createRishiPaper({S:state,A:{save(){}},newsFeatures:()=>({}),featuresOf:()=>({}),predict:()=>({p:.5}),cryptoSize:()=>({ok:true,feeToR:0}),marketSession:()=>({phase:'regular',closeMs:t+8*3600000})});
 const sig=(id,direction,stop)=>({id,key:id,symbol:'BTC',market:'crypto',direction,stop,entryLow:100,entryHigh:100,tf:'5m'});core.recordPaper(sig('a','bullish',99),t+1000);core.recordPaper(sig('b','bearish',101),t+1000);state.crypto.BTC.series['1m'].candles=[{t,o:100,h:100.5,l:99.8,c:100.4},{t:t+60000,o:100.4,h:102.2,l:100.3,c:102}];core.resolvePaper(t+600000);assert.equal(state.paper[0].r,2);assert.equal(state.paper[1].r,-1);assert.equal(core.paperStats().closed,2);
 for(let i=0;i<3001;i++)core.recordPaper(sig('x'+i,'bullish',99),t);assert.equal(state.paper.length,3000);
});
test('Every fresh confirmed setup qualifies independently of confidence, timeframe and account caps',()=>{
 const s=config();assert.equal(confirmedForwardEligible(signal(),s,now),true);for(const patch of [{status:'WATCH'},{status:'SETUP FORMING'},{status:'STALE'},{legacyProfile:true},{replay:true},{demo:true},{conflicted:true},{inspectionOnly:true},{confirmedAt:now+1},{confirmedAt:now-135001}])assert.equal(confirmedForwardEligible(signal(patch),s,now),false,JSON.stringify(patch));
 const p=new RishiForward({dir:null,settings:()=>({...s,capital:1,maxTrades:1})});p.observe(Array.from({length:4},(_,i)=>signal({id:'s'+i})),assets(),now);assert.equal(p.data.rows.length,4);assert.ok(p.data.rows.every(r=>r.probability===.01&&r.forwardCore.status==='open'));assert.equal(p.data.rows.filter(r=>r.entryAt).length,0);
});
test('Adapter keeps closed-candle/no-backdated-fill integrity and learns the original net-R result',()=>{
 const s=config(),p=new RishiForward({dir:null,settings:()=>s}),sig=signal();p.observe([sig],assets(),now);p.observe([sig],assets([bar(now-30000,80,110,70,100)]),now+60000);assert.equal(p.data.rows.length,1);assert.equal(p.data.rows[0].entryAt,undefined);
 const after=bar(now+30000,100,103,98,102);p.observe([],assets([after,{...bar(now+90000),complete:false}]),now+90000);const row=p.data.rows[0];assert.equal(row.entry,100);assert.equal(row.entryAt,now+30000);assert.equal(row.exit,99);assert.equal(row.target,102);assert.equal(row.exitReason,'stop');assert.ok(row.realizedR< -1);assert.equal(row.pnl,row.realizedR*s.risk);assert.equal(row.protocol,'signal-r-v1');assert.equal(collectModelSamples([],p.data.rows,row.profile,true).length,1);
});
test('Stock regular/early closes and four-hour crypto exits match Rishi’s timing',()=>{
 const t=Date.parse('2026-11-27T17:00Z'),s=config(),p=new RishiForward({dir:null,settings:()=>s});p.observe([signal({confirmedAt:t})],assets(),t);assert.equal(p.data.rows[0].expiresAt,Date.parse('2026-11-27T18:00Z'));
 const closed=Date.parse('2026-10-17T14:00Z');assert.equal(confirmedForwardEligible(signal({confirmedAt:closed}),s,closed),false);
 const crypto=new RishiForward({dir:null,settings:()=>s}),at=now-30000;crypto.observe([signal({market:'crypto',confirmedAt:at})],assets(),at);const expiry=at+4*3600000;crypto.observe([],assets([bar(at),bar(expiry-60000,100,100.8,99.8,100.5),bar(expiry)],{market:'crypto'}),expiry+60000);assert.equal(crypto.data.rows[0].exitReason,'time exit');assert.equal(crypto.data.rows[0].exit,100.5);assert.equal(crypto.data.rows[0].closedAt,expiry);
});
test('Per-market costs, frozen exit selection and unresolved source mismatches remain explicit',()=>{
 let s=config();const p=new RishiForward({dir:null,settings:()=>s});p.observe([signal({market:'crypto'})],assets(),now);s={...s,forwardExitMode:'1.5R',costs:{...s.costs,crypto:{feeBps:0,slippageBps:0,spreadBps:0}}};p.observe([],assets([bar(now+30000,100,103,99.5,102)],{market:'crypto'}),now+90000);assert.equal(p.data.rows[0].target,102);assert.ok(p.data.rows[0].realizedR<2);assert.equal(p.data.rows[0].costs.feeBps,60);
 const wrong=new RishiForward({dir:null,settings:config});wrong.observe([signal()],assets(),now);wrong.observe([],assets([bar(now+30000,100,103,98,102)],{source:'different'}),now+90000);assert.equal(wrong.data.rows[0].entryAt,undefined);wrong.observe([],assets([]),now+3*86400000);assert.equal(wrong.data.rows[0].state,'unmeasurable');
});
test('New policy has a separate cohort; old hashes and manual simulations are preserved by adoption',()=>{
 const old=structuredClone(DEFAULTS);delete old.forwardPaperVersion;delete old.forwardExitMode;assert.equal(settingsProfile(migrateSettings(old)),settingsProfile(old));assert.notEqual(settingsProfile(config()),settingsProfile(old));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-rishi-adopt-'));try{const state={settings:old,journal:[{id:'keep',notes:'unchanged'}]};fs.writeFileSync(path.join(dir,'journal-settings.json'),JSON.stringify(state));const sandbox=new ManualOptionSandbox(dir);sandbox.submit(signal({id:'manual'}),{},assets(),config(),now);const bytes=fs.readFileSync(path.join(dir,'manual-option-simulations.json'));const script=fileURLToPath(new URL('../scripts/adopt-rishi-forward.mjs',import.meta.url));execFileSync(process.execPath,[script,dir]);const adopted=JSON.parse(fs.readFileSync(path.join(dir,'journal-settings.json')));assert.deepEqual(adopted.journal,state.journal);assert.deepEqual(adopted.settings,{...old,forwardPaperVersion:1,forwardExitMode:'2R'});assert.deepEqual(fs.readFileSync(path.join(dir,'manual-option-simulations.json')),bytes);assert.equal(new ManualOptionSandbox(dir).data.trades.length,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Crypto minute refresh is throttled, does not overlap and uses the existing public history collector',async()=>{
 const p=new RishiForward({dir:null,settings:config});p.observe([signal({market:'crypto'})],assets(),now);const calls=[],history={download:async(...args)=>calls.push(args)};await p.refreshMinuteData(history,now);await p.refreshMinuteData(history,now+1000);assert.equal(calls.length,1);assert.deepEqual(calls[0],['SPY','crypto',1,{base:60}]);
});

test('Forward rows survive restart with frozen settings and dedupe; manual ledger stays separate',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-forward-restart-'));try{
  let s=config();const p=new RishiForward({dir,settings:()=>s});p.observe([signal()],assets(),now);const disk=JSON.parse(fs.readFileSync(path.join(dir,'auto-paper.json')));assert.equal(disk.rows[0].settings,undefined);assert.equal(disk.forwardSettings[disk.rows[0].profile].forwardExitMode,'2R');
  const restored=new RishiForward({dir,settings:()=>s});restored.observe([signal()],assets(),now+1000);assert.equal(restored.data.rows.length,1);s={...s,forwardExitMode:'1.5R'};restored.observe([],assets([bar(now+30000,100,103,99.5,102)]),now+90000);assert.equal(restored.data.rows[0].target,102);assert.equal(restored.data.rows[0].state,'closed');const again=new RishiForward({dir,settings:()=>s});assert.equal(again.data.rows[0].realizedR,restored.data.rows[0].realizedR);assert.equal(again.data.rows[0].settings.forwardExitMode,'2R');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
