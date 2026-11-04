/*
 * Clash Coach baseline. This is an inspectable ruleset, not a trained model.
 * Scores compare imported levels with the current Town Hall cap; they are not
 * victory probabilities. Army counts are practice templates for home camps.
 */
const ClashCoachEngine = (() => {
  const engine = typeof ClashEngine !== 'undefined' ? ClashEngine :
    typeof require === 'function' ? require('./engine.js') : null;
  const troopNames = {
    4000000: 'Варвар', 4000001: 'Лучница', 4000004: 'Стенобой',
    4000005: 'Воздушный шар', 4000006: 'Колдун', 4000007: 'Целительница',
    4000008: 'Дракон', 4000011: 'Всадник на кабане', 4000015: 'Ведьма',
    4000023: 'Маленький дракон', 4000024: 'Шахтёр', 4000053: 'Йети',
    4000058: 'Ледяной голем', 4000059: 'Электродракон',
    26000001: 'Исцеление', 26000002: 'Ярость', 26000003: 'Прыжок',
    26000005: 'Заморозка', 26000009: 'Яд',
    28000000: 'Король варваров', 28000001: 'Королева лучниц',
    28000002: 'Хранитель', 28000004: 'Королевский чемпион',
    28000006: 'Принц миньонов', 28000007: 'Герцог драконов',
    1000000: 'Армейский лагерь'
  };
  const heroIds = [28000000, 28000001, 28000002, 28000004, 28000006, 28000007];
  const definitions = [
    {
      id: 'dragons-balloons', name: 'Драконы и шары', minTH: 7,
      summary: 'Воздушной армии проще сохранить направление при аккуратной воронке.',
      style: 'air', difficulty: 'simple', core: [4000008, 4000005],
      requiredSpells: [26000002], optional: [4000023], spellIds: [26000002, 26000005, 26000009],
      heroWeight: 0.18,
      phases: [
        {title: '1. Выбери направление', text: 'На дружеской атаке найди путь через важные воздушные защиты. Сначала убери крайние здания с двух сторон будущего входа.', checks: ['Основная армия не должна расходиться по краям.', 'Учитывай направление чистильщиков.']},
        {title: '2. Проведи основную группу', text: 'Выпускай драконов в подготовленный коридор. Шарами поддержи вход к защите; Ярость используй там, где сражается плотная группа войск.', checks: ['Не расходуй Ярость на войска, которые уже уходят из зоны.', 'Заморозка, если она есть, должна останавливать опасную защиту в нужный момент.']},
        {title: '3. Проверь зачистку', text: 'Следи, какие постройки оставлены по краям и хватает ли времени. После повтора запиши, где драконы ушли с намеченного пути.', checks: ['Оставь доступные войска зачистки.', 'В следующей тренировке меняй один элемент захода.']}
      ],
      matchups: {favorable: ['Есть понятный коридор к ключевым защитам.', 'Воронку можно сделать без большой отдельной группы.'], caution: ['Чистильщики направлены против захода.', 'Ключевые защиты сильно разнесены; основной группе придётся долго лететь.']}
    },
    {
      id: 'electro-balloons', name: 'Электродраконы и шары', minTH: 11,
      summary: 'Шаблон для тренировки воздушного захода и цепных ударов по близким зданиям.',
      style: 'air', difficulty: 'simple', core: [4000059, 4000005],
      requiredSpells: [26000002], optional: [4000023], spellIds: [26000002, 26000005, 26000009],
      heroWeight: 0.18,
      phases: [
        {title: '1. Найди цепочки', text: 'Посмотри, где близко стоят здания и возможны последовательные удары. Подготовь края, чтобы электродраконы не пошли вдоль периметра.', checks: ['Не выбирай сторону только по близости ратуши.', 'Отметь чистильщики и воздушную защиту.']},
        {title: '2. Сохрани темп атаки', text: 'Основную группу направь в подготовленный сектор, шары используй для поддержки против защиты. Ярость ставь по фактическому движению войск.', checks: ['Проверяй, попадает ли основная группа в заклинания.', 'Замораживай угрозу до потери основной группы, если Заморозка есть в составе.']},
        {title: '3. Разбери потерю времени', text: 'Электродраконы атакуют медленно. На повторе посмотри, не тратили ли они удары на одиночные крайние постройки.', checks: ['Запиши первый момент ухода с маршрута.', 'Сравни один и тот же заход на дружеских испытаниях.']}
      ],
      matchups: {favorable: ['Плотные группы построек дают возможности для цепных ударов.', 'Основная группа может дойти до центра одним направлением.'], caution: ['Широкие разрывы между постройками.', 'Войска долго стоят под защитой или постоянно меняют цель.']}
    },
    {
      id: 'yeti-witch', name: 'Йети и ведьмы', minTH: 12,
      summary: 'Наземный шаблон: удержать армию в коридоре и провести поддержку за основными войсками.',
      style: 'ground', difficulty: 'simple', core: [4000053, 4000015],
      requiredSpells: [26000002, 26000003], optional: [4000058, 4000006],
      spellIds: [26000002, 26000003, 26000005, 26000009], heroWeight: 0.28,
      phases: [
        {title: '1. Подготовь наземный коридор', text: 'Очисти внешние здания по бокам входа. Наметь, какие отсеки нужно связать Прыжком; проверь это до начала основной высадки.', checks: ['Внешние здания не должны увести основную группу в обход.', 'Прыжок должен соединять нужные участки стен.']},
        {title: '2. Проведи поддержку', text: 'Вводи основную группу йети и ведьм в подготовленный сектор. Держи хрупкую поддержку за основной группой; заклинания ставь по реальному маршруту.', checks: ['Не рассчитывай на путь, если войска уже ушли в другую сторону.', 'Способность героя используй по ситуации; готовый шаблон не определяет её тайминг.']},
        {title: '3. Посмотри, где армия разделилась', text: 'В повторе найди первое разделение группы и причину: крайние здания, стены или защиту. Выбери одну корректировку для следующего захода.', checks: ['Проверь, сопровождали ли ведьмы основную группу.', 'Отмечай не только процент разрушения, но и причины потери войск.']}
      ],
      matchups: {favorable: ['Можно организовать один наземный маршрут через важные отсеки.', 'Есть удобные точки для подготовки воронки.'], caution: ['Несколько несвязанных маршрутов, требующих разных заклинаний.', 'Без воронки армия расходится вокруг базы.']}
    },
    {
      id: 'queen-hybrid', name: 'Квин-хил + гибрид', minTH: 10,
      summary: 'Точный контроль королевы, затем отдельный заход шахтёров и всадников.',
      style: 'ground', difficulty: 'precision', core: [4000024, 4000011, 4000007],
      requiredHero: 28000001, requiredSpells: [26000001, 26000002],
      optional: [4000023, 4000004, 4000005],
      spellIds: [26000001, 26000002, 26000005, 26000009], heroWeight: 0.4,
      phases: [
        {title: '1. Поставь задачу королеве', text: 'Выбери цель для квин-хила и подготовь ей маршрут. Следи за целительницами и угрозами королеве; это отдельная управляемая часть атаки.', checks: ['Не запускай вторую фазу только по секундомеру.', 'Проверь, достигнута ли задача королевы и стабилен ли её маршрут.']},
        {title: '2. Запусти гибрид', text: 'Когда сформирован маршрут, вводи шахтёров и всадников в оставшуюся часть базы. Исцеление используй в местах, где основная группа действительно получает урон.', checks: ['Основная группа должна получать эффект Исцеления.', 'Разделение войск уменьшает ценность одного заклинания.']},
        {title: '3. Раздели внимание и оцени результат', text: 'Проверь в повторе два сюжета отдельно: выполнение задачи королевой и движение гибрида. Для тренировки сначала отработай стабильный заход королевы.', checks: ['Запиши первый момент, когда королеве требовалось вмешательство.', 'Следующую тренировку посвяти одному из двух этапов.']}
      ],
      matchups: {favorable: ['Для королевы есть достижимая и полезная цель.', 'После её захода остаётся связный путь для гибрида.'], caution: ['Нестабильный маршрут королевы.', 'Нужно одновременно контролировать несколько критических участков.', 'Низкие уровни героев относительно ратуши увеличивают требования к исполнению.']}
    }
  ];

  function metaEntry(meta, id) {
    if (!meta) return null;
    const list = Array.isArray(meta) ? meta : meta.entities;
    if (Array.isArray(list)) return list.find(x => Number(x.id ?? x.dataId) === id && (!x.base || x.base === 'home')) || null;
    return (list && (list[id] || list[String(id)])) || meta[id] || null;
  }
  function finitePositive(value) { return Number.isFinite(value) && value > 0; }
  function heroImportance(spec, id) {
    const weights = spec.id === 'queen-hybrid' ? {28000001: 2.1, 28000002: .7, 28000000: .35, 28000004: .4} :
      spec.id === 'yeti-witch' ? {28000002: 1, 28000000: .7, 28000001: .6} :
      {28000002: 1.1, 28000006: .65, 28000001: .45, 28000000: .3};
    return weights[id] || .2;
  }
  function currentContext(snapshot, db, meta, options) {
    if (!snapshot || !Array.isArray(snapshot.rows) || !Array.isArray(db) || !engine) return null;
    if ((options.base || 'home') !== 'home') return null;
    const rows = snapshot.rows.filter(r => r && r.base === 'home');
    const hall = engine.hall(snapshot, 'home');
    if (!Number.isInteger(hall) || hall < 1) return null;
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    function unit(id) {
      const row = rows.filter(r => r.data === id && Number.isInteger(r.level) && r.level > 0).sort((a, b) => b.level - a.level)[0];
      const d = engine.entity(db, id, 'home');
      if (!row || !d || !Array.isArray(d.levels)) return null;
      const limit = engine.cap(d, db, hall, 'current');
      if (!finitePositive(limit)) return null;
      const m = metaEntry(meta, id);
      const housing = finitePositive(m?.housingSpace) ? m.housingSpace : null;
      return {id, name: troopNames[id] || d.name, level: row.level, max: Math.max(limit, row.level), ratio: Math.min(1, row.level / limit), active: row.end !== null && Number.isFinite(row.end) && row.end > now, available: true, image: d.image || null, housing, group: row.group};
    }
    function buildingCapacity(id, field) {
      const buildingRows = rows.filter(r => r.data === id && Number.isInteger(r.level));
      if (!buildingRows.length) return null;
      const m = metaEntry(meta, id);
      if (!m || !Array.isArray(m.levels)) return null;
      let capacity = 0;
      for (const row of buildingRows) {
        const level = m.levels.find(l => l.level === row.level);
        const count = row.count ?? 1;
        const value = level?.[field];
        if (!Number.isFinite(value) || value < 0 || !Number.isInteger(count) || count < 1) return null;
        capacity += value * count;
      }
      return finitePositive(capacity) && capacity <= 1000 ? capacity : null;
    }
    const capacity = buildingCapacity(1000000, 'capacity');
    const mainSpells = buildingCapacity(1000020, 'spellCapacity');
    const darkRows = rows.some(r => r.data === 1000029);
    const darkSpells = darkRows ? buildingCapacity(1000029, 'spellCapacity') : 0;
    const spellCapacity = mainSpells !== null && darkSpells !== null ? mainSpells + darkSpells : null;
    return {rows, hall, now, unit, capacity, spellCapacity};
  }
  function buildArmy(spec, context) {
    const {capacity, spellCapacity, unit} = context;
    const units = new Map(), spells = new Map();
    function add(map, id, wanted, limit) {
      const item = unit(id);
      if (!item || !finitePositive(item.housing) || !finitePositive(limit)) return;
      const used = [...map.values()].reduce((sum, x) => sum + x.housing * x.count, 0);
      const count = Math.min(Math.max(0, Math.floor(wanted)), Math.floor((limit - used) / item.housing));
      if (count < 1) return;
      const existing = map.get(id);
      map.set(id, {...item, count: count + (existing?.count || 0)});
    }
    const haveHousing = spec.core.every(id => finitePositive(unit(id)?.housing));
    if (capacity !== null && haveHousing) {
      if (spec.id === 'dragons-balloons') {
        add(units, 4000008, Math.round(capacity * .78 / unit(4000008).housing), capacity);
        add(units, 4000023, 1, capacity);
        add(units, 4000005, Math.floor(capacity * .18 / unit(4000005).housing), capacity);
      } else if (spec.id === 'electro-balloons') {
        add(units, 4000059, Math.round(capacity * .80 / unit(4000059).housing), capacity);
        add(units, 4000023, 1, capacity);
      } else if (spec.id === 'yeti-witch') {
        add(units, 4000053, Math.max(1, Math.floor(capacity * .48 / unit(4000053).housing)), capacity);
        add(units, 4000015, Math.max(1, Math.floor(capacity * .30 / unit(4000015).housing)), capacity);
        add(units, 4000058, 2, capacity);
      } else if (spec.id === 'queen-hybrid') {
        add(units, 4000007, 5, capacity);
        add(units, 4000023, 1, capacity);
        add(units, 4000004, 4, capacity);
        add(units, 4000005, 3, capacity);
        const used = [...units.values()].reduce((sum, x) => sum + x.housing * x.count, 0);
        add(units, 4000024, Math.max(1, Math.floor((capacity - used) * .58 / unit(4000024).housing)), capacity);
      }
      const fillers = spec.id === 'electro-balloons' ? [4000005, 4000001, 4000000] :
        spec.id === 'queen-hybrid' ? [4000011, 4000024, 4000001, 4000000] :
        [...spec.core.slice(0, 2), 4000006, 4000001, 4000000];
      for (const id of fillers) add(units, id, capacity, capacity);
    }
    if (spellCapacity !== null) {
      const recipe = spec.id === 'queen-hybrid' ? [[26000001, 2], [26000002, 2], [26000009, 1], [26000005, 2]] :
        spec.id === 'yeti-witch' ? [[26000002, 2], [26000003, 1], [26000009, 1], [26000005, 4]] :
        [[26000002, 3], [26000009, 1], [26000005, 4]];
      for (const [id, count] of recipe) add(spells, id, count, spellCapacity);
      for (const id of spec.spellIds) add(spells, id, spellCapacity, spellCapacity);
    }
    const unitList = [...units.values()], spellList = [...spells.values()];
    const used = capacity !== null && haveHousing ? unitList.reduce((sum, x) => sum + x.housing * x.count, 0) : null;
    const spellUsed = spellCapacity !== null ? spellList.reduce((sum, x) => sum + x.housing * x.count, 0) : null;
    return {capacity, used, complete: used !== null && used === capacity, units: unitList,
      spellCapacity, spellUsed, spellComplete: spellUsed !== null && spellUsed === spellCapacity, spells: spellList,
      note: 'Тренировочный шаблон. Учитываются свои лагеря и заклинания; войска крепости клана, осадная машина и активный состав героев не добавляются автоматически.'};
  }
  function prioritiesFor(spec, core, spells, heroes, context) {
    const candidates = [];
    for (const item of [...core, ...spells, ...heroes]) {
      if (item.level >= item.max) continue;
      const kind = item.group === 'heroes' ? 'hero' : item.group === 'spells' ? 'spell' : 'troop';
      const importance = kind === 'hero' ? heroImportance(spec, item.id) : spec.core.includes(item.id) ? 1.1 : .65;
      candidates.push({id: item.id, name: item.name, current: item.level, target: item.level + 1,
        reason: item.active ? 'Улучшение уже идёт по таймеру снимка; после завершения обнови JSON.' :
          kind === 'hero' ? 'Важен для выполнения задач героев в этой стратегии.' :
          kind === 'spell' ? 'Поддерживает основную группу этой стратегии.' : 'Один из ключевых типов войск выбранной армии.',
        kind, active: item.active, order: (1 - item.ratio) * importance});
    }
    if (context.capacity !== null) {
      const camps = context.rows.filter(r => r.data === 1000000 && Number.isInteger(r.level));
      const d = engine.entity(context.db || [], 1000000, 'home');
      if (d) {
        const max = engine.cap(d, context.db, context.hall, 'current');
        const low = camps.filter(r => r.level < max).sort((a, b) => a.level - b.level)[0];
        if (low) candidates.push({id: 1000000, name: 'Армейский лагерь', current: low.level, target: low.level + 1,
          reason: 'Следующий уровень лагеря увеличивает вместимость собственных войск, если это подтверждает справочник.', kind: 'building', active: low.end > context.now, order: .56});
      }
    }
    return candidates.sort((a, b) => Number(a.active) - Number(b.active) || b.order - a.order || a.id - b.id)
      .slice(0, 5).map(({order, ...item}) => item);
  }
  function recommend(snapshot, db, meta, options = {}) {
    const context = currentContext(snapshot, db, meta, options);
    if (!context) return [];
    context.db = db;
    const average = items => items.length ? items.reduce((sum, item) => sum + item.ratio, 0) / items.length : 0;
    const result = [];
    for (const spec of definitions) {
      if (context.hall < spec.minTH || options.difficulty && options.difficulty !== 'all' && options.difficulty !== spec.difficulty) continue;
      const core = spec.core.map(context.unit);
      if (core.some(item => !item)) continue;
      if (spec.requiredSpells.some(id => !context.unit(id))) continue;
      if (spec.requiredHero && !context.unit(spec.requiredHero)) continue;
      const spells = spec.spellIds.map(context.unit).filter(Boolean);
      const heroes = heroIds.map(context.unit).filter(Boolean);
      const army = buildArmy(spec, context);
      // A capacity known to be too small for every core troop is not a valid template.
      if (army.used !== null && spec.core.some(id => !army.units.some(x => x.id === id))) continue;
      const heroTotalWeight = heroes.reduce((sum, h) => sum + heroImportance(spec, h.id), 0);
      const heroRatio = heroTotalWeight ? heroes.reduce((sum, h) => sum + h.ratio * heroImportance(spec, h.id), 0) / heroTotalWeight : 0;
      const heroWeight = heroes.length ? spec.heroWeight : 0;
      const troopWeight = .8 - heroWeight;
      const spellRatio = average(spells);
      const levelScore = average(core) * troopWeight + spellRatio * .2 + heroRatio * heroWeight;
      const activeHeroes = heroes.filter(h => h.active);
      // Timer warnings are separate: the export does not prove whether a hero can attack during an event.
      const score = Math.round(Math.max(0, Math.min(1, levelScore)) * 100);
      const missing = [];
      for (const id of spec.optional) if (!context.unit(id)) missing.push(`${troopNames[id] || id}: нет в импорте, в состав не добавлен.`);
      for (const id of spec.spellIds) if (!context.unit(id)) missing.push(`${troopNames[id] || id}: нет в импорте, в набор заклинаний не добавлено.`);
      const reasons = [`Ключевые войска найдены в твоём экспорте: ${core.map(x => `${x.name} ${x.level}/${x.max}`).join(', ')}.`,
        `Средняя доля уровней ключевых войск: ${Math.round(average(core) * 100)}% от доступного максимума ТХ${context.hall}.`];
      if (heroes.length) reasons.push(`Взвешенная доля уровней важных для стратегии героев: ${Math.round(heroRatio * 100)}%; ${spec.difficulty === 'precision' ? 'для этой стратегии контроль королевы особенно важен' : 'оценка сильнее опирается на основную армию'}.`);
      const warnings = ['Расстановка противника, скрытые ловушки, защитные войска и твоё исполнение по JSON неизвестны. Проверь шаблон на дружеских испытаниях.', 'Герои учтены как доступный состав аккаунта. Активный набор героев для атаки по экспорту не определён.'];
      if (context.capacity === null || army.used === null) warnings.push('Не удалось подтвердить вместимость лагерей или размер войск. Показано ядро стратегии без выдуманных количеств.');
      else if (!army.complete) warnings.push(`В шаблоне занято ${army.used} из ${army.capacity} мест: оставшееся место нужно заполнить вручную доступными войсками.`);
      if (army.spellCapacity === null) warnings.push('Вместимость заклинаний не подтверждена импортом и справочником: точные количества не рассчитаны.');
      else if (!army.spellComplete) warnings.push(`Заклинания занимают ${army.spellUsed} из ${army.spellCapacity} мест; проверь набор в игре.`);
      if (heroRatio < .65 && heroes.length) warnings.push('Уровни героев заметно ниже максимума ратуши. Эта оценка не означает готовность к любому противнику.');
      if (activeHeroes.length) warnings.push(`По таймеру улучшаются: ${activeHeroes.map(x => x.name).join(', ')}. Проверь доступность этих героев в игре.`);
      if (spec.difficulty === 'precision') warnings.push('Продвинутая стратегия: одновременно требует контроля квин-хила и основной группы.');
      result.push({id: spec.id, name: spec.name, summary: spec.summary, style: spec.style,
        difficulty: spec.difficulty, minTH: spec.minTH, eligible: true, score,
        scoreLabel: 'Готовность по уровням', labelNote: 'Эвристика по уровням; не вероятность победы.',
        scoreMethod: {troops: troopWeight, spells: .2, heroes: heroWeight, basis: 'Доли текущих уровней от максимума ратуши; герои имеют вес по роли в стратегии. Активный состав атаки неизвестен.'},
        core, spells, heroes, army, reasons, warnings, missing,
        priorities: prioritiesFor(spec, core, spells, heroes, context),
        phases: spec.phases.map(p => ({...p, checks: [...p.checks]})),
        matchups: {favorable: [...spec.matchups.favorable], caution: [...spec.matchups.caution]}});
    }
    return result.sort((a, b) => b.score - a.score || ((a.difficulty === 'simple' ? 0 : 1) - (b.difficulty === 'simple' ? 0 : 1)) || a.id.localeCompare(b.id));
  }
  return {recommend, version: 'baseline-1', definitions: definitions.map(d => ({id: d.id, name: d.name, minTH: d.minTH, difficulty: d.difficulty}))};
})();
if (typeof module !== 'undefined') module.exports = ClashCoachEngine;


