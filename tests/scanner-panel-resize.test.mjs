import test from 'node:test';
import assert from 'node:assert/strict';
import {SCANNER_HEIGHT_KEY,scannerPanelHeights} from '../modules/scanner-panel-resize.mjs';

test('Scanner heights are independent, bounded and restored from browser storage',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},sizes=scannerPanelHeights(storage);
 assert.equal(sizes.get('movers'),384);sizes.set('movers',522);assert.equal(sizes.get('inPlay'),384);
 sizes.set('inPlay',-10);assert.equal(sizes.get('inPlay'),160);sizes.set('movers',99999);assert.equal(sizes.get('movers'),1200);
 const restored=scannerPanelHeights(storage);assert.equal(restored.get('movers'),1200);assert.equal(restored.get('inPlay'),160);
 assert.deepEqual(Object.keys(JSON.parse(values.get(SCANNER_HEIGHT_KEY))),['movers','inPlay']);
});
test('Scanner height preferences tolerate invalid and unavailable storage',()=>{
 for(const value of ['null','[]','bad','{"movers":"900","inPlay":800}']){
  const sizes=scannerPanelHeights({getItem:()=>value});assert.equal(sizes.get('movers'),384);
 }
 const sizes=scannerPanelHeights({getItem(){throw Error('Unavailable');},setItem(){throw Error('Full');}});sizes.set('movers',490);assert.equal(sizes.get('movers'),490);
});
