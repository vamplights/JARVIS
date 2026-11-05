import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RobinhoodClient,robinhoodMarketOpen,MARKET_TOOLS} from '../modules/robinhood-client.mjs';
import {CoinbaseFeed} from '../modules/feed.mjs';
import {RobinhoodLive} from '../modules/robinhood-live.mjs';
import {MarketContext} from '../modules/market-context.mjs';
import {DEFAULTS} from '../modules/engine.mjs';
import {liveDataReady,scheduleAfterLive} from '../modules/startup-live.mjs';
const at=s=>Date.parse(s);
test('Robinhood window uses Eastern trading days, holidays, early closes and calendar overrides',()=>{
 for(const [time,open] of [
  ['2026-11-07T15:00:00Z',false],['2026-11-04T01:00:00Z',false],
  ['2026-11-04T14:19:59Z',false],['2026-11-04T14:20:00Z',true],
  ['2026-11-04T21:09:59Z',true],['2026-11-04T21:10:00Z',false],
  ['2026-11-26T15:00:00Z',false],['2026-11-27T18:09:59Z',true],['2026-11-27T18:10:00Z',false],
  ['2026-07-06T13:20:00Z',true],['2026-07-06T20:10:00Z',false]
 ])assert.equal(robinhoodMarketOpen(at(time)),open,time);
 assert.equal(robinhoodMarketOpen(at('2026-11-04T15:00:00Z'),{...DEFAULTS,extraClosures:['2026-11-04']}),false);
 assert.equal(robinhoodMarketOpen(at('2026-11-04T18:10:00Z'),{...DEFAULTS,earlyCloses:{'2026-11-04':'13:00'}}),false);
});
test('Every client network entry pauses without refreshing or deleting authorization and resumes at 09:20',async()=>{
 let now=at('2026-11-04T14:19:59Z'),requests=0;
 const client=new RobinhoodClient({now:()=>now,fetcher:async(url,options)=>{requests++;return Response.json({id:JSON.parse(options.body).id,result:{structuredContent:{data:{results:[]}}}});}});
 client.initialized=true;client.tokens={access:'saved',refresh:'refresh',expires:0};const tokens=client.tokens;
 for(const name of MARKET_TOOLS)await assert.rejects(client.call(name,{}),e=>e.marketClosed);
 await assert.rejects(client.ensureToken(),e=>e.marketClosed);
 await assert.rejects(client.begin(),e=>e.marketClosed);
 await assert.rejects(client.token({}),e=>e.marketClosed);
 assert.equal(requests,0);assert.equal(client.tokens,tokens);assert.equal(client.connected,true);
 now=at('2026-11-04T14:20:00Z');tokens.expires=Date.now()+3600000;
 await client.call('get_equity_quotes',{});assert.equal(requests,1);
});
test('Retries recheck the market window before sending another HTTP request',async()=>{
 let now=at('2026-11-04T21:09:59Z'),requests=0;
 const client=new RobinhoodClient({now:()=>now,retryDelayMs:0,fetcher:async()=>{requests++;now=at('2026-11-04T21:10:00Z');return new Response(null,{status:503});}});
 client.initialized=true;client.tokens={access:'saved',expires:Date.now()+3600000};
 await assert.rejects(client.call('get_equity_quotes',{}),e=>e.marketClosed);assert.equal(requests,1);assert.equal(client.connected,true);
});
test('Closed live poller retains data and normal status, keeps resume timer, and startup releases immediately',async()=>{
 let now=at('2026-11-04T14:19:59Z'),requests=0;
 const client=new RobinhoodClient({now:()=>now,fetcher:async()=>{requests++;throw Error('unexpected');}});client.tokens={access:'saved',expires:Date.now()+3600000};
 const live=new RobinhoodLive({client,settings:()=>DEFAULTS});live.assets={SPY:{quote:{price:100}}};live.options.contracts=[{id:'retained'}];live.error='Previous timeout';const prior=live.options;
 try{await live.tick(true);await live.refreshHistory();await live.refreshSelectedOptions();await live.selectOptions({symbol:'SPY'});await live.warmChains();await live.refreshSignalOptions([]);await live.refreshOptions();assert.equal(requests,0);assert.equal(live.options,prior);assert.equal(live.assets.SPY.quote.price,100);assert.equal(live.status.status,'MARKET CLOSED');assert.equal(live.status.error,null);assert.ok(live.timer);
 assert.equal(liveDataReady(live,DEFAULTS),true);let queued,ran=false;scheduleAfterLive({ready:()=>liveDataReady(live,DEFAULTS),run:()=>{ran=true;},schedule:fn=>(queued=fn)});queued();await Promise.resolve();assert.equal(ran,true);
 now=at('2026-11-04T14:20:00Z');assert.equal(client.marketOpen,true);assert.equal(liveDataReady(live,DEFAULTS),false);
 }finally{live.stopTimer();}
});
test('Public context calendars continue while Robinhood context remains untouched when closed',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-closed-context-'));let publicRequests=0,rhRequests=0;
 try{const context=new MarketContext({dir,settings:()=>DEFAULTS,client:{connected:true,marketOpen:false,call:async()=>{rhRequests++;}},fetcher:async()=>{publicRequests++;return new Response('',{status:503});}});context.data.daily.SPY={bars:[{close:100}]};await context.tick(true);assert.equal(publicRequests,2);assert.equal(rhRequests,0);assert.equal(context.data.daily.SPY.bars[0].close,100);assert.equal(context.error,null);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Saturday and weekday 20 ET block actual HTTP while Coinbase trades continue',async()=>{
 for(const time of ['2026-11-07T15:00:00Z','2026-11-05T01:00:00Z']){
  let requests=0;const client=new RobinhoodClient({now:()=>at(time),fetcher:async()=>{requests++;}});client.tokens={access:'retained',refresh:'retained',expires:0};
  await assert.rejects(client.call('get_equity_quotes',{}),e=>e.marketClosed);assert.equal(requests,0);
  class Socket{constructor(){this.handlers={};}addEventListener(name,fn){this.handlers[name]=fn;}send(){}close(){}}
  const feed=new CoinbaseFeed(['BTC-USD'],()=>{},()=>{},{Socket});
  try{feed.connect();feed.ws.handlers.open();feed.ws.handlers.message({data:JSON.stringify({channel:'market_trades',timestamp:time,events:[{trades:[{product_id:'BTC-USD',trade_id:1,time,price:'70000',size:'1'}]}]})});assert.equal(feed.assets['BTC-USD'].builder.bars.size,1);assert.equal(requests,0);}finally{feed.stop();}
 }
});
test('Scheduled closed poller automatically resumes at 09:20 without restart',async t=>{
 const start=at('2026-11-04T14:19:59Z');t.mock.timers.enable({apis:['Date','setTimeout'],now:start});let requests=0;
 const client=new RobinhoodClient({fetcher:async(url,options)=>{requests++;return Response.json({id:JSON.parse(options.body).id,result:{structuredContent:{data:{results:[{quote:{symbol:'SPY',has_traded:true,state:'active',last_trade_price:'100',venue_last_trade_time:new Date().toISOString()}}]}}}});}});client.tokens={access:'saved',expires:start+3600000};client.initialized=true;
 const live=new RobinhoodLive({client,settings:()=>({...DEFAULTS,stocks:['SPY']})});live.refreshSelectedOptions=()=>{};live.refreshHistory=()=>{};
 try{await live.tick();assert.equal(requests,0);t.mock.timers.tick(1000);for(let i=0;i<20;i++)await Promise.resolve();assert.equal(requests,1);assert.equal(live.assets.SPY.quote.price,100);assert.equal(live.status.status,'CONNECTED');}finally{live.stopTimer();}
});
test('Option selection crossing the closing boundary restores cached selection without errors',async()=>{
 let open=true;const client={connected:true,get marketOpen(){return open;},async call(){open=false;const error=Error('MARKET CLOSED');error.marketClosed=true;throw error;}};
 const live=new RobinhoodLive({client,settings:()=>({...DEFAULTS,stocks:['SPY']})});live.options={symbol:'SPY',contracts:[{id:'retained'}],loading:false,error:null};const prior=live.options;
 await live.selectOptions({symbol:'SPY'});assert.equal(live.options,prior);assert.equal(live.options.error,null);assert.equal(live.chainErrors.size,0);assert.equal(live.status.status,'MARKET CLOSED');
});
