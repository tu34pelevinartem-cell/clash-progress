/* Forecast engine: export parser, requirement caps and parallel work queues. */
const ClashEngine=(()=>{
const groups={buildings:'Здания',traps:'Ловушки',units:'Войска',siege_machines:'Осадные машины',heroes:'Герои',spells:'Заклинания',pets:'Питомцы',equipment:'Снаряжение',helpers:'Помощники',buildings2:'Здания',traps2:'Ловушки',units2:'Войска',heroes2:'Герои'};
function parse(text){let raw=JSON.parse(text);if(typeof raw==='string')raw=JSON.parse(raw);if(!raw||typeof raw.tag!=='string'||!/^#[A-Z0-9]+$/i.test(raw.tag)||!Array.isArray(raw.buildings)||!Number.isInteger(raw.timestamp)||raw.timestamp<0||raw.timestamp>4102444800)throw Error('Нужен JSON экспорта деревни Clash of Clans.');const rows=[];for(const [group,label]of Object.entries(groups)){if(raw[group]!==undefined&&!Array.isArray(raw[group]))throw Error('Некорректный раздел '+group);for(const [index,r]of(raw[group]||[]).entries()){if(!Number.isInteger(r.data)||r.data<0||r.lvl!==undefined&&(!Number.isInteger(r.lvl)||r.lvl<0||r.lvl>999)||r.cnt!==undefined&&(!Number.isInteger(r.cnt)||r.cnt<1||r.cnt>10000)||r.timer!==undefined&&(!Number.isFinite(r.timer)||r.timer<0||r.timer>315360000))throw Error('Некорректный объект в разделе '+group);rows.push({key:group+':'+index,group,label,base:group.endsWith('2')?'builder':'home',data:r.data,level:r.lvl??null,count:r.cnt??1,end:r.timer!==undefined?(raw.timestamp+r.timer)*1000:null,types:r.types||null})}}if(rows.length>10000)throw Error('Слишком большой экспорт.');return{raw,rows}}
function hall(snapshot,base){return snapshot.rows.find(r=>r.data===(base==='home'?1000001:1000034))?.level||1}
function entity(db,id,base){return db.find(d=>d.id===id&&d.base===base)}
function cap(d,db,target,mode='current'){if(!d)return null;if(mode==='maximum')return Math.max(...d.levels.map(l=>l.level));function gate(slug){const x=db.find(x=>x.slug===slug&&x.base===d.base);return Math.max(0,...(x?.levels||[]).filter(l=>(l.th??l.bh??0)<=target).map(l=>l.level))}return Math.max(0,...d.levels.filter(l=>{if(d.slug==='town-hall'||d.slug==='builder-hall')return l.level<=target;if((l.th??l.bh??0)>target)return false;if(l.heroHall!==undefined&&l.heroHall>gate('hero-hall'))return false;if(l.lab!==undefined&&l.lab>gate(d.base==='home'?'laboratory':'star-laboratory'))return false;if(l.pet!==undefined&&l.pet>gate('pet-house'))return false;if(l.blacksmith!==undefined&&l.blacksmith>gate('blacksmith'))return false;return true}).map(l=>l.level))}
function describe(row,db,target,mode,boost=0,now=Date.now()){const d=entity(db,row.data,row.base);const max=cap(d,db,target,mode);const supported=!!d&&row.level!==null&&max!==null&&max>0;const top=Math.max(row.level||0,max||0);let levels=supported?d.levels.filter(l=>l.level>row.level&&l.level<=top):[];const costs={},ore=[0,0,0];for(const [index,l] of levels.entries()){if(row.end!==null&&index===0)continue;if(l.resource)costs[l.resource]=(costs[l.resource]||0)+l.cost;for(let i=0;i<3;i++)ore[i]+=(l.ore?.[i]||0)}let tasks=levels.map(l=>l.time*(1-boost/100));const hasTimer=row.end!==null;if(hasTimer&&levels.length)tasks[0]=Math.max(0,(row.end-now)/1000);const futureTime=tasks.reduce((s,t)=>s+t,0);const fullTime=supported?d.levels.filter(l=>l.level<=top).reduce((s,l)=>s+l.time*(1-boost/100),0):0;const modeled=supported&&!['helpers'].includes(row.group)&&d.category!=='guardian'&&(d.category!=='other'||d.slug==='clock-tower')&&!row.types;return{...row,d,max:top,cap:max,supported,modeled,levels,tasks,time:futureTime,costs,ore,fullTime,active:hasTimer&&row.end>now,expired:hasTimer&&row.end<=now,done:supported&&row.level>=top}}
function allocate(chains,n){const slots=Array(Math.max(1,n)).fill(0);for(const t of [...chains].sort((a,b)=>b-a)){const min=Math.min(...slots);slots[slots.indexOf(min)]+=t}return Math.max(0,...slots)}
function forecast(snapshot,db,{base='home',mode='current',builders=6,boost=0,now=Date.now()}={}){const target=mode==='current'?hall(snapshot,base):Math.max(...db.filter(d=>d.base===base&&['town-hall','builder-hall'].includes(d.slug)).flatMap(d=>d.levels.map(l=>l.level)));const rows=snapshot.rows.filter(r=>r.base===base).map(r=>describe(r,db,target,mode,boost,now));const buildChains=[],labChains=[],petChains=[],costs={},ore=[0,0,0];let total=0,remaining=0,known=0,upgrades=0;for(const r of rows){if(!r.modeled)continue;known+=r.count;total+=r.fullTime*r.count;remaining+=r.time*r.count;upgrades+=r.levels.length*r.count;for(const [key,v]of Object.entries(r.costs))costs[key]=(costs[key]||0)+v*r.count;r.ore.forEach((v,i)=>ore[i]+=v*r.count);const queue=['units','units2','spells','siege_machines'].includes(r.group)?labChains:r.group==='pets'?petChains:buildChains;if(r.group!=='equipment'&&r.d.category!=='wall')for(let k=0;k<r.count;k++)queue.push(r.time)}const building=allocate(buildChains,builders),lab=labChains.reduce((a,b)=>a+b,0),pets=petChains.reduce((a,b)=>a+b,0),time=Math.max(building,lab,pets),percent=total?Math.max(0,Math.min(100,(total-remaining)/total*100)):0;const excluded=rows.filter(r=>!r.modeled);return{target,rows,building,lab,pets,time,percent,costs,ore,upgrades,known,excluded,rawBuilder:buildChains.reduce((a,b)=>a+b,0),maxed:rows.filter(r=>r.done).reduce((s,r)=>s+r.count,0),objects:rows.reduce((s,r)=>s+r.count,0)}}
// Acceleration scenarios keep snapshot progress separate from predicted dates.
const HOUR=3600,DAY=86400,EPS=1e-6;
const bounded=(value,min,max,fallback=0)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
function normalizeBoosts(input={},base='home'){
 const home=base!=='builder',queues=input.eventQueues||{};
 return{goldPass:home&&[0,10,15,20].includes(Number(input.goldPass))?Number(input.goldPass):0,
  eventReduction:home?bounded(input.eventReduction??input.eventDiscount,0,90):0,eventDays:home?bounded(input.eventDays,0,365):0,
  eventQueues:{building:queues.building!==false,lab:queues.lab!==false,pets:queues.pets!==false},
  apprenticeLevel:home?Math.floor(bounded(input.apprenticeLevel,0,8)):0,labAssistantLevel:home?Math.floor(bounded(input.labAssistantLevel,0,12)):0,
  clockTowerLevel:home?0:Math.floor(bounded(input.clockTowerLevel,0,10)),clockTowerDaily:!home&&input.clockTowerDaily===true,
  builderPotions:home?Math.floor(bounded(input.builderPotions,0,1000)):0,researchPotions:home?Math.floor(bounded(input.researchPotions,0,1000)):0,
  petPotions:home?Math.floor(bounded(input.petPotions,0,1000)):0,clockPotions:home||bounded(input.clockTowerLevel,0,10)<1?0:Math.floor(bounded(input.clockPotions,0,1000))};
}
function helperLevels(snapshot){
 const level=id=>Math.max(0,...snapshot.rows.filter(r=>r.data===id).map(r=>r.level||0));
 return{apprenticeLevel:Math.min(8,level(93000000)),labAssistantLevel:Math.min(12,level(93000001)),clockTowerLevel:Math.min(10,level(1000039))};
}
function clockMinutes(level){return level>0?12+2*Math.min(10,Math.floor(level)):0;}
function queueOf(row){return['units','units2','spells','siege_machines'].includes(row.group)?'lab':row.group==='pets'?'pets':'building';}
function scenarioChains(rows){
 const out={building:[],lab:[],pets:[]};let size=0;
 for(const row of rows){
  if(!row.modeled||row.group==='equipment'||row.d.category==='wall'||!row.levels.length)continue;
  const tasks=row.levels.map((level,index)=>({work:row.tasks[index],raw:level.time,active:row.end!==null&&index===0,
   eligible:/^(Gold|Elixir|Dark Elixir)$/.test(level.resource||''),clock:row.data===1000039}));
  for(let k=0;k<row.count;k++){
   size+=tasks.length;if(size>200000)throw Error('Слишком много улучшений для сценария.');
   out[queueOf(row)].push({tasks,total:tasks.reduce((sum,task)=>sum+task.work,0),active:tasks[0]?.active&&tasks[0].work>EPS});
  }
 }
 return out;
}
function assignChains(chains,count){
 const slots=Array.from({length:count},()=>({tasks:[],load:0,index:0,current:null,remaining:0,factor:1}));
 // Work already running in the export occupies the first slots immediately.
 for(const chain of [...chains].sort((a,b)=>Number(b.active)-Number(a.active)||b.total-a.total)){
  const slot=slots.reduce((a,b)=>a.load<=b.load?a:b);slot.tasks.push(...chain.tasks);slot.load+=chain.total;
 }
 return slots;
}
// A free Clock Tower activation and potions extend one 10x window, not its rate.
// The cooldown begins after the window. Starting a tower upgrade cancels it.
function clockController(boosts,initialUnavailable=0){
 const duration=clockMinutes(boosts.clockTowerLevel)*60,daily=boosts.clockTowerDaily&&duration>0;
 let ready=initialUnavailable,activeEnd=0,potionStart=Infinity,potionEnd=0,first=true,waiting=false;
 const windows=[];
 function state(t,busy=false){
  busy=busy||t<initialUnavailable-EPS;
  if(busy){
   if(activeEnd>t+EPS){const last=windows.at(-1);if(last)last.end=t;activeEnd=t;}
   ready=Infinity;waiting=true;
  }else{
   if(waiting){ready=t;waiting=false;}
   if(t>=ready-EPS&&(daily||first&&boosts.clockPotions>0)){
    const free=daily?duration:0,potions=first?boosts.clockPotions*30*60:0;
    first=false;potionStart=t+free;potionEnd=potionStart+potions;activeEnd=potionEnd;
    if(activeEnd>t+EPS)windows.push({start:t,end:activeEnd,potionStart,potionEnd});
    ready=daily?activeEnd+22*HOUR:Infinity;
   }
  }
  const on=!busy&&t<activeEnd-EPS;
  return{rate:on?10:1,potionExtra:on&&t>=potionStart-EPS&&t<potionEnd-EPS?9:0,
   next:Math.min(activeEnd>t+EPS?activeEnd:Infinity,ready>t+EPS?ready:Infinity,initialUnavailable>t+EPS?initialUnavailable:Infinity,
    on&&potionStart>t+EPS?potionStart:Infinity)};
 }
 function extend(horizon){
  // Future construction has finished, so the tower will no longer be disabled.
  let guard=0;while(daily&&ready<horizon-EPS&&guard++<100000)state(ready,false);
 }
 return{state,extend,windows};
}
function clockReader(windows){
 let index=0;
 return{state(t){while(index<windows.length&&windows[index].end<=t+EPS)index++;
  const window=windows[index];if(!window)return{rate:1,potionExtra:0,next:Infinity};
  if(t<window.start-EPS)return{rate:1,potionExtra:0,next:window.start};
  return{rate:10,potionExtra:t>=window.potionStart-EPS&&t<Math.min(window.potionEnd,window.end)-EPS?9:0,
   next:Math.min(window.end,window.potionStart>t+EPS?window.potionStart:Infinity)};
 }};
}
function simulate(chains,count,kind,boosts,{clock=null,goldFactor=1}={}){
 const slots=assignChains(chains,count),eventEnd=boosts.eventDays*DAY,eventFactor=1-boosts.eventReduction/100;
 const helper=kind==='building'?boosts.apprenticeLevel:kind==='lab'?boosts.labAssistantLevel:0;
 const potionCount=kind==='building'?boosts.builderPotions:kind==='lab'?boosts.researchPotions:boosts.petPotions;
 const potionEnd=potionCount*HOUR,potionMultiplier=kind==='building'?10:24;
 let time=0,nextHelper=helper?0:Infinity,helperEnd=0,helperSlot=null,helperTask=null,potionWork=0,steps=0;
 function start(slot,t){
  while(!slot.current&&slot.index<slot.tasks.length){
   const task=slot.tasks[slot.index++],discount=!task.active&&task.eligible&&boosts.eventQueues[kind]&&t<eventEnd-EPS?eventFactor:1;
   slot.factor=(task.active?1:goldFactor)*discount;
   slot.remaining=task.work*discount;slot.current=task;
   if(slot.remaining<=EPS){slot.remaining=0;slot.current=null;}
  }
 }
 slots.forEach(slot=>start(slot,0));
 // Initialise the clock even when there is no building work left.
 if(clock)clock.state(0,slots.some(slot=>slot.current?.clock));
 while(slots.some(slot=>slot.current)){
  if(++steps>1000000)throw Error('Сценарий слишком большой для расчёта.');
  if(helperSlot&&helperSlot.current!==helperTask){helperSlot=null;helperTask=null;}
  if(helper&&time>=nextHelper-EPS){
   helperSlot=slots.filter(slot=>slot.current).reduce((best,slot)=>!best||slot.remaining>best.remaining?slot:best,null);
   helperTask=helperSlot?.current||null;helperEnd=time+HOUR;nextHelper=time+23*HOUR;
  }
  const global=clock?clock.state(time,slots.some(slot=>slot.current?.clock)):{rate:1,potionExtra:0,next:Infinity};
  const usingPotion=time<potionEnd-EPS,normalRate=usingPotion?potionMultiplier:global.rate;
  const extra=usingPotion?potionMultiplier-1:global.potionExtra;
  let next=Math.min(global.next,nextHelper>time+EPS?nextHelper:Infinity,
   helperSlot&&helperEnd>time+EPS?helperEnd:Infinity,usingPotion?potionEnd:Infinity);
  for(const slot of slots){if(!slot.current)continue;
   const helping=slot===helperSlot&&time<helperEnd-EPS?helper:0;
   next=Math.min(next,time+slot.remaining/(normalRate+helping));
  }
  if(!Number.isFinite(next)||next<=time)throw Error('Не удалось рассчитать очередь улучшений.');
  const dt=next-time;
  for(const slot of slots){if(!slot.current)continue;
   const helping=slot===helperSlot&&time<helperEnd-EPS?helper:0;
   const work=Math.min(slot.remaining,(normalRate+helping)*dt);
   // Only the extra work produced by a consumed potion advances equivalent progress.
   potionWork+=Math.min(work,extra*dt)/Math.max(.01,slot.factor);
   slot.remaining=Math.max(0,slot.remaining-work);
  }
  time=next;
  for(const slot of slots){if(slot.current&&slot.remaining<=EPS){slot.current=null;start(slot,time);}}
 }
 return{time,potionWork};
}
function runScenario(chains,builders,boosts,base,clockUnavailable,horizon){
 const goldFactor=1-boosts.goldPass/100,clock=base==='builder'?clockController(boosts,clockUnavailable):null;
 const building=simulate(chains.building,builders,'building',boosts,{clock,goldFactor});
 if(clock){clock.state(Math.max(building.time,clockUnavailable),false);clock.extend(Math.max(horizon,building.time)+DAY);}
 const lab=simulate(chains.lab,1,'lab',boosts,{clock:clock?clockReader(clock.windows):null,goldFactor});
 const pets=simulate(chains.pets,1,'pets',boosts,{goldFactor});
 return{building:building.time,lab:lab.time,pets:pets.time,time:Math.max(building.time,lab.time,pets.time),
  potionWorkSaved:{building:building.potionWork,lab:lab.potionWork,pets:pets.potionWork}};
}
function scenario(snapshot,db,options={}){
 const base=options.base==='builder'?'builder':'home',builders=Math.floor(bounded(options.builders,1,base==='builder'?2:6,base==='builder'?2:6));
 const input=options.acceleration||options.boosts||{},normalized=normalizeBoosts({...input,goldPass:input.goldPass??options.boost??0},base);
 const now=Number.isFinite(options.now)?options.now:Date.now(),forecastOptions={...options,base,builders,boost:normalized.goldPass,now};
 const described=forecast(snapshot,db,forecastOptions),reference=forecast(snapshot,db,{...forecastOptions,boost:0});
 const chains=scenarioChains(described.rows),clockRow=snapshot.rows.find(row=>row.base==='builder'&&row.data===1000039);
 const clockUnavailable=base==='builder'&&clockRow?.end?Math.max(0,(clockRow.end-now)/1000):0;
 const baseline={...described,...runScenario(chains,builders,normalizeBoosts({goldPass:normalized.goldPass},base),base,clockUnavailable,described.lab)};
 const accelerated=runScenario(chains,builders,normalized,base,clockUnavailable,baseline.lab);
 const withoutPotions=runScenario(chains,builders,{...normalized,builderPotions:0,researchPotions:0,petPotions:0,clockPotions:0},base,clockUnavailable,baseline.lab);
 const queueSavings={},potionQueueSavings={};for(const key of['building','lab','pets']){
  queueSavings[key]=Math.max(0,baseline[key]-accelerated[key]);potionQueueSavings[key]=Math.max(0,withoutPotions[key]-accelerated[key]);
 }
 const full=reference.rows.filter(row=>row.modeled).reduce((sum,row)=>sum+row.fullTime*row.count,0);
 const actualPercent=reference.percent,rawPotionWork=Object.values(accelerated.potionWorkSaved).reduce((sum,value)=>sum+value,0);
 const equivalentDelta=full?Math.min(100-actualPercent,rawPotionWork/full*100):0;
 const assumptions=[
  'Все выбранные зелья используются подряд с начала сценария. Новые улучшения запускаются сразу; ресурсы и разблокировки не задерживают очередь.',
  'Каждая цепочка уровней закреплена за одним строителем. Это один возможный порядок улучшений, а не точное расписание игры.',
  'Таймеры начатых улучшений уже содержат игровые скидки. Повторно Gold Pass и скидка события к ним не применяются.',
  'Gold Pass предполагается на всём горизонте. Событие уменьшает время только улучшений, начатых до указанного срока.',
  'Эквивалент прогресса показывает дополнительную работу зелий по справочному времени. Фактический прогресс подтверждается новым JSON.'
 ];
 if(normalized.apprenticeLevel||normalized.labAssistantLevel)assumptions.push('Помощники готовы в начале, работают час каждые 23 часа на одном улучшении. При досрочном завершении остаток часа не переносится; зелья не умножают их скорость.');
 if(base==='builder'&&(normalized.clockTowerDaily||normalized.clockPotions))assumptions.push('Часовая башня предполагается готовой в начале или после текущего улучшения: 10× на '+clockMinutes(normalized.clockTowerLevel)+' мин., затем 22 ч перерыва. Зелье добавляет 30 мин.; во время улучшения самой башни ускорение недоступно. Для будущих включений сохранён выбранный уровень.');
 return{baseline,accelerated:{...baseline,...accelerated,percent:actualPercent},withoutPotions:{...baseline,...withoutPotions,percent:actualPercent},
  savedSeconds:Math.max(0,baseline.time-accelerated.time),potionSavedSeconds:Math.max(0,withoutPotions.time-accelerated.time),
  queueSavings,potionQueueSavings,potionWorkSaved:accelerated.potionWorkSaved,actualPercent,projectedPercent:actualPercent+equivalentDelta,equivalentDelta,normalized,assumptions};
}
return{parse,hall,entity,cap,describe,allocate,forecast,groups,normalizeBoosts,helperLevels,clockMinutes,scenario};})();
if(typeof module!=='undefined')module.exports=ClashEngine;
