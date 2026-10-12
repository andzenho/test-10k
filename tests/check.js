/*
  Проверка подсчёта: node tests/check.js
  Пример из ТЗ, главная утечка в каждой из 6 зон, ветка продюсера, краевые значения.
*/
var assert = require('assert');
var D = require('../data.js');
var L = require('../logic.js')(D);

var passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}
function plain(s) { return String(s).replace(/\u00A0/g, ' '); }

// Ответы без единого минуса: чек 50 000, Instagram 300–700 и Телеграм 100–300
function ideal() {
  return {
    q1: 'Аня', q2: 'expert', q3: 'psy', q4: '', q5: 'b', q6: 'b', q7: 'stable',
    q8: ['instagram', 'telegram'], q9: 'c', q10: 'b', q12: 'a', q13: 'instagram',
    q14: ['support', 'course'], q15: 'c', q16: 'a', q17: 'a', q18: 'a', q19: ['none'],
    q20: ['chat'], q21: 'monthly', q22: 'c', q23: 'c', q24: 'b', q25: 'a', q26: ['none'],
    q27: 'a', q28: 'a', q29: 'a',
    q30: 'a', q31: 'a', q32: 'a', q33: 'a', q34: ['none'],
    q35: ['reels'], q36: 'c',
    q37: ['assistant'], q38: 'c', q39: 'a', q40: 'a', q41: 'a', q42: ['a']
  };
}
function mix(over) { var a = ideal(); Object.keys(over).forEach(function (k) { a[k] = over[k]; }); return a; }

console.log('Пример из ТЗ');
test('чек 50 000: 18 продаж, 60 диалогов, охват 700, 9%', function () {
  var k = L.calc(mix({ q23: 'b' }));
  assert.strictEqual(k.sales, 18);
  assert.strictEqual(k.dialogs, 60);
  assert.strictEqual(k.reach, 700);
  assert.strictEqual(Math.round(k.share * 100), 9);
});
test('потери в переписке 62 500 → 60 000 ₽', function () {
  assert.strictEqual(L.calc(mix({ q23: 'b' })).lossDm, 60000);
});
test('вывод 2: цель реальна на текущей аудитории', function () {
  var t = plain(L.insight('insight2', ideal()).text);
  assert.ok(/Тебя видят около 700 человек/.test(t), t);
  assert.ok(/около 50 000 ₽ для \$10 000 нужно 18 продаж/.test(t), t);
  assert.ok(/это реально/.test(t), t);
});

console.log('Здоровье зон');
test('без минусов все зоны 10, этап «Пора расти»', function () {
  var a = mix({ q42: [] });
  var s = L.zoneStats(a);
  Object.keys(s).forEach(function (z) { assert.strictEqual(s[z].health, 10, z); });
  assert.strictEqual(L.result(mix({})).stage, 'grow');
});
test('максимумы зон по показанным вопросам', function () {
  var s = L.zoneStats(ideal());
  // q14 2 + q15 2 + q16 1 + q17 2 + q18 2 + q19 (2+1) + q42 1
  assert.strictEqual(s.PROD.max, 13);
  // q13 1 + q14 1 + q16 1 + q20 2 + q21 1 + q23 2 + q24 2 + q25 2 + q26 (2+2) + q33 1 + q42 1
  assert.strictEqual(s.SALES.max, 18);
  // q18 1 + q27 2 + q28 2 + q29 1
  assert.strictEqual(s.BASE.max, 6);
  // q8 1 + q12 2 + q19 1 + q22 1 + q29 2 + q30 2 + q31 2 + q32 2 + q33 2 + q34 (2+2)
  assert.strictEqual(s.CONT.max, 19);
  // q8 2 + q35 2 + q36 2 + q42 1 (q11 не показан: роликов нет)
  assert.strictEqual(s.ORG.max, 7);
  // q7 2 + q19 2 + q20 1 + q21 2 + q23 1 + q26 1 + q37 1 + q38 2 + q39 2 + q40 2 + q41 2 + q42 (1+1)
  assert.strictEqual(s.SIST.max, 20);
});
test('q11 добавляет максимум органике, только если есть ролики', function () {
  assert.strictEqual(L.zoneStats(mix({ q8: ['instagram', 'reels'], q11: 'a' })).ORG.max, 9);
});
test('правила q14 и q35', function () {
  assert.strictEqual(L.zoneStats(mix({ q14: ['consult', 'packs'] })).PROD.minus, 2);
  assert.strictEqual(L.zoneStats(mix({ q14: ['consult', 'course'] })).PROD.minus, 0);
  assert.strictEqual(L.zoneStats(mix({ q14: ['club'] })).PROD.minus, 1);
  assert.strictEqual(L.zoneStats(mix({ q35: ['ads'], q42: [] })).ORG.minus, 1);
  assert.strictEqual(L.zoneStats(mix({ q35: ['ads', 'reels'], q42: [] })).ORG.minus, 0);
});

console.log('Главная утечка в каждой зоне');
var worst = {
  SALES: { q13: 'unknown', q20: ['wait'], q23: 'a', q24: 'a', q25: 'c', q26: ['a', 'b'] },
  PROD: { q14: ['consult'], q15: 'a', q16: 'e', q17: 'c', q18: 'c', q19: ['a', 'b'] },
  BASE: { q18: 'b', q27: 'd', q28: 'c', q29: 'c' },
  CONT: { q12: 'd', q29: 'c', q30: 'c', q31: 'd', q32: 'c', q33: 'c', q34: ['a', 'b'] },
  ORG: { q35: ['none'], q36: 'a', q42: ['a'] },
  SIST: { q7: 'zero', q21: 'need', q37: ['none'], q38: 'a', q39: 'over20', q40: 'squeezed', q41: 'c', q42: ['d', 'e'] }
};
Object.keys(worst).forEach(function (z) {
  test(z + ': ' + D.result.zones[z].title, function () {
    var r = L.result(mix(worst[z]));
    assert.strictEqual(r.main, z, 'главная утечка ' + r.main);
    assert.strictEqual(r.mainTitle, D.result.zones[z].title);
    assert.ok(r.quotes.length >= 1 && r.quotes.length <= 3);
    assert.ok(r.figure && r.todo && r.secondText && r.strong.length);
    assert.strictEqual(r.map.length, 6);
    assert.ok(r.map.filter(function (m) { return m.main; })[0].zone === z);
  });
});
test('при равенстве здоровья порядок: продажи, продукт, база…', function () {
  var r = L.result(mix({ q42: [] }));
  assert.strictEqual(r.main, 'SALES');
  assert.strictEqual(r.second, 'PROD');
});

console.log('Цифры в результате');
test('продажи: потери в переписке', function () {
  var r = L.result(mix(Object.assign({}, worst.SALES, { q23: 'a' })));
  // 25 × (0,3 − 0,05) × 50 000 = 312 500 → 310 000
  assert.strictEqual(r.calc.lossDm, 310000);
  assert.ok(/около 310 000 ₽ в месяц только в переписке/.test(plain(r.figure)), plain(r.figure));
});
test('продажи: конверсия «не считал(а)»', function () {
  var r = L.result(mix(Object.assign({}, worst.SALES, { q23: 'unknown' })));
  assert.strictEqual(r.main, 'SALES');
  assert.strictEqual(r.calc.lossDm, null);
  assert.ok(/Ты не знаешь, сколько из написавших покупают/.test(r.figure));
  assert.ok(/не считаешь/.test(L.insight('insight3', mix({ q23: 'unknown' })).text));
});
test('продажи: маленькие потери заменяются цифрой пути', function () {
  // 3 × 0,05 × 7 000 = 1 050 → меньше 10 000
  var r = L.result(mix(Object.assign({}, worst.SALES, { q22: 'a', q23: 'b', q15: 'a' })));
  assert.strictEqual(r.main, 'SALES');
  assert.ok(/диалогов в месяц/.test(plain(r.figure)), plain(r.figure));
});
test('продукт: чек до 10 тысяч → 129 продаж', function () {
  var r = L.result(mix(worst.PROD));
  assert.strictEqual(r.calc.sales, 129);
  assert.strictEqual(r.calc.dialogs, 430);
  assert.ok(/При чеке около 7 000 ₽ для \$10 000 нужно 129 продаж в месяц/.test(plain(r.figure)), plain(r.figure));
});
test('база: 30 клиентов × 5% × 50 000 = 75 000 ₽', function () {
  var r = L.result(mix(worst.BASE));
  assert.strictEqual(r.calc.baseMoney, 75000);
  assert.ok(/до 75 000 ₽ в год/.test(plain(r.figure)), plain(r.figure));
});
test('база: маленькая сумма заменяется цифрой пути', function () {
  var r = L.result(mix(Object.assign({}, worst.BASE, { q5: 'a', q15: 'a' })));
  assert.strictEqual(r.calc.baseMoney, 0);
  assert.ok(/диалогов в месяц/.test(plain(r.figure)));
});
test('цифра пути с долей аудитории', function () {
  var r = L.result(mix(worst.CONT));
  assert.ok(/нужно 18 продаж и около 60 диалогов в месяц\. Это 9% твоей аудитории/.test(plain(r.figure)), plain(r.figure));
});
test('охват 0: блога нет', function () {
  var a = mix(Object.assign({}, worst.ORG, { q8: ['none'], q9: undefined, q10: undefined, q13: 'recom' }));
  var r = L.result(a);
  assert.strictEqual(r.calc.reach, 0);
  assert.strictEqual(r.calc.share, null);
  assert.strictEqual(r.main, 'ORG');
  assert.ok(!/аудитории/.test(r.figure), r.figure);
  assert.ok(/Блога пока почти нет/.test(L.insight('insight2', a).text));
});
test('охват 0, но блог есть (только YouTube): не пишем «блога нет»', function () {
  var a = mix({ q8: ['youtube'], q11: 'a', q13: 'youtube' });
  assert.strictEqual(L.calc(a).reach, 0);
  assert.ok(!/Блога пока почти нет/.test(L.insight('insight2', a).text));
});
test('старые ответы скрытых вопросов не считаются', function () {
  // был Instagram с охватом, потом сняли: q9 остался в ответах, но в охват не идёт
  var a = mix({ q8: ['telegram'], q9: 'f', q13: 'telegram' });
  assert.strictEqual(L.calc(a).reach, 200);
});
test('вывод 2: нужна почти вся аудитория', function () {
  var a = mix({ q8: ['telegram'], q10: 'a', q13: 'telegram', q15: 'a' });
  assert.ok(/почти вся твоя аудитория/.test(L.insight('insight2', a).text));
  var r = L.result(Object.assign(a, worst.CONT));
  assert.ok(/больше, чем вся твоя аудитория/.test(r.figure), r.figure);
});
test('вывод 3: пишут и покупают', function () {
  var t = plain(L.insight('insight3', mix({ q22: 'a', q23: 'a' })).text);
  assert.ok(/пишут около 3 человек в месяц, покупают около 0/.test(t), t);
});
test('вывод 1 по числу клиентов', function () {
  assert.ok(/Аня, за тобой уже 10–50 клиентов/.test(L.insight('insight1', ideal()).text));
  assert.ok(/клиентов пока немного/.test(L.insight('insight1', mix({ q5: 'a' })).text));
});

console.log('Этап');
test('случайные деньги', function () {
  assert.strictEqual(L.result(mix({ q7: 'jump' })).stage, 'random');
  assert.strictEqual(L.result(mix({ q21: 'need' })).stage, 'random');
  assert.strictEqual(L.result(mix({ q20: ['chat', 'wait'] })).stage, 'random');
});
test('всё держится на тебе', function () {
  assert.strictEqual(L.result(mix({ q40: 'squeezed' })).stage, 'self');
  assert.strictEqual(L.result(mix({ q39: 'over20' })).stage, 'self');
  var r = L.result(mix({ q37: ['none'], q38: 'a', q39: 'c', q40: 'b', q41: 'c', q42: ['d', 'e'], q19: ['d'], q23: 'unknown' }));
  assert.ok(r.stats.SIST.health <= 5, 'СИСТ ' + r.stats.SIST.health);
  assert.strictEqual(r.stage, 'self');
});

console.log('Сильные стороны и тексты');
test('сильные стороны только от 6 баллов', function () {
  var all = {};
  Object.keys(worst).forEach(function (z) { Object.assign(all, worst[z]); });
  var r = L.result(mix(Object.assign(all, { q8: ['none'], q13: 'unknown', q22: 'a' })));
  r.map.forEach(function (m) { assert.ok(m.health < 6, m.zone + ' ' + m.health); });
  assert.deepStrictEqual(r.strong, [D.result.strongNoneClients]);
  assert.deepStrictEqual(L.result(mix(Object.assign(all, { q5: 'a' }))).strong, [D.result.strongNone]);
  assert.strictEqual(L.result(mix(worst.BASE)).strong.length, 2);
});
test('ниша в предложном падеже', function () {
  assert.ok(/сделать в психологии при твоём чеке/.test(L.result(ideal()).cta.text));
  assert.ok(/сделать в твоей нише при/.test(L.result(mix({ q3: 'other', q3_other: 'сад' })).cta.text));
});
test('в шаблонах не осталось скобок-подстановок', function () {
  Object.keys(worst).forEach(function (z) {
    var r = L.result(mix(worst[z]));
    [r.title, r.figure, r.cta.text, r.secondText, r.what, r.todo].forEach(function (s) {
      assert.ok(!/[{}]|undefined|null|NaN/.test(s), s);
    });
  });
  ['insight1', 'insight2', 'insight3', 'insight4'].forEach(function (id) {
    assert.ok(!/[{}]|undefined|null|NaN/.test(L.insight(id, ideal()).text));
  });
});

console.log('Порядок экранов');
test('эксперт: условия показа вопросов', function () {
  var s = L.sequence(ideal());
  assert.ok(s.indexOf('q2a') < 0 && s.indexOf('q11') < 0);
  assert.ok(s.indexOf('q9') > 0 && s.indexOf('q10') > 0);
  assert.deepStrictEqual(s.slice(s.indexOf('q13'), s.indexOf('q13') + 3), ['q13', 'case1', 'q14']);
  assert.deepStrictEqual(s.slice(s.indexOf('q19'), s.indexOf('q19') + 4), ['q19', 'insight2', 'case2', 'q20']);
  assert.deepStrictEqual(s.slice(s.indexOf('q34'), s.indexOf('q34') + 4), ['q34', 'map1', 'insight4', 'q35']);
  assert.deepStrictEqual(s.slice(s.indexOf('q36'), s.indexOf('q36') + 3), ['q36', 'case3', 'q37']);
  assert.deepStrictEqual(s.slice(s.indexOf('q30'), s.indexOf('q30') + 3), ['q30', 'plan1', 'q31']);
  var none = L.sequence(mix({ q8: ['none'] }));
  assert.ok(none.indexOf('q9') < 0 && none.indexOf('q10') < 0 && none.indexOf('q11') < 0);
});
test('q13: площадки из q8 плюс два постоянных варианта', function () {
  var o = L.optionsFor(L.Q.q13, ideal()).map(function (x) { return x.text; });
  assert.deepStrictEqual(o, ['Instagram', 'Телеграм-канал', 'по рекомендациям', 'не знаю']);
  assert.strictEqual(L.optionsFor(L.Q.q13, mix({ q8: ['none'] })).length, 2);
});
test('продюсер с проектом идёт по обычному тесту', function () {
  var s = L.sequence(mix({ q2: 'producer', q2a: 'lead' }));
  assert.ok(s.indexOf('q2a') === 2 && s.indexOf('q42') > 0);
  assert.ok(L.cond(L.Q.q3.noteIf, { q2: 'producer' }));
  assert.ok(!L.cond(L.Q.q3.noteIf, { q2: 'expert' }));
});
test('продюсер без проекта: три вопроса и свой результат', function () {
  var a = { q1: 'Олег', q2: 'producer', q2a: 'search', p1: 'a', p2: ['a', 'c'], p3: 'f' };
  assert.deepStrictEqual(L.sequence(a), ['q1', 'q2', 'q2a', 'p1', 'case1', 'p2', 'p3']);
  var r = L.result(a);
  assert.ok(r.producer);
  assert.strictEqual(r.title, 'Олег, твои $10 000 начинаются с первого проекта');
  assert.deepStrictEqual(r.quotes.map(function (q) { return q.text; }), ['не знаю, где искать экспертов', 'нет кейсов']);
});
test('ответы словами для таблицы', function () {
  var t = L.answersText(mix({ q3: 'other', q3_other: 'садоводство' }));
  var by = {}; t.forEach(function (x) { by[x.id] = x.value; });
  assert.strictEqual(by.q3, 'Другое: садоводство');
  assert.strictEqual(by.q8, 'Instagram; Телеграм-канал');
  assert.ok(!('q11' in by));
});

console.log('\nПройдено проверок: ' + passed);
