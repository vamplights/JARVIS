import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeLedger} from '../stats.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=process.argv.find(a=>a.endsWith('.json'))||path.join(process.env.JARVIS_DATA_DIR||path.join(root,'data'),'signal-paper-ledger.json');
try{const result=analyzeLedger(JSON.parse(fs.readFileSync(file,'utf8')));if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));else{console.log('Confirmed, uncapped, after-cost R:',JSON.stringify(result.headline));console.table(result.groups.map(g=>({...g,ci95:g.ci95?.map(x=>x.toFixed(3)).join(' to ')||'unavailable'})));console.log(result.note);}}catch(e){console.error('Ledger analysis failed: '+e.message);process.exitCode=1;}
