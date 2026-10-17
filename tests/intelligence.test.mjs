import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseRSS,relatedCoverage,calibration,resolveForecast,SessionLearning,PublicResearch,buildBrief} from '../intelligence.mjs';
import {DEFAULTS} from '../engine.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data/test-work');
fs.mkdirSync(root,{recursive:true});
const temp=()=>fs.mkdtempSync(path.join(root,'intelligence-'));
function clean(dir){assert.ok(path.resolve(dir).startsWith(root+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
test('News rejects future dates and unsafe links; marks headline themes without inventing sentiment',()=>{
 const now=Date.parse('2026-10-12T18:00:00Z'),item=(title,url,date)=>`<item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate><source>Publisher</source></item>`;
 const rows=parseRSS('<rss>'+item('Amazon earnings &amp; guidance','https://example.com/news','Mon, 12 Oct 2026 12:00:00 GMT')+item('Future','https://example.com/future','Tue, 13 Oct 2026 12:00:00 GMT')+item('Unsafe','javascript:alert(1)','Mon, 12 Oct 2026 12:00:00 GMT')+'</rss>','test',now);
 assert.equal(rows.length,1);assert.equal(rows[0].title,'Amazon earnings & guidance');assert.deepEqual(rows[0].themes,['Earnings']);assert.equal(rows[0].sentiment,undefined);
});
test('Related coverage needs shared content and different publishers; duplicate feeds are not confirmation',()=>{
 const items=[{id:'a',title:'Amazon quarterly revenue guidance raises investor concerns',publisher:'A',publishedAt:1},{id:'b',title:'Amazon quarterly revenue guidance raises investor concerns',publisher:'A',publishedAt:1},{id:'c',title:'Amazon quarterly revenue guidance raises investor concerns',publisher:'B',publishedAt:1},{id:'d',title:'Microsoft opens new data center',publisher:'C',publishedAt:1}];
 assert.deepEqual(relatedCoverage(items)[0].related,['c']);
});
test('Forward outcome waits until future candles close and refuses missing candles',()=>{
 const f={createdAt:600000,dueAt:780000,price:100,dir:1,costBps:10},bars=[600,660,720].map(time=>({time,close:102,complete:true}));
 assert.equal(resolveForecast(f,bars,60,800000),null);assert.equal(resolveForecast(f,bars,60,840000).result,'measured');assert.ok(resolveForecast(f,bars,60,840000).netDirection>0);assert.equal(resolveForecast(f,bars.slice(1),60,840000).result,'unmeasurable');
});
test('Calibration requires 100 matched observations, 20 sessions, same direction and settings',()=>{
 const signal={symbol:'AMZN',strategy:'ema-cross',tf:1,dir:1,profile:'a',score:85};const rows=Array.from({length:100},(_,i)=>({...signal,bin:8,result:'measured',netDirection:i<70?.01:-.01,session:'day'+i%20}));const c=calibration(rows,signal);assert.equal(c.eligible,true);assert.equal(c.rate,.7);assert.ok(c.lower<.7&&c.upper>.7);assert.equal(calibration(rows.slice(0,99),signal).score,null);assert.equal(calibration(rows,{...signal,dir:-1}).n,0);assert.equal(calibration(rows,{...signal,profile:'b'}).n,0);
});
test('Forecasts freeze contemporaneous news, avoid overlapping forecasts, and persist across restarts',()=>{
 const dir=temp(),now=Date.now(),settings=structuredClone(DEFAULTS),signal={id:'a',symbol:'AMZN',strategy:'ema-cross',tf:1,dir:1,score:80,status:'CONFIRMED',confirmedAt:now-1000},assets={AMZN:{symbol:'AMZN',market:'stocks',base:60,bars:[],quote:{price:100,time:now}}},news={cache:{AMZN:{checkedAt:now,items:[{id:'past',publishedAt:now-100,title:'Past'},{id:'future',publishedAt:now+1000,title:'Future'}]}}};
 try{const l=new SessionLearning({dir,settings:()=>settings,assets:()=>assets,news,replay:async()=>{}});l.observe([signal,{...signal,id:'b'}],assets,now);assert.equal(l.records.forecasts.length,1);assert.deepEqual(l.records.forecasts[0].newsIds,['past']);l.observe([signal],assets,now);assert.equal(l.records.forecasts.length,1);const restored=new SessionLearning({dir,settings:()=>settings,assets:()=>assets,news,replay:async()=>{}});assert.equal(restored.records.forecasts[0].newsSnapshot[0].title,'Past');}finally{clean(dir);}
});
test('Automatic session review archives complete days, persists results, and never double-counts a run',async()=>{
 const dir=temp(),start=Math.floor(Date.now()/86400000)*86400-86400,settings={...structuredClone(DEFAULTS),strategies:['ema-cross'],crypto:['BTC-USD'],cryptoFrame:5,cryptoFrames:[5]},bars=Array.from({length:288},(_,i)=>({time:start+i*300,open:100,high:101,low:99,close:100,volume:1,complete:true})),assets={'BTC-USD':{symbol:'BTC-USD',market:'crypto',base:300,bars}};let calls=0;
 const replay=async()=>{calls++;return {development:{count:0},outOfSample:{count:0},period:[start*1000,(start+86400)*1000],splitTime:(start+60000)*1000,assumptions:'test',warning:'test'};};
 try{const l=new SessionLearning({dir,settings:()=>settings,assets:()=>assets,news:{cache:{}},replay});await l.tick();assert.equal(calls,1);await l.tick();assert.equal(calls,1);assert.equal(l.records.runs.length,1);assert.equal(l.summary('BTC-USD').archiveBars,288);}finally{clean(dir);}
});
test('Incomplete session does not generate a daily backtest',async()=>{
 const dir=temp(),start=Math.floor(Date.now()/86400000)*86400-86400,assets={'BTC-USD':{symbol:'BTC-USD',market:'crypto',base:300,bars:Array.from({length:150},(_,i)=>({time:start+i*300,close:100,complete:true}))}};let calls=0;
 try{const l=new SessionLearning({dir,settings:()=>DEFAULTS,assets:()=>assets,news:{cache:{}},replay:async()=>calls++});await l.tick();assert.equal(calls,0);}finally{clean(dir);}
});
test('Provider failure retains older news with an explicit retained-data flag',async()=>{
 const dir=temp();try{const n=new PublicResearch({dir,fetcher:async()=>{throw Error('offline');}});n.cache.AMZN={checkedAt:1,items:[{id:'old',title:'Prior report',publishedAt:1}]};const r=await n.refresh('AMZN');assert.equal(r.retained,true);assert.equal(r.items[0].id,'old');assert.ok(r.sources.every(s=>!s.ok));}finally{clean(dir);}
});
test('News never adds a score bonus and an empty contract history never claims options confidence',()=>{
 const signal={id:'a',symbol:'AMZN',strategy:'ema-cross',name:'EMA',direction:'bullish',dir:1,score:85,status:'STALE',stop:90,factors:[],tf:1};const learning={summary:()=>({calibration:{eligible:false,n:0,days:0}})};
 const result=buildBrief({symbol:'AMZN',signals:[signal],news:{checkedAt:Date.now(),items:[{publishedAt:Date.now(),themes:['Earnings']}]},learning,options:{symbol:'SPY'},now:Date.now(),settings:DEFAULTS});assert.equal(result.confirmation,85);assert.equal(result.label,'Not entry-confirmed');assert.deepEqual(result.contracts,[]);assert.match(result.optionsWarning,/No high-confidence options forecast/);assert.ok(result.rationale.some(r=>r.includes('no discretionary news-based score bonus')));
});
