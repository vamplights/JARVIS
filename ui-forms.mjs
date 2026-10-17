// Presentation-only helpers. Existing input names and save/validation paths remain authoritative.
export const SETTINGS_GROUPS=[
 ['basics','Basics & schedule','Appearance, watchlists and trading hours'],
 ['risk','Account, costs & limits','Risk budgets, fees, liquidity and event windows'],
 ['signals','Signals & strategies','Radar filters, Top Picks and individual strategy controls'],
 ['paper','Paper trading','Confirmed-signal forward test and target'],
 ['data','Data, news & learning','Public sources, history, model review and recovery'],
 ['alerts','Notifications','Sounds, visual alerts, quiet hours and thresholds']
];
export function settingsGroupFor(title){
 if(['Appearance','Watchlists & chart intervals','Schedule & trading-day reset'].includes(title))return 'basics';
 if(['Capital & risk limits','No-trade events & options costs','Crypto venue & fees'].includes(title))return 'risk';
 if(['Signals & Top Picks','Setup quality filters','Individual strategy controls','Stocks in play & daily strategies'].includes(title))return 'signals';
 if(title==='Automatic paper settings')return 'paper';
 if(['Profit model & daily review','Sources & recovery'].includes(title))return 'data';
 if(['High-quality browser alerts','Top Pick notifications'].includes(title))return 'alerts';
 return 'signals';
}
export function betaFieldGroup(name){if(['cryptoFrames'].includes(name))return 'basics';if(name==='cryptoVenue')return 'risk';if(['forwardExitMode'].includes(name))return 'paper';if(['entryOrder','exitStyles','trailingATR'].includes(name))return 'signals';if(name.startsWith('scanner.')||name.startsWith('service.'))return 'data';return 'signals';}

export function organizeSettings(root,strategyIds=[]){
 const form=root.querySelector('#settings-form');if(!form||form.dataset.organized)return;form.dataset.organized='true';const doc=form.ownerDocument;
 const panels=[...form.querySelectorAll('.panel')],title=panel=>panel.querySelector('h2')?.textContent.trim();
 // Put each strategy's enable switch, shared frames and parameters together.
 const active=panels.find(p=>title(p)==='Active strategy variations'),individual=panels.find(p=>title(p)==='Individual strategy controls');
 if(active&&individual){for(const id of strategyIds){const enabled=active.querySelector('[name="strategy-'+id+'"]')?.closest('label'),frames=active.querySelector('[name="strategyFrames.'+id+'"]')?.closest('label'),details=individual.querySelector('[name="strategyMarketFrames.stocks.'+id+'"]')?.closest('details');if(!enabled||!frames||!details)continue;const controls=details.querySelector('.form-grid');controls.prepend(enabled);const shared=doc.createElement('details');shared.className='shared-frame-settings';const summary=doc.createElement('summary');summary.textContent='Shared fallback timeframes';shared.append(summary,frames);details.append(shared);}
  if(!active.querySelector('input,select,textarea')){for(const note of active.querySelectorAll('p'))individual.querySelector('.panel-body')?.append(note);active.remove();}
 }
 const generated=[];
 const makePanel=(heading,group)=>{const section=doc.createElement('section');section.className='panel';section.innerHTML='<div class="panel-head"><h2>'+heading+'</h2></div><div class="panel-body form-grid"></div>';section.dataset.settingsGroup=group;generated.push(section);return section;};
 const beta=panels.find(p=>title(p)==='Strategies & local research');
 if(beta){const buckets={basics:makePanel('Crypto signal intervals','basics'),risk:makePanel('Crypto venue & fees','risk'),paper:makePanel('Automatic paper settings','paper'),signals:makePanel('Stocks in play & daily strategies','signals'),data:makePanel('Sources & recovery','data')};
  for(const field of [...beta.querySelectorAll('.panel-body > label')]){const name=field.querySelector('[name]')?.name;if(name)buckets[betaFieldGroup(name)].querySelector('.panel-body').append(field);}
  for(const note of [...beta.querySelectorAll('.notice')])buckets.risk.querySelector('.panel-body').append(note);
  const note=doc.createElement('p');note.className='note full';note.textContent='Automatic forward test: every fresh confirmed signal is recorded, regardless of confidence, including enabled 1m. Fills and exits use closed 1-minute candles; stops are checked before targets. Stocks close at the session end; crypto after four hours. Results feed learning. All signals and Realistic account remain available; manual paper trades stay in their own tab. Each cohort retains the latest 3,000 forward tests.';buckets.paper.querySelector('.panel-body').append(note);
  if(!beta.querySelector('input,select,textarea'))beta.remove(); // Preserve any future controls until explicitly classified.
 }
 const groups=new Map();for(const [id,label,note]of SETTINGS_GROUPS){const details=doc.createElement('details');details.className='panel settings-category';details.id='settings-group-'+id;details.open=false;const summary=doc.createElement('summary'),text=doc.createElement('span'),strong=doc.createElement('strong'),small=doc.createElement('small');strong.textContent=label;small.textContent=note;text.append(strong,small);summary.append(text);const body=doc.createElement('div');body.className='settings-category-body';details.append(summary,body);groups.set(id,{details,body});}
 for(const panel of [...panels,...generated]){if(!panel.isConnected&&!generated.includes(panel))continue;const group=groups.get(panel.dataset.settingsGroup||settingsGroupFor(title(panel)));panel.classList.remove('panel');panel.classList.add('settings-subsection');const heading=panel.querySelector('h2');if(heading){const h3=doc.createElement('h3');h3.textContent=heading.textContent;heading.replaceWith(h3);}group.body.append(panel);}
 const actions=form.querySelector(':scope > .form-actions');for(const {details,body}of groups.values())if(body.childElementCount)form.insertBefore(details,actions);
 for(const wrapper of [...form.querySelectorAll(':scope > .two-col')])if(!wrapper.querySelector('input,select,textarea'))wrapper.remove();
 if(actions)actions.classList.add('settings-save-bar');
}

export function sessionStatusBadge(session={},esc=String){const label=!session.known?'CALENDAR UNVERIFIED':session.stocks?'US STOCK SESSION':session.crypto?'CRYPTO SESSION':'ENTRY WINDOW CLOSED';return '<span class="badge cyan session-status" title="'+esc(session.label||'Current entry schedule')+'">'+label+'</span>';}
export function readOnlyStatus(){return '<span class="badge read-only-status" tabindex="0" title="JARVIS never sends real broker orders. Settings, journal records and paper simulations can still be saved." aria-label="Read only: no real broker orders">READ ONLY</span>';}

export function manualTradeForm(j={},options={}){
 const {field,select,esc,localInput,market='crypto',symbol='',timezone='',riskNotice=''}=options;
 return '<p class="journal-form-intro">Record a trade you placed yourself, or an idea you skipped. This journal does not place orders. Times use '+esc(timezone)+'.</p>'+riskNotice+'<form id="trade-form"><input type="hidden" name="id" value="'+esc(j.id||'')+'">'+
 '<fieldset class="journal-form-group"><legend>1 · Trade details</legend><div class="form-grid">'+select('Market','market',[['stocks','Stocks'],['crypto','Crypto'],['options','Options']],j.market||market)+field('Symbol / pair / option description','symbol',j.symbol||symbol,'text','','required maxlength="40"')+field('Entry / decision time','time',localInput(j.time),'datetime-local','','required')+select('Decision','decision',[['taken','Taken · I entered this trade'],['skipped','Skipped · record the idea only']],j.decision||'taken')+'</div></fieldset>'+
 '<fieldset class="journal-form-group"><legend>2 · Execution</legend><p class="note">Enter your actual fill and quantity when available.</p><div class="form-grid">'+field('Entry / fill price','entry',j.entry)+field('Shares, units or contracts','size',j.size)+'<div class="option-multiplier-field">'+field('Verified option multiplier','contractMultiplier',j.contractMultiplier,'number','Options only. Use the contract specification.')+'</div></div></fieldset>'+
 '<details class="journal-form-details" '+(j.closedAt||j.pnl!=null?'open':'')+'><summary>Closing results <span>Optional · leave empty while the trade is open</span></summary><div class="form-grid">'+field('Exit / fill price','exit',j.exit)+field('Close time','closedAt',j.closedAt?localInput(j.closedAt):'','datetime-local')+field('Net realized P/L ($)','pnl',j.pnl,'number','After fees. Losses use a minus sign. A close time is required with P/L.')+'</div></details>'+
 '<details class="journal-form-details"><summary>Plan & context <span>Strategy, planned prices and reason</span></summary><div class="form-grid">'+field('Strategy','strategy',j.strategy||'manual','text')+field('Planned risk ($)','plannedRisk',j.plannedRisk??0)+field('Planned entry','plannedEntry',j.plannedEntry)+field('Planned stop','stop',j.stop)+field('Planned exit scenario','exitScenario',j.exitScenario,'text')+select('Reason','reasonCode',[['followed-plan','Followed the plan'],['skipped','Skipped the setup'],['early-exit','Exited early'],['late-entry','Entered late'],['risk-limit','Exceeded risk limit'],['not-alerted','Trade without alert'],['data-unavailable','Data was unavailable'],['other','Other — explain in notes']],j.reasonCode||'followed-plan')+'</div></details>'+
 '<label class="field journal-notes">Notes<textarea name="notes" rows="3" placeholder="What went well, what changed, or why you skipped…">'+esc(j.notes||'')+'</textarea></label><details class="journal-form-details"><summary>References <span>Optional signal ID and chart link</span></summary><div class="form-grid">'+field('Signal ID','signalId',j.signalId||'','text')+field('Screenshot / chart reference','reference',j.reference,'text','Saved as text; nothing is uploaded.')+'</div></details><p class="note">Taken trades update journal risk counters. Closing P/L determines the outcome; a loss lockout stays in place until the daily reset.</p><div class="form-actions journal-submit"><button type="button" data-action="close-dialog">Cancel</button><button type="submit" class="primary">Save manual record</button></div></form>';
}
export function updateManualTradeFields(form){if(!form)return;const wrapper=form.querySelector('.option-multiplier-field');if(wrapper)wrapper.hidden=form.elements.market.value!=='options';}
