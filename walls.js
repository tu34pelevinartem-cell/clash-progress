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
    let completedSections = 0, remainingSections = 0, upgradeCount = 0, baseCost = 0, totalCost = 0, goldOnlyCost = 0, eitherCost = 0, unsupportedSections = unknownSections;
    const groups = [];
    for (const [currentLevel, count] of [...byLevel].sort((a, b) => a[0] - b[0])) {
      const done = currentLevel >= targetLevel && targetLevel > 0;
      const steps = levels.filter(level => level.level > currentLevel && level.level <= targetLevel);
      const expectedSteps = Math.max(0, targetLevel - currentLevel);
      const supported = !!definition && targetLevel > 0 && steps.length === expectedSteps && steps.every(level => Number.isFinite(level.cost) && level.cost >= 0 && /^(?:Builder )?Gold(?: or (?:Builder )?Elixir)?$/.test(level.resource || ''));
      const group = { currentLevel, count, targetLevel, done, supported, upgradeCount: expectedSteps * count, perWallBaseCost: 0, perWallCost: 0, perWallGoldOnlyCost: 0, perWallEitherCost: 0, baseCost: 0, cost: 0, goldOnlyCost: 0, eitherCost: 0, steps: [] };
      if (done) completedSections += count;
      else remainingSections += count;
      if (!supported) { unsupportedSections += count; groups.push(group); continue; }
      for (const level of steps) {
        const price = Math.floor(level.cost * factor + 1e-7);
        const either = / or /.test(level.resource);
        group.perWallBaseCost += level.cost;
        group.perWallCost += price;
        group[either ? 'perWallEitherCost' : 'perWallGoldOnlyCost'] += price;
        group.steps.push({ level: level.level, baseCost: level.cost, cost: price, either, resource: level.resource });
      }
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
    return { base, mode, hallLevel, definition, maxLevel, targetLevel, availableLevels: available.map(level => level.level), totalSections, completedSections, remainingSections, unknownSections, unsupportedSections, upgradeCount, baseCost, totalCost, savedCost: Math.max(0, baseCost - totalCost), goldOnlyCost, eitherCost, groups, discount };
  }

  function contextOptions(ctx) {
    const prefs = ctx.wallSettings || {};
    const planner = ctx.planner || {};
    return {
      base: ctx.base, mode: ctx.settings?.mode,
      targetLevel: prefs.targetLevel,
      goldPass: prefs.goldPass ?? planner.goldPass ?? ctx.settings?.boost ?? 0,
      eventReduction: prefs.eventReduction ?? (Number(planner.eventReduction) > 0 ? planner.eventReduction : 50),
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
    const eventRate = bounded(options.eventReduction ?? 50, 0, 90);
    const selected = (a, b) => Number(a) === Number(b) ? ' selected' : '';
    const target = data.maxLevel ? `<label for="wall-target">Целевой уровень<select id="wall-target" data-wall-setting="targetLevel">${data.availableLevels.map(level => `<option value="${level}"${selected(level, data.targetLevel)}>Уровень ${level}${level === data.maxLevel ? ' · максимум цели' : ''}</option>`).join('')}</select></label>` : '';
    const settings = `<div class="wall-controls">${target}${home ? `<label for="wall-pass">Скидка Gold Pass<select id="wall-pass" data-wall-setting="goldPass">${[0, 10, 15, 20].map(value => `<option value="${value}"${selected(value, data.discount.goldPass)}>${value ? value + '%' : 'Без скидки'}</option>`).join('')}</select></label><label for="wall-event-rate">Скидка события<select id="wall-event-rate" data-wall-setting="eventReduction">${[...new Set([50, 75, eventRate])].sort((a, b) => a - b).map(value => `<option value="${value}"${selected(value, eventRate)}>${value}%${value === 75 ? ' · ручной сценарий' : ''}</option>`).join('')}</select></label><label class="wall-checkbox" for="wall-event"><input type="checkbox" id="wall-event" data-wall-setting="eventEnabled"${data.discount.eventEnabled ? ' checked' : ''}><span>Успею оплатить выбранные стены во время события</span></label>` : '<p class="wall-control-note">Для Деревни строителя используется стоимость из справочника без бонусов Gold Pass и Hammer Jam.</p>'}</div>`;
    if (!data.totalSections || !data.maxLevel) return `<section id="wall-calculator" class="walls"><div class="section-head"><div><div class="section-kicker">БЮДЖЕТ ДЕРЕВНИ</div><h2>Стены — сколько осталось вложить</h2><p>Считаем все оставшиеся уровни каждой секции из JSON.</p></div></div><div class="empty"><b>${!data.totalSections ? 'В экспорте нет стен этой деревни' : 'Не удалось определить доступный уровень стен'}</b>Импортируй свежий JSON с данными выбранной деревни.</div></section>`;
    const wallImage = (level, size, row = false) => {
      const image = typeof ClashArt !== 'undefined' ? ClashArt.image(data.definition, level) : null;
      return image && /^assets\/[a-zA-Z0-9_./-]+\.png$/.test(image)
        ? `<img src="${esc(image)}" alt="${row ? '' : `Стена уровня ${level}`}" width="${size}" height="${size}"${row ? ' loading="lazy"' : ''}>`
        : `<i class="${row ? 'wall-row-placeholder' : 'wall-symbol'}" aria-hidden="true">▥</i>`;
    };
    const art = `<figure class="wall-target-art">${wallImage(data.targetLevel, 115)}<figcaption>Цель · ур. ${data.targetLevel}</figcaption></figure>`;
    const complete = data.completedSections === data.totalSections && !data.unsupportedSections;
    const budgetLabel = data.unsupportedSections && !data.totalCost ? 'Нет данных' : n(data.totalCost);
    const budgetNote = complete ? 'Секции из снимка уже достигли выбранного уровня' : data.unsupportedSections ? 'Известная часть бюджета; полная стоимость пока не определена' : 'Общий бюджет в единицах ресурсов';
    const emptyPayment = complete ? '<div><span>Все выбранные уровни готовы</span><strong>✓</strong></div>' : '<div><span>Для полной стоимости не хватает данных</span><strong>—</strong></div>';
    const payment = `${data.goldOnlyCost ? `<div><span>Обязательно ${resource}</span><strong>${n(data.goldOnlyCost)}</strong></div>` : ''}${data.eitherCost ? `<div><span>На выбор: ${alternative}</span><strong>${n(data.eitherCost)}</strong></div>` : ''}`;
    const summary = `<div class="wall-budget"><div class="wall-budget-main"><span class="eyebrow">${costs}</span><strong>${budgetLabel}</strong><p>${budgetNote}</p>${data.savedCost ? `<div class="wall-savings">Без скидок: <s>${n(data.baseCost)}</s><br>Экономия: <b>${n(data.savedCost)}</b> · ${percentNumber.format(data.discount.reduction)}%</div>` : ''}</div>${art}<div class="wall-payment">${payment || emptyPayment}</div></div>`;
    const stats = `<div class="wall-stats"><div><span>Секций в снимке</span><strong>${n(data.totalSections)}</strong></div><div><span>Уже на цели или выше</span><strong>${n(data.completedSections)}</strong></div><div><span>${data.unknownSections ? 'Нужно улучшить · известно' : 'Нужно улучшить секций'}</span><strong>${n(data.remainingSections)}</strong></div><div><span>${data.unsupportedSections ? 'Осталось улучшений · известно' : 'Осталось улучшений'}</span><strong>${n(data.upgradeCount)}</strong></div></div>`;
    const rows = data.groups.map(group => `<tr><th scope="row"><div class="wall-level-cell">${wallImage(group.currentLevel, 52, true)}<div><b>Уровень ${group.currentLevel}</b><span>${group.done ? 'Цель достигнута' : `→ ${data.targetLevel}`}</span></div></div></th><td>${n(group.count)}</td><td>${group.supported ? n(group.perWallCost) : 'Нет данных'}</td><td>${group.supported ? n(group.cost) : 'Нет данных'}</td></tr>`).join('') + (data.unknownSections ? `<tr><th scope="row"><div class="wall-level-cell"><i class="wall-row-placeholder" aria-hidden="true">▥</i><div><b>Уровень не указан</b><span>Нужен свежий JSON</span></div></div></th><td>${n(data.unknownSections)}</td><td>Нет данных</td><td>Нет данных</td></tr>` : '');
    return `<section id="wall-calculator" class="walls"><div class="section-head"><div><div class="section-kicker">БЮДЖЕТ ДЕРЕВНИ</div><h2>Стены — сколько осталось вложить</h2><p>Все оставшиеся уровни, количество секций и стоимость до выбранной цели.</p></div><span class="wall-target-badge">Уровень ${data.targetLevel}</span></div>${settings}${summary}${stats}${data.goldOnlyCost && data.eitherCost ? '<p class="wall-explainer">Общий бюджет складывается из обязательного золота и части, которую можно оплатить золотом либо эликсиром. Одно улучшение учтено один раз.</p>' : data.eitherCost ? '<p class="wall-explainer">Эту сумму можно оплатить золотом, эликсиром или распределить между ними. Это один общий бюджет — собирать столько каждого ресурса не требуется.</p>' : ''}${data.discount.eventEnabled ? `<p class="wall-event-note">Стоимость со скидкой события — сценарий, если оплатить все выбранные улучшения до его окончания. Скидки перемножаются: Gold Pass ${data.discount.goldPass}% и событие ${percentNumber.format(data.discount.eventReduction)}% дают ${percentNumber.format(data.discount.reduction)}% общей экономии.</p>` : ''}${data.unsupportedSections ? `<p class="wall-event-note">Для ${n(data.unsupportedSections)} секций не хватает данных. Их стоимость не включена в итог.</p>` : ''}<div class="wall-table-wrap"><table class="wall-table"><caption>Стоимость по текущим уровням</caption><thead><tr><th scope="col">Сейчас → цель</th><th scope="col">Секций</th><th scope="col">На одну секцию</th><th scope="col">Всего ресурсов</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th scope="row">Итого</th><td>${n(data.totalSections)}</td><td>—</td><td>${n(data.totalCost)}</td></tr></tfoot></table></div><p class="coverage">${esc(data.mode === 'current' ? `Лимит для ${home ? 'ратуши' : 'Дома строителя'} ${data.hallLevel}` : 'Максимальные уровни справочника')}. Учитываем только секции из экспорта. Более высокие стены не понижаются. Улучшение стен мгновенное; время сбора ресурсов не прогнозируется. Цены и допустимые ресурсы — из справочника Clash of Clans Data v0.19.1.</p></section>`;
  }

  function mount(ctx) {
    const container = document.getElementById('wall-calculator');
    if (!container) return;
    container.querySelectorAll('[data-wall-setting]').forEach(input => {
      input.addEventListener('change', () => {
        const value = input.type === 'checkbox' ? input.checked : Number(input.value);
        const patch = { [input.dataset.wallSetting]: value };
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
