import test from 'node:test';
import assert from 'node:assert/strict';
import {cryptoVenueName,cryptoVenueFields,applyCryptoVenuePreset} from '../ui-forms.mjs';
import {DEFAULTS} from '../engine.mjs';
import {validateSettings} from '../settings.mjs';
import {settingsProfile} from '../stats.mjs';
test('Crypto dropdown supports both venues and legacy names without changing saved fees',()=>{
 const s={cryptoVenue:'Coinbase Advanced',costs:{crypto:{feeBps:37}}};
 const html=cryptoVenueFields(s,(label,name,choices,value)=>JSON.stringify({label,name,choices,value}));
 assert.match(html,/Robinhood/);assert.match(html,/Coinbase/);assert.match(html,/blockchain transfer fees/);assert.equal(s.costs.crypto.feeBps,37);
 assert.equal(cryptoVenueName('Coinbase Advanced'),'Coinbase');assert.equal(cryptoVenueName('Set your venue'),'');
});
test('Venue selection fills editable cost inputs; clearing selection preserves costs',()=>{
 const elements={cryptoVenue:{value:'Coinbase'},...Object.fromEntries(['feeBps','slippageBps','spreadBps'].map(k=>['costs.crypto.'+k,{value:'17'}]))};
 assert.equal(applyCryptoVenuePreset({elements}),true);assert.equal(elements['costs.crypto.feeBps'].value,'90');
 elements.cryptoVenue.value='Robinhood';applyCryptoVenuePreset({elements});assert.equal(elements['costs.crypto.feeBps'].value,'0');assert.equal(elements['costs.crypto.spreadBps'].value,'190');
 elements.cryptoVenue.value='';assert.equal(applyCryptoVenuePreset({elements}),false);assert.equal(elements['costs.crypto.spreadBps'].value,'190');
 const s=validateSettings({cryptoVenue:'Robinhood',costs:{crypto:{feeBps:0,slippageBps:3,spreadBps:190}}},DEFAULTS);assert.notEqual(settingsProfile(s),settingsProfile(DEFAULTS));
});
