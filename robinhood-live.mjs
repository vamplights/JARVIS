import {isIndexSymbol,indexQuoteRow,indexHistoryRow} from './index-data.mjs';
import {radarVisible} from './signal-filters.mjs';
import {suggestedExpiry} from './option-plan.mjs';
import {parseRobinhoodSnapshot} from './robinhood.mjs';
import {session,parts} from './engine.mjs';

const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function optionQuote(q,now=Date.now()){
 if(!q)return null;const time=Date.parse(q.updated_at);if(!Number.isFinite(time)||time>now+5000)return null;
 const bid=numeric(q.bid_price),ask=numeric(q.ask_price),book=bid!=null&&ask!=null&&bid>=0&&ask>=bid;
 return {bid:book?bid:null,ask:book?ask:null,mark:numeric(q.mark_price),delta:numeric(q.delta),gamma:numeric(q.gamma),theta:numeric(q.theta),vega:numeric(q.vega),iv:numeric(q.implied_volatility),volume:numeric(q.volume),openInterest:numeric(q.open_interest),time};
}
export function historyStart(now,settings){
 const today=parts(now,'America/New_York').date;let count=0;
 for(let i=0;i<14;i++){const day=new Date(Date.parse(today+'T18:00:00Z')-i*86400000);if(session(day.getTime(),settings).tradingDay&&++count===2)return day.toISOString().slice(0,10)+'T00:00:00Z';}
 throw new Error('No verified recent stock trading days in calendar');
}
export class RobinhoodLive {
 constructor({client,settings,onChange=()=>{},save=()=>{},loadChains=()=>[],saveChains=()=>{}}){this.client=client;this.settings=settings;this.onChange=onChange;this.save=save;this.assets={};this.histories=new Map();this.indexIds=new Map();this.indexErrors={};this.indexRestrictions=new Map();this.quotes={results:[]};this.lastSuccess=null;this.historyAt=null;this.historyError=null;this.historyJob=null;this.historyNextRefresh=0;this.optionJob=null;this.error=null;this.failures=0;this.nextRefresh=null;this.busy=false;this.timer=null;this.epoch=0;this.chains=new Map(loadChains());this.saveChains=saveChains;this.chainJobs=new Map();this.chainErrors=new Map();this.warmingChains=false;this.signalBooks=new Map();this.signalOptionsBusy=false;this.signalOptionsRetryAt=0;this.options={symbol:'SPY',expiration:'',expirations:[],contracts:[],fetchedAt:null,error:null,loading:false};}
 get status(){const seconds=session(Date.now(),this.settings()).regular?15:60;return {connected:this.client.connected,status:!this.client.connected?'SIGN IN REQUIRED':this.error?'RETRYING':this.lastSuccess?'CONNECTED':'CONNECTING',error:this.error,lastSuccess:this.lastSuccess,nextRefresh:this.nextRefresh,quoteIntervalSeconds:seconds,historyAt:this.historyAt,historyError:this.historyError,indexErrors:{...this.indexErrors}};}
 start(){this.stopTimer();this.nextRefresh=Date.now();this.timer=setTimeout(()=>this.tick(),0);}
 stopTimer(){clearTimeout(this.timer);this.timer=null;}
 disconnect(){this.stopTimer();this.epoch++;this.historyJob=null;this.optionJob=null;this.historyError=null;this.historyNextRefresh=0;this.signalBooks.clear();this.indexIds.clear();this.indexRestrictions.clear();this.indexErrors={};this.client.disconnect();this.assets={};this.histories.clear();this.quotes={results:[]};this.lastSuccess=null;this.historyAt=null;this.nextRefresh=null;this.error=null;this.options={symbol:this.options.symbol,expiration:'',expirations:[],contracts:[],fetchedAt:null,error:null,loading:false};this.onChange();}
 async tick(force=false){
  if(this.busy||!this.client.connected)return;if(!force&&this.nextRefresh>Date.now()){this.schedule(this.nextRefresh-Date.now());return;}
  this.stopTimer();this.busy=true;const epoch=this.epoch;let delay=session(Date.now(),this.settings()).regular?15000:60000;
  try{
   const symbols=this.settings().stocks.filter(s=>!isIndexSymbol(s)),quotes={results:[]};
   for(let i=0;i<symbols.length;i+=20){const batch=await this.client.call('get_equity_quotes',{symbols:symbols.slice(i,i+20)});if(epoch!==this.epoch)return;quotes.results.push(...(batch.results||[]));}
   for(const symbol of this.settings().stocks.filter(isIndexSymbol)){try{const id=await this.indexId(symbol),data=await this.client.call('get_index_quotes',{instrument_ids:[id]});if(epoch!==this.epoch)return;this.checkIndexAccess(symbol,data);const row=(data.quotes||[]).map(q=>indexQuoteRow(q,symbol,id)).find(Boolean);if(!row)throw Error('No usable index quote returned');quotes.results.push(row);delete this.indexErrors[symbol];}catch(e){this.indexErrors[symbol]=e.message;}}
   if(!quotes.results?.length)throw new Error('No Robinhood stock quotes returned');this.quotes=quotes;
   this.publishAssets();this.lastSuccess=Date.now();this.error=null;this.failures=0;this.onChange();
   this.refreshHistory(epoch);this.warmChains();this.refreshSelectedOptions(epoch);

  }catch(e){if(epoch===this.epoch){this.error=e.message;this.failures++;delay=Math.min(900000,Math.max(e.retryMs||0,60000*2**Math.min(this.failures-1,4)));}}
  finally{this.busy=false;if(epoch===this.epoch&&this.client.connected)this.schedule(delay);this.onChange();}
 }
 checkIndexAccess(symbol,data){const restriction=data.restricted?.[0];if(restriction){const message=restriction.message||'Index data unavailable due to licensing restrictions';this.indexRestrictions.set(symbol,message);throw Error(message);}}
 async indexId(symbol){if(this.indexRestrictions.has(symbol))throw Error(this.indexRestrictions.get(symbol));if(this.indexIds.has(symbol))return this.indexIds.get(symbol);const data=await this.client.call('get_indexes',{symbols:symbol});this.checkIndexAccess(symbol,data);const id=data.indexes?.find(x=>x.symbol===symbol)?.id;if(!id)throw Error('Index instrument unavailable: '+symbol);this.indexIds.set(symbol,id);return id;}
 async indexHistory(symbol,startTime,now=Date.now()){
  const id=await this.indexId(symbol),bars=[];
  // The provider accepts intraday history in session-sized ranges. Never request a weekend-spanning block.
  for(let date=Date.parse(startTime.slice(0,10)+'T00:00:00Z');date<=now;date+=86400000){
   const day=new Date(date).toISOString().slice(0,10),noon=Date.parse(day+'T16:00:00Z'),hours=session(noon,this.settings());if(!hours.tradingDay)continue;
   const minute=parts(noon,'America/New_York').minutes,open=noon+(570-minute)*60000,close=noon+(hours.close-minute)*60000,start=Math.max(open,Date.parse(startTime)),end=Math.min(now,close);if(start>=end)continue;
   const data=await this.client.call('get_index_historicals',{instrument_ids:[id],start_time:new Date(start).toISOString(),end_time:new Date(end).toISOString(),interval:'minute'});this.checkIndexAccess(symbol,data);bars.push(...indexHistoryRow(data,symbol,id).bars);
  }
  return {symbol,assetType:'index',volumeAvailable:false,interval:'minute',bounds:'regular',bars};
 }
 // Quote polling never waits for historical downloads or option-chain work.
 publishAssets(){
  const symbols=this.settings().stocks,capturedAt=new Date().toISOString(),history={results:symbols.map(symbol=>this.histories.get(symbol)||{symbol,interval:'minute',bounds:'regular',bars:[]})},raw={provider:'Robinhood MCP',capturedAt,quotes:this.quotes,history};
  const parsed=parseRobinhoodSnapshot(raw);this.assets=Object.fromEntries(Object.entries(parsed.assets).map(([symbol,a])=>[symbol,{...a,replay:false,snapshot:false,source:'Robinhood MCP · automatic quote polling · regular-session candles',historyAt:this.historyAt}]));this.save(raw);
 }
 restoreHistory(raw){parseRobinhoodSnapshot(raw);for(const h of raw.history.results)if(this.settings().stocks.includes(h.symbol))this.histories.set(h.symbol,h);}
 refreshHistory(epoch=this.epoch){
  const symbols=this.settings().stocks,interval=session(Date.now(),this.settings()).regular?60000:300000;
  if(this.historyJob||this.historyNextRefresh>Date.now()||this.historyAt&&Date.now()-this.historyAt<interval&&symbols.every(s=>this.histories.has(s)))return this.historyJob;
  const job=(async()=>{await Promise.resolve();const errors=[];try{
   for(const symbol of symbols){if(epoch!==this.epoch)return;try{
    const prior=this.histories.get(symbol)?.bars?.at(-1),last=Date.parse(prior?.begins_at),start=historyStart(Date.now(),this.settings()),startTime=Number.isFinite(last)?new Date(Math.max(Date.parse(start),last-120000)).toISOString():start;
    const data=isIndexSymbol(symbol)?{results:[await this.indexHistory(symbol,startTime)]}:await this.client.call('get_equity_historicals',{symbols:[symbol],interval:'minute',bounds:'regular',adjustment_type:'split',start_time:startTime,end_time:new Date().toISOString()});if(epoch!==this.epoch)return;
    const h=data.results?.find(r=>r.symbol===symbol);if(!h?.bars?.length)throw Error('No minute candles returned for '+symbol);
    // Validate each response before merging and never mix other providers into this history.
    parseRobinhoodSnapshot({provider:'Robinhood MCP',capturedAt:new Date().toISOString(),quotes:this.quotes,history:{results:[h]}});
    const merged=new Map((this.histories.get(symbol)?.bars||[]).map(b=>[b.begins_at,b]));for(const bar of h.bars)if(bar)merged.set(bar.begins_at,{...bar,complete:Date.parse(bar.begins_at)+60000<=Date.now()-2000});
    this.histories.set(symbol,{...h,bars:[...merged.values()].sort((a,b)=>Date.parse(a.begins_at)-Date.parse(b.begins_at)).slice(-2000)});this.publishAssets();this.onChange();
   }catch(e){errors.push(symbol+': '+e.message);if(e.status===429||errors.length>=3)break;}}
   if(epoch!==this.epoch)return;
   if(errors.length){this.historyError=errors.join('; ');this.historyNextRefresh=Date.now()+30000;}else{this.historyAt=Date.now();this.historyError=null;this.publishAssets();}
  }catch(e){if(epoch===this.epoch){this.historyError=e.message;this.historyNextRefresh=Date.now()+30000;}}
  finally{if(this.historyJob===job)this.historyJob=null;this.onChange();}})();this.historyJob=job;return job;
 }
 refreshSelectedOptions(epoch=this.epoch){
  if(this.optionJob||this.options.loading)return this.optionJob;
  const job=(async()=>{await Promise.resolve();try{if(!this.options.contracts.length)await this.selectOptions({symbol:this.settings().stocks.includes(this.options.symbol)?this.options.symbol:this.settings().stocks[0]});else await this.refreshOptions(epoch);}catch(e){if(epoch===this.epoch)this.options.error=e.message;}finally{if(this.optionJob===job)this.optionJob=null;this.onChange();}})();this.optionJob=job;return job;
 }
 schedule(delay){this.stopTimer();this.nextRefresh=Date.now()+delay;this.timer=setTimeout(()=>this.tick(),delay);this.timer.unref?.();}
 // Populate every watchlist's expiry independently of news or the selected option chain.
 async warmChains(){if(this.warmingChains||!this.client.connected)return;this.warmingChains=true;try{for(const symbol of this.settings().stocks){if(!this.client.connected)break;const error=this.chainErrors.get(symbol);if(error?.retryAt>Date.now())continue;try{await this.ensureChain(symbol);}catch(e){if(e.status===429)break;}}}finally{this.warmingChains=false;}}
 async ensureChain(symbol){
  if(!this.client.connected||!this.settings().stocks.includes(symbol))return null;
  const cached=this.chains.get(symbol);if(cached&&Date.now()-cached.time>=-5000&&Date.now()-cached.time<3600000)return cached;
  if(this.chainJobs.has(symbol))return this.chainJobs.get(symbol);
  const epoch=this.epoch,job=(async()=>{try{const data=await this.client.call('get_option_chains',{underlying_symbol:symbol});if(epoch!==this.epoch)return null;const chain={time:Date.now(),items:(data.chains||[]).filter(Boolean)};this.chains.set(symbol,chain);this.chainErrors.delete(symbol);this.saveChains([...this.chains]);return chain;}catch(e){this.chainErrors.set(symbol,{message:e.message,retryAt:Date.now()+Math.max(60000,e.retryMs||0)});throw e;}finally{this.chainJobs.delete(symbol);}})();this.chainJobs.set(symbol,job);return job;
 }
 async selectOptions({symbol,expiration,strike}={}){
  if(this.options.loading)throw new Error('Options selection is still loading');if(!this.client.connected)throw new Error('Connect Robinhood to load options');if(!this.settings().stocks.includes(symbol))throw new Error('Choose a stock on your watchlist');
  if(strike!==undefined&&strike!==null&&(!(Number(strike)>0)||!Number.isFinite(Number(strike))))throw new Error('Enter a valid center strike');
  const epoch=this.epoch;this.options={symbol,expiration:expiration||'',expirations:[],contracts:[],fetchedAt:null,error:null,loading:true};this.onChange();
  try{
   let chains=this.chains.get(symbol);if(!chains||Date.now()-chains.time>3600000){const data=await this.client.call('get_option_chains',{underlying_symbol:symbol});chains={time:Date.now(),items:(data.chains||[]).filter(Boolean)};this.chains.set(symbol,chains);}
   if(epoch!==this.epoch)return;
   const today=parts(Date.now(),'America/New_York').date;
   const expirations=[...new Set(chains.items.flatMap(c=>c.expiration_dates||[]))].filter(d=>d>=today).sort();
   expiration=expiration||suggestedExpiry(chains,Date.now(),true).expiration||expirations.find(d=>d>today)||expirations[0];
   if(!expiration||!expirations.includes(expiration))throw new Error('No matching option expiration available');
   this.options.expiration=expiration;this.options.expirations=expirations;
   let instruments=[];
   for(const chain of chains.items.filter(c=>c.expiration_dates?.includes(expiration))){let cursor;
    for(let page=0;page<12;page++){const data=await this.client.call('get_option_instruments',{chain_id:chain.id,expiration_dates:expiration,state:'active',...(cursor?{cursor}:{})});if(epoch!==this.epoch)return;instruments.push(...(data.instruments||[]).filter(Boolean));cursor=data.next;if(!cursor)break;if(page===11)throw new Error('Option chain exceeded page limit; choose another expiration');}
   }
   const center=Number(strike)||this.assets[symbol]?.quote?.price;if(!(center>0))throw new Error('A current stock price or center strike is needed');
   // Display nearest contracts for inspection, never as trade recommendations.
   const unique=[...new Map(instruments.map(c=>[c.id,c])).values()];
   const contracts=unique.sort((a,b)=>Math.abs(Number(a.strike_price)-center)-Math.abs(Number(b.strike_price)-center)||Number(a.strike_price)-Number(b.strike_price)||a.type.localeCompare(b.type)).slice(0,20).map(c=>({id:c.id,symbol:c.chain_symbol,expiration:c.expiration_date,type:c.type,strike:Number(c.strike_price),multiplier:Number(c.trade_value_multiplier),state:c.state,tradability:c.tradability,quote:null})).filter(c=>c.multiplier>0&&Number.isFinite(c.strike)).sort((a,b)=>a.strike-b.strike||a.type.localeCompare(b.type));
   this.options.contracts=contracts;this.options.error=null;if(!contracts.length)throw new Error('No option contracts returned for this expiration');await this.refreshOptions(epoch);
  }catch(e){if(epoch===this.epoch)this.options.error=e.message;if(e.status===429)throw e;}
  finally{if(epoch===this.epoch){this.options.loading=false;this.onChange();}}
 }
 // Independent books keep automatic signal requests from changing the user's chain selector.
 optionsForSignal(symbol,now=Date.now()){
  const expiry=suggestedExpiry(this.chains.get(symbol),now,this.client.connected).expiration;
  const book=this.signalBooks.get(symbol)?.options;
  if(this.options.symbol===symbol&&this.options.expiration===expiry&&this.options.fetchedAt>=(book?.fetchedAt||0))return this.options;
  return book||{symbol,expiration:expiry,contracts:[],loading:true,error:null};
 }
 allOptionQuotes(){const rows=new Map();for(const book of [...this.signalBooks.values()].map(w=>w.options).concat(this.options))for(const c of book.contracts||[]){const prior=rows.get(c.id);if(!prior||(c.quote?.time||0)>=(prior.quote?.time||0))rows.set(c.id,c);}return {contracts:[...rows.values()]};}
 async refreshSignalOptions(signals){
  if(this.signalOptionsBusy||!this.client.connected||this.signalOptionsRetryAt>Date.now())return;
  this.signalOptionsBusy=true;const epoch=this.epoch,settings=this.settings(),now=Date.now();
  const symbols=[...new Set(signals.filter(s=>s.market==='stocks'&&s.horizon!=='swing'&&!s.replay&&!s.legacyProfile&&settings.stocks.includes(s.symbol)&&radarVisible(s,settings,{now})).sort((a,b)=>(a.status==='CONFIRMED'?-1:0)-(b.status==='CONFIRMED'?-1:0)).map(s=>s.symbol))];
  for(const symbol of this.signalBooks.keys())if(!symbols.includes(symbol))this.signalBooks.delete(symbol);
  try{for(const symbol of symbols){
   if(epoch!==this.epoch||!this.client.connected)break;
   let worker=this.signalBooks.get(symbol);if(!worker){worker=new RobinhoodLive({client:this.client,settings:this.settings,onChange:this.onChange});worker.chains=this.chains;this.signalBooks.set(symbol,worker);}
   if(worker.retryAt>Date.now())continue;
   worker.assets=this.assets;
   try{
    await this.ensureChain(symbol);if(epoch!==this.epoch)break;
    const expiry=suggestedExpiry(this.chains.get(symbol),Date.now(),true).expiration;
    if(!expiry){worker.options={symbol,expiration:'',contracts:[],loading:false,error:'No current or future listed expiry is available.'};worker.retryAt=Date.now()+60000;continue;}
    const interval=session(Date.now(),settings).regular?15000:60000;
    const selected=this.options.symbol===symbol&&this.options.expiration===expiry&&this.options.contracts.length&&!this.options.error&&Date.now()-this.options.fetchedAt<interval;
    if(selected)continue;
    if(worker.options.expiration!==expiry||!worker.options.contracts.length)await worker.selectOptions({symbol,expiration:expiry});
    else if(Date.now()-(worker.options.fetchedAt||0)>=interval)await worker.refreshOptions();
    if(worker.options.error)worker.retryAt=Date.now()+60000;
   }catch(e){worker.options.error=e.message;worker.options.loading=false;worker.retryAt=Date.now()+Math.max(60000,e.retryMs||0);if(e.status===429){this.signalOptionsRetryAt=worker.retryAt;break;}}
  }}finally{this.signalOptionsBusy=false;this.onChange();}
 }
 async refreshOptions(epoch=this.epoch){
  const contracts=this.options.contracts;if(!contracts.length)return;
  try{const data=await this.client.call('get_option_quotes',{instrument_ids:contracts.map(c=>c.id)});if(epoch!==this.epoch||contracts!==this.options.contracts)return;
   const rows=new Map((data.results||[]).filter(r=>r?.quote).map(r=>[r.quote.instrument_id,r.quote]));
   this.options.contracts=contracts.map(c=>({...c,quote:optionQuote(rows.get(c.id))}));this.options.fetchedAt=Date.now();this.options.error=rows.size?'': 'No option quotes returned';
  }catch(e){if(epoch===this.epoch)this.options.error=e.message;if(e.status===429)throw e;}
 }
}
