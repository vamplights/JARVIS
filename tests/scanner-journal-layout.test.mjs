import test from 'node:test';
import assert from 'node:assert/strict';
import {sortMovers,scannerPanel,MOVER_COLUMNS} from '../modules/beta-view.mjs';
import {journalCalendar,betaFieldGroup,SETTINGS_GROUPS} from '../modules/ui-forms.mjs';
import {journalView} from '../modules/visual-settings.mjs';

test('Mover columns sort both ways without mutation, ties stay stable and missing values stay last',()=>{
 const rows=[{symbol:'ZZZ',change:3,gap:-2,rvol:1,relativeSPY:2},{symbol:'AAA',change:-1,gap:5,rvol:4,relativeSPY:-3},{symbol:'MISSING'},{symbol:'TIE',change:3,gap:-2,rvol:1,relativeSPY:2}],before=structuredClone(rows);
 for(const [key]of MOVER_COLUMNS)for(const direction of ['asc','desc']){const sorted=sortMovers(rows,{key,direction});assert.notEqual(sorted,rows);if(key!=='symbol'){assert.equal(sorted.at(-1).symbol,'MISSING');assert.ok(sorted.indexOf(rows[0])<sorted.indexOf(rows[3]));}const values=sorted.map(r=>r[key]).filter(v=>key==='symbol'||Number.isFinite(v));for(let i=1;i<values.length;i++){const comparison=key==='symbol'?values[i-1].localeCompare(values[i]):values[i-1]-values[i];assert.ok(direction==='asc'?comparison<=0:comparison>=0);}}
 assert.deepEqual(rows,before);
 const html=scannerPanel({movers:rows},{key:'gap',direction:'asc'});assert.equal((html.match(/data-mover-sort=/g)||[]).length,5);assert.match(html,/aria-sort="ascending"><button[^>]+data-mover-sort="gap"/);assert.ok(html.indexOf('Stocks in play today')<html.indexOf('Scanner coverage & track record'));
});

test('Journal calendar places each record in a dated week with independent edit and date beneath its square',()=>{
 const rows=[{id:'a',symbol:'AAA',market:'stocks',decision:'taken',time:'2026-11-02T07:30:00Z',closedAt:'2026-11-02T08:30:00Z',pnl:20},{id:'b',symbol:'BBB',market:'options',decision:'taken',time:'2026-11-02T09:00:00Z',closedAt:'2026-11-02T10:00:00Z',pnl:-10},{id:'c',symbol:'CCC',market:'crypto',decision:'skipped',time:'2026-11-01T07:30:00Z',pnl:null}],before=structuredClone(rows),view=journalView(rows,{timezone:'America/Los_Angeles',sort:'highest'}),html=journalCalendar(view.rows,{timezone:view.timezone,sort:'highest',now:Date.parse('2026-11-04T12:00:00Z')});
 assert.equal((html.match(/class="journal-trade"/g)||[]).length,3);for(const row of rows)assert.ok(html.includes('data-edit="'+row.id+'"'));
 assert.ok(html.indexOf('data-edit="a"')<html.indexOf('data-edit="b"'));assert.match(html,/Edit \/ close<\/button><h3>AAA/);assert.match(html,/<\/div><time datetime="2026-11-02">/);assert.equal((html.match(/class="journal-calendar-day"/g)||[]).length,14);assert.match(html,/datetime="2026-11-01"/);assert.match(html,/P\/L sort within each date/);assert.deepEqual(rows,before);
});

test('Calendar includes the selected month weeks and preserves undated records; paper target joins signals',()=>{
 const html=journalCalendar([{id:'bad',symbol:'BAD',time:'invalid'}],{period:'month',now:Date.parse('2026-11-04T12:00:00Z'),timezone:'UTC'});assert.match(html,/Week of Mon, Nov 2, 2026/);assert.match(html,/Week of Mon, Oct 26, 2026/);assert.match(html,/Date unavailable/);assert.match(html,/data-edit="bad"/);assert.equal(betaFieldGroup('forwardExitMode'),'signals');assert.ok(!SETTINGS_GROUPS.some(([id])=>id==='paper'));
});
