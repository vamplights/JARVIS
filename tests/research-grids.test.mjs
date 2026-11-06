import test from 'node:test';
import assert from 'node:assert/strict';
import {expectancyTable,historyDatasetCards} from '../modules/outcome-view.mjs';
import {strategyProgressCards} from '../modules/model-view.mjs';
const esc=String,num=v=>Number.isFinite(v)?String(v):'—';
test('Ticker history groups preserve all source and interval records without changing inputs',()=>{
 const rows=[{symbol:'SPY',base:60,source:'First',count:20},{symbol:'SPY',base:300,source:'Second',count:10,partial:true},{symbol:'QQQ',base:60,source:'First',count:30}],before=structuredClone(rows),html=historyDatasetCards(rows,{esc,num});
 assert.equal((html.match(/class="history-ticker"/g)||[]).length,2);assert.equal((html.match(/class="history-dataset"/g)||[]).length,3);for(const text of ['SPY','QQQ','1m','5m','First','Second','Partial'])assert.ok(html.includes(text));assert.deepEqual(rows,before);
});
test('Outcome cards keep separate same-strategy groups visible with their differentiating dimensions',()=>{
 const groups=[{strategy:'ema-cross',market:'stocks',tf:5,n:2,direction:'Long',regime:'Trending',etHour:10,horizon:'intraday',cohort:'confirmed',profile:'one',targetCapped:false,avgR:1,sample:'Small sample'},{strategy:'ema-cross',market:'stocks',tf:5,n:3,direction:'Short',regime:'Choppy',etHour:11,horizon:'intraday',cohort:'watch',profile:'two',targetCapped:true,avgR:-1,sample:'Small sample'}],before=structuredClone(groups),html=expectancyTable(groups,{cards:true,rules:{'ema-cross':{name:'EMA cross'}}});
 assert.equal((html.match(/class="outcome-result-card"/g)||[]).length,2);for(const text of ['Long','Short','Trending','Choppy','10:00 ET','11:00 ET','confirmed','watch','one','two','Capped','Uncapped'])assert.ok(html.includes(text),text);assert.deepEqual(groups,before);
 const pooled=expectancyTable([{...groups[0],symbols:['SPY','QQQ'],version:'replay-v1'}],{cards:true,pooled:true});assert.match(pooled,/SPY, QQQ/);assert.match(pooled,/replay-v1/);
});
test('Model cohort cards preserve counts, status and evidence with readable strategy names',()=>{
 const data={a:{key:'stocks|ema-cross|5',status:'Collecting',n:4,freshN:0,avgR:-.2,reason:'Need more trades',ci95:[-.5,.2]}};
 const html=strategyProgressCards(data,{esc,num,rules:{'ema-cross':{name:'EMA cross'}}});for(const text of ['EMA cross','Stocks','5m','Collecting','Need more trades','4','-0.5 to 0.2R'])assert.ok(html.includes(text),text);
});
