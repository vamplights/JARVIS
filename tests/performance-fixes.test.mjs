import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {realisticAccount} from '../auto-paper.mjs';import {saveDeferred,flushDeferred} from '../deferred-save.mjs';import {PaperLedger} from '../paper-ledger.mjs';import {Scanner} from '../scanner.mjs';
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-perf-'));

test('Cash reserved by a trade that could never be measured is released at its expiry',()=>{
 const t0=Date.parse('2026-10-13T14:00:00Z'),costs={feeBps:0,slippageBps:0,spreadBps:0},base={market:'stocks',entry:100,initialStop:99,costs,symbol:'SPY'};
 const rows=[{...base,id:'a',entryAt:t0,state:'unmeasurable',expiresAt:t0+3600000},{...base,id:'b',entryAt:t0+7200000,state:'closed',closedAt:t0+7500000,realizedR:1}];
 const settings={capital:1000,risk:100,riskPercent:10,maxLosses:3,maxTrades:10,timezone:'America/New_York'};
 const account=realisticAccount(rows,settings);
 assert.deepEqual(account.trades.map(r=>r.id),['a','b']);assert.equal(account.skipped.length,0);
});
test('Open trades keep their cash reserved until they close',()=>{
 const t0=Date.parse('2026-10-13T14:00:00Z'),costs={feeBps:0,slippageBps:0,spreadBps:0},base={market:'stocks',entry:100,initialStop:99,costs,symbol:'SPY'};
 const rows=[{...base,id:'a',entryAt:t0,state:'active',expiresAt:t0+3600000},{...base,id:'b',entryAt:t0+7200000,state:'active',expiresAt:t0+9000000}];
 const account=realisticAccount(rows,{capital:1000,risk:100,riskPercent:10,maxLosses:3,maxTrades:10,timezone:'America/New_York'});
 assert.deepEqual(account.trades.map(r=>r.id),['a']);assert.equal(account.skipped[0].reason,'Cash limit');
});
test('Deferred saves coalesce within the interval and flush on demand',async()=>{
 let writes=0;const owner={save(){writes++;}};
 saveDeferred(owner,60000);assert.equal(writes,1);saveDeferred(owner,60000);saveDeferred(owner,60000);assert.equal(writes,1);assert.equal(owner.dirty,true);
 flushDeferred(owner);assert.equal(writes,2);flushDeferred(owner);assert.equal(writes,2);
});
test('Paper ledger observation writes are coalesced but explicit saves are immediate and the flush persists the latest state',()=>{
 const dir=tmp(),ledger=new PaperLedger(dir);let writes=0;const realSave=ledger.save.bind(ledger);ledger.save=()=>{writes++;realSave();};
 ledger.data.marker=1;ledger.saveSoon();assert.equal(writes,1);ledger.data.marker=2;ledger.saveSoon();ledger.saveSoon();assert.equal(writes,1);
 assert.equal(JSON.parse(fs.readFileSync(ledger.file,'utf8')).marker,1);ledger.flush();assert.equal(writes,2);assert.equal(JSON.parse(fs.readFileSync(ledger.file,'utf8')).marker,2);
});
test('Dashboard scanner snapshot leaves out bulk news and archives that no view reads; the full snapshot keeps them',()=>{
 const dir=tmp(),settings=()=>({scanner:{enabled:false},stocks:['SPY'],crypto:[],inPlay:{enabled:false}});
 const scanner=new Scanner({dir,settings,history:{status:{},dataset:()=>null},context:()=>({}),news:{cache:{}},profile:()=>'test',now:()=>Date.parse('2026-10-13T14:00:00Z')});
 scanner.data.feedNews={SPY:{items:[{title:'x'}]}};scanner.data.inPlayArchive={'2026-10-12':{}};scanner.data.lists=[];
 const light=scanner.snapshot({light:true}),full=scanner.snapshot();
 for(const k of ['feedNews','inPlayArchive','lists'])assert.ok(!(k in light)&&k in full,k);
 assert.ok('ideas' in light&&'trackRecord' in light);
});
test('The local error log rotates instead of growing without bound',async()=>{
 const {LocalCycle}=await import('../local-cycle.mjs'),{DEFAULTS}=await import('../engine.mjs'),dir=tmp(),log=path.join(dir,'local-errors.log');
 fs.writeFileSync(log,'x'.repeat(1048577));
 const cycle=new LocalCycle({dir,settings:()=>structuredClone(DEFAULTS),history:{},scanner:{data:{}},paper:{},review:{},resolve:()=>{}});
 cycle.error('probe',new Error('boom'));
 assert.ok(fs.existsSync(log+'.old'));assert.ok(fs.statSync(log).size<1000);assert.match(fs.readFileSync(log,'utf8'),/boom/);
});
test('Settings cohorts get plain-English labels: dates, trade counts and what changed',async()=>{
 const {cohortSummaries}=await import('../cohort-labels.mjs'),day=Date.parse('2026-10-14T15:00:00Z'),next=Date.parse('2026-10-15T15:00:00Z');
 const rows=[{profile:'aaa',observedAt:day,settings:{maxTrades:3,stocks:['SPY']}},{profile:'aaa',observedAt:day+1000,settings:{maxTrades:3,stocks:['SPY']}},{profile:'bbb',observedAt:next,settings:{maxTrades:5,stocks:['SPY']}}];
 const out=cohortSummaries(rows,{});
 assert.deepEqual(out.map(c=>c.profile),['bbb','aaa']);
 assert.equal(out[1].label,'Oct 14 · 2 signals · earliest setup');
 assert.equal(out[0].label,'Oct 15 · 1 signal · changed: max trades per day');
});
test('Paper snapshot rows leave out internal simulation data the page never shows',async()=>{
 const {AutoPaper}=await import('../auto-paper.mjs'),{DEFAULTS}=await import('../engine.mjs'),{settingsProfile}=await import('../stats.mjs');
 const settings=structuredClone(DEFAULTS),paper=new AutoPaper({dir:null,settings:()=>settings}),profile=settingsProfile(settings);
 paper.data.rows.push({id:'x',profile,exitStyle:'fixed',market:'stocks',horizon:'intraday',symbol:'SPY',state:'closed',closedAt:Date.now(),realizedR:1,pnl:10,entryAt:Date.now()-1000,entry:100,initialStop:99,costs:{feeBps:0,slippageBps:0,spreadBps:0},settings,forwardCore:{big:1},features:{a:1}});
 const view=paper.snapshot({profile});assert.equal(view.rows.length,1);for(const k of ['settings','forwardCore','features'])assert.ok(!(k in view.rows[0]),k);
});
test('Closed trades table shows the newest 100 with a show-all toggle; win rates still use every trade',async()=>{
 const {paperPanel}=await import('../beta-view.mjs'),rows=Array.from({length:150},(_,i)=>({id:'r'+i,symbol:'SPY',strategy:'ema-cross',dir:1,closedAt:1e12+i,pnl:1,realizedR:1,entry:1,exit:2,market:'stocks'}));
 const d={rows,open:[],buckets:{},history:[],curve:[],cohorts:[],note:'',realistic:{skipped:[]},n:150,missedFills:0,unmeasurable:0};
 const few=paperPanel(d,{market:'stocks'}),all=paperPanel(d,{market:'stocks',showAllClosed:true});
 assert.equal((few.match(/<tr><td>SPY/g)||[]).length,100);assert.match(few,/data-paper-closed-toggle="all"[^>]*>Show all 150/);
 assert.equal((all.match(/<tr><td>SPY/g)||[]).length,150);assert.match(all,/data-paper-closed-toggle="few"/);
 assert.match(few,/150 closed/);
});
