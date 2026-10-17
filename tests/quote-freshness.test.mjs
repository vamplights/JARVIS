import test from 'node:test';
import assert from 'node:assert/strict';
import {CoinbaseFeed} from '../feed.mjs';
import {selectMarketAsset,sourceGate} from '../source-integrity.mjs';
import {displayStatus} from '../signal-filters.mjs';
class Socket extends EventTarget{send(){} close(){}}
function message(feed,channel,sequence_num,events=[]){feed.ws.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({channel,sequence_num,timestamp:new Date().toISOString(),events})}));}
test('Interleaved Advanced Trade socket sequences do not falsely enter recovery',()=>{
 const feed=new CoinbaseFeed(['BTC-USD'],()=>{},()=>{},{Socket});let hydrates=0;feed.hydrate=()=>{hydrates++;};
 try{feed.connect();feed.recovering=false;message(feed,'subscriptions',0);message(feed,'ticker',1,[{tickers:[{product_id:'BTC-USD',price:'100'}]}]);message(feed,'candles',2);message(feed,'heartbeats',3);message(feed,'ticker',4,[{tickers:[{product_id:'BTC-USD',price:'101'}]}]);assert.equal(hydrates,0);assert.equal(feed.recovering,false);assert.equal(feed.assets['BTC-USD'].quote.price,101);
 message(feed,'ticker',4,[{tickers:[{product_id:'BTC-USD',price:'1'}]}]);message(feed,'ticker',2,[{tickers:[{product_id:'BTC-USD',price:'2'}]}]);assert.equal(feed.assets['BTC-USD'].quote.price,101);
 message(feed,'heartbeats',6);assert.equal(hydrates,1);assert.equal(feed.recovering,true);assert.match(feed.errors[0].message,/sequence gap/);
 feed.connect();feed.recovering=false;message(feed,'ticker',0,[{tickers:[{product_id:'BTC-USD',price:'102'}]}]);assert.equal(hydrates,1);assert.equal(feed.assets['BTC-USD'].quote.price,102);
 }finally{feed.stop();}
});
test('Source selection keeps fresher stale broker data rather than arbitrarily choosing older fallback data',()=>{
 const now=Date.now(),asset=(source,age,extra={})=>({source,market:'stocks',bars:[{}],quote:{price:100,time:now-age*1000},...extra}),broker=asset('Robinhood',35),fallback=asset('Yahoo Finance',90,{publicData:true});
 assert.equal(selectMarketAsset([broker,fallback],{now}),broker);assert.equal(selectMarketAsset([broker,{...fallback,quote:{price:100,time:now-1000}}],{now}).source,'Yahoo Finance');
 assert.equal(displayStatus({status:'STALE',confirmedAt:now-1000,tf:3,quoteTime:broker.quote.time},{now}),'QUOTE DELAYED');
 assert.equal(sourceGate({source:'Yahoo Finance',status:'CONFIRMED',warnings:[]},broker).status,'STALE');
});
test('Source selection excludes recovering crypto, snapshots and future quotes from live preference',()=>{
 const now=Date.now(),base={market:'crypto',bars:[{}],quote:{price:100,time:now-1000}},stream={...base,source:'Coinbase Exchange'},fallback={...base,publicData:true,source:'Yahoo Finance',quote:{price:100,time:now-5000}};
 assert.equal(selectMarketAsset([stream,fallback],{now,recovering:true}),fallback);assert.equal(selectMarketAsset([stream,fallback],{now}),stream);assert.equal(selectMarketAsset([{...stream,snapshot:true},fallback],{now}),fallback);assert.equal(selectMarketAsset([{...stream,quote:{price:100,time:now+10000}},fallback],{now}),fallback);
});
