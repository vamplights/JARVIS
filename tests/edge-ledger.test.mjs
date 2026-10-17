import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DEFAULTS,marketCosts} from '../engine.mjs';
import {observeSignalOutcomes} from '../signal-outcomes.mjs';
import {PaperLedger} from '../paper-ledger.mjs';
import {analyzeLedger,summarizeR,bootstrapMeanCI,pooledReplayStats,settingsProfile} from '../stats.mjs';
import {expectancyTable} from '../outcome-view.mjs';
const now=Date.parse('2026-10-12T14:00Z'),s=structuredClone(DEFAULTS),sig={id:'SPY:3:ema:1',symbol:'SPY',market:'stocks',strategy:'ema-cross',tf:3,dir:1,price:100,stop:99,target:102,rr:2,status:'CONFIRMED',regime:'Trending',adx:30,efficiency:.6,stopATR:1,confirmedAt:now,atr:1,warnings:[]};
const fresh=(price,time)=>({price,bid:price-.005,ask:price+.005,time});
function fixture(){return {data:{observations:[]},assets:{SPY:{base:60,bars:[],quote:fresh(100,now)}}};}
test('Passive ledger never backdates entry, freezes confirmed levels, and separates raw/confirmed cohorts',()=>{
 const {data,assets}=fixture();observeSignalOutcomes(data,[{...sig,status:'WATCH'}],assets,s,now);observeSignalOutcomes(data,[sig],assets,s,now);assert.equal(data.observations.length,2);assert.deepEqual(data.observations.map(r=>r.cohort),['raw','confirmed']);assert.equal(data.observations[1].entry,null);
 assets.SPY.quote=fresh(100,now+1000);observeSignalOutcomes(data,[{...sig,stop:90,target:110}],assets,s,now+1000);assert.equal(data.observations.length,2);assert.equal(data.observations[1].stop,99);assert.equal(data.observations[1].target,102);assert.equal(data.observations[1].entryAt,now+1000);assert.equal(data.observations[1].etHour,10);assert.equal(data.observations[1].adx,30);
});
test('Active ledger tracks MFE/MAE and expires at fresh quote after subtracting market costs in R',()=>{
 const {data,assets}=fixture();observeSignalOutcomes(data,[sig],assets,s,now);assets.SPY.quote=fresh(100,now+1000);observeSignalOutcomes(data,[sig],assets,s,now+1000);
 assets.SPY.quote=fresh(101.2,now+2000);observeSignalOutcomes(data,[],assets,s,now+2000);assets.SPY.quote=fresh(99.7,now+3000);observeSignalOutcomes(data,[],assets,s,now+3000);const row=data.observations[0];assert.ok(Math.abs(row.mfeR-1.2)<1e-9);assert.ok(Math.abs(row.maeR+.3)<1e-9);
 assets.SPY.quote=fresh(100.5,row.expiresAt);observeSignalOutcomes(data,[],assets,s,row.expiresAt);assert.equal(row.outcome,'expired');assert.equal(row.exit,100.5);assert.equal(row.realizedR,row.grossR-row.costR);assert.ok(row.realizedR<.5&&row.realizedR>.4);assert.equal(row.costs.feeBps,.3);
});
test('Expiry uses the final closed bar when quote is missing, and rejects stale or absent closing marks',()=>{
 for(const hasFinal of [true,false]){const {data,assets}=fixture();observeSignalOutcomes(data,[sig],assets,s,now);assets.SPY.quote=fresh(100,now+1000);observeSignalOutcomes(data,[],assets,s,now+1000);const row=data.observations[0];assets.SPY.quote=null;if(hasFinal)assets.SPY.bars=[{time:row.expiresAt/1000-60,open:100,high:100.4,low:99.8,close:100.2,complete:true}];observeSignalOutcomes(data,[],assets,s,row.expiresAt);assert.equal(row.outcome,hasFinal?'expired':'unmeasurable');assert.equal(Number.isFinite(row.realizedR),hasFinal);}
});
test('Ledger bar ambiguity is stop-first, gap exits use worse open, and future/unclosed bars do not resolve outcomes',()=>{
 const {data,assets}=fixture();observeSignalOutcomes(data,[sig],assets,s,now);assets.SPY.quote=fresh(100,now+1000);observeSignalOutcomes(data,[],assets,s,now+1000);assets.SPY.quote=null;
 const time=now/1000+60,bar={time,open:98.5,high:102.5,low:98,close:100,complete:false};assets.SPY.bars=[bar];observeSignalOutcomes(data,[],assets,s,now+120000);assert.equal(data.observations[0].closedAt,undefined);bar.complete=true;observeSignalOutcomes(data,[],assets,s,now+90000);assert.equal(data.observations[0].closedAt,undefined);observeSignalOutcomes(data,[],assets,s,now+120000);assert.equal(data.observations[0].exit,98.5);assert.equal(data.observations[0].ambiguous,true);assert.ok(data.observations[0].realizedR<-1.5);
});
test('Short stock outcomes use stock costs and direction-correct excursions',()=>{
 const {data,assets}=fixture(),short={...sig,dir:-1,stop:101,target:98};observeSignalOutcomes(data,[short],assets,s,now);assets.SPY.quote=fresh(100,now+1000);observeSignalOutcomes(data,[],assets,s,now+1000);assets.SPY.quote=fresh(98,now+2000);observeSignalOutcomes(data,[],assets,s,now+2000);assert.ok(data.observations[0].realizedR>1.9);assert.equal(data.observations[0].direction,'short');assert.equal(data.observations[0].mfeR,2);
});
test('Ungated raw detections and imported snapshots cannot become confirmed evidence',()=>{
 const {data,assets}=fixture();observeSignalOutcomes(data,[{...sig,paperEligible:false}],assets,s,now);assert.equal(data.observations.length,0);assets.SPY.snapshot=true;observeSignalOutcomes(data,[sig],assets,s,now);assert.equal(data.observations.length,0);
});
test('Headline excludes raw/capped/legacy/unmeasurable outcomes; grouping retains them separately',()=>{
 const profile=settingsProfile(s),row={...sig,protocol:'signal-r-v1',profile,tf:3,direction:'long',etHour:10,cohort:'confirmed',targetCapped:false,realizedR:1};const observations=[row,{...row,realizedR:-.5},{...row,cohort:'raw',realizedR:20},{...row,targetCapped:true,realizedR:30},{...row,protocol:undefined,realizedR:40},{...row,realizedR:null,outcome:'unmeasurable'}];const stats=analyzeLedger({observations},{profile,resamples:100});assert.equal(stats.headline.n,2);assert.equal(stats.headline.avgR,.25);assert.equal(stats.headline.profitFactor,2);assert.equal(stats.headline.sample,'insufficient sample');assert.equal(stats.groups.length,3);assert.equal(stats.unmeasurable,1);
 const another=analyzeLedger({observations:[row,{...row,profile:'other',realizedR:9}]},{profile});assert.equal(another.headline.n,1);
});
test('Bootstrap CI is deterministic, centered for symmetric samples, and does not certify small samples',()=>{
 const values=Array.from({length:100},(_,i)=>i%2?-1:1),ci=bootstrapMeanCI(values);assert.deepEqual(ci,bootstrapMeanCI(values));assert.ok(ci[0]<0&&ci[1]>0);assert.equal(summarizeR(values).sample,'sample threshold met');assert.equal(summarizeR([1]).ci95,null);assert.equal(summarizeR([]).avgR,null);
});
test('Pooled replay stats use unique OOS trade R across symbols, latest runs only, and never summed P/L',()=>{
 const trade={signalId:'same',time:1,segment:'out-of-sample',realizedR:1,pnl:1e9},base={kind:'walk-forward',version:'v',market:'stocks',symbol:'SPY',strategy:'ema-cross',tf:3};const runs=[{...base,completedAt:1,trades:[{...trade,realizedR:9}]},{...base,completedAt:2,trades:[trade,trade,{...trade,signalId:'dev',segment:'development',realizedR:99},{...trade,signalId:'cap',targetCapped:true}]},{...base,symbol:'QQQ',completedAt:2,trades:[{...trade,realizedR:-.5,pnl:-1}]}];const pooled=pooledReplayStats(runs,{version:'v'});assert.equal(pooled.length,1);assert.equal(pooled[0].n,2);assert.equal(pooled[0].avgR,.25);assert.equal('pnl'in pooled[0],false);assert.deepEqual(pooled[0].symbols,['QQQ','SPY']);
});
test('Completed zero-trade replay groups remain visible as insufficient samples',()=>{const groups=pooledReplayStats([{kind:'walk-forward',version:'v',market:'stocks',symbol:'SPY',strategy:'ema-cross',tf:3,completedAt:1,trades:[]}]);assert.equal(groups.length,1);assert.equal(groups[0].n,0);assert.equal(groups[0].avgR,null);assert.equal(groups[0].sample,'insufficient sample');});
test('Loading an enabled historical paper ledger disables new paper positions and preserves records',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-passive-'));try{fs.writeFileSync(path.join(dir,'signal-paper-ledger.json'),JSON.stringify({enabled:true,signals:[],trades:[],universe:[]}));const p=new PaperLedger(dir);assert.equal(p.data.enabled,false);const {assets}=fixture();p.observe([sig],assets,{contracts:[]},s,now);assets.SPY.quote=fresh(100,now+1000);p.observe([sig],assets,{contracts:[]},s,now+1000);assert.equal(p.data.trades.length,0);assert.equal(p.data.observations.length,1);assert.equal(new PaperLedger(dir).data.observations.length,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Statistics UI shows R/CI/cohorts and retains no legacy paper-settings controls',()=>{
 const html=expectancyTable([{market:'stocks',strategy:'<bad>',tf:3,direction:'long',regime:'Trending',etHour:10,cohort:'raw',targetCapped:true,n:2,winRate:.5,avgR:-.1,profitFactor:.8,ci95:[-.5,.3],sample:'insufficient sample'}]);assert.match(html,/Average R after costs/);assert.match(html,/95% bootstrap CI/);assert.match(html,/raw/);assert.match(html,/capped/);assert.match(html,/&lt;bad&gt;/);const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');assert.doesNotMatch(app,/paper-settings|\/api\/paper(?:['"/])|Net R:R/);assert.match(app,/strategyFrames\./);assert.match(app,/costs\./);assert.match(app,/s.netRewardRisk/);
});
test('Standalone ledger analyzer matches the shared statistics module',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-analysis-'));try{const file=path.join(dir,'ledger.json'),data={observations:[]};fs.writeFileSync(file,JSON.stringify(data));const script=fileURLToPath(new URL('../scripts/analyze-ledger.mjs',import.meta.url)),r=spawnSync(process.execPath,[script,file,'--json'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),analyzeLedger(data));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
