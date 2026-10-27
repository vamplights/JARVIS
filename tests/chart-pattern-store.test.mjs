import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ChartPatternStore} from '../chart-pattern-store.mjs';
import {patternOverlay,patternPanel} from '../chart-pattern-view.mjs';
import {PATTERN_DEFAULTS,detectPatterns} from '../chart-patterns.mjs';
import {evaluate,DEFAULTS} from '../engine.mjs';
import {settingsProfile} from '../stats.mjs';
import {AutoPaper} from '../auto-paper.mjs';
import {S,T,candles,boundary} from './chart-pattern-fixtures.mjs';
function tempStore(){const dir=fs.mkdtempSync(path.resolve('work/chart-pattern-store-test-'));return {dir,store:new ChartPatternStore(dir)};}
const fixture=()=>({kind:'rectangle',name:'Rectangle',dir:1,anchorTime:T,startTime:T,knownAt:(T+300)*1000,upper:102,lower:98,confirmationLevel:102,invalidationLevel:98,points:[],lines:[{t1:T,t2:T+600,p1:102,p2:102,role:'resistance'}],evidence:[],trigger:false});
test('OFF skips work and preserves history; toggles, settings and identities survive restarts',()=>{const {dir,store}=tempStore();try{
 const b=boundary(0,0),now=(b.at(-1).time+300)*1000,asset={symbol:'TEST',market:'crypto',source:'Fixture',base:300,bars:b,replay:true};assert.equal(store.evaluate(asset,5,now).recordCount,0);
 store.configure({...S,enabled:true,frames:[5]});store.evaluate(asset,5,now,10000);assert.ok(store.records.size);const ids=[...store.records.keys()];store.configure({enabled:false});assert.deepEqual(store.evaluate(asset,5,now).records,[]);assert.deepEqual([...store.records.keys()],ids);
 const restart=new ChartPatternStore(dir);assert.equal(restart.data.settings.enabled,false);restart.configure({enabled:true});restart.evaluate(asset,5,now,10000);assert.deepEqual([...restart.records.keys()].sort(),ids.sort());
}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('Replay equals incremental feed; future extensions never rewrite original confirmation',()=>{const first=tempStore(),second=tempStore();try{
 for(const st of [first.store,second.store])st.configure({...S,enabled:true,frames:[5]});
 const b=boundary(0,.05),last={...b.at(-1),time:b.at(-1).time+300,open:103,close:104,high:104.2,low:102.8};b.push(last);const asset={symbol:'TEST',market:'crypto',source:'Fixture',base:300,replay:true};
 first.store.evaluate({...asset,bars:b},5,(last.time+300)*1000,10000);for(let i=17;i<=b.length;i++)second.store.evaluate({...asset,bars:b.slice(0,i)},5,(b[i-1].time+300)*1000,10000);
 assert.deepEqual(first.store.history().records,second.store.history().records);const record=first.store.history().records.find(r=>r.confirmedAt&&r.kind==='ascending-triangle');assert.ok(record);
 const frozen=structuredClone(record.confirmedGeometry),at=record.confirmedAt,future=[...b,...candles([110,111,112],last.time+300)];first.store.evaluate({...asset,bars:future},5,(future.at(-1).time+300)*1000,10000);const updated=first.store.records.get(record.id);assert.deepEqual(updated.confirmedGeometry,frozen);assert.equal(updated.confirmedAt,at);
 assert.deepEqual(detectPatterns(b,{settings:S}),detectPatterns(future.slice(0,b.length),{settings:S}));
}finally{for(const o of [first,second])fs.rmSync(o.dir,{recursive:true,force:true});}});
test('SVG uses candle coordinates across zoom, pan, gaps and offscreen geometry',()=>{
 const r={...fixture(),name:'<unsafe>',points:[{time:T+300,price:100,knownTime:T+600}]},bars=candles([100,101,102]),svg=patternOverlay(r,bars,i=>10+i*20,v=>200-v);assert.match(svg,/x1="10".*x2="50"/);assert.match(svg,/cx="30" cy="100"/);assert.match(svg,/&lt;unsafe&gt;/);
 const zoom=patternOverlay(r,bars.slice(1),i=>10+i*40,v=>200-v);assert.match(zoom,/x1="10".*x2="50"/);assert.match(zoom,/cx="10"/);
 assert.equal(patternOverlay({...r,lines:[{t1:T-600,t2:T-300,p1:1,p2:2}],points:[],confirmationLevel:null,invalidationLevel:null},bars,i=>i,v=>v).includes('<line'),false);
 const gapBars=[bars[0],{...bars[1],time:T+86400}];assert.match(patternOverlay({...r,points:[{time:T+86400,price:100}],lines:[]},gapBars,i=>i*10,v=>v),/cx="10"/);
});
test('UI OFF hides live results and offers independent settings and retained history',()=>{const view={enabled:false,settings:PATTERN_DEFAULTS,recordCount:4,records:[fixture()]};const html=patternPanel(view,'TEST',5);assert.match(html,/OFF/);assert.match(html,/4 historical records preserved/);assert.doesNotMatch(html,/pattern-finding/);assert.match(html,/pattern-settings-form/);assert.match(patternPanel({...view,enabled:true,records:[{...fixture(),symbol:'TEST',tf:5,id:'one',status:'forming'}]},'TEST',5),/Waiting for a qualifying completed candle/);});
test('A pending head-and-shoulders keeps its head invalidation and confirms at its neckline',()=>{const {dir,store}=tempStore();try{
 const bars=candles(Array(22).fill(100)),r={...fixture(),id:'head',symbol:'TEST',tf:5,source:'Fixture',kind:'head-shoulders',dir:-1,upper:105,lower:98,confirmationLevel:98,invalidationLevel:105,status:'forming',firstKnownAt:bars[19].time*1000,lastEvaluatedCandle:bars[19].time,lastCompletedCandle:bars[19].time,observations:[],rules:S,lines:[{t1:T,t2:bars[19].time,p1:98,p2:98,role:'neckline'},{t1:T,t2:bars[19].time,p1:105,p2:105,role:'invalidation'}]};store.remember(r);
 store.step(bars.slice(0,21),{symbol:'TEST',market:'crypto'},5,'Fixture',S,true,'historical');assert.equal(store.records.get('head').status,'forming');Object.assign(bars[21],{open:100,close:97,high:100.2,low:96.8});store.step(bars,{symbol:'TEST',market:'crypto'},5,'Fixture',S,true,'historical');const confirmed=store.records.get('head');assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.invalidationLevel,105);assert.equal(confirmed.confirmationLevel,98);
}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('Pending MA/VWAP retests and zone rejections wait for their recorded resumption level',()=>{for(const kind of ['bull-ma-retest','vwap-pullback','support-bounce']){const {dir,store}=tempStore();try{
 const bars=candles(Array(22).fill(100)),r={...fixture(),id:kind,symbol:'TEST',tf:5,source:'Fixture',kind,upper:101,lower:99,confirmationLevel:102,status:'forming',firstKnownAt:bars[19].time*1000,lastEvaluatedCandle:bars[19].time,lastCompletedCandle:bars[19].time,observations:[],rules:S};store.remember(r);Object.assign(bars[20],{close:101.5,high:101.6});store.step(bars.slice(0,21),{symbol:'TEST',market:'crypto'},5,'Fixture',S,true,'historical');assert.equal(store.records.get(kind).status,'forming');Object.assign(bars[21],{open:101.5,close:103,high:103.1,low:101.3});store.step(bars,{symbol:'TEST',market:'crypto'},5,'Fixture',S,true,'historical');assert.equal(store.records.get(kind).status,'confirmed');assert.equal(store.records.get(kind).confirmationLevel,102);
}finally{fs.rmSync(dir,{recursive:true,force:true});}}});
test('Analysis leaves strategy output, cohort, settings and input OHLCV untouched',()=>{const {dir,store}=tempStore();try{
 const b=boundary(0,.05),settings=structuredClone(DEFAULTS),asset={symbol:'BTC-USD',market:'crypto',source:'Fixture',base:300,bars:b,replay:true},input={...asset,tf:5,settings,now:(b.at(-1).time+300)*1000},before=evaluate(input),clone=structuredClone(input),profile=settingsProfile(settings);
 store.configure({...S,enabled:true,frames:[5]});store.evaluate(asset,5,input.now,10000);assert.deepEqual(evaluate(input),before);store.configure({enabled:false});assert.deepEqual(evaluate(input),before);assert.deepEqual(input,clone);assert.equal(settingsProfile(settings),profile);assert.deepEqual(fs.readdirSync(dir),['chart-pattern-analysis.json']);
 const code=fs.readFileSync(new URL('../chart-pattern-store.mjs',import.meta.url),'utf8');assert.doesNotMatch(code,/paper\.observe|learning\.observe|recordTopPickAlert|newlyDetected\.push|fetch\(/);
}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('Corrupt history fails closed and preserves original bytes',()=>{const {dir}=tempStore();try{const file=path.join(dir,'chart-pattern-analysis.json');fs.writeFileSync(file,'broken');const store=new ChartPatternStore(dir);assert.equal(store.data.settings.enabled,false);assert.ok(store.error);assert.throws(()=>store.configure({enabled:true}));assert.equal(fs.readFileSync(file,'utf8'),'broken');}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('An unfinished actual breakout stays provisional, then confirms only on close; stale live data skips work',()=>{const {dir,store}=tempStore();try{
 store.configure({...S,enabled:true,frames:[5]});const bars=boundary(0,.05),a={symbol:'TEST',source:'Fixture',market:'crypto',base:300,replay:true};store.evaluate({...a,bars},5,(bars.at(-1).time+300)*1000,10000);
 const c={...bars.at(-1),time:bars.at(-1).time+300,open:103,close:104,high:104.2,low:102.9,complete:false};bars.push(c);store.evaluate({...a,bars},5,(c.time+100)*1000,10000);
 assert.ok([...store.records.values()].some(r=>r.kind==='ascending-triangle'&&r.status==='provisional'));assert.equal([...store.records.values()].some(r=>r.confirmedCandle===c.time),false);
 c.complete=true;store.evaluate({...a,bars},5,(c.time+300)*1000,10000);assert.ok([...store.records.values()].some(r=>r.kind==='ascending-triangle'&&r.confirmedCandle===c.time));
 const retained=structuredClone(store.history());store.evaluate({...a,bars,replay:false,quote:{time:0,price:100}},5,(c.time+300)*1000,10000);assert.deepEqual(store.history(),retained);
 store.configure({breakoutATR:.2});store.evaluate({...a,bars},5,(c.time+300)*1000,10000);for(const r of retained.records.filter(r=>r.confirmedAt)){assert.deepEqual(store.records.get(r.id).confirmedGeometry,r.confirmedGeometry);assert.equal(store.records.get(r.id).confirmedAt,r.confirmedAt);}
}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('Required volume cannot confirm using synthetic volume or ordinary volume without expansion',()=>{for(const synthetic of [false,true]){const {dir,store}=tempStore();try{
 store.configure({...S,enabled:true,frames:[5],requireVolume:true});const bars=boundary(0,.05);bars.push({...bars.at(-1),time:bars.at(-1).time+300,open:103,close:104,high:104.2,low:102.9,syntheticVolume:synthetic});store.evaluate({symbol:'TEST',source:'Fixture',market:'crypto',base:300,bars,replay:true},5,(bars.at(-1).time+300)*1000,10000);assert.equal([...store.records.values()].some(r=>r.confirmedAt),false);
}finally{fs.rmSync(dir,{recursive:true,force:true});}}});
test('Existing active paper positions continue through the identical entry and exit with mode OFF or ON',()=>{const {dir,store}=tempStore();try{
 const settings={...structuredClone(DEFAULTS),exitStyles:['fixed'],costs:{stocks:{feeBps:0,slippageBps:0,spreadBps:0},crypto:{feeBps:0,slippageBps:0,spreadBps:0}}},at=(T+86400)*1000,sig={id:'existing',symbol:'TEST',market:'crypto',strategy:'ema-cross',strategies:['ema-cross'],tf:5,dir:1,price:100,stop:99,target:102,atr:2,status:'CONFIRMED',confirmedAt:at,source:'Fixture',warnings:[]},off=new AutoPaper({settings:()=>settings}),on=new AutoPaper({settings:()=>settings}),bars=boundary(0,.05),a={symbol:'TEST',market:'crypto',source:'Fixture',base:300,bars,replay:true};store.configure({...S,enabled:true,frames:[5]});
 for(const paper of [off,on])paper.observe([sig],{TEST:{symbol:'TEST',source:'Fixture',base:300,bars:[]}},at);
 for(const [i,high]of [[0,101],[1,103]]){const event={time:at/1000+i*300,open:100,high,low:99.5,close:100.5,volume:100,complete:true},assets={TEST:{symbol:'TEST',source:'Fixture',base:300,bars:[event]}},now=at+(i+1)*300000;store.evaluate(a,5,now,10000);off.observe([],assets,now);on.observe([],assets,now);assert.deepEqual(on.data,off.data);}
 assert.ok(on.data.rows[0].closedAt);assert.equal(on.data.rows[0].exit,102);
}finally{fs.rmSync(dir,{recursive:true,force:true});}});
