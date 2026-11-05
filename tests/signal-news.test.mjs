import test from 'node:test';
import assert from 'node:assert/strict';
import {signalNewsSummary,signalNewsHTML} from '../modules/signal-news.mjs';
const now=Date.parse('2026-11-04T18:00:00Z'),DAY=86400000;
const item=(title,age=1000)=>({title,publishedAt:now-age,url:'https://example.com/'+encodeURIComponent(title),kind:'Headline'});
const news=items=>({items,checkedAt:now});
test('News alignment follows selected direction without changing the signal or model',()=>{
 const s={dir:1,profitEstimate:{probability:.37}},before=structuredClone(s),n=news([item('Company beats estimates'),item('Shares surge on strong demand')]);
 assert.equal(signalNewsSummary(s,n,now).state,'agrees');assert.equal(signalNewsSummary({...s,dir:-1},n,now).state,'conflicts');assert.deepEqual(s,before);
 assert.equal(signalNewsSummary(s,news([item('Shares fall'),item('Shares plunge on downgrade')]),now).state,'conflicts');
});
test('News handles mixed, missing, future, stale, duplicate and fallback coverage honestly',()=>{
 const s={dir:1};assert.equal(signalNewsSummary(s,news([item('Company beats estimates')]),now).state,'mixed');
 assert.equal(signalNewsSummary(s,news([item('Company beats estimates',-1000)]),now).state,'none');
 assert.equal(signalNewsSummary(s,news([item('Company beats estimates'),item('Company beats estimates')]),now).up,1);
 assert.equal(signalNewsSummary(s,{...news([item('Shares surge')]),retained:true},now).state,'unavailable');
 const fallback=signalNewsSummary(s,news([item('Shares surge',2*DAY),item('Shares rally',2*DAY)]),now);assert.equal(fallback.window,'3d');assert.equal(fallback.state,'agrees');
 assert.equal(signalNewsSummary(s,{error:'offline'},now).state,'unavailable');assert.equal(signalNewsSummary(s,news([]),now).state,'none');
});
test('News links escape headlines and reject unsafe protocols',()=>{
 const esc=x=>String(x??'').replaceAll('<','&lt;').replaceAll('"','&quot;');const html=signalNewsHTML({dir:1},news([{...item('<img>'),url:'javascript:alert(1)'},item('<script>')]),{esc,date:()=>'',now});assert.doesNotMatch(html,/href="javascript:|<script>|<img>/);assert.match(html,/&lt;script>/);
});
