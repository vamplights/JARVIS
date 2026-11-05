// Immutable content-addressed segments. The hot file's atomic rename commits the
// manifest; a crash before that rename leaves the previous generation readable.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function backupOriginal(file,suffix='.before-archive'){
 if(!fs.existsSync(file))return;
 const backup=file+suffix;
 if(fs.existsSync(backup))return;
 const bytes=fs.readFileSync(file),tmp=backup+'.tmp';
 fs.writeFileSync(tmp,bytes);
 if(digest(fs.readFileSync(tmp))!==digest(bytes))throw Error('Backup verification failed');
 fs.renameSync(tmp,backup);
}
export class RecordArchive{
 constructor(dir,manifest=[]){this.dir=dir;this.manifest=[...manifest];}
 read(id){
  if(!/^[0-9a-f]{64}$/.test(id))throw Error('Invalid archive segment ID');
  const bytes=fs.readFileSync(path.join(this.dir,id+'.json'));
  if(digest(bytes)!==id)throw Error('Archive checksum mismatch: '+id);
  return JSON.parse(bytes);
 }
 append(segment){
  const bytes=JSON.stringify(segment),id=digest(bytes),file=path.join(this.dir,id+'.json');
  fs.mkdirSync(this.dir,{recursive:true});
  if(!fs.existsSync(file)){const tmp=file+'.tmp';fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);}
  this.read(id);
  if(!this.manifest.includes(id))this.manifest.push(id);
 }
}
