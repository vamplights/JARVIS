import fs from 'node:fs';
import path from 'node:path';
import {settingsProfile} from '../stats.mjs';
// Rename only system identifiers. Journal text, prices, dates and outcomes stay intact.
export function migrateBranding(dir){
 const read=name=>{try{return JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));}catch{return null;}},ledger=read('auto-paper.json'),models=read('trend-models.json');
 const oldIdentity=ledger?.rows?.map(r=>r.forwardProtocol).find(v=>typeof v==='string'&&v.endsWith('-forward-v1')&&v!=='jarvis-forward-v1')||Object.values(models||{}).map(m=>m.confidence?.protocol).find(v=>typeof v==='string'&&v.endsWith('-confidence-v2')&&v!=='jarvis-confidence-v2')?.replace('-confidence-v2','-forward-v1');
 if(!oldIdentity)return {changed:0,profiles:0};
 const oldPrefix=oldIdentity.slice(0,-'-forward-v1'.length),settings=[read('journal-settings.json')?.settings,...Object.values(ledger?.forwardSettings||{}),...(ledger?.rows||[]).map(r=>r.settings)].filter(Boolean),profiles=new Map(settings.map(s=>[settingsProfile(s,oldIdentity),settingsProfile(s)]));
 for(const [key,s]of Object.entries(ledger?.forwardSettings||{}))profiles.set(key,settingsProfile(s));
 const labels=new Map([[oldIdentity,'jarvis-forward-v1'],[oldPrefix+'-confidence-v2','jarvis-confidence-v2'],[oldPrefix+'-forward','jarvis-forward']]);
 const systemKeys=new Set(['id','signalId','profile','protocol','forwardProtocol','version','forwardPaperVersion','key','setupKey']);
 function replace(value,key=''){
  if(Array.isArray(value))return value.map(v=>replace(v,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[profiles.get(k)||k,replace(v,k)]));
  if(typeof value!=='string'||!systemKeys.has(key))return value;
  if(labels.has(value))return labels.get(value);
  for(const [before,after]of profiles)if(before!==after)value=value.replaceAll(before,after);
  if(key==='id')value=value.replaceAll('|'+oldPrefix+'-forward','|jarvis-forward');
  return value;
 }
 const files=fs.readdirSync(dir).filter(n=>n.endsWith('.json')).map(n=>path.join(dir,n));
 const reports=path.join(dir,'report-cards');if(fs.existsSync(reports))files.push(...fs.readdirSync(reports).filter(n=>n.endsWith('.json')).map(n=>path.join(reports,n)));
 let changed=0;
 for(const file of files){let original;try{original=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}const next=replace(original);if(JSON.stringify(next)===JSON.stringify(original))continue;const backup=file+'.before-jarvis-branding';if(!fs.existsSync(backup))fs.copyFileSync(file,backup);fs.writeFileSync(file+'.tmp',JSON.stringify(next));fs.renameSync(file+'.tmp',file);changed++;}
 return {changed,profiles:profiles.size};
}
