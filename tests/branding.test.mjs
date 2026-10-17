import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateSettings} from '../settings.mjs';import {DEFAULTS,migrateSettings} from '../engine.mjs';import {settingsProfile} from '../stats.mjs';

test('Sidebar subtitle accepts a bounded editable line, survives migration and leaves trading settings intact',()=>{
 const before=structuredClone(DEFAULTS),after=validateSettings({sidebarSubtitle:'  Sample market desk  '},before);
 assert.equal(after.sidebarSubtitle,'Sample market desk');assert.deepEqual(before,DEFAULTS);assert.equal(settingsProfile(after),settingsProfile(before));
 assert.equal(migrateSettings(after).sidebarSubtitle,after.sidebarSubtitle);assert.equal(validateSettings({sidebarSubtitle:''},after).sidebarSubtitle,'');
 for(const value of [null,5,{},'x'.repeat(81),'line\nbreak','control\u0000'])assert.throws(()=>validateSettings({sidebarSubtitle:value},before),/Sidebar subtitle/);
 assert.equal(validateSettings({},before).sidebarSubtitle,undefined);
 assert.notEqual(settingsProfile({...after,risk:16}),settingsProfile(after));
});
test('One local SVG identity is used for favicon, sidebar and loading screen without remote resources',()=>{
 const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'),svg=read('jarvis-logo.svg'),index=read('index.html'),app=read('app.js'),server=read('server.mjs');
 assert.match(svg,/<svg[^>]+viewBox="0 0 64 64"/);assert.ok(!/<script|<image|https?:\/\//.test(svg.replace('http://www.w3.org/2000/svg','')));
 assert.match(index,/<link rel="icon" type="image\/svg\+xml" sizes="any" href="\/jarvis-logo.svg\?v=2">/);assert.match(index,/class="boot-logo"/);
 assert.match(app,/class="brand-logo" src="\/jarvis-logo.svg"/);assert.match(app,/esc\(state.settings.sidebarSubtitle\?\?'Trading intelligence'\)/);assert.match(app,/brandSubtitle.textContent=state.settings.sidebarSubtitle/);
 assert.match(app,/Sidebar subtitle/);assert.match(app,/sidebarSubtitle:get\('sidebarSubtitle'\).trim\(\)/);assert.match(app,/maxlength="80"/);
 assert.match(server,/'\/jarvis-logo.svg':'jarvis-logo.svg'/);assert.match(server,/'image\/svg\+xml'/);assert.match(server,/settingsProfile\(migrateSettings\(r.settings,\{existing:true\}\)\)!==settingsProfile\(state.settings\)/);
});
test('Large category type is scoped to transient popups, not the notification inbox',()=>{
 const css=fs.readFileSync(new URL('../style.css',import.meta.url),'utf8'),app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const popup=app.slice(app.indexOf('function showNextSignalNotice'),app.indexOf('function notificationSettings'));
 assert.match(popup,/class="signal-notification-category"/);assert.match(popup,/notificationCategory\(entry\)/);assert.match(css,/\.signal-notification \.signal-notification-category\{[^}]*font-size:19px;[^}]*font-weight:700/);
 const inbox=app.slice(app.indexOf('function renderNotificationInbox'),app.indexOf('function toggleNotificationSeen'));
 assert.ok(!inbox.includes('signal-notification-category'));assert.match(popup,/setTimeout\(dismissSignalNotice,3000\)/);
});
