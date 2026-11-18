import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('A deferred save failure stays pending without crashing and can be retried',()=>{
 const moduleUrl=new URL('../modules/deferred-save.mjs',import.meta.url).href;
 const script=`import assert from 'node:assert/strict';
 import {saveDeferred,flushDeferred} from ${JSON.stringify(moduleUrl)};
 let writes=0;const owner={lastSaved:Date.now(),save(){if(++writes===1)throw Error('simulated disk failure');return true;}};
 saveDeferred(owner,10,true);
 setTimeout(()=>{assert.equal(writes,1);assert.equal(owner.dirty,true);assert.ok(owner.saveTimer);flushDeferred(owner);assert.equal(writes,2);assert.equal(owner.dirty,false);assert.equal(owner.saveTimer,null);},60);`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:5000,windowsHide:true});
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.match(result.stderr,/Deferred save failed: simulated disk failure/);
});
