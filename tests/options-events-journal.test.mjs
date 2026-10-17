import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../engine.mjs';
import {eventCheck,eastern,contextGate} from '../market-context.mjs';
import {optionReality} from '../option-plan.mjs';
import {observeOptionOutcomes} from '../option-outcomes.mjs';
import {journalComparison} from '../journal-review.mjs';
const now=Date.parse('2026-10-08T14:00Z');
test('Existing event filter supports full-day/window CPI/FOMC, configurable earnings days and first five minutes',()=>{
 const ctx={macro:{CPI:{checkedAt:now,events:[{date:'2026-10-08',time:eastern('2026-10-08',8,30)}]},FOMC:{checkedAt:now,events:[{date:'2026-10-08',time:null}]}},earnings:{SPY:{checkedAt:now,events:[{date:'2026-10-10'}]}}};
 const day=eventCheck('SPY','stocks',ctx,now,10,{CPI:{mode:'day',minutes:10},FOMC:{mode:'window',minutes:20},earningsDays:2});assert.ok(day.blocked.includes('CPI decision-day blackout'));assert.ok(day.blocked.includes('Earnings blackout · tentative date'));assert.equal(day.blocked.some(x=>x.startsWith('FOMC')),false);
 assert.ok(eventCheck('SPY','stocks',ctx,eastern('2026-10-08',14),10,{FOMC:{mode:'window',minutes:20}}).blocked.some(x=>x.startsWith('FOMC')));
 assert.ok(eventCheck('SPY','stocks',{},eastern('2026-10-08',9,32),60,{firstFiveMinutes:true}).blocked.includes('First five minutes after the stock open'));
 const signal={symbol:'SPY',market:'stocks',status:'CONFIRMED',dir:1,warnings:[],regime:'Trending'},settings={...DEFAULTS,filters:{...DEFAULTS.filters,regime:false},eventBlocks:{...DEFAULTS.eventBlocks,CPI:{mode:'day',minutes:60}}};assert.equal(contextGate(signal,ctx,settings,{},now).status,'WATCH');assert.equal(contextGate(signal,ctx,{...settings,filters:{...settings.filters,events:false}},{},now).status,'CONFIRMED');
});
test('Option reality checks delta/theta/spread estimates and blocks spreads above a fraction of planned risk',()=>{
 const s={price:100,target:102,stop:99,tf:5,size:{plannedRisk:100}},c={id:'c',multiplier:100,quote:{bid:2,ask:2.1,delta:.5,theta:-.1}};const r=optionReality(s,c,DEFAULTS);assert.equal(r.available,true);assert.equal(r.blocked,false);assert.ok(r.target.pnl>80);assert.ok(r.stop.pnl< -50);assert.ok(r.spreadOfRisk>.09&&r.spreadOfRisk<.11);assert.match(r.label,/Ignores IV changes/);
 assert.equal(optionReality({...s,size:{plannedRisk:15}},c,DEFAULTS).blocked,true);assert.equal(optionReality(s,{...c,quote:{...c.quote,theta:null}},DEFAULTS).available,false);
});
test('Option outcomes use subsequent asks and exit bids, remain separate from underlying R, and never synthesize stale exits',()=>{
 const data={observations:[]},s={id:'combined',symbol:'SPY',tf:3,status:'CONFIRMED',optionPlan:{reality:{blocked:false},contract:{id:'c',multiplier:100}}},settings={...DEFAULTS,staleSeconds:30};let options={contracts:[{id:'c',quote:{time:now,bid:2,ask:2.1}}]};observeOptionOutcomes(data,[s,s],options,settings,now);assert.equal(data.optionObservations.length,1);assert.equal(data.optionObservations[0].entry,null);
 options.contracts[0].quote={time:now+1000,bid:2,ask:2.1};observeOptionOutcomes(data,[s],options,settings,now+1000);assert.equal(data.optionObservations[0].entry,2.1);
 data.observations.push({id:s.id,cohort:'confirmed',closedAt:now+2000,realizedR:1});options.contracts[0].quote={time:now+2000,bid:2.3,ask:2.4};observeOptionOutcomes(data,[s],options,settings,now+2000);assert.ok(Math.abs(data.optionObservations[0].pnl-18.7)<1e-8);assert.equal(data.observations[0].realizedR,1);
 const missing={optionObservations:[{signalId:'x',contractId:'x',entry:1,entryAt:now,expiresAt:now+1000}]};observeOptionOutcomes(missing,[],{},settings,now+40000);assert.equal(missing.optionObservations[0].outcome,'unmeasurable');
 const tooLate={observations:[{id:'combined',cohort:'confirmed',closedAt:now}],optionObservations:[{signalId:'combined',contractId:'c',entry:null,observedAt:now-1000,expiresAt:now+10000}]};observeOptionOutcomes(tooLate,[],options,settings,now+2000);assert.equal(tooLate.optionObservations[0].entry,null);assert.equal(tooLate.optionObservations[0].outcome,'unmeasurable');
});
test('Journal comparison uses entered fills and saved risk caps, identifies skipped winners, early exits and unalerted trades',()=>{
 const journal=[{id:'j',signalId:'s',symbol:'SPY',decision:'taken',entry:100.1,plannedEntry:100,stop:99.1,size:20,pnl:10,riskLimitAtEntry:15,reasonCode:'early-exit',time:new Date(now).toISOString()},{id:'skip',signalId:'s',symbol:'SPY',decision:'skipped'}],outcomes=[{id:'s',cohort:'confirmed',dir:1,signalEntry:100,realizedR:1.5}];
 const rows=journalComparison(journal,outcomes,[]);assert.ok(Math.abs(rows[0].slippagePerUnit-.1)<1e-8);assert.equal(rows[0].actualR,.5);assert.equal(rows[0].earlyExitGapR,1);assert.equal(rows[0].ruleBreaks.length,2);assert.equal(rows[1].skippedWinnerR,1.5);assert.equal(journalComparison(journal,outcomes,[{signalId:'s',createdAt:now-1000}])[0].ruleBreaks.length,1);
 const option=journalComparison([{...journal[0],market:'options',entry:2,size:1,contractMultiplier:100,pnl:20}],outcomes,[],[{signalId:'s',entry:2,multiplier:100,pnl:40,closedAt:now}])[0];assert.equal(option.actualR,.1);assert.equal(option.systemR,.2);
 const cash=journalComparison(journal,[{...outcomes[0],entry:100,stop:99,exit:101.5,referenceSize:10,costPerUnit:0}],[]);assert.equal(cash[1].skippedWinnerPnL,15);assert.ok(Math.abs(cash[0].earlyExitGapPnL-18)<1e-8);
});
