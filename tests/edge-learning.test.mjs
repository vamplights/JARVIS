import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DEFAULTS} from '../engine.mjs';
import {completedSessions,SessionLearning} from '../intelligence.mjs';
import {walkForward} from '../walk-forward.mjs';
const day=86400,start=Math.floor(Date.now()/86400000)*day-25*day;
const sessionBars=(begin,base=300,count=288)=>Array.from({length:count},(_,i)=>({time:begin+i*base,open:100,high:101,low:99,close:100,volume:1,complete:true}));
test('Learning selects the newest 20 full sessions, excludes unfinished days and refuses gaps',()=>{
 const all=Array.from({length:25},(_,i)=>sessionBars(start+i*day)).flat(),archive={market:'crypto',base:300,bars:all},sessions=completedSessions(archive,DEFAULTS);assert.equal(sessions.length,20);assert.equal(sessions[0].bars[0].time,start+5*day);
 const gap={...archive,bars:all.filter(b=>b.time!==start+24*day+300)};assert.equal(completedSessions(gap,DEFAULTS).at(-1).bars[0].time,start+23*day);
 const unfinished={...archive,bars:all.map(b=>b.time>=start+24*day?{...b,complete:false}:b)};assert.equal(completedSessions(unfinished,DEFAULTS).at(-1).bars[0].time,start+23*day);
});
test('Stock archive completeness follows regular hours, holidays and published early closes',()=>{
 const now=Date.parse('2026-11-29T00:00Z'),begin=Date.parse('2026-11-27T14:30Z')/1000,archive={market:'stocks',base:60,bars:sessionBars(begin,60,210)};assert.equal(completedSessions(archive,DEFAULTS,now).length,1);assert.equal(completedSessions({...archive,bars:archive.bars.slice(1)},DEFAULTS,now).length,0);
 const holiday=Date.parse('2026-11-26T14:30Z')/1000;assert.equal(completedSessions({...archive,bars:sessionBars(holiday,60,390)},DEFAULTS,now).length,0);
});
test('Automatic learning uses on-disk archives even without a live asset, with fixed walk-forward settings',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-learning-edge-'));try{
  fs.mkdirSync(path.join(dir,'sessions'));const archive={symbol:'BTC-USD',market:'crypto',base:300,bars:Array.from({length:25},(_,i)=>sessionBars(start+i*day)).flat()};fs.writeFileSync(path.join(dir,'sessions','BTC-USD.json'),JSON.stringify(archive));
  const settings={...structuredClone(DEFAULTS),strategies:['ema-cross'],crypto:['BTC-USD']},inputs=[];
  const replay=async input=>{inputs.push(input);return {kind:'walk-forward',folds:[],outOfSample:{count:1},trades:[{market:'crypto',signalId:'a',time:1,segment:'out-of-sample',realizedR:.4},{market:'crypto',signalId:'dev',time:0,segment:'development',realizedR:20}]};};
  const learning=new SessionLearning({dir,settings:()=>settings,assets:()=>({}),news:{cache:{}},replay});await learning.tick();assert.equal(inputs.length,1);assert.equal(inputs[0].mode,'walk-forward');assert.equal(inputs[0].bars.length,20*288);assert.ok(inputs[0].bars.length>1800);assert.deepEqual(inputs[0].settings,settings);assert.equal(learning.records.runs[0].sessions.length,20);assert.equal(learning.records.runs[0].trades.length,1);assert.equal(learning.pooled()[0].avgR,.4);await learning.tick();assert.equal(inputs.length,1);
  const restored=new SessionLearning({dir,settings:()=>settings,assets:()=>({}),news:{cache:{}},replay});assert.equal(restored.pooled()[0].n,1);assert.equal(restored.summary('BTC-USD').pooled[0].sample,'insufficient sample');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Walk-forward records after-cost expectancy R and reuses causal evaluations without altering results',()=>{
 const begin=start+day,bars=Array.from({length:420},(_,i)=>{const c=100+Math.sin(i/8)*2,o=i?100+Math.sin((i-1)/8)*2:c;return {time:begin+i*300,open:o,close:c,high:Math.max(c,o)+.2,low:Math.min(c,o)-.2,volume:100};}),settings={...structuredClone(DEFAULTS),costs:{stocks:{feeBps:0,slippageBps:0,spreadBps:0},crypto:{feeBps:0,slippageBps:0,spreadBps:0}},cryptoAfterHours:false,filters:{confirmation:false,trend:false,volume:false,chop:false,vwap:false,market:false,spread:false},minScore:0,minRR:.1,maxExtension:20,maxStopATR:20,maxTrades:100},input={symbol:'BTC-USD',market:'crypto',base:300,tf:5,bars,settings,strategy:'ema-cross',exitR:2},r=walkForward(input);assert.ok(r.trades.length);assert.equal(r.expectancyR.n,r.trades.length);assert.equal(r.expectancyR.avgR,r.trades.reduce((n,t)=>n+t.realizedR,0)/r.trades.length);for(let i=1;i<r.folds.length;i++)assert.ok(r.folds[i].testStart>=r.folds[i-1].testEnd);assert.deepEqual(r.settings,settings);assert.ok(r.trades.every(t=>t.segment==='out-of-sample'));
});
