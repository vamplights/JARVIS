import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function harness({id='',reject=false}={}){
 const values={id,time:'2026-10-19T07:00',closedAt:'',market:'stocks',symbol:'SPY',decision:'taken',strategy:'manual',plannedEntry:'',stop:'',entry:'100',exit:'',size:'1',plannedRisk:'15',pnl:'',contractMultiplier:'',reasonCode:'followed-plan',notes:'',reference:'',signalId:'',exitScenario:''},error={hidden:true,textContent:''},button={disabled:false},calls=[];
 // Real HTML forms expose named controls before their DOM properties: name=id masks form.id.
 const form={id:{name:'id',value:id},getAttribute:n=>n==='id'?'trade-form':null,querySelector:s=>s==='[type="submit"]'?button:error};
 class Data{entries(){return Object.entries(values);}get(k){return values[k]??null;}has(k){return k in values;}}
 const start=source.indexOf("document.addEventListener('submit',async"),end=source.indexOf('\n',source.indexOf('finally{busy=false;',start));let submit;
 new Function('document','FormData','api','$','toast','refresh','let busy=false;'+source.slice(start,end))({addEventListener:(name,fn)=>submit=fn},Data,async(path,j)=>{calls.push({path,j});if(reject)throw Error('Enter a close time with realized P/L');},()=>({close(){calls.push('closed');}}),text=>calls.push(text),async()=>calls.push('refreshed'));
 return {submit:()=>submit({target:form,preventDefault(){}}),calls,error,button};
}
test('Journal Save posts a new record even when the hidden id control shadows form.id',async()=>{const h=harness();await h.submit();assert.equal(h.calls[0].path,'/api/journal');assert.equal(h.calls[0].j.symbol,'SPY');assert.equal(h.calls[0].j.entry,100);assert.equal(h.calls[0].j.pnl,null);assert.equal(h.calls[0].j.closedAt,null);assert.equal('id' in h.calls[0].j,false);assert.ok(h.calls.includes('closed'));assert.ok(h.calls.includes('refreshed'));assert.equal(h.button.disabled,false);});
test('Journal edits preserve the existing record id',async()=>{const h=harness({id:'existing-record'});await h.submit();assert.equal(h.calls[0].j.id,'existing-record');});
test('Journal failures stay visible inside the open dialog and Save can be retried',async()=>{const h=harness({reject:true});await h.submit();assert.equal(h.error.hidden,false);assert.match(h.error.textContent,/close time/);assert.equal(h.calls.includes('closed'),false);assert.equal(h.button.disabled,false);await h.submit();assert.equal(h.calls.length,2);});
