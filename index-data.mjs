// Index levels have no shares, traded volume, or executable underlying bid/ask.
export const INDEX_SYMBOLS=new Set(['SPX']);
export const isIndexSymbol=symbol=>INDEX_SYMBOLS.has(symbol);
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function indexQuoteRow(row,symbol,id,now=Date.now()){
 if(row?.instrument_id!==id||row.symbol&&row.symbol!==symbol)return null;
 const value=finite(row.value),time=Date.parse(row.venue_timestamp);
 if(!(value>0)||!Number.isFinite(time)||time>now+5000)return null;
 return {quote:{symbol,assetType:'index',indexValue:value,indexTime:time}};
}
export function indexHistoryRow(data,symbol,id){
 const row=data.results?.find(r=>r.instrument_id===id&&(!r.symbol||r.symbol===symbol));
 if(!row||row.interval!=='minute')throw Error('No index minute candles returned for '+symbol);
 return {symbol,assetType:'index',volumeAvailable:false,interval:'minute',bounds:'regular',bars:(row.bars||[]).filter(b=>b&&!b.interpolated).map(b=>({begins_at:b.begins_at,open_price:b.open_value,high_price:b.high_value,low_price:b.low_value,close_price:b.close_value,volume:0,complete:b.complete}))};
}
