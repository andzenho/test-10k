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
      insertSheet: function (n) { return (sheets[n] = new Sheet()); }
    };
  } },
  LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: function (s) { return { setMimeType: function () { return JSON.parse(s); } }; } },
  PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k]; } }; } },
  UrlFetchApp: { fetch: function (url, o) { sent.push({ url: url, body: JSON.parse(o.payload) }); } }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../integrations/google-sheets/Code.gs'), 'utf8'), ctx);

function post(p) { return ctx.doPost({ postData: { contents: JSON.stringify(p) } }); }
function rowOf(sid) {
  var m = sheets['Прохождения'], h = m.rows[0], out = {};
  var r = m.rows.filter(function (x) { return x[0] === sid; });
  assert.strictEqual(r.length, 1, 'строк с ID ' + sid + ': ' + r.length);
  h.forEach(function (k, i) { out[k] = r[0][i] == null ? '' : r[0][i]; });
  return out;
}

assert.deepStrictEqual(ctx.doGet(), { ok: true, 'версия': 1 });

assert.ok(post({ sid: 'a1', step: 'open', stepNo: 1, row: { 'Имя': '', utm_source: 'tg' } }).ok);
assert.ok(post({ sid: 'a1', step: 'block2', stepNo: 4, row: { 'Имя': 'Аня' } }).ok);
// запрос пришёл с опозданием: шаг назад не откатывается
assert.ok(post({ sid: 'a1', step: 'block1', stepNo: 3, row: { 'Имя': 'Аня' } }).ok);
var r = rowOf('a1');
assert.strictEqual(r['Шаг №'], 4);
assert.strictEqual(r['Последний шаг'], 'Закончил блок 2: Площадки и охваты');
assert.strictEqual(r['Имя'], 'Аня');
assert.strictEqual(r.utm_source, 'tg');
// даты создаются внутри скрипта, поэтому проверяем по типу, а не через instanceof
[r['Начало'], r['Обновлено']].forEach(function (d) {
  assert.strictEqual(Object.prototype.toString.call(d), '[object Date]');
});

assert.ok(post({ sid: 'a1', step: 'result', stepNo: 11, row: {
  'Имя': 'Аня', 'Ветка': 'эксперт', 'Этап': 'Случайные деньги', 'Главная утечка': 'Продажи',
  'Здоровье: Продажи': 2, 'Q7. Как ведёт себя твой доход?': 'скачет от месяца к месяцу',
  'Q4. Чем ты помогаешь людям? В двух словах': '=HYPERLINK("http://x")', 'ID': 'подмена', 'Шаг №': 99
} }).ok);
r = rowOf('a1');
assert.strictEqual(r['Главная утечка'], 'Продажи');
assert.strictEqual(r['Здоровье: Продажи'], 2);
assert.strictEqual(r['Q4. Чем ты помогаешь людям? В двух словах'], '\'=HYPERLINK("http://x")', 'формула должна стать текстом');
assert.strictEqual(r['Шаг №'], 11, 'служебные колонки со страницы не перезаписываются');
assert.strictEqual(sent.length, 0, 'до заявки уведомлений нет');

assert.ok(post({ sid: 'a1', step: 'form', stepNo: 13, notify: true, row: {
  'Имя': 'Аня', 'Ник в Телеграме': '@anya', 'Что разобрать': 'продажи в переписке', 'Готовность': 8
} }).ok);
assert.strictEqual(sent.length, 1);
assert.ok(/bottest-token\/sendMessage$/.test(sent[0].url));
var text = sent[0].body.text;
['Имя: Аня', 'Ник: @anya', 'Главная утечка: Продажи', 'Этап: Случайные деньги', 'Готовность: 8 из 10', 'Что хочет разобрать: продажи в переписке']
  .forEach(function (s) { assert.ok(text.indexOf(s) >= 0, 'в уведомлении нет: ' + s + '\n' + text); });

// второй человек — вторая строка; уведомление без шага «заявка» не уходит
assert.ok(post({ sid: 'b2', step: 'open', stepNo: 1, notify: true, row: {} }).ok);
assert.strictEqual(sheets['Прохождения'].rows.length, 3);
assert.strictEqual(sent.length, 1);
assert.strictEqual(sheets['События'].rows.length, 1 + 6);
assert.strictEqual(post({ step: 'open', row: {} }).ok, false, 'без ID строка не создаётся');

// заголовки не дублируются
var head = sheets['Прохождения'].rows[0];
assert.strictEqual(head.length, new Set(head).size);
assert.deepStrictEqual(head.slice(0, 6), ['ID', 'Начало', 'Обновлено', 'Последний шаг', 'Шаг №', 'Ветка']);

ctx.setup();
var f = sheets['Воронка'].rows;
assert.strictEqual(f.length, 15);
assert.strictEqual(f[1][1], '=COUNTIF(\'Прохождения\'!E:E;">=1")');
assert.ok(/COUNTIFS/.test(f[4][1]) && /продюсер без проекта/.test(f[4][1]));

console.log('Приёмник таблицы: все проверки пройдены');
