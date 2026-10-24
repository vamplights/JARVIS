import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

const RESOURCE='https://agent.robinhood.com/mcp/trading';
export const MARKET_TOOLS=new Set(['get_equity_quotes','get_equity_historicals','get_option_chains','get_option_instruments','get_option_quotes','get_equity_fundamentals','get_earnings_results','get_indexes','get_index_quotes']);
export class RobinhoodError extends Error {constructor(message,status=0,retryMs=0){super(message);this.status=status;this.retryMs=retryMs;}}
export async function readRPC(response,id){
 if(response.headers.get('content-type')?.includes('text/event-stream')){
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data){const message=JSON.parse(data);if(message.id===id)return message;}}if(buffer.length>8e6)throw new Error('Response too large');}}finally{await reader.cancel().catch(()=>{});}
  throw new Error('Incomplete Robinhood response');
 }
 return response.json();
}
// Credentials never reach the dashboard. Optional storage uses Windows account encryption.
export class RobinhoodClient {
 constructor({origin,fetcher=fetch,store=null,retryDelayMs=500,requestTimeoutMs=25000}={}){this.retryDelayMs=retryDelayMs;this.requestTimeoutMs=requestTimeoutMs;this.initializing=null;this.marketQueue=[];this.marketRunning=0;this.backgroundRunning=0;this.store=store;this.storageError=null;this.remembered=false;this.origin=origin;this.fetcher=fetcher;this.tokens=null;this.clientId=null;this.pending=null;this.sessionId=null;this.protocol='2025-06-18';this.seq=0;this.generation=0;this.refreshing=null;}
 restore(){
  if(!this.store)return false;
  try{const saved=this.store.load();if(!saved)return false;
   if(saved.version!==1||saved.origin!==this.origin||typeof saved.clientId!=='string'||!saved.clientId||typeof saved.tokens?.access!=='string'||!saved.tokens.access||!Number.isFinite(saved.tokens.expires)||(saved.tokens.refresh!=null&&typeof saved.tokens.refresh!=='string'))throw Error('Invalid saved authorization');
   this.clientId=saved.clientId;this.tokens=saved.tokens;this.remembered=true;this.storageError=null;return true;
  }catch{this.storageError='Saved Robinhood authorization could not be opened. Connect Robinhood again.';return false;}
 }
 saveAuthorization(){if(!this.store)return;try{this.store.save({version:1,origin:this.origin,clientId:this.clientId,tokens:this.tokens});this.remembered=true;this.storageError=null;}catch{this.remembered=false;this.storageError='Connection works for this session, but encrypted authorization could not be saved.';}}
 forgetAuthorization(){this.tokens=null;this.remembered=false;if(this.store){try{this.store.clear();this.storageError=null;}catch{this.storageError='Saved authorization could not be deleted. Remove the local encrypted authorization file before restarting.';throw Error(this.storageError);}}}
 get connected(){return !!this.tokens;}
 async request(url,options={}){try{return await this.fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(this.requestTimeoutMs)});}catch(e){throw this.connectionError(e);}}
 connectionError(e){if(['TimeoutError','AbortError'].includes(e?.name))return new RobinhoodError('Robinhood request timed out. Temporary market-data failures retry automatically; your saved sign-in is retained.',408);if(e instanceof TypeError)return new RobinhoodError('Robinhood could not be reached. Automatic market-data refresh will retry.',503);return e;}
 async begin(){
  const metadata=await this.request('https://agent.robinhood.com/.well-known/oauth-authorization-server');if(!metadata.ok)throw new Error('Robinhood sign-in discovery unavailable');const m=await metadata.json();
  if(m.issuer!==RESOURCE||m.authorization_endpoint!=='https://robinhood.com/oauth'||m.token_endpoint!=='https://api.robinhood.com/oauth2/token/'||m.registration_endpoint!=='https://agent.robinhood.com/oauth/trading/register'||!m.code_challenge_methods_supported?.includes('S256'))throw new Error('Robinhood sign-in metadata changed; connection needs review');
  const redirect=`${this.origin}/api/robinhood/callback`;
  if(!this.clientId){const r=await this.request(m.registration_endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'JARVIS local market data',redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});if(!r.ok)throw new Error(`Robinhood client registration failed (${r.status})`);const client=await r.json();if(!client.client_id)throw new Error('Robinhood did not issue a client ID');this.clientId=client.client_id;}
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');this.pending={state,verifier,expires:Date.now()+600000,redirect};
  const url=new URL(m.authorization_endpoint);url.search=new URLSearchParams({response_type:'code',client_id:this.clientId,redirect_uri:redirect,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',scope:'internal',resource:RESOURCE}).toString();return {url:url.href};
 }
 async finish(params){
  const p=this.pending,state=params.get('state')||'';
  if(!p||Date.now()>p.expires||state.length!==p.state.length||!timingSafeEqual(Buffer.from(state),Buffer.from(p.state)))throw new Error('Sign-in expired or state mismatch. Start Connect Robinhood again.');
  this.pending=null;if(params.has('error'))throw new Error('Robinhood authorization was not completed.');if(params.has('iss')&&params.get('iss')!==RESOURCE)throw new Error('Unexpected authorization issuer');
  const code=params.get('code');if(!code)throw new Error('Missing Robinhood authorization code');
  const generation=this.generation;await this.token({grant_type:'authorization_code',code,client_id:this.clientId,redirect_uri:p.redirect,code_verifier:p.verifier,resource:RESOURCE},generation);this.sessionId=null;await this.initialize();
 }
 async token(fields,generation=this.generation){
  const r=await this.request('https://api.robinhood.com/oauth2/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)});
  if(!r.ok){if(generation===this.generation&&(r.status===400||r.status===401))this.forgetAuthorization();throw new RobinhoodError('Robinhood sign-in needs renewal',r.status);}
  const t=await r.json();if(!t.access_token||t.token_type?.toLowerCase()!=='bearer')throw new Error('Invalid Robinhood token response');if(generation!==this.generation)throw new Error('Connection was disconnected');
  this.tokens={access:t.access_token,refresh:t.refresh_token||this.tokens?.refresh,expires:Date.now()+Math.max(1,Number(t.expires_in)||300)*1000};this.saveAuthorization();
 }
 async ensureToken(){if(!this.tokens)throw new RobinhoodError('Connect Robinhood to enable automatic data refresh',401);if(this.tokens.expires>Date.now()+60000)return;if(!this.tokens.refresh){this.forgetAuthorization();throw new RobinhoodError('Robinhood sign-in expired',401);}if(!this.refreshing)this.refreshing=this.token({grant_type:'refresh_token',refresh_token:this.tokens.refresh,client_id:this.clientId,resource:RESOURCE}).finally(()=>this.refreshing=null);await this.refreshing;}
 async rpc(method,params,notify=false){
  await this.ensureToken();const id=++this.seq;
  const r=await this.request(RESOURCE,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${this.tokens.access}`,'MCP-Protocol-Version':this.protocol,...(this.sessionId?{'Mcp-Session-Id':this.sessionId}:{})},body:JSON.stringify({jsonrpc:'2.0',...(notify?{}:{id}),method,params})});
  if(!r.ok){if(r.status===404)this.sessionId=null;const retry=r.headers.get('retry-after'),retryMs=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Date.parse(retry)-Date.now()):0;throw new RobinhoodError(r.status===429?'Robinhood rate limit; automatic refresh will back off':r.status===401?'Robinhood sign-in expired':`Robinhood request failed (${r.status})`,r.status,Math.max(0,retryMs||0));}
  if(r.headers.get('mcp-session-id'))this.sessionId=r.headers.get('mcp-session-id');if(notify||r.status===202){await r.body?.cancel();return;}
  let message;try{message=await readRPC(r,id);}catch(e){throw this.connectionError(e);}if(message.id!==id)throw new Error('Unexpected Robinhood response');if(message.error)throw new Error('Robinhood could not complete the market-data request');return message.result;
 }
 async initialize(){
  if(this.initializing)return this.initializing;
  const generation=this.generation,job=(async()=>{const info=await this.rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'JARVIS local market data',version:'1.1.0'}});if(generation!==this.generation)throw Error('Connection was disconnected');this.protocol=info.protocolVersion;await this.rpc('notifications/initialized',{},true);if(generation!==this.generation)throw Error('Connection was disconnected');this.initialized=true;})();
  this.initializing=job;try{return await job;}finally{if(this.initializing===job)this.initializing=null;}
 }
 pumpMarketQueue(){
  this.marketQueue.sort((a,b)=>a.priority-b.priority);
  while(this.marketRunning<3){const index=this.marketQueue.findIndex(j=>j.priority===0||this.backgroundRunning<2);if(index<0)return;const job=this.marketQueue.splice(index,1)[0];this.marketRunning++;if(job.priority!==0)this.backgroundRunning++;
   Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{this.marketRunning--;if(job.priority!==0)this.backgroundRunning--;this.pumpMarketQueue();});
  }
 }
 async call(name,args){
  if(!MARKET_TOOLS.has(name))throw new Error('Only approved market-data reads are allowed');
  const generation=this.generation,priority=name==='get_equity_quotes'?0:name==='get_equity_historicals'?1:name==='get_option_quotes'?2:3;
  return new Promise((resolve,reject)=>{this.marketQueue.push({priority,resolve,reject,run:()=>this.marketRead(name,args,generation)});this.pumpMarketQueue();});
 }
 async marketRead(name,args,generation){
  let renewed=false;
  for(let attempt=0;;attempt++){
   if(generation!==this.generation)throw Error('Connection was disconnected');
   try{
    if(!this.initialized)await this.initialize();
    const r=await this.rpc('tools/call',{name,arguments:args});
    if(generation!==this.generation)throw Error('Connection was disconnected');
    if(r?.isError)throw new Error(`Robinhood ${name} data unavailable`);const payload=r?.structuredContent||JSON.parse(r?.content?.find(c=>c.type==='text')?.text||'{}');if(!payload.data)throw new Error(`Robinhood ${name} returned no usable data`);return payload.data;
   }catch(error){const e=this.connectionError(error);
    if(generation!==this.generation)throw Error('Connection was disconnected');
    if(e.status===401&&!renewed&&this.tokens?.refresh){renewed=true;this.tokens.expires=0;await this.ensureToken();continue;}
    if(e.status===401){this.forgetAuthorization();throw e;}
    if(e.status===404&&attempt<1){this.initialized=false;continue;}
    if([408,502,503,504].includes(e.status)&&attempt<1){await new Promise(r=>setTimeout(r,this.retryDelayMs));continue;}
    throw e;
   }
  }
 }

 disconnect(){this.generation++;for(const job of this.marketQueue.splice(0))job.reject(Error('Connection was disconnected'));this.initializing=null;this.pending=null;this.sessionId=null;this.initialized=false;this.forgetAuthorization();}
}
