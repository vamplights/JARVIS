import {entryExpiresAt} from './signal-policy.mjs';
// Keep filtering/sorting consistent with the status the user sees on a card.
export const STATUS_OPTIONS=[['all','All setups'],['CONFIRMED','Confirmed'],['SETUP FORMING','Setup forming'],['WATCH','Watch'],['BLOCKED BY RISK RULE','Risk blocked'],['SETUP EXPIRED','Setup expired'],['data','Data delayed / unavailable'],['STALE','All expired / data issues'],['INVALIDATED','Invalidated']];
export function displayStatus(signal,{now=Date.now(),staleSeconds=30,stockStaleSeconds=staleSeconds,offline=false}={}){
 if(signal.conflicted||signal.status==='CONFLICTED')return 'Conflicted – no trade';
 if(signal.status!=='STALE')return signal.status;
 if(offline)return 'SERVER OFFLINE';
 if(now>=entryExpiresAt(signal))return 'SETUP EXPIRED';
 if(!signal.quoteTime)return 'QUOTE UNAVAILABLE';
 if(signal.quoteTime-now>5000)return 'QUOTE TIME MISMATCH';
 if(now-signal.quoteTime>(signal.market==='stocks'?stockStaleSeconds:staleSeconds)*1000)return 'QUOTE DELAYED';
 return 'LIVE DATA UNAVAILABLE';
}
export function matchesStatus(signal,filter,context){
 if(!filter||filter==='all')return true;
 const label=displayStatus(signal,context);
 if(filter==='data')return signal.status==='STALE'&&label!=='SETUP EXPIRED';
 if(filter==='STALE')return signal.status==='STALE'; // Preserve the combined legacy selection.
 return label===filter;
}
const statusOrder=['CONFIRMED','SETUP FORMING','WATCH','BLOCKED BY RISK RULE','QUOTE DELAYED','QUOTE UNAVAILABLE','QUOTE TIME MISMATCH','LIVE DATA UNAVAILABLE','SERVER OFFLINE','SETUP EXPIRED','INVALIDATED'];
export function compareStatus(a,b,context){const rank=s=>{const i=statusOrder.indexOf(displayStatus(s,context));return i<0?statusOrder.length:i;};return rank(a)-rank(b)||(b.confirmedAt||0)-(a.confirmedAt||0)||String(a.id).localeCompare(String(b.id));}

export function radarVisible(signal,settings={},context={}){if(settings.showInactiveSignals)return true;if(context.offline||signal.legacyProfile||signal.inspectionOnly||signal.conflicted)return false;return ['CONFIRMED','SETUP FORMING','WATCH'].includes(displayStatus(signal,context))&&(context.now??Date.now())<entryExpiresAt(signal);}

// Counts describe entry-ready live plans, never retained confirmations or research rows.
export function actionableSignals(signals,{market,settings={},context={},risk={},session={},hiddenIds=new Set(),requireEntryQualified=true}={}){
 const now=context.now??Date.now();
 if(context.offline||risk.blocked||settings.studyMode)return [];
 return signals.filter(s=>(!market||s.market===market)&&!hiddenIds.has(s.id)&&s.status==='CONFIRMED'&&!s.legacyProfile&&!s.replay&&!s.inspectionOnly&&!s.conflicted&&(!requireEntryQualified||s.entryQualified!==false)&&Number.isFinite(s.confirmedAt)&&s.confirmedAt<=now&&now<entryExpiresAt(s,settings)&&Number.isFinite(s.quoteTime)&&s.quoteTime<=now+5000&&now-s.quoteTime<=(s.market==='stocks'?(settings.stockStaleSeconds??settings.staleSeconds??30):(settings.staleSeconds??30))*1000&&(s.market==='stocks'?session.stocks===true:session.crypto===true));
}
