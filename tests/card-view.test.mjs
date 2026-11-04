import test from 'node:test';import assert from 'node:assert/strict';import {renderSignalCard,renderSignalCardGroup,callTiming,headlineTone,duration} from '../modules/card-view.mjs';import {groupSignalCards} from '../modules/signal-view.mjs';import {DEFAULTS} from '../modules/engine.mjs';
const now=Date.parse('2026-10-15T17:00Z'),esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),h={esc,money:v=>Number.isFinite(v)?'$'+v.toFixed(2):'—',num:(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'—',time:()=> '10:00 PT',date:()=> 'Oct 15',statusBadge:s=>'<span>'+s.status+'</span>',manualButton:()=>'<button>Paper trade</button>',leverageRow:()=>'',explainSignal:()=> 'Closed range breakout.',timeframeLabel:tf=>tf+'m',settings:DEFAULTS,rules:DEFAULTS,now},signal=()=>({id:'s',symbol:'NVDA',market:'stocks',tf:1,confirmedAt:now-60000,quoteTime:now,callWindowBars:3,price:218,entry:[217.925,218.025],stop:218.455,target:217.13,dir:-1,score:80,status:'CONFIRMED',source:'Fixture',regime:'Trending',strategies:['momentum'],strategy:'momentum',size:{size:3},factors:[{name:'Room to next level',pass:false,detail:'0.8R available'}],optionalFailures:['Nearby structure limits reward/risk'],entryQualified:false,netRR:.7,costsAsRiskPct:10,warnings:[],profitEstimate:{probability:.21,n:173,expectedR:-.2,baselineProbability:.34,drivers:[{factor:'Market direction',changePoints:-10}]}});
test('Cards show confirmed independently of a weak profit estimate and inline baseline/factors/fixed precision/optional checks',()=>{const html=renderSignalCard(signal(),h);assert.match(html,/CONFIRMED/);assert.match(html,/21%/);assert.match(html,/Baseline 34%/);assert.match(html,/Not a Top Pick/);assert.match(html,/Market direction/);assert.match(html,/\$217\.93/);assert.match(html,/\$218\.03/);assert.match(html,/Optional checks/);assert.match(html,/not a probability/);assert.match(html,/Paper trade/);assert.match(html,/View signal: NVDA/);assert.match(html,/data-hide-signal/);});
test('Card timing uses frozen entry expiry, clamps progress and clearly expires after three bars',()=>{const s=signal(),t=callTiming(s,now);assert.equal(t.left,120000);assert.equal(t.percent,200/3);assert.equal(callTiming(s,now+120000).expired,true);assert.equal(callTiming(s,now+150000).left,0);assert.equal(duration(61000),'1m 1s');});
test('Card data is escaped and unsafe headline URLs do not become links; no missing model is invented',()=>{const s={...signal(),symbol:'<img>',profitEstimate:{n:0},headlines:[{title:'bad',url:'javascript:alert(1)'},{title:'<script>',url:'https://example.com/news'}]};const html=renderSignalCard(s,h);assert.ok(!html.includes('<img>'));assert.ok(!html.includes('href="javascript:'));assert.match(html,/&lt;script>/);assert.match(html,/No outcomes/);assert.doesNotMatch(html,/100%/);assert.doesNotMatch(html,/0\/200/);});
test('Delayed option candidate cards explain source, pricing and research status separately from the stock setup',()=>{const html=renderSignalCard({...signal(),optionResearch:{contracts:[{strike:218,type:'put',expiration:'2026-10-23',quote:{bid:2,ask:2.1}}]}},h);assert.match(html,/approximately 15-min delayed/);assert.match(html,/research only/);assert.match(html,/not verified fills/);assert.match(html,/PUT/);});
test('Headline tone is only an explicit keyword summary',()=>{assert.equal(headlineTone('Company raises guidance'),'positive');assert.equal(headlineTone('Shares plunge after downgrade'),'negative');assert.equal(headlineTone('ETF fund announces holdings'),'mixed');});

test('Only confirmed cards show Called time and the entry timing strip',()=>{
 const confirmed=renderSignalCard(signal(),h);assert.match(confirmed,/◷ Called /);assert.match(confirmed,/data-call-end=/);assert.match(confirmed,/data-call-left/);assert.doesNotMatch(confirmed,/Pattern candle/);
 for(const status of ['WATCH','SETUP FORMING','STALE','INVALIDATED','CONFLICTED','SETUP EXPIRED','RISK BLOCKED']){const html=renderSignalCard({...signal(),status},h);assert.doesNotMatch(html,/class="call-window|data-call-end=|data-call-left|Pattern candle|◷ Called /,status);}
});

test('Estimated win percent badges use red 0–27, yellow 28–49 and green 50+ independently of baseline',()=>{
 for(const [probability,band] of [[0,'win-low'],[.27,'win-low'],[.28,'win-mid'],[.49,'win-mid'],[.5,'win-high'],[1,'win-high']]){
  for(const baselineProbability of [.01,.99]){const html=renderSignalCard({...signal(),profitEstimate:{probability,baselineProbability}},h);assert.match(html,new RegExp('has-estimate '+band));assert.match(html,/<small>Estimated win percent<\/small>/);assert.doesNotMatch(html,/has-estimate (positive|negative)/);}
 }
 const unmeasured=renderSignalCard({...signal(),profitEstimate:{n:0}},h);assert.doesNotMatch(unmeasured,/win-low|win-mid|win-high/);
 const rounded=renderSignalCard({...signal(),profitEstimate:{probability:.499}},h);assert.match(rounded,/win-high/);assert.match(rounded,/>50%/);
});

test('Setup score is visible exactly once outside closed details for stocks, options and crypto cards',()=>{
 for(const patch of [{},{market:'crypto'},{optionPlan:{type:'PUT'}},{status:'WATCH'},{status:'SETUP FORMING'},{score:0}]){
  const s={...signal(),...patch},html=renderSignalCard(s,h),beforeDetails=html.slice(0,html.indexOf('<details class="card-more"'));
  assert.match(beforeDetails,/class="setup-score"/);assert.ok(beforeDetails.includes('<b>'+s.score+'/100</b>'));assert.match(beforeDetails,/rule checks, not a probability/);assert.equal((html.match(/class="setup-score"/g)||[]).length,1);assert.match(beforeDetails,/Estimated win percent/);assert.equal(s.score,patch.score??80);
 }
});

test('Top Picks show a gold-star indicator beside the ticker and expose their status to assistive technology',()=>{
 const top=renderSignalCard({...signal(),topPick:true},h),plain=renderSignalCard({...signal(),topPick:false},h);
 assert.match(top,/<strong>NVDA<span class="top-pick-star" title="Top Pick" aria-hidden="true">★<\/span><\/strong>/);
 assert.match(top,/aria-label="Inspect NVDA Top Pick strategy plan"/);
 assert.doesNotMatch(top,/★ TOP PICK/);
 assert.doesNotMatch(plain,/top-pick-star|aria-label="Inspect NVDA Top Pick/);
 const uncalibrated=renderSignalCard({...signal(),topPick:true,profitEstimate:{n:0}},h);
 assert.match(uncalibrated,/top-pick-star/);assert.match(uncalibrated,/UNCALIBRATED/);
});

test('Grouped Top Picks count distinct plans beside the ticker and preserve opposing plans in collapsed details',()=>{
 const plans=[{...signal(),id:'tsla3',symbol:'TSLA',tf:3,topPick:true,dir:1,entry:[210,211],stop:208,optionPlan:{expiration:'2026-10-16'}},{...signal(),id:'tsla5',symbol:'TSLA',tf:5,topPick:true,dir:-1,entry:[220,221],stop:225,optionPlan:{expiration:'2026-10-23'}},{...signal(),id:'tsla15',symbol:'TSLA',tf:15,topPick:true,dir:1,entry:[230,231],stop:228,optionPlan:{expiration:'2026-10-30'}}],before=structuredClone(plans);
 const group=groupSignalCards([...plans,structuredClone(plans[0])])[0],html=renderSignalCardGroup(group,(s,setupCount)=>renderSignalCard(s,{...h,setupCount}),{esc});
 assert.equal(group.length,3);
 assert.match(html,/<strong>TSLA[^]*?<\/strong><span class="badge setup-count">3 setups<\/span>/);
 assert.match(html,/<details class="additional-plans" data-symbol-group="stocks\|TSLA" ><summary>Show 2 more setups<\/summary>/);
 const primary=html.slice(0,html.indexOf('<details class="additional-plans"'));
 assert.equal((primary.match(/<article /g)||[]).length,1);
 assert.match(primary,/data-signal="tsla3"/);
 for(const plan of plans){assert.ok(html.includes(renderSignalCard(plan,{...h,setupCount:plan===plans[0]?3:1})));assert.match(html,new RegExp('data-signal="'+plan.id+'"'));}
 assert.match(html,/data-direction="bullish"/);assert.match(html,/data-direction="bearish"/);
 assert.deepEqual(plans,before);
});

test('Signal cards omit the US stock badge and retain other market labels',()=>{
 assert.doesNotMatch(renderSignalCard(signal(),h),/US stock/);
 assert.match(renderSignalCard({...signal(),market:'crypto'},h),/>Crypto<\/span>/);
 assert.match(renderSignalCard({...signal(),market:'index'},h),/>Index<\/span>/);
});
