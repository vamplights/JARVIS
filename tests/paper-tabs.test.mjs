import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {paperPanel,paperTabs,selectPaperTab,latestPaperLoader} from '../beta-view.mjs';
import {ManualOptionSandbox} from '../manual-sandbox.mjs';

test('Paper sub-tabs stay available while loading and show recorded/open manual counts',()=>{
 const html=paperTabs({market:'manual'},[{closedAt:1},{}])+paperPanel(null,{market:'manual'});
 assert.match(html,/role="tablist"/);assert.match(html,/id="paper-tab-manual"[^>]*aria-selected="true"/);
 assert.match(html,/Manual Option Trades/);assert.match(html,/2 recorded · 1 open/);assert.match(html,/Loading local paper results/);
 assert.match(paperTabs({market:'crypto'}),/id="paper-tab-automatic"[^>]*aria-selected="true"/);
 const initial={market:'crypto',account:'realistic',day:'2026-10-01',profile:'old',style:'atr-trail'};
 const manual=selectPaperTab(initial,'manual');assert.equal(manual.market,'manual');assert.equal(manual.day,'');assert.equal(manual.profile,'');assert.equal(manual.account,'all');assert.equal(manual.style,initial.style);assert.equal(initial.profile,'old');
 assert.equal(selectPaperTab(manual,'automatic','crypto').market,'crypto');
 const oldRows=[{profile:'older',openedAt:10},{profile:'recent',openedAt:20}];assert.equal(selectPaperTab(initial,'manual','stocks',oldRows).profile,'recent');assert.equal(oldRows[0].profile,'older');assert.equal(selectPaperTab(manual,'automatic','stocks',oldRows).profile,'');
});

test('A late automatic response or failure cannot overwrite the selected manual ledger',async()=>{
 const pending=[],load=latestPaperLoader(options=>new Promise((resolve,reject)=>pending.push({options,resolve,reject})));
 const automatic=load({market:'stocks'}),manual=load({market:'manual'});
 pending[1].resolve({market:'manual',rows:[{id:'click'}]});assert.deepEqual(await manual,{current:true,data:{market:'manual',rows:[{id:'click'}]}});
 pending[0].resolve({market:'stocks'});assert.equal((await automatic).current,false);
 const old=load({market:'stocks'}),next=load({market:'manual'});pending[2].reject(Error('old request failed'));assert.equal((await old).current,false);
 pending[3].reject(Error('Local ledger unavailable'));const failure=await next;assert.equal(failure.current,true);assert.equal(failure.error.message,'Local ledger unavailable');
});

test('Manual tab includes both legacy and sandbox clicks, excludes auto entries and keeps cohorts separate',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-paper-tabs-'));
 try{const sandbox=new ManualOptionSandbox(dir),trade={market:'options',symbol:'SPY',strategy:'vwap',profile:'current',source:'manual-click',openedAt:Date.now(),size:1,entry:2,dir:1,pnl:null};
 sandbox.data.trades=[{...trade,id:'sandbox',simulationMode:'unrestricted',priceBasis:'estimated'},{...trade,id:'old-cohort',profile:'older'},{...trade,id:'crypto',market:'crypto',symbol:'BTC-USD'}];
 const legacy=[{...trade,id:'legacy'},{...trade,id:'auto',source:'automatic'}];
 const report=sandbox.results(legacy,{market:'manual',profile:'current'});
 const automatic=sandbox.results(legacy,{market:'options',profile:'current'});
 assert.deepEqual(automatic.rows.map(r=>r.id),['auto']);assert.deepEqual(automatic.open.map(r=>r.id),['auto']);assert.equal(automatic.manualCount,0);assert.equal(automatic.unrestrictedCount,0);assert.equal(automatic.manualLearning,undefined);assert.match(automatic.note,/Automatic option entries only/);
 assert.equal(sandbox.results(legacy,{profile:'current'}).rows.length,3); // Combined daily reports retain both option sources.
 assert.deepEqual(report.rows.map(r=>r.id),['legacy','sandbox','crypto']);assert.equal(report.open.length,3);assert.equal(report.rows.find(r=>r.id==='crypto').market,'crypto');
 assert.deepEqual(sandbox.results(legacy,{market:'manual',profile:'older'}).rows.map(r=>r.id),['old-cohort']);
 const html=paperPanel(report,{market:'manual'});assert.match(html,/<h1>Manual Option Trades<\/h1>/);assert.match(html,/paper-open-v2/);assert.match(html,/paper-closed-v2/);assert.match(html,/No closed trades for the selected cohort/);assert.ok(!html.includes('data-beta="market"'));assert.match(html,/ESTIMATED/);
 const auto=paperPanel({...report,manualLearning:null},{market:'stocks'});assert.match(auto,/data-beta="market"/);assert.ok(!auto.includes('<option value="manual"'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Closed legacy rows render safely and empty manual results provide an explicit message',()=>{
 const d={rows:[{symbol:'SPY',strategy:'vwap',dir:1,entry:1,exit:2,pnl:100,closedAt:1,entryMode:'manual'}],open:[],buckets:{}};
 const html=paperPanel(d,{market:'manual'});assert.match(html,/SPY<small>vwap/);assert.match(html,/\$100.00/);
 assert.match(paperPanel({...d,rows:[]},{market:'manual'}),/No closed trades/);
});

test('Requested sidebar icons are distinct and Research remains unchanged; paper panels start expanded',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),panels=fs.readFileSync(new URL('../panel-disclosures.mjs',import.meta.url),'utf8');
 assert.match(app,/picks:'M12 3l2\.8/);assert.match(app,/scanner:'M5 4h16/);
 assert.match(app,/research:'M9 3h6 M10 3v7L4 20h16l-6-10V3 M8 15h8'/);
 assert.match(app,/case 'paper-tab':await switchPaperTab\(el.dataset.tab\)/);assert.match(app,/await switchPaperTab\('manual'\)/);
 assert.match(panels,/\['paper-filters-v2','paper-open-v2','paper-closed-v2'\]\.includes\(panel.id\)/);
});
