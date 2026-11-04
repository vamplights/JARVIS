import {topPickReasons,selectedWinEstimate} from './signal-policy.mjs';
export function alertEligibility(signal,settings,now=Date.now()){
 const a=settings.alerts;if(!a?.enabled)return 'Alerts are off';
 const reasons=topPickReasons(signal,settings,now);if(reasons.length)return 'Not a Top Pick: '+reasons.join('; ');
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:settings.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(now));
 if((a.quietHours||[]).some(r=>{const [start,end]=r.split('-');return start<end?p>=start&&p<end:p>=start||p<end;}))return 'Quiet hours';
 return null;
}
export function topPickAlert(signal,now=Date.now()){
 const p=selectedWinEstimate(signal),probability=Number.isFinite(p.probability)?p.probability:null;
 return {signalId:signal.id,symbol:signal.symbol,market:signal.market,topPick:true,title:'★ Top Pick · '+signal.symbol+' · '+(signal.dir>0?'Bullish':'Bearish'),message:(probability===null?'Uncalibrated · win estimate unavailable':Math.round(probability*100)+'% estimated win percent')+' · '+(signal.name||signal.strategy||'Confirmed setup'),probability,expectedR:Number.isFinite(p.expectedR)?p.expectedR:null,status:signal.status,createdAt:now};
}
export function recordTopPickAlert({signal,settings,alerts,now=Date.now(),newId,profile}){
 if(!signal)throw Error('Signal is not an eligible Top Pick');
 const existing=alerts.find(a=>a.signalId===signal?.id);if(existing)return {ok:true,duplicate:true};
 if(!signal||alertEligibility(signal,settings,now))throw Error('Signal is not an eligible Top Pick');
 if(alerts.filter(a=>now-a.createdAt<3600000).length>=settings.alerts.maxPerHour)throw Error('Hourly alert limit reached');
 if(alerts.some(a=>a.symbol===signal.symbol&&now-a.createdAt<settings.alerts.cooldownSeconds*1000))throw Error('Symbol alert cooldown active');
 const alert={...topPickAlert(signal,now),id:newId(),profile};alerts.push(alert);return {ok:true,alert};
}
export class AlertTracker {
 constructor(){this.previous=new Set();this.notified=new Set();this.lastBySymbol=new Map();this.hour=[];this.ready=false;this.reservations=new Map();}
 update(signals,settings,now=Date.now()){
  const eligible=signals.filter(s=>!alertEligibility(s,settings,now)),current=new Set(eligible.map(s=>s.id)),out=[];this.hour=this.hour.filter(t=>t>now-3600000);
  for(const s of eligible){if(s.alertedAt){this.notified.add(s.id);continue;}if(this.ready&&!this.previous.has(s.id)&&!this.notified.has(s.id)&&now-(this.lastBySymbol.get(s.symbol)||0)>settings.alerts.cooldownSeconds*1000&&this.hour.length<settings.alerts.maxPerHour){out.push(s);this.notified.add(s.id);this.hour.push(now);this.lastBySymbol.set(s.symbol,now);this.reservations.set(s.id,{symbol:s.symbol,time:now});}}
  // Suppress existing picks on page load; only subsequent new eligibility alerts.
  if(!this.ready)for(const s of eligible)this.notified.add(s.id);
  this.previous=current;this.ready=true;return out;
 }
 retry(id){const r=this.reservations.get(id);if(!r)return;this.reservations.delete(id);this.notified.delete(id);this.previous.delete(id);if(this.lastBySymbol.get(r.symbol)===r.time)this.lastBySymbol.delete(r.symbol);const index=this.hour.indexOf(r.time);if(index>=0)this.hour.splice(index,1);}
}
