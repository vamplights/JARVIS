import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {SETTINGS_GROUPS,settingsGroupFor,betaFieldGroup,sessionStatusBadge,readOnlyStatus,manualTradeForm,updateManualTradeFields} from '../ui-forms.mjs';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const field=(label,name,value,type='number',hint='',extra='')=>'<label>'+label+'<input name="'+name+'" value="'+esc(value)+'" type="'+type+'" '+extra+'>'+hint+'</label>';
const select=(label,name,values,value)=>'<label>'+label+'<select name="'+name+'">'+values.map(([v,t])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+t+'</option>').join('')+'</select></label>';
const helpers={field,select,esc,localInput:t=>t||'2026-10-15T10:00',timezone:'America/Los_Angeles',market:'stocks',symbol:'SPY'};

test('Settings have six meaningful groups; existing beta controls have one explicit destination',()=>{
 assert.equal(SETTINGS_GROUPS.length,6);assert.equal(new Set(SETTINGS_GROUPS.map(g=>g[0])).size,6);
 for(const [title,group]of [['Appearance','basics'],['Schedule & trading-day reset','basics'],['Capital & risk limits','risk'],['No-trade events & options costs','risk'],['Individual strategy controls','signals'],['Profit model & daily review','data'],['High-quality browser alerts','alerts']])assert.equal(settingsGroupFor(title),group);
 for(const [name,group]of [['cryptoFrames','basics'],['cryptoVenue','risk'],['forwardExitMode','paper'],['entryOrder','signals'],['exitStyles','signals'],['trailingATR','signals'],['scanner.feeds','data'],['service.catchUpDays','data'],['inPlay.minRVOL','signals'],['special.earningsHoldDays','signals']])assert.equal(betaFieldGroup(name),group);
});
test('Session status moves globally and Read Only explains local writes versus real orders',()=>{
 assert.match(sessionStatusBadge({known:true,stocks:true,crypto:false},esc),/US STOCK SESSION/);assert.match(sessionStatusBadge({known:true,stocks:false,crypto:true},esc),/CRYPTO SESSION/);assert.match(sessionStatusBadge({known:false},esc),/CALENDAR UNVERIFIED/);assert.match(sessionStatusBadge({known:true,stocks:false,crypto:false},esc),/ENTRY WINDOW CLOSED/);
 assert.ok(!sessionStatusBadge({known:true,crypto:true,label:'<script>'},esc).includes('<script>'));assert.match(readOnlyStatus(),/never sends real broker orders/);assert.match(readOnlyStatus(),/can still be saved/);
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');assert.equal((app.match(/sessionStatusBadge\(state.session,esc\)/g)||[]).length,1);assert.ok(!app.includes("badge(state.session.stocks?'US SESSION':'CRYPTO SESSION'"));
});
test('Manual journal form retains every record field once and separates essentials from optional context',()=>{
 const record={id:'old',symbol:'SPY',market:'options',entry:1.25,exit:1.4,size:2,contractMultiplier:100,pnl:28,closedAt:'2026-10-15T10:30',plannedRisk:25,signalId:'signal',notes:'<script>alert(1)</script>',reference:'chart',decision:'taken'};
 const html=manualTradeForm(record,helpers),names=[...html.matchAll(/name="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(names.sort(),['id','time','market','symbol','decision','strategy','signalId','plannedEntry','stop','exitScenario','plannedRisk','reasonCode','entry','exit','size','contractMultiplier','pnl','closedAt','reference','notes'].sort());
 assert.match(html,/Profit &amp; loss/);assert.match(html,/Optional trade details/);assert.match(html,/name="entry" value="1.25"/);assert.match(html,/name="contractMultiplier" value="100"/);assert.ok(!html.includes('<script>'));
 assert.match(html,/<details class="journal-form-details"><summary>Optional trade details/);
 const required=[...html.matchAll(/<input[^>]*>/g)].filter(m=>/\brequired\b/.test(m[0])).map(m=>m[0].match(/name="([^"]+)"/)[1]);assert.deepEqual(required,['symbol','pnl']);

 assert.match(manualTradeForm({},helpers),/<option value="stocks" selected/);
});
test('Option multiplier visibility follows market without disabling or clearing recorded values',()=>{
 const wrapper={hidden:false},form={querySelector:()=>wrapper,elements:{market:{value:'stocks'},contractMultiplier:{value:'100'}}};updateManualTradeFields(form);assert.equal(wrapper.hidden,true);assert.equal(form.elements.contractMultiplier.value,'100');form.elements.market.value='options';updateManualTradeFields(form);assert.equal(wrapper.hidden,false);assert.equal(form.elements.contractMultiplier.value,'100');assert.doesNotThrow(()=>updateManualTradeFields(null));
});
