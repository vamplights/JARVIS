import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PublicRequests} from '../modules/public-requests.mjs';
import {PublicMarket,stitchCryptoHistory,writeJSON,sourceKey} from '../modules/public-market.mjs';

const settings=()=>({stocks:[],crypto:['BTC-USD'],scanner:{secUserAgent:'JARVIS research contact@example.test'}});

test('A priority request does not wait behind a slow background download, and is not passed to fetch',async()=>{
 let release,entered;const started=new Promise(r=>{entered=r;}),blocked=new Promise(r=>{release=r;}),seen=[];
 let time=1000;
 const requests=new PublicRequests({settings,now:()=>time,pause:async ms=>{time+=ms;},fetcher:async(url,options)=>{seen.push([url,Object.hasOwn(options,'priority')]);if(url.endsWith('/slow')){entered();await blocked;}return new Response(url);}});
 const slow=requests.fetch('https://example.org/slow');await started;
 const queued=requests.fetch('https://example.com/queued');
 assert.equal(await (await requests.fetch('https://example.net/urgent',{priority:true})).text(),'https://example.net/urgent');
 assert.deepEqual(seen.map(s=>s[0]),['https://example.org/slow','https://example.net/urgent']);
 release();await slow;assert.equal(await (await queued).text(),'https://example.com/queued');
 assert.ok(seen.every(s=>s[1]===false));
});

test('Cached live stitching equals a fresh stitch across new candles, quotes, saved files and hour boundaries',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-stitch-')),source='Coinbase Exchange',hour=3600,start=1790000000-1790000000%hour;
 try{
  const five=(i,complete=true)=>({time:start+i*300,open:100+i,high:102+i,low:99+i,close:101+i,volume:5,complete});
  const file=path.join(dir,'history','BTC-USD',String(hour),sourceKey(source)+'.json');
  const save=n=>writeJSON(file,{symbol:'BTC-USD',market:'crypto',base:hour,source,fallback:false,bars:Array.from({length:n},(_,i)=>({time:start-(n-i)*hour,open:90,high:95,low:85,close:92,volume:50,complete:true,source,fallback:false}))});
  save(5);
  const live={symbol:'BTC-USD',market:'crypto',source:'Coinbase Exchange history / Advanced Trade stream',base:300,bars:Array.from({length:14},(_,i)=>five(i)),quote:{price:110,time:1}};
  let now=(start+14*300)*1000+2500;
  const market=new PublicMarket({dir,settings,liveAssets:()=>({'BTC-USD':live}),now:()=>now});
  const check=()=>{const cached=market.liveDataset('BTC-USD',hour,source);assert.deepEqual(cached,stitchCryptoHistory(market.dataset('BTC-USD',hour,source),live,hour,now,source));return cached;};
  const first=check(),second=check();assert.equal(second.bars,first.bars);
  live.quote={price:111,time:2};assert.equal(check().quote.price,111);
  live.bars=[...live.bars,five(14,false)];now+=300000;assert.notEqual(check().bars,first.bars);
  now=(start+2*hour)*1000+2500;check();
  save(6);fs.utimesSync(file,new Date(),new Date(Date.now()+5000));check();
  assert.equal(market.liveDataset('ETH-USD',hour,source),null);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
