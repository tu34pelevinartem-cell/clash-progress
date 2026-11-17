/* Snapshot history compares exported levels, never elapsed upgrade timers. */
const ClashHistory=(()=>{
'use strict';
const groups={buildings:'Здания',traps:'Ловушки',units:'Войска',siege_machines:'Осадные машины',heroes:'Герои',spells:'Заклинания',pets:'Питомцы',guardians:'Стражи',equipment:'Снаряжение',helpers:'Помощники',buildings2:'Здания',traps2:'Ловушки',units2:'Войска',heroes2:'Герои'};
const categories={buildings:'Здания и защита',heroes:'Герои, питомцы и стражи',army:'Армия и заклинания',walls:'Стены',equipment:'Снаряжение',helpers:'Помощники'};
const categoryOrder=Object.keys(categories);
const choices=new Map();
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(value);
const typeLabel=count=>count%100>=11&&count%100<=14?'типов':count%10===1?'тип':count%10>=2&&count%10<=4?'типа':'типов';
const rawOf=value=>value?.raw||value;
const definitions=ctx=>Array.isArray(ctx.db)?ctx.db:ctx.db?.entities||[];
const positive=value=>Number.isInteger(value)&&value>0;
const histogram=list=>[...list].map(([level,count])=>({level,count})).sort((a,b)=>(a.level??-1)-(b.level??-1));
function stable(value){if(Array.isArray(value))return'['+value.map(stable).sort().join(',')+']';if(value&&typeof value==='object')return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';return JSON.stringify(value);}
function catalog(ctx){return new Map(definitions(ctx).filter(item=>!item.base||item.base===(ctx.base||'home')).map(item=>[Number(item.id),item]));}
function category(group,definition){if(definition?.category==='wall'||definition?.slug==='wall')return'walls';if(group==='equipment')return'equipment';if(group==='helpers')return'helpers';if(group.startsWith('heroes')||['pets','guardians'].includes(group))return'heroes';if(group.startsWith('units')||['spells','siege_machines'].includes(group))return'army';return'buildings';}
function inventory(raw,group){
  const result=new Map();
  for(const item of raw[group]){
    if(!Number.isInteger(item?.data)||item.data<0)continue;
    const count=item.cnt===undefined?1:item.cnt;
    if(!positive(count)||count>10000)continue;
    const level=Number.isInteger(item.lvl)&&item.lvl>=0?item.lvl:null;
    const entry=result.get(item.data)||{levels:new Map(),modules:[]};
    // An explicit zero describes an unbuilt/unowned object, not an upgrade.
    if(level!==0)entry.levels.set(level,(entry.levels.get(level)||0)+count);
    if(item.types!==undefined)entry.modules.push(stable(item.types));
    result.set(item.data,entry);
  }
  return result;
}
function distributionMatch(before,after){
  const old=new Map(before),fresh=new Map(after),transitions=[],added=[],removed=[];
  // Cancel unchanged level groups first. Counts may be exported as one grouped row
  // or as many individual rows, so object positions cannot identify a building.
  for(const [level,count]of old){const same=Math.min(count,fresh.get(level)||0);old.set(level,count-same);if(fresh.has(level))fresh.set(level,fresh.get(level)-same);}
  // Match each new level with the nearest remaining lower level. This yields the
  // minimum confirmed upward work when objects are also added or merged away.
  for(const to of [...fresh.keys()].filter(positive).sort((a,b)=>a-b)){
    let remaining=fresh.get(to);
    for(const from of [...old.keys()].filter(level=>positive(level)&&level<to).sort((a,b)=>b-a)){
      if(!remaining)break;
      const count=Math.min(remaining,old.get(from)||0);if(!count)continue;
      transitions.push({from,to,count,levels:(to-from)*count});
      old.set(from,old.get(from)-count);remaining-=count;
    }
    fresh.set(to,remaining);
  }
  for(const [level,count]of fresh)if(count)added.push({level,count});
  for(const [level,count]of old)if(count)removed.push({level,count});
  return{transitions,added,removed};
}
function compare(beforeSnapshot,afterSnapshot,ctx={}){
  let before=rawOf(beforeSnapshot),after=rawOf(afterSnapshot);
  const output={valid:false,reason:null,base:ctx.base||'home',beforeTimestamp:before?.timestamp,afterTimestamp:after?.timestamp,entries:[],completedUpgrades:0,upgradedObjects:0,addedCount:0,removedCount:0,uncertainCount:0,changedTypes:0,missingGroups:[],partial:false};
  if(!before||!after||typeof before!=='object'||typeof after!=='object'||!Number.isFinite(before.timestamp)||!Number.isFinite(after.timestamp)){output.reason='missing';return output;}
  if(before.tag&&after.tag&&before.tag!==after.tag){output.reason='account';return output;}
  if(Number.isFinite(before.timestamp)&&Number.isFinite(after.timestamp)&&before.timestamp>after.timestamp)[before,after]=[after,before];
  output.beforeTimestamp=before.timestamp;output.afterTimestamp=after.timestamp;output.valid=true;
  const db=catalog(ctx),meta=new Map((Array.isArray(ctx.equipmentMeta)?ctx.equipmentMeta:ctx.equipmentMeta?.entities||[]).map(item=>[Number(item.id),item]));
  for(const group of Object.keys(groups)){
    if((group.endsWith('2')?'builder':'home')!==output.base)continue;
    if(!Array.isArray(before[group])||!Array.isArray(after[group])){if(Array.isArray(before[group])!==Array.isArray(after[group]))output.missingGroups.push(group);continue;}
    const previous=inventory(before,group),current=inventory(after,group);
    for(const id of new Set([...previous.keys(),...current.keys()])){
      const a=previous.get(id)||{levels:new Map(),modules:[]},b=current.get(id)||{levels:new Map(),modules:[]};
      const match=distributionMatch(a.levels,b.levels),modulesChanged=stable(a.modules)!==stable(b.modules)&&a.modules.length>0&&b.modules.length>0;
      if(!match.transitions.length&&!match.added.length&&!match.removed.length&&!modulesChanged)continue;
      const d=db.get(id),equipment=group==='equipment',rarity=meta.get(id)?.rarity;
      const unconfirmed=equipment?match.added.filter(item=>item.level===1).reduce((sum,item)=>sum+item.count,0):0;
      const added=match.added.reduce((sum,item)=>sum+item.count,0)-unconfirmed;
      const removed=match.removed.reduce((sum,item)=>sum+item.count,0);
      const unknownLevels=[...a.levels.keys(),...b.levels.keys()].some(level=>level===null);
      const upgrades=match.transitions.reduce((sum,item)=>sum+item.levels,0);
      const upgradedCount=match.transitions.reduce((sum,item)=>sum+item.count,0);
      const entry={key:group+':'+id,data:id,group,label:groups[group],base:output.base,d,category:category(group,d),before:histogram(a.levels),after:histogram(b.levels),beforeCount:[...a.levels.values()].reduce((s,n)=>s+n,0),afterCount:[...b.levels.values()].reduce((s,n)=>s+n,0),...match,modulesChanged,unknownLevels,upgrades,upgradedCount,addedCount:added,removedCount:removed,unconfirmedCount:unconfirmed,ownershipUnknown:unconfirmed>0&&rarity!=='Common',compositionChanged:match.added.length>0||match.removed.length>0};
      output.entries.push(entry);output.completedUpgrades+=upgrades;output.upgradedObjects+=upgradedCount;output.addedCount+=added;output.removedCount+=removed;output.uncertainCount+=unconfirmed;
      if(unknownLevels||entry.compositionChanged||modulesChanged)output.partial=true;
    }
  }
  output.changedTypes=output.entries.length;
  output.partial=output.partial||output.missingGroups.length>0;
  output.entries.sort((a,b)=>categoryOrder.indexOf(a.category)-categoryOrder.indexOf(b.category)||b.upgrades-a.upgrades||a.data-b.data);
  return output;
}
function timeline(ctx){
  const current=rawOf(ctx.snapshot);if(!current||!Number.isFinite(current.timestamp))return[];
  const byDate=new Map();
  for(const input of [...(Array.isArray(ctx.history)?ctx.history:[]),current]){
    const raw=rawOf(input);
    if(!raw||!Number.isFinite(raw.timestamp)||raw.timestamp<0||raw.timestamp>current.timestamp||current.tag&&raw.tag!==current.tag)continue;
    byDate.set(raw.timestamp,raw);
  }
  return[...byDate.values()].sort((a,b)=>a.timestamp-b.timestamp);
}
function selection(ctx,list){
  const key=(rawOf(ctx.snapshot)?.tag||'local')+':'+(ctx.base||'home');
  const prior=choices.get(key)||{},dates=list.map(raw=>raw.timestamp);
  const after=dates.includes(prior.after)?prior.after:dates.at(-1);
  const before=dates.includes(prior.before)&&prior.before<after?prior.before:dates.filter(date=>date<after).at(-1);
  const state={before,after,category:categories[prior.category]?prior.category:'all'};
  choices.set(key,state);return state;
}
function stamp(timestamp,ctx){
  const ms=timestamp*1000,date=new Date(ms),day=ctx.date?ctx.date(ms):date.toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});
  return day+' · '+date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
}
function title(entry,ctx){return ctx.name?ctx.name(entry):entry.d?.name||entry.label;}
function breakdown(items,esc){return items.length?items.map(item=>`<span>${item.level===null?'Без уровня':'Ур. '+item.level}<b>×${number(item.count)}</b></span>`).join(''):'<span class="ph-not-present">Нет в экспорте / не построено</span>';}
function item(entry,ctx){
  const esc=ctx.esc||escape;
  const name=title(entry,ctx),top=entry.after.filter(row=>positive(row.level)).at(-1)?.level??entry.before.filter(row=>positive(row.level)).at(-1)?.level??null;
  const image=typeof ClashArt!=='undefined'&&entry.d?ClashArt.image(entry.d,top):null;
  const art=image?`<img src="${esc(image)}" alt="" width="58" height="58" loading="lazy">`:'<span aria-hidden="true">'+(entry.category==='walls'?'▥':entry.category==='heroes'?'♜':entry.category==='army'?'✦':'◈')+'</span>';
  const badges=[];
  if(entry.upgrades)badges.push(`<span class="ph-badge ph-badge-up">+${number(entry.upgrades)} ${entry.upgrades===1?'уровень':'ур.'}</span>`);
  if(entry.addedCount)badges.push(`<span class="ph-badge ph-badge-new">${entry.group==='equipment'?'Впервые зафиксировано':entry.category==='army'||entry.category==='heroes'?'Разблокировано / добавлено':'Построено / добавлено'} ×${number(entry.addedCount)}</span>`);
  if(entry.unconfirmedCount)badges.push(`<span class="ph-badge ph-badge-pending">Появился в экспорте${entry.ownershipUnknown?' · наличие уточняется':''}</span>`);
  if(entry.removedCount)badges.push(`<span class="ph-badge ph-badge-composition">Нет в новом составе ×${number(entry.removedCount)}</span>`);
  if(entry.modulesChanged)badges.push('<span class="ph-badge ph-badge-composition">Изменились модули</span>');
  return`<article class="ph-item"><div class="ph-item-head"><div class="ph-item-art">${art}</div><div><span class="ph-item-kind">${esc(entry.label)}</span><h4>${esc(name)}</h4><div class="ph-badges">${badges.join('')}</div></div></div><div class="ph-distributions"><div><small>Было · ${number(entry.beforeCount)} шт.</small><div>${breakdown(entry.before,esc)}</div></div><span class="ph-change-arrow" aria-label="стало">→</span><div><small>Стало · ${number(entry.afterCount)} шт.</small><div>${breakdown(entry.after,esc)}</div></div></div>${entry.transitions.length?`<div class="ph-transitions">${entry.transitions.map(change=>`<span>Ур. ${change.from}<i>→</i>${change.to}<b>×${number(change.count)}</b></span>`).join('')}</div>`:''}${entry.ownershipUnknown?'<p class="ph-item-note">Уровень 1 не подтверждает получение эпического предмета.</p>':''}</article>`;
}
function recent(list,ctx,state){
  const esc=ctx.esc||escape,pairs=[];
  for(let i=list.length-1;i>Math.max(0,list.length-6);i--){const a=list[i-1],b=list[i],diff=compare(a,b,ctx);pairs.push(`<button type="button" class="ph-recent-item${state.before===a.timestamp&&state.after===b.timestamp?' active':''}" data-history-before="${a.timestamp}" data-history-after="${b.timestamp}" aria-pressed="${state.before===a.timestamp&&state.after===b.timestamp}"><span>${esc(stamp(b.timestamp,ctx))}<small>с ${esc(stamp(a.timestamp,ctx))}</small></span><strong>${diff.completedUpgrades?'+'+number(diff.completedUpgrades)+' ур.':diff.entries.length?number(diff.changedTypes)+' изм.':'Без изменений'}</strong></button>`);}
  return pairs.join('');
}
function render(ctx={}){
  const esc=ctx.esc||escape,list=timeline(ctx);
  const heading='<div class="ph-heading"><h2>История прогресса</h2></div>';
  if(ctx.demo||list.length<2)return`<section class="progress-history" id="progress-history">${heading}<div class="ph-start"><div class="ph-start-icon" aria-hidden="true">◷</div><div><h3>Первый снимок — точка старта</h3><p>После улучшений импортируй новый JSON этого аккаунта. Здесь появятся изменения.</p></div></div></section>`;
  const state=selection(ctx,list),before=list.find(raw=>raw.timestamp===state.before),after=list.find(raw=>raw.timestamp===state.after),diff=compare(before,after,ctx),seconds=Math.max(0,after.timestamp-before.timestamp);
  const period=ctx.duration?ctx.duration(seconds):seconds>=86400?number(Math.floor(seconds/86400))+' д':seconds>=3600?number(Math.ceil(seconds/3600))+' ч':number(Math.max(1,Math.ceil(seconds/60)))+' мин';
  const visible=diff.entries.filter(entry=>state.category==='all'||entry.category===state.category),present=categoryOrder.filter(key=>diff.entries.some(entry=>entry.category===key));
  const dateOptions=(items,selected)=>items.map(raw=>`<option value="${raw.timestamp}"${raw.timestamp===selected?' selected':''}>${esc(stamp(raw.timestamp,ctx))}${raw.timestamp===rawOf(ctx.snapshot).timestamp?' · текущий':''}</option>`).join('');
  const composition=diff.addedCount+diff.removedCount;
  return`<section class="progress-history" id="progress-history">${heading}<div class="ph-workspace"><div class="ph-main"><div class="ph-selector"><label>Раньше<select id="history-before" aria-label="Начальный снимок">${dateOptions(list.slice(0,-1),before.timestamp)}</select></label><span class="ph-selector-arrow" aria-hidden="true">→</span><label>Позже<select id="history-after" aria-label="Конечный снимок">${dateOptions(list.filter(raw=>raw.timestamp>before.timestamp),after.timestamp)}</select></label><div class="ph-period"><b>${esc(period)}</b><span>между снимками</span></div></div>
    <div class="ph-metrics"><div class="ph-metric ph-metric-main"><span>Улучшено уровней</span><strong>${diff.completedUpgrades?'＋':''}${number(diff.completedUpgrades)}</strong>${diff.partial?'<small>Подтверждённый минимум</small>':''}</div><div class="ph-metric"><span>Типов изменилось</span><strong>${number(diff.changedTypes)}</strong></div><div class="ph-metric"><span>Изменения состава</span><strong>${number(composition)}</strong><small>${number(diff.addedCount)} добавлено · ${number(diff.removedCount)} нет в новом составе</small></div></div>
    ${diff.uncertainCount||diff.missingGroups.length?`<p class="ph-method">${diff.uncertainCount?'Наличие нового снаряжения ур. 1 требует подтверждения. ':''}${diff.missingGroups.length?'Разделы, которых нет в одном из снимков, не сравниваются.':''}</p>`:''}
    ${diff.entries.length?`<div class="ph-filters" role="group" aria-label="Что изменилось"><button type="button" data-history-category="all" class="${state.category==='all'?'active':''}" aria-pressed="${state.category==='all'}">Все изменения <span>${diff.changedTypes}</span></button>${present.map(key=>`<button type="button" data-history-category="${key}" class="${state.category===key?'active':''}" aria-pressed="${state.category===key}">${categories[key]}<span>${diff.entries.filter(entry=>entry.category===key).length}</span></button>`).join('')}</div><div class="ph-groups">${visible.length?categoryOrder.filter(key=>visible.some(entry=>entry.category===key)).map(key=>`<div class="ph-group"><div class="ph-group-head"><h3>${categories[key]}</h3><span>${visible.filter(entry=>entry.category===key).length} ${typeLabel(visible.filter(entry=>entry.category===key).length)}</span></div><div class="ph-items">${visible.filter(entry=>entry.category===key).map(entry=>item(entry,ctx)).join('')}</div></div>`).join(''):'<div class="ph-no-change"><b>В этой категории нет изменений</b><span>Выбери другую категорию или снимки.</span></div>'}</div>`:'<div class="ph-no-change"><span aria-hidden="true">✓</span><b>Уровни и состав не изменились</b><p>В этих снимках нет новых подтверждённых улучшений.</p></div>'}
    <details class="ph-explanation feature-help"><summary>Как это работает</summary><p>Сравниваем уровни в двух снимках. Переход с 10-го на 12-й — два улучшения; 20 стен на один уровень — двадцать. Истёкший таймер сам по себе улучшение не подтверждает.</p><p>Одинаковые постройки сравниваются группами. Если состав изменился, показываем минимальное число улучшений, подтверждённое уровнями. Новые объекты считаем отдельно, без их прошлых уровней. Исчезнувшие объекты могут быть объединены при слиянии.</p><p>История хранится в этом браузере и пополняется при импорте JSON. Потраченные ресурсы по снимкам не восстанавливаются.</p></details>
    </div><aside class="ph-aside"><div class="ph-aside-heading"><h3>Последние сравнения</h3><span>${number(list.length)} снимков</span></div><div class="ph-recent">${recent(list,ctx,state)}</div></aside></div></section>`;
}
function mount(ctx={}){
  const root=document.querySelector('#progress-history');if(!root)return;
  const list=timeline(ctx);if(list.length<2)return;
  const key=(rawOf(ctx.snapshot)?.tag||'local')+':'+(ctx.base||'home');
  const paint=()=>{root.outerHTML=render(ctx);mount(ctx);};
  root.querySelector('#history-before')?.addEventListener('change',event=>{const state=selection(ctx,list),before=Number(event.target.value);if(!list.some(raw=>raw.timestamp===before)||before>=list.at(-1).timestamp)return;state.before=before;if(state.after<=before)state.after=list.find(raw=>raw.timestamp>before).timestamp;choices.set(key,state);paint();});
  root.querySelector('#history-after')?.addEventListener('change',event=>{const state=selection(ctx,list),after=Number(event.target.value);if(!list.some(raw=>raw.timestamp===after)||after<=state.before)return;state.after=after;choices.set(key,state);paint();});
  root.addEventListener('click',event=>{
    const recent=event.target.closest('[data-history-before]');if(recent&&root.contains(recent)){const state=selection(ctx,list),before=Number(recent.dataset.historyBefore),after=Number(recent.dataset.historyAfter);if(before<after&&list.some(raw=>raw.timestamp===before)&&list.some(raw=>raw.timestamp===after)){choices.set(key,{...state,before,after});paint();}return;}
    const filter=event.target.closest('[data-history-category]');if(filter&&root.contains(filter)){const category=filter.dataset.historyCategory;if(category==='all'||categories[category]){choices.set(key,{...selection(ctx,list),category});paint();}}
  });
}
return{render,mount,compare,timeline};
})();
if(typeof window!=='undefined')window.ClashHistory=ClashHistory;
if(typeof module!=='undefined')module.exports=ClashHistory;
