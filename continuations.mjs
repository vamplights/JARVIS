// Closed-candle continuation sequences adapted from Rishi JARVIS. These helpers
// see only the supplied prefix; they never read quotes or future bars.
const resume=(b,k,d)=>k>0&&(d>0?b[k].close>b[k-1].high:b[k].close<b[k-1].low);
const check=(name,pass,detail)=>({name,pass,detail,weight:0});
export function continuationParams(p,market){return {...p,vwapTrendBars:p.vwapTrendBars??(market==='stocks'?20:24),vwapSideFraction:p.vwapSideFraction??(market==='stocks'?.8:.75),vwapMaxCrosses:p.vwapMaxCrosses??(market==='stocks'?2:3),vwapMinSessionBars:p.vwapMinSessionBars??(market==='stocks'?10:12),vwapRequireEMASlope:p.vwapRequireEMASlope??market==='crypto'};}
function pendingOrResume(b,touch,dir,maxBars){const i=b.length-1;if(i-touch>maxBars)return null;for(let k=touch+1;k<i;k++)if(resume(b,k,dir))return null;return {confirmed:touch<i&&resume(b,i,dir),touch};}
export function emaContinuation(b,ema,atr,dir,cross,p){const i=b.length-1;if(cross<0||cross>=i)return null;
 for(let k=cross+1;k<=i;k++)if((b[k].close-ema[k])*dir<-.1*atr[k])return null;
 let peak=-1,move=-Infinity;for(let k=cross;k<i;k++){const distance=((dir>0?b[k].high:b[k].low)-ema[k])*dir/atr[k];if(distance>move){move=distance;peak=k;}}
 if(peak<0||move<p.minMoveATR)return null;
 let touch=-1;for(let k=i;k>peak;k--)if(dir>0?b[k].low<=ema[k]+p.continuationTouchATR*atr[k]:b[k].high>=ema[k]-p.continuationTouchATR*atr[k]){touch=k;break;}
 if(touch<0)return null;const state=pendingOrResume(b,touch,dir,p.resumptionBars);if(!state)return null;
 return {...state,anchor:b[touch].time,level:ema[i],checks:[check('Move away after EMA cross',true,move.toFixed(2)+' ATR; minimum '+p.minMoveATR),check('Later high/low resumption',state.confirmed,'A later close must clear the prior candle '+(dir>0?'high':'low'))]};
}
export function levelContinuation(b,atr,dir,breakIndex,level,p){const i=b.length-1;if(breakIndex>=i)return null;let touch=-1;
 for(let k=breakIndex+1;k<=i;k++){if((b[k].close-level)*dir<-.15*atr[k])return null;if(touch<0&&(dir>0?b[k].low<=level+p.continuationTouchATR*atr[k]:b[k].high>=level-p.continuationTouchATR*atr[k]))touch=k;}
 if(touch<0)return null;const state=pendingOrResume(b,touch,dir,p.resumptionBars);if(!state)return null;
 return {...state,anchor:b[breakIndex].time,level,checks:[check('First retest held',true,'Use the first pullback after this breakout'),check('Later high/low resumption',state.confirmed,'A later candle must close beyond the prior high/low')]};
}
export function vwapContinuation(b,ema,atr,vwap,dir,sessionStart,p){const i=b.length-1,since=i-sessionStart;if(since<p.vwapMinSessionBars||!Number.isFinite(vwap[i]))return null;
 const n=Math.min(p.vwapTrendBars,since),window=b.slice(i-n+1,i+1);let side=0,crosses=0;
 for(let k=i-n+1;k<=i;k++)if((b[k].close-vwap[k])*dir>0)side++;
 for(let k=Math.max(sessionStart+1,i-29);k<=i;k++)if((b[k].close-vwap[k])*(b[k-1].close-vwap[k-1])<0)crosses++;
 const slope=vwap[i]-vwap[Math.max(sessionStart,i-Math.min(10,since))],checks=[check('Holding VWAP side',side/n>=p.vwapSideFraction,Math.round(100*side/n)+'% of '+window.length+' closes; minimum '+Math.round(100*p.vwapSideFraction)+'%'),check('VWAP direction',slope*dir>0,'Completed VWAP slope must agree'),check('Trend day (few VWAP crosses)',crosses<=p.vwapMaxCrosses,crosses+' crosses; maximum '+p.vwapMaxCrosses)];
 if(p.vwapRequireEMASlope)checks.push(check('EMA slope for VWAP',i>=5&&(ema[i]-ema[i-5])*dir>0,'Completed EMA slope must agree'));
 let touch=-1;for(let k=i;k>=Math.max(sessionStart,i-3);k--){const touched=dir>0?b[k].low<=vwap[k]+p.touchATR*atr[k]||b[k].low<=ema[k]+.1*atr[k]:b[k].high>=vwap[k]-p.touchATR*atr[k]||b[k].high>=ema[k]-.1*atr[k];if(touched&&(b[k].close-vwap[k])*dir>=0){touch=k;break;}}
 if(touch<0)return null;const state=pendingOrResume(b,touch,dir,p.resumptionBars);if(!state)return null;
 return {...state,anchor:b[touch].time,level:vwap[i],checks:[...checks,check('Later high/low resumption',state.confirmed,'First touch forms; a later high/low break confirms')]};
}
