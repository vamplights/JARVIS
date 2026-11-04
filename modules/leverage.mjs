import {roundTripCost} from './engine.mjs';
// A capital-allocation scenario, not a calibrated success probability or futures entry signal.
export function cryptoLeveragePlan(signal,settings,derivatives,now=Date.now()){
 const score=Math.max(0,Math.min(100,Number(signal.score)||0));
 const confidence={score,band:score>=85?'Strong rule alignment':score>=65?'Moderate rule alignment':'Weak rule alignment',probability:null};
 const product=derivatives?.products?.[signal.symbol];
 const base={suggested:null,label:'No entry',confidence,productId:product?.productId??null,contracts:0,notional:0,plannedRisk:null,stopPercent:null,levels:[],basisNote:'US nano perpetual-style futures planning from a spot setup. Futures candle confirmation, account eligibility, actual fees and liquidation levels are not verified. Leverage does not increase setup confidence.'};
 const reason=!product?'Waiting for Coinbase contract data':derivatives.error?'Coinbase derivatives feed error':now-product.fetchedAt>90000||product.fetchedAt>now+5000?'Contract data stale':!product.sessionOpen?'Derivatives session closed':!product.quote?.price||!product.quote.time||now-product.quote.time>settings.staleSeconds*1000||product.quote.time>now+5000?'Futures trade price stale or unavailable':null;
 if(reason)return {...base,reason};
 const direction=signal.dir>0?'long':'short',rates=[product.intraday?.[direction],product.overnight?.[direction]];
 if(rates.some(r=>!(r>0&&r<=1)))return {...base,reason:'Published margin rates unavailable'};
 const rate=Math.max(...rates),price=product.quote.price,unit=product.unitSize,tick=product.priceTick,increment=product.contractIncrement;
 if(!(unit>0&&tick>0&&increment>=1&&product.minContracts>=1&&signal.price>0))return {...base,reason:'Contract specification unavailable'};
 const stopFraction=Math.abs(signal.price-signal.stop)/signal.price;
 if(!(stopFraction>0&&stopFraction<1)||(signal.price-signal.stop)*signal.dir<=0)return {...base,reason:'A valid stop on the loss side is required'};
 // Apply spot stop distance proportionally to the futures quote; round distance outward to a tick.
 const distance=Math.ceil(price*stopFraction/tick)*tick;
 const costs=roundTripCost(price,price,'crypto',settings,product.quote);
 const funding=product.fundingRate==null?null:Math.abs(product.fundingRate)*price;
 if(funding==null)return {...base,reason:'Funding rate unavailable for a cost estimate'};
 const perContractRisk=unit*(distance+costs+funding),contractNotional=price*unit;
 // Whole contracts; planned risk capped first. Capital must also cover conservative published margin plus costs.
 const countByRisk=Math.floor(settings.risk/perContractRisk/increment)*increment;
 const countByCapital=Math.floor(settings.capital/(contractNotional*rate+unit*(costs+funding))/increment)*increment;
 const contracts=Math.min(countByRisk,countByCapital,product.maxContracts||Infinity);
 const count=contracts>=product.minContracts?contracts:0,notional=count*contractNotional,plannedRisk=count*perContractRisk;
 const reasonNoSize=count===0?'Minimum contract exceeds the planned risk or capital budget':null;
 const levels=Array.from({length:10},(_,i)=>{const leverage=i+1,margin=count?notional/leverage:null,allowed=count>0&&1/leverage>=rate&&margin+count*unit*(costs+funding)<=settings.capital;return {leverage,margin,lossOnMarginPct:margin?plannedRisk/margin*100:null,allowed,reason:!count?reasonNoSize:1/leverage<rate?'Below conservative published margin requirement':!allowed?'Exceeds available planning capital':'Within published margin and planning budget'};});
 const viable=levels.find(l=>l.allowed),entryReady=signal.status==='CONFIRMED'&&!signal.replay;
 return {...base,contracts:count,notional,plannedRisk:count?plannedRisk:null,stopPercent:stopFraction*100,minimumContractRisk:perContractRisk,levels,marginRate:rate,price,quoteTime:product.quote.time,suggested:entryReady&&viable?viable.leverage:null,label:entryReady&&viable?viable.leverage+'× planning allocation':'No entry',reason:reasonNoSize||(!entryReady?'Setup is '+signal.status+'; wait for confirmation':!viable?'No 1×–10× allocation meets margin and capital constraints':'Lowest effective leverage that funds the risk-sized position. Verify the futures entry before acting.'),basisNote:base.basisNote+' Loss estimate includes current Settings cost assumptions and one funding interval; additional funding, gaps and slippage can increase loss.'};
}
