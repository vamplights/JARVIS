import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync(new URL('../Start JARVIS.ps1',import.meta.url),'utf8');
const block=source.slice(source.indexOf('    $jarvisStarted = Start-Process'),source.indexOf('\nWrite-Host "JARVIS is running')).trimEnd().slice(0,-1);
// Execute the launcher's real process/health loop with a virtual clock and process.
function launch(readyAt,exitAt){
 const script=`$ErrorActionPreference='Stop'
 $script:elapsed=0; $script:noticeAt=-1; $script:browserAt=-1
 $jarvisNode='node'; $jarvisData='data'; $PSScriptRoot='.'; $jarvisUrl='http://localhost'; $NoBrowser=$false
 function Get-Date { [datetime]'2026-11-04T12:00:00Z' + [timespan]::FromMilliseconds($script:elapsed) }
 function Start-Sleep { param($Milliseconds) $script:elapsed += $Milliseconds }
 function Test-JarvisReady { $script:elapsed -ge ${readyAt} }
 function Start-Process { param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,$RedirectStandardOutput,$RedirectStandardError,[switch]$PassThru) if($PassThru){$p=New-Object psobject; $p | Add-Member ScriptProperty HasExited { $script:elapsed -ge ${exitAt} }; return $p }; $script:browserAt=$script:elapsed }
 function Write-Host { param($Object) if($Object -like '*still starting*'){$script:noticeAt=$script:elapsed} }
 function Get-Content { param($LiteralPath,$Tail,$ErrorAction) 'stderr tail evidence' }
 $failed=$false; $details=''
 try { ${block}
 ${source.slice(source.indexOf('Write-Host "JARVIS is running'))}
 } catch { $failed=$true; $details=$_.Exception.Message }
 @{elapsed=$script:elapsed;noticeAt=$script:noticeAt;browserAt=$script:browserAt;failed=$failed;details=$details} | ConvertTo-Json -Compress`;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim());
}
test('Launcher waits beyond 20s, announces once and opens browser only at health readiness',{skip:process.platform!=='win32'},()=>{const r=launch(30500,999999);assert.equal(r.failed,false);assert.equal(r.noticeAt,20000);assert.equal(r.browserAt,30500);});
test('Launcher waits at most two minutes and preserves stderr tail on failure',{skip:process.platform!=='win32'},()=>{const r=launch(999999,999999);assert.equal(r.failed,true);assert.equal(r.elapsed,120000);assert.equal(r.noticeAt,20000);assert.equal(r.browserAt,-1);assert.match(r.details,/stderr tail evidence/);});
test('Launcher fails immediately when the node process exits',{skip:process.platform!=='win32'},()=>{const r=launch(999999,8000);assert.equal(r.failed,true);assert.equal(r.elapsed,8000);assert.equal(r.noticeAt,-1);assert.equal(r.browserAt,-1);assert.match(r.details,/stderr tail evidence/);});
