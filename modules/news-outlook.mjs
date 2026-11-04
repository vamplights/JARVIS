// Local headline/sector-impact estimates. Fixed transparent rules, never fitted
// to holdouts and never passed off as a calibrated trading probability.
export const NEWS_OUTLOOK_VERSION='headline-outlook-v1';
export const NEWS_HORIZONS=[{sessions:1,label:'Next trading session'},{sessions:5,label:'1 week · 5 sessions'},{sessions:21,label:'1 month · 21 sessions'}];
const DAY=86400000;
const MAX_NEWS_EVENTS=12; // Bound repeated theme coverage and stored explanations.
const rules=[
 ['Raised outlook',/\b(?:rais\w*|boost\w*|lift\w*|increas\w*)\b.{0,30}\b(?:guidance|outlook|forecast)\b/i,1.2,21],
 ['Lowered outlook',/\b(?:cut\w*|lower\w*|slash\w*|reduc\w*)\b.{0,30}\b(?:guidance|outlook|forecast)\b/i,-1.2,21],
 ['Earnings beat',/\b(?:beat\w*|top\w*|exceed\w*)\b.{0,30}\b(?:earnings|eps|revenue|profit|estimates|expectations)\b|\b(?:earnings|eps|revenue|profit)\b.{0,25}\b(?:beat\w*|above expectations)\b/i,1,5],
 ['Earnings miss',/\b(?:miss\w*|below)\b.{0,25}\b(?:earnings|eps|revenue|profit|estimates|expectations)\b|\b(?:earnings|eps|revenue|profit)\b.{0,25}\b(?:miss\w*|below expectations)\b/i,-1,5],
 ['Analyst upgrade',/\bupgrad\w*\b|\bprice target\b.{0,15}\b(?:rais\w*|lift\w*)\b/i,.55,1],
 ['Analyst downgrade',/\bdowngrad\w*\b|\bprice target\b.{0,15}\b(?:cut|lower\w*)\b/i,-.55,1],
 ['New contract or approval',/\b(?:wins?|awarded)\b.{0,25}\bcontract\b|\b(?:fda|regulatory)\b.{0,25}\bapprov\w*\b/i,.85,21],
 ['Buyback or dividend increase',/\b(?:announc\w*|authoriz\w*|expand\w*)\b.{0,25}\bbuyback\b|\b(?:rais\w*|increas\w*)\b.{0,15}\bdividend\b/i,.65,21],
 ['Company legal or regulatory pressure',/\b(?:faces?|under)\b.{0,25}\b(?:investigation|probe|lawsuit)\b|\b(?:antitrust probe|recall|data breach|bankruptcy)\b/i,-.85,21],
 ['Dividend reduction',/\b(?:cuts?|suspend\w*|reduc\w*)\b.{0,15}\bdividend\b/i,-.8,21]
];
const titleKey=t=>String(t).toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.origin+u.pathname:null;}catch{return null;}};
const fresh=(n,now)=>n&&typeof n.title==='string'&&Number.isFinite(n.publishedAt)&&n.publishedAt<=now&&now-n.publishedAt<=DAY&&(!Number.isFinite(n.receivedAt)||n.receivedAt<=now);
function related(a,b){const x=new Set(titleKey(a).split(' ').filter(w=>w.length>3)),y=new Set(titleKey(b).split(' ').filter(w=>w.length>3)),overlap=[...x].filter(w=>y.has(w)).length;return x.size>=4&&y.size>=4&&overlap/Math.max(x.size,y.size)>=.75;}
export function analyzeNewsOutlook(idea,now=Date.now()){
 const events=[],sources=new Set(),add=(n,theme=null)=>{if(!fresh(n,now))return;const url=safeURL(n.url),key=titleKey(n.title),old=events.find(e=>e.key===key||url&&e.url===url||related(e.title,n.title));let event=old;if(!event){event={key,url,title:n.title,publishedAt:n.publishedAt,source:String(n.publisher||n.source||n.feed||'Public headline'),publishers:new Set(),direct:false,themes:[]};events.push(event);}event.publishers.add(String(n.publisher||n.source||n.feed||'Public headline'));if(theme&&!event.themes.some(t=>t.theme===theme.theme&&t.direction===theme.direction))event.themes.push(theme);if(!theme)event.direct=true;};
 for(const n of idea.headlines||[])add(n);for(const theme of idea.themes||[])if(['helps','hurts'].includes(theme.direction))add(theme.headline,theme);
 events.sort((a,b)=>b.publishedAt-a.publishedAt);events.splice(MAX_NEWS_EVENTS);for(const e of events)for(const publisher of e.publishers)sources.add(publisher);
 const factors=[];
 for(const event of events){let matches=[];
  if(event.direct)for(const [label,pattern,weight,duration]of rules){const m=pattern.exec(event.title);if(!m)continue;const before=event.title.slice(Math.max(0,m.index-35),m.index);if(/\b(?:no|not|denies?|denied|avoids?|unlikely)\b/i.test(before))continue;matches.push({label,weight,duration});}
  // A broad theme is secondary evidence; do not count the same company story twice.
  if(!matches.length)matches=event.themes.map(t=>({label:t.theme+' · possible '+t.direction,weight:t.direction==='helps'?.35:-.35,duration:5}));
  const speculative=/\?|\b(?:may|might|could|rumou?r|considering|reportedly)\b/i.test(event.title)?.5:1;
  for(const m of matches)factors.push({...m,weight:m.weight*speculative,event:event.key,headline:event.title,url:event.url,source:event.source,publishedAt:event.publishedAt,direction:m.weight>0?'up':'down'});
 }
 const forecasts=NEWS_HORIZONS.map(h=>{const grouped=new Map();for(const f of factors){const age=Math.exp(-(now-f.publishedAt)/(36*3600000)),retention=h.sessions<=f.duration?1:Math.exp(-(h.sessions-f.duration)/(f.duration+3));grouped.set(f.event,(grouped.get(f.event)||0)+f.weight*age*retention);}const score=[...grouped.values()].reduce((n,v)=>n+Math.max(-1.5,Math.min(1.5,v)),0)/Math.sqrt(Math.max(1,grouped.size)),probability=Math.max(.2,Math.min(.8,1/(1+Math.exp(-.85*score)))),upPct=Math.round(100*probability);return {...h,upPct,downPct:100-upPct,lean:upPct>=55?'Leans up':upPct<=45?'Leans down':'Mixed / neutral'};});
 return {version:NEWS_OUTLOOK_VERSION,asOf:now,referencePrice:Number.isFinite(idea.price)&&Number.isFinite(idea.asOf)&&idea.asOf<=now?idea.price:null,referenceAt:Number.isFinite(idea.asOf)&&idea.asOf<=now?idea.asOf:null,status:factors.length?'preliminary':'no directional evidence',headlineCount:events.length,sourceCount:sources.size,factors:factors.sort((a,b)=>Math.abs(b.weight)-Math.abs(a.weight)).slice(0,8),forecasts,note:factors.length?'Headline-based estimate; uncalibrated. Direction is price up/down from the reference price, not trade profit.':'No directional headline evidence: 50% / 50% is a neutral starting point, not a learned prediction.'};
}
