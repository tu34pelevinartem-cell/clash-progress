/* Dense equipment overview. Only rows from the player's export contribute to budgets. */
const ClashEquipmentUI=(()=>{
'use strict';
const oreNames=['Блестящая руда','Светящаяся руда','Звёздная руда'];
const oreShort=['Блест.','Свет.','Звёзд.'];
const oreImages=['shiny-ore','glowy-ore','starry-ore'];
const heroNames={'barbarian-king':'Король','archer-queen':'Королева','minion-prince':'Принц миньонов','grand-warden':'Хранитель','royal-champion':'Чемпионка','dragon-duke':'Герцог драконов'};
const heroOrder=Object.keys(heroNames);
const state={hero:'all',query:'',sort:'default',remaining:false};
const fallbackEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Math.max(0,Number(n)||0));
const compact=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1,notation:n>=10000?'compact':'standard'}).format(Math.max(0,Number(n)||0));
function metadata(ctx){const entities=Array.isArray(ctx.meta)?ctx.meta:ctx.meta?.entities||[];return new Map(entities.map(item=>[Number(item.id),item]));}
function rowsFor(ctx){return (ctx.rows||[]).filter(r=>r.group==='equipment'||r.d?.category==='hero-equipment');}
function title(row,ctx){return ctx.name?ctx.name(row):row.d?.name||'Снаряжение';}
function cost(row,index){return Math.max(0,Number(row.ore?.[index])||0);}
function sum(rows){return rows.reduce((totals,row)=>{if(row.supported===false)return totals;for(let i=0;i<3;i++)totals[i]+=cost(row,i)*(row.count||1);return totals;},[0,0,0]);}
function selectedRows(ctx){
  const meta=metadata(ctx),query=state.query.trim().toLocaleLowerCase('ru-RU');
  return rowsFor(ctx).filter(row=>state.hero==='all'||meta.get(row.data)?.hero===state.hero)
    .filter(row=>!state.remaining||!row.done)
    .filter(row=>!query||title(row,ctx).toLocaleLowerCase('ru-RU').includes(query))
    .sort((a,b)=>{
      if(state.sort==='name')return title(a,ctx).localeCompare(title(b,ctx),'ru');
      if(state.sort==='level')return (a.level||0)-(b.level||0)||title(a,ctx).localeCompare(title(b,ctx),'ru');
      if(state.sort.startsWith('ore-'))return cost(b,Number(state.sort.slice(4)))-cost(a,Number(state.sort.slice(4)))||title(a,ctx).localeCompare(title(b,ctx),'ru');
      const ah=heroOrder.indexOf(meta.get(a.data)?.hero),bh=heroOrder.indexOf(meta.get(b.data)?.hero);
      return (ah<0?99:ah)-(bh<0?99:bh)||(a.data-b.data);
    });
}
function orePill(value,index,{exact=false,zeros=true,esc=fallbackEscape}={}){
  if(!zeros&&!value)return'';
  return`<span class="eq-ore eq-ore-${index}" title="${oreNames[index]}: ${count(value)}"><img src="assets/${oreImages[index]}.png" alt="${oreNames[index]}" width="18" height="18"><b>${esc(exact?count(value):compact(value))}</b><span class="eq-ore-label">${oreShort[index]}</span></span>`;
}
function cards(rows,ctx){
  const esc=ctx.esc||fallbackEscape,meta=metadata(ctx);
  return rows.map(row=>{
    const known=row.supported!==false&&Number.isFinite(row.max)&&row.max>0;
    const pct=known?Math.min(100,Math.max(0,(row.level||0)/row.max*100)):0;
    const details=meta.get(row.data)||{};
    const image=row.d?.image&&/^assets\/[a-zA-Z0-9_./-]+\.png$/.test(row.d.image)?`<img src="${esc(row.d.image)}" alt="" width="64" height="64" loading="lazy">`:'<span aria-hidden="true">✧</span>';
    const done=known&&row.done;
    return`<button class="eq-card${done?' eq-card-done':''}${details.rarity==='Epic'?' eq-card-epic':''}" data-equipment-detail="${esc(row.key)}" aria-label="${esc(title(row,ctx))}, уровень ${row.level??'неизвестен'}${known?' из '+row.max:''}">
      <span class="eq-card-art">${image}</span>
      <span class="eq-card-main"><span class="eq-card-title">${esc(title(row,ctx))}</span><span class="eq-card-level">Ур. <b>${row.level??'—'} <span>/ ${known?row.max:'—'}</span></b>${done?'<em>Готово ✓</em>':''}</span><span class="eq-card-track" aria-label="Прогресс по уровням ${Math.round(pct)}%"><i style="width:${pct}%"></i></span></span>
      <span class="eq-card-cost">${!known?'<span class="eq-no-data">Расчёт недоступен для цели</span>':done?'<span class="eq-complete">Все уровни улучшены</span>':[0,1,2].map(i=>orePill(cost(row,i),i,{esc})).join('')}</span>
    </button>`;
  }).join('');
}
function resultText(rows,all){return rows.length===all.length?`${count(all.length)} предметов · остаток до выбранной цели`:`Показано ${count(rows.length)} из ${count(all.length)} предметов`;}
function render(ctx){
  const esc=ctx.esc||fallbackEscape,all=rowsFor(ctx),meta=metadata(ctx),total=sum(all),done=all.filter(r=>r.done).length,unknown=all.filter(r=>r.supported===false).length;
  if(ctx.base==='builder')return`<section class="equipment-view" id="equipment-view"><div class="section-head"><div><div class="section-kicker">СНАРЯЖЕНИЕ ГЕРОЕВ</div><h2>Снаряжение</h2></div></div><div class="empty"><b>Снаряжение — в основной деревне</b>Переключись на основную деревню, чтобы посмотреть предметы и руду на их улучшение.</div></section>`;
  if(!all.length)return`<section class="equipment-view" id="equipment-view"><div class="section-head"><div><div class="section-kicker">СНАРЯЖЕНИЕ ГЕРОЕВ</div><h2>Снаряжение</h2></div></div><div class="empty"><b>В снимке пока нет снаряжения</b>Импортируй JSON из игры — здесь появятся твои предметы и стоимость улучшений.</div></section>`;
  const presentHeroes=heroOrder.filter(hero=>all.some(row=>meta.get(row.data)?.hero===hero));
  if(state.hero!=='all'&&!presentHeroes.includes(state.hero))state.hero='all';
  const rows=selectedRows(ctx);
  return`<section class="equipment-view" id="equipment-view" aria-labelledby="equipment-title">
    <div class="eq-heading"><div><div class="section-kicker">ТВОИ ПРЕДМЕТЫ И РЕСУРСЫ</div><h2 id="equipment-title">Снаряжение героев</h2><p>Уровни и руда до цели — всё перед глазами.</p></div><label class="eq-target-label" for="equipment-target">Цель улучшений<select id="equipment-target"><option value="current"${ctx.settings?.mode!=='maximum'?' selected':''}>Фулл текущей ратуши</option><option value="maximum"${ctx.settings?.mode==='maximum'?' selected':''}>Максимум справочника</option></select></label></div>
    <div class="eq-summary"><div class="eq-summary-progress"><span>На выбранной цели</span><strong>${done}<small> / ${all.length}</small></strong><p>предметов улучшено</p></div>${total.map((value,i)=>`<div class="eq-summary-ore eq-summary-ore-${i}"><img src="assets/${oreImages[i]}.png" alt="" width="37" height="37"><div><span>${oreNames[i]}</span><strong>${count(value)}</strong><small>осталось до цели</small></div></div>`).join('')}</div>${unknown?`<p class="eq-summary-note">Руда рассчитана по ${all.length-unknown} предметам · ещё ${unknown} без расчёта для этой цели.</p>`:''}
    <div class="eq-hero-tabs" role="group" aria-label="Фильтр по герою"><button type="button" data-equipment-hero="all" class="${state.hero==='all'?'active':''}" aria-pressed="${state.hero==='all'}">Все предметы <span>${all.length}</span></button>${presentHeroes.map(hero=>`<button type="button" data-equipment-hero="${hero}" class="${state.hero===hero?'active':''}" aria-pressed="${state.hero===hero}">${heroNames[hero]}</button>`).join('')}</div>
    <div class="eq-tools"><label class="eq-search" for="equipment-search"><span aria-hidden="true">⌕</span><input id="equipment-search" type="search" placeholder="Найти предмет…" aria-label="Поиск снаряжения" value="${esc(state.query)}" autocomplete="off"></label><label class="eq-sort" for="equipment-sort"><span class="eq-sr-only">Сортировка</span><select id="equipment-sort">${[['default','По героям'],['name','По названию'],['level','Сначала низкий уровень'],['ore-0','Больше блестящей руды'],['ore-1','Больше светящейся руды'],['ore-2','Больше звёздной руды']].map(([key,label])=>`<option value="${key}"${state.sort===key?' selected':''}>${label}</option>`).join('')}</select></label><label class="eq-remaining"><input id="equipment-remaining" type="checkbox"${state.remaining?' checked':''}><span>Только не фулл</span></label></div>
    <div class="eq-result-line"><span id="equipment-result-count" role="status">${resultText(rows,all)}</span><span>Стоимость на карточке — до цели</span></div>
    <div class="eq-items" id="equipment-items">${rows.length?cards(rows,ctx):'<div class="empty eq-empty-results"><b>Нет подходящих предметов</b>Измени поиск или фильтр.</div>'}</div>
  </section>`;
}
function mount(ctx){
  const root=document.querySelector('#equipment-view');if(!root)return;
  const paint=()=>{
    const rows=selectedRows(ctx),grid=root.querySelector('#equipment-items'),counter=root.querySelector('#equipment-result-count');
    if(grid)grid.innerHTML=rows.length?cards(rows,ctx):'<div class="empty eq-empty-results"><b>Нет подходящих предметов</b>Измени поиск или фильтр.</div>';
    if(counter)counter.textContent=resultText(rows,rowsFor(ctx));
    root.querySelectorAll('[data-equipment-hero]').forEach(button=>{const active=button.dataset.equipmentHero===state.hero;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  };
  root.querySelector('#equipment-target')?.addEventListener('change',event=>{if(typeof ctx.onTargetMode==='function')ctx.onTargetMode(event.target.value);});
  root.querySelector('#equipment-search')?.addEventListener('input',event=>{state.query=event.target.value;paint();});
  root.querySelector('#equipment-sort')?.addEventListener('change',event=>{state.sort=event.target.value;paint();});
  root.querySelector('#equipment-remaining')?.addEventListener('change',event=>{state.remaining=event.target.checked;paint();});
  root.addEventListener('click',event=>{
    const tab=event.target.closest('[data-equipment-hero]');if(tab&&root.contains(tab)){state.hero=tab.dataset.equipmentHero;paint();return;}
    const item=event.target.closest('[data-equipment-detail]');if(item&&root.contains(item)&&typeof ctx.onDetail==='function')ctx.onDetail(item.dataset.equipmentDetail);
  });
}
return{render,mount,cards,sum};
})();
if(typeof window!=='undefined')window.ClashEquipmentUI=ClashEquipmentUI;
if(typeof module!=='undefined')module.exports=ClashEquipmentUI;
