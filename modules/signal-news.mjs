// Presentation context only. Never used by signal gates, sizing or model features.
const DAY=86400000;
const bull=/\b(beat|beats|surge|surges|soar|soars|rally|rallies|upgrade|upgraded|buyback|raises guidance|raised guidance|approval|approved|gains|climbs|higher|inflows|rebound|strong demand)\b/gi;
const bear=/\b(miss|misses|plunge|plunges|fall|falls|drop|drops|downgrade|downgraded|lawsuit|cuts guidance|recall|outflows|hack|hacked|crash|weak|decline|lower|bankruptcy|fraud|layoffs)\b/gi;
export function signalNewsSummary(signal,news,now=Date.now()){
 const valid=(news?.items||signal.headlines||[]).filter(n=>(!n.kind||n.kind==='Headline')&&Number.isFinite(n.publishedAt)&&n.publishedAt<=now&&now-n.publishedAt<=3*DAY);
 const unique=[...new Map(valid.map(n=>[String(n.title).toLowerCase().replace(/\s+/g,' ').trim(),n])).values()].sort((a,b)=>b.publishedAt-a.publishedAt);
 let items=unique.filter(n=>now-n.publishedAt<=DAY),window='24h';if(items.length<2){items=unique;window='3d';}
 const scored=items.map(n=>{const up=(String(n.title).match(bull)||[]).length,down=(String(n.title).match(bear)||[]).length;return {...n,tone:Math.sign(up-down)};}),up=scored.filter(n=>n.tone>0).length,down=scored.filter(n=>n.tone<0).length;
 const stale=!!news?.retained||Number.isFinite(news?.checkedAt)&&now-news.checkedAt>=3600000;
 const lean=up-down>=2&&up>=1.5*Math.max(1,down)?1:down-up>=2&&down>=1.5*Math.max(1,up)?-1:0;
 const state=stale?'unavailable':!items.length?(news?.error?'unavailable':news?'none':'loading'):!lean?'mixed':lean===signal.dir?'agrees':'conflicts';
 return {state,items:scored,up,down,window,checkedAt:news?.checkedAt};
}
export function signalNewsHTML(signal,news,{esc,date,now=Date.now(),compact=false}){
 const n=signalNewsSummary(signal,news,now),labels={agrees:'News agrees',conflicts:'News conflicts',mixed:'News mixed',none:'No recent news',loading:'Checking news…',unavailable:'News unavailable'},tone=n.state==='agrees'?'good':n.state==='conflicts'?'bad':'';
 const links=(n.items.length?n.items:!news?(signal.headlines||[]):[]).slice(0,compact?1:6).map(item=>{let url;try{url=new URL(item.url);if(!['https:','http:'].includes(url.protocol))return '';}catch{return '';}return '<a href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer">'+esc(item.title)+'</a><small>'+esc(item.publisher||item.source||item.feed||'Public headline')+' · '+date(item.publishedAt)+'</small>';}).filter(Boolean);
 return '<div class="signal-news '+(compact?'compact':'')+'"><div class="signal-news-heading"><b class="badge '+tone+'">'+labels[n.state]+'</b>'+(n.items.length?'<span>'+n.up+' positive · '+n.down+' negative · '+n.window+'</span>':'')+'</div>'+links.map(l=>'<div class="signal-headline">'+l+'</div>').join('')+(!compact?'<p class="note">Headline wording compared with this '+(signal.dir>0?'bullish':'bearish')+' setup. Keyword context only; does not change the signal or confidence estimate.'+(n.checkedAt?' Checked '+date(n.checkedAt)+'.':'')+'</p>':'')+'</div>';
}
