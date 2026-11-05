import test from 'node:test';import assert from 'node:assert/strict';import {emaSeries,sessionVWAP,chartIndicatorSettings} from '../modules/chart-indicators.mjs';import {patternsForChart} from '../modules/chart-pattern-view.mjs';
const bar=(time,close,volume=1)=>({time,open:close,high:close,low:close,close,volume});
test('EMA uses causal recursive smoothing, waits for warmup and does not repaint earlier values',()=>{const b=[bar(0,10),bar(60,20),bar(120,30),bar(180,40)];assert.deepEqual(emaSeries(b,3),[{time:120,value:22.5},{time:180,value:31.25}]);assert.deepEqual(emaSeries(b.slice(0,3),3),emaSeries(b,3).slice(0,1));assert.equal(emaSeries(b,5).length,0);});
test('Stock VWAP starts at the regular open, excludes extended hours, and crypto resets at UTC midnight',()=>{
 const open=Date.parse('2026-10-30T13:30Z')/1000,next=Date.parse('2026-11-02T14:30Z')/1000;
 const rows=[bar(open-60,900),bar(open,10),bar(open+60,20,3),bar(open+390*60,777),bar(next,30)];
 assert.deepEqual(sessionVWAP(rows,'stocks',60),[{time:open-60},{time:open,value:10},{time:open+60,value:17.5},{time:open+390*60},{time:next,value:30}]);
 const midnight=Date.parse('2026-10-31T00:00Z')/1000;assert.equal(sessionVWAP([bar(midnight-60,10),bar(midnight,20)],'crypto')[1].value,20);
});
test('Indicator preferences bound periods, reject invalid colors, and retain explicit disable states',()=>{const p=chartIndicatorSettings({emas:[{period:-5,color:'javascript:bad',enabled:false}],vwap:{enabled:false},drawings:false});assert.equal(p.emas[0].period,1);assert.equal(p.emas[0].color,'#43d9f3');assert.equal(p.emas[0].enabled,false);assert.equal(p.vwap.enabled,false);assert.equal(p.drawings,false);assert.equal(chartIndicatorSettings({emas:Array(10).fill({period:20})}).emas.length,6);});
test('Pattern drawings select only the visible feed and timeframe, excluding Robinhood records on IEX',()=>{const records=[{id:'rh',symbol:'SPY',tf:5,source:'Robinhood'},{id:'iex',symbol:'SPY',tf:5,source:'Alpaca IEX'},{id:'other-tf',symbol:'SPY',tf:15,source:'Alpaca IEX'}];assert.deepEqual(patternsForChart({enabled:true,health:{'SPY:5':{source:'Alpaca IEX'}},records},'SPY',5).map(r=>r.id),['iex']);assert.deepEqual(patternsForChart({enabled:false,records},'SPY',5),[]);});

test('Stock chart uses the same HLC3 VWAP as EMA9 and clips buckets straddling the open',async()=>{
 const {regularVwapInput,vwapStep}=await import('../modules/chart-indicators.mjs');
 const {strategySeries}=await import('../modules/ema9-vwap.mjs');
 const {DEFAULTS,aggregate}=await import('../modules/engine.mjs');
 const open=Date.parse('2026-11-03T14:30Z')/1000,now=(open+3600)*1000;
 const raw=Array.from({length:60},(_,i)=>bar(open+(i-30)*60,i<30?900:i,2));
 const rows=aggregate(raw,3,60,now),state=[],days=new Map();
 for(const b of rows){const input=regularVwapInput(raw,b,180,60,now,DEFAULTS,days);if(input)state.push(vwapStep(state.at(-1),input,'stocks',180,DEFAULTS));}
 assert.deepEqual(state.map(s=>s.point.value),strategySeries(raw,60,DEFAULTS,now).map(b=>b.vwap));
 const hour=aggregate(raw,60,60,now)[0],clipped=regularVwapInput(raw,hour,3600,60,now,DEFAULTS,days);
 assert.equal(clipped.time,open);assert.equal(clipped.high,59);assert.equal(clipped.volume,60);
});
