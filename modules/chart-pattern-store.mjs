import {RecordArchive,backupOriginal} from './record-archive.mjs';
import {saveDeferred,flushDeferred} from './deferred-save.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {atr} from './engine.mjs';
import {PATTERN_DEFAULTS,patternSettings,analysisRulesKey,confirmedPivots,supportingEvidence,analysisInput,detectPatterns,formationId,advanceFormation,followupCandidates} from './chart-patterns.mjs';

export class ChartPatternStore {
 constructor(dir){this.archived=new Map();this.order=new Map();this.coldRecent=new Map();this.file=path.join(dir,'chart-pattern-analysis.json');this.data={version:1,settings:structuredClone(PATTERN_DEFAULTS),records:[]};this.cache=new Map();this.health={};this.dirty=false;this.error=null;this.writeGeneration=0;this.configQueue=Promise.resolve();
  if(fs.existsSync(this.file)){try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));if(saved.version!==1||!Array.isArray(saved.records)||saved.records.some(r=>!r||typeof r.id!=='string'||typeof r.symbol!=='string'||!Number.isFinite(r.tf)||!Array.isArray(r.lines)||!Array.isArray(r.points)))throw Error('Invalid analysis store');this.data={...saved,settings:patternSettings(saved.settings)};}catch(e){this.error='Analysis records could not be read; original file preserved. '+e.message;this.data.settings.enabled=false;}}
  this.archive=new RecordArchive(path.join(dir,'pattern-archive'),this.data.archiveSegments);this.records=new Map();this.active=new Map();this.recent=new Map();this.recentGlobal=[];this.revision=0;this.viewCache=new Map();try{
   const cold=new Map();
   for(const id of this.archive.manifest)for(const [pos,r] of this.archive.read(id)){
    if(!Number.isSafeInteger(pos)||pos<0||cold.has(pos)||this.archived.has(r.id))throw Error('Invalid archived pattern position or ID');
    cold.set(pos,r);this.archived.set(r.id,pos);this.coldRecent.set(r.id,r);
   }
   const count=this.data.records.length+cold.size;let hot=0;
   for(let pos=0;pos<count;pos++){
    const r=cold.get(pos)||this.data.records[hot++];if(!r||this.order.has(r.id))throw Error('Pattern archive count or ID mismatch');
    this.order.set(r.id,pos);this.remember(r);if(cold.has(pos))this.records.delete(r.id);
   }
   this.data.records=[];this.trimColdRecent();
   if(!this.error&&this.compact()&&this.save()===false)throw Error(this.writeError);
  }catch(e){this.error='Pattern archive cannot be loaded: '+e.message;this.data.settings.enabled=false;}
 }
 trimColdRecent(){const visible=new Set([...this.recentGlobal,...[...this.recent.values()].flat()]);for(const id of this.coldRecent.keys())if(!visible.has(id))this.coldRecent.delete(id);}
 compact(){
  // Use the data clock so archived/replayed sessions have the same retention as live ones.
  let newest=0;for(const r of this.records.values())newest=Math.max(newest,r.lastEvaluatedCandle||0);
  const cutoff=newest-86400,retired=[];
  for(const r of this.records.values())if(['failed','expired'].includes(r.status)&&r.lastEvaluatedCandle<cutoff)retired.push([this.order.get(r.id),r]);
  if(!retired.length)return false;
  backupOriginal(this.file);this.archive.append(retired);
  for(const [pos,r] of retired){this.archived.set(r.id,pos);this.records.delete(r.id);this.coldRecent.set(r.id,r);}
  this.trimColdRecent();return true;
 }
 remember(r){if(!this.order.has(r.id))this.order.set(r.id,this.archived.get(r.id)??this.order.size);const key=[r.symbol,r.tf,r.source].join('|');this.records.set(r.id,r);if(!this.active.has(key))this.active.set(key,new Set());if(['failed','expired'].includes(r.status))this.active.get(key).delete(r.id);else this.active.get(key).add(r.id);
  const recent=(this.recent.get(key)||[]).filter(id=>id!==r.id);recent.push(r.id);this.recent.set(key,recent.slice(-500));this.recentGlobal=this.recentGlobal.filter(id=>id!==r.id);this.recentGlobal.push(r.id);this.recentGlobal=this.recentGlobal.slice(-200);this.revision++;
 }
 saveSoon(){saveDeferred(this,5000,true);}
 flush(){flushDeferred(this);}
 save(){if(this.error)throw Error(this.error);try{this.compact();const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify({...this.data,archiveSegments:this.archive.manifest,records:[...this.records.values()]}));fs.renameSync(tmp,this.file);this.writeGeneration++;this.dirty=false;this.lastSaved=Date.now();this.writeError=null;}catch(e){this.writeError='Pattern save failed: '+e.message;this.dirty=true;return false;}}
 // Explicit settings changes acknowledge a durable snapshot, including any
 // pending evaluation. Serialize explicit writers; a newer timer/shutdown
 // flush takes precedence over an older in-flight snapshot.
 configureDurably(p){
  const job=this.configQueue.then(async()=>{
   const result=this.configure(p),generation=this.writeGeneration,tmp=this.file+'.config.tmp';
   const bytes=JSON.stringify({...this.data,archiveSegments:this.archive.manifest,records:[...this.records.values()]});
   await fs.promises.writeFile(tmp,bytes);
   if(generation===this.writeGeneration){fs.renameSync(tmp,this.file);this.writeGeneration++;}
   else await fs.promises.unlink(tmp);
   return result;
  });
  this.configQueue=job.catch(()=>{});return job;
 }
 configure(p){if(this.error)throw Error(this.error);const previous=this.data.settings,settings=patternSettings(p,previous),changed=JSON.stringify({...settings,enabled:false})!==JSON.stringify({...previous,enabled:false});this.data.settings=settings;this.saveSoon();if(changed)this.cache.clear();return this.view();}
 evaluate(asset,tf,now=Date.now(),budgetMs=25){if(!this.data.settings.enabled||this.error)return this.view(asset.symbol,tf);const s=this.data.settings,source=asset.source||'Unspecified historical source',key=[asset.symbol,tf,source].join('|');if(!s.frames.includes(tf)){this.health[asset.symbol+':'+tf]={freshness:'unavailable',reason:'Timeframe disabled in analysis settings',source};return this.view(asset.symbol,tf);}
  try{const input=analysisInput(asset,tf,now,s);this.health[asset.symbol+':'+tf]={freshness:input.freshness,reason:input.reason,lastCandle:input.bars.at(-1)?.time,source,volumeValid:input.volumeValid};if(input.reason||input.bars.length<17)return this.view(asset.symbol,tf);
   const closed=input.bars.filter(b=>b.complete!==false),fingerprint=b=>JSON.stringify(b);let cache=this.cache.get(key);
   // Re-evaluate causal prefixes after revisions without replacing frozen confirmed records.
   if(!cache||closed.some(b=>cache.hashes.has(b.time)&&cache.hashes.get(b.time)!==fingerprint(b))){cache={cursor:0,hashes:new Map(),lastLive:''};this.cache.set(key,cache);}
   const started=performance.now();let processed=0;
   for(let i=16;i<closed.length;i++){const c=closed[i];if(c.time<=cache.cursor)continue;if(processed&&performance.now()-started>=budgetMs)break;
    const prefix=closed.slice(0,i+1);this.step(prefix,asset,tf,source,s,input.volumeValid,c.time===closed.at(-1)?.time?input.freshness:'historical');cache.cursor=c.time;cache.hashes.set(c.time,fingerprint(c));processed++;
   }
   const live=input.bars.at(-1);if(cache.cursor===closed.at(-1)?.time&&live?.complete===false){const signature=fingerprint(live);if(signature!==cache.lastLive){this.step(input.bars,asset,tf,source,s,input.volumeValid,input.freshness,now);cache.lastLive=signature;}}
   this.health[asset.symbol+':'+tf].catchingUp=cache.cursor!==closed.at(-1)?.time;
   // Bound cache memory. Terminal formations move to immutable archive segments on the deferred save.
   for(const t of cache.hashes.keys())if(t<closed[0]?.time)cache.hashes.delete(t);
   if(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);
   if(this.dirty)this.saveSoon();
  }catch(e){this.health[asset.symbol+':'+tf]={freshness:'unavailable',reason:e.message,source};}
  return this.view(asset.symbol,tf);
 }
 step(b,asset,tf,source,s,volumeValid,freshness,asOf){const last=b.at(-1),a=atr(b.filter(x=>x.complete!==false)).at(-1)||1,meta={symbol:asset.symbol,source,freshness,atr:a,asOf},prior=[...(this.active.get([asset.symbol,tf,source].join('|'))||[])].map(id=>this.records.get(id)).filter(r=>r.lastEvaluatedCandle<=last.time),candidates=[...detectPatterns(b,{settings:s,market:asset.market,tf,volumeValid,calendar:asset.calendar}),...followupCandidates(prior,b,tf,s,a)],seen=new Set(),currentEvidence=prior.some(r=>!r.confirmedAt)?supportingEvidence(b,confirmedPivots(b.slice(0,-1),s.swing),volumeValid,s):[];
  for(const c of candidates){c.rulesKey=analysisRulesKey(s);if(s.requireVolume&&(!volumeValid||last.volume<s.volumeRatio*b.slice(-21,-1).reduce((sum,x)=>sum+x.volume,0)/Math.min(20,b.length-1)))c.trigger=false;const id=formationId(asset.symbol,tf,source,c),old=this.records.get(id);if(this.archived.has(id))continue;seen.add(id);if(old&&old.lastEvaluatedCandle>last.time)continue;
   // A prefix before first recognition must never alter a persisted formation.
   if(old&&last.time*1000+tf*60000<old.firstKnownAt)continue;
   const next=advanceFormation(old,c,last,tf,s,meta);if(!old)next.rules=structuredClone(s);if(JSON.stringify(old)!==JSON.stringify(next)){this.remember(next);this.dirty=true;}}
  for(const r of prior){if(seen.has(r.id)||['failed','expired'].includes(r.status)||r.lastEvaluatedCandle>last.time)continue;
   const rules=r.rules||s,breakable=['ascending-triangle','descending-triangle','symmetrical-triangle','rectangle','bull-flag','bear-flag','bull-pennant','bear-pennant','rising-wedge','falling-wedge','double-top','double-bottom','triple-top','triple-bottom','head-shoulders','inverse-head-shoulders','rounding-top','rounding-bottom','cup-handle','inverted-cup-handle','resistance-breakout','support-breakdown','higher-low-pullback','lower-high-pullback','opening-range','support-bounce','resistance-rejection','bull-ma-retest','bear-ma-retest','vwap-pullback','vwap-rejection','breakout-retest','breakdown-retest','opening-range-retest'].includes(r.kind),at=l=>l.t2===l.t1?l.p2:l.p2+(l.p2-l.p1)*(last.time-l.t2)/(l.t2-l.t1),upperLine=r.lines.find(l=>l.role==='resistance'||r.dir>0&&l.role==='neckline'),lowerLine=r.lines.find(l=>l.role==='support'||r.dir<0&&l.role==='neckline'),upper=r.confirmedAt?r.upper:upperLine?at(upperLine):r.upper,lower=r.confirmedAt?r.lower:lowerLine?at(lowerLine):r.lower,dir=(!r.confirmedAt&&['symmetrical-triangle','rectangle','opening-range'].includes(r.kind)?0:r.dir)||(last.close>upper+rules.breakoutATR*a?1:last.close<lower-rules.breakoutATR*a?-1:0),volPass=!rules.requireVolume||volumeValid&&last.volume>=rules.volumeRatio*b.slice(-21,-1).reduce((sum,x)=>sum+x.volume,0)/Math.min(20,b.length-1),levelTrigger=['support-bounce','resistance-rejection','bull-ma-retest','bear-ma-retest','vwap-pullback','vwap-rejection','breakout-retest','breakdown-retest','opening-range-retest'].includes(r.kind),triggerLevel=levelTrigger?r.confirmationLevel+(r.originId?dir*rules.breakoutATR*a:0):dir>0?upper+rules.breakoutATR*a:lower-rules.breakoutATR*a,trigger=breakable&&r.anchorTime>=b[0].time&&dir&&(last.close-triggerLevel)*dir>0&&volPass;
   const next=advanceFormation(r,{...r,evidence:[...(r.evidence||[]).filter(e=>!currentEvidence.some(c=>c.name===e.name)),...currentEvidence],upper,lower,dir,confirmationLevel:levelTrigger?r.confirmationLevel:dir>0?upper:dir<0?lower:null,invalidationLevel:dir>0?lower:dir<0?upper:null,trigger},last,tf,rules,meta);if(JSON.stringify(next)!==JSON.stringify(r)){this.remember(next);this.dirty=true;}}
 }
 scan(assets,now=Date.now()){if(!this.data.settings.enabled)return this.view();const start=performance.now(),jobs=Object.values(assets).flatMap(a=>(a.analysisFrames||this.data.settings.frames).filter(tf=>this.data.settings.frames.includes(tf)&&tf*60>=a.base&&tf*60%a.base===0).map(tf=>[a,tf]));if(!jobs.length)return this.view();this.roundRobin??=0;for(let j=0;j<jobs.length;j++){const [a,tf]=jobs[this.roundRobin++%jobs.length];this.evaluate(a,tf,now,8);if(performance.now()-start>=30)break;}return this.view();}
 view(symbol,tf){const enabled=this.data.settings.enabled,key=[symbol||'*',tf||'*'].join('|');let cached=this.viewCache.get(key);if(enabled&&cached?.revision!==this.revision){const ids=new Set(symbol?[...this.recent.entries()].filter(([k])=>k.startsWith(symbol+'|')).flatMap(([,v])=>v):this.recentGlobal);for(const [k,v]of this.active)if(!symbol||k.startsWith(symbol+'|'))for(const id of v)ids.add(id);cached={revision:this.revision,records:[...ids].map(id=>this.records.get(id)||this.coldRecent.get(id)).filter(r=>r&&(!tf||r.tf===tf)).sort((a,b)=>Number(['failed','expired'].includes(a.status))-Number(['failed','expired'].includes(b.status))||b.lastEvaluatedCandle-a.lastEvaluatedCandle).slice(0,symbol?500:200)};this.viewCache.set(key,cached);if(this.viewCache.size>64)this.viewCache.delete(this.viewCache.keys().next().value);}return {enabled,settings:this.data.settings,error:this.error||this.writeError||null,recordCount:this.records.size+this.archived.size,health:this.health,records:enabled?cached.records:[]};}
 history(){const rows=new Array(this.order.size);for(const id of this.archive.manifest)for(const [pos,r] of this.archive.read(id))rows[pos]=r;
  for(const r of this.records.values())rows[this.order.get(r.id)]=r;
  return {version:1,settings:this.data.settings,records:rows};
 }
}
