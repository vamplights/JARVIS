import test from 'node:test';
import assert from 'node:assert/strict';
import {RobinhoodLive} from '../robinhood-live.mjs';
import {DEFAULTS,parts} from '../engine.mjs';
import {optionSignalPlan} from '../option-plan.mjs';
function fixture(){
 const calls=[],expiry=parts(Date.now(),'America/New_York').date,settings=()=>({...DEFAULTS,stocks:['SPY','AAPL','MSFT']});
 const client={connected:true,disconnect(){this.connected=false;},async call(name,args){calls.push({name,args});
  if(name==='get_option_chains')return {chains:[{id:args.underlying_symbol,expiration_dates:[expiry]}]};
  if(name==='get_option_instruments')return {instruments:['call','put'].map(type=>({id:args.chain_id+'-'+type,chain_symbol:args.chain_id,expiration_date:expiry,type,strike_price:'100',trade_value_multiplier:'100',state:'active',tradability:'tradable'}))};
  if(name==='get_option_quotes')return {results:args.instrument_ids.map(id=>({quote:{instrument_id:id,updated_at:new Date().toISOString(),bid_price:'1',ask_price:'1.01',delta:id.endsWith('put')?'-.55':'.55',theta:'-.01',open_interest:'1000',volume:'1000'}}))};
  throw Error('Unexpected API '+name);
 }};
 const live=new RobinhoodLive({client,settings});live.assets={SPY:{quote:{price:100}},AAPL:{quote:{price:100}},MSFT:{quote:{price:100}}};
 const signal=symbol=>({symbol,market:'stocks',status:'WATCH',tf:5,confirmedAt:Date.now(),expiresAt:Date.now()+600000,dir:1});
 return {live,calls,signal,expiry};
}
test('Signals load their own call/put contracts without replacing the selected chain; duplicate requests coalesce',async()=>{
 const {live,calls,signal,expiry}=fixture();await live.selectOptions({symbol:'SPY'});const selected=live.options;
 const signals=[signal('AAPL'),signal('AAPL'),signal('MSFT')];await Promise.all([live.refreshSignalOptions(signals),live.refreshSignalOptions(signals)]);
 assert.equal(live.options,selected);assert.equal(live.options.symbol,'SPY');
 for(const symbol of ['AAPL','MSFT']){const book=live.optionsForSignal(symbol);assert.equal(book.expiration,expiry);assert.equal(book.contracts.length,2);assert.ok(book.contracts.every(c=>c.symbol===symbol&&c.quote.ask>0));}
 assert.equal(calls.filter(c=>c.name==='get_option_instruments'&&c.args.chain_id==='AAPL').length,1);
 const before=calls.length;await live.refreshSignalOptions(signals);assert.equal(calls.length,before);
 assert.equal(live.allOptionQuotes().contracts.length,6);
 const worker=live.signalBooks.get('AAPL');worker.options.fetchedAt=Date.now()-61000;await live.refreshSignalOptions(signals);assert.equal(calls.length,before+1);assert.equal(calls.at(-1).name,'get_option_quotes');
 live.disconnect();assert.equal(live.signalBooks.size,0);
});
test('Failed symbol does not stop other signals; rate limits back off subsequent passes',async()=>{
 const {live,calls,signal}=fixture(),original=live.client.call;live.client.call=async(name,args)=>{if(name==='get_option_chains'&&args.underlying_symbol==='AAPL')throw Error('Provider unavailable');return original(name,args);};
 await live.refreshSignalOptions([signal('AAPL'),signal('MSFT')]);assert.match(live.optionsForSignal('AAPL').error,/Provider unavailable/);assert.equal(live.optionsForSignal('MSFT').contracts.length,2);
 live.signalBooks.clear();live.chains.clear();live.client.call=async()=>{throw Object.assign(Error('Rate limit'),{status:429,retryMs:120000});};await live.refreshSignalOptions([signal('AAPL'),signal('MSFT')]);assert.ok(live.signalOptionsRetryAt>Date.now()+119000);assert.equal(live.signalBooks.has('MSFT'),false);
 const before=calls.length;await live.refreshSignalOptions([signal('MSFT')]);assert.equal(calls.length,before);
});
test('Only eligible live radar stocks request contracts; inactive books are evicted',async()=>{
 const {live,calls,signal}=fixture();await live.refreshSignalOptions([{...signal('AAPL'),legacyProfile:true},{...signal('SPY'),market:'crypto'},{...signal('MSFT'),status:'INVALIDATED'}]);assert.equal(calls.length,0);
 await live.refreshSignalOptions([signal('AAPL')]);assert.equal(live.signalBooks.size,1);await live.refreshSignalOptions([]);assert.equal(live.signalBooks.size,0);
});

test('Signal plans receive matching verified contracts for multiple stocks independently',async()=>{
 const {live,signal}=fixture();await live.refreshSignalOptions([signal('AAPL'),signal('MSFT')]);
 const now=Date.parse('2026-10-19T15:00:00Z'),expiration='2026-10-19';
 for(const symbol of ['AAPL','MSFT']){
  const options=structuredClone(live.optionsForSignal(symbol));options.expiration=expiration;for(const c of options.contracts){c.expiration=expiration;c.quote.time=now;}
  const s={...signal(symbol),confirmedAt:now,score:85,direction:'Bullish',name:'EMA retest',price:100,stop:99,target:102,size:{plannedRisk:15}};
  const plan=optionSignalPlan({signal:s,chain:{time:now,items:[{expiration_dates:[expiration]}]},options,settings:DEFAULTS,now,connected:true});
  assert.equal(plan.contract.id,symbol+'-call');assert.equal(plan.availability.code,'ready');
 }
});
