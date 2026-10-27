import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const temp=path.resolve('work/chart-pattern-test-temp');fs.mkdirSync(temp,{recursive:true});
const out=fs.openSync('work/chart-pattern-regression.tap','w');const args=process.argv.slice(2);const p=spawn(process.execPath,['--test',...(args.length?args:['tests/*.test.mjs'])],{env:{...process.env,TMP:temp,TEMP:temp},stdio:['ignore',out,out],windowsHide:true});p.on('exit',code=>{fs.closeSync(out);console.log('Regression exit:',code);console.log(fs.readFileSync('work/chart-pattern-regression.tap','utf8').split('\n').slice(-11).join('\n'));process.exitCode=code;});
