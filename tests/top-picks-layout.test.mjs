import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {groupSignalCards} from '../modules/signal-view.mjs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('Top Pick sections share the responsive radar grid and group before applying the ticker limit', () => {
  const panel = app.slice(app.indexOf('function topPicksPanel('), app.indexOf('function overview('));
  assert.match(panel, /currentTopPicks\(market\)/);
  assert.match(panel, /class="signal-list top-picks-list"[^]*groupSignalCards\(picks\)\.slice\(0,8\)\.map\(signalCardGroup\)/);
  assert.match(css, /\.signal-list\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,310px\),1fr\)\)/);
});

test('Market-page Top Picks render one group per ticker with all its plans', () => {
  const plans=[3,5,15].map(tf=>({id:'TSLA-'+tf,symbol:'TSLA',market:'stocks',tf,optionPlan:{contract:{},reality:{available:true}}}));
  plans.push(...Array.from({length:9},(_,i)=>({id:'stock-'+i,symbol:'STOCK'+i,market:'stocks'})));
  const renderGroup=g=>'<section data-ticker="'+g[0].symbol+'" data-plans="'+g.map(s=>s.id).join(',')+'"></section>';
  const context={state:{signals:plans},currentTopPicks:market=>market==='crypto'?[]:plans,liveActionable:()=>plans,groupSignalCards,signalCardGroup:renderGroup,heading:()=>'',footer:()=>''};
  const definitions=app.slice(app.indexOf('function topPicksPanel('),app.indexOf('function overview('));
  const panel=runInNewContext(definitions+';topPicksPanel("stocks")',context);
  assert.equal((panel.match(/data-ticker=/g)||[]).length,8);
  assert.equal((panel.match(/data-ticker="TSLA"/g)||[]).length,1);
  assert.match(panel,/data-plans="TSLA-3,TSLA-5,TSLA-15"/);
  assert.match(panel,/data-ticker="STOCK6"/);
  assert.doesNotMatch(panel,/data-ticker="STOCK7"/);

});
