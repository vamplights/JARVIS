// Lossless disk normalization: frozen settings occur once, not once per signal.
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
const cache=new WeakMap(),packed=new WeakMap();
const frozenFields=['engineSnapshot','paperSnapshot','optionPlans'];
function pack(value,field){if(!value||typeof value!=='object')return value;const version=field==='optionPlans'?Object.keys(value).join('|'):value.status,prior=packed.get(value);if(prior?.version===version)return prior.encoded;const encoded={$gzipJSON:gzipSync(JSON.stringify(value),{level:1}).toString('base64')};packed.set(value,{version,encoded});return encoded;}
function unpack(value){return value?.$gzipJSON?JSON.parse(gunzipSync(Buffer.from(value.$gzipJSON,'base64'),{maxOutputLength:32*1024*1024}).toString('utf8')):value;}

const frozen=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;};
function reference(settings){let found=cache.get(settings);if(!found){const text=JSON.stringify(settings);found={key:createHash('sha256').update(text).digest('hex'),settings:frozen(settings)};cache.set(settings,found);}return found;}
export function restoreLedger(stored){
 const {settingsPool={},storageSchema,...data}=stored,pool=new Map();
 data.signals=(data.signals||[]).map(storedRow=>{const row={...storedRow};for(const field of frozenFields)if(row[field])row[field]=unpack(row[field]);if(!row.settings)return row;let settings;if(row.settings.$settingsRef){settings=settingsPool[row.settings.$settingsRef];if(!settings)throw Error('Missing frozen settings reference');}else settings=row.settings;const ref=reference(settings);if(!pool.has(ref.key))pool.set(ref.key,frozen(settings));return {...row,settings:pool.get(ref.key)};});return data;
}
export function ledgerForStorage(data){
 const settingsPool={},signals=(data.signals||[]).map(row=>{const result={...row};for(const field of frozenFields)if(result[field])result[field]=pack(result[field],field);if(!row.settings)return result;const ref=reference(row.settings);settingsPool[ref.key]=ref.settings;return {...result,settings:{$settingsRef:ref.key}};});return {...data,signals,storageSchema:2,settingsPool};
}
