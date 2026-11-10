/* Clash Coach UI: transparent recommendations and browser-local replay notes. */
const ClashCoachUI = (() => {
  const state = { tab: 'armies', difficulty: 'all', selected: null, account: null, context: null, file: null, url: null, notes: [], playhead: 0, storageError: '', videoError: '', recommendationError: false };
  const types = { funnel: 'Воронка', deployment: 'Высадка', spell: 'Заклинание', hero: 'Герои', cleanup: 'Зачистка', other: 'Наблюдение' };
  const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const clock = seconds => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; };
  const selectedStrategy = recommendations => recommendations.find(item => item.id === state.selected) || recommendations[0] || null;
  function recommendations(context) {
    state.recommendationError = false;
    if (!context.engine || !context.snapshot || !Array.isArray(context.db)) return [];
    try { return context.engine.recommend(context.snapshot, context.db, context.meta, { base: context.base || 'home', difficulty: state.difficulty }); }
    catch { state.recommendationError = true; return []; }
  }
  function haltPlayback() {
    const video = document.getElementById('coach-video');
    if (video) { state.playhead = Number.isFinite(video.currentTime) ? video.currentTime : state.playhead; video.pause(); }
  }
  function ensureContext(context) {
    const account = context.snapshot?.raw?.tag || '#DEMO';
    if (state.account !== null && state.account !== account) {
      haltPlayback();
      if (state.url) URL.revokeObjectURL(state.url);
      Object.assign(state, { file: null, url: null, notes: [], playhead: 0, selected: null, storageError: '', videoError: '' });
    }
    state.account = account;
    state.context = context;
  }
  function image(item, context, className = '') {
    const entity = context.db?.find(entry => entry.id === item.id && entry.base === 'home');
    const path = ClashArt.image(entity, item.level ?? item.current);
    return path ? `<img class="${safe(className)}" src="${safe(path)}" alt="${safe(item.name || entity?.name || 'Игровой объект')}" loading="lazy">` : '<span class="coach-unit-placeholder" aria-hidden="true">◈</span>';
  }
  function list(items, className = '') {
    return items?.length ? `<ul class="coach-text-list ${className}">${items.map(item => `<li>${safe(item)}</li>`).join('')}</ul>` : '';
  }
  function unitStrip(items, context, kind) {
    return `<div class="coach-unit-strip">${(items || []).map(item => `<div class="coach-unit" title="${safe(item.name)}"><div class="coach-unit-art">${image(item, context)}${Number.isFinite(item.count) ? `<span>×${item.count}</span>` : ''}</div><b>${safe(item.name)}</b><small>${Number.isFinite(item.level) ? `Ур. ${item.level}${Number.isFinite(item.max) ? ' / ' + item.max : ''}` : 'Нет данных'}${item.active ? ' · в работе' : ''}</small>${kind === 'hero' && item.active ? '<em>Проверь доступность в игре</em>' : ''}</div>`).join('')}</div>`;
  }
  function armyView(context, options, selected) {
    if (context.base === 'builder') return '<div class="coach-empty"><span>♜</span><h3>Начинаем с основной деревни</h3><p>Подбор армий сейчас работает для основной деревни. Переключись на неё сверху. Разбор видеоповтора доступен в соседней вкладке.</p></div>';
    if (!context.meta || !context.engine) return '<div class="coach-empty"><span>◈</span><h3>Не удалось загрузить данные тренера</h3><p>Обнови страницу и попробуй ещё раз. Деревня уже сохранена в этом браузере.</p></div>';
    if (state.recommendationError) return '<div class="coach-empty"><span>◈</span><h3>Рекомендации пока недоступны</h3><p>Не получилось рассчитать подбор по этому снимку. Попробуй заново импортировать JSON. Остальные разделы трекера остаются доступны.</p></div>';
    const cards = options.map((item, index) => `<button class="coach-choice ${selected?.id === item.id ? 'selected' : ''}" data-coach-strategy="${safe(item.id)}" aria-pressed="${selected?.id === item.id}"><div class="coach-choice-top"><span class="coach-rank">${String(index + 1).padStart(2, '0')}</span><span class="coach-skill">${item.difficulty === 'precision' ? 'Нужна точность' : 'Проще освоить'}</span><span class="coach-choice-arrow">↗</span></div><div class="coach-choice-art">${(item.core || []).slice(0, 3).map(unit => image(unit, context)).join('')}</div><h3>${safe(item.name)}</h3><p>${safe(item.summary)}</p><div class="coach-score-line"><span>${safe(item.scoreLabel || 'Готовность по уровням')}</span><b>${item.score} / 100</b></div><div class="coach-readiness"><i style="width:${Math.max(0, Math.min(100, item.score || 0))}%"></i></div></button>`).join('');
    const filter = `<div class="coach-selection-bar"><div><span class="coach-kicker">ПО ТВОЕМУ ЭКСПОРТУ</span><h3>С чего начать тренировку</h3></div><label>Стиль освоения<select id="coach-difficulty"><option value="all">Все стратегии</option><option value="simple">Проще освоить</option><option value="precision">С точными действиями</option></select></label></div>`;
    if (!selected) return filter + '<div class="coach-empty"><span>⚑</span><h3>Подходящий шаблон пока не найден</h3><p>Попробуй другой фильтр или импортируй свежий JSON. Тренер не добавляет в армию войска, которых нет в твоём экспорте.</p></div>';
    const army = selected.army || {};
    const mainUnits = army.units?.length ? army.units : selected.core;
    const spells = army.spells?.length ? army.spells : selected.spells;
    const armyCapacity = Number.isFinite(army.capacity) ? `${army.used || 0} / ${army.capacity} мест` : 'Состав ядра армии';
    const spellCapacity = Number.isFinite(army.spellCapacity) ? `${army.spellUsed || 0} / ${army.spellCapacity} мест` : '';
    return filter + `<div class="coach-choices">${cards}</div><p class="coach-method">Готовность — сравнение уровней нужных войск, заклинаний и героев с максимумом твоей ратуши. Это не вероятность победы и не оценка расстановки противника.</p><div class="coach-detail"><div class="coach-detail-head"><div><div class="coach-kicker">ВЫБРАННАЯ СТРАТЕГИЯ · ТХ ${selected.minTH}+</div><h3>${safe(selected.name)}</h3><p>${safe(selected.summary)}</p></div><div class="coach-plan-actions"><button class="button ghost" id="coach-export-plan">Экспорт плана ↗</button><button class="button gold" id="coach-practice">Разобрать свою атаку →</button></div></div><div class="coach-detail-columns"><div><section class="coach-block"><div class="coach-block-title"><h4>Армия для тренировки</h4><span>${safe(armyCapacity)}</span></div>${unitStrip(mainUnits, context)}${army.complete === false ? '<p class="coach-small-note">Это ядро состава. Заполни свободные места поддержкой по ситуации; вместимость лагерей не превышена.</p>' : ''}</section><section class="coach-block"><div class="coach-block-title"><h4>Заклинания</h4><span>${safe(spellCapacity)}</span></div>${unitStrip(spells, context)}</section>${army.note ? `<p class="coach-small-note">${safe(army.note)}</p>` : ''}${selected.heroes?.length ? `<section class="coach-block"><div class="coach-block-title"><h4>Важные для стратегии герои</h4><span>Список из экспорта</span></div>${unitStrip(selected.heroes, context, 'hero')}<p class="coach-small-note">Это список героев из экспорта, а не выбранный состав для атаки. Проверь доступность и набор героев в игре.</p></section>` : ''}</div><aside class="coach-reason-panel"><span class="coach-kicker">ПОЧЕМУ ЭТОТ ВАРИАНТ</span>${list(selected.reasons)}${selected.warnings?.length || selected.missing?.length ? `<div class="coach-warning"><b>Что проверить перед атакой</b>${list([...(selected.warnings || []), ...(selected.missing || [])])}</div>` : ''}<div class="coach-matchup"><b>Когда пробовать</b>${list(selected.matchups?.favorable)}<b>Где быть внимательнее</b>${list(selected.matchups?.caution)}</div></aside></div></div><div class="coach-section-title"><span class="coach-kicker">ПЛАН НА ТРЕНИРОВКУ</span><h3>Три этапа атаки</h3></div><div class="coach-phases">${(selected.phases || []).map((phase, index) => `<article><span>0${index + 1}</span><h4>${safe(phase.title)}</h4><p>${safe(phase.text)}</p>${list(phase.checks)}</article>`).join('')}</div><div class="coach-section-title"><span class="coach-kicker">ЧТО УСИЛИТ ЭТУ АРМИЮ</span><h3>Следующие улучшения</h3></div><div class="coach-priorities">${selected.priorities?.length ? selected.priorities.slice(0, 6).map((item, index) => `<article><div class="coach-priority-number">${index + 1}</div>${image(item, context)}<div><b>${safe(item.name)}</b><span>Ур. ${item.current} → ${item.target}</span><p>${safe(item.reason)}</p></div></article>`).join('') : '<p class="coach-small-note">Для выбранного состава не найдены приоритетные улучшения. Тренируй порядок действий и выбор стороны захода.</p>'}</div>`;
  }
  function replayKey() {
    if (!state.file) return null;
    return `clash-coach-replay-v1:${encodeURIComponent(state.account)}:${encodeURIComponent(state.file.name)}:${state.file.size}:${state.file.lastModified}`;
  }
  function safeNotes(items) {
    return Array.isArray(items) ? items.filter(item => item && typeof item.id === 'string' && Number.isFinite(item.seconds) && item.seconds >= 0 && item.seconds <= 21600 && typeof item.body === 'string' && item.body.length <= 1500 && Object.hasOwn(types, item.type)).slice(0, 100) : [];
  }
  function saveNotes() {
    try {
      const key = replayKey();
      if (key) localStorage.setItem(key, JSON.stringify({ file: { name: state.file.name, size: state.file.size, lastModified: state.file.lastModified }, strategy: state.selected, notes: state.notes }));
      state.storageError = '';
      return true;
    } catch { state.storageError = 'Браузер не сохранил заметки. Экспортируй разбор, чтобы не потерять его.'; return false; }
  }
  function replayView(context, selected) {
    const notes = [...state.notes].sort((a, b) => a.seconds - b.seconds);
    return `<div class="coach-replay-intro"><div><span class="coach-kicker">ПОВТОР → НАБЛЮДЕНИЯ → СЛЕДУЮЩАЯ ТРЕНИРОВКА</span><h3>Разбери атаку по моментам</h3><p>Смотри повтор, отмечай важные события и сохрани свой план на следующую попытку.</p></div><label class="button gold coach-file-label" for="coach-video-file">${state.file ? 'Выбрать другой повтор' : '＋ Выбрать видеоповтор'}<input type="file" id="coach-video-file" accept="video/mp4,video/webm,.mp4,.webm" hidden></label></div><p class="coach-replay-status">Самостоятельный разбор повтора. Автоматический ИИ-разбор пока не подключён.</p><div class="coach-replay-layout"><div class="coach-player-column">${state.url ? `<div class="coach-player"><video id="coach-video" src="${safe(state.url)}" controls playsinline preload="metadata" aria-label="Видеоповтор атаки"></video></div><div class="coach-file-meta"><b>${safe(state.file.name)}</b><span>${Math.max(0.1, state.file.size / 1048576).toFixed(1)} МБ · видео остаётся на устройстве</span></div>` : '<div class="coach-video-empty"><span>▷</span><h4>Загрузи запись своей атаки</h4><p>MP4 или WebM, до 1 ГБ.<br>Файл откроется в этом браузере и никуда не отправится.</p><label class="button ghost coach-file-label" for="coach-video-file">Выбрать файл</label></div>'}<p class="coach-video-error" id="coach-video-error" role="alert">${safe(state.videoError)}</p><div class="coach-replay-checklist"><h4>На что смотреть</h4>${selected ? `<p class="coach-small-note">Тренировка: <b>${safe(selected.name)}</b></p>` : ''}<div>${(selected?.phases?.length ? selected.phases : [{ title: 'Воронка', text: 'Основные войска пошли внутрь базы или вокруг неё?' }, { title: 'Ключевой момент', text: 'Что происходило перед потерей основной группы?' }, { title: 'Зачистка', text: 'Хватило ли времени и войск на крайние здания?' }]).map(phase => `<article><b>${safe(phase.title)}</b><p>${safe(phase.text)}</p></article>`).join('')}</div></div></div><div class="coach-notes-column"><div class="coach-notes-heading"><h4>Заметки к повтору</h4><span>${notes.length} / 100</span></div>${state.file ? `<form id="coach-note-form"><div class="coach-note-row"><label>Момент<input id="coach-note-time" value="${clock(state.playhead)}" inputmode="numeric" placeholder="0:00" maxlength="8" required></label><button class="chip" type="button" id="coach-mark-now">Метка сейчас</button></div><label>Что разбираем<select id="coach-note-type">${Object.entries(types).map(([key, title]) => `<option value="${key}">${title}</option>`).join('')}</select></label><label>Наблюдение и что попробовать<textarea id="coach-note-body" placeholder="Например: королева ушла по краю. В следующей попытке заранее убрать внешнее здание." required maxlength="1500"></textarea></label><p id="coach-note-error" role="alert"></p><button type="submit" class="button gold wide">＋ Добавить отметку</button></form>` : '<p class="coach-small-note">Выбери видео, чтобы добавлять отметки. После повторного выбора того же файла сохранённые заметки восстановятся.</p>'}<p class="coach-storage-error" id="coach-storage-error" role="status">${safe(state.storageError)}</p><div id="coach-note-list">${notes.length ? notes.map(note => `<article class="coach-note"><div><button class="coach-seek" data-coach-seek="${note.seconds}" title="Перейти к моменту">${clock(note.seconds)} ↗</button><span>${types[note.type]}</span><button class="coach-delete-note" data-coach-delete="${safe(note.id)}" aria-label="Удалить заметку ${clock(note.seconds)}">×</button></div><p>${safe(note.body)}</p></article>`).join('') : '<div class="coach-note-empty">Первую заметку можно добавить в момент, где атака пошла по плану — или изменилась.</div>'}</div>${notes.length ? '<button class="button ghost wide" id="coach-export-notes">Экспорт разбора в JSON ↗</button>' : ''}<p class="coach-small-note">Сохраняются только заметки и сведения о файле. После обновления страницы нужно выбрать видео заново.</p></div></div>`;
  }
  function render(context) {
    ensureContext(context);
    const options = recommendations(context);
    const selected = selectedStrategy(options);
    if (selected) state.selected = selected.id;
    return `<section id="clash-coach" class="clash-coach"><div class="coach-heading"><div><span class="eyebrow">ЛИЧНАЯ ТРЕНИРОВОЧНАЯ КОМНАТА</span><h2>Clash <span>Coach</span><sup>BETA</sup></h2><p>Собери армию под свои уровни. Пойми, что улучшать. Разбери следующую атаку.</p></div><div class="coach-emblem" aria-hidden="true">⚔</div></div><div class="coach-tabs" role="tablist" aria-label="Раздел тренера"><button type="button" role="tab" aria-selected="${state.tab === 'armies'}" class="${state.tab === 'armies' ? 'active' : ''}" data-coach-tab="armies">◈ Подбор армии</button><button type="button" role="tab" aria-selected="${state.tab === 'replay'}" class="${state.tab === 'replay' ? 'active' : ''}" data-coach-tab="replay">▷ Разбор повтора</button><span>${context.demo ? 'Демо · импортируй свой JSON' : 'По уровням твоей деревни'}</span></div>${context.demo ? '<div class="coach-demo-note">Сейчас показан пример. Импортируй свой JSON кнопкой сверху — рекомендации пересчитаются под твою деревню.</div>' : ''}<div class="coach-tab-content" role="tabpanel">${state.tab === 'armies' ? armyView(context, options, selected) : replayView(context, selected)}</div><p class="coach-footer-note">Первая версия использует учебные шаблоны стратегий и твои уровни. Питомцы и снаряжение пока не участвуют в оценке. Отдельная модель на атаках киберспортсменов ещё не обучена. Для выбора точной стороны захода нужна расстановка противника.</p></section>`;
  }
  function repaint(capturePlayback = true) {
    if (capturePlayback) haltPlayback();
    const container = document.getElementById('clash-coach');
    if (!container || !state.context) return;
    container.outerHTML = render(state.context);
    mount(state.context);
  }
  function download(name, body) {
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function chooseVideo(file) {
    if (!file) return;
    if (!/\.(mp4|webm)$/i.test(file.name) && !['video/mp4', 'video/webm'].includes(file.type)) { state.context?.toast?.('Выбери видео MP4 или WebM'); return; }
    if (file.size > 1073741824) { state.context?.toast?.('Для разбора выбери видео до 1 ГБ'); return; }
    haltPlayback();
    if (state.url) URL.revokeObjectURL(state.url);
    state.file = file;
    state.url = URL.createObjectURL(file);
    state.playhead = 0;
    state.videoError = '';
    state.notes = [];
    state.storageError = '';
    try {
      const saved = JSON.parse(localStorage.getItem(replayKey()) || 'null');
      if (saved) state.notes = safeNotes(saved.notes);
    } catch { state.storageError = 'Сохранённые заметки прочитать не удалось. Новые отметки можно экспортировать в файл.'; }
    repaint(false);
    state.context?.toast?.(state.notes.length ? 'Повтор открыт. Заметки восстановлены.' : 'Повтор открыт только в этом браузере.');
  }
  function mount(context) {
    ensureContext(context);
    const root = document.getElementById('clash-coach');
    if (!root) return;
    const options = recommendations(context);
    const selected = selectedStrategy(options);
    const changeTab = tab => {
      state.tab = tab;
      repaint();
      document.querySelector(`[data-coach-tab="${tab}"]`)?.focus();
    };
    root.querySelectorAll('[data-coach-tab]').forEach(button => {
      button.tabIndex = button.dataset.coachTab === state.tab ? 0 : -1;
      button.onclick = () => changeTab(button.dataset.coachTab);
    });
    const tabList = root.querySelector('[role="tablist"]');
    if (tabList) tabList.onkeydown = event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      changeTab(event.key === 'Home' ? 'armies' : event.key === 'End' ? 'replay' : state.tab === 'armies' ? 'replay' : 'armies');
    };
    root.querySelectorAll('[data-coach-strategy]').forEach(button => button.onclick = () => { state.selected = button.dataset.coachStrategy; repaint(); });
    const difficulty = root.querySelector('#coach-difficulty');
    if (difficulty) { difficulty.value = state.difficulty; difficulty.onchange = event => { state.difficulty = event.target.value; repaint(); }; }
    const practice = root.querySelector('#coach-practice');
    if (practice) practice.onclick = () => { state.tab = 'replay'; repaint(); };
    const exportPlan = root.querySelector('#coach-export-plan');
    if (exportPlan) exportPlan.onclick = () => download('clash-coach-plan.json', JSON.stringify({ version: 1, type: 'strategy-plan', playerTag: state.account, strategy: selected, disclaimer: 'Подбор по уровням, не прогноз победы. Проверяй состав и доступность героев в игре.' }, null, 2));
    const upload = root.querySelector('#coach-video-file');
    if (upload) upload.onchange = event => chooseVideo(event.target.files[0]);
    const video = root.querySelector('#coach-video');
    if (video) {
      video.onloadedmetadata = () => { if (Number.isFinite(video.duration)) video.currentTime = Math.min(state.playhead, video.duration); };
      video.ontimeupdate = () => { if (Number.isFinite(video.currentTime)) state.playhead = video.currentTime; };
      video.onerror = () => { state.videoError = 'Браузер не смог воспроизвести этот формат. Попробуй запись MP4 с кодеком H.264 или WebM.'; const error = root.querySelector('#coach-video-error'); if (error) error.textContent = state.videoError; };
    }
    const now = root.querySelector('#coach-mark-now');
    if (now) now.onclick = () => { const time = video && Number.isFinite(video.currentTime) ? video.currentTime : state.playhead; root.querySelector('#coach-note-time').value = clock(time); root.querySelector('#coach-note-body').focus(); };
    const form = root.querySelector('#coach-note-form');
    if (form) form.onsubmit = event => {
      event.preventDefault();
      const rawTime = root.querySelector('#coach-note-time').value.trim();
      const body = root.querySelector('#coach-note-body').value.trim();
      const error = root.querySelector('#coach-note-error');
      const match = rawTime.match(/^(\d{1,3}):([0-5]\d)$/);
      if (!match) { error.textContent = 'Укажи время в формате минуты:секунды, например 1:25.'; return; }
      const seconds = Number(match[1]) * 60 + Number(match[2]);
      if (!body) { error.textContent = 'Добавь короткое наблюдение.'; return; }
      if (body.length > 1500 || seconds > 21600) { error.textContent = 'Проверь длину заметки и время отметки.'; return; }
      if (video && Number.isFinite(video.duration) && seconds > video.duration) { error.textContent = 'Эта отметка позже окончания видео.'; return; }
      if (state.notes.length >= 100) { error.textContent = 'Для одного повтора доступно 100 заметок. Экспортируй текущий разбор.'; return; }
      state.notes.push({ id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, seconds, body, type: root.querySelector('#coach-note-type').value });
      saveNotes();
      repaint();
      state.context?.toast?.(state.storageError || 'Отметка добавлена и сохранена в браузере.');
    };
    root.querySelectorAll('[data-coach-seek]').forEach(button => button.onclick = () => { const currentVideo = document.getElementById('coach-video'); if (!currentVideo) return; currentVideo.currentTime = Number(button.dataset.coachSeek); currentVideo.focus(); });
    root.querySelectorAll('[data-coach-delete]').forEach(button => button.onclick = () => { state.notes = state.notes.filter(note => note.id !== button.dataset.coachDelete); saveNotes(); repaint(); });
    const exportNotes = root.querySelector('#coach-export-notes');
    if (exportNotes) exportNotes.onclick = () => download('clash-coach-replay-notes.json', JSON.stringify({ version: 1, type: 'manual-replay-review', playerTag: state.account, file: state.file ? { name: state.file.name, size: state.file.size, lastModified: state.file.lastModified } : null, strategy: selected?.name || null, notes: [...state.notes].sort((a, b) => a.seconds - b.seconds), videoIncluded: false }, null, 2));
  }
  function cleanup() { haltPlayback(); }
  return { render, mount, cleanup };
})();



