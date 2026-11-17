/* Wall budgets use each level's resource rule; alternative resources are counted once. */
(function (root) {
  'use strict';
  const fullNumber = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const percentNumber = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bounded = (value, min, max, fallback = min) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

  function wallRows(snapshot, base) {
    if (Array.isArray(snapshot?.rows)) return snapshot.rows.filter(row => row.base === base && row.data === (base === 'builder' ? 1000033 : 1000010));
    const raw = snapshot?.raw || snapshot || {};
    return (raw[base === 'builder' ? 'buildings2' : 'buildings'] || []).filter(row => row.data === (base === 'builder' ? 1000033 : 1000010)).map(row => ({ level: row.lvl, count: row.cnt ?? 1 }));
  }

  function calculate(snapshot, database, options = {}) {
    const base = options.base === 'builder' ? 'builder' : 'home';
    const mode = options.mode === 'maximum' ? 'maximum' : 'current';
    const db = Array.isArray(database) ? database : database?.entities || [];
    const definition = db.find(row => row.base === base && (row.slug === 'wall' || row.id === (base === 'builder' ? 1000033 : 1000010)));
    const raw = snapshot?.raw || snapshot || {};
    const hallId = base === 'builder' ? 1000034 : 1000001;
    const hallLevel = snapshot?.rows?.find(row => row.base === base && row.data === hallId)?.level ?? raw[base === 'builder' ? 'buildings2' : 'buildings']?.find(row => row.data === hallId)?.lvl ?? 1;
    const levels = (definition?.levels || []).filter(row => Number.isInteger(row.level)).sort((a, b) => a.level - b.level);
    const available = levels.filter(row => mode === 'maximum' || (row.th ?? row.bh ?? 0) <= hallLevel);
    const maxLevel = Math.max(0, ...available.map(row => row.level));
    const targetLevel = maxLevel ? Math.round(bounded(options.targetLevel ?? maxLevel, 1, maxLevel, maxLevel)) : 0;
    const goldPass = base === 'home' && [0, 10, 15, 20].includes(Number(options.goldPass)) ? Number(options.goldPass) : 0;
    const eventEnabled = base === 'home' && options.eventEnabled === true;
    const eventReduction = eventEnabled ? bounded(options.eventReduction, 0, 90) : 0;
    const factor = (1 - goldPass / 100) * (1 - eventReduction / 100);
    const discount = { goldPass, eventEnabled, eventReduction, factor, reduction: (1 - factor) * 100 };
    const byLevel = new Map();
    let totalSections = 0, unknownSections = 0;
    for (const row of wallRows(snapshot, base)) {
      const count = Number.isInteger(row.count) && row.count > 0 ? row.count : 1;
      totalSections += count;
      if (!Number.isInteger(row.level) || row.level < 0) { unknownSections += count; continue; }
      byLevel.set(row.level, (byLevel.get(row.level) || 0) + count);
    }
    const topDefinition = levels.find(level => level.level === targetLevel);
    const targetLimit = Number.isInteger(topDefinition?.maxCount) && topDefinition.maxCount >= 0 ? topDefinition.maxCount : null;
    const alreadyAtTarget = [...byLevel].reduce((sum, [current, count]) => sum + (current >= targetLevel && targetLevel > 0 ? count : 0), 0);
    let slotsLeft = targetLimit === null ? Infinity : Math.max(0, targetLimit - alreadyAtTarget);
    let cappedSections = 0, assignedToTarget = alreadyAtTarget;
    const assignments = [];
    // Use the closest existing sections first. Existing top-level walls consume
    // the same quota; a lower group retains all upgrades up to the previous level.
    for (const [currentLevel, count] of [...byLevel].sort((a, b) => b[0] - a[0])) {
      if (targetLimit === null || currentLevel >= targetLevel || targetLevel <= 1) {
        assignments.push({ currentLevel, count, targetLevel });
        continue;
      }
      const toTop = Math.min(count, slotsLeft);
      if (toTop) { assignments.push({ currentLevel, count: toTop, targetLevel }); slotsLeft -= toTop; assignedToTarget += toTop; }
      if (toTop < count) { assignments.push({ currentLevel, count: count - toTop, targetLevel: targetLevel - 1, capped: true }); cappedSections += count - toTop; }
    }
    let completedSections = 0, remainingSections = 0, upgradeCount = 0, baseCost = 0, totalCost = 0, goldOnlyCost = 0, eitherCost = 0, unsupportedSections = unknownSections;
    const groups = [], levelMap = new Map(levels.map(level => [level.level, level]));
    for (const assignment of assignments.sort((a, b) => a.currentLevel - b.currentLevel || b.targetLevel - a.targetLevel)) {
      const { currentLevel, count, targetLevel: groupTarget } = assignment;
      const knownCurrent = levelMap.has(currentLevel) || currentLevel === 0;
      const done = knownCurrent && currentLevel >= groupTarget && groupTarget > 0;
      const expectedSteps = knownCurrent ? Math.max(0, groupTarget - currentLevel) : 0;
      const group = { ...assignment, done, supported: !!definition && knownCurrent && groupTarget > 0, upgradeCount: expectedSteps * count, unknownUpgrades: 0, perWallBaseCost: 0, perWallCost: 0, perWallGoldOnlyCost: 0, perWallEitherCost: 0, baseCost: 0, cost: 0, goldOnlyCost: 0, eitherCost: 0, steps: [] };
      if (done) completedSections += count;
      else remainingSections += count;
      for (let next = currentLevel + 1; knownCurrent && next <= groupTarget; next++) {
        const level = levelMap.get(next);
        const supported = !!level && Number.isFinite(level.cost) && level.cost >= 0 && /^(?:Builder )?Gold(?: or (?:Builder )?Elixir)?$/.test(level.resource || '');
        if (!supported) {
          group.supported = false;
          group.unknownUpgrades += count;
          group.steps.push({ level: next, baseCost: null, cost: null, resource: level?.resource || '', supported: false });
          continue;
        }
        const price = Math.floor(level.cost * factor + 1e-7);
        const either = / or /.test(level.resource);
        group.perWallBaseCost += level.cost;
        group.perWallCost += price;
        group[either ? 'perWallEitherCost' : 'perWallGoldOnlyCost'] += price;
        group.steps.push({ level: next, baseCost: level.cost, cost: price, either, resource: level.resource, supported: true });
      }
      if (!group.supported) unsupportedSections += count;
      group.baseCost = group.perWallBaseCost * count;
      group.cost = group.perWallCost * count;
      group.goldOnlyCost = group.perWallGoldOnlyCost * count;
      group.eitherCost = group.perWallEitherCost * count;
      upgradeCount += group.upgradeCount;
      baseCost += group.baseCost;
      totalCost += group.cost;
      goldOnlyCost += group.goldOnlyCost;
      eitherCost += group.eitherCost;
      groups.push(group);
    }
    return { base, mode, hallLevel, definition, maxLevel, targetLevel, targetLimit, alreadyAtTarget, assignedToTarget, cappedSections, completeBudget: unsupportedSections === 0, availableLevels: available.map(level => level.level), totalSections, completedSections, remainingSections, unknownSections, unsupportedSections, upgradeCount, baseCost, totalCost, savedCost: Math.max(0, baseCost - totalCost), goldOnlyCost, eitherCost, groups, discount };
  }

  function contextOptions(ctx) {
    const prefs = ctx.wallSettings || {};
    const planner = ctx.planner || {};
    return {
      base: ctx.base, mode: ctx.settings?.mode,
      targetLevel: prefs.targetLevel,
      goldPass: prefs.goldPass ?? planner.goldPass ?? ctx.settings?.boost ?? 0,
      eventReduction: prefs.eventEnabled === true ? (prefs.eventReduction ?? 50) : 0,
      eventEnabled: prefs.eventEnabled === true
    };
  }

  function render(ctx) {
    const esc = ctx.esc || escape;
    const options = contextOptions(ctx);
    const data = calculate(ctx.snapshot, ctx.db, options);
    const n = value => fullNumber.format(value);
    const home = data.base === 'home';
    const resource = home ? 'золото' : 'золото строителя';
    const alternative = home ? 'золото или эликсир' : 'золото или эликсир строителя';
    const costs = data.unsupportedSections ? 'Известная часть бюджета' : 'Ресурсы до цели';
    const eventRate = data.discount.eventEnabled ? bounded(options.eventReduction, 0, 90) : 0;
    const selected = (a, b) => Number(a) === Number(b) ? ' selected' : '';
    const target = data.maxLevel ? `<label for="wall-target">Целевой уровень<select id="wall-target" data-wall-setting="targetLevel">${data.availableLevels.map(level => { const limit=data.definition?.levels.find(item=>item.level===level)?.maxCount; return `<option value="${level}"${selected(level, data.targetLevel)}>Уровень ${level}${Number.isInteger(limit)?' · до '+limit+' секций':level===data.maxLevel?' · максимум цели':''}</option>`; }).join('')}</select></label>` : '';
    const settings = `<div class="wall-controls">${target}${home ? `<label for="wall-pass">Скидка Gold Pass<select id="wall-pass" data-wall-setting="goldPass">${[0, 10, 15, 20].map(value => `<option value="${value}"${selected(value, data.discount.goldPass)}>${value ? value + '%' : 'Без скидки'}</option>`).join('')}</select></label><label for="wall-event-rate">Скидка события · вручную<select id="wall-event-rate" data-wall-setting="eventReduction">${[...new Set([0, 50, 75, eventRate])].sort((a,b)=>a-b).map(value=>`<option value="${value}"${selected(value,eventRate)}>${value ? value + '% · сценарий' : 'Без скидки'}</option>`).join('')}</select></label>` : '<p class="wall-control-note">Для Деревни строителя используется стоимость из справочника без бонусов Gold Pass и Hammer Jam.</p>'}</div>`;
    if (!data.totalSections || !data.maxLevel) return `<section id="wall-calculator" class="walls"><div class="section-head"><div><div class="section-kicker">БЮДЖЕТ ДЕРЕВНИ</div><h2>Стены — сколько осталось вложить</h2><p>Считаем все оставшиеся уровни каждой секции из JSON.</p></div></div><div class="empty"><b>${!data.totalSections ? 'В экспорте нет стен этой деревни' : 'Не удалось определить доступный уровень стен'}</b>Импортируй свежий JSON с данными выбранной деревни.</div></section>`;
    const wallImage = (level, size, row = false) => {
      const image = typeof ClashArt !== 'undefined' ? ClashArt.image(data.definition, level) : null;
      return image && /^assets\/[a-zA-Z0-9_./-]+\.(?:png|webp)$/.test(image)
        ? `<img src="${esc(image)}" alt="${row ? '' : `Стена уровня ${level}`}" width="${size}" height="${size}"${row ? ' loading="lazy"' : ''}>`
        : `<i class="${row ? 'wall-row-placeholder' : 'wall-symbol'}" aria-hidden="true">▥</i>`;
    };
    const art = `<figure class="wall-target-art">${wallImage(data.targetLevel, 115)}<figcaption>Цель · ур. ${data.targetLevel}${data.targetLimit!==null?`<br>до ${n(data.targetLimit)} секций`:''}</figcaption></figure>`;
    const complete = data.completedSections === data.totalSections && !data.unsupportedSections;
    const budgetLabel = data.unsupportedSections && !data.totalCost ? 'Нет данных' : n(data.totalCost);
    const budgetNote = complete ? data.targetLimit!==null?'Доступный максимум для секций из снимка достигнут':'Секции из снимка уже достигли выбранного уровня' : data.unsupportedSections ? 'Известная часть бюджета; полная стоимость пока не определена' : 'Общий бюджет в единицах ресурсов';
    const emptyPayment = complete ? '<div><span>Все выбранные уровни готовы</span><strong>✓</strong></div>' : '<div><span>Для полной стоимости не хватает данных</span><strong>—</strong></div>';
    const payment = `${data.goldOnlyCost ? `<div><span>Обязательно ${resource}</span><strong>${n(data.goldOnlyCost)}</strong></div>` : ''}${data.eitherCost ? `<div><span>На выбор: ${alternative}</span><strong>${n(data.eitherCost)}</strong></div>` : ''}`;
    const summary = `<div class="wall-budget"><div class="wall-budget-main"><span class="eyebrow">${costs}</span><strong>${budgetLabel}</strong><p>${budgetNote}</p>${data.savedCost ? `<div class="wall-savings">${data.completeBudget?'Без скидок':'Известно без скидок'}: <s>${n(data.baseCost)}</s><br>Экономия: <b>${n(data.savedCost)}</b> · ${percentNumber.format(data.discount.reduction)}%</div>` : ''}</div>${art}<div class="wall-payment">${payment || emptyPayment}</div></div>`;
    const limitNote = data.targetLimit!==null ? `<div class="wall-limit-note"><strong>Уровень ${data.targetLevel} — до ${n(data.targetLimit)} секций</strong><p>В снимке на этом уровне или выше: ${n(data.alreadyAtTarget)}.${data.cappedSections?` Ещё ${n(data.cappedSections)} секций считаем до уровня ${data.targetLevel-1}.`:''} Сначала улучшаем самые высокие текущие стены.</p></div>` : '';
    const stats = `<div class="wall-stats"><div><span>Секций в снимке</span><strong>${n(data.totalSections)}</strong></div><div><span>${data.targetLimit!==null?'На доступной цели':'Уже на цели или выше'}</span><strong>${n(data.completedSections)}</strong></div><div><span>${data.unknownSections ? 'Нужно улучшить · известно' : 'Нужно улучшить секций'}</span><strong>${n(data.remainingSections)}</strong></div><div><span>${data.unsupportedSections ? 'Осталось улучшений · известно' : 'Осталось улучшений'}</span><strong>${n(data.upgradeCount)}</strong></div></div>`;
    const price = (value,supported) => supported?n(value):value?`${n(value)} + ?`:'Нет данных';
    const rows = data.groups.map(group => `<tr><th scope="row"><div class="wall-level-cell">${wallImage(group.currentLevel, 52, true)}<div><b>Уровень ${group.currentLevel}</b><span>${group.done ? 'Цель достигнута' : group.currentLevel>data.maxLevel?'Нет уровня в справочнике':`→ ${group.targetLevel}`}${group.capped?` · лимит ур. ${data.targetLevel}`:''}</span></div></div></th><td>${n(group.count)}</td><td>${price(group.perWallCost,group.supported)}</td><td>${price(group.cost,group.supported)}</td></tr>`).join('') + (data.unknownSections ? `<tr><th scope="row"><div class="wall-level-cell"><i class="wall-row-placeholder" aria-hidden="true">▥</i><div><b>Уровень не указан</b><span>Нужен свежий JSON</span></div></div></th><td>${n(data.unknownSections)}</td><td>Нет данных</td><td>Нет данных</td></tr>` : '');
    return `<section id="wall-calculator" class="walls"><div class="section-head"><div><div class="section-kicker">БЮДЖЕТ ДЕРЕВНИ</div><h2>Стены — сколько осталось вложить</h2><p>Все оставшиеся уровни, количество секций и стоимость до выбранной цели.</p></div><span class="wall-target-badge">Уровень ${data.targetLevel}</span></div>${settings}${limitNote}${summary}${stats}${data.goldOnlyCost && data.eitherCost ? '<p class="wall-explainer">Общий бюджет складывается из обязательного золота и части, которую можно оплатить золотом либо эликсиром. Одно улучшение учтено один раз.</p>' : data.eitherCost ? '<p class="wall-explainer">Эту сумму можно оплатить золотом, эликсиром или распределить между ними. Это один общий бюджет — собирать столько каждого ресурса не требуется.</p>' : ''}${data.discount.eventEnabled ? `<p class="wall-event-note">Ручной сценарий стоимости: предполагаем оплату всех выбранных улучшений во время события. Скидки перемножаются: Gold Pass ${data.discount.goldPass}% и событие ${percentNumber.format(data.discount.eventReduction)}% дают ${percentNumber.format(data.discount.reduction)}% общей экономии.</p>` : ''}${data.unsupportedSections ? `<p class="wall-event-note">Для ${n(data.unsupportedSections)} секций не хватает данных. В сумму включены только известные улучшения.</p>` : ''}<div class="wall-table-wrap"><table class="wall-table"><caption>Стоимость по текущим уровням</caption><thead><tr><th scope="col">Сейчас → цель</th><th scope="col">Секций</th><th scope="col">На одну секцию</th><th scope="col">Всего ресурсов</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th scope="row">${data.completeBudget?'Итого':'Известно'}</th><td>${n(data.totalSections)}</td><td>—</td><td>${price(data.totalCost,data.completeBudget)}</td></tr></tfoot></table></div><p class="coverage">${esc(data.mode === 'current' ? `Лимит для ${home ? 'ратуши' : 'Дома строителя'} ${data.hallLevel}` : 'Максимальные уровни справочника')}. Учитываем только секции из экспорта. Более высокие стены не понижаются. Улучшение стен мгновенное; время сбора ресурсов не прогнозируется. Цены и допустимые ресурсы — из справочника.</p></section>`;
  }

  function mount(ctx) {
    const container = document.getElementById('wall-calculator');
    if (!container) return;
    container.querySelectorAll('[data-wall-setting]').forEach(input => {
      input.addEventListener('change', () => {
        const value = input.type === 'checkbox' ? input.checked : Number(input.value);
        const patch = { [input.dataset.wallSetting]: value, ...(input.dataset.wallSetting === 'eventReduction' ? { eventEnabled: value > 0 } : {}) };
        if (typeof ctx.onChange === 'function') ctx.onChange(patch);
        else {
          const next = { ...ctx, wallSettings: { ...ctx.wallSettings, ...patch } };
          container.outerHTML = render(next);
          mount(next);
        }
      });
    });
  }

  const api = { calculate, render, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ClashWalls = api;
})(typeof window === 'undefined' ? globalThis : window);
