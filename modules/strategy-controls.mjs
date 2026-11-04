// Fixed, user-controlled hypotheses. Model validation never changes these values.
export const PARAMS={
 strictContinuation:{label:'Stricter continuation sequence (blank uses shared setting)',value:null,tristate:true},
 continuationLookback:{label:'EMA cross search for continuation (bars)',value:20,min:3,max:40,integer:true},
 continuationTouchATR:{label:'Continuation retest touch band (ATR)',value:.15,min:0,max:2},
 minMoveATR:{label:'Minimum move after EMA cross (ATR)',value:.6,min:0,max:5},
 resumptionBars:{label:'Maximum bars after the retest to resume',value:3,min:1,max:10,integer:true},
 vwapTrendBars:{label:'VWAP trend lookback (blank: stocks 20, crypto 24)',value:null,min:5,max:60,integer:true},
 vwapSideFraction:{label:'VWAP same-side fraction (blank: stocks .8, crypto .75)',value:null,min:.5,max:1},
 vwapMaxCrosses:{label:'Maximum VWAP crosses (blank: stocks 2, crypto 3)',value:null,min:0,max:20,integer:true},
 vwapMinSessionBars:{label:'VWAP minimum session bars (blank: stocks 10, crypto 12)',value:null,min:1,max:60,integer:true},
 vwapRequireEMASlope:{label:'Require EMA slope for VWAP (blank: crypto only)',value:null,tristate:true},
 minDayMovePct:{label:'Minimum stock momentum day move (%)',value:0,min:0,max:50},
 trendLookback:{label:'EMA slope lookback (bars)',value:3,min:1,max:20,integer:true},
 emaPeriod:{label:'EMA length (bars)',value:34,min:5,max:100,integer:true},
 lookback:{label:'Retest search (bars)',value:8,min:1,max:30,integer:true},
 touchATR:{label:'Touch distance (ATR)',value:.2,min:0,max:2},
 consolidationBars:{label:'Consolidation length (bars)',value:12,min:3,max:30,integer:true},
 consolidationMaxATR:{label:'Maximum consolidation width (ATR)',value:6,min:.1,max:20},
 breakoutBodyATR:{label:'Minimum breakout candle body (ATR)',value:.5,min:0,max:5},
 volumeLookback:{label:'Volume average (bars)',value:20,min:5,max:50,integer:true},
 minRVOL:{label:'Minimum relative volume (blank uses shared setting)',value:null,min:0,max:20},
 higherStockTF:{label:'Stock trend timeframe (minutes)',value:5,choices:[5,15,30,60]},
 higherCryptoTF:{label:'Crypto trend timeframe (minutes)',value:15,choices:[15,30,60,1440,10080]},
 requireHigherTF:{label:'Higher timeframe filter',value:null,tristate:true},
 stopBufferATR:{label:'Swing stop buffer (ATR)',value:.15,min:0,max:5},
 minStopATR:{label:'Minimum stop ATR (blank uses shared setting)',value:null,min:0,max:20},
 minStopBps:{label:'Minimum stop bps (blank uses market setting)',value:null,min:0,max:1000},
 targetR:{label:'Target R before nearby structure cap',value:2,min:.1,max:10}
};
export function strategyParams(settings,id){return {...Object.fromEntries(Object.entries(PARAMS).map(([k,d])=>[k,d.value])),...settings.strategyParams?.[id]};}
export function validateStrategyParams(rows,rules){
 if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('Invalid strategy parameters');
 for(const [id,row] of Object.entries(rows)){
  if(!rules[id]||!row||typeof row!=='object'||Array.isArray(row))throw Error('Unknown strategy parameters');
  for(const [k,v]of Object.entries(row)){const d=PARAMS[k];if(!d)throw Error('Unknown strategy parameter: '+k);
   const valid=d.tristate?v===null||typeof v==='boolean':d.boolean?typeof v==='boolean':d.choices?d.choices.includes(v):v===null&&d.value===null||Number.isFinite(v)&&v>=d.min&&v<=d.max&&(!d.integer||Number.isInteger(v));
   if(!valid)throw Error('Invalid strategy parameter: '+k);
  }
 }return rows;
}
