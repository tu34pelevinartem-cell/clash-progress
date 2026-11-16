/* Share a rendered summary; never send the village export to a service. */
const ClashProgressShare=(()=>{
'use strict';
const SITE='https://tu34pelevinartem-cell.github.io/clash-progress/';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let revision=0;
function makeModel(ctx={},includeTag=false){
 const raw=ctx.snapshot?.raw||{},base=ctx.base==='builder'?'builder':'home',result=ctx.result||{};
 const rows=ctx.snapshot?.rows||[],hall=rows.find(r=>r.data===(base==='home'?1000001:1000034))?.level??null;
 const definition=(ctx.db||[]).find(d=>d.base===base&&d.slug===(base==='home'?'town-hall':'builder-hall'));
 const artwork=(d,l)=>typeof ClashArt!=='undefined'?ClashArt.image(d,l):null;
 const heroes=rows.filter(r=>r.base===base&&(r.group==='heroes'||r.group==='heroes2')).slice(0,6).map(r=>{const d=(ctx.db||[]).find(x=>x.id===r.data&&x.base===base);return{level:r.level,name:ctx.name?ctx.name({...r,d}):d?.name||'Герой',image:artwork(d,r.level)}});
 const percent=Number.isFinite(result.percent)?Math.max(0,Math.min(100,result.percent)):null;
 const partial=result.timeComplete===false,seconds=Number.isFinite(result.time)?Math.max(0,result.time):null;
 const time=seconds===null||partial&&seconds===0?'Уточняется':ctx.duration?ctx.duration(seconds):Math.ceil(seconds/86400)+' д';
 const date=Number.isFinite(raw.timestamp)?new Date(raw.timestamp*1000).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}):'Дата не указана';
 return{title:base==='home'?'Ратуша':'Дом строителя',hall,base,heroes,percent,partial,progressPartial:result.progressComplete===false,time,date,
  target:Number.isInteger(result.target)?result.target:hall,image:artwork(definition,hall),objects:Number.isFinite(result.objects)?result.objects:0,maxed:Number.isFinite(result.maxed)?result.maxed:0,
  planned:Number.isFinite(result.plannedObjects)?result.plannedObjects:0,tag:includeTag&&!ctx.demo?raw.tag||'':null,demo:!!ctx.demo};
}
async function loadImage(src){
 if(typeof src!=='string'||!/^assets\/[a-zA-Z0-9_./-]+\.(?:png|webp)$/.test(src)||src.includes('..'))return null;
 return new Promise(resolve=>{const img=new Image(),timer=setTimeout(()=>resolve(null),5000);img.onload=()=>{clearTimeout(timer);resolve(img)};img.onerror=()=>{clearTimeout(timer);resolve(null)};img.src=src;});
}
async function buildCanvas(model){
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1080;const c=canvas.getContext('2d');
 if(!c)throw Error('Браузер не поддерживает создание карточки');
 const images=await Promise.all([loadImage(model.image),...model.heroes.map(h=>loadImage(h.image))]);
 const box=(x,y,w,h,fill='#25231e',stroke='#4b4435',radius=15)=>{c.beginPath();c.roundRect(x,y,w,h,radius);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}};
 const text=(value,x,y,size=24,color='#aaa18f',weight=400,max=950)=>{c.font=weight+' '+size+'px Arial, sans-serif';c.fillStyle=color;let s=String(value??'');while(c.measureText(s).width>max&&s.length>1)s=s.slice(0,-2)+'…';c.fillText(s,x,y);};
 c.fillStyle='#141411';c.fillRect(0,0,1080,1080);const glow=c.createRadialGradient(860,240,10,860,240,600);glow.addColorStop(0,'#71572c55');glow.addColorStop(1,'#14141100');c.fillStyle=glow;c.fillRect(0,0,1080,1080);
 c.strokeStyle='#ae8b4655';c.lineWidth=2;c.strokeRect(24,24,1032,1032);
 text('CLASH PROGRESS',64,92,28,'#e2bf7b',700);text(model.demo?'ПРИМЕР ДЕРЕВНИ':'МОЙ ПРОГРЕСС',64,128,17,'#a79b83',700);
 text(model.title+' '+(model.hall??'—'),64,224,58,'#f4eddd',700,620);if(model.tag)text(model.tag,67,265,23,'#bca77f',400,580);
 const image=images[0];if(image){const k=Math.min(285/image.width,285/image.height);c.drawImage(image,756+(285-image.width*k)/2,145+(285-image.height*k)/2,image.width*k,image.height*k);}
 text(model.percent===null?'—':model.percent.toLocaleString('ru-RU',{maximumFractionDigits:1})+'%',60,371,100,'#e1bd77',700,680);
 text((model.progressPartial?'ПО ИЗВЕСТНЫМ УРОВНЯМ':'ПРОГРЕСС ПО ВРЕМЕНИ')+' · ЦЕЛЬ '+(model.base==='home'?'ТХ':'ДС')+model.target,66,410,17,'#b7aa8c',700);
 box(64,438,952,11,'#3a352a',null,5);if(model.percent>0)box(64,438,Math.max(8,952*model.percent/100),11,'#d2ae66',null,5);
 box(64,484,480,143);box(560,484,220,143);box(796,484,220,143);
 text(model.partial?'Известная часть плана':'Оценка до цели',86,519,18);text(model.time,86,574,36,'#e7cd91',700,438);
 text('Объектов',580,519,18);text(model.objects,580,574,36,'#eee7d5',700,170);
 text('На цели',816,519,18);text(model.maxed,816,574,36,'#eee7d5',700,170);
 text('ГЕРОИ ДЕРЕВНИ',64,682,18,'#c8b488',700);
 if(!model.heroes.length)text('В снимке нет героев этой деревни',64,767,24);
 const width=145,gap=16;model.heroes.forEach((hero,i)=>{const x=64+i*(width+gap);box(x,708,width,185,'#211f1a');const image=images[i+1];if(image){const k=Math.min(105/image.width,105/image.height);c.drawImage(image,x+(width-image.width*k)/2,718+(105-image.height*k)/2,image.width*k,image.height*k);}else text('◆',x+55,784,36,'#a8905b');text(hero.name,x+10,851,16,'#c8c0af',400,width-20);text('Ур. '+(hero.level??'—'),x+10,877,20,'#e6c582',700,width-20);});
 text('Снимок: '+model.date,64,951,20,'#b8ae99');
 text(model.partial?'Полный срок пока уточняется. Указана известная часть работы.':'По объектам из снимка при непрерывных улучшениях.',64,983,18,'#8c8475');
 text(model.planned?'В срок включён ручной план: '+model.planned+' объектов. Уровни — из JSON.':'clash-progress · неофициальный фанатский проект',64,1017,17,'#998b6d');
 return canvas;
}
function toBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось создать PNG')),'image/png'));}
function filename(model){return'clash-progress-'+model.base+'-'+(model.hall??'village')+'.png';}
function download(blob,model){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename(model);a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function open(ctx){
 document.querySelector('#progress-share-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='progress-share-dialog';
 dialog.innerHTML=`<div class="dialog-head"><div><div class="eyebrow">ДЛЯ ТВОИХ ДРУЗЕЙ</div><h2>Карточка прогресса</h2></div><button type="button" data-share-close aria-label="Закрыть">×</button></div><p class="share-description">Сохрани картинку или отправь друзьям. Данные деревни остаются на устройстве.</p><label class="share-tag"><input type="checkbox" id="share-tag"${ctx.demo?' disabled':''}>Показать тег аккаунта</label><div id="share-preview" aria-label="Предпросмотр карточки"></div><p id="share-status" role="status">Создаём картинку…</p><div class="share-actions"><button type="button" class="button gold" data-share-download disabled>Скачать PNG</button><button type="button" class="button ghost" data-share-native disabled>Отправить картинку</button><button type="button" class="button ghost" data-share-link>Ссылка на сайт</button></div>`;
 document.body.append(dialog);dialog.showModal();let blob=null,model=null;
 const status=dialog.querySelector('#share-status'),native=dialog.querySelector('[data-share-native]');
 const close=()=>{revision++;dialog.close();dialog.remove();};dialog.querySelector('[data-share-close]').onclick=close;dialog.addEventListener('cancel',()=>{revision++;dialog.remove();});
 const paint=async()=>{const token=++revision;dialog.querySelector('[data-share-download]').disabled=true;native.disabled=true;try{model=makeModel(ctx,dialog.querySelector('#share-tag').checked);const canvas=await buildCanvas(model),next=await toBlob(canvas);if(token!==revision||!dialog.isConnected)return;blob=next;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Карточка прогресса: '+model.title+' '+model.hall);dialog.querySelector('#share-preview').replaceChildren(canvas);dialog.querySelector('[data-share-download]').disabled=false;native.disabled=false;status.textContent=model.demo?'Демонстрационная карточка. Для своей деревни импортируй JSON.':model.partial?'Карточка готова. Полный срок пока уточняется.':'Карточка готова.';}catch(error){status.textContent=error.message||'Не удалось создать карточку';}};
 dialog.querySelector('#share-tag').onchange=paint;
 dialog.querySelector('[data-share-download]').onclick=()=>{if(blob)download(blob,model)};
 native.onclick=async()=>{if(!blob)return;const file=new File([blob],filename(model),{type:'image/png'});try{if(navigator.canShare?.({files:[file]})&&navigator.share)await navigator.share({files:[file],title:'Мой прогресс Clash of Clans'});else{download(blob,model);status.textContent='Картинка сохранена. Прикрепи её в своём мессенджере.';}}catch(error){if(error.name!=='AbortError')status.textContent='Не удалось отправить. Используй «Скачать PNG».';}};
 dialog.querySelector('[data-share-link]').onclick=async()=>{try{await navigator.clipboard.writeText(SITE);status.textContent='Ссылка на сайт скопирована. Для своего прогресса отправь картинку.';}catch{status.textContent='Ссылка на сайт: '+SITE;}};
 await paint();return dialog;
}
return{open,makeModel,buildCanvas};
})();
if(typeof window!=='undefined')window.ClashProgressShare=ClashProgressShare;
if(typeof module!=='undefined')module.exports=ClashProgressShare;
