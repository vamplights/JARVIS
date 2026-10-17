const API='https://api.coinbase.com/api/v3/brokerage/market/products';
const number=v=>v!==''&&v!=null&&Number.isFinite(Number(v))?Number(v):null;
export class CoinbaseDerivatives {
 constructor({fetcher=fetch}={}){this.fetcher=fetcher;this.products={};this.updatedAt=null;this.error=null;this.timer=null;this.stopped=true;this.failures=0;}
 async get(url){const r=await this.fetcher(url,{signal:AbortSignal.timeout(12000),headers:{'Cache-Control':'no-cache'}});if(!r.ok)throw Error(`Coinbase derivatives data unavailable (${r.status})`);return r.json();}
 start(){this.stopped=false;this.refresh();}
 stop(){this.stopped=true;clearTimeout(this.timer);}
 async refresh(){
  try{const data=await this.get(API+'?product_type=FUTURE');const products={};
   for(const [symbol,code]of [['BTC-USD','BIP'],['ETH-USD','ETP']]){
    const p=(data.products||[]).find(p=>p.product_venue==='FCM'&&p.future_product_details?.contract_code===code&&!p.is_disabled&&!p.trading_disabled&&!p.cancel_only);
    if(!p)throw Error(`Coinbase US nano ${symbol} perpetual-style contract unavailable`);
    const d=p.future_product_details,t=await this.get(API+'/'+encodeURIComponent(p.product_id)+'/ticker?limit=1'),trade=t.trades?.[0];
    products[symbol]={productId:p.product_id,name:p.display_name,unitSize:number(d.contract_size),minContracts:number(p.base_min_size),contractIncrement:number(p.base_increment),priceTick:number(p.price_increment),maxContracts:number(p.base_max_size),intraday:{long:number(d.intraday_margin_rate?.long_margin_rate),short:number(d.intraday_margin_rate?.short_margin_rate)},overnight:{long:number(d.overnight_margin_rate?.long_margin_rate),short:number(d.overnight_margin_rate?.short_margin_rate)},fundingRate:number(d.funding_rate),fundingTime:Date.parse(d.funding_time)||null,fundingInterval:d.funding_interval,sessionOpen:p.fcm_trading_session_details?.is_session_open===true,quote:{price:number(trade?.price),time:Date.parse(trade?.time)||null,bid:number(t.best_bid),ask:number(t.best_ask)},fetchedAt:Date.now(),source:'Coinbase public US derivatives API'};
   }
   if(!this.stopped){this.products=products;this.updatedAt=Date.now();this.error=null;this.failures=0;}
  }catch(e){if(!this.stopped){this.error=e.message;this.failures++;}}
  finally{if(!this.stopped){this.timer=setTimeout(()=>this.refresh(),Math.min(300000,30000*2**Math.min(this.failures,4)));this.timer.unref?.();}}
 }
 snapshot(){return {products:this.products,updatedAt:this.updatedAt,error:this.error,venue:'Coinbase US derivatives',accountEligibility:'UNVERIFIED',refreshSeconds:30};}
}
