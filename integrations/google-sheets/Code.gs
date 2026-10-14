/**
 * Приёмник теста «Где твои $10 000»: Google-таблица + уведомление в Телеграм.
 *
 * Листы:
 *   «Лиды»        — только те, кто отправил заявку. Статус и комментарий ведутся руками.
 *   «Прохождения» — одна строка на каждого, кто дошёл до результата (с заявкой и без).
 *                   Строка появляется на шаге «результат», дальше скрипт находит её по ID и дописывает.
 *   «Воронка»     — сколько человек дошло до каждого шага; считается по журналу «События».
 *   «События»     — журнал шагов по времени.
 *
 * Колонки ответов создаются сами по названиям полей, поэтому новые вопросы в data.js
 * правок здесь не требуют.
 *
 * Оформление и порядок колонок накатываются сами при первом запросе после смены LAYOUT_VERSION.
 *
 * Ключи лежат в свойствах скрипта (Настройки проекта → Свойства скрипта), в коде их нет:
 *   TG_BOT_TOKEN — токен бота от @BotFather
 *   TG_CHAT_ID   — куда слать заявки (свой id или id чата)
 */

var VERSION = 6;
// оформление накатывается заново, только когда меняется это число
var LAYOUT_VERSION = 4;
// строка на листе «Прохождения» появляется, только когда человек дошёл до результата
var RESULT_STEP = 11;
var SHEET_MAIN = 'Прохождения';
var SHEET_LEADS = 'Лиды';
var SHEET_EVENTS = 'События';
var SHEET_FUNNEL = 'Воронка';
var MAX_COLUMNS = 150;
var MAX_TEXT = 2000;

// Первые колонки листа «Прохождения» в удобном для чтения порядке
var HEAD = [
  'ID', 'Начало', 'Имя', 'Ник в Телеграме', 'Последний шаг', 'Шаг №', 'Ветка',
  'Готовность', 'Этап', 'Главная точка роста', 'Вторая точка роста',
  'Доход сейчас, ₽ в месяц', 'Потенциал, ₽ в месяц', 'Чек, ₽',
  'Что разобрать', 'Ссылка на блог', 'Что пробовал(а)', 'Почему сейчас', 'Обновлено'
];
// эти колонки ведёт сам скрипт, со страницы их не перезаписать
var SYSTEM = ['ID', 'Начало', 'Обновлено', 'Последний шаг', 'Шаг №'];

// Лист «Лиды». «Статус» и «Комментарий» заполняет человек, скрипт их не трогает.
// «Ветка» стоит в начале: у продюсера без проекта нет этапа, точек роста и дохода (тест их не считает),
// зато есть свои три ответа в колонках «Проектов было», «Что мешает найти проект», «Сильная сторона»
var LEADS_HEAD = [
  'Дата заявки', 'Имя', 'Ник в Телеграме', 'Статус', 'Комментарий', 'Ветка', 'Готовность',
  'Что разобрать', 'Ссылка на блог', 'Что пробовал(а)', 'Почему сейчас',
  'Этап', 'Главная точка роста', 'Вторая точка роста',
  'Доход сейчас, ₽ в месяц', 'Потенциал, ₽ в месяц', 'Чек, ₽',
  'Ниша', 'Чем помогает',
  'Проектов было', 'Что мешает найти проект', 'Сильная сторона',
  'utm_source', 'ID'
];
var LEADS_MANUAL = ['Статус', 'Комментарий'];
// у этих колонок листа «Лиды» название не совпадает с листом «Прохождения»: берём по началу названия
var LEADS_FROM = {
  'Ниша': 'Q3.', 'Чем помогает': 'Q4.',
  'Проектов было': 'P1.', 'Что мешает найти проект': 'P2.', 'Сильная сторона': 'P3.'
};
var LEAD_STATUSES = [
  ['Новая', '#FBE3B0'], ['В переписке', '#CFE2FF'], ['Разбор проведён', '#E3D5FF'], ['Оплачено', '#BFE5B8'],
  ['Отказ', '#F4B6AE'], ['Не вышел на связь', '#F9D0CD'], ['Ушёл в игнор', '#D9C2B5']
];
var EVENTS_HEAD = ['Время', 'ID', 'Шаг', 'Шаг №'];
var FUNNEL_HEAD = ['Шаг', 'Дошли', 'Доля от открывших', 'Доля от предыдущего шага'];

var STEPS = [
  [1, 'open', 'Открыл тест'],
  [2, 'start', 'Начал'],
  [3, 'block1', 'Закончил блок 1: Ты и твоя практика'],
  [4, 'block2', 'Закончил блок 2: Площадки и охваты'],
  [5, 'block3', 'Закончил блок 3: Продукт'],
  [6, 'block4', 'Закончил блок 4: Продажи'],
  [7, 'block5', 'Закончил блок 5: Работа с базой'],
  [8, 'block6', 'Закончил блок 6: Контент и прогрев'],
  [9, 'block7', 'Закончил блок 7: Органика'],
  [10, 'block8', 'Закончил блок 8: Ресурс и система'],
  [11, 'result', 'Увидел результат'],
  [12, 'cta', 'Нажал «Хочу личный разбор»'],
  [13, 'form', 'Отправил заявку'],
  [14, 'tg', 'Нажал «Написать Артёму»']
];

// Цвета оформления: палитра лендинга
var C_LEAD = '#6B1422';     // данные о человеке
var C_CALC = '#8A6A2A';     // расчёты
var C_ANSWER = '#4A4A55';   // ответы на вопросы
var C_TECH = '#5B6470';     // метки и служебное
var C_MANUAL = '#E9B56A';   // колонки, которые заполняет человек
var C_TEXT = '#FFF6E3';
var C_INK = '#2B0810';

function doGet() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    ensureLayout();
  } catch (err) { /* оформление не должно мешать ответу */ } finally {
    try { lock.releaseLock(); } catch (err2) { /* замка не было */ }
  }
  var props = PropertiesService.getScriptProperties();
  return json({
    ok: true, 'версия': VERSION,
    'оформление': props.getProperty('LAYOUT') || '', 'ошибки оформления': props.getProperty('LAYOUT_ERROR') || ''
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var data = JSON.parse(e.postData.contents);
    var sid = clean(data.sid).slice(0, 40);
    if (!sid) return json({ ok: false });
    var step = clean(data.step).slice(0, 20);
    var stepNo = Number(data.stepNo) || 0;
    var row = data.row && typeof data.row === 'object' ? data.row : {};

    ensureLayout();
    // служебные действия для проверок: работают только со строками, чей ID начинается с «proverka-»
    if (data.action === 'peek' || data.action === 'cleanup') return json(testTools(data.action, sid));
    var sheet = getSheet(SHEET_MAIN, HEAD);
    var headers = headersOf(sheet);
    var r = findRow(sheet, 1, sid);
    var now = new Date();
    // кто не дошёл до результата, в «Прохождения» не попадает: его шаги остаются только в журнале для воронки
    if (!r && stepNo < RESULT_STEP) {
      getSheet(SHEET_EVENTS, EVENTS_HEAD).appendRow([now, sid, stepName(step), stepNo]);
      return json({ ok: true });
    }
    if (!r) {
      r = sheet.getLastRow() + 1;
      ensureSize(sheet, r, headers.length);
      sheet.getRange(r, 1, 1, 2).setValues([[sid, now]]);
    }

    var values = { 'Обновлено': now };
    Object.keys(row).forEach(function (k) {
      var key = clean(k).slice(0, 120);
      if (key && SYSTEM.indexOf(key) < 0) values[key] = row[k];
    });
    // шаг двигаем только вперёд: запросы могут прийти не по порядку
    var curNo = Number(sheet.getRange(r, headers.indexOf('Шаг №') + 1).getValue()) || 0;
    if (stepNo > curNo) {
      values['Шаг №'] = stepNo;
      values['Последний шаг'] = stepName(step);
    }

    // ответ на вопрос ищем по его номеру («Q5.»): если формулировку вопроса поменяли,
    // ответы идут в тот же столбец, а заголовок обновляется под новый текст
    Object.keys(values).forEach(function (key) {
      var m = /^([QP]\d+[a-z]?\.) /i.exec(key);
      if (!m || headers.indexOf(key) >= 0) return;
      for (var i = 0; i < headers.length; i++) {
        if (String(headers[i]).indexOf(m[1] + ' ') === 0) {
          sheet.getRange(1, i + 1).setValue(key);
          headers[i] = key;
          return;
        }
      }
    });

    // новые колонки добавляем разом, строку пишем одним действием: так запрос идёт секунду, а не шесть
    var fresh = Object.keys(values).filter(function (key) { return headers.indexOf(key) < 0; })
      .slice(0, Math.max(0, MAX_COLUMNS - headers.length));
    if (fresh.length) {
      var first = headers.length + 1;
      ensureSize(sheet, r, headers.length + fresh.length);
      var headRange = sheet.getRange(1, first, 1, fresh.length).setValues([fresh]).setFontWeight('bold');
      fresh.forEach(function (key, n) {
        headers.push(key);
        quiet(function () { styleHead(sheet.getRange(1, first + n), headColor(key)); sheet.setColumnWidth(first + n, widthOf(key)); });
      });
      quiet(function () { headRange.setVerticalAlignment('middle'); });
    }
    var line = sheet.getRange(r, 1, 1, headers.length);
    var cells = line.getValues()[0];
    Object.keys(values).forEach(function (key) {
      var c = headers.indexOf(key);
      if (c >= 0) cells[c] = values[key];
    });
    // прочитанные из таблицы тексты тоже проходят через safe: апостроф-защита при чтении теряется
    line.setValues([cells.map(safe)]);

    getSheet(SHEET_EVENTS, EVENTS_HEAD).appendRow([now, sid, stepName(step), stepNo]);

    if (step === 'form') {
      writeLead(sheet, headers, r, now);
      if (data.notify === true) notify(sheet, headers, r);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (err2) { /* замка не было */ }
  }
}

/** Создаёт листы и сводку воронки. Вручную нужен один раз, чтобы выдать скрипту доступ. */
function setup() {
  getSheet(SHEET_LEADS, LEADS_HEAD);
  getSheet(SHEET_MAIN, HEAD);
  getSheet(SHEET_EVENTS, EVENTS_HEAD);
  writeFunnel();
  // пустой лист, который таблица создаёт сама, не нужен
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Лист1', 'Sheet1'].forEach(function (n) {
    var e = ss.getSheetByName(n);
    if (e && e.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(e);
  });
}

/** Заново накатить оформление вручную (например, после правок руками). */
function relayout() {
  PropertiesService.getScriptProperties().deleteProperty('LAYOUT');
  ensureLayout();
}

/** Проверка уведомления: запустить вручную после того, как заданы свойства скрипта. */
function testNotify() {
  sendTelegram('Проверка: уведомления теста «Где твои $10 000» подключены.');
}

/* ---------- Проверочные строки ---------- */

// peek — показать, что записалось по проверочному ID; cleanup — убрать все проверочные строки.
// Настоящие ID случайные и с «proverka» не начинаются, чужие данные так не достать и не стереть.
function testTools(action, sid) {
  if (sid.indexOf('proverka-') !== 0) return { ok: false, error: 'только для проверочных строк' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = { ok: true };
  [[SHEET_MAIN, 'main'], [SHEET_LEADS, 'lead'], [SHEET_EVENTS, 'events']].forEach(function (pair) {
    var sheet = ss.getSheetByName(pair[0]);
    if (!sheet || sheet.getLastRow() < 2) { out[pair[1]] = action === 'peek' ? null : 0; return; }
    var headers = headersOf(sheet);
    var idCol = headers.indexOf('ID');
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    if (action === 'cleanup') {
      var removed = 0;
      for (var i = data.length - 1; i >= 0; i--) {
        if (String(data[i][idCol]).indexOf('proverka') === 0) { sheet.deleteRow(i + 2); removed++; }
      }
      out[pair[1]] = removed;
      return;
    }
    var rows = data.filter(function (r) { return String(r[idCol]) === sid; });
    if (pair[1] === 'events') { out.events = rows.length; return; }
    out[pair[1] + 'Rows'] = rows.length;
    out[pair[1]] = rows.length ? toObject(headers, rows[0]) : null;
  });
  return out;
}

function toObject(headers, row) {
  var o = {};
  headers.forEach(function (h, i) {
    var v = row[i];
    if (v === '' || v == null) return;
    o[h] = Object.prototype.toString.call(v) === '[object Date]' ? v.toISOString() : v;
  });
  return o;
}

/* ---------- Лист «Лиды» ---------- */

// Заявка: добавляем человека на лист «Лиды» или обновляем его строку. Статус и комментарий не трогаем.
function writeLead(main, headers, r, when) {
  var leads = getSheet(SHEET_LEADS, LEADS_HEAD);
  var lh = headersOf(leads);
  var vals = main.getRange(r, 1, 1, headers.length).getValues()[0];
  function src(name) {
    var c = headers.indexOf(name);
    if (c < 0 && LEADS_FROM[name]) {
      for (var i = 0; i < headers.length; i++) if (String(headers[i]).indexOf(LEADS_FROM[name]) === 0) { c = i; break; }
    }
    return c < 0 ? '' : vals[c];
  }
  var sid = clean(src('ID'));
  var row = findRow(leads, lh.indexOf('ID') + 1, sid);
  var isNew = !row;
  if (isNew) row = leads.getLastRow() + 1;
  ensureSize(leads, row, lh.length);
  if (isNew) {
    // новая строка пишется одним действием
    var cells = lh.map(function (name) {
      if (name === 'Статус') return LEAD_STATUSES[0][0];
      if (name === 'Дата заявки') return when;
      return LEADS_HEAD.indexOf(name) < 0 || name === 'Комментарий' ? '' : safe(src(name));
    });
    leads.getRange(row, 1, 1, lh.length).setValues([cells]);
  } else {
    // повторная заявка (редко): обновляем по одной ячейке, чтобы не задеть то, что вписано руками
    LEADS_HEAD.forEach(function (name) {
      var c = lh.indexOf(name);
      if (c < 0 || LEADS_MANUAL.indexOf(name) >= 0 || name === 'Дата заявки') return;
      leads.getRange(row, c + 1).setValue(safe(src(name)));
    });
  }
  // ник ведёт в Телеграм
  quiet(function () {
    var nick = clean(src('Ник в Телеграме')).replace(/^'/, '');
    var user = nick.replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{4,}$/.test(user)) return;
    var rich = SpreadsheetApp.newRichTextValue().setText(nick).setLinkUrl('https://t.me/' + user).build();
    leads.getRange(row, lh.indexOf('Ник в Телеграме') + 1).setRichTextValue(rich);
  });
}

// Переносит на лист «Лиды» тех, кто оставил заявку до появления этого листа
function syncLeads(main) {
  var last = main.getLastRow();
  if (last < 2) return;
  var headers = headersOf(main);
  var nickCol = headers.indexOf('Ник в Телеграме');
  var updCol = headers.indexOf('Обновлено');
  var data = main.getRange(2, 1, last - 1, headers.length).getValues();
  data.forEach(function (vals, i) {
    if (!clean(vals[nickCol]).trim()) return;
    writeLead(main, headers, i + 2, updCol < 0 ? new Date() : vals[updCol]);
  });
}

/* ---------- Оформление ---------- */

// Один раз на версию: порядок колонок, перенос лидов, оформление. Ошибки не мешают приёму данных.
function ensureLayout() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAYOUT') === String(LAYOUT_VERSION)) return;
  props.setProperty('LAYOUT', String(LAYOUT_VERSION));
  var errors = [];
  function step(name, fn) { try { fn(); } catch (err) { errors.push(name + ': ' + err); } }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var main, leads, events, funnel;
  step('листы', function () {
    setup();
    main = ss.getSheetByName(SHEET_MAIN); leads = ss.getSheetByName(SHEET_LEADS);
    events = ss.getSheetByName(SHEET_EVENTS); funnel = ss.getSheetByName(SHEET_FUNNEL);
    ss.setSpreadsheetTimeZone('Europe/Moscow');
    // ответов много: место под колонки готовим заранее, чтобы оформление легло на все
    ensureSize(main, 1, 110);
  });
  step('порядок колонок', function () { reorder(main, HEAD); reorder(leads, LEADS_HEAD); });
  step('воронка', writeFunnel);
  step('убрать незаконченные', function () { pruneMain(main); });
  step('перенос лидов', function () { syncLeads(main); });
  step('оформление: лиды', function () { styleLeads(leads); });
  step('оформление: прохождения', function () { styleMain(main); });
  step('оформление: воронка', function () { styleFunnel(funnel); });
  step('оформление: события', function () { styleEvents(events); });
  step('порядок листов', function () {
    [leads, main, funnel, events].forEach(function (sh, i) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); });
    ss.setActiveSheet(leads);
  });
  if (errors.length) props.setProperty('LAYOUT_ERROR', errors.join(' | ').slice(0, 4000));
  else props.deleteProperty('LAYOUT_ERROR');
}

// Ставит колонки из списка в начало листа в заданном порядке. Данные переезжают вместе с колонками.
function reorder(sheet, head) {
  var filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.setFrozenColumns(0);
  head.forEach(function (name, i) {
    var cur = headersOf(sheet).indexOf(name);
    if (cur === i) return;
    if (cur < 0) {
      sheet.insertColumnBefore(i + 1);
      sheet.getRange(1, i + 1).setValue(name);
      return;
    }
    // слева от i всё уже на месте, значит нужная колонка стоит правее и едет влево
    sheet.moveColumns(sheet.getRange(1, cur + 1, 1, 1), i + 1);
  });
}

function styleBase(sheet, headers, colorOf) {
  var rows = sheet.getMaxRows(), cols = sheet.getMaxColumns();
  sheet.getRange(1, 1, rows, cols).setFontFamily('Montserrat').setFontSize(10).setFontColor(C_INK)
    .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  headers.forEach(function (name, i) {
    if (!name) return;
    styleHead(sheet.getRange(1, i + 1), colorOf(name));
    sheet.setColumnWidth(i + 1, widthOf(name));
  });
  sheet.setRowHeight(1, 52);
  sheet.setFrozenRows(1);
}

function styleHead(range, color) {
  range.setBackground(color).setFontColor(color === C_MANUAL ? C_INK : C_TEXT).setFontWeight('bold').setFontFamily('Montserrat')
    .setFontSize(10).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP).setVerticalAlignment('middle').setHorizontalAlignment('center');
}

function headColor(name) {
  if (HEAD.indexOf(name) >= 0) return C_LEAD;
  if (/^[QP]\d/.test(name)) return C_ANSWER;
  if (/^utm_|^Откуда пришёл|^Курс|^Согласие/.test(name)) return C_TECH;
  return C_CALC;
}

function widthOf(name) {
  var W = {
    'ID': 120, 'Начало': 130, 'Обновлено': 130, 'Дата заявки': 130, 'Имя': 140, 'Ник в Телеграме': 150,
    'Последний шаг': 250, 'Шаг №': 60, 'Ветка': 190, 'Готовность': 120, 'Этап': 170, 'Статус': 160,
    'Комментарий': 340, 'Что разобрать': 340, 'Ссылка на блог': 220, 'Что пробовал(а)': 300, 'Почему сейчас': 300,
    'Главная точка роста': 130, 'Вторая точка роста': 130, 'Ниша': 220, 'Чем помогает': 260,
    'Проектов было': 120, 'Что мешает найти проект': 300, 'Сильная сторона': 150
  };
  if (W[name]) return W[name];
  if (/^[QP]\d/.test(name)) return 240;
  return 125;
}

function formatColumns(sheet, headers) {
  var rows = sheet.getMaxRows() - 1;
  headers.forEach(function (name, i) {
    var range = sheet.getRange(2, i + 1, rows, 1);
    if (name === 'Начало' || name === 'Обновлено' || name === 'Дата заявки' || name === 'Время') {
      range.setNumberFormat('dd.MM.yyyy HH:mm').setHorizontalAlignment('center');
    } else if (/₽/.test(name)) {
      range.setNumberFormat('#,##0').setHorizontalAlignment('right');
    } else if (name === 'Готовность' || name === 'Шаг №' || /^Здоровье/.test(name)) {
      range.setHorizontalAlignment('center');
    } else if (name === 'Имя' || name === 'Ник в Телеграме') {
      range.setFontWeight('bold');
    }
  });
}

function resetFilter(sheet) {
  var filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).createFilter();
}

function styleLeads(sheet) {
  var headers = headersOf(sheet);
  var rows = sheet.getMaxRows() - 1;
  styleBase(sheet, headers, function (name) { return LEADS_MANUAL.indexOf(name) >= 0 ? C_MANUAL : C_LEAD; });
  formatColumns(sheet, headers);
  // длинные ответы на этом листе читают целиком
  ['Комментарий', 'Что разобрать', 'Что пробовал(а)', 'Почему сейчас', 'Чем помогает', 'Что мешает найти проект'].forEach(function (name) {
    var c = headers.indexOf(name);
    if (c >= 0) sheet.getRange(2, c + 1, rows, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  });
  var statusCol = headers.indexOf('Статус') + 1;
  var status = sheet.getRange(2, statusCol, rows, 1);
  status.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(LEAD_STATUSES.map(function (s) { return s[0]; }), true).setAllowInvalid(true).build());
  status.setHorizontalAlignment('center').setFontWeight('bold');
  var rules = LEAD_STATUSES.map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s[0]).setBackground(s[1]).setRanges([status]).build();
  });
  var ready = sheet.getRange(2, headers.indexOf('Готовность') + 1, rows, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(8)
    .setBackground('#BFE5B8').setBold(true).setRanges([ready]).build());
  sheet.setConditionalFormatRules(rules);
  sheet.setFrozenColumns(3);
  sheet.hideColumns(headers.indexOf('ID') + 1);
  resetFilter(sheet);
  sheet.setTabColor('#E9B56A');
}

function styleMain(sheet) {
  var headers = headersOf(sheet);
  styleBase(sheet, headers, headColor);
  formatColumns(sheet, headers);
  // строки с заявкой подсвечены: по нику видно, кто оставил контакт
  var nick = colLetter(headers.indexOf('Ник в Телеграме') + 1);
  var all = sheet.getRange(2, 1, sheet.getMaxRows() - 1, sheet.getMaxColumns());
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + nick + '2<>""').setBackground('#FFF2D0').setRanges([all]).build()
  ]);
  sheet.setFrozenColumns(4);
  sheet.hideColumns(1);
  resetFilter(sheet);
  sheet.setTabColor('#6B1422');
}

function styleFunnel(sheet) {
  styleBase(sheet, FUNNEL_HEAD, function () { return C_LEAD; });
  var n = STEPS.length;
  sheet.setColumnWidth(1, 340); sheet.setColumnWidth(2, 100); sheet.setColumnWidth(3, 150); sheet.setColumnWidth(4, 190);
  sheet.getRange(2, 2, n, 3).setHorizontalAlignment('center');
  sheet.getRange(2, 2, n, 1).setFontWeight('bold');
  sheet.getRange(2, 3, n, 2).setNumberFormat('0%');
  // где доля от предыдущего шага низкая, там люди уходят
  var drop = sheet.getRange(3, 4, n - 1, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().setGradientMinpoint('#F4B6AE').setGradientMaxpoint('#BFE5B8').setRanges([drop]).build()
  ]);
  sheet.setTabColor('#8A6A2A');
}

function styleEvents(sheet) {
  styleBase(sheet, EVENTS_HEAD, function () { return C_TECH; });
  formatColumns(sheet, EVENTS_HEAD);
  sheet.setColumnWidth(3, 300);
  sheet.setTabColor('#5B6470');
}

// Сводка воронки: сколько разных людей сделали каждый шаг. Считается по журналу «События»,
// поэтому незаконченные прохождения в воронке видны, хотя на листе «Прохождения» их нет.
function writeFunnel() {
  getSheet(SHEET_EVENTS, EVENTS_HEAD);
  var f = getSheet(SHEET_FUNNEL, FUNNEL_HEAD);
  var ids = "'" + SHEET_EVENTS + "'!B:B", names = "'" + SHEET_EVENTS + "'!C:C";
  var rows = STEPS.map(function (st, i) {
    var n = i + 2;
    var count = '=IFERROR(COUNTUNIQUE(FILTER(' + ids + ';' + names + '=A' + n + '));0)';
    return [st[2], count, '=IF($B$2=0;"";B' + n + '/$B$2)', i === 0 ? '' : '=IF(B' + (n - 1) + '=0;"";B' + n + '/B' + (n - 1) + ')'];
  });
  f.getRange(2, 1, rows.length, 4).setValues(rows);
  f.getRange(2, 3, rows.length, 2).setNumberFormat('0%');
  f.setColumnWidth(1, 320);
}

// Убирает с листа «Прохождения» пустые строки и тех, кто не дошёл до результата и не оставил ник
function pruneMain(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var headers = headersOf(sheet);
  var stepCol = headers.indexOf('Шаг №'), nickCol = headers.indexOf('Ник в Телеграме');
  var data = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    var row = data[i];
    var empty = row.every(function (v) { return v === '' || v == null; });
    var unfinished = (Number(row[stepCol]) || 0) < RESULT_STEP && !clean(row[nickCol]).trim();
    if (empty || unfinished) { sheet.deleteRow(i + 2); removed++; }
  }
  return removed;
}

/* ---------- Внутреннее ---------- */

function getSheet(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function headersOf(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function findRow(sheet, col, value) {
  var last = sheet.getLastRow();
  if (last < 2 || col < 1 || !value) return 0;
  var cell = sheet.getRange(2, col, last - 1, 1).createTextFinder(value).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

// Лист по умолчанию — 26 колонок и 1000 строк: расширяем, когда не хватает
function ensureSize(sheet, row, col) {
  var mc = sheet.getMaxColumns(), mr = sheet.getMaxRows();
  if (col > mc) sheet.insertColumnsAfter(mc, col - mc + 10);
  if (row > mr) sheet.insertRowsAfter(mr, row - mr + 200);
}

function colLetter(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

// украшения не должны ронять приём данных
function quiet(fn) { try { fn(); } catch (err) { /* не страшно */ } }

function stepName(step) {
  if (step === 'blockP') return 'Закончил блок продюсера';
  for (var i = 0; i < STEPS.length; i++) if (STEPS[i][1] === step) return STEPS[i][2];
  return step;
}

function clean(v) { return v == null ? '' : String(v); }

// Текст не должен превратиться в формулу таблицы
function safe(v) {
  if (v instanceof Date || typeof v === 'number') return v;
  var s = clean(v).slice(0, MAX_TEXT);
  return /^[=+\-]/.test(s) ? "'" + s : s;
}

function notify(sheet, headers, r) {
  var vals = sheet.getRange(r, 1, 1, headers.length).getValues()[0];
  function get(name) { var c = headers.indexOf(name); return c < 0 ? '' : clean(vals[c]).replace(/^'/, ''); }
  var lines = [
    'Новая заявка на разбор',
    '',
    'Имя: ' + get('Имя'),
    'Ник: ' + get('Ник в Телеграме'),
    'Ветка: ' + get('Ветка'),
    'Главная точка роста: ' + (get('Главная точка роста') || 'нет'),
    'Этап: ' + (get('Этап') || 'нет'),
    'Доход сейчас: ' + (get('Доход сейчас, ₽ в месяц') || 'нет'),
    'Потенциал: ' + (get('Потенциал, ₽ в месяц') || 'нет'),
    'Готовность: ' + get('Готовность') + ' из 10',
    '',
    'Что хочет разобрать: ' + get('Что разобрать')
  ];
  if (get('Ссылка на блог')) lines.push('Блог: ' + get('Ссылка на блог'));
  sendTelegram(lines.join('\n'));
}

function sendTelegram(text) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TG_BOT_TOKEN');
  var chat = props.getProperty('TG_CHAT_ID');
  if (!token || !chat) return;
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: true }),
    muteHttpExceptions: true
  });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
