import {pnlTone} from './visual-settings.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number.isFinite(n)?n.toFixed(3):'—';
export function expectancyTable(groups,{pooled=false}={}){
 if(!groups?.length)return '<div class="outcome-empty"><strong>No measured outcomes yet</strong><p>Results will appear after setups resolve. Insufficient sample.</p></div>';
 return '<div class="table-wrap outcome-table"><table><thead><tr>'+['Strategy / context','n','Win rate','Average R after costs','Profit factor','95% bootstrap CI','Sample'].map(c=>'<th>'+escape(c)+'</th>').join('')+'</tr></thead><tbody>'+groups.map(g=>{
 const context=pooled?[['Symbols',(g.symbols||[]).join(', ')]]:[['Direction',g.direction],['Regime',g.regime],['ET hour',String(g.etHour).padStart(2,'0')+':00'],['Cohort',g.cohort],['Target',g.targetCapped?'capped':'uncapped']];
 return '<tr><td><strong>'+escape(g.strategy)+'</strong><div class="outcome-context">'+escape(g.market)+' · '+escape(g.tf>=1440?'Daily':g.tf>=60?g.tf/60+'h':g.tf+'m')+'</div><details class="outcome-details"><summary>Context'+(pooled?' & symbols':'')+'</summary><dl>'+context.map(([label,value])=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(value)+'</dd></div>').join('')+'</dl></details></td><td>'+g.n+'</td><td>'+(g.winRate==null?'—':(100*g.winRate).toFixed(1)+'%')+'</td><td class="'+pnlTone(g.avgR)+'"><strong>'+number(g.avgR)+'</strong></td><td>'+number(g.profitFactor)+'</td><td class="outcome-ci">'+(g.ci95?g.ci95.map(number).join(' to '):'—')+'</td><td><span class="sample-chip '+(g.n<100?'sample-pending':'')+'">'+escape(g.sample)+'</span></td></tr>';}).join('')+'</tbody></table></div>';
}
