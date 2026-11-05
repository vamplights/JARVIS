import fs from 'node:fs';
const file=new URL('../jarvis-port.txt',import.meta.url);
const value=(process.env.JARVIS_PORT||(fs.existsSync(file)?fs.readFileSync(file,'utf8'):'8765')).trim();
const port=Number(value);
if(!/^[+]?\d+$/.test(value)||port<1024||port>65535){
 console.error('JARVIS_PORT or jarvis-port.txt must contain a port number from 1024 to 65535.');
 process.exitCode=1;
}else console.log(port);
