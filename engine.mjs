import {continuationParams,emaContinuation,vwapContinuation,levelContinuation} from './continuations.mjs';
import {patternQualification,entryExpiresAt,staleFor} from './signal-policy.mjs';
import {specialSignals} from './beta-strategies.mjs';
import {ReplaySeries} from './replay-series.mjs';
import {combineSignals} from './confluence.mjs';
import {strategyParams} from './strategy-controls.mjs';
// Pure research/risk functions. No brokerage or order interfaces exist in this app.
export const DEFAULTS = {
  liveSignalsOnly:true,strictContinuations:true,showInactiveSignals:false,publicOptionResearch:true,qualificationMode:'strict',allowOneMinute:false,callWindowBars:2,stockStaleSeconds:150,minWatchScore:45,studyMode:false,sourcePreference:'yahoo',topPicks:{minScore:80,minProbability:.35,minExpectedR:0},
  capital:1500, risk:15, riskPercent:1, eventWindowMinutes:60, maxVix:30, optionMinOI:100, optionMinVolume:20, optionMaxSpread:10, maxTrades:3, maxLosses:2, timezone:'America/Los_Angeles', reset:'00:00', stockCutoff:'13:00', cryptoAfterHours:false,
  stocks:["SPY","QQQ","AAPL","NVDA","MSFT","TSLA","AMD","COIN","INTC","SMCI","CEG","CRWD","PANW","ORCL","MU","LRCX","VST","AMAT","ADBE","CRM","META","AVGO","AMZN"], crypto:['BTC-USD','ETH-USD'], stockFrames:[3,5,15], cryptoFrame:60, cryptoFrames:[60,1440], betaVersion:1,
  strategyMarketFrames:{},includeFallbackTraining:false,alertMinEV:.15,alertMinProb:.75,maxStrategyDrawdownR:15,maxSpreadOfRisk:.25,eventBlocks:{CPI:{mode:"window",minutes:60},FOMC:{mode:"day",minutes:60},earningsDays:1,firstFiveMinutes:true},
  strategyParams:{}, alerts:{enabled:true,threshold:75,sound:false,flash:true,volume:.2,cooldownSeconds:300,allowCandidate:false,soundChoice:'chime',quietHours:[],maxPerHour:6,desktop:false}, dailyReview:{enabled:true,hourET:17,historyDays:28,months:6},
  strategyFrames:{'ema-cross':[3,5],'ema-retest':[3,5],vwap:[3,5],momentum:[],'momentum-retest':[3,5],orb5:[3,5],'orb5-retest':[3,5],orb15:[3,5],'orb15-retest':[3,5]},
  entryWindowVersion:1,stockNoEntry:['09:30-09:35'],minStopATR:0.75,minStopBps:{stocks:25,crypto:40},minStopCostMultiple:4,cryptoVenue:'Set your venue',forwardPaperVersion:1,forwardExitMode:'2R',autoPaperMinProb:.4,entryOrder:'market',exitStyles:['fixed','atr-trail','swing-trail'],trailingATR:3,inPlay:{enabled:true,minRVOL:1,minGap:2,strongRVOL:2,minPrice:5,minDailyVolume:1000000,minDailyATR:.5},scanner:{enabled:true,secUserAgent:'',feeds:[]},special:{orbTop:20,orbStopATR:.1,momentumThreshold:.003,earningsGap:3,earningsRVOL:2,earningsSurprise:.1,earningsHoldDays:20,trendTrailATR:3},service:{catchUpDays:90},
  strategies:['ema-cross','ema-retest','orb5','orb5-retest','orb15','orb15-retest','vwap','momentum','momentum-retest'],
  filters:{confirmation:true,regime:true,events:true,trend:true,volume:true,chop:true,vwap:false,market:false,spread:true}, minRVOL:1.1, maxExtension:1.8,maxStopATR:3,minRR:1.5,maxSpreadBps:15,minScore:65,
  costs:{stocks:{feeBps:0.3,slippageBps:2,spreadBps:2},crypto:{feeBps:60,slippageBps:3,spreadBps:2}},staleSeconds:30,extraClosures:[],earlyCloses:{},
};
export const RULES = {
 'orb-in-play':{name:'Opening range · stocks in play',group:'ORB',rule:'Top opening-volume stocks; trade through the first five-minute range in its candle direction. Exit at the stop or session close.'},
 'spy-qqq-momentum':{name:'SPY / QQQ · late-day momentum',group:'DAILY MOMENTUM',rule:'Follow a large first-half-hour return at 15:30 ET; exit at 15:59 ET.'},
 'post-earnings':{name:'Post-earnings drift',group:'SWING',rule:'Next-session entry after a material earnings surprise, or earnings gap with strong volume. ATR trailing stop and a limited holding period.'},
 'daily-trend':{name:'Daily trend following',group:'SWING',rule:'Close above the 50- and 200-day averages with positive 3-, 6- and 12-month returns. Exit below the 50-day average or the ATR trailing stop.'},
 'ema-cross':{name:'34 EMA · initial cross',group:'EMA',rule:'A completed candle crosses the 34 EMA; candle body agrees with the cross. Initial entries are tested independently of retests.'},
 'ema-retest':{name:'34 EMA · cross & retrace',group:'EMA',rule:'Strict continuation: move at least 0.6 ATR after the EMA cross, retest within 0.15 ATR, then a later close beyond the prior high/low within 3 bars. Parameters are editable.'},
 orb5:{name:'5-minute opening range',group:'ORB',rule:'After a complete 09:30–09:35 New York opening range, a candle closes outside it. Only within 90 minutes of the open.'},
 'orb5-retest':{name:'5-minute ORB · retest',group:'ORB',rule:'After a 5-minute range breakout, a later candle within 8 bars retests the boundary and closes back outside. No entries after 11:00 New York.'},
 orb15:{name:'15-minute opening range',group:'ORB',rule:'After a complete 09:30–09:45 New York opening range, a candle closes outside it. Only within 90 minutes of the open.'},
 'orb15-retest':{name:'15-minute ORB · retest',group:'ORB',rule:'After a 15-minute range breakout, a later candle within 8 bars retests the boundary and closes outside it. No entries after 11:00 New York.'},
 vwap:{name:'VWAP · trend pullback',group:'VWAP',rule:'Strict continuation: persistent VWAP-side closes, an agreeing slope, limited crossings, and a later high/low resumption after a pullback. Stocks anchor at 09:30 ET; crypto at 00:00 UTC.'},
 momentum:{name:'Momentum · breakout',group:'MOMENTUM',rule:'Close beyond a 12-bar consolidation high/low (range ≤ 6 ATR), with a directional body ≥ 0.5 ATR; previous close must be inside.'},
 'momentum-retest':{name:'Momentum · breakout retest',group:'MOMENTUM',rule:'Within 8 bars of the same 12-bar consolidation breakout, a later bar retests its boundary and closes beyond it with the trend.'}
};
for(const id of Object.keys(DEFAULTS.strategyFrames)){if(!['momentum','momentum-retest'].includes(id))DEFAULTS.strategyFrames[id]=[3,5,15,60,1440];}
Object.assign(DEFAULTS.strategyFrames,{'orb-in-play':[3,5],'spy-qqq-momentum':[15],'post-earnings':[1440],'daily-trend':[1440]});
DEFAULTS.strategies.push('orb-in-play','spy-qqq-momentum','post-earnings','daily-trend');
export const signalFrames=(s,market)=>market==='crypto'?(s.cryptoFrames||[s.cryptoFrame]):s.stockFrames;
export function migrateBetaSettings(saved){const s=migrateSettings(saved);if(saved.betaVersion!==1){s.betaVersion=1;s.cryptoAfterHours=false;s.stockFrames=[3,5,15];s.cryptoFrames=[60,1440];s.cryptoFrame=60;s.strategyFrames=structuredClone(DEFAULTS.strategyFrames);s.strategyMarketFrames={};s.strategies=[...new Set([...s.strategies.filter(k=>k!=='momentum'),...['orb-in-play','spy-qqq-momentum','post-earnings','daily-trend']])];s.minStopBps={stocks:Math.max(25,s.minStopBps.stocks),crypto:Math.max(40,s.minStopBps.crypto)};}for(const k of ['inPlay','scanner','special','service'])s[k]={...DEFAULTS[k],...s[k]};return s;}
const formatters=new Map(),datePartsCache=new Map();
// Saved strategy preferences change only with an explicit migration flag. Legacy flat costs
// belong to crypto; copying them to stocks was the original cost-model defect.
export function migrateSettings(saved={}, {existing=true,migrateStrategyFrames=false}={}) {
 const s={...structuredClone(DEFAULTS),...saved,forwardPaperVersion:saved.forwardPaperVersion??0,forwardExitMode:saved.forwardExitMode??'2R',filters:{...DEFAULTS.filters,...saved.filters},
  costs:{stocks:{...DEFAULTS.costs.stocks,...saved.costs?.stocks},crypto:{...DEFAULTS.costs.crypto,...Object.fromEntries(['feeBps','slippageBps','spreadBps'].filter(k=>Number.isFinite(saved[k])).map(k=>[k,saved[k]])),...saved.costs?.crypto}},
  minStopBps:{...DEFAULTS.minStopBps,...saved.minStopBps},strategyParams:{...saved.strategyParams},alerts:{...DEFAULTS.alerts,...saved.alerts},dailyReview:{...DEFAULTS.dailyReview,...saved.dailyReview},strategyMarketFrames:{...saved.strategyMarketFrames},eventBlocks:{...DEFAULTS.eventBlocks,...saved.eventBlocks,CPI:{...DEFAULTS.eventBlocks.CPI,...saved.eventBlocks?.CPI},FOMC:{...DEFAULTS.eventBlocks.FOMC,...saved.eventBlocks?.FOMC}}};
 if(saved.entryWindowVersion!==1&&JSON.stringify(saved.stockNoEntry)===JSON.stringify(['09:30-09:35','11:30-13:30']))s.stockNoEntry=['09:30-09:35'];
 s.entryWindowVersion=1;
 for(const k of ['feeBps','slippageBps','spreadBps'])delete s[k];
 if(migrateStrategyFrames){s.stockFrames=structuredClone(DEFAULTS.stockFrames);s.strategyFrames=structuredClone(DEFAULTS.strategyFrames);}
 else if(existing&&!saved.strategyFrames)s.strategyFrames=Object.fromEntries(Object.keys(RULES).map(k=>[k,[...new Set([...(saved.stockFrames||[1,3]),saved.cryptoFrame||5])]]));
 else s.strategyFrames={...structuredClone(DEFAULTS.strategyFrames),...saved.strategyFrames};
 return s;
}
export function strategyFramesForMarket(s,id,market){const frames=s.strategyMarketFrames?.[market]?.[id]??s.strategyFrames?.[id]??[3,5,15,60,1440],special=['orb-in-play','spy-qqq-momentum','post-earnings','daily-trend'];return frames.filter(tf=>(tf!==1||s.allowOneMinute&&market==='stocks')&&(!['momentum-retest'].includes(id)||[3,5].includes(tf))&&!(market==='crypto'&&(id.startsWith('orb')||special.includes(id)))&&!(market==='stocks'&&tf===1440&&!special.includes(id)&&!s.strategyMarketFrames?.stocks?.[id]?.includes(1440))&&(market==='stocks'?(s.allowOneMinute?[1,3,5,15,1440]:[3,5,15,1440]):[5,15,60,1440]).includes(tf));}
export function strategyEnabled(strategy,tf,s=DEFAULTS,market=null){return (tf!==1||s.allowOneMinute&&market==='stocks')&&!(market==='stocks'&&tf===1440&&!['post-earnings','daily-trend'].includes(strategy)&&!s.strategyMarketFrames?.stocks?.[strategy]?.includes(1440))&&!(market==='crypto'&&strategy.startsWith('orb'))&&(!['momentum-retest'].includes(strategy)||[3,5].includes(tf))&&!(market==='crypto'&&['orb-in-play','spy-qqq-momentum','post-earnings','daily-trend'].includes(strategy))&&s.strategies.includes(strategy)&&(s.strategyMarketFrames?.[market]?.[strategy]??s.strategyFrames?.[strategy]??[3,5,15,60,1440]).includes(tf);}
export function marketCosts(s=DEFAULTS,market='crypto',quote=null){
 const key=market==='crypto'?'crypto':'stocks',c={...DEFAULTS.costs[key],...s.costs?.[key]};
 const live=quote?.bid>0&&quote?.ask>=quote.bid?(quote.ask-quote.bid)/((quote.ask+quote.bid)/2)*10000:null;
 return {...c,spreadBps:live??c.spreadBps,spreadSource:live===null?'assumed':'live'};
}
export function roundTripCost(entry,exit,market,s=DEFAULTS,quote=null){const c=marketCosts(s,market,quote);return ((entry+exit)*(c.feeBps+c.slippageBps)+entry*c.spreadBps)/10000;}
// R is always the original price distance to the stop. Also expose the conventional
// reward / (price loss + costs) ratio, rather than mislabeling net target R as that ratio.
export function rewardMetrics(entry,stop,target,market,s=DEFAULTS,quote=null){const distance=Math.abs(entry-stop),cost=roundTripCost(entry,target,market,s,quote),reward=Math.abs(target-entry);return {costs:cost,costsAsRiskPct:distance?100*cost/distance:null,rr:distance?reward/distance:null,netRR:distance?(reward-cost)/distance:null,netLossR:distance?(distance+roundTripCost(entry,stop,market,s,quote))/distance:null,netRewardRisk:distance?(reward-cost)/(distance+roundTripCost(entry,stop,market,s,quote)):null};}
export function stopFloor(entry,swingStop,dir,atrValue,market,s=DEFAULTS,quote=null){const c=marketCosts(s,market,quote),costBps=2*c.feeBps+2*c.slippageBps+c.spreadBps;const distance=Math.max(Math.abs(entry-swingStop),(s.minStopATR??0.75)*atrValue,entry*(s.minStopBps?.[market]??DEFAULTS.minStopBps[market])/10000,entry*costBps*(s.minStopCostMultiple??4)/10000);return {stop:entry-dir*distance,stopATR:distance/atrValue,stopBps:distance/entry*10000,widened:distance>Math.abs(entry-swingStop)+1e-12};}
export function stockEntryBlocked(now,s=DEFAULTS){const m=parts(now,'America/New_York').minutes;if(s.filters?.events&&s.eventBlocks?.firstFiveMinutes&&m>=570&&m<575)return true;return (s.stockNoEntry??DEFAULTS.stockNoEntry).some(range=>{const [start,end]=range.split('-').map(minutes);return m>=start&&m<end;});}
export function parts(t,zone='America/Los_Angeles') {
 const dateValue=new Date(t),cacheKey=zone+'|'+dateValue.getTime();if(datePartsCache.has(cacheKey))return datePartsCache.get(cacheKey);
 if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
 const p=Object.fromEntries(formatters.get(zone).formatToParts(dateValue).map(x=>[x.type,x.value]));
 const result=Object.freeze({...p,date:`${p.year}-${p.month}-${p.day}`,minutes:+p.hour*60 + +p.minute});if(datePartsCache.size>=50000)datePartsCache.delete(datePartsCache.keys().next().value);datePartsCache.set(cacheKey,result);return result;
}
export const minutes=s=>+s.split(':')[0]*60 + +s.split(':')[1];
export function dayKey(t,s=DEFAULTS) { const p=parts(t,s.timezone); return p.minutes<minutes(s.reset)?new Date(Date.parse(p.date+'T12:00:00Z')-86400000).toISOString().slice(0,10):p.date; }
const holidays={
 2026:['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25'],
 2027:['01-01','01-18','02-15','03-26','05-31','06-18','07-05','09-06','11-25','12-24'],
 2028:['01-17','02-21','04-14','05-29','06-19','07-04','09-04','11-23','12-25'],
 // Fixed 2029–2031 dates from standing NYSE holiday rules; annual schedules pending confirmation.
 2029:['01-01','01-15','02-19','03-30','05-28','06-19','07-04','09-03','11-22','12-25'],
 2030:['01-01','01-21','02-18','04-19','05-27','06-19','07-04','09-02','11-28','12-25'],
 2031:['01-01','01-20','02-17','04-11','05-26','06-19','07-04','09-01','11-27','12-25']
};
const early=['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24',
 '2029-07-03','2029-11-23','2029-12-24','2030-07-03','2030-11-29','2030-12-24','2031-07-03','2031-11-28','2031-12-24'];
export function session(t,s=DEFAULTS) {
 const p=parts(t,'America/New_York'), local=parts(t,s.timezone),dow=new Date(p.date+'T12:00:00Z').getUTCDay();
 const known=!!holidays[p.year], holiday=holidays[p.year]?.includes(p.date.slice(5))||s.extraClosures.includes(p.date);
 const close=s.earlyCloses[p.date]?minutes(s.earlyCloses[p.date]):early.includes(p.date)?780:960;
 const tradingDay=known&&dow>0&&dow<6&&!holiday;
 const regular=tradingDay&&p.minutes>=570&&p.minutes<close;
 const stocks=regular&&local.minutes<minutes(s.stockCutoff);
 return {stocks,crypto:!s.cryptoAfterHours||!stocks,regular,tradingDay,known,calendarBasis:!known?'outside coverage':+p.year<=2028?'published schedule':'standing-rule dates; annual confirmation pending',date:p.date,close,
   label:!known?'Calendar outside verified 2026–2031 coverage':holiday?'US market holiday':dow===0||dow===6?'US weekend':!regular?'US session closed':!stocks?'Stock entry cutoff reached':'US regular session',earlyClose:close<960};
}
export function riskState(journal,s=DEFAULTS,now=Date.now()) {
 const day=dayKey(now,s),taken=journal.filter(j=>j.decision==='taken'),entries=taken.filter(j=>dayKey(j.time,s)===day);
 const closed=taken.filter(j=>j.closedAt&&Date.parse(j.closedAt)<=now&&dayKey(j.closedAt,s)===day).sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt)||a.id.localeCompare(b.id));
 let streak=0,locked=false,wins=0,losses=0,pnl=0;
 for(const j of closed){pnl+=j.pnl;if(j.pnl<0){losses++;streak++;}else if(j.pnl>0){wins++;streak=0;}if(streak>=s.maxLosses)locked=true;}
 return {day,used:entries.length,remaining:Math.max(0,s.maxTrades-entries.length),wins,losses,pnl,streak,locked,plannedRisk:entries.reduce((a,b)=>a+(b.plannedRisk||0),0),blocked:locked||entries.length>=s.maxTrades,reason:locked?'Daily consecutive-loss lockout':entries.length>=s.maxTrades?'Daily trade allowance used':null};
}
export function ema(values,n=34){let e=null,sum=0;return values.map((v,i)=>{sum+=v;if(i<n-1)return null;if(i===n-1)e=sum/n;else e=v*2/(n+1)+e*(1-2/(n+1));return e;});}
export function atr(b,n=14){const tr=b.map((x,i)=>i?Math.max(x.high-x.low,Math.abs(x.high-b[i-1].close),Math.abs(x.low-b[i-1].close)):x.high-x.low);let a=null;return tr.map((x,i)=>{if(i<n-1)return null;if(i===n-1)a=tr.slice(0,n).reduce((u,v)=>u+v)/n;else a=(a*(n-1)+x)/n;return a;});}
export function adx(b,n=14){
 const out=Array(b.length).fill(null);let tr=0,plus=0,minus=0,seed=0,value=null;
 for(let i=1;i<b.length;i++){const up=b[i].high-b[i-1].high,down=b[i-1].low-b[i].low,t=Math.max(b[i].high-b[i].low,Math.abs(b[i].high-b[i-1].close),Math.abs(b[i].low-b[i-1].close)),p=up>down&&up>0?up:0,m=down>up&&down>0?down:0;
  if(i<=n){tr+=t;plus+=p;minus+=m;}else{tr=tr-tr/n+t;plus=plus-plus/n+p;minus=minus-minus/n+m;}
  if(i<n)continue;const sum=plus+minus,dx=tr>0&&sum>0?100*Math.abs(plus-minus)/sum:0;
  if(i<2*n){seed+=dx;if(i===2*n-1)value=seed/n;}else value=(value*(n-1)+dx)/n;
  out[i]=value;
 }return out;
}
export function barCloseTime(b,base,market,s=DEFAULTS){if(base!==86400||market!=='stocks')return (b.time+base)*1000;const date=parts(b.time*1000,'UTC').date,noon=Date.parse(date+'T12:00Z');return noon+(session(noon,s).close-parts(noon,'America/New_York').minutes)*60000;}
export function normalizeBars(bars,interval=60){
 const map=new Map();
 for(const b of bars){if(!Number.isInteger(b.time)||b.time%interval!==0||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||Math.min(b.open,b.low,b.close)<=0||b.volume<0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close))throw Error('Invalid OHLCV candle or interval alignment');if(map.has(b.time))throw Error('Duplicate candle timestamp');map.set(b.time,{time:b.time,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume,complete:b.complete!==false,...(Number.isFinite(b.closeTime)?{closeTime:b.closeTime}:{}),...(b.source?{source:b.source}:{}),...(b.fallback!==undefined?{fallback:b.fallback}:{})});}
 return [...map.values()].sort((a,b)=>a.time-b.time);
}
export function aggregate(bars,tf,base=60,now=Date.now()){
 const width=tf*60;if(!(base>0)||width<base||width%base!==0)throw Error('Timeframe must be a whole multiple of the source interval');const groups=new Map();for(const b of [...bars].sort((a,b)=>a.time-b.time)){const key=Math.floor(b.time/width)*width;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(b);}
 return [...groups].map(([time,a])=>({time,open:a[0].open,high:Math.max(...a.map(b=>b.high)),low:Math.min(...a.map(b=>b.low)),close:a.at(-1).close,volume:a.reduce((v,b)=>v+b.volume,0),complete:a.length===width/base&&a.every((b,i)=>b.complete!==false&&b.time===time+i*base)&&(a.length===1&&a[0].closeTime?a[0].closeTime/1000:time+width)<=now/1000,...(a.length===1&&a[0].closeTime?{closeTime:a[0].closeTime}:{})})).sort((a,b)=>a.time-b.time);
}
export function vwap(bars,market='crypto',interval=null){
 // A session VWAP requires its anchor and every subsequent interval; do not bridge a volume gap.
 const gaps=bars.slice(1).map((b,i)=>b.time-bars[i].time).filter(n=>n>0);const step=interval??Math.min(...gaps);let key='',pv=0,vol=0,valid=false,last=null;
 return bars.map(b=>{const p=parts(b.time*1000,market==='crypto'?'UTC':'America/New_York'),anchor=market==='crypto'?0:570;if(p.date!==key){key=p.date;pv=0;vol=0;valid=false;last=null;}if(p.minutes<anchor||(market!=='crypto'&&p.minutes>=960))return null;if(p.minutes===anchor&&last===null)valid=true;if(last!==null&&b.time-last!==step)valid=false;if(b.complete===false)valid=false;last=b.time;pv+=(b.high+b.low+b.close)/3*b.volume;vol+=b.volume;return valid&&vol>0?pv/vol:null;});
}
export function positionSize(entry,stop,market,s=DEFAULTS,quote=null){const distance=Math.abs(entry-stop),c=marketCosts(s,market,quote),cost=roundTripCost(entry,stop,market,s,quote);let size=distance>0?Math.min(Math.min(s.risk,s.capital*(s.riskPercent??100)/100)/(distance+cost),s.capital/(entry*(1+c.feeBps/10000))):0;size=market==='stocks'?Math.floor(size):Math.floor(size*1e8)/1e8;return {size,plannedRisk:size*(distance+cost),notional:size*entry,priceRisk:size*distance,costEstimate:size*cost};}
export function indicators(bars,market,interval=null){return {ema:ema(bars.map(b=>b.close)),atr:atr(bars),adx:adx(bars),vwap:vwap(bars,market,interval)};}
export function evaluate(input){
 const s=input.settings||DEFAULTS,tf=input.tf??5,groups=new Map(),sources=input.prepared?.sources||[...new Set((input.bars||[]).map(b=>b.source).filter(Boolean))];
 if(sources.length>1)throw Error("Mixed candle sources: rebuild the indicator series from one provider");
 const source=input.source||sources[0]||"Unspecified historical source",fallback=!!input.fallback||(input.prepared?input.prepared.fallback:(input.bars||[]).some(b=>b.fallback===true));
 for(const id of s.strategies){if(!strategyEnabled(id,tf,s,input.market))continue;const params=strategyParams(s,id),key=JSON.stringify(params);if(!groups.has(key))groups.set(key,{params,ids:[]});groups.get(key).ids.push(id);}
 if(tf===1&&!(s.allowOneMinute&&input.market==='stocks'))return {signals:[],analysis:{ready:false,reason:'One-minute bars are collected only; signal frames start at three minutes'}};
 if(['orb-in-play','spy-qqq-momentum','post-earnings','daily-trend'].some(k=>strategyEnabled(k,tf,s,input.market))){const extra=specialSignals({...input,settings:s});for(const g of groups.values())g.ids=g.ids.filter(id=>!['orb-in-play','spy-qqq-momentum','post-earnings','daily-trend'].includes(id));const regular=[...groups.values()].filter(g=>g.ids.length).map(g=>evaluateCore({...input,settings:{...s,strategies:g.ids},params:g.params}));return {signals:combineSignals([...regular.flatMap(r=>r.signals),...extra].map(r=>({...r,source,fallback,featureTime:r.confirmedAt}))),analysis:regular[0]?.analysis||{ready:true}};}
 if(!groups.size)return evaluateCore({...input,settings:{...s,strategies:[]},params:strategyParams(s,'')});
 const results=[...groups.values()].map(g=>evaluateCore({...input,settings:{...s,strategies:g.ids},params:g.params}));
 return {signals:combineSignals(results.flatMap(r=>r.signals).map(r=>({...r,source,fallback,featureTime:r.confirmedAt}))),analysis:results[0].analysis};
}
function evaluateCore({symbol,market,bars,base=60,tf=5,settings:s=DEFAULTS,now=Date.now(),quote=null,marketTrend=null,replay=false,params,prepared=null}){
 const preparedView=prepared?.view(now,params.emaPeriod);const all=preparedView?preparedView.b:aggregate(bars,tf,base,now);let b=all.filter(x=>x.complete);
 // Never bridge a missing candle when confirming an entry.
 let cut=0;for(let i=1;i<b.length;i++)if(b[i].time-b[i-1].time!==tf*60)cut=i;
 // Overnight equity gaps are allowed for EMA, but intra-session gaps reset warmup.
 if(market==='stocks'){cut=0;for(let i=1;i<b.length;i++)if(b[i].time-b[i-1].time!==tf*60&&parts(b[i].time*1000,'America/New_York').date===parts(b[i-1].time*1000,'America/New_York').date)cut=i;}
 b=b.slice(cut);const warmup=Math.max(50,params.emaPeriod+params.lookback+3,params.volumeLookback+2);if(b.length<warmup)return {signals:[],analysis:{ready:false,reason:`Need ${warmup} contiguous closed ${tf}m candles (${b.length} available)`,bars:b.length}};
 const ind=preparedView?preparedView.ind:indicators(b,market,tf*60);if(!preparedView)ind.ema=ema(b.map(z=>z.close),params.emaPeriod);const i=b.length-1,c=b[i],p=b[i-1],e=ind.ema[i],a=ind.atr[i],v=ind.vwap[i];
 if(!(a>0))return {signals:[],analysis:{ready:false,reason:'Zero volatility'}};
 const trend=Math.sign(e-ind.ema[i-params.trendLookback]),volAvg=b.slice(i-params.volumeLookback,i).reduce((n,x)=>n+x.volume,0)/params.volumeLookback,rvol=volAvg?c.volume/volAvg:0;
 const efficiency=Math.abs(c.close-b[i-12].close)/(b.slice(i-11,i+1).reduce((n,x,j)=>n+Math.abs(x.close-b[i-12+j].close),0)||1);
 const regime=efficiency<0.25?'Choppy':efficiency>0.55?'Trending':'Transitional';
 const higherTF=Math.max(tf,base/60,market==='crypto'?params.higherCryptoTF:params.higherStockTF);let higherTrend;
 if(prepared)higherTrend=prepared.higher(now,higherTF,params.emaPeriod);else {let highBars=aggregate(bars,higherTF,base,now).filter(x=>x.complete);const highWidth=higherTF*60;let highCut=0;for(let h=1;h<highBars.length;h++)if(highBars[h].time-highBars[h-1].time!==highWidth&&(market!=='stocks'||parts(highBars[h].time*1000,'America/New_York').date===parts(highBars[h-1].time*1000,'America/New_York').date))highCut=h;highBars=highBars.slice(highCut);const higher=ema(highBars.map(x=>x.close),params.emaPeriod);
 higherTrend=higher.at(-2)==null?null:Math.sign(higher.at(-1)-higher.at(-2));
 }
 const crossAt=j=>ind.ema[j-1]==null?0:b[j-1].close<=ind.ema[j-1]&&b[j].close>ind.ema[j]?1:b[j-1].close>=ind.ema[j-1]&&b[j].close<ind.ema[j]?-1:0;
 const strict=params.strictContinuation??s.strictContinuations??true,cp=continuationParams(params,market);
 const candidates=[];const add=(strategy,dir,anchor,level,confirmed,reason,extra={})=>candidates.push({strategy,dir,anchor,level,confirmed,reason,...extra});
 const cross=crossAt(i);if(cross)add('ema-cross',cross,c.time,e,(c.close-c.open)*cross>0,`Closed candle crossed EMA ${params.emaPeriod}`);
 if(strict){
  for(let j=i-1;j>=Math.max(params.emaPeriod+1,i-params.continuationLookback);j--){const d=crossAt(j);if(!d)continue;const found=emaContinuation(b,ind.ema,ind.atr,d,j,cp);if(found)add('ema-retest',d,found.anchor,found.level,found.confirmed,'EMA move, pullback and later high/low resumption',found);break;}
  const ep=parts(c.time*1000,market==='stocks'?'America/New_York':'UTC'),start=market==='stocks'?c.time-(ep.minutes-570)*60:Math.floor(c.time/86400)*86400;let sessionStart=i;while(sessionStart>0&&b[sessionStart-1].time>=start)sessionStart--;
  if(trend){const found=vwapContinuation(b,ind.ema,ind.atr,ind.vwap,trend,sessionStart,cp);if(found)add('vwap',trend,found.anchor,found.level,found.confirmed,'VWAP trend-day pullback; later high/low resumption required',found);}
 }else{
 for(let j=i-1;j>=Math.max(params.emaPeriod+1,i-params.lookback);j--){const d=crossAt(j);if(!d)continue;const intact=b.slice(j+1,i).every((x,k)=>(x.close-ind.ema[j+1+k])*d>0);if(intact&&((d>0&&c.low<=e+params.touchATR*a)||(d<0&&c.high>=e-params.touchATR*a)))add('ema-retest',d,b[j].time,e,(c.close-e)*d>0&&(c.close-p.close)*d>0&&(c.close-c.open)*d>0,'Retest after a confirmed EMA cross');break;}
 if(v!=null&&ind.vwap[i-2]!=null){const d=trend;if((v-ind.vwap[i-2])*d>0&&(p.close-ind.vwap[i-1])*d>0&&((d>0&&c.low<=v+params.touchATR*a)||(d<0&&c.high>=v-params.touchATR*a)))add('vwap',d,c.time,v,(c.close-v)*d>0&&(c.close-c.open)*d>0,'Trend-aligned session VWAP retest');}
 }
 const rangeAt=j=>{const r=b.slice(j-params.consolidationBars,j);return {hi:Math.max(...r.map(x=>x.high)),lo:Math.min(...r.map(x=>x.low))};};
 for(let j=i;j>=Math.max(params.consolidationBars+1,i-params.lookback);j--){const r=rangeAt(j),x=b[j],prev=b[j-1],d=x.close>r.hi&&prev.close<=r.hi?1:x.close<r.lo&&prev.close>=r.lo?-1:0;if(!d||r.hi-r.lo>params.consolidationMaxATR*ind.atr[j]||Math.abs(x.close-x.open)<params.breakoutBodyATR*ind.atr[j])continue;const level=d>0?r.hi:r.lo;if(j===i)add('momentum',d,x.time,level,true,'Closed breakout of a 12-bar consolidation');else if(strict){const found=levelContinuation(b,ind.atr,d,j,level,cp);if(found)add('momentum-retest',d,found.anchor,level,found.confirmed,'First breakout retest; later high/low resumption required',found);}else if(b.slice(j+1,i).every(z=>(z.close-level)*d>0)&&((d>0&&c.low<=level+params.touchATR*a)||(d<0&&c.high>=level-params.touchATR*a)))add('momentum-retest',d,x.time,level,(c.close-level)*d>0&&(c.close-c.open)*d>0,'Retested the consolidation breakout boundary');break;}
 if(market==='stocks'){
  const date=parts(c.time*1000,'America/New_York').date;
  for(const n of [5,15]){const raw=prepared?prepared.opening(date,n,now):[...bars].sort((a,b)=>a.time-b.time).filter(x=>{const z=parts(x.time*1000,'America/New_York');return x.complete!==false&&z.date===date&&z.minutes>=570&&z.minutes<570+n&&x.time+base<=now/1000;});
   if(base!==60||raw.length!==n||raw.some((x,j)=>j&&x.time-raw[j-1].time!==60))continue;
   const hi=Math.max(...raw.map(x=>x.high)),lo=Math.min(...raw.map(x=>x.low));
   if(strict){for(const d of [1,-1]){const level=d>0?hi:lo,j=b.findIndex((z,k)=>k>0&&parts(z.time*1000,'America/New_York').date===date&&parts(z.time*1000,'America/New_York').minutes>=570+n&&(z.close-level)*d>0&&(b[k-1].close-level)*d<=0);if(j<0||parts(b[j].time*1000,'America/New_York').minutes>=660||parts(c.time*1000,'America/New_York').minutes>=660)continue;
    if(j===i)add('orb'+n,d,b[j].time,level,true,'First closed breakout of the opening range');else{const found=levelContinuation(b,ind.atr,d,j,level,cp);if(found)add('orb'+n+'-retest',d,found.anchor,level,found.confirmed,'First opening-range retest; later high/low resumption required',found);}
   }}else{
   for(let j=i;j>=Math.max(1,i-params.lookback);j--){const q=parts(b[j].time*1000,'America/New_York');if(q.date!==date||q.minutes<570+n||q.minutes>=660)continue;const d=b[j].close>hi&&b[j-1].close<=hi?1:b[j].close<lo&&b[j-1].close>=lo?-1:0;if(!d)continue;const level=d>0?hi:lo;
    if(j===i)add('orb'+n,d,b[j].time,level,true,`Closed outside the ${n}-minute opening range`);
    else if(parts(c.time*1000,'America/New_York').minutes<660&&b.slice(j+1,i).every(z=>(z.close-level)*d>0)&&((d>0&&c.low<=level+params.touchATR*a)||(d<0&&c.high>=level-params.touchATR*a)))add('orb'+n+'-retest',d,b[j].time,level,(c.close-level)*d>0&&(c.close-c.open)*d>0,'Retested the opening-range boundary');break;
   }
   }
  }
 }
 const signals=candidates.filter(x=>strategyEnabled(x.strategy,tf,s,market)).map(x=>{
  const swing=b.slice(-5),swingStop=x.dir>0?Math.min(...swing.map(z=>z.low))-a*params.stopBufferATR:Math.max(...swing.map(z=>z.high))+a*params.stopBufferATR;
  const floor=stopFloor(c.close,swingStop,x.dir,a,market,{...s,minStopATR:params.minStopATR??s.minStopATR,minStopBps:{...s.minStopBps,[market]:params.minStopBps??s.minStopBps[market]}},quote&&now-quote.time<=s.staleSeconds*1000&&quote.time<=now?quote:null),stop=floor.stop;
  const distance=Math.abs(c.close-stop),entry=[c.close-a*0.08,c.close+a*0.08],extension=Math.abs(c.close-e)/a;
  const levels=b.slice(-40,-1).flatMap(z=>[z.high,z.low]).filter(l=>(l-c.close)*x.dir>distance*0.5).sort((u,w)=>x.dir*(u-w));
  const structural=levels[0]??null,rr=structural?Math.min(params.targetR,Math.abs(structural-c.close)/distance):params.targetR;
  const spread=quote?.bid>0&&quote?.ask>=quote.bid?(quote.ask-quote.bid)/((quote.ask+quote.bid)/2)*10000:null;
  let factors=[
   {name:'EMA trend alignment',pass:trend===x.dir,weight:15,detail:`EMA slope over ${params.trendLookback} closed bars`},
   {name:'Candle confirmation',pass:x.confirmed,weight:25,detail:x.reason},
   {name:'Relative volume',pass:rvol>=(params.minRVOL??s.minRVOL),weight:15,detail:`${rvol.toFixed(2)}× versus previous ${params.volumeLookback} bars`},
   {name:'Market structure',pass:regime!=='Choppy',weight:15,detail:`${regime}; efficiency ${efficiency.toFixed(2)}`},
   {name:'Entry / invalidation',pass:extension<=s.maxExtension&&(floor.widened||distance<=s.maxStopATR*a)&&rr>=s.minRR,weight:20,detail:`${extension.toFixed(2)} ATR from EMA; ${rr.toFixed(2)}R before nearby structure`},
   {name:'Spread verified',pass:spread!=null&&spread<=s.maxSpreadBps,weight:10,detail:spread==null?'Bid/ask unavailable':`${spread.toFixed(2)} bps`}
  ];
  if(s.qualificationMode==='balanced')factors=[
   {...factors[0],weight:15},{...factors[1],weight:30},{...factors[2],weight:5},{...factors[3],weight:10},
   {name:'Not chasing',pass:extension<=s.maxExtension,weight:15,detail:`${extension.toFixed(2)} ATR from EMA`},
   {name:'Stop distance sensible',pass:floor.widened||distance<=s.maxStopATR*a,weight:10,detail:`${floor.stopATR.toFixed(2)} ATR stop including noise/cost floor`},
   {name:'Room to next level',pass:rr>=s.minRR,weight:10,detail:`${rr.toFixed(2)}R before nearby structure; fixed scenarios are also shown`},
   {...factors[5],weight:5}];
  const failures=[];for(const f of x.checks||[]){factors.push(f);if(!f.pass&&f.name!=='Later high/low resumption')failures.push('Continuation requirement: '+f.name);}
  if(market==='stocks'&&x.strategy==='momentum'&&params.minDayMovePct>0){const date=parts(c.time*1000,'America/New_York').date,first=b.findIndex(z=>parts(z.time*1000,'America/New_York').date===date),ref=first>0?b[first-1].close:b[first].open,move=x.dir*(c.close/ref-1)*100;factors.push({name:'Strong day move',pass:move>=params.minDayMovePct,weight:10,detail:move.toFixed(2)+'% in setup direction'});if(move<params.minDayMovePct)failures.push('Day move below momentum threshold');}
  if(s.filters.confirmation&&(trend!==x.dir||(c.close-p.close)*x.dir<=0||rvol<(params.minRVOL??s.minRVOL)))failures.push('Trend, momentum and volume must all agree');
  if((params.requireHigherTF??s.filters.trend)&&higherTrend!==x.dir)failures.push(higherTrend==null?'Higher-timeframe EMA needs more history':'Higher-timeframe trend disagrees');
  if(s.filters.volume&&rvol<(params.minRVOL??s.minRVOL))failures.push('Weak relative volume');
  if(s.filters.chop&&regime==='Choppy')failures.push('Choppy market');
  if(s.filters.vwap&&(v==null||(c.close-v)*x.dir<=0))failures.push('VWAP confirmation unavailable or disagrees');
  if(s.filters.market&&market==='stocks'&&marketTrend!==x.dir)failures.push('Broad-market direction unavailable or disagrees');
  if(s.filters.spread&&(spread==null||spread>s.maxSpreadBps))failures.push('Spread unavailable or too wide');
  if(extension>s.maxExtension)failures.push('Entry extended from EMA');if(!floor.widened&&distance>s.maxStopATR*a)failures.push('Stop too far away');if(rr<s.minRR)failures.push('Nearby structure limits reward/risk');
  const family=x.strategy.replace(/-retest$/,'').replace('ema-cross','ema');
  const setupKey=`${symbol}:${tf}:${family}:${x.dir}:${family.startsWith('orb')?parts(x.anchor*1000,'America/New_York').date:x.anchor}`;
  const score=Math.round(100*factors.reduce((n,f)=>n+(f.pass?f.weight:0),0)/factors.reduce((n,f)=>n+f.weight,0));if(score<s.minScore)failures.push('Score below threshold');
  const costQuote=quote&&quote.time<=now+5000&&now-quote.time<=s.staleSeconds*1000?quote:null;
  const size=positionSize(c.close,stop,market,s,costQuote);if(size.size<=0)failures.push('No affordable size within risk budget');
  const reward=rewardMetrics(c.close,stop,c.close+x.dir*distance*rr,market,s,costQuote),{netRR}=reward;if(netRR<s.minRR)failures.push('Estimated costs reduce net target R below minimum');
  const qualification=patternQualification({confirmed:x.confirmed,failures,settings:s,params,strategy:x.strategy});let status=qualification.status;
  const stale=now/1000-(c.time+tf*60)>tf*60+15;
  if(stale)status='STALE';
  const warnings=[...failures];if(market==='crypto')warnings.push('Spot-candle setup. Coinbase derivatives allocation is a separate planning scenario; bearish spot setups remain exit/avoid analysis.');else warnings.push('Underlying stock analysis. Inspect the separate options panel for verified contract data; stock signals do not select option contracts.');
  if(market==='crypto'&&x.dir<0){warnings.push('No verified shortable product');if(status==='CONFIRMED'&&s.qualificationMode!=='balanced')status='WATCH';}
  return {id:`${setupKey}:${x.strategy}`,setupKey,symbol,market,tf,strategy:x.strategy,name:RULES[x.strategy].name.replace('34',String(params.emaPeriod)),...qualification,qualificationMode:s.qualificationMode||'strict',callWindowBars:s.callWindowBars??2,direction:x.dir>0?'bullish':'bearish',dir:x.dir,time:c.time*1000,confirmedAt:c.closeTime??(c.time+tf*60)*1000,price:c.close,entry,stop,target:c.close+x.dir*distance*rr,stopReason:floor.widened?'Swing stop widened to the ATR / basis-point noise floor':`Recent 5-bar swing plus ${params.stopBufferATR} ATR buffer`,invalidation:`${x.dir>0?'Below':'Above'} frozen stop invalidates; price moving outside the entry tolerance returns the setup to WATCH.`,exits:[{name:'1.5R scenario',price:c.close+x.dir*distance*1.5,rr:1.5},{name:'2R scenario',price:c.close+x.dir*distance*2,rr:2},...(structural?[{name:'Nearby structure',price:structural,rr}]:[])],exitNote:'Earlier exits reduce give-back but cap upside; trailing behind swings can capture trends but gives back open profit.',rr,netRR,costsAsRiskPct:reward.costsAsRiskPct,netRewardRisk:reward.netRewardRisk,costs:marketCosts(s,market,costQuote),targetCapped:rr<s.minRR,stopATR:floor.stopATR,stopBps:floor.stopBps,adx:ind.adx[i],efficiency,extension,trendAlignment:trend===x.dir,higherAlignment:higherTrend===x.dir,higherTF,parameters:{...structuredClone(params),strictContinuation:strict},score,factors,warnings,status,size,regime,rvol,atr:a,replay,leverage:null,options:null};
 });
 return {signals,analysis:{ready:true,regime,ema:e,vwap:v,atr:a,adx:ind.adx[i],rvol,efficiency,trend,higherTrend,lastClose:c.close,time:c.time*1000,bars:b.length}};
}
export function mergeSignals(existing,incoming,now,quotes={},limit=100){
 const map=new Map(existing.map(s=>[s.id,s]));
 // Once confirmed, preserve the original closed-candle thesis. Later data may change status, never its levels.
 for(const s of incoming){const old=map.get(s.id),frozen=old&&(old.frozen||old.status==='CONFIRMED'||old.status==='INVALIDATED');map.set(s.id,frozen?{...old,frozen:true}:{...s,frozen:s.status==='CONFIRMED',firstSeen:old?.firstSeen??now});}
 for(const [id,s] of map){if(s.status==='INVALIDATED'||s.conflicted)continue;const q=quotes[s.symbol];if(q?.price&&q.time>=s.confirmedAt&&(q.price-s.stop)*s.dir<=0)map.set(id,{...s,status:'INVALIDATED'});else if(s.expiresAt?now>=s.expiresAt:now>=entryExpiresAt(s))map.set(id,{...s,status:'STALE'});}
 return [...map.values()].sort((a,b)=>b.confirmedAt-a.confirmedAt).slice(0,limit);
}
export function applyGates(sig,risk,s,now,quote,journal=[]){
 let status=sig.status;const warnings=[...sig.warnings];const active=['CONFIRMED','SETUP FORMING','WATCH'].includes(status),hours=session(now,s);
 if(active&&sig.horizon!=='swing'&&!sig.replay&&(!quote||now-quote.time>staleFor(s,sig.market)*1000||quote.time-now>5000)){status='STALE';warnings.push('Live quote stale, unavailable, or clock mismatch');}
 if(active&&sig.replay){status='WATCH';warnings.push('Imported historical data: replay only');}
 if(status==='CONFIRMED'&&sig.entryOrder!=='stop'&&sig.horizon!=='swing'&&quote&&Math.abs(quote.price-sig.price)>sig.atr*0.3){status='WATCH';warnings.push('Live price moved outside entry tolerance');}
 if(['CONFIRMED','SETUP FORMING','WATCH'].includes(status)&&(risk.blocked||sig.horizon!=='swing'&&!(sig.market==='crypto'?hours.crypto:hours.stocks))){status='BLOCKED BY RISK RULE';warnings.push(risk.reason??'Outside configured entry schedule');}
 if(['CONFIRMED','SETUP FORMING','WATCH'].includes(status)&&sig.horizon!=='swing'&&sig.market==='stocks'&&stockEntryBlocked(now,s)){status='BLOCKED BY RISK RULE';warnings.push('Stock no-entry window (Eastern time)');}
 if(journal.some(j=>j.decision==='taken'&&(j.signalId===sig.id||(sig.setupKey&&(j.setupKeys||[j.setupKey]).some(k=>(sig.setupKeys||[sig.setupKey]).includes(k)))))){status='BLOCKED BY RISK RULE';warnings.push('This signal is already recorded as taken');}
 return {...sig,status,warnings,currentPrice:quote?.price??null,quoteTime:quote?.time??null};
}
export function metrics(trades){trades=[...trades].sort((a,b)=>(typeof a.closedAt==='number'?a.closedAt:Date.parse(a.closedAt)||a.time||0)-(typeof b.closedAt==='number'?b.closedAt:Date.parse(b.closedAt)||b.time||0));let equity=0,peak=0,drawdown=0;for(const t of trades){equity+=t.pnl;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);}const wins=trades.filter(t=>t.pnl>0),losses=trades.filter(t=>t.pnl<0),sum=a=>a.reduce((n,t)=>n+t.pnl,0);return {count:trades.length,winRate:trades.length?wins.length/trades.length:null,averageWin:wins.length?sum(wins)/wins.length:null,averageLoss:losses.length?sum(losses)/losses.length:null,expectancy:trades.length?equity/trades.length:null,pnl:equity,maxDrawdown:drawdown,profitFactor:losses.length?sum(wins)/-sum(losses):null};}
export function backtest({symbol,market,bars,base=300,tf=5,settings:s=DEFAULTS,strategy='ema-retest',exitR=2,splitIndex=null,embargoBars=12,evaluationCache=null,source=null,fallback=false,prepared=null,cacheIndicators=true}){
 if(!['stocks','crypto'].includes(market))throw Error('Historical options replay needs historical bid/ask data.');
 bars=normalizeBars(bars,base);if(!prepared&&cacheIndicators)prepared=new ReplaySeries({bars,base,tf,market});if(!(exitR>0))throw Error('Positive exit R required');
 const agg=aggregate(bars,tf,base,Date.now()-2000).filter(b=>b.complete),split=splitIndex??Math.floor(agg.length*0.7),seen=new Set();
 if(agg.length<100)throw Error('At least 100 complete candles required for replay. Collect more data or import OHLCV.');
 if(!Number.isInteger(split)||split<62||split>=agg.length||!Number.isInteger(embargoBars)||embargoBars<12)throw Error('Invalid chronological split or embargo');
 const c=marketCosts(s,market),fillBps=c.slippageBps+c.spreadBps/2,exitStyle=s.exitStyles?.[0]||'fixed',missedFills=[];
 function run(start,end){const trades=[];let pos=null;const journal=[];
  for(let i=start;i<end;i++){
   const bar=agg[i];if(pos){const distance=pos.initialDistance;pos.mfeR=Math.max(pos.mfeR,(pos.dir>0?bar.high-pos.entry:pos.entry-bar.low)/distance);pos.maeR=Math.min(pos.maeR,(pos.dir>0?bar.low-pos.entry:pos.entry-bar.high)/distance);const stopHit=pos.dir>0?bar.low<=pos.stop:bar.high>=pos.stop,targetHit=exitStyle==='fixed'&&(pos.dir>0?bar.high>=pos.target:bar.low<=pos.target);const timeout=i-pos.index>=12;
    if(stopHit||targetHit||timeout||i===end-1){let exit=stopHit?(pos.dir>0?Math.min(bar.open,pos.stop):Math.max(bar.open,pos.stop)):targetHit?pos.target:bar.close;exit-=pos.dir*exit*fillBps/10000;const pnl=(exit-pos.entry)*pos.dir*pos.size-(exit+pos.entry)*pos.size*c.feeBps/10000;const t={...pos,exit,exitReason:stopHit?'stopped out':targetHit?'hit target':'expired',closedAt:new Date((bar.time+tf*60)*1000).toISOString(),pnl,realizedR:pnl/(distance*pos.size),outcome:pnl>0?'win':pnl<0?'loss':'breakeven'};trades.push(t);journal.push({...t,id:String(i),time:new Date(pos.time).toISOString(),decision:'taken'});pos=null;}else if(exitStyle==='atr-trail'){const av=atr(agg.slice(0,i+1)).at(-1),candidate=bar.close-pos.dir*s.trailingATR*av;pos.stop=pos.dir>0?Math.max(pos.stop,candidate):Math.min(pos.stop,candidate);}else if(exitStyle==='swing-trail'){const recent=agg.slice(Math.max(0,i-4),i+1),candidate=pos.dir>0?Math.min(...recent.map(b=>b.low)):Math.max(...recent.map(b=>b.high));pos.stop=pos.dir>0?Math.max(pos.stop,candidate):Math.min(pos.stop,candidate);}continue;}
   if(i>=end-1)continue;
   const closeTime=(bar.time+tf*60)*1000,history=prepared?bars:bars.filter(b=>b.time+base<=closeTime/1000),testSettings={...s,filters:{...s.filters,spread:false,market:false,regime:false,events:false}};
   let out=evaluationCache?.get(closeTime);if(!out){out=evaluate({symbol,market,bars:history,base,tf,settings:testSettings,source,fallback,prepared,now:closeTime,replay:true});evaluationCache?.set(closeTime,out);}
   const sig=out.signals.find(x=>x.status==='CONFIRMED'&&!x.conflicted&&(x.strategies||[x.strategy]).includes(strategy)&&!seen.has(x.id));if(!sig)continue;seen.add(sig.id);
   const next=agg[i+1];if(next.time!==bar.time+tf*60)continue;const hours=session(next.time*1000,s);if(!(market==='crypto'?hours.crypto:hours.stocks)||market==='stocks'&&(stockEntryBlocked(closeTime,s)||stockEntryBlocked(next.time*1000,s))||riskState(journal,s,next.time*1000).blocked)continue;
   if(s.entryOrder==='limit'&&!(sig.dir>0?next.low<sig.price:next.high>sig.price)){missedFills.push({signalId:sig.id,time:next.time*1000,reason:'Limit not traded through on next bar'});continue;}const rawEntry=s.entryOrder==='limit'?(sig.dir>0?Math.min(next.open,sig.price):Math.max(next.open,sig.price)):next.open;const entry=rawEntry+sig.dir*rawEntry*fillBps/10000;if((entry-sig.stop)*sig.dir<=0||Math.abs(entry-sig.price)>sig.atr*0.3)continue;
   const distance=Math.abs(entry-sig.stop),rr=Math.min(exitR,sig.rr),target=entry+sig.dir*distance*rr;if(rewardMetrics(entry,sig.stop,target,market,s).netRR<s.minRR)continue;
   const size=positionSize(entry,sig.stop,market,s).size;if(!size)continue;
   pos={source:sig.source,fallback:sig.fallback,strategies:sig.strategies,confluenceCount:sig.confluenceCount,candleClose:sig.confirmedAt,features:{asOf:sig.confirmedAt,strategies:sig.strategies,confluenceCount:sig.confluenceCount,rvol:sig.rvol,adx:sig.adx,efficiency:sig.efficiency,extension:sig.extension,stopATR:sig.stopATR,netRR:sig.netRR,trendAlignment:sig.trendAlignment,higherAlignment:sig.higherAlignment,dir:sig.dir,tf:sig.tf,etHour:+parts(closeTime,'America/New_York').hour},featureTime:closeTime,time:next.time*1000,index:i+1,initialDistance:distance,initialStop:sig.stop,exitStyle,entry,stop:sig.stop,target,dir:sig.dir,size,tf,rr,targetCapped:rr<s.minRR,cohort:'confirmed',regime:sig.regime,adx:sig.adx,efficiency:sig.efficiency,stopATR:sig.stopATR,etHour:+parts(next.time*1000,'America/New_York').hour,mfeR:0,maeR:0,signalId:sig.id,market,symbol,strategy,segment:start===50?'development':'out-of-sample'};
  }return trades;
 }
 const development=run(50,Math.max(50,split-embargoBars)),outOfSample=run(split,agg.length),all=[...development,...outOfSample];
 const start=agg[split].open,end=agg.at(-1).close,qty=s.capital/(start*(1+(c.feeBps+fillBps)/10000));
 return {symbol,market,strategy,tf,exitStyle,missedFills,settings:structuredClone(s),period:[agg[0].time*1000,(agg.at(-1).time+tf*60)*1000],splitTime:agg[split].time*1000,development:metrics(development),outOfSample:metrics(outOfSample),regimes:Object.fromEntries(['Trending','Transitional','Choppy'].map(r=>[r,metrics(outOfSample.filter(t=>t.regime===r))])),baseline:{name:'Out-of-sample buy & hold, same cash capital',pnl:(end-start)*qty-(end+start)*qty*(c.feeBps+fillBps)/10000},trades:all,assumptions:`Chronological split with a 12-bar embargo, 50-bar warmup, next-bar open fills, ${exitR}R scenario capped at nearby structure, or 12-bar time exit. Stop first if both levels touched; gaps through stops fill at worse open. ${market} fee ${c.feeBps} bps per side, slippage ${c.slippageBps} bps per side, spread ${c.spreadBps} bps round trip. R uses the original price-stop distance; net target R and conventional net reward/risk are separate measures. Eastern no-entry windows apply. Shared daily risk limits within this single-asset replay. No intrabar path, depth, borrow costs or derivatives. Historical spread filter disabled; configured spread assumption used. Live benchmark, VIX, earnings and macro filters are excluded because point-in-time context is not archived for this historical period; this replay validates candle rules only. Separate runs are not a combined portfolio.`,warning:'Survivorship limitation: this is a selected-symbol replay, not a point-in-time market universe; delisted securities are not automatically included. Repeated holdout inspection contaminates validation. Stock shorts assume borrow availability and omit borrow charges. Exploratory replay, not evidence of profitability. Small recent samples are insufficient for validation; no parameter optimization performed.'};
}
