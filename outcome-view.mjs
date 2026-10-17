const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number.isFinite(n)?n.toFixed(3):'—';
export function expectancyTable(groups,{pooled=false}={}){
 if(!groups?.length)return '<p class="note">No measured outcomes yet. Insufficient sample.</p>';
 const columns=pooled?['Market','Strategy','TF','Symbols']:['Market','Strategy','TF','Direction','Regime','ET hour','Cohort','Target'];
 return '<div class="table-wrap"><table><thead><tr>'+columns.concat(['n','Win rate','Average R after costs','Profit factor','95% bootstrap CI','Sample']).map(c=>'<th>'+escape(c)+'</th>').join('')+'</tr></thead><tbody>'+groups.map(g=>{const fields=pooled?[g.market,g.strategy,g.tf+'m',g.symbols.join(', ')]:[g.market,g.strategy,g.tf+'m',g.direction,g.regime,String(g.etHour).padStart(2,'0')+':00',g.cohort,g.targetCapped?'capped':'uncapped'];return '<tr>'+fields.map(v=>'<td>'+escape(v)+'</td>').join('')+'<td>'+g.n+'</td><td>'+(g.winRate===null?'—':(100*g.winRate).toFixed(1)+'%')+'</td><td>'+number(g.avgR)+'</td><td>'+number(g.profitFactor)+'</td><td>'+(g.ci95?g.ci95.map(number).join(' to '):'—')+'</td><td>'+escape(g.sample)+'</td></tr>';}).join('')+'</tbody></table></div>';
}
