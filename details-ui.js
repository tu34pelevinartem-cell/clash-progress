/* Upgrade details show the remaining budget in its own currencies. */
const ClashDetailUI=(()=>{
  const oreNames=['Блестящая руда','Светящаяся руда','Звёздная руда'];
  const oreFiles=['shiny-ore','glowy-ore','starry-ore'];
  const number=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
  function render(row,ctx){
    const {esc,name,art,duration}=ctx;
    const resourceNames={...ctx.resourceNames,'Gold or Elixir':'Золото или эликсир','Builder Gold or Builder Elixir':'Золото или эликсир строителя','Gems':'Кристаллы'};
    const title=name(row),equipment=row.group==='equipment';
    if(equipment&&(row.absent||row.owned===false||row.level===0)){
      const absent=row.absent||row.level===0;
      return`<div class="dialog-head"><div><div class="eyebrow">СНАРЯЖЕНИЕ ГЕРОЯ</div><h2>${esc(title)}</h2></div><button id="detail-close" aria-label="Закрыть">×</button></div><div class="detail-object detail-object-equipment detail-object-absent"><div class="detail-art">${art(row)}</div><div class="detail-level-block"><div class="detail-presence-label">${absent?'Нет на аккаунте':'Нет данных в JSON'}</div><div class="detail-summary"><div>Сейчас<strong>${absent?'0':'—'}</strong></div></div></div></div><p class="detail-absence-note">${absent?'Предмет отсутствует в импортированном снаряжении. После его получения обнови JSON — появятся уровень и стоимость дальнейших улучшений.':'В этом экспорте не указан уровень предмета. Импортируй свежие данные из игры, чтобы увидеть его состояние.'}</p>`;
    }
    const levels=Array.isArray(row.levels)?row.levels:[];
    const tasks=Array.isArray(row.tasks)?row.tasks:[];
    const valueKnown=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
    const knownTasks=tasks.length>=levels.length&&tasks.every(valueKnown);
    const timeComplete=row.timeComplete!==false&&knownTasks&&(row.timeComplete===true||levels.every(level=>valueKnown(level.time)));
    const costComplete=row.costComplete!==false&&(row.costComplete===true||levels.every(level=>equipment?Array.isArray(level.ore)&&level.ore.length>=3&&level.ore.every(valueKnown):valueKnown(level.cost)));
    const complete=row.completeData!==false&&timeComplete&&costComplete;
    const done=row.done===true&&complete;
    const instant=equipment||row.d?.category==='wall'||(row.supported&&timeComplete&&row.time===0);
    const time=value=>valueKnown(value)?duration(value):'Нет данных';
    const money=(value,resource)=>`<b>${number.format(value)}</b><span>${esc(resourceNames[resource]||resource)}</span>`;
    const ore=(value,index,withLabel=true)=>`<span class="detail-ore detail-ore-${index}"><img src="assets/${oreFiles[index]}.png" alt="${withLabel?'':oreNames[index]}" width="23" height="23"><b>${valueKnown(value)?number.format(value):'Уточняется'}</b>${withLabel?`<small>${oreNames[index]}</small>`:''}</span>`;
    const prices=Object.entries(row.costs||{}).filter(([,value])=>valueKnown(value));
    const count=row.count>1?`<span class="detail-count">×${row.count}</span>`:'';
    const perItem=row.count>1?' · за 1 шт.':'';
    const budget=equipment
      ?`<div class="detail-budget"><div class="detail-budget-label">${costComplete?'Руда до цели':'Известная часть стоимости · руда'}${perItem}</div><div class="detail-ore-totals">${oreNames.map((_,index)=>ore(row.ore?.[index],index)).join('')}</div></div>`
      :prices.length||!costComplete?`<div class="detail-budget"><div class="detail-budget-label">${costComplete?'Базовая стоимость до цели':'Известная часть стоимости'}${perItem}</div>${prices.length?`<div class="detail-resource-totals">${prices.map(([resource,value])=>`<div>${money(value,resource)}</div>`).join('')}</div>`:'<p class="detail-budget-pending">Уточняется</p>'}</div>`:'';
    const emptyTable=done?'Максимум выбранной цели достигнут ✓':'Данные для выбранной цели уточняются';
    const emptyClass=done?'detail-complete':'detail-pending';
    const table=equipment
      ?`<table class="upgrade-table equipment-upgrade-table"><thead><tr><th scope="col">Уровень</th>${oreNames.map((label,index)=>`<th scope="col"><img src="assets/${oreFiles[index]}.png" alt="" width="19" height="19"><span>${label.replace(' руда','')}</span></th>`).join('')}</tr></thead><tbody>${levels.map(level=>`<tr><th scope="row">${level.level}</th>${oreNames.map((_,index)=>`<td class="detail-ore-value ore-value-${index}">${valueKnown(level.ore?.[index])?(level.ore[index]>0?number.format(level.ore[index]):'—'):'Уточняется'}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="4" class="${emptyClass}">${emptyTable}</td></tr>`}</tbody></table>`
      :`<table class="upgrade-table"><thead><tr><th scope="col">Уровень</th><th scope="col">Базовая стоимость</th>${instant?'':'<th scope="col">Время с Gold Pass</th>'}</tr></thead><tbody>${levels.map((level,index)=>`<tr><th scope="row">${level.level}</th><td>${valueKnown(level.cost)?`${number.format(level.cost)} ${esc(resourceNames[level.resource]||level.resource||'')}`:'Уточняется'}</td>${instant?'':`<td>${row.end!==null&&row.end!==undefined&&index===0?'Осталось: ':''}${time(tasks[index])}</td>`}</tr>`).join('')||`<tr><td colspan="${instant?2:3}" class="${emptyClass}">${emptyTable}</td></tr>`}</tbody></table>`;
    return`<div class="dialog-head"><div><div class="eyebrow">${esc(row.label)}</div><h2>${esc(title)} ${count}</h2></div><button id="detail-close" aria-label="Закрыть">×</button></div>
      <div class="detail-object${equipment?' detail-object-equipment':''}"><div class="detail-art">${art(row)}</div><div class="detail-level-block"><div class="detail-summary"><div>Сейчас<strong>${row.level??'Модули'}</strong></div><div>Цель<strong>${row.supported?row.max:'?'}</strong></div>${!instant?`<div>До цели${perItem}<strong>${row.modeled&&timeComplete?(done?'Максимум':time(row.time)):'Нет данных'}</strong></div>`:''}</div>${row.supported?budget:''}</div></div>
      ${row.end&&!instant?`<p class="note">${row.expired?'Таймер истёк. Обнови JSON для подтверждения уровня.':'Текущее улучшение: '+duration((row.end-Date.now())/1000)+' осталось.'}</p>`:''}
      ${row.supported?table:'<p class="note">Расчёт стоимости для выбранной цели пока недоступен.</p>'}${row.supported&&!complete?'<p class="detail-pending-note">Для выбранной цели ещё нет всех цен или сроков улучшений.</p>':''}`;
  }
  return{render};
})();
if(typeof window!=='undefined')window.ClashDetailUI=ClashDetailUI;
if(typeof module!=='undefined')module.exports=ClashDetailUI;
