import test from 'node:test';import assert from 'node:assert/strict';
import {AlpacaChartFeed,alpacaBar,stockSymbol} from '../modules/alpaca-chart.mjs';import {chartBars} from '../modules/live-chart-data.mjs';
class Socket{static sockets=[];constructor(url){this.url=url;this.handlers={};this.sent=[];Socket.sockets.push(this);}addEventListener(k,f){this.handlers[k]=f;}send(s){this.sent.push(JSON.parse(s));}close(){this.handlers.close?.();}message(rows){this.handlers.message({data:JSON.stringify(rows)});}}
const row={t:'2026-10-30T14:30:00Z',o:100,h:102,l:99,c:101,v:12};
test('Chart aggregation keeps OHLC and volume across timeframe boundaries without changing inputs',()=>{const first=alpacaBar(row),second={...first,time:first.time+60,open:101,high:104,low:100,close:103,volume:5},third={...first,time:first.time+300};const input=[third,second,first],before=structuredClone(input);const result=chartBars(input,5);assert.equal(result.length,2);assert.deepEqual(result[0],{...first,high:104,close:103,volume:17});assert.deepEqual(input,before);assert.equal(alpacaBar({...row,h:98}),null);assert.throws(()=>stockSymbol('../secret'));});
test('Invalid credentials do not replace a working connection or expose the provider response',async()=>{const f=new AlpacaChartFeed({fetcher:async()=>({ok:false,status:403,json:async()=>({secret:'private'})})});f.credentials={key:'old',secret:'old-secret'};await assert.rejects(f.connect({key:'new',secret:'new-secret'}),/rejected/);assert.equal(f.credentials.key,'old');assert.ok(!JSON.stringify(f.view()).includes('old-secret'));});
test('Chart feed uses IEX only, validates keys, and sends credentials only to fixed Alpaca hosts',async()=>{const requests=[];const f=new AlpacaChartFeed({Socket,fetcher:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({bars:{SPY:[row]}})};}});await f.connect({key:'paper',secret:'private'});const messages=[],res={write:s=>messages.push(s)},req={on(){}};res.writeHead=()=>{};f.attach('SPY',req,res);const ws=Socket.sockets.at(-1);ws.handlers.open();ws.message([{T:'success',msg:'authenticated'}]);await f.history('SPY');ws.message([{T:'t',S:'SPY',p:103,s:2,c:['@'],t:'2026-10-30T14:31:01Z'}]);assert.equal(f.bars.get('SPY').at(-1).close,103);ws.message([{T:'t',S:'SPY',p:900,s:2,c:['I'],t:'2026-10-30T14:31:02Z'}]);assert.equal(f.bars.get('SPY').at(-1).close,103);ws.message([{T:'u',S:'SPY',...row,c:102}]);assert.equal(f.bars.get('SPY')[0].close,102);assert.equal(ws.url,'wss://stream.data.alpaca.markets/v2/iex');assert.ok(requests.every(r=>r.url.startsWith('https://data.alpaca.markets/')));assert.ok(!messages.join('').includes('private'));f.stop();});
test('Offline review never opens a provider connection',async()=>{const f=new AlpacaChartFeed({offline:true,fetcher:()=>{throw Error('must not call');}});await assert.rejects(f.connect({key:'key',secret:'secret'}),/offline/);assert.equal(f.view().configured,false);});
test('Reconnect history replaces old closed candles with provider corrections',async()=>{const f=new AlpacaChartFeed({fetcher:async()=>({ok:true,json:async()=>({bars:{SPY:[{...row,c:102}]}})})});f.credentials={key:'key',secret:'secret'};f.bars.set('SPY',[alpacaBar(row)]);await f.history('SPY');assert.equal(f.bars.get('SPY')[0].close,102);});
test('Disconnect forgets credentials and closes viewers without returning secrets',()=>{let cleared=0,ended=0;const f=new AlpacaChartFeed({store:{clear(){cleared++;}}});f.credentials={key:'key',secret:'secret'};f.clients.set({write(){},end(){ended++;}},'SPY');const d=f.disconnect();assert.equal(d.configured,false);assert.equal(cleared,1);assert.equal(ended,1);assert.equal(f.clients.size,0);});

test('Live minute, rollover and late official corrections update series incrementally',async()=>{
 const {upsertChartBar,updateChartTail}=await import('../modules/live-chart-data.mjs');
 const {emaStep,emaSeries,sessionVWAP,vwapStep}=await import('../modules/chart-indicators.mjs');
 const {aggregate}=await import('../modules/engine.mjs');
 const start=Date.parse('2026-10-30T13:30Z')/1000,b=(i,c)=>({time:start+i*60,open:c,high:c,low:c,close:c,volume:1});
 const raw=[b(0,10),b(1,20),b(2,30)],updates=[],series={update:(point,historical)=>updates.push([point,historical])};
 const chart={raw,rows:[],candles:series,volume:series,lines:[{series,states:[],step:(s,x)=>emaStep(s,x,2)},{series,states:[],step:(s,x)=>vwapStep(s,x,'stocks',180)}]};
 const paint=startTime=>updateChartTail(chart,startTime,3,(start+600)*1000);
 paint(start);assert.deepEqual(chart.rows,aggregate(raw,3,60,(start+600)*1000));
 const initial=chart.rows[0];
 for(const [i,c,action] of [[3,40,'append'],[3,42,'latest'],[4,50,'append'],[5,60,'append']]){
  assert.equal(upsertChartBar(raw,b(i,c)),action);paint(start+180);assert.strictEqual(chart.rows[0],initial);
 }
 assert.equal(upsertChartBar(raw,b(1,100)),'correction');paint(start);
 assert.deepEqual(chart.rows,aggregate(raw,3,60,(start+600)*1000));
 assert.deepEqual(chart.lines[0].states.map(s=>s.point).filter(p=>p.value!==undefined),emaSeries(chart.rows,2));
 assert.deepEqual(chart.lines[1].states.map(s=>s.point),sessionVWAP(chart.rows,'stocks',180));assert.ok(updates.some(([,historical])=>historical));
});
