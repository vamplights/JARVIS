import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Secret input/output uses private pipes, never command arguments or log output.
export function windowsProtect(value, decrypt=false){
 if(process.platform!=='win32')throw Error('Windows account encryption is unavailable');
 const operation=decrypt?'Unprotect':'Protect';
 const script=`$ErrorActionPreference='Stop';try { Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Text.Encoding]::UTF8.GetBytes('JARVIS Robinhood authorization v1'); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result)) } catch { exit 1 }`;
 const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const r=spawnSync(exe,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{input:Buffer.from(value).toString('base64'),encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});
 if(r.status!==0||r.error||!r.stdout||!(/^[A-Za-z0-9+/=]+$/).test(r.stdout.trim()))throw Error('Windows account encryption failed');
 return Buffer.from(r.stdout.trim(),'base64');
}
export class CredentialStore {
 constructor(file,{protect=windowsProtect}={}){this.file=file;this.protect=protect;}
 save(value){
  const encrypted=this.protect(Buffer.from(JSON.stringify(value))),tmp=this.file+'.tmp';
  try{fs.writeFileSync(tmp,encrypted,{mode:0o600});fs.renameSync(tmp,this.file);}finally{fs.rmSync(tmp,{force:true});}
 }
 load(){if(!fs.existsSync(this.file))return null;return JSON.parse(this.protect(fs.readFileSync(this.file),true).toString('utf8'));}
 clear(){fs.rmSync(this.file,{force:true});fs.rmSync(this.file+'.tmp',{force:true});}
}
