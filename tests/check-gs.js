/*
  Проверка приёмника таблицы на подставной таблице: node tests/check-gs.js
  Настоящий Apps Script здесь не запускается, проверяется только логика Code.gs.
*/
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var path = require('path');

function Sheet() { this.rows = []; }
Sheet.prototype.getLastRow = function () { return this.rows.length; };
Sheet.prototype.getLastColumn = function () {
  return Math.max.apply(null, [1].concat(this.rows.map(function (r) { return r.length; })));
};
Sheet.prototype.appendRow = function (a) { this.rows.push(a.slice()); };
Sheet.prototype.setFrozenRows = function () {};
Sheet.prototype.deleteRow = function (r) { this.rows.splice(r - 1, 1); };
Sheet.prototype.getMaxColumns = function () { return 1000; };
Sheet.prototype.getMaxRows = function () { return 100000; };
Sheet.prototype.insertColumnsAfter = function () {};
Sheet.prototype.insertRowsAfter = function () {};
Sheet.prototype.setColumnWidth = function () {};
Sheet.prototype.getRange = function (r, c, nr, nc) {
  var s = this; nr = nr || 1; nc = nc || 1;
  function cell(i, j) { return (s.rows[i] && s.rows[i][j] != null) ? s.rows[i][j] : ''; }
  function put(i, j, v) { while (s.rows.length <= i) s.rows.push([]); s.rows[i][j] = v; }
  var range = {
    getValues: function () {
      var out = [];
      for (var i = 0; i < nr; i++) { out.push([]); for (var j = 0; j < nc; j++) out[i].push(cell(r - 1 + i, c - 1 + j)); }
      return out;
    },
    getValue: function () { return cell(r - 1, c - 1); },
    setValues: function (v) { v.forEach(function (row, i) { row.forEach(function (x, j) { put(r - 1 + i, c - 1 + j, x); }); }); return range; },
    setValue: function (v) { put(r - 1, c - 1, v); return range; },
    setFontWeight: function () { return range; },
    setNumberFormat: function () { return range; },
    createTextFinder: function (text) {
      return {
        matchEntireCell: function () { return this; },
        findNext: function () {
          for (var i = 0; i < nr; i++) if (String(cell(r - 1 + i, c - 1)) === text) return { getRow: (function (n) { return function () { return n; }; })(r + i) };
          return null;
        }
      };
    }
  };
  return range;
};

var sheets = {};
var sent = [];
var props = { TG_BOT_TOKEN: 'test-token', TG_CHAT_ID: '1' };
var ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: function () {
    return {
      getSheetByName: function (n) { return sheets[n] || null; },
      getSheets: function () { return Object.keys(sheets); },
      deleteSheet: function () {},
      insertSheet: function (n) { return (sheets[n] = new Sheet()); }
    };
  } },
  LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: function (s) { return { setMimeType: function () { return JSON.parse(s); } }; } },
  PropertiesService: { getScriptProperties: function () { return {
    getProperty: function (k) { return props[k] == null ? null : props[k]; },
    setProperty: function (k, v) { props[k] = v; },
    deleteProperty: function (k) { delete props[k]; }
  }; } },
  UrlFetchApp: { fetch: function (url, o) { sent.push({ url: url, body: JSON.parse(o.payload) }); } }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../integrations/google-sheets/Code.gs'), 'utf8'), ctx);

// оформление на подставной таблице не проверить: считаем, что оно уже накатано
props.LAYOUT = String(ctx.LAYOUT_VERSION);

function post(p) { return ctx.doPost({ postData: { contents: JSON.stringify(p) } }); }
function rowOf(sid) {
  var m = sheets['Прохождения'], h = m.rows[0], out = {};
  var r = m.rows.filter(function (x) { return x[0] === sid; });
  assert.strictEqual(r.length, 1, 'строк с ID ' + sid + ': ' + r.length);
  h.forEach(function (k, i) { out[k] = r[0][i] == null ? '' : r[0][i]; });
  return out;
}

var pong = ctx.doGet();
assert.strictEqual(pong.ok, true);
assert.strictEqual(pong['версия'], ctx.VERSION);
assert.strictEqual(pong['оформление'], String(ctx.LAYOUT_VERSION));

assert.ok(post({ sid: 'a1', step: 'open', stepNo: 1, row: { 'Имя': '', utm_source: 'tg' } }).ok);
assert.ok(post({ sid: 'a1', step: 'block2', stepNo: 4, row: { 'Имя': 'Аня' } }).ok);
// запрос пришёл с опозданием: шаг назад не откатывается
assert.ok(post({ sid: 'a1', step: 'block1', stepNo: 3, row: { 'Имя': 'Аня' } }).ok);
// пока человек не дошёл до результата, строки на листе «Прохождения» нет: шаги только в журнале
var mainRows = function (sid) { return (sheets['Прохождения'] ? sheets['Прохождения'].rows : []).filter(function (x) { return x[0] === sid; }).length; };
assert.strictEqual(mainRows('a1'), 0);
assert.strictEqual(sheets['События'].rows.length, 1 + 3);

assert.ok(post({ sid: 'a1', step: 'result', stepNo: 11, row: {
  'Имя': 'Аня', utm_source: 'tg', 'Ветка': 'эксперт', 'Этап': 'Случайные деньги', 'Главная точка роста': 'Продажи', 'Потенциал, ₽ в месяц': 430000,
  'Здоровье: Продажи': 2, 'Q7. Как ведёт себя твой доход?': 'скачет от месяца к месяцу', 'Q3. Твоя ниша': 'Коучинг',
  'Q4. Чем ты помогаешь людям? В двух словах': '=HYPERLINK("http://x")', 'ID': 'подмена', 'Шаг №': 99
} }).ok);
var r = rowOf('a1');
assert.strictEqual(r['Имя'], 'Аня');
assert.strictEqual(r.utm_source, 'tg');
assert.strictEqual(r['Последний шаг'], 'Увидел результат');
// даты создаются внутри скрипта, поэтому проверяем по типу, а не через instanceof
[r['Начало'], r['Обновлено']].forEach(function (d) {
  assert.strictEqual(Object.prototype.toString.call(d), '[object Date]');
});
// запрос пришёл с опозданием: шаг назад не откатывается
assert.ok(post({ sid: 'a1', step: 'block8', stepNo: 10, row: { 'Имя': 'Аня' } }).ok);
assert.strictEqual(rowOf('a1')['Шаг №'], 11);
assert.strictEqual(r['Главная точка роста'], 'Продажи');
assert.strictEqual(r['Здоровье: Продажи'], 2);
assert.strictEqual(r['Q4. Чем ты помогаешь людям? В двух словах'], '\'=HYPERLINK("http://x")', 'формула должна стать текстом');
assert.strictEqual(r['Шаг №'], 11, 'служебные колонки со страницы не перезаписываются');
assert.strictEqual(sent.length, 0, 'до заявки уведомлений нет');
assert.ok(!sheets['Лиды'] || sheets['Лиды'].rows.length <= 1, 'до заявки на листе «Лиды» пусто');

assert.ok(post({ sid: 'a1', step: 'form', stepNo: 13, notify: true, row: {
  'Имя': 'Аня', 'Ник в Телеграме': '@anya', 'Что разобрать': 'продажи в переписке', 'Готовность': 8
} }).ok);
assert.strictEqual(sent.length, 1);
assert.ok(/bottest-token\/sendMessage$/.test(sent[0].url));
var text = sent[0].body.text;
['Имя: Аня', 'Ник: @anya', 'Главная точка роста: Продажи', 'Потенциал: 430000', 'Этап: Случайные деньги', 'Готовность: 8 из 10', 'Что хочет разобрать: продажи в переписке']
  .forEach(function (s) { assert.ok(text.indexOf(s) >= 0, 'в уведомлении нет: ' + s + '\n' + text); });

// заявка попала на лист «Лиды»: одна строка, статус «Новая», ниша из ответа Q3
function leadRows() {
  var L = sheets['Лиды'], h = L.rows[0];
  return L.rows.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i] == null ? '' : r[i]; }); return o; });
}
var leads = leadRows();
assert.strictEqual(leads.length, 1);
assert.strictEqual(leads[0]['Имя'], 'Аня');
assert.strictEqual(leads[0]['Ник в Телеграме'], '@anya');
assert.strictEqual(leads[0]['Статус'], 'Новая');
assert.strictEqual(leads[0]['Ниша'], 'Коучинг');
assert.strictEqual(leads[0]['Главная точка роста'], 'Продажи');
assert.strictEqual(leads[0]['Потенциал, ₽ в месяц'], 430000);
assert.strictEqual(leads[0]['ID'], 'a1');
// человек руками поставил статус и комментарий; повторная заявка их не затирает и строку не дублирует
var LS = sheets['Лиды'], lh = LS.rows[0];
LS.rows[1][lh.indexOf('Статус')] = 'Оплачено';
LS.rows[1][lh.indexOf('Комментарий')] = 'оплата 23.08';
assert.ok(post({ sid: 'a1', step: 'form', stepNo: 13, row: { 'Что разобрать': 'продажи и база' } }).ok);
leads = leadRows();
assert.strictEqual(leads.length, 1);
assert.strictEqual(leads[0]['Статус'], 'Оплачено');
assert.strictEqual(leads[0]['Комментарий'], 'оплата 23.08');
assert.strictEqual(leads[0]['Что разобрать'], 'продажи и база');

// второй человек — вторая строка; уведомление без шага «заявка» не уходит
assert.ok(post({ sid: 'b2', step: 'open', stepNo: 1, notify: true, row: {} }).ok);
assert.strictEqual(mainRows('b2'), 0, 'открыл и ушёл: в «Прохождения» не попадает');
assert.strictEqual(sheets['Прохождения'].rows.length, 2);
assert.strictEqual(sent.length, 1);
assert.strictEqual(sheets['События'].rows.length, 1 + 8);
assert.strictEqual(post({ step: 'open', row: {} }).ok, false, 'без ID строка не создаётся');

// формулировку вопроса поменяли: ответ идёт в тот же столбец, заголовок обновился
var before = sheets['Прохождения'].rows[0].length;
assert.ok(post({ sid: 'a1', step: 'result', stepNo: 11, row: { 'Q7. Как сейчас ведёт себя твой доход?': 'стабильный' } }).ok);
var h2 = sheets['Прохождения'].rows[0];
assert.strictEqual(h2.length, before, 'новый столбец не появился');
assert.ok(h2.indexOf('Q7. Как сейчас ведёт себя твой доход?') >= 0 && h2.indexOf('Q7. Как ведёт себя твой доход?') < 0);
assert.strictEqual(rowOf('a1')['Q7. Как сейчас ведёт себя твой доход?'], 'стабильный');

// проверочные строки: посмотреть и убрать можно только их
assert.strictEqual(post({ sid: 'a1', action: 'peek' }).ok, false);
assert.strictEqual(post({ sid: 'a1', action: 'cleanup' }).ok, false);
assert.ok(post({ sid: 'proverka-x', step: 'result', stepNo: 11, row: { 'Имя': 'Тест', 'Этап': 'Пора расти' } }).ok);
assert.ok(post({ sid: 'proverka-x', step: 'form', stepNo: 13, row: { 'Ник в Телеграме': '@test_x', 'Ссылка на блог': 'блога нет' } }).ok);
var peek = post({ sid: 'proverka-x', action: 'peek' });
assert.strictEqual(peek.main['Этап'], 'Пора расти');
assert.strictEqual(peek.lead['Ссылка на блог'], 'блога нет');
assert.strictEqual(peek.mainRows, 1);
assert.strictEqual(peek.events, 2);
var cleaned = post({ sid: 'proverka-x', action: 'cleanup' });
assert.deepStrictEqual([cleaned.main, cleaned.lead, cleaned.events], [1, 1, 2]);
assert.strictEqual(post({ sid: 'proverka-x', action: 'peek' }).main, null);
assert.strictEqual(leadRows().length, 1, 'настоящая заявка осталась');
assert.strictEqual(rowOf('a1')['Имя'], 'Аня');

// заголовки не дублируются
var head = sheets['Прохождения'].rows[0];
assert.strictEqual(head.length, new Set(head).size);
assert.deepStrictEqual(head.slice(0, 7), ['ID', 'Начало', 'Имя', 'Ник в Телеграме', 'Последний шаг', 'Шаг №', 'Ветка']);

ctx.setup();
var f = sheets['Воронка'].rows;
assert.strictEqual(f.length, 15);
assert.strictEqual(f[1][0], 'Открыл тест');
assert.strictEqual(f[1][1], "=IFERROR(COUNTUNIQUE(FILTER('События'!B:B;'События'!C:C=A2));0)");
assert.strictEqual(f[12][1], "=IFERROR(COUNTUNIQUE(FILTER('События'!B:B;'События'!C:C=A13));0)");

// уборка старых незаконченных строк: пустые и без результата уходят, с результатом и с ником остаются
var M = sheets['Прохождения'], mh = M.rows[0];
function fake(id, stepNo, nick) { var row = mh.map(function () { return ''; }); row[0] = id; row[mh.indexOf('Шаг №')] = stepNo; row[mh.indexOf('Ник в Телеграме')] = nick || ''; M.rows.push(row); }
fake('half', 4); M.rows.push(mh.map(function () { return ''; })); fake('done', 11); fake('nick-early', 3, '@early');
assert.strictEqual(ctx.pruneMain(M), 2);
var ids = M.rows.slice(1).map(function (x) { return x[0]; });
assert.ok(ids.indexOf('half') < 0 && ids.indexOf('done') >= 0 && ids.indexOf('nick-early') >= 0 && ids.indexOf('a1') >= 0, ids.join(','));
assert.strictEqual(ctx.colLetter(27), 'AA');
assert.strictEqual(ctx.colLetter(52), 'AZ');

console.log('Приёмник таблицы: все проверки пройдены');
