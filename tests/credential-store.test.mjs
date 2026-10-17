import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CredentialStore} from '../credential-store.mjs';
import {RobinhoodClient} from '../robinhood-client.mjs';
const origin='http://127.0.0.1:8765';
const saved=()=>({version:1,origin,clientId:'test-client',tokens:{access:'test-access',refresh:'test-refresh',expires:Date.now()-1000}});
function memory(){let data=saved();return {load:()=>structuredClone(data),save:v=>data=structuredClone(v),clear:()=>data=null};}
test('Windows encryption survives a new store instance without plaintext files; clear removes authorization', {skip:process.platform!=='win32'},()=>{
 const dir=fs.mkdtempSync(fileURLToPath(new URL('./jarvis-encryption-',import.meta.url))),file=path.join(dir,'authorization.dpapi');
 try{const s=new CredentialStore(file),v=saved();s.save(v);assert.equal(fs.readFileSync(file).includes(Buffer.from('test-refresh')),false);assert.equal(fs.readFileSync(file).includes(Buffer.from('test-access')),false);assert.deepEqual(new CredentialStore(file).load(),v);s.clear();assert.equal(s.load(),null);assert.deepEqual(fs.readdirSync(dir),[]);}finally{fs.rmSync(file,{force:true});fs.rmSync(file+'.tmp',{force:true});fs.rmdirSync(dir);}
});
test('Restored expired authorization refreshes once and persists rotated tokens',async()=>{
 const store=memory();let calls=0;const client=new RobinhoodClient({origin,store,fetcher:async(url,opts)=>{calls++;const fields=new URLSearchParams(opts.body);assert.equal(fields.get('grant_type'),'refresh_token');assert.equal(fields.get('refresh_token'),'test-refresh');return Response.json({access_token:'test-new',refresh_token:'test-rotated',token_type:'bearer',expires_in:3600});}});
 assert.equal(client.restore(),true);assert.equal(client.sessionId,null);await Promise.all([client.ensureToken(),client.ensureToken()]);assert.equal(calls,1);assert.equal(store.load().tokens.refresh,'test-rotated');const restarted=new RobinhoodClient({origin,store});assert.equal(restarted.restore(),true);assert.equal(restarted.tokens.access,'test-new');client.disconnect();assert.equal(store.load(),null);assert.equal(client.connected,false);
});
test('Revoked refresh authorization is removed; temporary failures retain it for retry',async()=>{
 for(const status of [400,401,503]){const store=memory(),client=new RobinhoodClient({origin,store,fetcher:async()=>new Response(null,{status})});client.restore();await assert.rejects(client.ensureToken());assert.equal(!!store.load(),status===503);assert.equal(client.connected,status===503);}
});
test('Disconnect during token refresh cannot resurrect saved authorization',async()=>{
 const store=memory();let finish;const client=new RobinhoodClient({origin,store,fetcher:()=>new Promise(resolve=>finish=resolve)});client.restore();const pending=client.ensureToken();client.disconnect();finish(Response.json({access_token:'late',token_type:'bearer',expires_in:3600}));await assert.rejects(pending,/disconnected/);assert.equal(store.load(),null);assert.equal(client.connected,false);
});
test('Unreadable or wrong-origin storage fails closed with a safe visible message',()=>{
 for(const store of [{load(){throw Error('PRIVATE DATA');}},{load:()=>({...saved(),origin:'http://untrusted'})}]){const c=new RobinhoodClient({origin,store});assert.equal(c.restore(),false);assert.equal(c.connected,false);assert.equal(c.storageError.includes('PRIVATE'),false);}
});
test('Encryption failure leaves sign-in usable but reports it is not remembered',async()=>{
 const c=new RobinhoodClient({origin,store:{save(){throw Error('PRIVATE');}},fetcher:async()=>Response.json({access_token:'test',token_type:'bearer',expires_in:3600})});await c.token({});assert.equal(c.connected,true);assert.equal(c.remembered,false);assert.match(c.storageError,/could not be saved/);assert.equal(c.storageError.includes('PRIVATE'),false);
});
