// Training compatibility is narrower than paper-account/report identity. Never rewrite source cohorts.
import {createHash} from 'node:crypto';
import {migrateBetaSettings} from './engine.mjs';
import {settingsProfile} from './stats.mjs';
import {collectModelSamples} from './trend-model.mjs';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,canonical(v[k])])):v;
export function learningProfile(settings){
 const s={...migrateBetaSettings(settings)};
 // Universe/display choices do not change a recorded setup's entry, costs or exit rules.
 for(const k of ['stocks','crypto','signalsWatchlistOnly'])delete s[k];
 return createHash('sha256').update('learning-compatibility-v1:'+settingsProfile(canonical(s))).digest('hex').slice(0,20);
}
export function compatibleProfiles(settings,evidence=[]){
 const target=learningProfile(settings),profiles=new Set([settingsProfile(settings)]),verified=new Set();
 for(const row of evidence){if(!row?.settings||typeof row.profile!=='string'||profiles.has(row.profile)||verified.has(row.profile))continue;try{if(settingsProfile(row.settings)===row.profile){verified.add(row.profile);if(learningProfile(row.settings)===target)profiles.add(row.profile);}}catch{/* Unverifiable old snapshots stay separate. */}}
 return profiles;
}
export function compatibleSamples(runs,observations,settings,evidence=[],now=Date.now()){
 const profile=settingsProfile(settings),accepted=compatibleProfiles(settings,evidence),adapt=rows=>(rows||[]).filter(r=>accepted.has(r.profile)).map(r=>({...r,originalProfile:r.profile,profile}));
 return collectModelSamples(adapt(runs),adapt(observations),profile,settings.includeFallbackTraining).filter(r=>r.closedAt<=now);
}
