import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function initializeSettings(root,{dataDir=process.env.JARVIS_DATA_DIR||path.join(root,'data')}={}){
 const target=path.join(dataDir,'journal-settings.json');if(fs.existsSync(target))return false;
 const settings=JSON.parse(fs.readFileSync(path.join(root,'config','settings.shared.json'),'utf8'));
 fs.mkdirSync(dataDir,{recursive:true});try{fs.writeFileSync(target,JSON.stringify({settings,journal:[]},null,2),{flag:'wx'});return true;}catch(e){if(e.code==='EEXIST')return false;throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))initializeSettings(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
