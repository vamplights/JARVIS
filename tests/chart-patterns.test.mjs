import test from 'node:test';
import assert from 'node:assert/strict';
import {detectPatterns,confirmedPivots,patternSettings,analysisInput,advanceFormation,followupCandidates,supportingEvidence} from '../chart-patterns.mjs';
import {S,T,candles,mirror,boundary,extrema,bowl,candleShape} from './chart-pattern-fixtures.mjs';
const detected=(b,s=S,market='crypto')=>detectPatterns(b,{settings:s,market,tf:5});
const cases=[
 ['ascending-triangle','descending-triangle',()=>boundary(0,.05)],
 ['symmetrical-triangle','symmetrical-triangle',()=>boundary(-.025,.025)],
 ['rectangle','rectangle',()=>boundary(0,0)],
 ['rising-wedge','falling-wedge',()=>boundary(.025,.06,{impulse:4})],
 ['bull-flag','bear-flag',()=>boundary(-.03,-.03,{impulse:10,width:2})],
 ['bull-pennant','bear-pennant',()=>boundary(-.02,.02,{impulse:10,width:2})],
 ['double-top','double-bottom',()=>extrema([102,98,102])],
 ['triple-top','triple-bottom',()=>extrema([102,98,102,98,102])],
 ['head-shoulders','inverse-head-shoulders',()=>extrema([102,98,105,98,102])],
 ['rounding-bottom','rounding-top',()=>bowl()],
 ['cup-handle','inverted-cup-handle',()=>bowl(true)],
 ['resistance-breakout','support-breakdown',()=>boundary(0,0)],
 ['resistance-rejection','support-bounce',()=>boundary(0,.05)],
 ['bull-ma-cross','bear-ma-cross',()=>boundary(-.025,.025)],
 ['bull-ma-retest','bear-ma-retest',()=>extrema([102,98,102])],
 ['vwap-rejection','vwap-pullback',()=>boundary(-.05,0)],
 ['bull-engulfing','bear-engulfing',()=>candleShape('engulf')],
 ['hammer','shooting-star',()=>candleShape('hammer')],
 ['bull-harami','bear-harami',()=>candleShape('harami')],
 ['piercing','dark-cloud',()=>candleShape('piercing')],
 ['morning-star','evening-star',()=>candleShape('star')]
];
for(const [normal,inverse,build]of cases)for(const flip of [false,true])test('Named detector: '+(flip?inverse:normal),()=>{
 const b=flip?mirror(build()):build(),rows=detected(b),kind=flip?inverse:normal;
 assert.ok(rows.some(r=>r.kind===kind),rows.map(x=>x.kind).join(','));
 assert.ok(rows.every(x=>!('price'in x)&&!('stop'in x)&&!('target'in x)&&!('size'in x)));
 assert.equal(detected(candles(b.map(()=>100))).some(r=>r.kind===kind),false,'Flat lookalike must not qualify');
});
test('Lookalikes reject missing impulse, unequal extrema, deep handles, wrong trend and absent curvature',()=>{
 assert.equal(detected(boundary(-.03,-.03,{width:2})).some(x=>x.kind==='bull-flag'),false);
 assert.equal(detected(boundary(-.02,.02,{width:2})).some(x=>x.kind==='bull-pennant'),false);
 assert.equal(detected(extrema([102,98,105])).some(x=>x.kind==='double-top'),false);
 assert.equal(detected(extrema([102,98,102,98,105])).some(x=>x.kind==='triple-top'),false);
 assert.equal(detected(extrema([102,98,102,98,102])).some(x=>x.kind==='head-shoulders'),false);
 const deep=bowl(true);deep[72].low=92;deep[72].close=93;deep[72].open=93;assert.equal(detected(deep).some(x=>x.kind==='cup-handle'),false);
 for(const kind of ['engulf','hammer','harami','piercing','star']){const b=candleShape(kind);for(let i=0;i<b.length-3;i++){const shift=(i-28)*.7;for(const k of ['open','high','low','close'])b[i][k]+=shift;}assert.equal(detected(b).some(x=>['bull-engulfing','hammer','bull-harami','piercing','morning-star'].includes(x.kind)),false);}
 assert.equal(detected(boundary(0,0)).some(x=>['cup-handle','rounding-top'].includes(x.kind)),false);
});
test('Neutral doji and unbroken symmetrical triangle do not invent direction',()=>{const rows=detected(boundary(-.025,.025));assert.ok(rows.some(x=>x.kind==='symmetrical-triangle'&&x.dir===0&&!x.trigger));assert.ok(rows.some(x=>x.kind==='doji'&&x.dir===0));});
test('Symmetrical triangles and ranges choose direction from the actual break',()=>{for(const [hs,ls,kind]of [[-.025,.025,'symmetrical-triangle'],[0,0,'rectangle']])for(const dir of [1,-1]){const b=boundary(hs,ls);Object.assign(b.at(-1),dir>0?{open:102,close:104,high:104.2,low:101.9}:{open:98,close:96,high:98.2,low:95.8});assert.ok(detected(b).some(x=>x.kind===kind&&x.dir===dir&&x.trigger));}});
test('Pivots become knowable only after complete right-hand confirmation',()=>{const b=candles([100,102,100,99,101]);assert.equal(confirmedPivots(b.slice(0,2),1).length,0);const p=confirmedPivots(b.slice(0,3),1)[0];assert.equal(p.time,b[1].time);assert.equal(p.knownTime,b[2].time);b[2].complete=false;assert.equal(confirmedPivots(b.slice(0,3),1).length,0);});
export const fixture=()=>({kind:'rectangle',name:'Rectangle',dir:1,anchorTime:T,startTime:T,knownAt:(T+300)*1000,upper:102,lower:98,confirmationLevel:102,invalidationLevel:98,points:[],lines:[{t1:T,t2:T+600,p1:102,p2:102,role:'resistance'}],evidence:[],trigger:false});
const meta={symbol:'TEST',source:'Fixture',freshness:'historical',atr:1};
test('Lifecycle covers forming, provisional, confirmed, failed, expired; frozen geometry/time survive',()=>{
 const c=fixture();let b=candles([100])[0],r=advanceFormation(null,c,b,5,S,meta);assert.equal(r.status,'forming');
 b={...b,time:T+300,close:103,high:104,complete:false};r=advanceFormation(r,{...c,trigger:true},b,5,S,meta);assert.equal(r.status,'provisional');assert.equal(r.confirmedAt,undefined);
 b.complete=true;r=advanceFormation(r,{...c,trigger:true},b,5,S,meta);assert.equal(r.status,'confirmed');const geometry=structuredClone(r.confirmedGeometry),at=r.confirmedAt;
 r=advanceFormation(r,{...c,upper:900,trigger:false},{...b,time:T+600,close:97},5,S,meta);assert.equal(r.status,'failed');assert.deepEqual(r.confirmedGeometry,geometry);assert.equal(r.confirmedAt,at);
 assert.equal(advanceFormation({...advanceFormation(null,c,b,5,S,meta),ageBars:S.expirationBars},c,{...b,time:T+(S.expirationBars+3)*300,close:100},5,S,meta).status,'expired');
});
test('Linked bullish/bearish retests, failed breaks and opening retests',()=>{for(const dir of [1,-1]){
 const c={...fixture(),dir,confirmationLevel:100,kind:dir>0?'resistance-breakout':'support-breakdown'},r={...c,id:'origin'+dir,confirmedAt:(T+300)*1000,confirmedCandle:T,status:'confirmed',confirmedGeometry:{lines:c.lines,points:[]}},b=candles([100,100.8],T+300);
 b.at(-1).low=99.9;b.at(-1).high=101;if(dir<0){b.at(-1).close=99.2;b.at(-1).high=100.1;}
 const ret=followupCandidates([r],b,5,S,1)[0];assert.equal(ret.kind,dir>0?'breakout-retest':'breakdown-retest');assert.equal(ret.originId,r.id);assert.equal(ret.trigger,true);
 b.at(-1).close=dir>0?99:101;const failed=followupCandidates([r],b,5,S,1)[0];assert.equal(failed.kind,dir>0?'failed-breakout':'failed-breakdown');assert.equal(failed.dir,-dir);
 assert.equal(followupCandidates([{...r,kind:'opening-range'}],b.map(x=>({...x,close:dir>0?100.8:99.2})),5,S,1)[0].kind,'opening-range-retest');
}});
test('Input gates stale, historical, mixed source, missing candles, synthetic volume and unfinished bars',()=>{
 const bars=candles(Array.from({length:60},(_,i)=>100+i*.02)),now=(bars.at(-1).time+300)*1000,asset={symbol:'TEST',market:'crypto',source:'Fixture',base:300,bars,quote:{price:101,time:now}};
 assert.equal(analysisInput(asset,5,now+999999,S).freshness,'stale');assert.equal(analysisInput({...asset,replay:true},5,now+999999,S).freshness,'historical');
 const mixed=structuredClone(asset);mixed.bars[4].source='Other';assert.match(analysisInput(mixed,5,now,S).reason,/Mixed/);
 const gap=structuredClone(asset);gap.bars.splice(30,1);assert.equal(analysisInput(gap,5,now,S).bars.length,29);
 const synthetic=structuredClone(asset);synthetic.bars[5].syntheticVolume=true;assert.equal(analysisInput(synthetic,5,now,S).volumeValid,false);
 const unfinished=structuredClone(asset);unfinished.bars.at(-1).complete=false;assert.equal(analysisInput(unfinished,5,now,S).bars.at(-1).complete,false);
 assert.equal(supportingEvidence(bars,[],false,S)[0].pass,false);
});
test('Settings reject unknown/cohort fields and unsafe bounds',()=>{for(const p of [{enabled:'yes'},{strategies:[]},{risk:3},{lookback:99999},{frames:[2]},{fastMA:30,slowMA:5}])assert.throws(()=>patternSettings(p));assert.equal(patternSettings().enabled,false);});
test('Formation expiry counts completed candles rather than overnight/weekend wall time',()=>{const c=fixture(),b=candles([100])[0],first=advanceFormation(null,c,b,5,S,meta),later=advanceFormation(first,c,{...b,time:b.time+3*86400},5,S,meta);assert.equal(later.status,'forming');assert.equal(later.ageBars,1);const partial=advanceFormation(later,c,{...b,time:later.lastCompletedCandle+300,complete:false},5,S,meta);assert.equal(partial.ageBars,1);assert.equal(advanceFormation(partial,c,{...b,time:partial.lastEvaluatedCandle},5,S,meta).ageBars,2);});
