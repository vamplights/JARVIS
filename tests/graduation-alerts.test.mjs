import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyGraduation} from '../graduation.mjs';
import {DEFAULTS} from '../engine.mjs';
import {AlertTracker,alertEligibility} from '../alert-rules.mjs';
const rows=(n,value=.2)=>Array.from({length:n},(_,i)=>({id:'s'+i,key:'k'+i,profile:'p',market:'stocks',strategy:'ema-cross',strategies:['ema-cross','vwap'],tf:3,entryAt:i*600000,closedAt:i*600000+180000,cohort:'confirmed',realizedR:typeof value==='function'?value(i):value}));
const grade=(r,extra={})=>strategyGraduation(r,{profile:'p',...extra})['stocks|ema-cross|3'];
test('Graduation requires 100 initial and the NEXT 100 fresh trades, positive R and a positive 95% lower bound',()=>{
 assert.equal(grade(rows(99)).status,'Collecting');assert.equal(grade(rows(100)).status,'Candidate');const waiting=grade(rows(199));assert.equal(waiting.freshN,99);assert.equal(waiting.status,'Candidate');const graduated=grade(rows(200));assert.equal(graduated.status,'Graduated');assert.ok(graduated.ci95[0]>0);assert.equal(graduated.freshN,100);
 const concurrent=rows(200).map((r,i)=>i>=100?{...r,entryAt:rows(100).at(-1).entryAt}:r);assert.equal(grade(concurrent).status,'Candidate');assert.equal(grade(concurrent).freshN,0);
});
test('Negative short-window means do not suspend or undo graduation; suspension needs a negative recent-100 upper bound or drawdown breach',()=>{
 const first=rows(200,1),small=rows(210,i=>i<200?1:-.1);assert.equal(grade(small).status,'Graduated');
 const bad=rows(300,i=>i<200?1:-.1);assert.equal(grade(bad).status,'Suspended');assert.ok(grade(bad).recentCI[1]<0);
 const drawdown=rows(205,i=>i<200?1:-4);assert.equal(grade(drawdown).status,'Suspended');assert.equal(grade(drawdown,{maxStrategyDrawdownR:30}).status,'Graduated');
 assert.equal(grade([...first,...rows(10,-10).map(r=>({...r,key:'raw'+r.key,cohort:'raw'}))]).status,'Graduated');
});
test('Cohorts and fallback stay separate; agreeing strategies each receive one shared observation, not extra trades',()=>{
 const input=rows(100);const g=strategyGraduation([...input,...input],{profile:'p'});assert.equal(g['stocks|ema-cross|3'].n,100);assert.equal(g['stocks|vwap|3'].n,100);assert.deepEqual(strategyGraduation(input,{profile:'other'}),{});
 assert.deepEqual(strategyGraduation(input.map(r=>({...r,fallback:true})),{profile:'p'}),{});assert.equal(grade(input.map(r=>({...r,fallback:true})),{includeFallbackTraining:true}).n,100);
});
const now=Date.parse('2026-10-08T15:00Z'),settings={...structuredClone(DEFAULTS),alerts:{...DEFAULTS.alerts,maxPerHour:2,cooldownSeconds:10}},signal={id:'one',symbol:'SPY',market:'stocks',tf:3,dir:1,strategy:'vwap',score:85,confirmedAt:now-1000,quoteTime:now,status:'CONFIRMED',confidenceEstimate:{kind:'outcome-model',probability:.4,beatsBaseline:false,expectedR:null},graduations:[{status:'Collecting'}]};
test('Alerts share Top Pick rules without old graduation/75-percent/EV vetoes, and enforce quiet hours',()=>{
 assert.equal(alertEligibility(signal,settings,now),null);
 for(const patch of [{status:'WATCH'},{conflicted:true},{legacyProfile:true},{replay:true},{score:79},{quoteTime:now-151000},{confidenceEstimate:{kind:'outcome-model',probability:.3}}])assert.notEqual(alertEligibility({...signal,...patch},settings,now),null);
 assert.equal(alertEligibility(signal,{...settings,alerts:{...settings.alerts,enabled:false}},now),'Alerts are off');
 assert.equal(alertEligibility(signal,{...settings,alerts:{...settings.alerts,quietHours:['07:00-09:00']}},now),'Quiet hours');assert.equal(alertEligibility(signal,{...settings,alerts:{...settings.alerts,quietHours:['23:00-09:00']}},now),'Quiet hours');
});
test('Alerts fire once on new Top Picks, suppress startup/repeated polls, throttle symbols and cap per hour',()=>{
 const t=new AlertTracker();assert.deepEqual(t.update([{...signal,status:'WATCH'}],settings,now),[]);assert.equal(t.update([signal],settings,now+1000).length,1);assert.deepEqual(t.update([signal],settings,now+2000),[]);t.update([],settings,now+2100);assert.equal(t.update([signal],settings,now+3000).length,0);
 assert.equal(t.update([{...signal,id:'two'}],settings,now+4000).length,0);assert.equal(t.update([{...signal,id:'three',symbol:'QQQ'}],settings,now+5000).length,1);assert.equal(t.update([{...signal,id:'four',symbol:'MSFT'}],settings,now+6000).length,0);
 const startup=new AlertTracker();assert.equal(startup.update([signal],settings,now).length,0);startup.update([],settings,now+1000);assert.equal(startup.update([signal],settings,now+2000).length,0);
});
