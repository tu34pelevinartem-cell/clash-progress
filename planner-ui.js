/* Optional forecast scenarios. Inputs are preferences; the imported village stays unchanged. */
const ClashPlannerUI=(()=>{
'use strict';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):min));
const integer=(value,min,max)=>Math.round(clamp(value,min,max));
const HOUR=3600;
let pendingEditTimer=null,mountRevision=0;
function cancelPendingEdit(){if(pendingEditTimer!==null)clearTimeout(pendingEditTimer);pendingEditTimer=null;}
function detected(snapshot){
  const rows=snapshot?.rows||[];
  return{apprenticeLevel:integer(rows.find(r=>r.data===93000000)?.level||0,0,8),labAssistantLevel:integer(rows.find(r=>r.data===93000001)?.level||0,0,12),clockTowerLevel:integer(rows.find(r=>r.data===1000039&&r.base==='builder')?.level||0,0,10)};
}
function getDefaults(snapshot,db,base='home'){
  return{goldPass:0,apprenticeLevel:0,labAssistantLevel:0,clockTowerLevel:detected(snapshot).clockTowerLevel,clockTowerDaily:false,builderPotions:0,researchPotions:0,weeklyResearchPotions:0,petPotions:0,clockPotions:0,eventReduction:0,eventDays:7,eventQueues:{building:true,lab:true,pets:true}};
}
function render(ctx){
  const esc=ctx.esc||((v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const base=ctx.base||'home',home=base==='home',p={...getDefaults(ctx.snapshot,ctx.db,base),...(ctx.planner||{})};
  const q={building:true,lab:true,pets:true,...p.eventQueues},s=ctx.scenario||{};
  const original=s.baseline||ctx.result||{},regular=s.withoutPotions||original,final=s.accelerated||s.projected||regular;
  const levels=detected(ctx.snapshot),percent=n=>clamp(n,0,100).toLocaleString('ru-RU',{maximumFractionDigits:2});
  const fmt=seconds=>{const n=Math.max(0,Number(seconds)||0);if(!n)return'0 ч';if(n<HOUR)return Math.ceil(n/60)+' мин';return ctx.duration?ctx.duration(n):Math.ceil(n/HOUR)+' ч';};
  const partial=ctx.result?.timeComplete===false||original.timeComplete===false;
  const fmtTotal=seconds=>partial&&seconds<=0?'Уточняется':fmt(seconds);
  const queueUnknown=key=>(ctx.result?.rows||[]).some(row=>!row.absent&&!row.scopeExcluded&&row.timeComplete===false&&(['units','units2','spells','siege_machines'].includes(row.group)?'lab':row.group==='pets'?'pets':'building')===key);
  const fmtQueue=(seconds,key)=>queueUnknown(key)?seconds>0?fmt(seconds)+' · часть':'Уточняется':fmt(seconds);
  const fmtDate=seconds=>{if(partial)return 'Полный срок уточняется';const n=Number(seconds);return Number.isFinite(n)&&ctx.date?ctx.date(Date.now()+Math.max(0,n)*1000):'—';};
  const number=(key,value,label,help,min=0,max=999,step=1)=>`<label class="planner-field" for="planner-${key}"><span>${label}</span><input id="planner-${key}" data-planner-number="${key}" type="number" inputmode="${step===1?'numeric':'decimal'}" min="${min}" max="${max}" step="${step}" value="${esc(clamp(value,min,max))}">${help?`<small>${help}</small>`:''}</label>`;
  const select=(key,value,label,max)=>`<label class="planner-field" for="planner-${key}"><span>${label}</span><select id="planner-${key}" data-planner-number="${key}">${Array.from({length:max+1},(_,i)=>`<option value="${i}"${Number(value)===i?' selected':''}>${i===0?'Не учитывать':'Уровень '+i}</option>`).join('')}</select></label>`;
  const tableRows=[['Строители','building'],[home?'Лаборатория':'Звёздная лаборатория','lab'],...(home?[['Питомцы','pets']]:[])];
  const gold=home&&[0,10,15,20].includes(Number(p.goldPass))?Number(p.goldPass):0;
  const event=home?clamp(p.eventReduction,0,90):0,eventDays=clamp(p.eventDays,0,365),activeEvent=event>0&&eventDays>0;
  const combined=100*(1-(1-gold/100)*(1-event/100)),allSavings=Math.max(0,Number(s.savedSeconds)||0);
  const weekly=home&&Number(p.weeklyResearchPotions)>0,helpersOn=Number(p.apprenticeLevel)>0||Number(p.labAssistantLevel)>0;
  const helpersAvailable=levels.apprenticeLevel>0||levels.labAssistantLevel>0;
  const weeklyUsed=Math.max(0,Math.floor(Number(s.weeklyResearchPotionsUsed)||0));
  const weeklySaved=Math.max(0,Number(s.weeklyResearchSavedSeconds)||0),labPartial=queueUnknown('lab');
  const labWithoutWeekly=Number.isFinite(s.labWithoutWeeklyResearch)?s.labWithoutWeeklyResearch:final.lab;
  const baselineLabel=gold?'Только Gold Pass '+gold+'%':'Без ускорений';
  const eventOptions=[...new Set([0,50,75,...(event>0?[event]:[])])].sort((a,b)=>a-b);
  return`<section class="planner" id="clash-planner" aria-labelledby="planner-title">
    <div class="planner-heading"><div><div class="eyebrow">ТВОЙ ТЕМП ПРОКАЧКИ</div><h2 id="planner-title">Ускорения и зелья</h2><p>Укажи, чем пользуешься. Срок до цели пересчитается сразу.</p></div></div>
    ${partial?'<p class="planner-partial">Не для всех улучшений известны сроки. Ниже — прогноз по доступным данным.</p>':''}
    <div class="planner-results" aria-live="polite" aria-atomic="true">
      <div class="planner-summary"><span>${baselineLabel}</span><strong>${esc(fmtTotal(original.time))}</strong><small>${esc(fmtDate(original.time))}</small></div>
      <div class="planner-summary planner-summary-final"><span>С выбранными ускорениями</span><strong>${esc(fmtTotal(final.time))}</strong><small>${esc(fmtDate(final.time))}${allSavings?' · раньше на '+esc(fmt(allSavings)):''}</small></div>
    </div>
    <div class="planner-controls">
      ${home?`<div class="planner-control-card">
        <div class="planner-card-title"><span class="planner-step">1</span><h3>Что используешь каждый день</h3></div>
        <div class="planner-everyday">
          <label class="planner-field" for="planner-goldPass"><span>Бонус Gold Pass</span><select id="planner-goldPass" data-planner-number="goldPass">${[0,10,15,20].map(n=>`<option value="${n}"${gold===n?' selected':''}>${n?n+'%':'Без бонуса'}</option>`).join('')}</select></label>
          <label class="planner-check planner-helpers-check" for="planner-helpers"><input id="planner-helpers" data-planner-helpers type="checkbox"${helpersOn?' checked':''}${!helpersAvailable&&!helpersOn?' disabled':''}><span>Учитывать помощников<small>${helpersAvailable?`Из JSON: строитель ур. ${levels.apprenticeLevel}, лаборант ур. ${levels.labAssistantLevel}.`:'В JSON помощники не найдены. Уровни можно указать вручную ниже.'}</small></span></label>
        </div>
        <details id="planner-helper-details" class="planner-small-details"><summary>Уровни помощников вручную</summary><div class="planner-fields planner-fields-two">${select('apprenticeLevel',p.apprenticeLevel,'Помощник строителя',8)}${select('labAssistantLevel',p.labAssistantLevel,'Лаборант',12)}</div></details>
      </div>
      <div class="planner-control-card">
        <div class="planner-card-title"><span class="planner-step">2</span><h3>Зелья, которые используешь сейчас</h3></div>
        <div class="planner-fields">
          ${number('builderPotions',p.builderPotions,'Зелья строителя сейчас','×10 на 1 час для всех занятых строителей.')}
          ${number('researchPotions',p.researchPotions,'Зелья лаборатории сейчас','×24 на 1 час.')}
          ${number('petPotions',p.petPotions,'Зелья питомцев сейчас','×24 на 1 час.')}
        </div><p class="planner-help">Эти зелья включаем сразу, одно за другим. Количество — на весь прогноз.</p>
      </div>
      <div class="planner-control-card planner-klimat">
        <div class="planner-card-title"><span class="planner-step">3</span><div><span class="planner-card-kicker">ЛАБОРАТОРИЯ · ЕЖЕНЕДЕЛЬНЫЙ ПЛАН</span><h3>Специально для игрока klimat</h3></div></div>
        <label class="planner-check planner-weekly-check" for="planner-weeklyResearchPotions"><input id="planner-weeklyResearchPotions" data-planner-check="weeklyResearchPotions" type="checkbox"${weekly?' checked':''}><span>Покупать по 3 зелья каждую неделю</span></label>
        <p class="planner-help">Первая покупка — через 7 дней, затем каждые 7 дней. Уже купленные зелья укажи в поле «Зелья лаборатории сейчас».</p>
        ${weekly?`<div class="planner-weekly-result" aria-live="polite"><span>Лаборатория с покупками каждую неделю</span><strong>${esc(fmtQueue(final.lab,'lab'))}</strong><small>Без еженедельных покупок: ${esc(fmtQueue(labWithoutWeekly,'lab'))}. Экономия: ${labPartial?'уточняется':esc(fmt(weeklySaved))}. Используем зелий: ${weeklyUsed}.${!labPartial&&weeklySaved>0&&allSavings<=0?' Общую дату определяет другое направление.':''}</small></div>`:''}
      </div>`:`<div class="planner-control-card"><div class="planner-card-title"><span class="planner-step">1</span><h3>Часовая башня</h3></div><div class="planner-fields">
        ${select('clockTowerLevel',p.clockTowerLevel,'Уровень башни',10)}
        <label class="planner-check planner-clock-check" for="planner-clockTowerDaily"><input id="planner-clockTowerDaily" data-planner-check="clockTowerDaily" type="checkbox"${p.clockTowerDaily?' checked':''}${!Number(p.clockTowerLevel)?' disabled':''}><span>Включать по готовности<small>${Number(p.clockTowerLevel)?'×10 на '+(12+2*integer(p.clockTowerLevel,1,10))+' мин, затем 22 ч перезарядки.':'Сначала выбери уровень башни.'}</small></span></label>
        ${number('clockPotions',p.clockPotions,'Зелья часовой башни','Каждое добавляет 30 минут ускорения ×10.')}
      </div></div>`}
      ${home?`<details id="planner-event-details" class="planner-event"${event>0?' open':''}><summary><span>Скидка события — ручной сценарий</span><b>${activeEvent?event+'% · '+eventDays.toLocaleString('ru-RU',{maximumFractionDigits:2})+' д':'Выключена'}</b></summary><div class="planner-event-body">
        <p class="planner-help">Hammer Jam закончился. Скидка применяется только после твоего выбора ниже.</p>
        <div class="planner-fields planner-event-fields">
          <label class="planner-field" for="planner-eventReduction"><span>Скидка времени</span><select id="planner-eventReduction" data-planner-number="eventReduction">${eventOptions.map(n=>`<option value="${n}"${event===n?' selected':''}>${n?n+'% · ручной расчёт':'Не учитывать'}</option>`).join('')}</select></label>
          ${event>0?number('eventDays',p.eventDays,'Сколько дней действует','Для улучшений, начатых в этот период.',0,365,0.1):''}
        </div>
        ${event>0?`<details id="planner-event-queues-details" class="planner-small-details"><summary>К каким улучшениям применить</summary><fieldset class="planner-event-queues"><legend class="planner-sr-only">Направления скидки</legend>${[['building','Строители и герои'],['lab','Лаборатория'],['pets','Питомцы']].map(([key,label])=>`<label class="planner-check"><input data-planner-queue="${key}" type="checkbox"${q[key]?' checked':''}><span>${label}</span></label>`).join('')}</fieldset></details><p class="planner-help">С Gold Pass ${gold}% получается ${percent(combined)}% сокращения времени. Уже запущенные таймеры повторно не уменьшаются.</p>`:''}
      </div></details>`:''}
    </div>
    <details id="planner-breakdown-details" class="planner-breakdown"><summary>Сроки по направлениям</summary><div class="planner-table-wrap"><table class="planner-table"><thead><tr><th scope="col">Направление</th><th scope="col">Базовый срок</th><th scope="col">Выбранный план</th><th scope="col">Экономия</th></tr></thead><tbody>${tableRows.map(([label,key])=>`<tr><th scope="row">${label}</th><td>${esc(fmtQueue(original[key],key))}</td><td>${esc(fmtQueue(final[key],key))}</td><td class="planner-saving">${esc(fmt(Math.max(0,Number(original[key]||0)-Number(final[key]||0))))}</td></tr>`).join('')}</tbody></table></div></details>
    <details id="planner-method-details" class="planner-method"><summary>Как считается прогноз</summary><div><p>Строители, лаборатория и питомцы работают параллельно. Общую дату определяет самая долгая очередь: ускорение лаборатории может не изменить срок фулла, если дольше строятся здания.</p><p>Предполагаем непрерывную работу и немедленный запуск следующих улучшений. Ресурсы и ожидание игрока не моделируются. Gold Pass сохраняется на выбранном уровне бонуса.</p><p>Помощники работают один час каждые 23 часа. Текущие таймеры из JSON не получают скидку повторно. Прогноз не повышает уровни и фактический процент деревни.</p>${Array.isArray(s.assumptions)&&s.assumptions.length?`<ul>${s.assumptions.slice(0,12).map(a=>`<li>${esc(a)}</li>`).join('')}</ul>`:''}<p>Правила: <a href="https://support.supercell.com/clash-of-clans/en/articles/helpers-2.html" target="_blank" rel="noopener">помощники</a> · <a href="https://support.supercell.com/clash-of-clans/en/articles/magic-items-and-the-trader.html" target="_blank" rel="noopener">магические предметы</a>.</p></div></details>
  </section>`;
}
function mount(ctx){
  cancelPendingEdit();const revision=++mountRevision;
  const root=document.querySelector('#clash-planner');if(!root||typeof ctx.onChange!=='function')return;
  const patch=value=>{
    cancelPendingEdit();
    const openStates=Array.from(root.querySelectorAll('details[id]'),details=>({id:details.id,open:details.open}));
    ctx.onChange(value);
    for(const state of openStates){const replacement=document.getElementById(state.id);if(replacement)replacement.open=state.open;}
  };
  root.querySelectorAll('[data-planner-number]').forEach(input=>{
    const key=input.dataset.plannerNumber,min=Number(input.min||0),max=Number(input.max||({goldPass:20,apprenticeLevel:8,labAssistantLevel:12,clockTowerLevel:10,eventReduction:90}[key]??999));
    const read=()=>key==='eventDays'?clamp(input.value,min,max):integer(input.value,min,max);
    let lastCommitted=read();
    const commit=()=>{
      cancelPendingEdit();
      if(revision!==mountRevision||!input.isConnected)return;
      const value=read();if(value===lastCommitted)return;
      lastCommitted=value;
      const keepFocus=document.activeElement===input,id=input.id;
      patch({[key]:value,...(key==='clockTowerLevel'&&!value?{clockTowerDaily:false}:{})});
      if(keepFocus){const replacement=document.getElementById(id);if(replacement&&replacement!==input)replacement.focus({preventScroll:true});}
    };
    input.addEventListener('change',commit);
    if(input.type==='number'){
      input.addEventListener('input',()=>{
        cancelPendingEdit();
        if(input.value.trim()==='')return;
        pendingEditTimer=setTimeout(commit,250);
      });
      input.addEventListener('blur',commit);
    }
  });
  root.querySelectorAll('[data-planner-check]').forEach(input=>input.addEventListener('change',()=>patch({[input.dataset.plannerCheck]:input.dataset.plannerCheck==='weeklyResearchPotions'?(input.checked?3:0):input.checked})));
  root.querySelectorAll('[data-planner-helpers]').forEach(input=>input.addEventListener('change',()=>{
    const levels=detected(ctx.snapshot);patch({apprenticeLevel:input.checked?levels.apprenticeLevel:0,labAssistantLevel:input.checked?levels.labAssistantLevel:0});
  }));
  root.querySelectorAll('[data-planner-queue]').forEach(input=>input.addEventListener('change',()=>{
    const queues={building:true,lab:true,pets:true,...ctx.planner?.eventQueues};queues[input.dataset.plannerQueue]=input.checked;patch({eventQueues:queues});
  }));
}
return{render,mount,getDefaults};
})();
if(typeof window!=='undefined')window.ClashPlannerUI=ClashPlannerUI;
if(typeof module!=='undefined')module.exports=ClashPlannerUI;

