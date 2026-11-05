import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicRequests} from '../modules/public-requests.mjs';

const settings=()=>({scanner:{secUserAgent:'JARVIS research contact@example.test'}});
const live='https://query2.finance.yahoo.com/v8/finance/chart/SPY?interval=1m&range=5d';
const history='https://example.org/history';
function fixture(fetcher){
 let time=1000;
 const requests=new PublicRequests({settings,fetcher,now:()=>time,pause:async ms=>{time+=ms;}});
 return {requests,advance:ms=>{time+=ms;}};
}

test('Concurrent cold and expired public requests download each URL once and return independent bodies',async()=>{
 let calls=0;
 const {requests,advance}=fixture(async()=>new Response(JSON.stringify({download:++calls}),{headers:{'Content-Type':'application/json'}}));
 for(const expected of [1,2]){
  const responses=await Promise.all(Array.from({length:5},()=>requests.fetch(live)));
  assert.equal(calls,expected);
  assert.equal(new Set(responses).size,5);
  assert.deepEqual(await Promise.all(responses.map(r=>r.json())),Array.from({length:5},()=>({download:expected})));
  assert.ok(responses.every(r=>r.headers.get('content-type')==='application/json'));
  advance(30000);
 }
});

test('Queue deduplication preserves separate URLs, host spacing and live versus historical expiry',async()=>{
 const calls=[];
 const {requests,advance}=fixture(async url=>{calls.push(url);return new Response(String(calls.length));});
 const responses=await Promise.all([requests.fetch(live),requests.fetch(history),requests.fetch(live),requests.fetch(history)]);
 assert.deepEqual(calls,[live,history]);
 assert.deepEqual(await Promise.all(responses.map(r=>r.text())),['1','2','1','2']);
 advance(30000);
 await Promise.all([requests.fetch(live),requests.fetch(history),requests.fetch(live)]);
 assert.deepEqual(calls,[live,history,live]);
 advance(900000);
 await Promise.all([requests.fetch(history),requests.fetch(history)]);
 assert.deepEqual(calls,[live,history,live,history]);
 let at=1000;
 const starts=[],spaced=new PublicRequests({settings,now:()=>at,pause:async ms=>{at+=ms;},fetcher:async()=>{starts.push(at);return new Response('ok');}});
 await Promise.all([spaced.fetch(history),spaced.fetch(history+'/other'),spaced.fetch(history)]);
 assert.deepEqual(starts,[1000,1300]);
});

test('A queued request refreshes a cache entry that expires while it waits',async()=>{
 let calls=0,entered,release;
 const started=new Promise(resolve=>{entered=resolve;});
 const blocked=new Promise(resolve=>{release=resolve;});
 const {requests,advance}=fixture(async url=>{
  calls++;
  if(url.endsWith('/block')){entered();await blocked;}
  return new Response(String(calls));
 });
 const blocker=requests.fetch('https://example.org/block');
 await started;
 const pending=requests.fetch(live);
 // Another earlier caller's result is present by the time this caller reaches the queue.
 requests.cache.set(live,{body:'expired',type:'text/plain',time:1000});
 advance(30000);
 release();
 await blocker;
 assert.equal(await (await pending).text(),'2');
 assert.equal(calls,2);
});

test('Failed downloads release the queue and do not cache failures',async()=>{
 let calls=0;
 const {requests}=fixture(async()=>{if(++calls===1)throw Error('offline');return new Response('recovered');});
 const results=await Promise.allSettled([requests.fetch(history),requests.fetch(history),requests.fetch(history)]);
 assert.equal(results[0].status,'rejected');
 assert.match(results[0].reason.message,/offline/);
 assert.deepEqual(await Promise.all(results.slice(1).map(async r=>(await r.value).text())),['recovered','recovered']);
 assert.equal(calls,2);
});

test('Queued same-host requests honor a new rate-limit cooldown and resume after it expires',async()=>{
 let calls=0;
 const {requests,advance}=fixture(async()=>++calls===1?new Response('',{status:429}):new Response('ok'));
 const results=await Promise.allSettled([requests.fetch(history),requests.fetch(history+'/other'),requests.fetch(history)]);
 assert.equal(calls,1);
 assert.ok(results.every(r=>r.status==='rejected'));
 assert.match(results[0].reason.message,/429/);
 for(const r of results.slice(1))assert.match(r.reason.message,/cooling down/);
 advance(120000);
 assert.equal(await (await requests.fetch(history)).text(),'ok');
 assert.equal(calls,2);
});

test('Overview Coinbase ticker requests use quote freshness rather than the fifteen-minute history cache',async()=>{let calls=0;const {requests,advance}=fixture(async()=>new Response(String(++calls))),url='https://api.exchange.coinbase.com/products/BTC-USD/ticker';assert.equal(await (await requests.fetch(url)).text(),'1');advance(29000);assert.equal(await (await requests.fetch(url)).text(),'1');advance(1000);assert.equal(await (await requests.fetch(url)).text(),'2');});
