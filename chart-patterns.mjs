// Analysis only. No strategy settings, signals, orders, learning or network access.
import {aggregate, atr, ema, vwap, parts, session} from './engine.mjs';

export const PATTERN_DEFAULTS = Object.freeze({enabled:false,frames:[1,3,5,15,60,1440],lookback:240,minDuration:8,maxDuration:80,swing:2,toleranceATR:.45,minSizeATR:1.5,flatSlopeATR:.06,minSlopeATR:.015,minConvergence:.15,priorTrendBars:8,priorTrendATR:1.5,impulseATR:3,breakoutATR:.12,volumeRatio:1.3,requireVolume:false,expirationBars:24,staleSeconds:120,fastMA:9,slowMA:21,openingMinutes:15});
const ranges={lookback:[80,600],minDuration:[5,40],maxDuration:[10,160],swing:[1,5],toleranceATR:[.05,1],minSizeATR:[.5,10],flatSlopeATR:[.005,.2],minSlopeATR:[.005,.3],minConvergence:[.05,.8],priorTrendBars:[3,30],priorTrendATR:[.25,8],impulseATR:[1,12],breakoutATR:[0,1],volumeRatio:[1,5],expirationBars:[2,160],staleSeconds:[15,1800],fastMA:[2,30],slowMA:[5,80],openingMinutes:[5,60]};
export function patternSettings(p={},base=PATTERN_DEFAULTS){
 if(!p||Array.isArray(p)||typeof p!=='object')throw Error('Analysis settings must be an object');
 for(const k of Object.keys(p))if(!(k in PATTERN_DEFAULTS))throw Error('Unknown analysis setting: '+k);
 const s={...base,...p};for(const k of ['enabled','requireVolume'])if(typeof s[k]!=='boolean')throw Error(k+' must be boolean');
 for(const [k,[lo,hi]]of Object.entries(ranges))if(!Number.isFinite(s[k])||s[k]<lo||s[k]>hi||(!k.endsWith('ATR')&&!['minConvergence','volumeRatio'].includes(k)&&!Number.isInteger(s[k])))throw Error('Invalid analysis '+k);
 if(!Array.isArray(s.frames)||!s.frames.length||s.frames.some(f=>![1,3,5,15,60,1440].includes(f)))throw Error('Invalid analysis timeframes');
 if(s.maxDuration<s.minDuration||s.lookback<s.maxDuration+s.priorTrendBars+2*s.swing||s.fastMA>=s.slowMA)throw Error('Inconsistent analysis durations or moving averages');
 return {...s,frames:[...new Set(s.frames)]};
}
const mean=a=>a.reduce((v,x)=>v+x,0)/(a.length||1),closeAt=(b,tf)=>(b.closeTime??(b.time+tf*60)*1000);
export function confirmedPivots(b,r=2){const out=[];for(let i=r;i<b.length-r;i++){if(!b.slice(i-r,i+r+1).every(x=>x.complete!==false))continue;for(const [side,key,cmp]of [['high','high',(a,c)=>a>c],['low','low',(a,c)=>a<c]])if(b.slice(i-r,i+r+1).every((c,j)=>j===r||cmp(b[i][key],c[key])))out.push({i,time:b[i].time,price:b[i][key],side,knownTime:b[i+r].time});}return out.sort((a,c)=>a.i-c.i);}
function fit(p){const mid=mean(p.map(x=>x.i)),v=mean(p.map(x=>x.price)),den=p.reduce((s,x)=>s+(x.i-mid)**2,0),slope=den?p.reduce((s,x)=>s+(x.i-mid)*(x.price-v),0)/den:0;return {slope,at:i=>v+slope*(i-mid)};}
const line=(b,i,j,p,q,role)=>({t1:b[i].time,p1:p,t2:b[j].time,p2:q,role});
function trend(b,end,s,a){return end>=s.priorTrendBars?(b[end].close-b[end-s.priorTrendBars].close)/a:0;}
function candleEvidence(b,ind,a,s,volumeValid){const i=b.length-1,avg=mean(b.slice(Math.max(0,i-20),i).map(x=>x.volume)),ratio=volumeValid&&avg>0?b[i].volume/avg:null;return [{name:'Volume expansion',pass:ratio!==null&&ratio>=s.volumeRatio,detail:ratio===null?'Missing or synthetic volume; unavailable':ratio.toFixed(2)+'× prior mean'}, {name:'Volume contraction',pass:ratio!==null&&ratio<.8,detail:ratio===null?'Unavailable':ratio.toFixed(2)+'× prior mean'}];}
export function oscillators(b){const c=b.map(x=>x.close),f=ema(c,12),slow=ema(c,26),macd=c.map((_,i)=>f[i]!==null&&slow[i]!==null?f[i]-slow[i]:null),rsi=c.map((_,i)=>{if(i<14)return null;const d=c.slice(i-13,i+1).map((x,j)=>x-c[i-14+j]),g=mean(d.map(x=>Math.max(0,x))),l=mean(d.map(x=>Math.max(0,-x)));return l?100-100/(1+g/l):g?100:50;});return {rsi,macd};}
export function supportingEvidence(b,pivots,volumeValid,s=PATTERN_DEFAULTS){const a=atr(b).at(-1)||1,out=candleEvidence(b,null,a,s,volumeValid),o=oscillators(b);for(const [side,dir]of [['low',1],['high',-1]]){const p=pivots.filter(x=>x.side===side).slice(-2);for(const key of ['rsi','macd']){const valid=p.length===2&&p.every(x=>o[key][x.i]!==null),pass=valid&&(p[1].price-p[0].price)*dir<0&&(o[key][p[1].i]-o[key][p[0].i])*dir>0;out.push({name:(dir>0?'Bullish ':'Bearish ')+key.toUpperCase()+' divergence',pass,detail:valid?'Confirmed pivots at '+p.map(x=>x.time).join(', '):'Insufficient confirmed oscillator pivots',knownTime:valid?p[1].knownTime:null});}}return out;}

// Each candidate carries structural geometry and its own causal confirmation rule.
export function detectPatterns(b,{settings=PATTERN_DEFAULTS,market='crypto',tf=5,volumeValid=true,calendar}={}){
 const s=settings,n=b.length-1,c=b[n],p=b[n-1];if(n<16||!c)return [];
 const a=atr(b.filter(x=>x.complete!==false)).at(-1);if(!(a>0))return [];
 const tol=s.toleranceATR*a,buffer=s.breakoutATR*a,out=[],closed=b.slice(0,n),pv=confirmedPivots(closed,s.swing),highs=pv.filter(x=>x.side==='high'),lows=pv.filter(x=>x.side==='low'),evidence=supportingEvidence(b,pv,volumeValid,s),volOK=!s.requireVolume||evidence[0].pass;
 const add=(kind,name,dir,start,upper,lower,points=[],detail='',extra={})=>{
  if(start<0||!Number.isFinite(upper)||!Number.isFinite(lower)||upper<lower)return;
  const trigger=extra.trigger??(dir===0?(c.close>upper+buffer||c.close<lower-buffer):dir>0?c.close>upper+buffer:c.close<lower-buffer),actual=dir|| (c.close>upper+buffer?1:c.close<lower-buffer?-1:0);
  out.push({kind,name,dir:actual,startTime:b[start].time,anchorTime:extra.anchorTime??b[start].time,knownAt:Math.max(...points.map(x=>((x.knownTime??x.time)+tf*60)*1000),closeAt(p,tf)),upper,lower,confirmationLevel:actual<0?lower:actual>0?upper:null,invalidationLevel:actual<0?upper:actual>0?lower:null,points:points.map(x=>({...x,knownAt:((x.knownTime??x.time)+tf*60)*1000})),lines:extra.lines||[line(b,start,n,upper,upper,'resistance'),line(b,start,n,lower,lower,'support')],trigger:trigger&&volOK,detail,evidence:[...evidence,...(extra.evidence||[])],...extra,dir:actual,trigger:trigger&&volOK});
 };
 // Boundaries need at least two independently confirmed touches on each side.
 for(const duration of [...new Set([s.minDuration,Math.round((s.minDuration+s.maxDuration)/2),s.maxDuration])]){
  const start=n-duration;if(start<s.priorTrendBars)continue;const hp=highs.filter(x=>x.i>=start),lp=lows.filter(x=>x.i>=start);if(hp.length<2||lp.length<2)continue;
  const h=fit(hp),l=fit(lp),u=h.at(n),d=l.at(n),w0=h.at(start)-l.at(start),w=u-d,hs=h.slope/a,ls=l.slope/a,flatH=Math.abs(hs)<=s.flatSlopeATR,flatL=Math.abs(ls)<=s.flatSlopeATR,converge=w0>0&&(w0-w)/w0>=s.minConvergence,inside=closed.slice(start).every((x,j)=>x.close<=h.at(start+j)+tol&&x.close>=l.at(start+j)-tol),fitOK=hp.every(x=>Math.abs(x.price-h.at(x.i))<=tol)&&lp.every(x=>Math.abs(x.price-l.at(x.i))<=tol);
  if(!inside||!fitOK||w<=0||w0<s.minSizeATR*a)continue;
  const pts=[...hp,...lp].sort((x,y)=>x.i-y.i),anchor=pts[0].i,lines=[line(b,start,n,h.at(start),u,'resistance'),line(b,start,n,l.at(start),d,'support')],extra={lines,anchorTime:b[anchor].time},impulse=trend(b,start,s,a);if(n-anchor<s.minDuration)continue;
  if(flatH&&ls>s.minSlopeATR&&converge)add('ascending-triangle','Ascending triangle',1,anchor,u,d,pts,'Repeated resistance and progressively higher confirmed lows.',extra);
  if(flatL&&hs< -s.minSlopeATR&&converge)add('descending-triangle','Descending triangle',-1,anchor,u,d,pts,'Repeated support and progressively lower confirmed highs.',extra);
  if(hs< -s.minSlopeATR&&ls>s.minSlopeATR&&converge)add('symmetrical-triangle','Symmetrical triangle',0,anchor,u,d,pts,'Converging boundaries; direction waits for the actual break.',extra);
  if(flatH&&flatL)add('rectangle','Rectangle / range breakout',0,anchor,u,d,pts,'Repeated horizontal support and resistance.',extra);
  if(hs>s.minSlopeATR&&ls>hs&&converge&&impulse>s.priorTrendATR)add('rising-wedge','Rising wedge',-1,anchor,u,d,pts,'Both boundaries rise and converge after an advance.',extra);
  if(ls< -s.minSlopeATR&&hs<ls&&converge&&impulse< -s.priorTrendATR)add('falling-wedge','Falling wedge',1,anchor,u,d,pts,'Both boundaries fall and converge after a decline.',extra);
  for(const dir of [1,-1])if(impulse*dir>=s.impulseATR){
   const parallel=Math.abs(hs-ls)<=s.flatSlopeATR&&hs*dir< -s.minSlopeATR&&ls*dir< -s.minSlopeATR,retrace=dir>0?b[start].close-d:u-b[start].close;
   if(parallel&&retrace>0&&retrace<Math.abs(impulse*a)*.65)add(dir>0?'bull-flag':'bear-flag',dir>0?'Bull flag':'Bear flag',dir,anchor,u,d,pts,'Strong prior impulse followed by a shallow countertrend parallel channel.',extra);
   if(hs< -s.minSlopeATR&&ls>s.minSlopeATR&&converge&&w0<Math.abs(impulse*a)*.65)add(dir>0?'bull-pennant':'bear-pennant',dir>0?'Bull pennant':'Bear pennant',dir,anchor,u,d,pts,'Strong prior impulse followed by a compact converging consolidation.',extra);
  }
 }
 // Repeated extrema and head/shoulder structures use alternating confirmed pivots.
 const alternating=[];for(const x of pv){if(alternating.at(-1)?.side===x.side){if((x.price-alternating.at(-1).price)*(x.side==='high'?1:-1)>0)alternating[alternating.length-1]=x;}else alternating.push(x);}
 for(const dir of [1,-1]){
  const side=dir>0?'low':'high',seq=alternating;
  for(const count of [2,3]){const q=seq.slice(-(2*count-1));if(q.length!==2*count-1||q[0].side!==side||q.at(-1).side!==side||q.at(-1).i-q[0].i<s.minDuration||n-q[0].i>s.maxDuration)continue;
   const ends=q.filter(x=>x.side===side),necks=q.filter(x=>x.side!==side),level=mean(necks.map(x=>x.price)),extreme=mean(ends.map(x=>x.price));
   if(Math.max(...ends.map(x=>x.price))-Math.min(...ends.map(x=>x.price))>tol||Math.abs(level-extreme)<s.minSizeATR*a||trend(b,q[0].i,s,a)*dir> -s.priorTrendATR)continue;
   add((count===2?'double-':'triple-')+(dir>0?'bottom':'top'),(count===2?'Double ':'Triple ')+(dir>0?'bottom':'top'),dir,q[0].i,dir>0?level:extreme,dir>0?extreme:level,q,'Repeated extrema after a prior trend; waiting for a neckline close.');
  }
  const q=seq.slice(-5);if(q.length===5&&q[0].side===side&&q[4].side===side&&q[4].i-q[0].i>=s.minDuration&&n-q[0].i<=s.maxDuration&&Math.abs(q[0].price-q[4].price)<=tol&&(q[0].price-q[2].price)*dir>=s.minSizeATR*a&&trend(b,q[0].i,s,a)*dir<=-s.priorTrendATR){const neck=fit([q[1],q[3]]),level=neck.at(n),extreme=q[2].price;add(dir>0?'inverse-head-shoulders':'head-shoulders',dir>0?'Inverse head-and-shoulders':'Head-and-shoulders',dir,q[0].i,dir>0?level:extreme,dir>0?extreme:level,q,'Three extrema with a deeper head and comparable shoulders.',{lines:[line(b,q[1].i,n,q[1].price,level,'neckline'),line(b,q[0].i,n,extreme,extreme,'invalidation')]});}
 }
 // Rounded structures require curved quarter means and balanced rims, not just a breakout.
 for(const duration of [...new Set([Math.max(12,s.minDuration),Math.min(48,s.maxDuration)])]){
  const start=n-duration;if(start<s.priorTrendBars)continue;
  for(const dir of [1,-1])for(const handle of [false,true]){
   const cupEnd=handle?n-Math.max(3,Math.floor(duration/5)):n-1,len=cupEnd-start+1;if(len<12)continue;const q=b.slice(start,cupEnd+1),k=Math.floor(q.length/4),v=[mean(q.slice(0,k).map(x=>x.close)),mean(q.slice(k,2*k).map(x=>x.close)),mean(q.slice(2*k,3*k).map(x=>x.close)),mean(q.slice(3*k).map(x=>x.close))],rim=mean([...q.slice(0,3),...q.slice(-3)].map(x=>x.close));
   const depthSigned=dir>0?rim-Math.min(...q.map(x=>x.close)):Math.max(...q.map(x=>x.close))-rim;
   if(depthSigned<s.minSizeATR*a||Math.abs(v[0]-v[3])>tol*2||(v[0]-v[1])*dir<tol||(v[3]-v[2])*dir<tol||Math.abs(v[1]-v[2])>depthSigned*.5)continue;
   const changes=q.slice(1).map((x,i)=>(x.close-q[i].close)*dir),half=Math.floor(changes.length/2);if(changes.slice(0,half).filter(x=>x<0).length/half<.6||changes.slice(half).filter(x=>x>0).length/(changes.length-half)<.6)continue;
   const prior=trend(b,start,s,a);if(handle?prior*dir<s.priorTrendATR:prior*dir> -s.priorTrendATR)continue;
   if(handle){const h=b.slice(cupEnd+1,n),pull=(q.at(-1).close-(dir>0?Math.min(...h.map(x=>x.low)):Math.max(...h.map(x=>x.high))))*dir;if(!h.length||pull<tol||pull>depthSigned*.45||h.some(x=>(x.close-rim)*dir>tol))continue;}
   const extreme=dir>0?Math.min(...q.map(x=>x.low)):Math.max(...q.map(x=>x.high)),name=handle?(dir>0?'Cup-and-handle':'Inverted cup-and-handle'):(dir>0?'Rounding bottom':'Rounding top'),points=q.filter((_,i)=>i%Math.max(1,k)===0).map(x=>({time:x.time,price:x.close,knownTime:x.time}));
   add(handle?(dir>0?'cup-handle':'inverted-cup-handle'):(dir>0?'rounding-bottom':'rounding-top'),name,dir,start,dir>0?rim:extreme,dir>0?extreme:rim,points,handle?'Balanced curved base with a shallow handle after an impulse.':'Gradual curved reversal after an opposing prior trend.');
  }
 }
 // Horizontal zones require two separate confirmed touches.
 for(const [side,dir,list]of [['low',1,lows],['high',-1,highs]]){
  const q=list.slice(-2);if(q.length<2||q[1].i-q[0].i<3||Math.abs(q[1].price-q[0].price)>tol||n-q[0].i>s.maxDuration)continue;
  const level=mean(q.map(x=>x.price)),lo=level-tol,hi=level+tol,contact=dir>0?c.low<=hi&&c.low>=lo-tol:c.high>=lo&&c.high<=hi+tol;
  if(contact&&(c.close-level)*dir>0&&trend(b,n-1,s,a)*dir<0)add(dir>0?'support-bounce':'resistance-rejection',dir>0?'Support bounce':'Resistance rejection',dir,q[0].i,hi,lo,q,'Price approached and rejected a repeated horizontal zone.',{trigger:dir>0?c.close>p.high:c.close<p.low,confirmationLevel:dir>0?p.high:p.low});
  const breakDir=-dir,priorInside=(p.close-level)*breakDir<=buffer;
  if(priorInside&&(c.close-level)*breakDir> -tol)add(breakDir>0?'resistance-breakout':'support-breakdown',breakDir>0?'Resistance breakout':'Support breakdown',breakDir,q[0].i,hi,lo,q,'Repeated horizontal zone; completed close must clear its buffered boundary.');
 }
 // Trend pullbacks use successive confirmed higher lows / lower highs.
 for(const dir of [1,-1]){const q=(dir>0?lows:highs).slice(-2);if(q.length===2&&(q[1].price-q[0].price)*dir>tol&&trend(b,n-1,s,a)*dir>=s.priorTrendATR&&n-q[1].i<=s.swing+4){const level=dir>0?b[q[1].i].high:b[q[1].i].low;add(dir>0?'higher-low-pullback':'lower-high-pullback',dir>0?'Higher-low bullish pullback':'Lower-high bearish pullback',dir,q[0].i,dir>0?level:q[1].price,dir>0?q[1].price:level,q,'Confirmed structural pullback aligned with the prior trend.');}}
 const fast=ema(b.map(x=>x.close),s.fastMA),slow=ema(b.map(x=>x.close),s.slowMA),vw=volumeValid?vwap(b,market,tf*60):[],validMA=slow[n]!=null&&slow[n-1]!=null;
 for(const dir of [1,-1]){
  if(validMA&&(fast[n-1]-slow[n-1])*dir<=0&&(fast[n]-slow[n])*dir>0)add(dir>0?'bull-ma-cross':'bear-ma-cross',dir>0?'Bullish moving-average cross':'Bearish moving-average cross',dir,n-1,Math.max(c.high,slow[n]),Math.min(c.low,slow[n]),[],'Fast average crossed the slow average.',{trigger:true,confirmationLevel:slow[n]});
  if(validMA&&(fast[n-1]-slow[n-1])*dir>0&&(slow[n-1]-slow[Math.max(s.slowMA-1,n-4)])*dir>0&&(dir>0?c.low<=slow[n]+tol:c.high>=slow[n]-tol)&&(c.close-slow[n])*dir>=0&&trend(b,n-1,s,a)*dir>=s.priorTrendATR)add(dir>0?'bull-ma-retest':'bear-ma-retest',dir>0?'Bullish moving-average retest':'Bearish moving-average retest',dir,n-1,slow[n]+tol,slow[n]-tol,[],'Trending slow average touched and held.',{trigger:dir>0?c.close>p.high:c.close<p.low,confirmationLevel:dir>0?p.high:p.low});
  if(Number.isFinite(vw[n])&&Number.isFinite(vw[n-1])){
   const level=vw[n],cross=(p.close-vw[n-1])*dir<=0&&(c.close-level)*dir>0;
   if(cross)add(dir>0?'vwap-reclaim':'vwap-loss',dir>0?'VWAP reclaim':'VWAP loss',dir,n-1,level+buffer,level-buffer,[],'Session-anchored VWAP crossed with valid volume.',{trigger:true});
   const held=b.slice(Math.max(0,n-4),n).every((x,j)=>(x.close-vw[Math.max(0,n-4)+j])*dir>0),touch=dir>0?c.low<=level+tol:c.high>=level-tol;
   if(held&&touch&&(c.close-level)*dir>0)add(dir>0?'vwap-pullback':'vwap-rejection',dir>0?'VWAP pullback':'VWAP rejection',dir,n-1,level+tol,level-tol,[],'Four prior closes held one side of VWAP before this touch.',{trigger:dir>0?c.close>p.high:c.close<p.low,confirmationLevel:dir>0?p.high:p.low});
  }
 }
 // US regular session opening setups. Existing calendar handles holidays/early closes.
 if(market==='stocks'&&tf<1440){const today=parts(c.time*1000,'America/New_York'),hours=session(c.time*1000,calendar),same=b.filter(x=>{const z=parts(x.time*1000,'America/New_York');return z.date===today.date&&z.minutes>=570&&z.minutes<hours.close;}),opening=same.filter(x=>parts(x.time*1000,'America/New_York').minutes<570+s.openingMinutes),first=same[0];
  if(hours.regular&&first&&parts(first.time*1000,'America/New_York').minutes===570){
   if(s.openingMinutes%tf===0&&opening.length===s.openingMinutes/tf&&opening.every(x=>x.complete!==false)&&today.minutes>=570+s.openingMinutes){const hi=Math.max(...opening.map(x=>x.high)),lo=Math.min(...opening.map(x=>x.low));if(hi-lo>=s.minSizeATR*a&&p.close<=hi+buffer&&p.close>=lo-buffer)add('opening-range','Opening-range breakout',0,b.indexOf(first),hi,lo,[],'Complete regular-session opening range; direction follows its break.');}
   const previous=b.filter(x=>parts(x.time*1000,'America/New_York').date<today.date&&parts(x.time*1000,'America/New_York').minutes<960).at(-1);if(previous&&parts(previous.time*1000,'America/New_York').minutes+tf===session(previous.time*1000,calendar).close){const gap=first.open-previous.close,dir=Math.sign(gap);if(Math.abs(gap)>=s.minSizeATR*a){const hi=Math.max(first.open,previous.close),lo=Math.min(first.open,previous.close),start=b.indexOf(first);add('opening-gap','Opening gap',dir,start,hi,lo,[],'Regular-session open displaced from the prior session close.',{trigger:true,anchorTime:first.time});if((p.close-previous.close)*dir>0)add('gap-fill','Gap fill',-dir,start,hi,lo,[],'Gap revisited the prior regular-session close.',{trigger:(c.close-previous.close)*dir<=0,anchorTime:first.time});if(today.minutes<=630&&(c.close-first.open)*dir>tol&&same.slice(0,-1).every(x=>(x.close-previous.close)*dir>0))add('gap-go','Gap-and-go',dir,start,hi,lo,[],'Early continuation away from an unfilled opening gap.',{trigger:true,anchorTime:first.time});}}
  }
 }
 // Candle shapes require prior direction and a recent extreme; doji stays neutral.
 const body=x=>Math.abs(x.close-x.open),range=x=>x.high-x.low,up=x=>x.close>x.open,down=x=>x.close<x.open,small=x=>range(x)>0&&body(x)<=range(x)*.35,large=x=>body(x)>=a*.5;
 if(range(c)>a*.3&&body(c)<=range(c)*.1)add('doji','Doji / indecision',0,n,c.high,c.low,[],'Small body indicates indecision; no directional interpretation.',{trigger:true});
 for(const dir of [1,-1]){const prior=trend(b,n-1,s,a),recent=b.slice(Math.max(0,n-s.priorTrendBars),n),location=dir>0?Math.min(c.low,p.low)<=Math.min(...recent.map(x=>x.low))+tol:Math.max(c.high,p.high)>=Math.max(...recent.map(x=>x.high))-tol;if(prior*dir> -s.priorTrendATR||!location)continue;
  const bullish=dir>0,opposite=bullish?down(p):up(p),current=bullish?up(c):down(c),label=bullish?'Bullish ':'Bearish ',make=(kind,name,len=2)=>add(kind,name,dir,n-len+1,Math.max(...b.slice(n-len+1).map(x=>x.high)),Math.min(...b.slice(n-len+1).map(x=>x.low)),[], 'Candle shape at a recent extreme after an opposing trend.',{trigger:true,confirmationLevel:c.close,knownAt:c.complete===false?c.time*1000:closeAt(c,tf)});
  if(opposite&&current&&large(c)&&Math.max(c.open,c.close)>=Math.max(p.open,p.close)&&Math.min(c.open,c.close)<=Math.min(p.open,p.close)&&body(c)>body(p))make(bullish?'bull-engulfing':'bear-engulfing',label+'engulfing');
  const wick=bullish?Math.min(c.open,c.close)-c.low:c.high-Math.max(c.open,c.close),other=bullish?c.high-Math.max(c.open,c.close):Math.min(c.open,c.close)-c.low;if(body(c)>range(c)*.1&&wick>=2*body(c)&&other<=body(c)*.5)make(bullish?'hammer':'shooting-star',bullish?'Hammer':'Shooting star',1);
  if(opposite&&current&&large(p)&&small(c)&&Math.max(c.open,c.close)<Math.max(p.open,p.close)&&Math.min(c.open,c.close)>Math.min(p.open,p.close))make(bullish?'bull-harami':'bear-harami',label+'harami');
  const mid=(p.open+p.close)/2;if(opposite&&current&&large(p)&&(bullish?c.open<p.low&&c.close>mid&&c.close<p.open:c.open>p.high&&c.close<mid&&c.close>p.open))make(bullish?'piercing':'dark-cloud',bullish?'Piercing line':'Dark-cloud cover');
  const first=b[n-2];if(first&&large(first)&&small(p)&&current&&(bullish?down(first)&&Math.max(p.open,p.close)<first.close&&c.close>(first.open+first.close)/2:up(first)&&Math.min(p.open,p.close)>first.close&&c.close<(first.open+first.close)/2))make(bullish?'morning-star':'evening-star',bullish?'Morning star':'Evening star',3);
 }
 return [...new Map(out.map(x=>[x.kind+':'+x.anchorTime,x])).values()];
}

export function analysisInput(asset,tf,now,s=PATTERN_DEFAULTS){
 const historical=!!asset.replay,delayed=!!(asset.fallback||asset.publicData||asset.snapshot||!['Robinhood','Coinbase Exchange'].includes(asset.source)),last=asset.bars?.at(-1),age=last?now-(last.closeTime??(last.time+asset.base)*1000):Infinity,quoteFresh=asset.quote?.time<=now+5000&&now-asset.quote.time<=s.staleSeconds*1000;
 let freshness=historical?'historical':age>Math.max(s.staleSeconds*1000,asset.base*1000)||!quoteFresh?'stale':delayed?'delayed':'live',reason='';
 if(!last||!asset.base||tf*60<asset.base||tf*60%asset.base)return {bars:[],freshness,reason:'Timeframe unavailable from this candle cache'};
 if(asset.bars.some(x=>!Number.isInteger(x.time)||x.time%asset.base!==0||Number.isFinite(x.volume)&&x.volume<0))return {bars:[],freshness,reason:'Invalid candle timestamp, alignment, or volume'};
 if(new Set(asset.bars.map(x=>x.source||asset.source||'unspecified')).size>1)return {bars:[],freshness,reason:'Mixed candle sources'};
 const raw=asset.bars.filter(x=>x.time*1000<=now).slice(-(s.lookback+2)*tf*60/asset.base);
 if(raw.some((x,i)=>![x.open,x.high,x.low,x.close].every(Number.isFinite)||Math.min(x.open,x.low,x.close)<=0||x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close)||i&&x.time<=raw[i-1].time))return {bars:[],freshness,reason:'Invalid or unordered candle data'};
 // Keep source provenance outside aggregate (the shared aggregator only carries OHLCV).
 const volumeValid=raw.every(x=>Number.isFinite(x.volume)&&x.volume>0&&!x.syntheticVolume&&!x.volumeSynthetic&&x.volumeSource!=='synthetic')&&!asset.syntheticVolume&&!asset.volumeSynthetic;
 const bars=aggregate(raw.map(x=>({...x,volume:Number.isFinite(x.volume)?x.volume:0})),tf,asset.base,now).slice(-s.lookback);
 let cut=0;for(let i=0;i<bars.length;i++){const x=bars[i],prior=bars[i-1];if(x.complete===false&&i<bars.length-1)cut=i+1;if(prior&&x.time-prior.time!==tf*60){const allowed=asset.market==='stocks'&&parts(x.time*1000,'America/New_York').date!==parts(prior.time*1000,'America/New_York').date&&parts(prior.time*1000,'America/New_York').minutes+tf===session(prior.time*1000,asset.calendar).close&&parts(x.time*1000,'America/New_York').minutes===570;if(!allowed&&tf<1440)cut=i;}}
 if(asset.market==='stocks'&&tf<1440&&!historical&&!session(now,asset.calendar).regular){freshness='stale';reason='Regular session closed';}
 if(freshness==='stale')reason ||= 'Waiting for fresh candles and quote';
 return {bars:bars.slice(cut),freshness,reason,volumeValid};
}

export function analysisRulesKey(s){const text=JSON.stringify(Object.keys(PATTERN_DEFAULTS).filter(k=>!['enabled','frames','staleSeconds'].includes(k)).map(k=>[k,s[k]]));let hash=2166136261;for(const c of text)hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0).toString(16);}
export function formationId(symbol,tf,source,c){return [symbol,tf,source,c.kind,c.anchorTime,...(c.rulesKey?[c.rulesKey]:[])].join('|');}
export function advanceFormation(old,c,b,tf,s,meta){
 const end=closeAt(b,tf),dir=old?.confirmedAt?old.dir:c.dir,base=old?old.confirmedAt?old:{...old,...c,id:old.id,firstKnownAt:old.firstKnownAt,createdAt:old.createdAt,status:old.status,observations:old.observations}:{...c,id:formationId(meta.symbol,tf,meta.source,c),symbol:meta.symbol,tf,source:meta.source,firstKnownAt:c.knownAt,discoveryFreshness:meta.freshness,status:'forming',createdAt:end,observations:[]},r={...base,lastEvaluatedCandle:b.time,lastEvaluatedAt:Math.min(end,meta.asOf??end),freshness:meta.freshness};
 // Freeze original confirmation geometry/evidence. Later prices update only the lifecycle.
 if(r.status==='failed'||r.status==='expired')return old||r;
 const newCompleted=b.complete!==false&&b.time!==old?.lastCompletedCandle;r.ageBars=(old?.ageBars??0)+(old&&newCompleted?1:0);r.lastCompletedCandle=newCompleted?b.time:old?.lastCompletedCandle;
 const invalid=dir&&((b.close-(dir>0?r.lower:r.upper))*dir< -s.toleranceATR*meta.atr),aged=r.ageBars>s.expirationBars;
 if(b.complete!==false&&invalid){r.status='failed';r.failedAt=end;r.observations=[...r.observations,{at:end,status:'failed'}];}
 else if(b.complete!==false&&aged){r.status='expired';r.expiredAt=end;r.observations=[...r.observations,{at:end,status:'expired'}];}
 else if(!r.confirmedAt){
  const trigger=c.trigger&&end>=r.firstKnownAt;r.status=trigger?(b.complete===false?'provisional':'confirmed'):'forming';
  if(trigger&&b.complete!==false){Object.assign(r,{...c,id:r.id,symbol:r.symbol,tf:r.tf,source:r.source,firstKnownAt:r.firstKnownAt,createdAt:r.createdAt,lastEvaluatedCandle:b.time,lastEvaluatedAt:end,freshness:meta.freshness,confirmationFreshness:meta.freshness,status:'confirmed',ageBars:0,confirmedAt:end,confirmedCandle:b.time,confirmedGeometry:{lines:structuredClone(c.lines),points:structuredClone(c.points),upper:c.upper,lower:c.lower}});r.observations=[...base.observations,{at:end,status:'confirmed'}];}
 }
 return r;
}

// Lifecycle-derived retests / failures are linked to an actual originating breakout.
export function followupCandidates(records,b,tf,s,a){const out=[],p=b.at(-1);for(const r of records){if(!r.confirmedAt||['failed','expired'].includes(r.status)||!['resistance-breakout','support-breakdown','rectangle','ascending-triangle','descending-triangle','symmetrical-triangle','opening-range'].includes(r.kind)||!r.dir||p.time<=r.confirmedCandle||(r.ageBars||0)>s.expirationBars)continue;const dir=r.dir,level=r.confirmationLevel,tol=s.toleranceATR*a,touch=dir>0?p.low<=level+tol:p.high>=level-tol,failed=(p.close-level)*dir< -tol,trigger=touch&&(p.close-level)*dir>s.breakoutATR*a;
  if(touch){const kind=failed?(dir>0?'failed-breakout':'failed-breakdown'):r.kind==='opening-range'?'opening-range-retest':dir>0?'breakout-retest':'breakdown-retest';out.push({kind,name:failed?(dir>0?'Failed breakout':'Failed breakdown'):r.kind==='opening-range'?'Opening-range retest':dir>0?'Breakout retest':'Breakdown retest',anchorTime:r.confirmedCandle,startTime:r.confirmedCandle,knownAt:p.complete===false?p.time*1000:closeAt(p,tf),originId:r.id,dir:failed?-dir:dir,upper:level+tol,lower:level-tol,confirmationLevel:level,invalidationLevel:failed?(dir>0?level+tol:level-tol):(dir>0?level-tol:level+tol),trigger:failed||trigger,detail:failed?'Price closed back through the originating breakout zone.':'Price revisited and held the originating breakout zone.',lines:r.confirmedGeometry.lines,points:r.confirmedGeometry.points,evidence:r.evidence});}}
 return out;
}
