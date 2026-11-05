/* Optional forecast scenarios. Inputs are preferences; the imported village stays unchanged. */
const ClashPlannerUI=(()=>{
'use strict';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):min));
const integer=(value,min,max)=>Math.round(clamp(value,min,max));
const HOUR=3600,DAY=86400,HAMMER_END=Date.parse('2026-11-16T08:00:00Z');
let pendingEditTimer=null,mountRevision=0;
function cancelPendingEdit(){if(pendingEditTimer!==null)clearTimeout(pendingEditTimer);pendingEditTimer=null;}
function detected(snapshot){
  const rows=snapshot?.rows||[];
  return{apprenticeLevel:integer(rows.find(r=>r.data===93000000)?.level||0,0,8),labAssistantLevel:integer(rows.find(r=>r.data===93000001)?.level||0,0,12),clockTowerLevel:integer(rows.find(r=>r.data===1000039&&r.base==='builder')?.level||0,0,10)};
}
function getDefaults(snapshot,db,base='home'){
  return{goldPass:0,apprenticeLevel:0,labAssistantLevel:0,clockTowerLevel:detected(snapshot).clockTowerLevel,clockTowerDaily:false,builderPotions:0,researchPotions:0,petPotions:0,clockPotions:0,eventReduction:0,eventDays:7,eventQueues:{building:true,lab:true,pets:true}};
}
function render(ctx){
  const esc=ctx.esc||((v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const base=ctx.base||'home',home=base==='home',p={...getDefaults(ctx.snapshot,ctx.db,base),...(ctx.planner||{})};
  const q={building:true,lab:true,pets:true,...p.eventQueues};
  const s=ctx.scenario||{},original=s.baseline||ctx.result||{},regular=s.withoutPotions||original,final=s.accelerated||s.projected||regular;
  const levels=detected(ctx.snapshot),percent=n=>clamp(n,0,100).toLocaleString('ru-RU',{maximumFractionDigits:2});
  const fmt=seconds=>{const n=Math.max(0,Number(seconds)||0);if(!n)return'0 ч';if(n<HOUR)return Math.ceil(n/60)+' мин';return ctx.duration?ctx.duration(n):Math.ceil(n/HOUR)+' ч';};
  const fmtDate=seconds=>{const n=Number(seconds);return Number.isFinite(n)&&ctx.date?ctx.date(Date.now()+Math.max(0,n)*1000):'—';};
  const number=(key,value,label,help,min=0,max=999,step=1)=>`<label class="planner-field" for="planner-${key}"><span>${label}</span><input id="planner-${key}" data-planner-number="${key}" type="number" inputmode="${step===1?'numeric':'decimal'}" min="${min}" max="${max}" step="${step}" value="${esc(clamp(value,min,max))}">${help?`<small>${help}</small>`:''}</label>`;
  const select=(key,value,label,max,help)=>`<label class="planner-field" for="planner-${key}"><span>${label}</span><select id="planner-${key}" data-planner-number="${key}">${Array.from({length:max+1},(_,i)=>`<option value="${i}"${Number(value)===i?' selected':''}>${i===0?'Не учитывать':'Уровень '+i}</option>`).join('')}</select>${help?`<small>${help}</small>`:''}</label>`;
  const tableRows=[['Строители','building'],[home?'Лаборатория':'Звёздная лаборатория','lab'],...(home?[['Питомцы','pets']]:[])];
  const potionCount=home?integer(p.builderPotions,0,999)+integer(p.researchPotions,0,999)+integer(p.petPotions,0,999):integer(p.clockPotions,0,999);
  const gold=home?[0,10,15,20].includes(Number(p.goldPass))?Number(p.goldPass):0:0;
  const event=home?clamp(p.eventReduction,0,90):0,combined=100*(1-(1-gold/100)*(1-event/100));
  const eventDays=clamp(p.eventDays,0,365),activeEvent=event>0&&eventDays>0;
  const baselineLabel=home&&gold?'Только Gold Pass '+gold+'%':'Без выбранных ускорений';
  const actual=clamp(s.actualPercent??ctx.result?.percent??original.percent??0,0,100),equivalent=clamp(s.projectedPercent??actual,actual,100),delta=Math.max(0,Number(s.equivalentDelta??equivalent-actual)||0);
  const potionSavings=Math.max(0,Number(s.potionSavedSeconds)||0),allSavings=Math.max(0,Number(s.savedSeconds)||0);
  const queueSavings=s.potionQueueSavings||{},potionImproves=Object.values(queueSavings).some(v=>Number(v)>0);
  const helpersHelp=`В JSON: ${levels.apprenticeLevel?'помощник строителя ур. '+levels.apprenticeLevel:'помощник строителя не найден'}, ${levels.labAssistantLevel?'лаборант ур. '+levels.labAssistantLevel:'лаборант не найден'}.`;
  const expired=Date.now()>=HAMMER_END;
  return`<section class="planner" id="clash-planner" aria-labelledby="planner-title">
    <div class="planner-heading"><div><div class="eyebrow">ПЛАНИРУЙ СВОЙ ТЕМП</div><h2 id="planner-title">Ускорения и зелья</h2><p>Выбери ежедневную помощь и количество зелий. Сравни, сколько времени они сэкономят до выбранной цели.</p></div><span class="planner-badge">СЦЕНАРИЙ</span></div>
    <div class="planner-results" aria-live="polite" aria-atomic="true">
      <div class="planner-summary"><span>${baselineLabel}</span><strong>${esc(fmt(original.time))}</strong><small>Ориентир: ${esc(fmtDate(original.time))}</small></div>
      <div class="planner-summary"><span>${home?'С ежедневной помощью и событием':'С Часовой башней'}</span><strong>${esc(fmt(regular.time))}</strong><small>Без расходуемых зелий</small></div>
      <div class="planner-summary planner-summary-final"><span>Выбранный сценарий</span><strong>${esc(fmt(final.time))}</strong><small>${allSavings?'Ближе на '+esc(fmt(allSavings)):'Выбери ускорения ниже'} · ${esc(fmtDate(final.time))}</small></div>
    </div>
    <div class="planner-controls">
      ${home?`<div class="planner-control-card"><div class="planner-card-title"><span class="planner-symbol">✦</span><h3>Пропуск и помощники</h3></div><div class="planner-fields">
        <label class="planner-field" for="planner-goldPass"><span>Бонус Gold Pass</span><select id="planner-goldPass" data-planner-number="goldPass">${[0,10,15,20].map(n=>`<option value="${n}"${gold===n?' selected':''}>${n?n+'%':'Без бонуса'}</option>`).join('')}</select><small>Скидка времени для будущих улучшений. Предполагаем, что выбранный бонус сохраняется.</small></label>
        ${select('apprenticeLevel',p.apprenticeLevel,'Помощник строителя',8,'Один час работы каждые 23 ч. На уровне 8 снимает до 8 ч с одного улучшения.')}
        ${select('labAssistantLevel',p.labAssistantLevel,'Лаборант',12,'Один час работы каждые 23 ч. На уровне 12 снимает до 12 ч исследования.')}
      </div><div class="planner-detected"><p>${esc(helpersHelp)}</p><button type="button" class="planner-inline-button" data-planner-action="helpers"${!levels.apprenticeLevel&&!levels.labAssistantLevel?' disabled':''}>Включить уровни из JSON</button></div></div>
      <div class="planner-control-card"><div class="planner-card-title"><span class="planner-symbol">⚗</span><h3>Сколько зелий использовать</h3></div><div class="planner-fields">
        ${number('builderPotions',p.builderPotions,'Зелья строителя','×10 на 1 ч для занятых строителей основной деревни.')}
        ${number('researchPotions',p.researchPotions,'Зелья исследования','×24 на 1 ч в лаборатории.')}
        ${number('petPotions',p.petPotions,'Зелья питомцев','×24 на 1 ч в домике питомцев.')}
      </div><p class="planner-help">Зелья применяются подряд с начала сценария. Несколько зелий продлевают ускорение. Новое улучшение начинается сразу после завершения предыдущего.</p></div>`:
      `<div class="planner-control-card"><div class="planner-card-title"><span class="planner-symbol">◷</span><h3>Часовая башня</h3></div><div class="planner-fields planner-fields-builder">
        ${select('clockTowerLevel',p.clockTowerLevel,'Уровень часовой башни',10,`В JSON: ${levels.clockTowerLevel?'уровень '+levels.clockTowerLevel:'башня не найдена'}. На уровне 10 ускоряет ×10 на 32 мин.`)}
        <label class="planner-check planner-clock-check" for="planner-clockTowerDaily"><input id="planner-clockTowerDaily" data-planner-check="clockTowerDaily" type="checkbox"${p.clockTowerDaily?' checked':''}${!Number(p.clockTowerLevel)?' disabled':''}><span>Включать по готовности<small>${Number(p.clockTowerLevel)?'×10 на '+(14+2*(integer(p.clockTowerLevel,1,10)-1))+' мин, затем 22 ч перезарядки.':'Сначала выбери уровень башни.'}</small></span></label>
        ${number('clockPotions',p.clockPotions,'Зелья часовой башни','Каждое добавляет 30 мин ускорения ×10.')}
      </div><p class="planner-help">Башня ускоряет строительство и исследования в деревне строителя. Gold Pass и зелья строителя основной деревни здесь не применяются.</p></div>`}
      ${home?`<details class="planner-event"${activeEvent?' open':''}><summary><span>Событие и дополнительная скидка</span><b>${activeEvent?event+'% · '+eventDays.toLocaleString('ru-RU',{maximumFractionDigits:2})+' д':'Настроить'}</b></summary><div class="planner-event-body"><div class="planner-presets"><button type="button" data-planner-action="hammer"${expired?' disabled':''}>Hammer Jam · 50%</button><button type="button" data-planner-action="custom75">Сценарий · 75%</button><button type="button" data-planner-action="event-off">Выключить событие</button></div><p class="planner-help">Hammer Jam 2026: 1–16 ноября, до 11:00 МСК. 75% — ручной сценарий; это не заявленный бонус Hammer Jam.${expired?' Событие завершилось.':''}</p><div class="planner-fields planner-event-fields">
        ${number('eventReduction',p.eventReduction,'Скидка времени события, %','Например, 50 или 75. Дополнительная скидка к Gold Pass.',0,90)}
        ${number('eventDays',p.eventDays,'Сколько дней действует','Скидка действует на улучшения, начатые за это время.',0,365,0.1)}
      </div><fieldset class="planner-event-queues"><legend>На что действует событие</legend>${[['building','Строители и герои'],['lab','Лаборатория'],['pets','Питомцы']].map(([key,label])=>`<label class="planner-check"><input data-planner-queue="${key}" type="checkbox"${q[key]?' checked':''}><span>${label}</span></label>`).join('')}</fieldset><p class="planner-formula">${activeEvent?`Для выбранных направлений: Gold Pass ${gold}% + событие ${event}% → <b>${percent(combined)}% сокращения</b> на новые улучшения во время события.`:'Бонусы перемножаются: 20% Gold Pass и 50% события дают 60% сокращения времени.'} Событие не растягивается на весь прогноз.</p></div></details>`:''}
    </div>
    <div class="planner-impact" aria-live="polite" aria-atomic="true"><div><span class="planner-impact-label">ЭФФЕКТ ВЫБРАННЫХ ЗЕЛИЙ</span><strong>${esc(fmt(potionSavings))}</strong><p>${!potionCount?'Укажи количество зелий, чтобы увидеть их эффект.':potionSavings?'Настолько раньше можно закончить всю прокачку по сравнению с теми же настройками без зелий.':potionImproves?'Зелья сократили отдельные очереди. Общая дата пока зависит от более долгого направления.':'В этом сценарии зелья не сокращают оставшуюся работу.'}</p></div><div><span class="planner-impact-label">ЭКВИВАЛЕНТ ПРОГРЕССА ОТ ЗЕЛИЙ</span><strong>${percent(actual)}% <span>→</span> ${percent(equivalent)}%</strong><p>${delta?'Дополнительно '+percent(delta)+' п.п. базового объёма работы. ':'По времени улучшений из справочника. '}Фактический прогресс деревни подтверждается новым JSON.</p></div></div>
    <div class="planner-table-wrap"><table class="planner-table"><caption>Время по направлениям</caption><thead><tr><th scope="col">Направление</th><th scope="col">Базовый прогноз</th><th scope="col">Без зелий</th><th scope="col">Со зельями</th><th scope="col">Экономия от зелий</th></tr></thead><tbody>${tableRows.map(([label,key])=>`<tr><th scope="row">${label}</th><td>${esc(fmt(original[key]))}</td><td>${esc(fmt(regular[key]))}</td><td>${esc(fmt(final[key]))}</td><td class="planner-saving">${esc(fmt(Math.max(0,Number(queueSavings[key])||0)))}</td></tr>`).join('')}</tbody></table></div>
    <details class="planner-method"><summary>Как считается сценарий</summary><div><p>Строители, лаборатория и питомцы работают параллельно. Дату фулла определяет самая долгая очередь. Поэтому экономия одного направления не всегда сдвигает общую дату.</p><p>Текущие таймеры уже содержат действовавшие при запуске скидки. Повторная скидка к ним не применяется. Помощники и зелья могут ускорить оставшееся время. Ресурсы и ожидание игрока не моделируются.</p>${Array.isArray(s.assumptions)&&s.assumptions.length?`<ul>${s.assumptions.slice(0,12).map(a=>`<li>${esc(a)}</li>`).join('')}</ul>`:''}<p>Правила: <a href="https://support.supercell.com/clash-of-clans/en/articles/helpers-2.html" target="_blank" rel="noopener">помощники</a> · <a href="https://support.supercell.com/clash-of-clans/en/articles/magic-items-and-the-trader.html" target="_blank" rel="noopener">магические предметы</a> · <a href="https://supercell.com/en/games/clashofclans/blog/news/hammer-jam-is-here-backup-has-arrived/" target="_blank" rel="noopener">Hammer Jam 2026</a>.</p></div></details>
  </section>`;
}
function mount(ctx){
  cancelPendingEdit();const revision=++mountRevision;
  const root=document.querySelector('#clash-planner');if(!root||typeof ctx.onChange!=='function')return;
  const patch=value=>{cancelPendingEdit();ctx.onChange(value);};
  root.querySelectorAll('[data-planner-number]').forEach(input=>{
    const key=input.dataset.plannerNumber,min=Number(input.min||0),max=Number(input.max||({goldPass:20,apprenticeLevel:8,labAssistantLevel:12,clockTowerLevel:10}[key]??999));
    const read=()=>key==='eventDays'?clamp(input.value,min,max):integer(input.value,min,max);
    let lastCommitted=read();
    const commit=()=>{
      cancelPendingEdit();
      if(revision!==mountRevision||!input.isConnected)return;
      const value=read();if(value===lastCommitted)return;
      lastCommitted=value;
      const keepFocus=document.activeElement===input,id=input.id;
      patch({[key]:value,...(key==='clockTowerLevel'&&!value?{clockTowerDaily:false}:{})});
      // The dashboard replaces the section after recalculation. Return typing
      // focus only when the user was still editing this field at commit time.
      if(keepFocus){const replacement=document.getElementById(id);if(replacement&&replacement!==input)replacement.focus({preventScroll:true});}
    };
    input.addEventListener('change',commit);
    if(input.type==='number'){
      input.addEventListener('input',()=>{
        cancelPendingEdit();
        // An empty field may be the first step of replacing its old value.
        // Commit it as zero on blur, while allowing uninterrupted typing now.
        if(input.value.trim()==='')return;
        pendingEditTimer=setTimeout(commit,250);
      });
      input.addEventListener('blur',commit);
    }
  });
  root.querySelectorAll('[data-planner-check]').forEach(input=>input.addEventListener('change',()=>patch({[input.dataset.plannerCheck]:input.checked})));
  root.querySelectorAll('[data-planner-queue]').forEach(input=>input.addEventListener('change',()=>{
    const queues={building:true,lab:true,pets:true,...ctx.planner?.eventQueues};queues[input.dataset.plannerQueue]=input.checked;patch({eventQueues:queues});
  }));
  root.querySelectorAll('[data-planner-action]').forEach(button=>button.addEventListener('click',()=>{
    switch(button.dataset.plannerAction){
      case'helpers':{const levels=detected(ctx.snapshot);patch({apprenticeLevel:levels.apprenticeLevel,labAssistantLevel:levels.labAssistantLevel});break;}
      case'hammer':patch({eventReduction:50,eventDays:Math.max(0,(HAMMER_END-Date.now())/(DAY*1000)),eventQueues:{building:true,lab:true,pets:true}});break;
      case'custom75':patch({eventReduction:75,eventDays:Number(ctx.planner?.eventDays)>0?clamp(ctx.planner.eventDays,0,365):7,eventQueues:{building:true,lab:true,pets:true}});break;
      case'event-off':patch({eventReduction:0});break;
    }
  }));
}
return{render,mount,getDefaults};
})();
if(typeof window!=='undefined')window.ClashPlannerUI=ClashPlannerUI;
if(typeof module!=='undefined')module.exports=ClashPlannerUI;
