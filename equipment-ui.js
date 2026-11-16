/* Equipment ownership and exported levels are independent of upgrade availability. */
const ClashEquipmentUI=(()=>{
'use strict';
const oreNames=['Блестящая руда','Светящаяся руда','Звёздная руда'];
const oreShort=['Блест.','Свет.','Звёзд.'];
const oreImages=['shiny-ore','glowy-ore','starry-ore'];
const heroNames={'barbarian-king':'Король','archer-queen':'Королева','minion-prince':'Принц миньонов','grand-warden':'Хранитель','royal-champion':'Чемпионка','dragon-duke':'Герцог драконов'};
const heroOrder=Object.keys(heroNames);
const state={hero:'all',query:'',sort:'default',remaining:false,ownership:'all'};
const fallbackEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Math.max(0,Number(n)||0));
const compact=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1,notation:n>=10000?'compact':'standard'}).format(Math.max(0,Number(n)||0));
function metadata(ctx){const entities=Array.isArray(ctx.meta)?ctx.meta:ctx.meta?.entities||[];return new Map(entities.map(item=>[Number(item.id),item]));}
function equipment(row){return row.group==='equipment'||row.d?.category==='hero-equipment';}
function present(row){return row.owned===true||row.owned!==false&&Number.isInteger(row.level)&&row.level>0;}
function definitionList(ctx){return Array.isArray(ctx.db)?ctx.db:ctx.db?.entities||[];}
function reconcile(row,definition,level){
  const output={...row,d:definition||row.d,group:'equipment',label:'Снаряжение',base:'home',level,count:1,owned:Number.isInteger(level)&&level>0,absent:level===0};
  if(!output.owned)return{...output,done:false,modeled:false,supported:false,ore:[0,0,0],costs:{},levels:[],tasks:[],time:0,active:false,end:null};
  if(row.level!==level){
    // Recover a real export level even if an upstream catalog row was zeroed.
    // A missing upgrade cap never turns an owned item's level into zero.
    const limit=Number.isInteger(row.cap)&&row.cap>0?row.cap:Number.isInteger(row.max)&&row.max>0?row.max:null;
    const target=limit===null?null:Math.max(limit,level);
    const levels=target===null?[]:(output.d?.levels||[]).filter(item=>item.level>level&&item.level<=target);
    const supported=row.supported!==false&&target!==null;
    output.max=target;output.levels=levels;output.supported=supported;output.done=supported&&level>=target;
    output.ore=supported?levels.reduce((sum,item)=>sum.map((value,index)=>value+(item.ore?.[index]||0)),[0,0,0]):[0,0,0];
  }
  return output;
}
function rowsFor(ctx){
  const provided=(ctx.rows||[]).filter(equipment),byId=new Map(provided.map(row=>[Number(row.data),row]));
  const definitions=definitionList(ctx).filter(item=>item.base==='home'&&item.category==='hero-equipment');
  const definitionsById=new Map(definitions.map(item=>[Number(item.id),item]));
  const raw=ctx.snapshot?.raw;
  const exported=Array.isArray(raw?.equipment)?raw.equipment:null;
  const snapshotRows=Array.isArray(ctx.snapshot?.rows)?ctx.snapshot.rows.filter(equipment):null;
  const source=exported?exported.map((row,index)=>({data:row.data,level:row.lvl,key:'equipment:'+index})):snapshotRows||provided;
  const actual=new Map();
  for(const entry of source){
    const id=Number(entry.data);if(!Number.isInteger(id))continue;
    const level=Number.isInteger(entry.level)&&entry.level>=0?entry.level:null;
    const previous=actual.get(id);
    // One item per ID; duplicate stale entries must not hide a higher real level.
    if(previous&&Number.isInteger(previous.level)&&(level===null||previous.level>level))continue;
    const row=byId.get(id)||{key:entry.key||'equipment:export:'+id,data:id,supported:false,modeled:false,max:null,ore:[0,0,0],costs:{},levels:[],tasks:[],time:0,end:null};
    actual.set(id,reconcile(row,definitionsById.get(id),level));
  }
  const hasEquipmentData=exported!==null||source.length>0;
  for(const definition of definitions){
    if(actual.has(definition.id))continue;
    actual.set(definition.id,reconcile({key:'equipment:missing:'+definition.id,data:definition.id,missingFromExport:true,max:null},definition,hasEquipmentData?0:null));
  }
  return[...actual.values()];
}
function find(key,ctx){return rowsFor(ctx).find(row=>row.key===key);}
function title(row,ctx){return ctx.name?ctx.name(row):row.d?.name||'Снаряжение';}
function cost(row,index){return Math.max(0,Number(row.ore?.[index])||0);}
function sum(rows){return rows.reduce((totals,row)=>{if(!present(row)||row.supported===false)return totals;for(let i=0;i<3;i++)totals[i]+=cost(row,i)*(row.count||1);return totals;},[0,0,0]);}
function selectedRows(ctx){
  const meta=metadata(ctx),query=state.query.trim().toLocaleLowerCase('ru-RU');
  return rowsFor(ctx).filter(row=>state.hero==='all'||meta.get(row.data)?.hero===state.hero)
    .filter(row=>state.ownership==='all'||state.ownership==='owned'&&present(row)||state.ownership==='absent'&&row.absent)
    .filter(row=>!state.remaining||!row.done)
    .filter(row=>!query||title(row,ctx).toLocaleLowerCase('ru-RU').includes(query))
    .sort((a,b)=>{
      if(state.sort==='name')return title(a,ctx).localeCompare(title(b,ctx),'ru');
      if(state.sort==='level')return(present(b)-present(a))||(a.level??-1)-(b.level??-1)||title(a,ctx).localeCompare(title(b,ctx),'ru');
      if(state.sort.startsWith('ore-'))return cost(b,Number(state.sort.slice(4)))-cost(a,Number(state.sort.slice(4)))||title(a,ctx).localeCompare(title(b,ctx),'ru');
      const ah=heroOrder.indexOf(meta.get(a.data)?.hero),bh=heroOrder.indexOf(meta.get(b.data)?.hero);
      return(ah<0?99:ah)-(bh<0?99:bh)||(present(b)-present(a))||(a.data-b.data);
    });
}
function orePill(value,index,{exact=false,zeros=true,esc=fallbackEscape}={}){
  if(!zeros&&!value)return'';
  return`<span class="eq-ore eq-ore-${index}" title="${oreNames[index]}: ${count(value)}"><img src="assets/${oreImages[index]}.png" alt="${oreNames[index]}" width="18" height="18"><b>${esc(exact?count(value):compact(value))}</b><span class="eq-ore-label">${oreShort[index]}</span></span>`;
}
function cards(rows,ctx){
  const esc=ctx.esc||fallbackEscape,meta=metadata(ctx);
  return rows.map(row=>{
    const owned=present(row),known=owned&&row.supported!==false&&Number.isFinite(row.max)&&row.max>0;
    const pct=known?Math.min(100,Math.max(0,row.level/row.max*100)):0;
    const details=meta.get(row.data)||{};
    const imagePath=typeof ClashArt!=='undefined'?ClashArt.image(row.d,row.level):null;
    const image=imagePath?`<img src="${esc(imagePath)}" alt="" width="64" height="64" loading="lazy">`:'<span aria-hidden="true">✧</span>';
    const done=known&&row.done;
    const status=row.absent?'Нет на аккаунте':owned?'Уровень '+row.level:'Нет данных в JSON';
    const level=owned?`Ур. <b>${row.level} <span>/ ${known?row.max:'—'}</span></b>${done?'<em>Готово ✓</em>':''}`:`<span class="eq-ownership-status">${status}</span>`;
    const budget=!owned?`<span class="eq-no-data">${row.absent?'После получения предмета':'Импортируй свежие данные'}</span>`:!known?'<span class="eq-no-data">Расчёт недоступен для цели</span>':done?'<span class="eq-complete">Все уровни улучшены</span>':[0,1,2].map(i=>orePill(cost(row,i),i,{esc})).join('');
    return`<button class="eq-card${done?' eq-card-done':''}${details.rarity==='Epic'?' eq-card-epic':''}${!owned?' eq-card-absent':''}" data-equipment-detail="${esc(row.key)}" data-equipment-level="${row.level??''}" data-equipment-owned="${owned}" aria-label="${esc(title(row,ctx))}, ${status}${known?' из '+row.max:''}">
      <span class="eq-card-art">${image}${row.absent?'<span class="eq-absence-mark" aria-hidden="true">−</span>':''}</span>
      <span class="eq-card-main"><span class="eq-card-title">${esc(title(row,ctx))}</span><span class="eq-card-level">${level}</span><span class="eq-card-track" aria-label="${known?'Прогресс по уровням '+Math.round(pct)+'%':esc(status)}"><i style="width:${pct}%"></i></span></span>
      <span class="eq-card-cost">${budget}</span>
    </button>`;
  }).join('');
}
function resultText(rows,all){return`Показано ${count(rows.length)} из ${count(all.length)} предметов`;}
function render(ctx){
  const esc=ctx.esc||fallbackEscape,all=rowsFor(ctx),meta=metadata(ctx),owned=all.filter(present),total=sum(owned),done=owned.filter(row=>row.done&&row.supported!==false).length,unknown=owned.filter(row=>row.supported===false).length,absent=all.filter(row=>row.absent).length;
  if(ctx.base==='builder')return`<section class="equipment-view" id="equipment-view"><div class="section-head"><div><div class="section-kicker">СНАРЯЖЕНИЕ ГЕРОЕВ</div><h2>Снаряжение</h2></div></div><div class="empty"><b>Снаряжение — в основной деревне</b>Переключись на основную деревню, чтобы посмотреть предметы и руду на их улучшение.</div></section>`;
  if(!all.length)return`<section class="equipment-view" id="equipment-view"><div class="empty"><b>Не удалось загрузить список снаряжения</b>Обнови страницу, чтобы повторить загрузку справочника.</div></section>`;
  const presentHeroes=heroOrder.filter(hero=>all.some(row=>meta.get(row.data)?.hero===hero));
  if(state.hero!=='all'&&!presentHeroes.includes(state.hero))state.hero='all';
  const rows=selectedRows(ctx);
  return`<section class="equipment-view" id="equipment-view" aria-labelledby="equipment-title">
    <div class="eq-heading"><div><div class="section-kicker">АРСЕНАЛ ТВОЕЙ ДЕРЕВНИ</div><h2 id="equipment-title">Снаряжение героев</h2><p>Получено ${owned.length} · отсутствует ${absent}</p></div><label class="eq-target-label" for="equipment-target">Цель улучшений<select id="equipment-target"><option value="current"${ctx.settings?.mode!=='maximum'?' selected':''}>Фулл текущей ратуши</option><option value="maximum"${ctx.settings?.mode==='maximum'?' selected':''}>Максимум справочника</option></select></label></div>
    <div class="eq-summary"><div class="eq-summary-progress"><span>На выбранной цели</span><strong>${done}<small> / ${owned.length}</small></strong><p>полученных предметов улучшено</p></div>${total.map((value,i)=>`<div class="eq-summary-ore eq-summary-ore-${i}"><img src="assets/${oreImages[i]}.png" alt="" width="37" height="37"><div><span>${oreNames[i]}</span><strong>${owned.length?count(value):'—'}</strong><small>для полученных предметов</small></div></div>`).join('')}</div><p class="eq-summary-note">${owned.length?`Руда — для ${owned.length-unknown} полученных предметов${unknown?' · ещё '+unknown+' без расчёта для цели':''}. Отсутствующие предметы в бюджет не входят.`:'В бюджете пока нет полученного снаряжения.'}</p>
    <div class="eq-hero-tabs" role="group" aria-label="Фильтр по герою"><button type="button" data-equipment-hero="all" class="${state.hero==='all'?'active':''}" aria-pressed="${state.hero==='all'}">Все предметы <span>${all.length}</span></button>${presentHeroes.map(hero=>`<button type="button" data-equipment-hero="${hero}" class="${state.hero===hero?'active':''}" aria-pressed="${state.hero===hero}">${heroNames[hero]}</button>`).join('')}</div>
    <div class="eq-tools"><label class="eq-search" for="equipment-search"><span aria-hidden="true">⌕</span><input id="equipment-search" type="search" placeholder="Найти предмет…" aria-label="Поиск снаряжения" value="${esc(state.query)}" autocomplete="off"></label><label class="eq-sort" for="equipment-sort"><span class="eq-sr-only">Сортировка</span><select id="equipment-sort">${[['default','По героям'],['name','По названию'],['level','Сначала низкий уровень'],['ore-0','Больше блестящей руды'],['ore-1','Больше светящейся руды'],['ore-2','Больше звёздной руды']].map(([key,label])=>`<option value="${key}"${state.sort===key?' selected':''}>${label}</option>`).join('')}</select></label><label class="eq-ownership" for="equipment-ownership"><span class="eq-sr-only">Наличие снаряжения</span><select id="equipment-ownership">${[['all','Все предметы'],['owned','Есть на аккаунте'],['absent','Отсутствуют']].map(([key,label])=>`<option value="${key}"${state.ownership===key?' selected':''}>${label}</option>`).join('')}</select></label><label class="eq-remaining"><input id="equipment-remaining" type="checkbox"${state.remaining?' checked':''}><span>Только не фулл</span></label></div>
    <div class="eq-result-line"><span id="equipment-result-count" role="status">${resultText(rows,all)}</span><span>Получено ${owned.length} · отсутствует ${absent}</span></div>
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
  root.querySelector('#equipment-ownership')?.addEventListener('change',event=>{state.ownership=event.target.value;paint();});
  root.querySelector('#equipment-remaining')?.addEventListener('change',event=>{state.remaining=event.target.checked;paint();});
  root.addEventListener('click',event=>{
    const tab=event.target.closest('[data-equipment-hero]');if(tab&&root.contains(tab)){state.hero=tab.dataset.equipmentHero;paint();return;}
    const item=event.target.closest('[data-equipment-detail]');if(item&&root.contains(item)&&typeof ctx.onDetail==='function')ctx.onDetail(item.dataset.equipmentDetail);
  });
}
return{render,mount,cards,sum,rowsFor,find,present};
})();
if(typeof window!=='undefined')window.ClashEquipmentUI=ClashEquipmentUI;
if(typeof module!=='undefined')module.exports=ClashEquipmentUI;
