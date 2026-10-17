import fs from 'node:fs';import path from 'node:path';import {settingsProfile} from '../stats.mjs';
const file=path.join(process.argv[2],'journal-settings.json'),state=JSON.parse(fs.readFileSync(file,'utf8')),journal=JSON.stringify(state.journal),oldProfile=settingsProfile(state.settings);
state.settings.strictContinuations=true;state.settings.showInactiveSignals=false;
if(JSON.stringify(state.journal)!==journal)throw Error('Journal changed');fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2));fs.renameSync(file+'.tmp',file);
console.log(JSON.stringify({strictContinuations:true,showInactiveSignals:false,newCohort:oldProfile!==settingsProfile(state.settings),journalPreserved:true}));
