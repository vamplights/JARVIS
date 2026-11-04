// Setup qualification is separate from selection, execution and model calibration.
export const entryExpiresAt=(signal,settings={})=>signal.expiresAt??signal.confirmedAt+signal.tf*60000*(signal.callWindowBars??settings.callWindowBars??2);
export const staleFor=(s,market)=>market==='stocks'?(s.stockStaleSeconds??s.staleSeconds??30):(s.staleSeconds??30);
export function patternQualification({confirmed,failures,settings,params={},strategy}){
 if(settings.qualificationMode!=='balanced')return {status:!confirmed?'SETUP FORMING':failures.length?'WATCH':'CONFIRMED',requiredFailures:failures,optionalFailures:[],entryQualified:confirmed&&!failures.length};
 const optional=message=>/Trend, momentum and volume|Weak relative volume|Nearby structure|Estimated costs|Spread unavailable|Broad-market|Benchmark regime|No verified shortable/.test(message)
  ||/Choppy market|Trend\/breakout strategies/.test(message)&&!strategy.startsWith('ema')
  ||/Higher-timeframe/.test(message)&&!(params.requireHigherTF??strategy.startsWith('ema'));
 const optionalFailures=failures.filter(optional),requiredFailures=failures.filter(f=>!optional(f));
 return {status:!confirmed?'SETUP FORMING':requiredFailures.length?'WATCH':'CONFIRMED',requiredFailures,optionalFailures,entryQualified:confirmed&&!failures.length};
}
export function friendStylePreset(current){const s=structuredClone(current);s.experienceVersion=1;s.qualificationMode='balanced';s.allowOneMinute=true;s.callWindowBars=3;s.stockStaleSeconds=150;s.minScore=60;s.minWatchScore=45;s.stockFrames=[1,3,5,15];s.cryptoFrames=[5,15,60,1440];s.cryptoFrame=5;s.strategies=[...new Set([...s.strategies,'momentum'])];s.strategyMarketFrames??={};s.strategyMarketFrames.stocks??={};s.strategyMarketFrames.crypto??={};
 for(const id of ['ema-cross','ema-retest','momentum','orb5','orb5-retest','orb15','orb15-retest'])s.strategyMarketFrames.stocks[id]=[...new Set([1,...(s.strategyMarketFrames.stocks[id]||[3,5,15])])];
 s.strategyMarketFrames.stocks.momentum=[1,3];s.strategyMarketFrames.crypto.momentum=[5,15];s.strategyFrames.momentum=[1,3,5,15];s.strategyParams.momentum={...s.strategyParams.momentum,consolidationBars:10,consolidationMaxATR:2.5,breakoutBodyATR:.6,minDayMovePct:1.5};s.topPicks={minScore:80,minProbability:.35,minExpectedR:0,...s.topPicks};s.studyMode=false;s.sourcePreference='cnbc';return s;
}
export const selectedWinEstimate=s=>s.confidenceEstimate??s.profitEstimate??{};
export function topPickReasons(signal,settings,now=Date.now()){
 const reasons=[],p=selectedWinEstimate(signal),t=settings.topPicks||{};
 if(settings.studyMode)reasons.push('Study mode: calls paused');
 if(signal.status!=='CONFIRMED')reasons.push('Setup is not confirmed');
 if(signal.replay||signal.legacyProfile||signal.inspectionOnly||signal.conflicted)reasons.push('Not a current live setup');
 if(!Number.isFinite(signal.confirmedAt)||signal.confirmedAt>now)reasons.push('Invalid signal confirmation time');
 if(now>=entryExpiresAt(signal,settings))reasons.push('Entry window expired');
 if(!Number.isFinite(signal.quoteTime)||signal.quoteTime>now+5000||now-signal.quoteTime>staleFor(settings,signal.market)*1000)reasons.push('Current price unavailable');
 if((signal.score||0)<(t.minScore??80))reasons.push('Setup score below '+(t.minScore??80));
 if(p.muted)reasons.push('Setup muted by measured losing outcomes');
 if(signal.market==='crypto'&&signal.dir<0&&!signal.leverage?.suggested)reasons.push('Bearish spot setup; short product unverified');
 const modeled=p.kind==='outcome-model'||(!p.kind&&Number.isFinite(p.probability));
 if(modeled&&p.probability<(t.minProbability??.35))reasons.push('Estimated win percent below threshold');
 if(!modeled&&p.matchingN>=15&&Number.isFinite(p.historicalAvgR)&&p.historicalAvgR<=(t.minExpectedR??0))reasons.push('Matching historical results are not positive after costs');
 // No model/history is not an automatic veto. Uncalibrated picks invent no percentage.
 return reasons;
}
