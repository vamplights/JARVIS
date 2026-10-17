import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
// Keep recent fixed-parameter replays bounded: compact runs share a 2 MiB budget,
// leaving room for forecasts below the 5 MB target. Older runs survive in the migration backup.
export const MAX_LEARNING_RUNS=256;
export const MAX_REPLAY_BYTES=2*1024*1024;
export const MAX_COMPLETED_RUN_IDS=2048;
const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
export function compactReplayRun(run){
 const out=pick(run,['id','kind','symbol','market','source','fallback','session','sessions','strategy','tf','version','profile','completedAt','bars','gaps','method','warning','assumptions','modelSampleKey','missedFills']);
 out.outOfSample=Object.fromEntries(Object.entries(run.outOfSample||{}).filter(([,v])=>v===null||['number','boolean','string'].includes(typeof v)));
 out.trades=(run.trades||[]).filter(t=>t.segment==='out-of-sample').map(t=>pick(t,['realizedR','segment','targetCapped','signalId','time','market']));
 return out;
}
export function retainReplayRuns(runs){const kept=runs.slice(-MAX_LEARNING_RUNS),sizes=kept.map(r=>Buffer.byteLength(JSON.stringify(r)));let bytes=sizes.reduce((a,b)=>a+b,0);while(bytes>MAX_REPLAY_BYTES&&kept.length){bytes-=sizes.shift();kept.shift();}return kept;}
const modelFields=['realizedR','segment','targetCapped','signalId','time','market','symbol','strategy','tf','closedAt','candleClose','featureTime','features','fallback','conflicted'];
export class LearningStorage{
 constructor(dir){this.file=path.join(dir,'learning.json');this.samples=path.join(dir,'replay-model-samples');this.last=null;}
 prepare(run){const compact=compactReplayRun(run),rows=(run.trades||[]).filter(t=>t.segment==='out-of-sample'&&t.features&&Number.isFinite(t.realizedR)).map(t=>pick(t,modelFields));
  if(rows.length){const key=createHash('sha256').update(String(run.id||JSON.stringify([run.symbol,run.strategy,run.tf,run.version,run.completedAt]))).digest('hex');fs.mkdirSync(this.samples,{recursive:true});const file=path.join(this.samples,key+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify(rows));fs.renameSync(file+'.tmp',file);compact.modelSampleKey=key;}return compact;
 }
 load(fallback){let records;try{records=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw Error('Learning log unreadable; original preserved');}
  if(records.compactSchema!==1){const backup=this.file+'.before-compaction';if(!fs.existsSync(backup))fs.copyFileSync(this.file,backup);records.completedRunIds=[...new Set([...(records.completedRunIds||[]),...(records.runs||[]).map(r=>r.id).filter(Boolean)])].slice(-MAX_COMPLETED_RUN_IDS);records.runs=retainReplayRuns((records.runs||[]).slice(-MAX_LEARNING_RUNS).map(run=>this.prepare(run)));records.compactSchema=1;this.save(records);}else{this.last=JSON.stringify(records);}return records;
 }
 save(records){records.completedRunIds=[...new Set([...(records.completedRunIds||[]),...records.runs.map(r=>r.id).filter(Boolean)])].slice(-MAX_COMPLETED_RUN_IDS);records.runs=retainReplayRuns(records.runs.map(compactReplayRun));records.compactSchema=1;const text=JSON.stringify(records);if(text!==this.last){fs.writeFileSync(this.file+'.tmp',text);fs.renameSync(this.file+'.tmp',this.file);this.last=text;this.prune(records.runs);} }
 modelRuns(runs){return runs.map(run=>{if(!/^[a-f0-9]{64}$/.test(run.modelSampleKey||''))return run;let trades;try{trades=JSON.parse(fs.readFileSync(path.join(this.samples,run.modelSampleKey+'.json'),'utf8'));}catch{return {...run,trades:[]};}return {...run,trades};});}
 prune(runs){if(!fs.existsSync(this.samples))return;const keep=new Set(runs.map(r=>r.modelSampleKey+'.json'));for(const name of fs.readdirSync(this.samples)){if(/^[a-f0-9]{64}\.json$/.test(name)&&!keep.has(name))fs.unlinkSync(path.join(this.samples,name));}}
}
