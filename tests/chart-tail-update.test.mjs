import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyChartTail,volumePoint} from '../modules/live-chart-data.mjs';
import {emaStep,vwapStep} from '../modules/chart-indicators.mjs';
import {renameReplace} from '../modules/atomic-write.mjs';

const bar=(i,close=100+i,extra={})=>({time:1790000000+i*300,open:100+i,high:Math.max(100+i,close)+1,low:Math.min(100+i,close)-1,close,volume:10+i,complete:true,...extra});
const series=()=>{const points=new Map();return {points,setData(rows){points.clear();for(const r of rows)points.set(r.time,r);},update(r){points.set(r.time,r);}};};
function chart(rows){
 const view={rows,display:rows,candles:series(),volume:series(),lines:[]};
 view.candles.setData(rows);view.volume.setData(rows.map(volumePoint));
 for(const step of [(s,b)=>emaStep(s,b,5),(s,b)=>vwapStep(s,b,'crypto',300)]){const line={series:series(),states:[],step};for(const b of rows)line.states.push(step(line.states.at(-1),b));line.series.setData(line.states.map(s=>s.point));view.lines.push(line);}
 return view;
}
const snapshot=view=>JSON.stringify([[...view.candles.points.values()],[...view.volume.points.values()],view.lines.map(l=>[[...l.series.points.values()],l.states])]);

test('Tail updates match a full repaint when the forming candle moves or new candles arrive',()=>{
 const base=Array.from({length:40},(_,i)=>bar(i));base[39]={...base[39],complete:false};
 const view=chart(base.map(b=>({...b})));
 const next=[...base.slice(0,39).map(b=>({...b})),bar(39,150),bar(40,151),bar(41,149,{complete:false})];
 assert.equal(applyChartTail(view,next),true);
 assert.equal(view.rows.length,42);assert.equal(view.display,view.rows);
 assert.equal(snapshot(view),snapshot(chart(next.map(b=>({...b})))));
 assert.equal(applyChartTail(view,next.map(b=>({...b}))),true);
 assert.equal(snapshot(view),snapshot(chart(next.map(b=>({...b})))));
});

test('Tail updates decline corrected history, a different window or mismatched indicator state',()=>{
 const base=Array.from({length:20},(_,i)=>bar(i));
 const corrected=base.map(b=>({...b}));corrected[5].close+=.5;
 let view=chart(base.map(b=>({...b}))),before=snapshot(view);
 assert.equal(applyChartTail(view,corrected),false);assert.equal(snapshot(view),before);
 assert.equal(applyChartTail(view,base.slice(1).map(b=>({...b}))),false);
 assert.equal(applyChartTail(view,base.slice(0,19).map(b=>({...b}))),false);
 view.lines[0].states.pop();assert.equal(applyChartTail(view,base.map(b=>({...b}))),false);
 view=chart(base.map(b=>({...b})));view.display=[...view.rows];assert.equal(applyChartTail(view,base.map(b=>({...b}))),false);
});

test('A briefly locked destination is retried; other rename failures are reported immediately',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-atomic-')),from=path.join(dir,'a.tmp'),to=path.join(dir,'a.json'),real=fs.renameSync;
 try{
  fs.writeFileSync(from,'new');let calls=0;
  fs.renameSync=(...args)=>{if(++calls<3)throw Object.assign(Error('locked'),{code:'EPERM'});return real(...args);};
  renameReplace(from,to);assert.equal(calls,3);assert.equal(fs.readFileSync(to,'utf8'),'new');
  calls=0;fs.renameSync=()=>{calls++;throw Object.assign(Error('missing'),{code:'ENOENT'});};
  assert.throws(()=>renameReplace(from,to),/missing/);assert.equal(calls,1);
 }finally{fs.renameSync=real;fs.rmSync(dir,{recursive:true,force:true});}
});

test('Date parts match the time-zone formatter, including daylight-saving edges',async()=>{
 const {parts}=await import('../modules/engine.mjs'),format=new Map();
 const reference=(t,zone)=>{if(!format.has(zone))format.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));const p=Object.fromEntries(format.get(zone).formatToParts(new Date(t)).map(x=>[x.type,x.value]));return {...p,date:`${p.year}-${p.month}-${p.day}`,minutes:+p.hour*60 + +p.minute};};
 for(const zone of ['America/New_York','America/Los_Angeles','UTC','Asia/Kolkata','Australia/Lord_Howe'])
  for(const [month,day] of [[2,7],[9,3],[10,1]])for(let s=Date.UTC(2026,month,day);s<Date.UTC(2026,month,day+2);s+=900000)
   for(const t of [s-1,s,s+899999])assert.deepEqual({...parts(t,zone)},reference(t,zone),zone+' '+t);
 assert.equal(parts(5,'UTC'),parts(5,'UTC'));assert.throws(()=>parts(NaN,'UTC'));
});
