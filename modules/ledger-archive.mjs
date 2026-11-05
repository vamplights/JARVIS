import path from 'node:path';
import {RecordArchive,backupOriginal} from './record-archive.mjs';
import {restoreLedger,ledgerForStorage} from './ledger-storage.mjs';
const limits={signals:500,observations:250};
const resolved=(kind,r)=>kind==='signals'?['hit target','stopped out','expired','unmeasurable'].includes(r.outcome):r.closedAt||r.outcome==='unmeasurable';

// Positions preserve insertion order even when an older pending row closes later.
export class LedgerArchive{
 constructor(file,stored){
  this.file=file;this.store=new RecordArchive(path.join(path.dirname(file),'ledger-archive'),stored.archiveSegments);
  this.positions={signals:new Map(),observations:new Map()};this.ids={signals:new Map(),observations:new Map()};
  for(const id of this.store.manifest)this.index(this.store.read(id));
  for(const kind of Object.keys(limits))for(const pos of this.positions[kind].keys())
   if(pos>=this.positions[kind].size+(stored[kind]?.length||0))throw Error('Ledger archive position outside ledger');
 }
 index(segment){
  const data=restoreLedger(segment.rows,true);
  for(const kind of Object.keys(limits)){
   const positions=segment.positions[kind],rows=data[kind]||[];
   if(rows.length!==positions.length)throw Error('Ledger archive count mismatch');
   rows.forEach((r,i)=>{
    const pos=positions[i];if(!Number.isSafeInteger(pos)||pos<0||this.positions[kind].has(pos))throw Error('Invalid or duplicate archived position');
    this.positions[kind].set(pos,r);this.ids[kind].set(kind==='signals'?r.id:r.key,r);
   });
  }
 }
 all(kind,hot){
  const cold=this.positions[kind];if(!cold.size)return hot;
  let next=0;return Array.from({length:cold.size+hot.length},(_,i)=>cold.get(i)??hot[next++]);
 }
 compact(data,initial=false){
  const rows={},positions={},keep={};
  for(const [kind,limit] of Object.entries(limits)){
   const hot=data[kind]||[],eligible=hot.length-limit;
   rows[kind]=[];positions[kind]=[];keep[kind]=hot;
   if(eligible<=(initial?0:64))continue;
   keep[kind]=[];let pos=0;
   for(let i=0;i<hot.length;i++,pos++){
    while(this.positions[kind].has(pos))pos++;
    const r=hot[i];if(i<eligible&&resolved(kind,r)){rows[kind].push(r);positions[kind].push(pos);}
    else keep[kind].push(r);
   }
  }
  if(!rows.signals.length&&!rows.observations.length)return false;
  backupOriginal(this.file);
  const segment={positions,rows:ledgerForStorage(rows)};
  this.store.append(segment);this.index(segment);
  Object.assign(data,keep);return true;
 }
}
