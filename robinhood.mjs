import {normalizeBars} from './engine.mjs';

// Agent-delivered public market data only. No credentials, account or order access.
export function parseRobinhoodSnapshot(input, now=Date.now()) {
 const capturedAt=Date.parse(input.capturedAt);
 if(input.provider!=='Robinhood MCP'||!Number.isFinite(capturedAt)||capturedAt>now+5000)throw Error('Invalid Robinhood snapshot provenance or timestamp');
 if(!Array.isArray(input.history?.results)||!Array.isArray(input.quotes?.results))throw Error('Missing Robinhood market data');
 const assets={};
 for(const h of input.history.results){
  if(!/^[A-Z][A-Z0-9.-]{0,10}$/.test(h.symbol)||h.interval!=='minute'||h.bounds!=='regular')throw Error('Robinhood history must be regular-session minute candles');
  const bars=normalizeBars((h.bars||[]).filter(b=>b&&!b.interpolated&&(!b.session||b.session==='reg')).map(b=>({time:Date.parse(b.begins_at)/1000,open:Number(b.open_price),high:Number(b.high_price),low:Number(b.low_price),close:Number(b.close_price),volume:b.volume,complete:b.complete!==false&&Date.parse(b.begins_at)+60000<=capturedAt-2000})),60);
  if(bars.some(b=>b.time*1000>capturedAt))throw Error('Future-dated Robinhood candle');
  const row=input.quotes.results.find(r=>r?.quote?.symbol===h.symbol),q=row?.quote;
  let quote=null;
  if(q?.has_traded&&q.state==='active'){
   const candidates=[{price:Number(q.last_trade_price),time:Date.parse(q.venue_last_trade_time),session:'regular'},{price:Number(q.last_non_reg_trade_price),time:Date.parse(q.venue_last_non_reg_trade_time),session:'extended'}].filter(p=>p.price>0&&Number.isFinite(p.time)&&p.time<=capturedAt+5000).sort((a,b)=>b.time-a.time);
   if(candidates.length){
    const trade=candidates[0],bidTime=Date.parse(q.venue_bid_time),askTime=Date.parse(q.venue_ask_time);
    const validBook=Number(q.bid_price)>0&&Number(q.ask_price)>=Number(q.bid_price)&&Math.abs(trade.time-bidTime)<=30000&&Math.abs(trade.time-askTime)<=30000&&bidTime<=capturedAt+5000&&askTime<=capturedAt+5000;
    quote={...trade,bid:validBook?Number(q.bid_price):null,ask:validBook?Number(q.ask_price):null,change:Number(q.adjusted_previous_close)>0?(trade.price/Number(q.adjusted_previous_close)-1)*100:null,changePeriod:'previous close',source:'Robinhood MCP snapshot'};
   }
  }
  assets[h.symbol]={symbol:h.symbol,market:'stocks',base:60,bars,quote,replay:true,snapshot:true,source:'Robinhood MCP · on-demand snapshot · regular-session candles',historyAt:capturedAt,officialClose:row?.close??null};
 }
 return {assets,capturedAt};
}
