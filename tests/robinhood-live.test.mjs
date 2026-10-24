import test from 'node:test';
import assert from 'node:assert/strict';
import {RobinhoodClient,RobinhoodError,readRPC} from '../robinhood-client.mjs';
import {RobinhoodLive,optionQuote,historyStart} from '../robinhood-live.mjs';
import {DEFAULTS} from '../engine.mjs';
import {suggestedExpiry} from '../option-plan.mjs';
const origin='http://127.0.0.1:8765',metadata={issuer:'https://agent.robinhood.com/mcp/trading',authorization_endpoint:'https://robinhood.com/oauth',token_endpoint:'https://api.robinhood.com/oauth2/token/',registration_endpoint:'https://agent.robinhood.com/oauth/trading/register',code_challenge_methods_supported:['S256']};
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('Watchlist expiry warmup is independent of news and restores dates across instances',async()=>{const symbols=['SPY','AAPL','AMZN'],expiry=new Date(Date.now()+14*86400000).toISOString().slice(0,10),calls=[];let saved=[];const client={connected:true,async call(name,args){assert.equal(name,'get_option_chains');calls.push(args.underlying_symbol);return {chains:[{id:args.underlying_symbol,expiration_dates:[expiry]}]};}},settings=()=>({...DEFAULTS,stocks:symbols});const first=new RobinhoodLive({client,settings,saveChains:rows=>saved=structuredClone(rows)});await first.warmChains();assert.deepEqual(calls,symbols);for(const symbol of symbols)assert.equal(suggestedExpiry(first.chains.get(symbol)).expiration,expiry);const restored=new RobinhoodLive({client,settings,loadChains:()=>saved});await restored.warmChains();assert.equal(calls.length,3);assert.equal(restored.options.contracts.length,0);});
test('Concurrent chain requests share one lookup and failures receive retry backoff',async()=>{let calls=0;const client={connected:true,async call(){calls++;await new Promise(r=>setTimeout(r,5));throw new RobinhoodError('Rate limit',429,180000);}},live=new RobinhoodLive({client,settings:()=>({...DEFAULTS,stocks:['SPY']})});await Promise.allSettled([live.ensureChain('SPY'),live.ensureChain('SPY')]);assert.equal(calls,1);await live.warmChains();assert.equal(calls,1);assert.ok(live.chainErrors.get('SPY').retryAt>Date.now()+179000);});
test('OAuth uses PKCE, checks state, keeps secrets out of returned URLs and blocks every non-market tool',async()=>{
 let tokenCalls=0;const requests=[];
 const fetcher=async(url,opts)=>{requests.push({url,opts});if(url.includes('.well-known'))return response(metadata);if(url.endsWith('register'))return response({client_id:'test-public-client'});if(url.includes('oauth2/token')){tokenCalls++;assert.equal(new URLSearchParams(opts.body).get('code_verifier').length,64);return response({access_token:'TEST-SECRET-ONLY',refresh_token:'TEST-REFRESH',token_type:'bearer',expires_in:3600});}const body=JSON.parse(opts.body);assert.equal(opts.headers.Authorization,'Bearer TEST-SECRET-ONLY');if(body.method==='notifications/initialized')return new Response(null,{status:202});return response({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-06-18'}});};
 const client=new RobinhoodClient({origin,fetcher});const {url}=await client.begin(),auth=new URL(url);assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.equal(auth.searchParams.get('redirect_uri'),origin+'/api/robinhood/callback');assert.equal(auth.searchParams.has('code_verifier'),false);assert.equal(url.includes('TEST-SECRET'),false);
 await assert.rejects(client.finish(new URLSearchParams({state:'wrong',code:'test'})),/state mismatch/);assert.equal(tokenCalls,0);
 await client.finish(new URLSearchParams({state:auth.searchParams.get('state'),code:'test'}));assert.equal(client.connected,true);assert.equal(tokenCalls,1);
 for(const name of ['place_option_order','get_accounts','cancel_order','get_equity_positions'])await assert.rejects(client.call(name,{}),/market-data reads/);
 client.disconnect();assert.equal(client.connected,false);assert.equal(client.pending,null);await assert.rejects(client.call('get_equity_quotes',{symbols:['SPY']}),/Connect Robinhood/);
 assert.equal(requests.every(r=>r.opts.redirect==='error'),true);
});
test('OAuth rejects untrusted discovery endpoints and expired callbacks',async()=>{
 const client=new RobinhoodClient({origin,fetcher:async()=>response({...metadata,token_endpoint:'https://bad.example/token'})});await assert.rejects(client.begin(),/metadata changed/);
 client.pending={state:'test',expires:Date.now()-1};await assert.rejects(client.finish(new URLSearchParams({state:'test',code:'abc'})),/expired/);
});
test('MCP SSE parser ignores unrelated events and finds matching response across chunks',async()=>{
 const enc=new TextEncoder(),stream=new ReadableStream({start(c){for(const v of ['event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\n','event: message\ndata: {"jsonrpc":"2.0","id":4,','"result":{"ok":true}}\n\n'])c.enqueue(enc.encode(v));c.close();}});
 const message=await readRPC(new Response(stream,{headers:{'Content-Type':'text/event-stream'}}),4);assert.equal(message.result.ok,true);
});
test('MCP rate limit preserves Retry-After and does not expose body',async()=>{
 const c=new RobinhoodClient({origin,fetcher:async()=>new Response('PRIVATE ERROR',{status:429,headers:{'retry-after':'120'}})});c.tokens={access:'TEST',expires:Date.now()+3600000};c.initialized=true;
 await assert.rejects(c.call('get_equity_quotes',{symbols:['SPY']}),e=>e.status===429&&e.retryMs===120000&&!e.message.includes('PRIVATE'));
});
test('Options preserve zero Greeks, drop missing values, crossed spreads and future timestamps',()=>{
 const now=Date.now(),q={updated_at:new Date(now).toISOString(),bid_price:'1.0',ask_price:'1.2',mark_price:'1.1',delta:'0',gamma:null,theta:'',implied_volatility:'0.25',volume:0};let out=optionQuote(q,now);assert.equal(out.delta,0);assert.equal(out.gamma,null);assert.equal(out.theta,null);assert.equal(out.iv,.25);assert.equal(out.volume,0);assert.equal(out.bid,1);
 assert.equal(optionQuote({...q,ask_price:'0.5'},now).bid,null);assert.equal(optionQuote({...q,updated_at:new Date(now+60000).toISOString()},now),null);
});
test('History lookback includes Friday before Monday and accounts for published holidays',()=>{
 assert.equal(historyStart(Date.parse('2026-10-12T15:00:00Z'),DEFAULTS),'2026-10-09T00:00:00Z');
 assert.equal(historyStart(Date.parse('2026-12-28T15:00:00Z'),DEFAULTS),'2026-12-24T00:00:00Z');
});
test('Automatic feed updates quotes, candles and selected option quotes, and disconnect stops scheduling',async()=>{
 const calls=[],now=Date.now(),barTime=Math.floor(now/60000)*60-120;
 const client={connected:true,disconnect(){this.connected=false;},async call(name,args){calls.push({name,args});if(name==='get_equity_quotes')return {results:[{quote:{symbol:'SPY',has_traded:true,state:'active',last_trade_price:'100',venue_last_trade_time:new Date(now).toISOString(),bid_price:'99.9',ask_price:'100.1',venue_bid_time:new Date(now).toISOString(),venue_ask_time:new Date(now).toISOString(),adjusted_previous_close:'99'}}]};if(name==='get_equity_historicals')return {results:[{symbol:'SPY',interval:'minute',bounds:'regular',bars:[{begins_at:new Date(barTime*1000).toISOString(),open_price:'100',high_price:'101',low_price:'99',close_price:'100',volume:50}]}]};if(name==='get_option_chains')return {chains:[{id:'chain',expiration_dates:['2099-01-01']}]};if(name==='get_option_instruments')return {instruments:[{id:'contract',chain_symbol:'SPY',expiration_date:'2099-01-01',type:'call',strike_price:'100',trade_value_multiplier:'100',state:'active',tradability:'tradable'}]};if(name==='get_option_quotes')return {results:[{quote:{instrument_id:'contract',updated_at:new Date(now).toISOString(),bid_price:'1',ask_price:'1.1',mark_price:'1.05',delta:'.5'}}]};throw Error(name);}};
 let saved;const feed=new RobinhoodLive({client,settings:()=>({...DEFAULTS,stocks:['SPY']}),save:s=>saved=s});try{await feed.tick(true);await feed.historyJob;await feed.optionJob;assert.equal(feed.assets.SPY.replay,false);assert.equal(feed.assets.SPY.snapshot,false);assert.equal(feed.assets.SPY.quote.price,100);assert.equal(feed.options.contracts[0].quote.ask,1.1);assert.ok(feed.nextRefresh>Date.now());assert.equal(saved.provider,'Robinhood MCP');assert.equal(feed.status.status,'CONNECTED');const count=calls.length;await feed.tick();assert.equal(calls.length,count);feed.disconnect();assert.equal(feed.status.connected,false);assert.deepEqual(feed.assets,{});assert.equal(feed.timer,null);}finally{feed.stopTimer();}
});
test('Automatic feed backs off after throttling and preserves older assets without claiming success',async()=>{
 const client={connected:true,async call(){throw new RobinhoodError('Rate limit',429,180000);}};const feed=new RobinhoodLive({client,settings:()=>DEFAULTS});try{await feed.tick(true);assert.equal(feed.status.status,'RETRYING');assert.equal(feed.lastSuccess,null);assert.ok(feed.nextRefresh>=Date.now()+179000);}finally{feed.stopTimer();}
});
test('Expanded stock watchlist batches quotes in groups of twenty',async()=>{
 const stocks=Array.from({length:22},(_,i)=>'AA'+String.fromCharCode(65+i)),sizes=[];
 const client={connected:true,async call(name,args){assert.equal(name,'get_equity_quotes');sizes.push(args.symbols.length);return {results:args.symbols.map(symbol=>({quote:{symbol,has_traded:false,state:'active'}}))};}};
 const feed=new RobinhoodLive({client,settings:()=>({...DEFAULTS,stocks})});feed.historyAt=Date.now();feed.options.loading=true;
 for(const symbol of stocks)feed.histories.set(symbol,{symbol,interval:'minute',bounds:'regular',bars:[]});
 try{await feed.tick(true);assert.deepEqual(sizes,[20,2]);assert.equal(Object.keys(feed.assets).length,22);}finally{feed.stopTimer();}
});
