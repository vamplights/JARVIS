export function liveDataReady(live,settings,now=Date.now()){
 if(!live.client.connected)return true;const seconds=settings.stockStaleSeconds??settings.staleSeconds??30,fresh=q=>Number.isFinite(q?.time)&&q.time<=now&&now-q.time<=seconds*1000;
 return !!live.lastSuccess&&!!live.historyAt&&settings.stocks.every(symbol=>{const a=live.assets[symbol];return a?.quote?.price>0&&fresh(a.quote)&&a.bars?.some(b=>b.complete!==false);})&&live.options.contracts.some(c=>c.quote?.bid>0&&c.quote.ask>=c.quote.bid&&fresh(c.quote));
}
// Live reads get the initial startup window before recovery/replay/scanner work.
export function scheduleAfterLive({ready,run,onError=()=>{},now=Date.now,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=clearTimeout,maxWaitMs=45000,intervalMs=250}){
 const started=now();let stopped=false,timer;
 const tick=()=>{if(stopped)return;const available=ready();if(available||now()-started>=maxWaitMs){stopped=true;Promise.resolve().then(()=>run(available?'live-ready':'bounded-wait-expired')).catch(onError);return;}timer=schedule(tick,intervalMs);timer?.unref?.();};
 timer=schedule(tick,0);timer?.unref?.();return ()=>{stopped=true;cancel(timer);};
}
