/**
 * Приёмник теста «Где твои $10 000»: Google-таблица + уведомление в Телеграм.
 *
 * Одна строка на листе «Прохождения» — одно прохождение. Страница шлёт её по частям:
 * открытие, шаги воронки, результат, заявка. Скрипт находит строку по ID и дописывает.
 * Колонки создаются сами по названиям полей, поэтому новые вопросы в data.js
 * правок здесь не требуют.
 *
 * Ключи лежат в свойствах скрипта (Настройки проекта → Свойства скрипта), в коде их нет:
 *   TG_BOT_TOKEN — токен бота от @BotFather
 *   TG_CHAT_ID   — куда слать заявки (свой id или id чата)
 */

var VERSION = 1;
var SHEET_MAIN = 'Прохождения';
var SHEET_EVENTS = 'События';
var SHEET_FUNNEL = 'Воронка';
var MAX_COLUMNS = 150;
var MAX_TEXT = 2000;

// Первые колонки листа «Прохождения» в удобном для чтения порядке
var HEAD = [
  'ID', 'Начало', 'Обновлено', 'Последний шаг', 'Шаг №', 'Ветка', 'Имя', 'Ник в Телеграме',
  'Готовность', 'Этап', 'Главная точка роста', 'Вторая точка роста',
  'Доход сейчас, ₽ в месяц', 'Потенциал, ₽ в месяц', 'Чек, ₽',
  'Что разобрать', 'Ссылка на блог', 'Что пробовал(а)', 'Почему сейчас'
];

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

function doGet() {
  return json({ ok: true, 'версия': VERSION });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var data = JSON.parse(e.postData.contents);
    var sid = clean(data.sid).slice(0, 40);
    if (!sid) return json({ ok: false });
    var step = clean(data.step).slice(0, 20);
    var stepNo = Number(data.stepNo) || 0;
    var row = data.row && typeof data.row === 'object' ? data.row : {};

    // первый запрос сам создаёт листы и сводку воронки
    if (!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_FUNNEL)) setup();
    var sheet = getSheet(SHEET_MAIN, HEAD);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var r = findRow(sheet, sid);
    var now = new Date();
    if (!r) {
      r = sheet.getLastRow() + 1;
      sheet.getRange(r, 1, 1, 2).setValues([[sid, now]]);
    }

    var values = { 'Обновлено': now };
    Object.keys(row).forEach(function (k) {
      var key = clean(k).slice(0, 120);
      // первые пять колонок ведёт сам скрипт, со страницы их не перезаписать
      var idx = HEAD.indexOf(key);
      if (key && (idx < 0 || idx > 4)) values[key] = row[k];
    });
    // шаг двигаем только вперёд: запросы могут прийти не по порядку
    var curNo = Number(sheet.getRange(r, headers.indexOf('Шаг №') + 1).getValue()) || 0;
    if (stepNo > curNo) {
      values['Шаг №'] = stepNo;
      values['Последний шаг'] = stepName(step);
    }

    Object.keys(values).forEach(function (key) {
      var c = headers.indexOf(key);
      if (c < 0) {
        if (headers.length >= MAX_COLUMNS) return;
        headers.push(key);
        c = headers.length - 1;
        sheet.getRange(1, c + 1).setValue(key).setFontWeight('bold');
      }
      sheet.getRange(r, c + 1).setValue(safe(values[key]));
    });

    getSheet(SHEET_EVENTS, ['Время', 'ID', 'Шаг', 'Шаг №']).appendRow([now, sid, stepName(step), stepNo]);

    if (data.notify === true && step === 'form') notify(sheet, headers, r);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (err2) { /* замка не было */ }
  }
}

/** Создаёт листы и сводку воронки. Запускается сам при первом запросе; вручную нужен один раз, чтобы выдать скрипту доступ. */
function setup() {
  getSheet(SHEET_MAIN, HEAD);
  getSheet(SHEET_EVENTS, ['Время', 'ID', 'Шаг', 'Шаг №']);
  var f = getSheet(SHEET_FUNNEL, ['Шаг', 'Дошли', 'Доля от открывших', 'Доля от предыдущего шага']);
  var stepCol = "'" + SHEET_MAIN + "'!E:E";
  var branchCol = "'" + SHEET_MAIN + "'!F:F";
  var rows = STEPS.map(function (s, i) {
    var n = i + 2;
    // блоки 2–8 продюсер без проекта не проходит, из этих строк его убираем
    var count = s[0] >= 4 && s[0] <= 10
      ? '=COUNTIFS(' + stepCol + ';">=' + s[0] + '";' + branchCol + ';"<>продюсер без проекта")'
      : '=COUNTIF(' + stepCol + ';">=' + s[0] + '")';
    return [s[2], count, '=IF($B$2=0;"";B' + n + '/$B$2)', i === 0 ? '' : '=IF(B' + (n - 1) + '=0;"";B' + n + '/B' + (n - 1) + ')'];
  });
  f.getRange(2, 1, rows.length, 4).setValues(rows);
  f.getRange(2, 3, rows.length, 2).setNumberFormat('0%');
  f.setColumnWidth(1, 320);
  // пустой лист, который таблица создаёт сама, не нужен
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Лист1', 'Sheet1'].forEach(function (n) {
    var e = ss.getSheetByName(n);
    if (e && e.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(e);
  });
}

/** Проверка уведомления: запустить вручную после того, как заданы свойства скрипта. */
function testNotify() {
  sendTelegram('Проверка: уведомления теста «Где твои $10 000» подключены.');
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

function findRow(sheet, sid) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var cell = sheet.getRange(2, 1, last - 1, 1).createTextFinder(sid).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

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
