import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publicResearchView} from '../modules/research-workspace.mjs';
import {strategyLabel,expectancyTable} from '../modules/outcome-view.mjs';
import {modelReviewPanel} from '../modules/model-view.mjs';
const esc=s=>String(s??'').replaceAll('<','&lt;'),date=String,num=n=>n==null?'—':String(n),now=Date.parse('2026-11-05T18:00:00Z');
const news=titles=>({checkedAt:now,items:titles.map((title,i)=>({title,publishedAt:now-i*1000,url:'https://example.com/'+i,publisher:'Example',kind:'Headline'}))});
test('Public research uses fresh headline evidence and honest mixed, missing and retained states',()=>{
 for(const [titles,label]of [[['Shares surge after upgrade','Company raises guidance'],'Leaning up'],[['Shares plunge after downgrade','Company cuts guidance'],'Leaning down'],[['Company releases report'],'Mixed / neutral']]){
  const value=news(titles),before=structuredClone(value),html=publicResearchView('ABC',value,{esc,date,now});assert.ok(html.includes(label));assert.match(html,/uncalibrated/);assert.deepEqual(value,before);
 }
 assert.match(publicResearchView('ABC',null,{esc,date,now}),/Waiting for news/);
 assert.match(publicResearchView('ABC',{...news(['Shares surge','Strong demand']),retained:true},{esc,date,now}),/No current direction/);
 assert.match(publicResearchView('ABC',news([]),{esc,date,now,error:'Offline'}),/Check sources to retry/);
});
test('Friendly strategy names reach outcomes and model groups with readable unknown fallback',()=>{
 const rules={'ema-cross':{name:'34 EMA · initial cross'}};
 assert.equal(strategyLabel('stocks|ema-cross|5',rules),'34 EMA · initial cross · Stocks · 5m');assert.equal(strategyLabel('future-rule',rules),'Future rule');
 const html=expectancyTable([{strategy:'ema-cross',market:'stocks',tf:5,n:1,sample:'Small sample'}],{rules});assert.match(html,/34 EMA/);assert.ok(!html.includes('<strong>ema-cross</strong>'));
 const data={status:{stage:'Ready'},models:{},graduation:{a:{key:'stocks|ema-cross|5',n:0,freshN:0}},reports:[],reportDates:[]};assert.match(modelReviewPanel(data,{esc,num,date,rules}),/34 EMA · initial cross · Stocks · 5m/);
});
test('Strategy rulebook precedes history and unchanged replay controls in Strategy Lab',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),part=app.slice(app.indexOf('function researchPage('),app.indexOf('function renderReplay('));
 assert.ok(part.indexOf('Strategy rulebook')<part.indexOf('${historyPanel()}'));assert.match(part,/rulebook-grid/);assert.match(part,/id="replay-form"/);assert.match(part,/Stored dataset \(optional\)/);assert.match(part,/70\/30 holdout · 12-bar embargo/);assert.match(app,/Results on unseen data/);
});
