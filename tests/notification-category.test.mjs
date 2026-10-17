import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationCategory} from '../signal-view.mjs';
test('Notification headers classify crypto, stock and actual option plans',()=>{
 assert.equal(notificationCategory({market:'crypto',symbol:'BTC-USD'}),'Crypto');
 assert.equal(notificationCategory({market:'stocks',symbol:'SPY'}),'Stock');
 assert.equal(notificationCategory({market:'options',symbol:'SPY CALL'}),'Option');
 assert.equal(notificationCategory({market:'stocks',optionPlan:{contract:{id:'contract'}}}),'Option');
 assert.equal(notificationCategory({market:'stocks',optionPlan:{contract:null,expiration:'2026-10-30'}}),'Stock');
});
test('Saved notification categories stay frozen and legacy crypto notices retain a useful header',()=>{
 assert.equal(notificationCategory({category:'Option',market:'stocks'}),'Option');
 assert.equal(notificationCategory({title:'ETH-USD · Bullish'}),'Crypto');
 assert.equal(notificationCategory({title:'SPY · Bearish'}),'Stock');
 assert.equal(notificationCategory({category:'<script>'}),'Stock');
});
