// Local simulation orchestration only. Contract identity and all fill/risk checks remain in PaperLedger.
const pending=new WeakMap();
export function submitOptionPaperClick(context){
 const {paper,signalId}=context;if(!pending.has(paper))pending.set(paper,new Map());const jobs=pending.get(paper),key=signalId+'|'+(context.contractId||'auto');
 if(jobs.has(key))return jobs.get(key);
 const job=prepare(context).finally(()=>jobs.delete(key));jobs.set(key,job);return job;
}
async function prepare({signalId,contractId,paper,live,settings,getView,now=()=>Date.now()}){
 const prior=paper.data.trades.find(t=>t.source==='manual-click'&&t.signalId===signalId&&(!contractId||t.contractId===contractId));if(prior)return {trade:prior,duplicate:true};
 let signal=getView().signals.find(s=>s.id===signalId);if(!signal)throw Error('This signal is no longer on the radar. Select a current signal.');
 if(signal.market!=='stocks'||!signal.optionPlan)throw Error('This signal has no option plan.');
 // Manual simulation deliberately ignores setup status and the original entry window.
 if(signal.legacyProfile||signal.replay)throw Error('Replay and older settings-cohort signals cannot be manually paper-traded.');
 if(!live.client.connected)throw Error('Connect Robinhood to load fresh option quotes.');
 const expiry=signal.optionPlan.expiration;
 if(!expiry)throw Error(signal.optionPlan.availability?.reason||'No verified listed expiry is available for this signal.');
 if(live.options.loading)throw Error('Option contracts are still loading. Try again when the request finishes.');
 if(live.options.symbol!==signal.symbol||live.options.expiration!==expiry||!live.options.contracts?.length)await live.selectOptions({symbol:signal.symbol,expiration:expiry});
 else await live.refreshOptions();
 // Re-read after asynchronous quotes. Snapshot issues/freezes the verified contract before filling.
 signal=getView().signals.find(s=>s.id===signalId);if(!signal)throw Error('This signal is no longer available after loading option quotes.');
 if(signal.legacyProfile||signal.replay)throw Error('Replay and older settings-cohort signals cannot be manually paper-traded.');
 const id=contractId||signal.optionPlan?.contract?.id;
 if(!id)throw Error(signal.optionPlan?.availability?.reason||signal.optionPlan?.reality?.reason||'No matching contract passed the entry filters.');
 if(id===signal.optionPlan?.contract?.id&&(signal.optionPlan.reality?.blocked!==false||signal.optionPlan.reality?.available!==true))throw Error(signal.optionPlan.reality?.reason||'Current contract reality checks have not passed.');
 paper.rememberOptionPlan(signal,now());
 return paper.paperTradeOption(signal,id,live.options,settings,now());
}
