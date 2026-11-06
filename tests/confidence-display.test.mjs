import test from 'node:test';
import assert from 'node:assert/strict';
import {fitConfidenceModel,confidencePrediction,confidenceDisplayPrediction} from '../modules/confidence-model.mjs';
import {ModelReview} from '../modules/model-review.mjs';
import {DEFAULTS} from '../modules/engine.mjs';
import {settingsProfile} from '../modules/stats.mjs';
import {trainingCohortKey} from '../modules/confluence.mjs';
import {FEATURE_NAMES,MODEL_PROTOCOL} from '../modules/trend-model.mjs';
import {displayConfidence,probabilityText,modelExplanation} from '../modules/signal-view.mjs';
import {selectedWinEstimate,topPickReasons} from '../modules/signal-policy.mjs';
const start=Date.parse('2026-08-01T12:00Z'),now=start+200*86400000;
const signal={market:'stocks',strategy:'ema-cross',tf:5,dir:1,score:80,confirmedAt:now,quoteTime:now,status:'CONFIRMED',rvol:2,adx:30,efficiency:.5,extension:1,stopATR:1,netRR:2,etHour:10};
const rows=n=>Array.from({length:n},(_,i)=>({id:String(i),market:'stocks',strategy:'ema-cross',tf:5,time:start+i*86400000,closedAt:start+i*86400000+300000,y:i%2,realizedR:i%2?2:-1,source:'historical replay',features:{score:80,regime:'Trending',dir:1}}));
const saved=n=>fitConfidenceModel(rows(n),'stocks',now);
const review=model=>({models:{stocks:{profile:settingsProfile(DEFAULTS),confidence:model}},settings:()=>DEFAULTS});
test('Display history begins at five, with wide uncertainty, while decision threshold remains fifteen',()=>{
 for(const n of [0,4]){const p=confidenceDisplayPrediction(saved(n),signal);assert.equal(p.probability,null);assert.equal(p.n,n);assert.equal(p.required,5);assert.match(probabilityText({displayConfidenceEstimate:p}),new RegExp(n+'/5'));}
 for(const n of [5,14]){const p=confidenceDisplayPrediction(saved(n),signal);assert.equal(p.kind,'small-sample-history');assert.equal(p.n,n);assert.equal(p.probability,Math.floor(n/2)/n);assert.ok(p.interval95[0]<p.probability&&p.interval95[1]>p.probability);assert.equal(confidencePrediction(saved(n),signal).probability,null);}
 assert.equal(confidencePrediction(saved(15),signal).kind,'historical');assert.equal(confidenceDisplayPrediction(saved(15),signal).kind,'historical');
});
test('Trained confidence is preferred and later, mismatched or invalid outcomes cannot create early history',()=>{
 const m=saved(60),p=confidenceDisplayPrediction(m,signal);assert.ok(m.model);assert.equal(p.kind,'outcome-model');assert.equal(p.probability,confidencePrediction(m,signal).probability);
 const five=saved(5);for(const patch of [{market:'crypto'},{protocol:'old'}])assert.equal(confidenceDisplayPrediction({...five,...patch},signal).probability,null);
 assert.equal(confidenceDisplayPrediction(five,{...signal,tf:3}).probability,null);
 const future={...five,outcomes:[...five.outcomes.slice(0,4),{...five.outcomes[4],closedAt:now}]};assert.equal(confidenceDisplayPrediction(future,signal).probability,null);
 const invalid={...five,outcomes:five.outcomes.map((r,i)=>i===4?{...r,y:NaN}:r)};assert.equal(confidenceDisplayPrediction(invalid,signal).probability,null);
});
test('Server display rejects incompatible profiles and legacy signals',()=>{
 const context=review(saved(5));assert.ok(Number.isFinite(ModelReview.prototype.displayConfidence.call(context,signal).probability));
 context.models.stocks.profile='old';assert.equal(ModelReview.prototype.displayConfidence.call(context,signal).probability,null);
 context.models.stocks.profile=settingsProfile(DEFAULTS);assert.equal(ModelReview.prototype.displayConfidence.call(context,{...signal,legacyProfile:true}).probability,null);
});
test('Eligible profit model is only a display fallback, with causal and protocol checks',()=>{
 const size=FEATURE_NAMES.length,context=review(null),m=context.models.stocks;Object.assign(m,{protocol:MODEL_PROTOCOL,weights:Array(size).fill(0),mean:Array(size).fill(0),scale:Array(size).fill(1),intercept:0,trainEnd:now-1,cohorts:{[trainingCohortKey(signal)]:{n:200,sessions:15,baseRate:.4}},reason:'Earlier outcomes'});
 const p=ModelReview.prototype.displayConfidence.call(context,signal);assert.equal(p.kind,'profit-model-fallback');assert.equal(p.probability,.45);
 m.trainEnd=now;assert.equal(ModelReview.prototype.displayConfidence.call(context,signal).probability,null);m.trainEnd=now-1;m.protocol='old';assert.equal(ModelReview.prototype.displayConfidence.call(context,signal).probability,null);
});
test('Display fallback never changes selection estimates, picks, or certainty labels',()=>{
 const base={...signal,confidenceEstimate:{probability:null,n:0,kind:'unavailable'}},before=topPickReasons(base,DEFAULTS,now),display=confidenceDisplayPrediction(saved(5),signal),s={...base,displayConfidenceEstimate:display};
 assert.equal(selectedWinEstimate(s),base.confidenceEstimate);assert.deepEqual(topPickReasons(s,DEFAULTS,now),before);assert.equal(displayConfidence(s).probability,display.probability);
 assert.equal(displayConfidence({...s,confidenceEstimate:{probability:.7,kind:'outcome-model'}}).probability,.7);
 assert.equal(displayConfidence({...s,confidenceEstimate:{probability:-1}}).probability,display.probability);
 assert.equal(displayConfidence({displayConfidenceEstimate:{probability:0}}).probability,.01);assert.equal(displayConfidence({displayConfidenceEstimate:{probability:Infinity}}).probability,null);
 const html=modelExplanation(s,{esc:String,num:v=>String(v)});assert.match(html,/95% historical win-rate range/);assert.match(html,/Small sample/);
});
