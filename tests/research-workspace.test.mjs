import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {researchWorkspace,researchRoute} from '../research-workspace.mjs';
import {normalizeSidebar} from '../sidebar-layout.mjs';
import {VERSION} from '../local-cycle.mjs';

test('Research workspace retains all three sections, with Strategy Lab last and a single page heading/footer',()=>{
 const html=researchWorkspace({heading:'<h1>Research, Confidence & Outcomes</h1>',confidence:'<p>Models and sources</p>',outcomes:'<table>Measured outcomes</table>',lab:'<form id="replay-form">Replay controls</form>',footer:'<footer>Local research</footer>'});
 assert.ok(html.indexOf('id="research-confidence"')<html.indexOf('id="research-outcomes"'));assert.ok(html.indexOf('id="research-outcomes"')<html.indexOf('id="research-lab"'));
 assert.equal((html.match(/<h1>/g)||[]).length,1);assert.equal((html.match(/<footer>/g)||[]).length,1);assert.match(html,/Models and sources/);assert.match(html,/Measured outcomes/);assert.match(html,/id="replay-form"/);assert.match(html,/aria-label="Research sections"/);
 for(const id of ['research-confidence','research-outcomes','research-lab']){assert.match(html,new RegExp('data-section="'+id+'"'));assert.match(html,new RegExp('id="'+id+'-content"'));}
});
test('Existing bookmarks and custom sidebar layouts resolve to one research destination without duplicates',()=>{
 assert.deepEqual(researchRoute('research'),{page:'intelligence',section:'research-lab'});assert.deepEqual(researchRoute('performance'),{page:'intelligence',section:'research-outcomes'});assert.deepEqual(researchRoute('intelligence'),{page:'intelligence',section:null});assert.deepEqual(researchRoute('stocks'),{page:'stocks',section:null});
 const names={overview:'Overview',scanner:'News + Movers',intelligence:'Research, Confidence & Outcomes',settings:'Settings'},layout=normalizeSidebar({groups:[{id:'custom',title:'My evidence',items:['performance','intelligence','research'],collapsed:true},{id:'markets',title:'Markets',items:['overview','scanner','settings']}]},names);
 assert.deepEqual(layout.groups[0].items,['intelligence']);assert.equal(layout.groups[0].collapsed,true);assert.deepEqual(layout.groups[1].items,['overview','scanner','settings']);assert.equal(layout.groups.flatMap(g=>g.items).filter(id=>id==='intelligence').length,1);
 const defaults=normalizeSidebar(null,names);assert.equal(defaults.groups.flatMap(g=>g.items).filter(id=>id==='intelligence').length,1);assert.ok(!defaults.groups.flatMap(g=>g.items).includes('performance'));
});
test('Independent section refreshes preserve the replay form and initialize every data source on the combined page',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/page==='intelligence'\?researchHubPage\(\)/);assert.match(app,/refreshResearchBlock\('research-confidence',intelligencePage\(true\)\)/);assert.match(app,/refreshResearchBlock\('research-outcomes',performancePage\(true\)\)/);
 assert.match(app,/Promise.allSettled\(\[loadIntelligence\(requestSources\),loadStats\(\),loadHistory\(\)\]\)/);assert.match(app,/function refreshResearchBlock\(section,html\)\{const target=\$\('#'\+section\+'-content'\)/);
 assert.match(app,/if\(page==='intelligence'&&Date.now\(\)-historyLast>15000\)/);assert.match(app,/if\(page==='intelligence'&&Date.now\(\)-statsLast>8000\)/);
 assert.match(app,/function researchPage\(embedded=false\)/);assert.match(app,/id="replay-form"/);assert.match(app,/function performancePage\(embedded=false\)/);assert.match(app,/researchRoute\(location.hash.slice\(1\)\)/);
});
test('Jarvis 1.25 changes the displayed release without rewriting protocol identifiers or the JARVIS tab title',()=>{
 assert.equal(VERSION,'Jarvis 1.25');const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));assert.equal(pkg.version,'1.25.0');
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(app,/Jarvis 1.25/);assert.match(app,/intelligence:'Research, Confidence & Outcomes'/);assert.ok(!app.includes("performance:'Signal Outcomes'"));assert.match(html,/<title>JARVIS<\/title>/);
 const auto=fs.readFileSync(new URL('../auto-paper.mjs',import.meta.url),'utf8');assert.match(auto,/beta010-paper-v1/);
});
