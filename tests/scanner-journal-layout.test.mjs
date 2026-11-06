import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sortMovers,scannerPanel,MOVER_COLUMNS} from '../modules/beta-view.mjs';
import {journalCalendar,journalMonth,shiftJournalMonth,betaFieldGroup,SETTINGS_GROUPS} from '../modules/ui-forms.mjs';
import {journalView} from '../modules/visual-settings.mjs';

test('Mover columns sort both ways without mutation, ties stay stable and missing values stay last',()=>{
 const rows=[{symbol:'ZZZ',change:3,gap:-2,rvol:1,relativeSPY:2},{symbol:'AAA',change:-1,gap:5,rvol:4,relativeSPY:-3},{symbol:'MISSING'},{symbol:'TIE',change:3,gap:-2,rvol:1,relativeSPY:2}],before=structuredClone(rows);
 for(const [key]of MOVER_COLUMNS)for(const direction of ['asc','desc']){const sorted=sortMovers(rows,{key,direction});assert.notEqual(sorted,rows);if(key!=='symbol'){assert.equal(sorted.at(-1).symbol,'MISSING');assert.ok(sorted.indexOf(rows[0])<sorted.indexOf(rows[3]));}const values=sorted.map(r=>r[key]).filter(v=>key==='symbol'||Number.isFinite(v));for(let i=1;i<values.length;i++){const comparison=key==='symbol'?values[i-1].localeCompare(values[i]):values[i-1]-values[i];assert.ok(direction==='asc'?comparison<=0:comparison>=0);}}
 assert.deepEqual(rows,before);
 const html=scannerPanel({movers:rows},{key:'gap',direction:'asc'});assert.equal((html.match(/data-mover-sort=/g)||[]).length,5);assert.match(html,/aria-sort="ascending"><button[^>]+data-mover-sort="gap"/);assert.match(html,/class="movers-table-region" role="region" aria-label="Notable movers\. Scroll to view all gainers, losers and table rows\." tabindex="0"/);assert.equal((html.match(/<tr><td><strong>/g)||[]).length,rows.length);assert.ok(html.indexOf('Stocks in play today')<html.indexOf('Scanner coverage & track record'));
});

test('Journal calendar places each record in a dated week with independent edit and date beneath its square',()=>{
 const rows=[{id:'a',symbol:'AAA',market:'stocks',decision:'taken',time:'2026-11-02T07:30:00Z',closedAt:'2026-11-02T08:30:00Z',pnl:20},{id:'b',symbol:'BBB',market:'options',decision:'taken',time:'2026-11-02T09:00:00Z',closedAt:'2026-11-02T10:00:00Z',pnl:-10},{id:'c',symbol:'CCC',market:'crypto',decision:'skipped',time:'2026-11-01T07:30:00Z',pnl:null}],before=structuredClone(rows),view=journalView(rows,{timezone:'America/Los_Angeles',sort:'highest'}),html=journalCalendar(view.rows,{timezone:view.timezone,sort:'highest',now:Date.parse('2026-11-04T12:00:00Z')});
 assert.equal((html.match(/class="journal-trade"/g)||[]).length,3);for(const row of rows)assert.ok(html.includes('data-edit="'+row.id+'"'));
 assert.ok(html.indexOf('data-edit="a"')<html.indexOf('data-edit="b"'));assert.match(html,/Edit \/ close<\/button><h3>AAA/);assert.match(html,/<\/div><time datetime="2026-11-02">/);assert.equal((html.match(/class="journal-calendar-day(?: outside-month| journal-day-details)?"/g)||[]).length,42);assert.match(html,/datetime="2026-11-01"/);assert.match(html,/P\/L sort within each date/);assert.deepEqual(rows,before);
});

test('Calendar includes the selected month weeks and preserves undated records; paper target joins signals',()=>{
 const html=journalCalendar([{id:'bad',symbol:'BAD',time:'invalid'}],{period:'month',now:Date.parse('2026-11-04T12:00:00Z'),timezone:'UTC'});assert.match(html,/Week of Mon, Nov 2, 2026/);assert.match(html,/Week of Mon, Oct 26, 2026/);assert.match(html,/Date unavailable/);assert.match(html,/data-edit="bad"/);assert.equal(betaFieldGroup('forwardExitMode'),'signals');assert.ok(!SETTINGS_GROUPS.some(([id])=>id==='paper'));
});


test('Calendar shows an entered percentage including zero and leaves older records without one unchanged',()=>{for(const value of [5.25,-3,0]){const html=journalCalendar([{id:'percent',symbol:'SPY',time:'2026-11-05T15:00:00Z',pnl:10,pnlPercent:value}],{now:Date.parse('2026-11-05T15:00:00Z'),num:v=>String(v)});assert.ok(html.includes((value>0?'+':'')+value+'%'));}assert.doesNotMatch(journalCalendar([{id:'old',symbol:'SPY',time:'2026-11-05T15:00:00Z',pnl:10}]),/journal-trade-percent/);});


test('All time calendar pages one month across years and retains timezone dates, trades and empty months',()=>{
 const now=Date.parse('2026-11-01T06:30:00Z'),rows=[{id:'oct',symbol:'OCT',time:now,pnl:1},{id:'nov',symbol:'NOV',time:'2026-11-02T15:00:00Z',pnl:2}],before=structuredClone(rows);
 assert.equal(journalMonth(now,'America/Los_Angeles'),'2026-10');
 assert.equal(shiftJournalMonth('2026-01',-1),'2025-12');assert.equal(shiftJournalMonth('2026-12',1),'2027-01');
 const october=journalCalendar(rows,{now,timezone:'America/Los_Angeles'});
 assert.match(october,/October 2026/);assert.match(october,/data-edit="oct"/);assert.doesNotMatch(october,/data-edit="nov"/);
 const november=journalCalendar(rows,{now,timezone:'America/Los_Angeles',month:'2026-11'});
 assert.match(november,/November 2026/);assert.match(november,/data-edit="nov"/);assert.doesNotMatch(november,/data-edit="oct"/);
 const empty=journalCalendar(rows,{now,month:'2027-02'});assert.match(empty,/February 2027/);assert.match(empty,/Previous month/);assert.match(empty,/Next month/);assert.doesNotMatch(empty,/data-edit=/);assert.match(empty,/summary above covers all time/);
 assert.equal((empty.match(/class="journal-calendar-day(?: outside-month| journal-day-details)?"/g)||[]).length,28);assert.deepEqual(rows,before);
});


test('Calendar arrows move one month and restore keyboard focus without changing journal filters',()=>{
 const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),branch=source.match(/ if\(el\.dataset\.journalMonthStep\)\{([^\n]+)\}/)?.[1];assert.ok(branch);
 const calls=[],context={el:{dataset:{journalMonthStep:'-1'}},journalCalendarMonth:'2026-01',state:{now:Date.parse('2026-11-05T12:00:00Z'),settings:{timezone:'UTC'}},shiftJournalMonth,journalMonth,render:()=>calls.push('render'),document:{querySelector:selector=>({focus:()=>calls.push(selector)})}};
 vm.runInNewContext('(function(){'+branch+'})()',context);assert.equal(context.journalCalendarMonth,'2025-12');assert.equal(calls.length,2);
 context.el.dataset.journalMonthStep='1';vm.runInNewContext('(function(){'+branch+'})()',context);assert.equal(context.journalCalendarMonth,'2026-01');
 assert.match(source,/records.length\|\|journalPeriod==='all'/);assert.match(source,/journalPeriod=value;journalCalendarMonth=''/);
});

test('Day tiles summarize only closed taken trades and keep every record available in a disclosure',()=>{
 const time='2026-11-05T16:00:00Z',rows=[{id:'a',symbol:'AAA',decision:'taken',time,closedAt:time,pnl:20},{id:'b',symbol:'BBB',decision:'taken',time,closedAt:time,pnl:-5},{id:'skip',symbol:'SKIP',decision:'skipped',time,closedAt:time,pnl:500},{id:'open',symbol:'OPEN',decision:'taken',time,pnl:100},{id:'unpriced',symbol:'WAIT',decision:'taken',time,closedAt:time,pnl:null}],before=structuredClone(rows),html=journalCalendar(rows,{now:Date.parse(time),timezone:'UTC',money:v=>'$'+v});
 assert.match(html,/<details class="journal-calendar-day journal-day-details"><summary>/);assert.match(html,/journal-day-pnl pnl-positive">\$15<\/strong>/);assert.match(html,/5 trades · View trades/);for(const row of rows)assert.ok(html.includes('data-edit="'+row.id+'"'));assert.deepEqual(rows,before);
 const open=journalCalendar([rows[3]],{now:Date.parse(time),timezone:'UTC'});assert.match(open,/No realized P\/L/);assert.match(open,/No trades/);
 const zero=journalCalendar([{...rows[0],pnl:0}],{now:Date.parse(time),timezone:'UTC',money:v=>'$'+v});assert.match(zero,/journal-day-pnl pnl-neutral">\$0<\/strong>/);
});
