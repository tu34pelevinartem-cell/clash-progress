/* An announced-content catalog, separate from the player's imported objects. */
const ClashNewContentUI=(()=>{
  'use strict';
  const names={
    'Squad Barracks':{slug:'squad-barracks',titleRu:'Казарма отрядов',icon:'barracks',description:'Открывает отряды: несколько воинов высаживаются одним касанием и занимают меньше мест в армии.'},
    'Guardian Shrine':{slug:'guardian-shrine',titleRu:'Святилище стражей',icon:'shrine',description:'Здесь можно выбирать и улучшать стражей, которые защищают деревню.'},
    'Spiky Tower':{slug:'spiky-tower',titleRu:'Шипастая башня',icon:'spikes',description:'Отвечает шипами по войскам, которые наносят ей урон.'},
    'Firecracker Tower':{slug:'firecracker-tower',titleRu:'Башня огненной лучницы',icon:'tower',description:'Создаётся слиянием башни лучниц и катапульты максимальных уровней. Атакует наземные и воздушные войска.'},
    'Heroic Spell':{slug:'heroic-spell',titleRu:'Героическое заклинание',icon:'spell',description:'Уменьшает получаемый урон, ускоряет войска и позволяет им проходить сквозь стены.'}
  };
  const fallbackEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
  function currentHall(ctx){
    const value=ctx.hallLevel??ctx.hall??ctx.townHall??ctx.currentTownHall??ctx.snapshot?.raw?.buildings?.find(row=>row.data===1000001)?.lvl??ctx.snapshot?.rows?.find(row=>row.base==='home'&&row.data===1000001)?.level;
    return Number.isInteger(value)&&value>0?value:null;
  }
  function imagePath(value){return typeof value==='string'&&/^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|webp)$/.test(value)?value:null;}
  function sourceUrl(value){
    const candidate=typeof value==='string'?value:value?.url;
    if(typeof candidate!=='string')return null;
    try{const url=new URL(candidate);return url.protocol==='https:'?url.href:null;}catch{return null;}
  }
  function time(value,ctx){
    if(!Number.isFinite(value)||value<0)return'Уточняется';
    if(value===0)return'Мгновенно';
    if(ctx.duration)return ctx.duration(value);
    const minutes=Math.ceil(value/60);if(minutes<60)return minutes+' мин';
    const hours=Math.ceil(value/3600);if(hours<24)return hours+' ч';
    return Math.floor(hours/24)+' д'+(hours%24?' '+hours%24+' ч':'');
  }
  function price(value,resource){
    if(!Number.isFinite(value)||value<0)return'Уточняется';
    if(value===0)return'Бесплатно';
    const currency={'Gold':'золота','Elixir':'эликсира','Dark Elixir':'тёмного эликсира','Gems':'кристаллов'}[resource]||(typeof resource==='string'?resource:'');
    return number.format(value)+(currency?' '+currency:'');
  }
  function rows(ctx){
    if(ctx.base==='builder')return[];
    const pending=ctx.databaseInfo?.pendingEntities;
    if(!Array.isArray(pending))return[];
    const page=ctx.page||ctx.section||'buildings',seen=new Set();
    return pending.filter(item=>item&&typeof item.name==='string').map(item=>({...names[item.name],...item}))
      .filter(item=>page==='army'?item.category==='spell':page==='buildings'?item.category!=='spell':false)
      .filter(item=>{const key=item.slug||item.name;if(seen.has(key))return false;seen.add(key);return true;});
  }
  function icon(kind){
    const drawings={
      barracks:'<path d="M5 28V15l15-9 15 9v13M4 16l16-9 16 9M15 32V21h10v11M7 32h26M10 18v6m20-6v6"/>',
      shrine:'<path d="M5 32h30M8 29h24M12 26V13l8-7 8 7v13M20 12l5 7-5 7-5-7zM9 11l-4 4m26-4 4 4"/>',
      spikes:'<path d="M11 32V17l9-8 9 8v15M7 32h26M15 17h10M20 4v6M7 10l6 5m20-5-6 5M5 23h6m18 0h6M16 23v5m8-5v5"/>',
      tower:'<path d="M10 32V13h20v19M7 32h26M10 13V7h6v6h8V7h6v6M16 20h8M16 26h8M20 2v5"/>',
      spell:'<path d="M15 5h10M17 5v11L8 29a4 4 0 0 0 3 6h18a4 4 0 0 0 3-6l-9-13V5M12 26h16M18 19l4 4m3 5 2 3"/>'
    };
    return`<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">${drawings[kind]||drawings.tower}</svg>`;
  }
  function catalogLevels(item){
    return Array.isArray(item.levels)?item.levels.filter(level=>level&&Number.isInteger(level.level)&&level.level>0).slice().sort((a,b)=>a.level-b.level):[];
  }
  function levelTable(levels,item,ctx,esc,hall){
    if(!levels.length)return'';
    return`<div class="new-content-level-wrap"><table class="new-content-levels"><caption>Уровни и улучшения</caption><thead><tr><th scope="col">Ур.</th><th scope="col">Стоимость</th><th scope="col">Время</th><th scope="col">ТХ</th></tr></thead><tbody>${levels.map(level=>{
      const requirement=Number.isInteger(level.th)&&level.th>0?level.th:null;
      const locked=requirement!==null&&hall!==null&&hall<requirement;
      return`<tr data-new-content-level="${level.level}"${locked?' class="new-content-level-locked"':''}><th scope="row">${level.level}</th><td>${esc(price(level.cost,level.resource??item.resource))}</td><td>${esc(time(level.time,ctx))}</td><td${locked?' title="Откроется с ТХ '+requirement+'"':''}>${requirement??'—'}${locked?'<svg class="new-content-level-lock" viewBox="0 0 16 16" aria-label="Недоступно на текущей ратуше"><path d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v7H4z"/></svg>':''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function render(ctx){
    const entries=rows(ctx);if(!entries.length)return'';
    const esc=ctx.esc||fallbackEscape,hall=currentHall(ctx),page=ctx.page||ctx.section||'buildings';
    const cards=entries.map(item=>{
      const locked=Number.isInteger(item.th)&&hall!==null&&hall<item.th;
      const title=item.titleRu||item.name,asset=imagePath(item.image),source=sourceUrl(item.source)||'https://www.youtube.com/watch?v=_j4BcWTG0UM';
      const levels=catalogLevels(item),firstLevel=levels.find(level=>level.level===1);
      const summaryPrice=firstLevel?firstLevel.cost:item.cost,summaryTime=firstLevel?firstLevel.time:item.time,summaryResource=firstLevel?firstLevel.resource??item.resource:item.resource;
      const summaryCaption=firstLevel?'Уровень 1':item.category==='spell'?'Получение':'Постройка';
      const th=Number.isInteger(item.th)&&item.th>0?(locked?'Откроется с ТХ':'С ТХ')+' '+item.th:'ТХ уточняется';
      const facts=[Number.isInteger(item.count)&&item.count>0?`До ${item.count} в деревне`:'',Number.isInteger(item.maxLevel)&&item.maxLevel>0?`Максимальный уровень ${item.maxLevel}`:''].filter(Boolean);
      return`<details class="new-content-card${locked?' new-content-locked':''}" data-new-content="${esc(item.slug||item.name)}" data-new-content-locked="${locked}"><summary><span class="new-content-art">${asset?`<img src="${esc(asset)}" alt="" loading="lazy" width="58" height="58">`:icon(item.icon)}</span><span class="new-content-main"><span class="new-content-title">${esc(title)}</span>${title!==item.name?`<span class="new-content-english">${esc(item.name)}</span>`:''}<span class="new-content-th">${locked?'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v7H4z"/></svg>':''}${esc(th)}</span></span><span class="new-content-chevron" aria-hidden="true">⌄</span><span class="new-content-cost"><span class="new-content-level-caption">${summaryCaption}</span><span>Стоимость<strong>${esc(price(summaryPrice,summaryResource))}</strong></span><span>Время<strong>${esc(time(summaryTime,ctx))}</strong></span></span></summary><div class="new-content-details"><p>${esc(item.description||'Подробности появятся после уточнения данных обновления.')}</p>${facts.length?`<div class="new-content-facts">${facts.map(fact=>`<span>${esc(fact)}</span>`).join('')}</div>`:''}${levelTable(levels,item,ctx,esc,hall)}<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Подробнее об обновлении <span aria-hidden="true">↗</span></a></div></details>`;
    }).join('');
    return`<section class="new-content-panel" id="new-content-${esc(page)}" aria-label="Новое в обновлении"><div class="new-content-heading"><div><span class="new-content-kicker">ОБНОВЛЕНИЕ ТХ19</span><h3>Новое в обновлении</h3></div><span class="new-content-catalog">Каталог новинок · ${entries.length}</span></div><div class="new-content-grid">${cards}</div><p class="new-content-origin">Новые объекты пока показаны в справочнике и не входят в персональный прогноз. Их распознавание в экспорте ещё уточняется.</p></section>`;
  }
  // Native details/summary keeps the catalog usable without extra event handlers.
  function mount(){return;}
  return{render,mount,rows};
})();
if(typeof window!=='undefined')window.ClashNewContentUI=ClashNewContentUI;
if(typeof module!=='undefined')module.exports=ClashNewContentUI;
