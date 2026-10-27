// Isolated offline fixture server. Never reads or writes the user's data directory.
import fs from 'node:fs';
import path from 'node:path';
import {DEFAULTS} from '../engine.mjs';
import {ChartPatternStore} from '../chart-pattern-store.mjs';
import {S,boundary} from '../tests/chart-pattern-fixtures.mjs';
const dir=path.resolve('work/chart-pattern-ui-fixture');fs.mkdirSync(dir,{recursive:true});
process.env.JARVIS_DATA_DIR=dir;process.env.JARVIS_PORT='18791';process.env.JARVIS_OFFLINE='1';
const settings={...structuredClone(DEFAULTS),liveSignalsOnly:false};
fs.writeFileSync(path.join(dir,'journal-settings.json'),JSON.stringify({settings,journal:[]}));
const bars=boundary(0,.05).map((b,i,a)=>({...b,time:a[0].time+i*60,source:'Historical import'}));
fs.writeFileSync(path.join(dir,'import-SPY.json'),JSON.stringify({symbol:'SPY',market:'stocks',base:60,bars,replay:true,quote:null}));
const store=new ChartPatternStore(dir);store.configure({...S,enabled:true,frames:[1,5]});store.evaluate({symbol:'SPY',market:'stocks',base:60,bars,replay:true,source:'Historical import'},1,(bars.at(-1).time+60)*1000,10000);
await import('../server.mjs');
