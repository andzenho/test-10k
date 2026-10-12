/*
  Подсчёт теста: порядок экранов, здоровье зон, утечки, этап, расчёты и тексты результата.
  Без работы со страницей: тот же файл гоняет проверка tests/check.js.
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory;
  else root.createLogic = factory;
})(typeof window !== 'undefined' ? window : this, function (D) {
  var C = D.config;
  var NBSP = '\u00A0';
  var Q = {};
  D.questions.forEach(function (q) { Q[q.id] = q; });

  function asArray(v) { return v == null || v === '' ? [] : (Array.isArray(v) ? v : [v]); }

  function cond(c, a) {
    if (!c) return true;
    var v = asArray(a[c.q]);
    return c.has.some(function (x) { return v.indexOf(x) >= 0; });
  }

  function isSearch(a) { return a.q2 === 'producer' && a.q2a === 'search'; }

  // Экраны между стартом и загрузкой, которые человек видит при этих ответах
  function sequence(a) {
    var ids = isSearch(a) ? D.flowProducer : D.flow;
    return ids.filter(function (id) { return Q[id] ? cond(Q[id].showIf, a) : true; });
  }

  function optionsFor(q, a) {
    if (!q.optionsFrom) return q.options || [];
    var src = Q[q.optionsFrom];
    var chosen = asArray(a[q.optionsFrom]);
    var dyn = src.options.filter(function (o) { return !o.exclusive && chosen.indexOf(o.id) >= 0; })
      .map(function (o) { return { id: o.id, text: o.text }; });
    return dyn.concat(q.options);
  }

  // Выбранные варианты вопроса (только те, что есть среди показанных)
  function selected(q, a) {
    var sel = asArray(a[q.id]);
    return optionsFor(q, a).filter(function (o) { return sel.indexOf(o.id) >= 0; });
  }

  function isAnswered(q, a) {
    if (q.type === 'text') return String(a[q.id] || '').trim() !== '';
    return selected(q, a).length > 0;
  }

  function optValue(id, a, seq) {
    if (seq.indexOf(id) < 0) return null;
    var s = selected(Q[id], a)[0];
    return s && s.value != null ? s.value : null;
  }

  // Минусы за ответ: [{ text, minus }]
  function contributions(q, a) {
    var sel = selected(q, a);
    var out = [];
    sel.forEach(function (o) { if (o.minus) out.push({ text: o.text, minus: o.minus }); });
    (q.rules || []).forEach(function (r) {
      if (sel.length && sel.every(function (o) { return r.onlyFrom.indexOf(o.id) >= 0; })) {
        out.push({ text: sel.map(function (o) { return o.text; }).join(', '), minus: r.minus });
      }
    });
    return out;
  }

  // Наибольший возможный минус вопроса в зону; у «до 2» — сумма двух самых больших
  function maxMinus(q, a, zone) {
    var vals = optionsFor(q, a).map(function (o) { return (o.minus && o.minus[zone]) || 0; });
    (q.rules || []).forEach(function (r) { vals.push(r.minus[zone] || 0); });
    vals.sort(function (x, y) { return y - x; });
    if (!vals.length) return 0;
    return q.type === 'upto2' ? vals[0] + (vals[1] || 0) : vals[0];
  }

  function zoneColor(h) { return h <= 3 ? 'red' : (h <= 6 ? 'yellow' : 'green'); }

  function zoneStats(a) {
    var seq = sequence(a);
    var stats = {};
    Object.keys(D.zones).forEach(function (z) { stats[z] = { minus: 0, max: 0, top: [] }; });
    seq.forEach(function (id) {
      var q = Q[id];
      if (!q || q.type === 'text') return;
      Object.keys(stats).forEach(function (z) { stats[z].max += maxMinus(q, a, z); });
      contributions(q, a).forEach(function (c) {
        Object.keys(c.minus).forEach(function (z) {
          stats[z].minus += c.minus[z];
          stats[z].top.push({ question: q.title, text: c.text, minus: c.minus[z] });
        });
      });
    });
    Object.keys(stats).forEach(function (z) {
      var s = stats[z];
      var h = s.max ? Math.round(10 * (1 - s.minus / s.max)) : 10;
      s.health = Math.max(0, Math.min(10, h));
      s.color = zoneColor(s.health);
    });
    return stats;
  }

  // Зоны от самой слабой к самой сильной; при равенстве — порядок tieOrder
  function leaks(stats) {
    return D.tieOrder.slice().sort(function (x, y) {
      return stats[x].health - stats[y].health || D.tieOrder.indexOf(x) - D.tieOrder.indexOf(y);
    });
  }

  function stageOf(a, stats) {
    if (a.q7 !== 'stable' || a.q21 === 'need' || asArray(a.q20).indexOf('wait') >= 0) return 'random';
    if (stats.SIST.health <= 5 || a.q40 === 'squeezed' || a.q39 === 'over20') return 'self';
    return 'grow';
  }

  function ceilSafe(x) { return Math.ceil(x - 1e-9); }
  function floorTo(x) { return Math.floor(x / C.ROUND_TO + 1e-9) * C.ROUND_TO; }

  function calc(a) {
    var seq = sequence(a);
    var check = optValue('q15', a, seq);
    var reach = (optValue('q9', a, seq) || 0) + (optValue('q10', a, seq) || 0);
    var writers = optValue('q22', a, seq);
    var conv = optValue('q23', a, seq);
    var clients = optValue('q5', a, seq);
    var target = C.TARGET_USD * C.USD_RATE;
    var r = {
      check: check, reach: reach, writers: writers, conv: conv, clients: clients, target: target,
      sales: null, dialogs: null, share: null, lossDm: null, baseMoney: null,
      hasBlog: asArray(a.q8).length > 0 && asArray(a.q8).indexOf('none') < 0
    };
    if (check) {
      // с продажи до эксперта доходит чек за вычетом налогов и комиссий платёжек
      r.net = Math.round(check * (1 - (C.FEES_RATE || 0)));
      r.sales = ceilSafe(target / r.net);
      r.dialogs = ceilSafe(r.sales / C.BENCH_CONV);
      if (reach > 0) r.share = r.dialogs / reach;
      if (clients != null) r.baseMoney = floorTo(Math.round(clients * check * C.BASE_REPEAT));
      if (writers != null && conv != null && conv < C.BENCH_CONV) {
        // разницу конверсий считаем в целых процентах, чтобы не терять копейки на дробях
        r.lossDm = floorTo(writers * Math.round((C.BENCH_CONV - conv) * 100) * check / 100);
      }
    }
    return r;
  }

  /* ---------- Тексты ---------- */

  function money(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + '₽';
  }

  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }

  function plural(n, one, few, many) {
    var d = Math.abs(n) % 100, u = d % 10;
    if (d > 10 && d < 20) return many;
    if (u === 1) return one;
    if (u >= 2 && u <= 4) return few;
    return many;
  }

  // {key} и {key|одна|две|пять}
  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)(?:\|([^|}]*)\|([^|}]*)\|([^|}]*))?\}/g, function (m, key, one, few, many) {
      var v = vars[key];
      if (v == null) return '';
      if (one != null) return num(v) + NBSP + plural(v, one, few, many);
      return v;
    });
  }

  function nameOf(a) {
    return String(a.q1 || '').trim().replace(/\s+/g, ' ');
  }

  function nicheOf(a) {
    var s = Q.q3 && selected(Q.q3, a)[0];
    return (s && s.niche) || 'в твоей нише';
  }

  function vars(a, k) {
    var s5 = selected(Q.q5, a)[0];
    return {
      name: nameOf(a),
      clients: s5 ? s5.text : '',
      niche: nicheOf(a),
      check: k.check ? 'около ' + money(k.check) : '',
      reach: num(k.reach),
      sales: k.sales,
      dialogs: k.dialogs,
      share: k.share != null ? Math.round(k.share * 100) : null,
      loss: k.lossDm != null ? money(k.lossDm) : '',
      baseMoney: k.baseMoney != null ? money(k.baseMoney) : '',
      writers: k.writers,
      buyers: k.writers != null && k.conv != null ? Math.max(0, Math.round(k.writers * k.conv)) : null
    };
  }

  function insight(id, a) {
    var T = D.insights[id];
    var k = calc(a);
    var v = vars(a, k);
    var tpl;
    if (id === 'insight1') tpl = a.q5 && a.q5 !== 'a' ? T.many : T.few;
    else if (id === 'insight2') {
      if (k.reach === 0) tpl = k.hasBlog ? T.noReach : T.noBlog;
      else tpl = k.share <= C.REACH_SHARE_OK ? T.ok : T.over;
    }
    else if (id === 'insight3') tpl = k.conv != null ? T.known : T.unknown;
    else tpl = T.text;
    return { label: T.label, text: fill(tpl, v) };
  }

  function pathFigure(k, v) {
    var F = D.result.figures;
    if (k.reach === 0) return fill(F.pathNoReach, v);
    return fill(k.share > 1 ? F.pathOver : F.path, v);
  }

  function figureFor(zone, a, k, v) {
    var F = D.result.figures;
    if (zone === 'SALES') {
      if (a.q23 === 'unknown') return fill(F.unknownConv, v);
      if (k.lossDm != null && k.lossDm >= C.MIN_SHOW) return fill(F.loss, v);
      return pathFigure(k, v);
    }
    if (zone === 'PROD') return fill(F.prod, v);
    if (zone === 'BASE') {
      if (k.baseMoney != null && k.baseMoney >= C.MIN_SHOW) return fill(F.base, v);
      return pathFigure(k, v);
    }
    return pathFigure(k, v);
  }

  function producerResult(a) {
    var P = D.producerResult;
    return {
      producer: true,
      name: nameOf(a),
      title: fill(P.title, { name: nameOf(a) }),
      what: P.what,
      quotes: selected(Q.p2, a).map(function (o) { return { question: Q.p2.title, text: o.text }; }),
      todo: P.todo,
      cta: P.cta
    };
  }

  function result(a) {
    if (isSearch(a)) return producerResult(a);
    var R = D.result;
    var stats = zoneStats(a);
    var order = leaks(stats);
    var main = order[0], second = order[1];
    var k = calc(a);
    var v = vars(a, k);
    var stage = stageOf(a, stats);

    var quotes = stats[main].top.slice()
      .sort(function (x, y) { return y.minus - x.minus; })
      .slice(0, 3)
      .map(function (t) { return { question: t.question, text: t.text }; });

    var strong = order.slice().reverse()
      .filter(function (z) { return stats[z].health >= 6; })
      .slice(0, 2)
      .map(function (z) { return R.zones[z].strong; });
    if (!strong.length) strong = [a.q5 && a.q5 !== 'a' ? R.strongNoneClients : R.strongNone];

    return {
      producer: false,
      name: v.name,
      title: fill(R.title, v),
      stage: stage,
      stageName: R.stages[stage].name,
      stageText: R.stages[stage].text,
      stageNext: R.stages[stage].next,
      main: main,
      second: second,
      mainTitle: R.zones[main].title,
      what: R.zones[main].what,
      quotes: quotes,
      figure: figureFor(main, a, k, v),
      figureNote: R.figures.note,
      todo: R.zones[main].todo,
      secondText: R.zones[second].second,
      strong: strong,
      map: D.mapOrder.map(function (z) {
        return { zone: z, name: D.zones[z], health: stats[z].health, color: stats[z].color, main: z === main };
      }),
      cta: { text: fill(R.cta.text, v), button: R.cta.button, note: R.cta.note },
      stats: stats,
      calc: k
    };
  }

  // Ответы словами: [{ id, title, value }] по вопросам, которые человек видел
  function answersText(a) {
    return sequence(a).filter(function (id) { return Q[id]; }).map(function (id) {
      var q = Q[id], value;
      if (q.type === 'text') value = String(a[id] || '').trim();
      else {
        value = selected(q, a).map(function (o) {
          var extra = o.input ? String(a[id + '_other'] || '').trim() : '';
          return extra ? o.text + ': ' + extra : o.text;
        }).join('; ');
      }
      return { id: id, title: q.title, value: value };
    });
  }

  return {
    Q: Q,
    sequence: sequence,
    isSearch: isSearch,
    optionsFor: optionsFor,
    selected: selected,
    isAnswered: isAnswered,
    zoneStats: zoneStats,
    leaks: leaks,
    stageOf: stageOf,
    calc: calc,
    insight: insight,
    result: result,
    answersText: answersText,
    money: money,
    fill: fill,
    cond: cond
  };
});
