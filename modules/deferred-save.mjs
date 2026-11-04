// Coalesces frequent whole-file saves. Owners expose save(); a deferred save runs at most once per
// interval and any pending save is flushed when the process exits or is interrupted.
const DEFAULT_INTERVAL_MS=5000,pending=new Set();let hooked=false;
export function flushDeferredSaves(){for(const owner of [...pending])try{flushDeferred(owner);}catch{}}
function hook(){if(hooked)return;hooked=true;process.on('exit',flushDeferredSaves);for(const sig of ['SIGINT','SIGTERM'])if(!process.listenerCount(sig))process.once(sig,()=>{flushDeferredSaves();process.exit(sig==='SIGINT'?130:143);});}
export function saveDeferred(owner,intervalMs=DEFAULT_INTERVAL_MS){
 const wait=(owner.lastSaved||0)+intervalMs-Date.now();
 if(wait<=0){clearDeferred(owner);owner.save();owner.lastSaved=Date.now();return;}
 owner.dirty=true;pending.add(owner);hook();
 if(!owner.saveTimer){owner.saveTimer=setTimeout(()=>{owner.saveTimer=null;if(owner.dirty)flushDeferred(owner);},wait);owner.saveTimer.unref?.();}
}
export function flushDeferred(owner){const wasDirty=owner.dirty;clearDeferred(owner);if(wasDirty){owner.save();owner.lastSaved=Date.now();}}
function clearDeferred(owner){if(owner.saveTimer){clearTimeout(owner.saveTimer);owner.saveTimer=null;}owner.dirty=false;pending.delete(owner);}
