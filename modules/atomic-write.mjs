import fs from 'node:fs';
// Windows antivirus, indexing and sync tools can hold a freshly written file for a moment,
// which makes the final rename fail with EPERM/EBUSY/EACCES. Retry briefly before giving up.
const RETRYABLE=new Set(['EPERM','EBUSY','EACCES']);
const pause=ms=>{try{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}catch{}};
export function renameReplace(from,to,attempts=6){
 for(let i=0;;i++){
  try{fs.renameSync(from,to);return;}
  catch(e){if(!RETRYABLE.has(e.code)||i>=attempts-1)throw e;pause(25*2**i);}
 }
}
export function writeFileAtomic(file,data,options){const tmp=file+'.tmp';fs.writeFileSync(tmp,data,options);renameReplace(tmp,file);}
