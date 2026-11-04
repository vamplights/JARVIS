import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('Launchers reference the organized support files and port stays at project root',()=>{
 for(const name of ['scripts/Get-JarvisNode.ps1','scripts/health-check.mjs','docs/HANDOFF.md','docs/AUDIT-BETA-005.md'])assert.ok(existsSync(name),name);
 for(const name of ['Start JARVIS.ps1','Restart JARVIS.ps1','scripts/service-supervisor.ps1','scripts/setup-windows-service.ps1','scripts/verify-service.ps1'])assert.match(readFileSync(name,'utf8'),/scripts\/Get-JarvisNode\.ps1/);
 assert.match(readFileSync('scripts/Get-JarvisNode.ps1','utf8'),/Split-Path -Parent \$PSScriptRoot/);
 assert.match(readFileSync('Start JARVIS.command','utf8'),/node scripts\/health-check\.mjs/);
});
