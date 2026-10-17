import {entryExpiresAt,staleFor} from './signal-policy.mjs';
import {LearningStorage,MAX_COMPLETED_RUN_IDS} from './learning-storage.mjs';
import {sourceKey} from './public-market.mjs';
import {settingsProfile} from './stats.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parts,session,aggregate,strategyEnabled,marketCosts} from './engine.mjs';
import {pooledReplayStats} from './stats.mjs';

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,20);
const safeURL=x=>{try{const u=new URL(x);return u.protocol==='https:'?u.href:null;}catch{return null;}};
const clean=x=>String(x||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/\s+/g,' ').trim();
const tag=(s,name)=>s.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i'))?.[1]||'';
export function parseRSS(xml,feed,now=Date.now()){
 return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(([,item])=>{
  const title=clean(tag(item,'title')).slice(0,280),url=safeURL(clean(tag(item,'link'))),publishedAt=Date.parse(clean(tag(item,'pubDate'))),publisher=clean(tag(item,'source'))||new URL(url||'https://unknown.invalid').hostname;
  return {id:hash(url),title,url,publisher,feed,source:feed,publishedAt,receivedAt:now,kind:feed==='Federal Reserve'?'Official macro release':'Headline',themes:themes(title)};
 }).filter(n=>n.title&&n.url&&Number.isFinite(n.publishedAt)&&n.publishedAt<=now+300000&&now-n.publishedAt<14*86400000).slice(0,20);
}
export function themes(title){const tests={Earnings:/earnings|quarter|revenue|profit|guidance|outlook/i,Regulatory:/regulat|lawsuit|antitrust|investigat|settle|sec\b/i,Deal:/acqui|merger|takeover|buyout/i,Macro:/inflation|interest rate|federal reserve|employment|payroll|tariff/i,Analyst:/upgrade|downgrade|price target|analyst/i};return Object.entries(tests).filter(([,r])=>r.test(title)).map(([k])=>k);}
export function relatedCoverage(items){
 const publisher=x=>String(x).toLowerCase().replace(/^www\./,'').replace(/\.(com|net|org)$/,'').replace(/[^a-z0-9]/g,'');
 const words=t=>new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>3&&!['stock','stocks','shares','market','news','says'].includes(w)));
 return items.map(a=>({...a,related:items.filter(b=>{if(a.id===b.id||publisher(a.publisher)===publisher(b.publisher)||Math.abs(a.publishedAt-b.publishedAt)>3*86400000)return false;const x=words(a.title),y=words(b.title),common=[...x].filter(w=>y.has(w)).length;return common>=4&&common/Math.max(x.size,y.size)>=.45;}).map(b=>b.id)}));
}
function writeJSON(file,value){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file);}
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw Error('Research storage could not be read; original file preserved');}}
export class PublicResearch {
 constructor({dir,fetcher=fetch}){this.dir=dir;this.fetcher=fetcher;this.cache=readJSON(path.join(dir,'public-news.json'),{});this.companies=null;this.busy=new Map();this.error=null;this.macro=null;}
 async request(url){const r=await this.fetcher(url,{headers:{'User-Agent':'JARVIS local public-market research','Accept':'application/json, application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(12000),redirect:'error'});if(!r.ok)throw Error('Source HTTP '+r.status);const text=await r.text();if(text.length>12000000)throw Error('Source response too large');return text;}
 async refresh(symbol,force=false){
  if(this.busy.has(symbol))return this.busy.get(symbol);const old=this.cache[symbol];if(!force&&old&&Date.now()-old.checkedAt<900000)return old;
  const promise=this.load(symbol).finally(()=>this.busy.delete(symbol));this.busy.set(symbol,promise);return promise;
 }
 async load(symbol){
  const now=Date.now(),sources=[],items=[];let financials=[];
  try{if(!this.companies)this.companies=JSON.parse(await this.request('https://www.sec.gov/files/company_tickers.json'));}catch{sources.push({name:'SEC company directory',ok:false,error:'Company directory unavailable'});}
  const company=Object.values(this.companies||{}).find(c=>c.ticker===symbol||c.ticker===symbol.replace('.','-'));
  const query=(company?.title||symbol)+' stock';
  for(const [name,url] of [['Yahoo Finance',`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`],['Google News',`https://news.google.com/rss/search?q=${encodeURIComponent(query+' when:7d')}&hl=en-US&gl=US&ceid=US:en`]]){
   try{const parsed=parseRSS(await this.request(url),name,now);items.push(...parsed);sources.push({name,ok:true,count:parsed.length,checkedAt:now});}catch(e){sources.push({name,ok:false,error:e.message,checkedAt:now});}
  }
  if(company){try{const cik=String(company.cik_str).padStart(10,'0'),data=JSON.parse(await this.request(`https://data.sec.gov/submissions/CIK${cik}.json`)),r=data.filings?.recent;if(!r)throw Error('Filings unavailable');let count=0;
   for(let i=0;i<r.form.length&&count<12;i++){if(!['8-K','10-Q','10-K','6-K','20-F'].includes(r.form[i]))continue;const publishedAt=Date.parse(r.acceptanceDateTime?.[i]||r.filingDate[i]+'T23:59:59Z');if(!Number.isFinite(publishedAt)||publishedAt>now||now-publishedAt>120*86400000)continue;const accession=String(r.accessionNumber[i]).replace(/-/g,''),document=String(r.primaryDocument[i]);if(!/^\d+$/.test(accession)||!/^[\w.-]+$/.test(document))continue;const url=`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${document}`;items.push({id:hash(url),title:`${company.title}: ${r.form[i]}${r.primaryDocDescription?.[i]?' — '+r.primaryDocDescription[i]:''}`,url,publisher:'SEC EDGAR',feed:'SEC EDGAR',publishedAt,receivedAt:now,kind:'Official company filing',themes:[],form:r.form[i]});count++;}sources.push({name:'SEC EDGAR',ok:true,count,checkedAt:now});
  }catch(e){sources.push({name:'SEC EDGAR',ok:false,error:e.message,checkedAt:now});}}else sources.push({name:'SEC EDGAR',ok:false,error:'No matching issuer found; ETF or ticker coverage may differ',checkedAt:now});
  try{if(!this.macro||now-this.macro.at>3600000)this.macro={at:now,items:parseRSS(await this.request('https://www.federalreserve.gov/feeds/press_all.xml'),'Federal Reserve',now)};items.push(...this.macro.items.slice(0,5));sources.push({name:'Federal Reserve',ok:true,count:this.macro.items.length,checkedAt:this.macro.at});}catch(e){sources.push({name:'Federal Reserve',ok:false,error:e.message,checkedAt:now});}
  if(company){try{const url='https://data.sec.gov/api/xbrl/companyfacts/CIK'+String(company.cik_str).padStart(10,'0')+'.json',facts=JSON.parse(await this.request(url)).facts?.['us-gaap']||{};
   for(const [label,keys] of [['Revenue',['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet']],['Net income',['NetIncomeLoss']],['Diluted EPS',['EarningsPerShareDiluted']]]){const key=keys.find(k=>facts[k]);if(!key)continue;const units=facts[key].units||{},unit=Object.keys(units).find(x=>x==='USD'||x==='USD/shares');if(!unit)continue;const values=units[unit].filter(v=>v.start&&v.end&&['10-Q','10-K'].includes(v.form)&&Date.parse(v.filed+'T23:59:59Z')<=now&&Date.parse(v.end)<=now&&Number.isFinite(v.val)).sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed)||b.start.localeCompare(a.start));const v=values[0];if(v)financials.push({label,value:v.val,unit,start:v.start,end:v.end,filed:v.filed,form:v.form,url});}
   sources.push({name:'SEC reported financials',ok:true,count:financials.length,checkedAt:now});}catch(e){sources.push({name:'SEC reported financials',ok:false,error:e.message,checkedAt:now});}}
  const unique=[...new Map(items.map(n=>[n.url,n])).values()].sort((a,b)=>b.publishedAt-a.publishedAt);
  const result={symbol,company:company?.title||symbol,checkedAt:now,sources,financials,items:relatedCoverage(unique),coverage:'Headlines and filing metadata only. Article and filing contents are not automatically verified. Related headlines are not independent confirmation.'};
  if(!unique.length&&this.cache[symbol]?.items?.length){result.items=this.cache[symbol].items;result.retained=true;}
  this.cache[symbol]=result;try{writeJSON(path.join(this.dir,'public-news.json'),this.cache);this.error=null;}catch{this.error='News cache could not be saved';}return result;
 }
}
export function newsContext(news,now){if(!news||news.retained||now-news.checkedAt>=3600000)return 'unknown';const items=news.items.filter(n=>n.kind==='Headline'&&n.publishedAt<=now&&now-n.publishedAt<=86400000);return [...new Set(items.flatMap(n=>n.themes||[]))].sort().join(' + ')||'no tagged event';}
export function calibration(outcomes,signal){
 const bin=Math.floor((signal?.score||0)/10),rows=outcomes.filter(o=>o.symbol===signal?.symbol&&o.strategy===signal?.strategy&&o.tf===signal?.tf&&o.dir===signal?.dir&&o.profile===signal?.profile&&o.bin===bin&&(!signal?.matchNews||o.newsContext===signal.newsContext)&&o.result==='measured'),n=rows.length,wins=rows.filter(o=>o.netDirection>0).length,p=n?wins/n:null,z=1.96,den=1+z*z/(n||1),center=((p||0)+z*z/(2*(n||1)))/den,half=z*Math.sqrt(((p||0)*(1-(p||0))+z*z/(4*(n||1)))/(n||1))/den,days=new Set(rows.map(o=>o.session)).size;
 const eligible=n>=100&&days>=20;
 return {n,days,rate:p,lower:n?Math.max(0,center-half):null,upper:n?Math.min(1,center+half):null,eligible,score:eligible?Math.round(100*Math.max(0,center-half)):null,meaning:'Forward underlying direction after 12 candles, net of configured cost assumptions. Not options win probability. Interval assumes independent observations; market outcomes may remain correlated.'};
}
export function resolveForecast(f,bars,base,now=Date.now()){
 const first=Math.ceil(f.createdAt/(base*1000))*base,end=Math.ceil(f.dueAt/(base*1000))*base;
 const window=bars.filter(b=>b.complete!==false&&b.time>=first&&b.time<end&&b.time+base<=now/1000).sort((a,b)=>a.time-b.time);
 if(now<f.dueAt+base*1000)return null;
 if(window.length!==(end-first)/base||window.some((b,i)=>b.time!==first+i*base))return {...f,result:'unmeasurable',reason:'Missing candles or session boundary'};
 const exit=window.at(-1)?.close;if(!(exit>0))return {...f,result:'unmeasurable',reason:'No closing price'};
 return {...f,result:'measured',exit,netDirection:f.dir*(exit/f.price-1)-f.costBps/10000,resolvedAt:now};
}
export function completedSessions(archive,settings,now=Date.now()){
 const zone=archive.market==='stocks'?'America/New_York':'UTC',today=parts(now,zone).date,days=new Map();
 for(const b of archive.bars||[]){if(b.complete===false||(b.time+archive.base)*1000>now-2000)continue;const date=parts(b.time*1000,zone).date;if(date>=today)continue;if(!days.has(date))days.set(date,[]);days.get(date).push(b);}
 return [...days].sort(([a],[b])=>a.localeCompare(b)).flatMap(([date,bars])=>{bars.sort((a,b)=>a.time-b.time);const hours=session(Date.parse(date+'T17:00:00Z'),settings),stock=archive.market==='stocks';if(stock&&!hours.tradingDay)return [];const expected=(stock?(hours.close-570)*60:86400)/archive.base;
  const first=parts(bars[0].time*1000,zone).minutes,last=parts(bars.at(-1).time*1000,zone).minutes;
  return bars.length===expected&&first===(stock?570:0)&&last+archive.base/60===(stock?hours.close:1440)&&bars.every((b,i)=>!i||b.time-bars[i-1].time===archive.base)?[{date,bars}]:[];
 }).slice(-20);
}
export class SessionLearning {
 constructor({dir,settings,assets,news,replay,batchReplay=false}){this.batchReplay=batchReplay;this.dir=dir;this.settings=settings;this.assets=assets;this.news=news;this.replay=replay;this.archiveDir=path.join(dir,'sessions');fs.mkdirSync(this.archiveDir,{recursive:true});this.storage=new LearningStorage(dir);this.records=this.storage.load({version:1,forecasts:[],runs:[]});this.completedIds=new Set([...(this.records.completedRunIds||[]),...this.records.runs.map(r=>r.id)]);this.archives=new Map();this.busy=false;this.error=null;this.lastRun=null;this.cursor=0;}
 archive(a){const key=a.source?a.symbol+'--'+sourceKey(a.source):a.symbol;if(!this.archives.has(key)){const f=path.join(this.archiveDir,key+'.json');this.archives.set(key,readJSON(f,{symbol:a.symbol,market:a.market,base:a.base,source:a.source,fallback:!!a.fallback,bars:[]}));}return this.archives.get(key);}
 observe(signals,assets,now=Date.now()){
  let changed=false;const settings=this.settings(),known=new Set(this.records.forecasts.map(f=>f.id));
  for(const s of signals){const a=assets[s.symbol],q=a?.quote;if(s.status!=='CONFIRMED'||s.replay||a?.replay||a?.snapshot||known.has(s.id)||!q||now-q.time>staleFor(settings,s.market)*1000||q.time>now+5000||now>entryExpiresAt(s,settings)||s.confirmedAt>now)continue;
   if(this.records.forecasts.some(f=>f.symbol===s.symbol&&f.strategy===s.strategy&&f.tf===s.tf&&f.dueAt>now))continue;
   const capturedNews=this.news.cache[s.symbol],newsFresh=capturedNews&&now-capturedNews.checkedAt<3600000&&!capturedNews.retained;
   const costs=marketCosts(settings,a.market,q);
   this.records.forecasts.push({id:s.id,symbol:s.symbol,strategy:s.strategy,tf:s.tf,bin:Math.floor(s.score/10),score:s.score,profile:hash({settings,protocol:'edge-v1'}),dir:s.dir,price:q.price,stop:s.stop,adx:s.adx??null,efficiency:s.efficiency??null,createdAt:now,dueAt:now+s.tf*12*60000,session:parts(now,a.market==='stocks'?'America/New_York':'UTC').date,result:'pending',costBps:costs.feeBps*2+costs.slippageBps*2+costs.spreadBps,newsIds:newsFresh?capturedNews.items.filter(n=>n.publishedAt<=now).map(n=>n.id):[],newsSnapshot:newsFresh?capturedNews.items.filter(n=>n.publishedAt<=now).map(n=>({id:n.id,title:n.title,url:n.url,publishedAt:n.publishedAt,receivedAt:n.receivedAt,themes:n.themes})):[],newsState:newsFresh?'available at prediction':'not available at prediction',newsContext:newsContext(capturedNews,now)});known.add(s.id);changed=true;
  }
  if(changed)this.persist();
 }
 hasReplayRun(id){return this.completedIds.has(id);}
 addReplayRun(run){this.completedIds.add(run.id);this.records.completedRunIds=[...this.completedIds].slice(-MAX_COMPLETED_RUN_IDS);this.records.runs.push(this.storage.prepare(run));}
 modelRuns(){return this.storage.modelRuns(this.records.runs);}
 persist(){try{this.storage.save(this.records);if(this.error==='Session learning could not be saved')this.error=null;}catch{this.error='Session learning could not be saved';}}
 async tick(){if(this.busy)return;this.busy=true;try{
  const now=Date.now(),settings=structuredClone(this.settings()),assets=Object.values(this.assets()).filter(a=>!a.replay&&!a.snapshot&&(a.market==='crypto'?settings.crypto:settings.stocks).includes(a.symbol));
  for(const a of assets){const store=this.archive(a),merged=new Map(store.bars.map(b=>[b.time,b]));for(const b of a.bars){if(b.complete!==false&&b.time+a.base<=(now-2000)/1000)if(!merged.has(b.time))merged.set(b.time,b);}const bars=[...merged.values()].filter(b=>b.time>now/1000-90*86400).sort((a,b)=>a.time-b.time);if(JSON.stringify(store.bars)!==JSON.stringify(bars)){store.bars=bars;writeJSON(path.join(this.archiveDir,(a.source?a.symbol+'--'+sourceKey(a.source):a.symbol)+'.json'),store);}
   this.records.forecasts=this.records.forecasts.map(f=>f.symbol===a.symbol&&f.result==='pending'?(resolveForecast(f,bars,a.base,now)||f):f);
  }
  const candidates=new Map(assets.map(a=>[a.symbol+'|'+(a.source||''),a]));
  // Existing archives remain useful even when their live connection is unavailable.
  for(const file of fs.readdirSync(this.archiveDir).filter(f=>/^[A-Za-z0-9.-]+\.json$/.test(f))){const stored=readJSON(path.join(this.archiveDir,file),null);if(!stored||![...settings.stocks,...settings.crypto].includes(stored.symbol))continue;const key=stored.symbol+'|'+(stored.source||'');if(!candidates.has(key)&&['stocks','crypto'].includes(stored.market)&&stored.base>0)candidates.set(key,stored);}
  const universe=[...candidates.values()],version=hash({profile:settingsProfile(settings),method:'walk-forward-edge-v3-confluence'});let jobs=0;
  for(let offset=0;offset<universe.length&&jobs<2;offset++){const a=universe[(this.cursor+offset)%universe.length],archive=this.archive(a),sessions=completedSessions(archive,settings,now);if(!sessions.length)continue;const bars=sessions.flatMap(s=>s.bars),day=sessions.at(-1).date,frames=a.market==='stocks'?settings.stockFrames:(settings.cryptoFrames||[settings.cryptoFrame]);
   for(const tf of frames){if(this.batchReplay&&jobs<2){
    const pending=settings.strategies.filter(strategy=>!['orb-in-play','spy-qqq-momentum','post-earnings','daily-trend'].includes(strategy)&&strategyEnabled(strategy,tf,settings,a.market)&&!(a.market==='crypto'&&strategy.startsWith('orb'))&&!this.hasReplayRun([a.symbol,a.source||'legacy',sessions[0].date,day,tf,strategy,version].join(':')));
    if(!pending.length||aggregate(bars,tf,a.base,now-2000).filter(b=>b.complete).length<192)continue;
    try{const result=await this.replay({symbol:a.symbol,market:a.market,source:a.source||'Legacy unverified',fallback:a.fallback??!a.source,bars,base:a.base,tf,settings,strategies:pending,exitR:2,mode:'walk-forward-batch'});
     for(const r of result.runs){const strategy=r.strategy,id=[a.symbol,a.source||'legacy',sessions[0].date,day,tf,strategy,version].join(':');this.addReplayRun({id,kind:'walk-forward',symbol:a.symbol,market:a.market,source:a.source,fallback:a.fallback??!a.source,session:day,sessions:sessions.map(s=>s.date),strategy,tf,version,profile:settingsProfile(settings),completedAt:Date.now(),outOfSample:r.outOfSample,trades:(r.trades||[]).filter(t=>t.segment==='out-of-sample'),bars:bars.length,gaps:0,method:r.method,warning:r.warning});}this.error=null;
    }catch(e){this.error=e.message;}jobs++;continue;
   }
   for(const strategy of settings.strategies){if(['orb-in-play','spy-qqq-momentum','post-earnings','daily-trend'].includes(strategy))continue;if(jobs>=2)break;if(!strategyEnabled(strategy,tf,settings,a.market)||a.market==='crypto'&&strategy.startsWith('orb'))continue;
    const id=[a.symbol,a.source||'legacy',sessions[0].date,day,tf,strategy,version].join(':');if(this.hasReplayRun(id)||aggregate(bars,tf,a.base,now-2000).filter(b=>b.complete).length<192)continue;
    try{const r=await this.replay({symbol:a.symbol,market:a.market,source:a.source,fallback:!!a.fallback,bars,base:a.base,tf,settings,strategy,exitR:2,mode:'walk-forward'});this.addReplayRun({id,kind:'walk-forward',symbol:a.symbol,market:a.market,source:a.source,fallback:!!a.fallback,session:day,sessions:sessions.map(s=>s.date),strategy,tf,version,profile:settingsProfile(settings),completedAt:Date.now(),outOfSample:r.outOfSample,trades:(r.trades||[]).filter(t=>t.segment==='out-of-sample'),bars:bars.length,gaps:0,method:r.method,warning:r.warning});this.error=null;jobs++;}catch(e){this.error=e.message;jobs++;}
   }}
  }if(universe.length)this.cursor=(this.cursor+1)%universe.length;
  this.lastRun=Date.now();this.persist();
 }catch(e){this.error=e.message;}finally{this.busy=false;}}
 pooled(){const version=hash({profile:settingsProfile(this.settings()),method:'walk-forward-edge-v3-confluence'}),key=version+'|'+this.records.runs.length+'|'+this.records.runs.at(-1)?.completedAt;if(this.pooledKey!==key){this.pooledKey=key;this.pooledCache=pooledReplayStats(this.records.runs.filter(r=>r.version===version||r.profile===settingsProfile(this.settings())&&r.version?.includes('|beta010|')));}return this.pooledCache;}
 summary(symbol,signal){const forecasts=this.records.forecasts.filter(f=>f.symbol===symbol),context=newsContext(this.news.cache[symbol],Date.now()),comparisonSignal=signal?{...signal,profile:hash({settings:this.settings(),protocol:'edge-v1'}),newsContext:context}:null,baseline=calibration(forecasts,comparisonSignal),conditioned=calibration(forecasts,comparisonSignal?{...comparisonSignal,matchNews:true}:null),useNews=context!=='unknown'&&conditioned.eligible,runs=this.records.runs.filter(r=>r.symbol===symbol).slice(-30).reverse(),archive=this.archives.get(symbol);return {lastRun:this.lastRun,busy:this.busy,error:this.error,forecasts:forecasts.length,pending:forecasts.filter(f=>f.result==='pending').length,measured:forecasts.filter(f=>f.result==='measured').length,unmeasurable:forecasts.filter(f=>f.result==='unmeasurable').length,calibration:useNews?conditioned:baseline,pooled:this.pooled(),newsEvidence:{context,baseline,conditioned,used:useNews,note:'A matched headline-topic cohort can condition the historical score only after 100 outcomes across 20 sessions. This is observational association, not proof that news caused the move.'},runs,archiveBars:archive?.bars.length||0,coverageNote:'Walk-forward replays use up to 20 complete archived sessions, excluding incomplete days and current sessions. Stocks use the exchange calendar; crypto uses UTC days.',method:'Fixed-parameter walk-forward replay with disjoint test windows and a 12-bar embargo. Pool unique out-of-sample trade R across symbols per strategy and timeframe, never summed dollar P/L. Raw and capped forward outcomes remain separate. No parameter auto-optimization or guaranteed edge.'};}
}
export function buildBrief({symbol,signals,news,learning,options,now,settings}){
 const signal=signals.filter(s=>s.symbol===symbol).sort((a,b)=>(b.status==='CONFIRMED')-(a.status==='CONFIRMED')||b.score-a.score)[0],history=learning.summary(symbol,signal),cal=history.calibration;
 const confirmation=signal?.optionPlan?.confidence??(signal?Math.round(cal.eligible ? .7*signal.score+.3*cal.score : signal.score):null);
 const recent=(news?.items||[]).filter(n=>now-n.publishedAt<7*86400000),events=[...new Set(recent.flatMap(n=>n.themes))],freshNews=!!(news&&!news.retained&&now-news.checkedAt<3600000);
 const displayStatus=signal?.status==='STALE'?(now>entryExpiresAt(signal,settings)?'SETUP EXPIRED':!signal.quoteTime?'QUOTE UNAVAILABLE':signal.quoteTime-now>5000?'QUOTE TIME MISMATCH':now-signal.quoteTime>settings.staleSeconds*1000?'QUOTE DELAYED':'LIVE DATA UNAVAILABLE'):signal?.status;
 const rationale=[];
 if(signal){rationale.push(`${signal.symbol} has a ${signal.direction} ${signal.name} setup. ${signal.factors.filter(f=>f.pass).map(f=>f.name).join(', ')} support the rule score.`);const misses=signal.factors.filter(f=>!f.pass).map(f=>f.name);if(misses.length)rationale.push('Counter-evidence: '+misses.join(', ')+'.');rationale.push(`Current status: ${displayStatus}. The stop/invalidation reference is ${signal.stop.toFixed(2)}; a strong score does not override this status.`);}else rationale.push('No current underlying setup. News alone does not create a trade entry.');
 rationale.push(cal.eligible?`Matched forward evidence: ${cal.n} observations across ${cal.days} sessions. Its conservative direction estimate contributes 30% of the confirmation score.`:`Historical confidence is not calibrated yet: ${cal.n} matching outcomes across ${cal.days} sessions; at least 100 outcomes and 20 sessions are required. The displayed confirmation score uses checklist rules only.`);
 if(events.includes('Earnings'))rationale.push('Headlines mention earnings or guidance. Check the issuer’s actual release and event date; implied volatility can fall after the announcement even if the stock moves in your direction.');
 if(events.includes('Regulatory'))rationale.push('Headlines mention regulatory or legal developments. The outcome, timing, and price impact are unresolved; inspect the primary document.');
 if(events.includes('Macro'))rationale.push('Macro headlines may affect rates, market volatility, and the broader index. They do not establish a direction for this stock.');
 if(events.includes('Deal'))rationale.push('Deal headlines can change price ranges abruptly; verify deal terms and whether the development is confirmed.');
 if(history.newsEvidence?.used)rationale.push('The historical component now uses past forecasts with the same known headline topics: '+history.newsEvidence.context+'. This is a conditional association, not verified news causation.');
rationale.push(freshNews?`${recent.length} recent headlines/releases are listed. The application has checked feed metadata, not the full claims; no discretionary news-based score bonus is applied.`:'News coverage is missing, retained, or over one hour old. Do not read an empty feed as “no news.”');
 const contracts=options.symbol===symbol?(options.contracts||[]).map(c=>{const q=c.quote,book=q&&q.bid>0&&q.ask>=q.bid,spread=book?(q.ask-q.bid)/((q.ask+q.bid)/2)*100:null,fresh=book&&options.connected&&!options.error&&session(now,settings).regular&&now-q.time>=-5000&&now-q.time<=settings.staleSeconds*1000,opposes=signal&&(signal.dir>0?c.type==='put':c.type==='call');return {id:c.id,type:c.type,strike:c.strike,expiration:c.expiration,multiplier:c.multiplier,bid:q?.bid,ask:q?.ask,iv:q?.iv,delta:q?.delta,theta:q?.theta,volume:q?.volume,openInterest:q?.openInterest,quoteTime:q?.time,spread,fresh:!!fresh,debit:book&&c.multiplier>0?q.ask*c.multiplier:null,breakEven:book?(c.type==='call'?c.strike+q.ask:c.strike-q.ask):null,reason:!fresh?(!session(now,settings).regular?'Market closed':!options.connected?'Disconnected · retained data':options.error?'Refresh failed · retained data':!q?'Quote unavailable':!book?'No usable bid/ask':q.time>now+5000?'Quote time mismatch':'Quote delayed · exceeds '+settings.staleSeconds+'s limit'):spread>10?'Wide spread: execution cost weakens the thesis':opposes?'Direction differs from the selected underlying setup':!signal||signal.status!=='CONFIRMED'?'Underlying entry is not confirmed':'Underlying aligns; contract profitability still unvalidated'};}):[];
 if(signal?.optionPlan){rationale.splice(1,1,'Evidence confidence combines technical checks (60), measured outcomes (20), contract quality (15), and news coverage (5), minus flagged event risk. It is not a win probability.');rationale.push(...signal.optionPlan.reasons.slice(1));}
 return {symbol,optionPlan:signal?.optionPlan||null,signal:signal?{id:signal.id,name:signal.name,strategy:signal.strategy,direction:signal.direction,tf:signal.tf,status:signal.status,score:signal.score,stop:signal.stop}:null,confirmation,label:!signal?'No setup':signal.status!=='CONFIRMED'?'Not entry-confirmed':cal.eligible&&cal.lower>.55?'Supported underlying evidence':'Rule-confirmed · evidence developing',rationale,news:news||null,history,contracts,optionsWarning:'No high-confidence options forecast is claimed. Historical option quotes and fills are not available for options backtesting. Underlying direction, checklist score and delta are not probabilities of option profit. Break-even is for a long option at expiration, before fees.'};
}
