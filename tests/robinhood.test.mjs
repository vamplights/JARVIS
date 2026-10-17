import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRobinhoodSnapshot} from '../robinhood.mjs';
import {applyGates,DEFAULTS} from '../engine.mjs';
const now=Date.parse('2026-10-09T23:05:00Z');
function fixture(){return {provider:'Robinhood MCP',capturedAt:new Date(now).toISOString(),quotes:{results:[{quote:{symbol:'SPY',has_traded:true,state:'active',last_trade_price:'100',venue_last_trade_time:'2026-10-09T20:00:00Z',last_non_reg_trade_price:'101',venue_last_non_reg_trade_time:'2026-10-09T23:04:59Z',bid_price:'100.9',ask_price:'101.1',venue_bid_time:'2026-10-09T23:04:58Z',venue_ask_time:'2026-10-09T23:04:58Z',adjusted_previous_close:'99'}}]},history:{results:[{symbol:'SPY',interval:'minute',bounds:'regular',bars:[{begins_at:'2026-10-09T19:59:00Z',open_price:'100',high_price:'102',low_price:'99',close_price:'101',volume:100,session:'reg'},{begins_at:'2026-10-09T19:58:00Z',open_price:'100',high_price:'100',low_price:'100',close_price:'100',volume:0,interpolated:true}]}]}};}
test('Robinhood uses actual trade time, excludes synthetic candles, and keeps snapshots research-only',()=>{
 const a=parseRobinhoodSnapshot(fixture(),now).assets.SPY;
 assert.equal(a.bars.length,1);assert.equal(a.bars[0].complete,true);assert.equal(a.quote.price,101);assert.equal(a.quote.session,'extended');assert.equal(a.quote.time,now-1000);assert.equal(a.quote.bid,100.9);assert.equal(a.replay,true);assert.equal(a.snapshot,true);
 const signal={status:'CONFIRMED',replay:a.replay,warnings:[],market:'stocks',confirmedAt:now,price:101,atr:1};
 const gated=applyGates(signal,{blocked:false},DEFAULTS,now,a.quote,[]);
 assert.notEqual(gated.status,'CONFIRMED');
});
test('Robinhood drops stale or crossed book and inactive instrument quotes',()=>{
 let x=fixture();x.quotes.results[0].quote.venue_bid_time='2026-10-09T20:00:00Z';assert.equal(parseRobinhoodSnapshot(x,now).assets.SPY.quote.bid,null);
 x=fixture();x.quotes.results[0].quote.ask_price='99';assert.equal(parseRobinhoodSnapshot(x,now).assets.SPY.quote.ask,null);
 x=fixture();x.quotes.results[0].quote.state='inactive';assert.equal(parseRobinhoodSnapshot(x,now).assets.SPY.quote,null);
});
test('Robinhood rejects unsupported intervals, future snapshots, and malformed candles',()=>{
 let x=fixture();x.history.results[0].interval='5minute';assert.throws(()=>parseRobinhoodSnapshot(x,now));
 x=fixture();x.capturedAt=new Date(now+60000).toISOString();assert.throws(()=>parseRobinhoodSnapshot(x,now));
 x=fixture();x.history.results[0].bars[0].high_price='0';assert.throws(()=>parseRobinhoodSnapshot(x,now));
});
test('A quote refresh cannot promote an unfinished cached candle to complete',()=>{
 const x=fixture();x.history.results[0].bars[0].complete=false;
 assert.equal(parseRobinhoodSnapshot(x,now).assets.SPY.bars[0].complete,false);
});
