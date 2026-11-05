/* Upgrade details show the remaining budget in its own currencies. */
const ClashDetailUI=(()=>{
  const oreNames=['Блестящая руда','Светящаяся руда','Звёздная руда'];
  const oreFiles=['shiny-ore','glowy-ore','starry-ore'];
  const number=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
  function render(row,ctx){
    const {esc,name,art,duration}=ctx;
    const resourceNames={...ctx.resourceNames,'Gold or Elixir':'Золото или эликсир','Builder Gold or Builder Elixir':'Золото или эликсир строителя','Gems':'Кристаллы'};
    const title=name(row),equipment=row.group==='equipment';
    const instant=equipment||row.d?.category==='wall'||(row.supported&&row.time===0);
    const money=(value,resource)=>`<b>${number.format(value)}</b><span>${esc(resourceNames[resource]||resource)}</span>`;
    const ore=(value,index,withLabel=true)=>`<span class="detail-ore detail-ore-${index}"><img src="assets/${oreFiles[index]}.png" alt="${withLabel?'':oreNames[index]}" width="23" height="23"><b>${number.format(value||0)}</b>${withLabel?`<small>${oreNames[index]}</small>`:''}</span>`;
    const prices=Object.entries(row.costs||{});
    const count=row.count>1?`<span class="detail-count">×${row.count}</span>`:'';
    const perItem=row.count>1?' · за 1 шт.':'';
    const budget=equipment
      ?`<div class="detail-budget"><div class="detail-budget-label">Руда до цели${perItem}</div><div class="detail-ore-totals">${oreNames.map((_,index)=>ore(row.ore?.[index],index)).join('')}</div></div>`
      :prices.length?`<div class="detail-budget"><div class="detail-budget-label">Базовая стоимость до цели${perItem}</div><div class="detail-resource-totals">${prices.map(([resource,value])=>`<div>${money(value,resource)}</div>`).join('')}</div></div>`:'';
    const table=equipment
      ?`<table class="upgrade-table equipment-upgrade-table"><thead><tr><th scope="col">Уровень</th>${oreNames.map((label,index)=>`<th scope="col"><img src="assets/${oreFiles[index]}.png" alt="" width="19" height="19"><span>${label.replace(' руда','')}</span></th>`).join('')}</tr></thead><tbody>${row.levels.map(level=>`<tr><th scope="row">${level.level}</th>${oreNames.map((_,index)=>`<td class="detail-ore-value ore-value-${index}">${level.ore?.[index]?number.format(level.ore[index]):'—'}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="4" class="detail-complete">Максимум выбранной цели достигнут ✓</td></tr>'}</tbody></table>`
      :`<table class="upgrade-table"><thead><tr><th scope="col">Уровень</th><th scope="col">Базовая стоимость</th>${instant?'':'<th scope="col">Время с Gold Pass</th>'}</tr></thead><tbody>${row.levels.map((level,index)=>`<tr><th scope="row">${level.level}</th><td>${number.format(level.cost||0)} ${esc(resourceNames[level.resource]||level.resource||'')}</td>${instant?'':`<td>${row.end!==null&&index===0?'Осталось: ':''}${duration(row.tasks[index])}</td>`}</tr>`).join('')||`<tr><td colspan="${instant?2:3}" class="detail-complete">Максимум выбранной цели достигнут ✓</td></tr>`}</tbody></table>`;
    return`<div class="dialog-head"><div><div class="eyebrow">${esc(row.label)}</div><h2>${esc(title)} ${count}</h2></div><button id="detail-close" aria-label="Закрыть">×</button></div>
      <div class="detail-object${equipment?' detail-object-equipment':''}"><div class="detail-art">${art(row)}</div><div class="detail-level-block"><div class="detail-summary"><div>Сейчас<strong>${row.level??'Модули'}</strong></div><div>Цель<strong>${row.supported?row.max:'?'}</strong></div>${!instant?`<div>До цели${perItem}<strong>${row.modeled?(row.done?'Максимум':duration(row.time)):'Нет данных'}</strong></div>`:''}</div>${row.supported?budget:''}</div></div>
      ${row.end&&!instant?`<p class="note">${row.expired?'Таймер истёк. Обнови JSON для подтверждения уровня.':'Текущее улучшение: '+duration((row.end-Date.now())/1000)+' осталось.'}</p>`:''}
      ${row.supported?table:'<p class="note">Расчёт стоимости для выбранной цели пока недоступен.</p>'}`;
  }
  return{render};
})();
if(typeof window!=='undefined')window.ClashDetailUI=ClashDetailUI;
if(typeof module!=='undefined')module.exports=ClashDetailUI;
