// Coalesces frequent whole-file saves. Owners expose save(); a deferred save runs at most once per
// interval and any pending save is flushed when the process exits or is interrupted.
const DEFAULT_INTERVAL_MS=5000,pending=new Set();let hooked=false;
export function flushDeferredSaves(){for(const owner of [...pending])try{flushDeferred(owner);}catch{}}
function hook(){if(hooked)return;hooked=true;process.on('exit',flushDeferredSaves);for(const sig of ['SIGINT','SIGTERM'])if(!process.listenerCount(sig))process.once(sig,()=>{flushDeferredSaves();process.exit(sig==='SIGINT'?130:143);});}
export function saveDeferred(owner,intervalMs=DEFAULT_INTERVAL_MS,deferFirst=false){
 const wait=(owner.lastSaved||0)+intervalMs-Date.now();
 if(wait<=0&&!deferFirst){clearDeferred(owner);persist(owner,intervalMs);return;}
 owner.dirty=true;pending.add(owner);hook();
 if(!owner.saveTimer){owner.saveTimer=setTimeout(()=>{owner.saveTimer=null;if(owner.dirty)flushDeferred(owner);},Math.max(1,wait));owner.saveTimer.unref?.();}
}
export function flushDeferred(owner){const wasDirty=owner.dirty;clearDeferred(owner);if(wasDirty)persist(owner,DEFAULT_INTERVAL_MS);}
function persist(owner,interval){
 owner.lastSaved=Date.now();
 try{if(owner.save()!==false)return;}catch(e){saveDeferred(owner,interval,true);throw e;}
 // Keep transient failures eligible for a timer retry and the shutdown flush.
 saveDeferred(owner,interval,true);
}
function clearDeferred(owner){if(owner.saveTimer){clearTimeout(owner.saveTimer);owner.saveTimer=null;}owner.dirty=false;pending.delete(owner);}
