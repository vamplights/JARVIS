import {ReplaySeries} from './replay-series.mjs';
// Fixed-parameter chronological walk-forward evaluation. No future fold selects parameters.
import {aggregate,backtest,metrics} from './engine.mjs';
import {summarizeR} from './stats.mjs';
export function walkForward(input){
 const bars=aggregate(input.bars,input.tf,input.base,Date.now()-2000).filter(b=>b.complete);
 const trainBars=Number(input.trainBars||120),embargo=12,testBars=Number(input.testBars||Math.max(60,Math.ceil((bars.length-trainBars-embargo)/20)));
 if(!Number.isInteger(trainBars)||trainBars<100||!Number.isInteger(testBars)||testBars<30)throw Error('Use at least 100 training bars and 30 test bars');
 if(bars.length<trainBars+embargo+testBars)throw Error('Not enough complete candles for a training window, 12-bar embargo and test window');
 const folds=[],trades=[],evaluationCache=input.evaluationCache||new Map(),prepared=input.prepared||new ReplaySeries(input);
 for(let start=trainBars+embargo;start<bars.length-1;start+=testBars){
  if(folds.length>=20)throw Error('More than 20 folds requested; increase the test-window length');
  const end=Math.min(bars.length,start+testBars),cutoff=(bars[end-1].time+input.tf*60)*1000;
  const result=backtest({...input,bars:input.bars.filter(b=>(b.time+input.base)*1000<=cutoff),splitIndex:start,embargoBars:embargo,evaluationCache,prepared});
  const held=result.trades.filter(t=>t.segment==='out-of-sample');trades.push(...held);
  folds.push({number:folds.length+1,trainEnd:(bars[start-embargo-1].time+input.tf*60)*1000,testStart:bars[start].time*1000,testEnd:cutoff,metrics:metrics(held)});
 }
 return {kind:'walk-forward',symbol:input.symbol,market:input.market,strategy:input.strategy,tf:input.tf,folds,trades,outOfSample:metrics(trades),expectancyR:summarizeR(trades.filter(t=>!t.targetCapped)),settings:structuredClone(input.settings),method:'Expanding history, fixed user parameters, disjoint test windows, 12-bar embargo before each test. No automated parameter search. Folds share training history, so they are not independent trials.',warning:'Selected-symbol universe: survivorship bias cannot be removed without point-in-time membership and delisted-symbol data. Historical option quotes unavailable; no synthetic options P/L is reported.'};
}
