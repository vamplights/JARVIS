import {startManualLearning,resolveManualLearning,manualLearningSummary} from './manual-learning.mjs';
import {marketCosts} from './engine.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {PaperLedger} from './paper-ledger.mjs';
import {settingsProfile} from './stats.mjs';
const positive=x=>Number.isFinite(x)&&x>0;
const fresh=(q,now,seconds)=>q&&Number.isFinite(q.time)&&q.time<=now&&now-q.time<=seconds*1000;
const book=(q,now,seconds)=>fresh(q,now,seconds)&&Number.isFinite(q.bid)&&q.bid>=0&&positive(q.ask)&&q.ask>=q.bid;
// An illustrative fixed-delta/time-decay model, not executable option prices or calibrated evidence.
export function sandboxPremium(t,spot,now){return Math.max(.01,t.anchorPremium+t.delta*(spot-t.anchorUnderlying)-t.anchorPremium*Math.min(1,Math.max(0,now-t.openedAt)/Math.max(1,t.expirationAt-t.openedAt)));}
export class ManualOptionSandbox{
 constructor(dir){this.file=path.join(dir,'manual-option-simulations.json');try{this.data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(!Array.isArray(this.data.trades))throw Error('Invalid sandbox ledger');}catch(e){if(e.code!=='ENOENT')throw Error('Manual simulation ledger cannot be read; original file preserved');this.data={version:1,trades:[]};}}
 save(){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.data));fs.renameSync(tmp,this.file);}
 submit(signal,options,assets,settings,now=Date.now(),contractId,learningContext={}){
  const prior=this.data.trades.find(t=>t.signalId===signal?.id);if(prior)return {trade:prior,duplicate:true};
  if(!signal?.id||!['stocks','crypto'].includes(signal.market)||typeof signal.symbol!=='string'||!/^[A-Z0-9.-]{1,15}$/.test(signal.symbol))throw Error('Choose a stock or crypto signal to simulate.');
  const asset=assets[signal.symbol],reference=[asset?.quote?.time<=now?asset.quote.price:null,signal.price,asset?.bars?.filter(b=>b.complete!==false&&(b.time+(asset.base||60))*1000<=now).at(-1)?.close].find(positive);
  if(!positive(reference))throw Error('A positive reference stock price is needed for the simulation.');
  if(signal.market==='crypto')return this.submitCrypto(signal,asset,reference,settings,now,learningContext);
  const dir=signal.dir<0?-1:1,type=dir>0?'call':'put',candidates=(options?.contracts||[]).filter(c=>c.symbol===signal.symbol&&String(c.type).toLowerCase()===type);
  // Prefer the clicked/frozen contract, then the nearest strike. Liquidity/risk rules do not veto this sandbox.
  const chosen=candidates.find(c=>c.id===contractId||c.id===signal.optionPlan?.contract?.id)||candidates.sort((a,b)=>Math.abs(a.strike-reference)-Math.abs(b.strike-reference))[0],q=chosen?.quote;
  const observed=!q?.delayed&&!q?.estimated&&book(q,now,settings.staleSeconds||30),cached=q?.time<=now&&positive(q?.ask)?q.ask:(!signal.optionPlan?.contract?.quoteTime||signal.optionPlan.contract.quoteTime<=now)&&positive(signal.optionPlan?.contract?.ask)?signal.optionPlan.contract.ask:null;
  const premium=observed?q.ask:cached||Math.max(.01,reference*.02),multiplier=positive(chosen?.multiplier)?chosen.multiplier:100;
  const listed=chosen?.expiration||signal.optionPlan?.expiration,validExpiry=typeof listed==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(listed)&&Date.parse(listed+'T21:00:00Z')>now;
  const expirationAt=validExpiry?Date.parse(listed+'T21:00:00Z'):now+14*86400000,expiration=new Date(expirationAt).toISOString().slice(0,10),slippageBps=settings.costs?.stocks?.slippageBps??2,fee=.65;
  const tf=positive(signal.tf)?signal.tf:3,risk=Math.abs(signal.price-signal.stop),distance=positive(risk)?risk:reference*.01;
  const trade={id:'sandbox-option:'+signal.id,signalId:signal.id,profile:settingsProfile(settings),source:'manual-click',simulationMode:'unrestricted',excludedFromCalibration:true,market:'options',symbol:signal.symbol,strategy:signal.strategy||'manual',tf,dir:1,underlyingDir:dir,signalStatus:signal.status,
   contractId:chosen?.id||'illustrative:'+signal.id,observedContractId:chosen?.id||null,optionType:type.toUpperCase(),expiration,listedContract:!!chosen&&validExpiry,originalExpiration:chosen?.expiration||null,strike:positive(chosen?.strike)?chosen.strike:reference,multiplier,size:1,entry:premium*(1+slippageBps/10000),anchorPremium:premium,anchorUnderlying:reference,delta:(!q?.time||q.time<=now)&&Number.isFinite(q?.delta)?q.delta:dir*.5,expirationAt,
   entryBasis:observed?'observed':'estimated',priceBasis:observed?'observed':'estimated',pricingLabel:observed?'Observed quote · unrestricted simulation':cached?(q?.delayed?'Estimated · Cboe delayed premium + illustrative delta/decay':'Estimated · cached premium + illustrative delta/decay'):'Estimated · illustrative ATM option: 2% premium, |delta| 0.5; expiry '+expiration+(validExpiry?' from the displayed plan':' assumed, not a verified listing'),entryQuoteTime:observed?q.time:null,
   stop:positive(signal.stop)?signal.stop:reference-dir*distance,target:positive(signal.target)?signal.target:reference+dir*distance*2,openedAt:now,clickedAt:now,lastBarEnd:now,lastChecked:now,expiresAt:now+tf*12*60000,feePerContract:fee,slippageBps,outcome:'active',pnl:null,
   assumption:'Unrestricted manual sandbox: exactly one contract; ignores signal status, session, liquidity, balance, allowance, loss lockout and risk limits. Observed prices when available, otherwise explicitly estimated fixed-delta/time-decay prices. No real order; option P&L is not a training label. Observed underlying outcomes are tracked separately for learning.'};
  this.data.trades.push(trade);startManualLearning(this.data,trade,signal,asset,settings,now,learningContext);try{this.save();}catch(e){this.data.trades.pop();this.data.manualObservations=this.data.manualObservations?.filter(r=>r.signalId!==signal.id);throw e;}return {trade,duplicate:false};
 }
 submitCrypto(signal,asset,reference,settings,now,learningContext){
  const dir=signal.dir<0?-1:1,costs=marketCosts(settings,'crypto',asset?.quote),tf=signal.tf||60,observed=fresh(asset?.quote,now,settings.staleSeconds||30),entry=reference*(1+dir*(costs.slippageBps+costs.spreadBps/2)/10000),distance=Math.abs(signal.price-signal.stop)||reference*.01;
  const trade={id:'sandbox-crypto:'+signal.id,signalId:signal.id,profile:settingsProfile(settings),source:'manual-click',simulationMode:'unrestricted',excludedFromCalibration:true,market:'crypto',symbol:signal.symbol,strategy:signal.strategy,tf,dir,underlyingDir:dir,size:1,multiplier:1,entry,anchorUnderlying:reference,stop:signal.stop||reference-dir*distance,target:signal.target||reference+dir*distance*2,openedAt:now,clickedAt:now,lastBarEnd:now,expiresAt:now+tf*12*60000,lastChecked:now,feePerContract:0,slippageBps:costs.slippageBps,costs,entryBasis:observed?'observed':'estimated',priceBasis:observed?'observed':'estimated',pricingLabel:observed?'Observed spot reference · one unit · configured fees/spread/slippage':'ESTIMATED · captured spot reference · one unit',outcome:'active',pnl:null,assumption:'Unrestricted manual crypto scenario; one unit, no account/risk limits. Observed underlying R is learned separately.'};
  this.data.trades.push(trade);startManualLearning(this.data,trade,signal,asset,settings,now,learningContext);try{this.save();}catch(e){this.data.trades.pop();this.data.manualObservations=this.data.manualObservations?.filter(r=>r.signalId!==signal.id);throw e;}return {trade,duplicate:false};
 }
 learning(settings,profile=settingsProfile(settings)){return {observations:this.data.manualObservations||[],summary:manualLearningSummary(this.data,profile,settings.includeFallbackTraining)};}
 heldOptionIds(){return [...new Set(this.data.trades.filter(t=>!t.closedAt&&t.observedContractId).map(t=>t.observedContractId))];}
 observe(assets,options,settings,now=Date.now(),held={}){
  let changed=resolveManualLearning(this.data,assets,settings,now);for(const t of this.data.trades){if(t.closedAt)continue;const a=assets[t.symbol],q=a?.quote,bars=(a?.bars||[]).filter(b=>b.complete!==false&&b.time*1000>=t.openedAt&&(b.time+a.base)*1000>t.lastBarEnd&&(b.time+a.base)*1000<=now).sort((a,b)=>a.time-b.time);
   let spot=t.lastUnderlying||t.anchorUnderlying,trigger=null;
   for(const b of bars){if((b.time+a.base)*1000>t.expiresAt)break;t.lastBarEnd=(b.time+a.base)*1000;spot=b.close;const stop=t.underlyingDir>0?b.low<=t.stop:b.high>=t.stop,target=t.underlyingDir>0?b.high>=t.target:b.low<=t.target;
    if(stop||target){trigger=stop?'stopped out':'hit target';t.ambiguous=stop&&target;spot=stop?((b.open-t.stop)*t.underlyingDir<0?b.open:t.stop):t.target;break;}}
   if(!trigger&&fresh(q,now,settings.staleSeconds||30)&&positive(q.price)&&q.time>t.openedAt&&q.time<=t.expiresAt){spot=q.price;if((spot-t.stop)*t.underlyingDir<=0)trigger='stopped out';else if((spot-t.target)*t.underlyingDir>=0)trigger='hit target';}
   if(!trigger&&now>=t.expiresAt)trigger='expired';
   if(t.market==='crypto'){const observed=fresh(q,now,settings.staleSeconds||30)&&q.time>t.openedAt,mark=spot*(1-t.dir*(t.costs.slippageBps+t.costs.spreadBps/2)/10000),fees=(t.entry+mark)*t.costs.feeBps/10000;t.unrealized=(mark-t.entry)*t.dir-fees;t.markFresh=observed;t.markBasis=observed?'observed':'estimated';t.markTime=now;if(!observed)t.priceBasis='estimated';t.lastUnderlying=spot;t.lastChecked=now;if(trigger){t.exit=mark;t.closedAt=now;t.exitBasis=t.markBasis;t.pnl=t.unrealized;t.realizedR=null;t.outcome=trigger;}changed=true;continue;}
   const oq=held[t.observedContractId]||(options?.contracts||[]).find(c=>c.id===t.observedContractId)?.quote,observed=book(oq,now,settings.staleSeconds||30)&&oq.time>t.openedAt;
   const premium=observed?oq.bid:sandboxPremium(t,spot,now),mark=premium*(1-t.slippageBps/10000),pnl=(mark-t.entry)*t.multiplier-2*t.feePerContract;
   t.markBasis=observed?'observed':'estimated';if(!observed)t.priceBasis='estimated';t.markFresh=true;t.markTime=now;t.unrealized=pnl;t.lastUnderlying=spot;t.lastChecked=now;
   if(trigger){t.exit=mark;t.closedAt=now;t.exitBasis=t.markBasis;t.pnl=pnl;t.realizedR=null;t.outcome=trigger;}changed=true;
  }if(changed)this.save();
 }
 results(legacyTrades=[],options={}){
  const manual=options.market==='manual',trades=manual?[...legacyTrades.filter(t=>t.market==='options'&&t.source==='manual-click'),...this.data.trades].map(t=>({...t,originalMarket:t.market,market:'options'})):[...legacyTrades,...this.data.trades];const report=PaperLedger.prototype.optionPaperResults.call({data:{trades,initialCapital:0}},options);if(manual){report.market='manual';for(const row of [...report.rows,...report.open])row.market=row.originalMarket;}
  for(const row of [...report.rows,...report.open])if(row.simulationMode==='unrestricted')row.entryMode='manual · unrestricted · '+(row.priceBasis==='estimated'?'ESTIMATED':'observed quote');
  report.unrestrictedCount=report.rows.filter(t=>t.simulationMode==='unrestricted').length;report.estimatedCount=report.rows.filter(t=>t.simulationMode==='unrestricted'&&t.priceBasis==='estimated').length;
  report.note='Manual sandbox simulations ignore all account/risk/session/liquidity rules and use one contract per click. ESTIMATED option prices never train the model. Manual clicks separately track observed underlying stock/crypto outcomes for learning; the sandbox does not consume realistic-account balances. Original account-based option trades retain their own execution rules.';
  report.manualLearning=manualLearningSummary(this.data,options.profile,options.includeFallbackTraining);return report;
 }
}
