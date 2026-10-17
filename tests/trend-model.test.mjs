import test from 'node:test';
import assert from 'node:assert/strict';
import {FEATURE_NAMES,featureVector,signalFeatures,assertCausalFeatures,fitMarketModel,estimateProfit,collectModelSamples,brierScore,meanInterval90} from '../trend-model.mjs';
const start=Date.parse('2026-07-01T00:00Z');
const feature=(time,win)=>({asOf:time,rvol:win?3:.5,adx:win?40:10,efficiency:win?.8:.2,extension:.2,stopATR:1,netRR:1.8,trendAlignment:true,higherAlignment:win,dir:1,tf:5,etHour:10,confluenceCount:win?2:1,strategies:['ema-cross']});
const samples=market=>Array.from({length:32*30},(_,i)=>{const day=Math.floor(i/30),time=start+day*86400000+i%30*1800000,win=i%2===0,features=feature(time,win);return {id:'s'+i,symbol:market==='stocks'?'SPY':'BTC-USD',strategy:'ema-cross',strategies:['ema-cross'],market,tf:5,time,featureTime:time,candleClose:time,closedAt:time+300000,features,x:featureVector(features,'ema-cross'),y:+win,realizedR:win?(i%4===0?.25:1.5):-.8,source:'historical replay'};});
test('Separate market models use chronological purge/embargo and beat the base-rate baseline on controlled held-out outcomes',()=>{
 const stock=samples('stocks'),crypto=samples('crypto').map(r=>({...r,y:1-r.y,realizedR:-r.realizedR})),all=[...stock,...crypto],m=fitMarketModel(all,'stocks',100),c=fitMarketModel(all,'crypto',101);
 assert.equal(m.trainN,720);assert.equal(m.validationN,240);assert.ok(m.trainEnd+12*5*60000<m.validationStart);assert.ok(m.brier<m.baselineBrier);assert.ok(m.skillScore>0);assert.equal(m.beatsBaseline,true);assert.notDeepEqual(m.weights,c.weights);assert.equal(m.weights.length,FEATURE_NAMES.length);assert.ok(m.calibration.some(r=>r.n>0));
 const s={...stock.at(-1),confirmedAt:stock.at(-1).time,...stock.at(-1).features},p=estimateProfit(m,s);assert.ok(p.probability<.5);assert.equal(p.n,720);assert.ok(p.drivers.some(d=>d.factor==='Trading activity (relative volume)'&&d.changePoints<0));assert.equal(p.expectedR,stock.slice(0,720).reduce((n,r)=>n+r.realizedR,0)/720);assert.deepEqual(p.interval90,meanInterval90(stock.slice(0,720).map(r=>r.realizedR)));
});
test('Later label changes never alter training weights, cohort expected R or baseline',()=>{
 const rows=samples('stocks'),first=fitMarketModel(rows,'stocks',1),cutoff=first.validationStart,changed=fitMarketModel(rows.map(r=>r.time>=cutoff?{...r,y:1-r.y,realizedR:-r.realizedR}:r),'stocks',1);
 assert.deepEqual(first.weights,changed.weights);assert.equal(first.intercept,changed.intercept);assert.deepEqual(first.cohorts,changed.cohorts);assert.equal(changed.beatsBaseline,false);assert.ok(changed.skillScore<=0);assert.equal(changed.status,'no edge');
});
test('Probability is suppressed below 200 training outcomes or 15 sessions and shrinks toward the cohort base rate',()=>{
 const rows=samples('stocks'),model=fitMarketModel(rows,'stocks',1),s={...rows[0],...rows[0].features,confirmedAt:rows[0].time};
 const small={...model,cohorts:{...model.cohorts,'stocks|ema-cross|5':{...model.cohorts['stocks|ema-cross|5'],n:199}}};assert.equal(estimateProfit(small,s).probability,null);assert.match(estimateProfit(small,s).reason,/199\/200/);
 const short={...model,cohorts:{...model.cohorts,'stocks|ema-cross|5':{...model.cohorts['stocks|ema-cross|5'],sessions:14}}};assert.equal(estimateProfit(short,s).probability,null);assert.equal(estimateProfit(fitMarketModel(rows.slice(0,100),'stocks'),s).probability,null);
 const p=estimateProfit(model,s);assert.ok(p.probability>.5&&p.probability<.999);assert.ok(p.probability<1-200/(720+200)*.5+.001);
});
test('Features timestamped after candle close fail causal checks and cannot enter training',()=>{
 const time=start,features=feature(time,true);assert.equal(assertCausalFeatures(features,time),true);assert.throws(()=>assertCausalFeatures({...features,asOf:time+1},time),/after.*candle close/);assert.throws(()=>assertCausalFeatures({...features,timestamps:{volume:time+1}},time),/after.*candle close/);
 const row={...samples('stocks')[0],features:{...features,timestamps:{ema:time+1}},segment:'out-of-sample',closedAt:new Date(time+300000).toISOString()};const runs=[{symbol:'SPY',strategy:'ema-cross',tf:5,profile:'p',completedAt:2,trades:[row]}];assert.equal(collectModelSamples(runs,[],'p').length,0);
});
test('Replay/forward sample collection deduplicates combined trades, rejects overlapping outcomes, cohorts and fallback by default',()=>{
 const rows=samples('stocks').slice(0,3).map(r=>({...r,signalId:r.id,segment:'out-of-sample',closedAt:new Date(r.closedAt).toISOString()})),run={symbol:'SPY',market:'stocks',strategy:'ema-cross',tf:5,source:'Robinhood',profile:'p',completedAt:2,trades:rows};
 const copy={...run,strategy:'vwap',completedAt:3,trades:rows.map(r=>({...r,strategy:'vwap'}))},fallback={...run,source:'Yahoo Finance',fallback:true,completedAt:4,trades:rows.map(r=>({...r,id:'f'+r.id,signalId:'f'+r.id,time:r.time+20000000,featureTime:r.time+20000000,candleClose:r.time+20000000,features:{...r.features,asOf:r.time+20000000},closedAt:new Date(Date.parse(r.closedAt)+20000000).toISOString(),fallback:true}))};
 assert.equal(collectModelSamples([run,copy,fallback],[],'p').length,3);assert.equal(collectModelSamples([run,copy,fallback],[],'p',true).length,6);assert.equal(collectModelSamples([run],[],'different').length,0);
 const forward={...rows[0],id:'forward',key:'forward',protocol:'signal-r-v1',profile:'p',cohort:'confirmed',observedAt:rows[0].time,entryAt:rows[0].time,closedAt:Date.parse(rows[0].closedAt)};assert.equal(collectModelSamples([run],[forward],'p').length,3);
});
test('Brier and expected-R interval measure actual labels, not win-rate targets',()=>{
 assert.ok(Math.abs(brierScore([.8,.2],[1,0])-.04)<1e-12);assert.equal(brierScore([],[]),null);assert.ok(meanInterval90(Array(200).fill(.12)).every(v=>Math.abs(v-.12)<1e-12));
 const s={confirmedAt:start,rvol:2,adx:25,efficiency:.5,extension:.2,stopATR:1,netRR:1.8,dir:1,tf:5,strategy:'ema-cross',strategies:['ema-cross','vwap'],confluenceCount:2};const f=signalFeatures(s),x=featureVector(f,s.strategy);assert.equal(f.asOf,start);assert.equal(x[12],2);assert.equal(x[13],1);assert.equal(x[15],1);
});
