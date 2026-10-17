import test from 'node:test';
import assert from 'node:assert/strict';
import {combineSignals,cancelOpposingSignals} from '../confluence.mjs';
import {DEFAULTS,evaluate,mergeSignals,riskState,applyGates} from '../engine.mjs';
import {validateSettings} from '../settings.mjs';
import {observeSignalOutcomes} from '../signal-outcomes.mjs';
import {settingsProfile} from '../stats.mjs';
import {sourceGate} from '../source-integrity.mjs';
import {explainSignal,probabilityText,modelExplanation} from '../signal-view.mjs';
const now=Date.parse('2026-10-08T14:00:00Z'),s={id:'one',setupKey:'cross-family',symbol:'SPY',market:'stocks',tf:3,strategy:'ema-cross',name:'EMA',dir:1,confirmedAt:now,time:now-180000,source:'Robinhood',status:'CONFIRMED',warnings:[],price:100,entry:[99.99,100.01],stop:99.75,target:100.5,rr:2,netRR:1.7,size:{size:10,plannedRisk:3,notional:1000},atr:.2,adx:25,rvol:2,efficiency:.6,extension:.1,stopATR:1.25};
test('Same-stock same-close same-direction strategies combine once with exact conservative primary levels',()=>{
 const second={...s,id:'two',setupKey:'vwap-family',strategy:'vwap',netRR:1.8,stop:99.8};const groups=combineSignals([s,second]);assert.equal(groups.length,1);const c=groups[0];assert.deepEqual(c.strategies,['ema-cross','vwap']);assert.equal(c.confluenceCount,2);assert.equal(c.stop,s.stop);assert.equal(c.target,s.target);assert.equal(c.size.size,10);assert.equal(c.status,'CONFIRMED');assert.deepEqual(combineSignals([second,s]),groups);
 const data={observations:[]},asset={SPY:{source:'Robinhood',base:60,bars:[],quote:{price:100,time:now}}};observeSignalOutcomes(data,[c,c],asset,DEFAULTS,now);assert.equal(data.observations.length,1);assert.equal(data.observations[0].features.confluenceCount,2);assert.deepEqual(data.observations[0].features.strategies,c.strategies);assert.equal(riskState([{id:'x',time:now,decision:'taken'}],DEFAULTS,now).used,1);
 const frozen=mergeSignals([c],[{...c,stop:98,target:105}],now+1000)[0];assert.equal(frozen.stop,99.75);assert.equal(frozen.target,100.5);
 const gated=applyGates(c,riskState([],DEFAULTS,now),DEFAULTS,now,{price:100,time:now},[{decision:'taken',setupKey:'vwap-family'}]);assert.equal(gated.status,'BLOCKED BY RISK RULE');
});
test('Independent opposing strategies keep their own plans; other candles, frames and sources do not merge',()=>{
 const groups=combineSignals([s,{...s,id:'opposite',strategy:'vwap',dir:-1}]);assert.equal(groups.length,2);assert.ok(groups.every(x=>x.status==='CONFIRMED'&&x.size.size===10&&!x.conflicted));
 assert.equal(combineSignals([s,{...s,confirmedAt:now+180000},{...s,tf:5},{...s,source:'Yahoo Finance'}]).length,4);
 const opposite=[s,{...s,id:'five',tf:5,dir:-1}];assert.deepEqual(cancelOpposingSignals(opposite,now),opposite);
});

const relaxed={...structuredClone(DEFAULTS),cryptoAfterHours:false,strategies:['momentum'],strategyFrames:{momentum:[5]},minScore:0,minRR:.1,maxExtension:20,maxStopATR:20,filters:{confirmation:false,trend:false,volume:false,chop:false,spread:false},costs:{...DEFAULTS.costs,crypto:{feeBps:0,slippageBps:0,spreadBps:0}}};
const bars=Array.from({length:60},(_,i)=>({time:1791417600+i*300,open:100,close:100,high:100.4,low:99.6,volume:100}));bars.push({time:1791417600+60*300,open:100,close:101,high:101.1,low:99.9,volume:300});
const run=settings=>evaluate({symbol:'BTC-USD',market:'crypto',base:300,tf:5,bars,settings,now:(bars.at(-1).time+300)*1000});
test('Individual consolidation, body, volume, stop buffer/floor, target and higher timeframe controls change actual rules',()=>{
 const baseline=run(relaxed).signals[0];assert.ok(baseline);assert.equal(run({...relaxed,strategyParams:{momentum:{breakoutBodyATR:5}}}).signals.length,0);assert.equal(run({...relaxed,strategyParams:{momentum:{consolidationMaxATR:.1}}}).signals.length,0);
 const volume=run({...relaxed,filters:{...relaxed.filters,volume:true},strategyParams:{momentum:{minRVOL:4}}}).signals[0];assert.equal(volume.status,'WATCH');assert.ok(volume.warnings.includes('Weak relative volume'));
 const floor=run({...relaxed,strategyParams:{momentum:{stopBufferATR:1,minStopATR:2,minStopBps:200,targetR:1}}}).signals[0];assert.ok(floor.stopATR>=2);assert.ok(floor.stopBps>=200);assert.equal(floor.rr,1);assert.notEqual(floor.stop,baseline.stop);
 const high=run({...relaxed,strategyParams:{momentum:{higherCryptoTF:60,requireHigherTF:true}}}).signals[0];assert.equal(high.higherTF,60);assert.equal(high.status,'WATCH');assert.ok(high.warnings.includes('Higher-timeframe EMA needs more history'));
 assert.equal(run({...relaxed,filters:{...relaxed.filters,trend:true},strategyParams:{momentum:{requireHigherTF:false}}}).signals[0].status,'CONFIRMED');
});
test('Per-market strategy frames are independent; settings reject invalid controls and start new cohorts',()=>{
 assert.equal(run({...relaxed,strategyMarketFrames:{crypto:{momentum:[]},stocks:{momentum:[5]}}}).signals.length,0);
 for(const patch of [{strategyParams:{momentum:{lookback:0}}},{strategyParams:{momentum:{touchATR:-1}}},{strategyParams:{vwap:{emaPeriod:3.2}}},{strategyParams:{unknown:{lookback:3}}},{strategyMarketFrames:{crypto:{vwap:[1]}}},{alerts:{volume:2}},{eventBlocks:{CPI:{mode:'random'}}}])assert.throws(()=>validateSettings(patch,structuredClone(DEFAULTS)));
 const changed=validateSettings({strategyParams:{vwap:{touchATR:.3,lookback:12}}},structuredClone(DEFAULTS));assert.notEqual(settingsProfile(changed),settingsProfile(DEFAULTS));assert.equal(settingsProfile({...DEFAULTS,alerts:{...DEFAULTS.alerts,sound:true}}),settingsProfile(DEFAULTS));
});
test('Mixed-provider bars are rejected; adding future data cannot change candle-close features',()=>{
 assert.throws(()=>evaluate({symbol:'SPY',market:'stocks',bars:[{...bars[0],source:'Robinhood'},{...bars[1],source:'Yahoo Finance'}],base:300,tf:5}),/Mixed candle sources/);
 const a=run(relaxed),b=evaluate({symbol:'BTC-USD',market:'crypto',base:300,tf:5,bars:[...bars,{...bars.at(-1),time:bars.at(-1).time+300,close:500,high:501}],settings:relaxed,now:(bars.at(-1).time+300)*1000});assert.deepEqual(a,b);
 const switched=sourceGate(s,{source:'Yahoo Finance'});assert.equal(switched.status,'STALE');assert.equal(switched.stop,s.stop);assert.equal(switched.target,s.target);assert.match(switched.warnings.at(-1),/provider changed/);assert.equal(sourceGate({...s,status:'INVALIDATED'},{source:'Yahoo Finance'}).status,'INVALIDATED');
});
test('Plain English retains EMA identity and exact R presentation never substitutes evidence scores for profit probability',()=>{
 assert.match(explainSignal({...s,strategy:'ema-retest'}),/34 EMA.*bounced.*closed back above/);assert.equal(probabilityText({...s,score:100}),'No outcomes yet');assert.equal(probabilityText({...s,profitEstimate:{probability:.724}}),'72%');const html=modelExplanation({...s,profitEstimate:{probability:.7,expectedR:.123,interval90:[-.04,.31],n:250,drivers:[],reason:'<safe>'}},{esc:v=>String(v).replaceAll('<','&lt;'),num:(v,d)=>v==null?'—':v.toFixed(d)});assert.match(html,/0.123R/);assert.match(html,/90% interval/);assert.match(html,/&lt;safe>/);
});
