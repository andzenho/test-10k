/*
  Экраны теста. Тексты и баллы лежат в data.js, подсчёт в logic.js.
*/
(function () {
  'use strict';

  var D = window.TEST_DATA;
  var L = window.createLogic(D);
  var C = D.config;
  var root = document.getElementById('app');
  var KEY = 'test10k:v1';
  var NBSP = '\u00A0';
  var TAIL = ['loading', 'result', 'form', 'thanks'];
  // номера шагов воронки для таблицы
  var STEP_NO = {
    open: 1, start: 2, block1: 3, block2: 4, blockP: 4, block3: 5, block4: 6, block5: 7,
    block6: 8, block7: 9, block8: 10, result: 11, cta: 12, form: 13, tg: 14
  };

  var state = load() || fresh();
  var busy = false;
  var timer = null;

  /* ---------- Состояние ---------- */

  function fresh() {
    return {
      sid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      screen: 'start',
      answers: {},
      form: {},
      tracked: {},
      utm: readUtm()
    };
  }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      return s && s.sid && s.answers ? s : null;
    } catch (e) { return null; }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* закрытый режим */ }
  }

  function readUtm() {
    var out = {};
    try {
      var p = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
        if (p.get(k)) out[k] = p.get(k).slice(0, 200);
      });
    } catch (e) { /* старый браузер */ }
    return out;
  }

  /* ---------- Текст ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }

  // Неразрывные пробелы: в числах, перед тире, после предлогов и союзов
  var SHORT = /(^|[\s\u00A0(«„])(в|во|к|ко|с|со|о|об|у|и|а|но|на|по|за|из|от|до|не|ни|для|при|под|над|без|про|или) (?=\S)/gi;
  function typo(s) {
    s = String(s)
      .replace(/(\d) (?=\d{3}(?!\d))/g, '$1' + NBSP)
      .replace(/(\d) (₽|%|млн|тысяч)/g, '$1' + NBSP + '$2')
      .replace(/ ([—–]) /g, NBSP + '$1 ');
    return s.replace(SHORT, '$1$2' + NBSP).replace(SHORT, '$1$2' + NBSP);
  }

  function tx(s) { return esc(typo(s)); }
  // суммы в долларах золотом
  function hl(s) { return tx(s).replace(/\$\d[\d\u00A0]*/g, '<span class="gold">$&</span>'); }
  // числа жирным
  function nums(s) { return tx(s).replace(/\$?\d[\d\u00A0]*(?:₽|%)?/g, '<b>$&</b>'); }
  function quote(s) { return '«' + String(s).replace(/«/g, '„').replace(/»/g, '“') + '»'; }

  function asArray(v) { return v == null || v === '' ? [] : (Array.isArray(v) ? v : [v]); }

  /* ---------- Отправка в таблицу ---------- */

  function send(step, row, notify) {
    if (!C.SHEET_URL) return Promise.resolve();
    var body = JSON.stringify({ sid: state.sid, step: step, stepNo: STEP_NO[step] || 0, row: row, notify: !!notify });
    try {
      return fetch(C.SHEET_URL, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body
      }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }

  function baseRow() {
    var row = { 'Имя': String(state.answers.q1 || '').trim() };
    Object.keys(state.utm || {}).forEach(function (k) { row[k] = state.utm[k]; });
    if (document.referrer) row['Откуда пришёл'] = document.referrer.slice(0, 200);
    return row;
  }

  function track(step) {
    if (state.tracked[step]) return;
    state.tracked[step] = 1;
    save();
    send(step, baseRow());
  }

  function resultRow() {
    var a = state.answers;
    var r = L.result(a);
    var row = baseRow();
    row['Ветка'] = r.producer ? 'продюсер без проекта' : (a.q2 === 'producer' ? 'продюсер с проектом' : 'эксперт');
    if (!r.producer) {
      row['Этап'] = r.stageName;
      row['Главная утечка'] = D.zones[r.main];
      row['Вторая утечка'] = D.zones[r.second];
      r.map.forEach(function (m) { row['Здоровье: ' + m.name] = m.health; });
      var k = r.calc;
      row['Чек, ₽'] = k.check;
      row['Охват'] = k.reach;
      row['Нужно продаж'] = k.sales;
      row['Нужно диалогов'] = k.dialogs;
      row['Доля охвата, %'] = k.share != null ? Math.round(k.share * 100) : '';
      row['Пишут в месяц'] = k.writers;
      row['Конверсия'] = k.conv != null ? k.conv : 'не считал(а)';
      row['Потери в переписке, ₽ в месяц'] = k.lossDm != null ? k.lossDm : '';
      row['Денег в базе, ₽ в год'] = k.baseMoney != null ? k.baseMoney : '';
    }
    L.answersText(a).forEach(function (x) { row[x.id.toUpperCase() + '. ' + x.title] = x.value; });
    return row;
  }

  function normNick(v) {
    v = String(v || '').trim().replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').replace(/\s+/g, '');
    if (!v) return '';
    return v.charAt(0) === '@' ? v : '@' + v;
  }

  /* ---------- Переходы ---------- */

  function screens() { return ['start'].concat(L.sequence(state.answers), TAIL); }

  function go(id) {
    clearTimeout(timer);
    busy = false;
    state.screen = id;
    save();
    render();
    window.scrollTo(0, 0);
  }

  function next() {
    var list = screens();
    var i = list.indexOf(state.screen);
    var q = L.Q[state.screen];
    if (q) {
      // последний вопрос блока: следующий вопрос уже из другого блока или вопросов больше нет
      var following = list.slice(i + 1).map(function (id) { return L.Q[id]; }).filter(Boolean)[0];
      if (!following || following.block !== q.block) track('block' + q.block);
    }
    go(list[i + 1] || 'result');
  }

  function back() {
    if (state.screen === 'form') return go('result');
    var list = screens();
    var i = list.indexOf(state.screen);
    if (i > 0) go(list[i - 1]);
  }

  function restart() {
    if (!window.confirm('Начать тест заново? Ответы сотрутся.')) return;
    var utm = state.utm;
    state = fresh();
    state.utm = utm;
    go('start');
  }

  /* ---------- Части экранов ---------- */

  function topBar(label, name) {
    var qs = screens().filter(function (id) { return L.Q[id]; });
    var list = screens();
    var pos = 0;
    for (var i = 0; i <= list.indexOf(state.screen); i++) if (L.Q[list[i]]) pos++;
    var pct = Math.max(3, Math.min(100, Math.round((pos - (L.Q[state.screen] ? 1 : 0)) / qs.length * 100)));
    return '<header class="top">' +
      '<button class="back" type="button" data-act="back" aria-label="' + esc(D.buttons.back) + '">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<div class="top__meta">' + (label ? '<span class="top__block">' + tx(label) + '</span>' : '') +
      (name ? '<span class="top__name">' + tx(name) + '</span>' : '') + '</div>' +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '</header>';
  }

  function foot(label, disabled, act) {
    return '<footer class="foot"><button class="btn" type="button" data-act="' + (act || 'next') + '"' +
      (disabled ? ' disabled' : '') + '>' + tx(label) + '</button></footer>';
  }

  var CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function mapRows(rows) {
    return '<ul class="map">' + rows.map(function (m) {
      return '<li class="map__row' + (m.main ? ' is-main' : '') + '">' +
        '<span class="map__name">' + tx(m.name) +
        (m.main ? '<em class="map__tag">' + tx(D.result.mapMainTag) + '</em>' : '') + '</span>' +
        '<span class="map__track"><i class="is-' + m.color + '" style="width:' + Math.max(4, m.health * 10) + '%"></i></span>' +
        '<span class="map__score">' + m.health + '<small>/10</small></span>' +
        '</li>';
    }).join('') + '</ul>';
  }

  function quotesList(quotes) {
    return '<ul class="quotes">' + quotes.map(function (q) {
      return '<li><span class="quotes__q">' + tx(q.question) + '</span>' +
        '<span class="quotes__a">' + tx(quote(q.text)) + '</span></li>';
    }).join('') + '</ul>';
  }

  /* ---------- Экраны ---------- */

  function viewStart() {
    var S = D.start;
    var sample = D.mapOrder.map(function (z) {
      var h = S.mapSample[z];
      return { name: D.zones[z], health: h, color: h <= 3 ? 'red' : (h <= 6 ? 'yellow' : 'green') };
    });
    return '<div class="screen screen--start">' +
      '<div class="pills">' + S.pills.map(function (p) {
        return '<div class="pill"><span>' + tx(p.label) + '</span><b>' + tx(p.value) + '</b></div>';
      }).join('<i class="pills__dot" aria-hidden="true"></i>') + '</div>' +
      '<h1 class="hero" tabindex="-1">' + hl(S.title) + '</h1>' +
      '<p class="by">' + tx(S.author) + '</p>' +
      '<p class="lead"><b>' + tx(S.subtitle) + '</b> ' + tx(S.text) + '</p>' +
      '<button class="btn" type="button" data-act="start">' + tx(S.button) + '</button>' +
      '<p class="fine">' + tx(S.note) + '</p>' +
      '<figure class="sheet sheet--sample" aria-hidden="true">' + mapRows(sample) +
      '<figcaption>' + tx(S.mapCaption) + '</figcaption></figure>' +
      '</div>';
  }

  function viewQuestion(q) {
    var a = state.answers;
    var B = D.blocks[q.block];
    var html = '<div class="screen screen--q">' + topBar(B.label, B.name) + '<main class="q">';
    if (q.note && L.cond(q.noteIf, a)) html += '<p class="bubble">' + tx(q.note) + '</p>';
    html += '<h1 class="q__title" tabindex="-1">' + tx(q.title) + '</h1>';

    if (q.type === 'text') {
      var val = String(a[q.id] || '');
      html += '<input class="field" type="text" data-text="' + q.id + '" maxlength="160" value="' + esc(val) + '"' +
        ' placeholder="' + esc(q.placeholder || '') + '" autocomplete="' + (q.id === 'q1' ? 'given-name' : 'off') + '"' +
        ' enterkeyhint="next" aria-label="' + esc(q.title) + '">';
      if (!q.required) html += '<p class="q__hint">' + tx(D.hints.optional) + '</p>';
      html += '</main>' + foot(!q.required && !val.trim() ? D.buttons.skip : D.buttons.next, q.required && !val.trim());
      return html + '</div>';
    }

    var opts = L.optionsFor(q, a);
    var ids = opts.map(function (o) { return o.id; });
    var sel = asArray(a[q.id]).filter(function (id) { return ids.indexOf(id) >= 0; });
    var many = q.type !== 'one';
    if (many) html += '<p class="q__hint" data-hint>' + tx(q.type === 'upto2' ? D.hints.upto2 : D.hints.multi) + '</p>';

    html += '<div class="opts' + (many ? ' opts--many' : '') + '" role="' + (many ? 'group' : 'radiogroup') + '">';
    var otherOn = null;
    opts.forEach(function (o) {
      var on = sel.indexOf(o.id) >= 0;
      if (on && o.input) otherOn = o;
      html += '<button class="opt' + (on ? ' is-on' : '') + '" type="button" data-opt="' + esc(o.id) + '"' +
        ' role="' + (many ? 'checkbox' : 'radio') + '" aria-checked="' + on + '">' +
        '<span class="opt__mark">' + CHECK + '</span><span class="opt__text">' + tx(o.text) + '</span></button>';
    });
    html += '</div>';
    if (otherOn) {
      html += '<input class="field field--other" type="text" data-text="' + q.id + '_other" maxlength="120"' +
        ' value="' + esc(a[q.id + '_other'] || '') + '" placeholder="' + esc(otherOn.placeholder || '') + '"' +
        ' enterkeyhint="next" aria-label="' + esc(otherOn.placeholder || otherOn.text) + '">';
    }
    html += '</main>';
    // у вопроса с одним вариантом кнопка нужна, только если ответ уже есть (вернулись назад)
    if (many || (sel.length && !busy)) html += foot(D.buttons.next, !sel.length);
    return html + '</div>';
  }

  function viewInsight(id) {
    var ins = L.insight(id, state.answers);
    return '<div class="screen screen--insight">' + topBar('') +
      '<main class="insight"><span class="tag">' + tx(ins.label) + '</span>' +
      '<h1 class="insight__text" tabindex="-1">' + nums(ins.text).replace(/<b>/g, '<b class="gold">') + '</h1></main>' +
      foot(D.buttons.next) + '</div>';
  }

  // скрины-доказательства: одна картинка или несколько в одной рамке
  function shotsHtml(shots) {
    return (shots || []).map(function (s) {
      return '<figure class="shot">' + (s.parts || [s]).map(function (p) {
        return '<img src="' + esc(p.src) + '" width="' + p.w + '" height="' + p.h + '" alt="' + esc(p.alt) + '">';
      }).join('') +
        (s.caption ? '<figcaption>' + tx(s.caption) + '</figcaption>' : '') + '</figure>';
    }).join('');
  }

  function viewCase(id) {
    var c = D.cases[id];
    return '<div class="screen screen--case">' + topBar('') +
      '<main class="case"><span class="tag">' + tx(c.label) + '</span>' +
      '<h1 class="case__who" tabindex="-1">' + tx(c.who) + '</h1>' +
      '<div class="duo">' +
      '<div class="duo__from"><span class="duo__label">' + tx(c.from.label) + '</span>' +
      '<b class="duo__num">' + tx(c.from.value) + '</b></div>' +
      '<div class="duo__to"><span class="duo__arrow" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 4v15m-6.5-6.5L12 19l6.5-6.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
      '<span class="duo__label">' + tx(c.to.label) + '</span>' +
      '<b class="duo__num">' + tx(c.to.value) + '</b></div></div>' +
      shotsHtml(c.shots) +
      [].concat(c.text || []).map(function (p) { return '<p class="case__text">' + tx(p) + '</p>'; }).join('') + '</main>' +
      foot(D.buttons.next) + '</div>';
  }

  function chip(text, tone, wrap) {
    return '<span class="chip chip--' + tone + (wrap ? ' chip--wrap' : '') + '">' + tx(text) + '</span>';
  }

  function tabsRow(tabs, on) {
    return '<div class="smap__tabs" aria-hidden="true">' + tabs.map(function (t, i) {
      return '<span' + (i === on ? ' class="is-on"' : '') + '>' + tx(t) + '</span>';
    }).join('') + '</div>';
  }

  // карта смыслов: слои, смыслы и точки по числу единиц контента
  function mapWidget(m) {
    function dots(r) {
      var out = '', i, work = r.work || 0;
      for (i = 0; i < (r.out || 0); i++) out += '<i class="d-out"></i>';
      for (i = 0; i < work; i++) out += '<i class="' + (i < Math.ceil(work / 2) && work > 1 ? 'd-work2' : 'd-work') + '"></i>';
      for (i = 0; i < (r.stock || 0); i++) out += '<i class="d-stock"></i>';
      return out;
    }
    function label(r) {
      var p = [];
      if (r.out) p.push(m.legend.out + ' ' + r.out);
      if (r.work) p.push(m.legend.work + ' ' + r.work);
      if (r.stock) p.push(m.legend.stock + ' ' + r.stock);
      return p.join(', ') || m.empty;
    }
    return tabsRow(m.tabs, m.tabs.length - 1) +
      '<p class="smap__total">' + tx(m.total) + '</p>' +
      '<div class="smap__chips">' + m.stats.map(function (c) { return chip(c.text, c.tone); }).join('') + '</div>' +
      '<div class="smap__legend" aria-hidden="true"><span><i class="d-out"></i>' + tx(m.legend.out) + '</span>' +
      '<span><i class="d-work2"></i><i class="d-work"></i>' + tx(m.legend.work) + '</span>' +
      '<span><i class="d-stock"></i>' + tx(m.legend.stock) + '</span></div>' +
      m.groups.map(function (g) {
        return '<span class="chip chip--' + g.tone + ' smap__layer">' + tx(g.layer) + '</span><ul class="smap__rows">' +
          g.rows.map(function (r) {
            var has = r.out || r.work || r.stock;
            return '<li><span class="smap__name">' + tx(r.name) + '</span>' +
              (has ? '<span class="smap__dots" role="img" aria-label="' + esc(label(r)) + '">' + dots(r) + '</span>'
                : chip(m.empty, 'red')) + '</li>';
          }).join('') + '</ul>';
      }).join('') +
      '<p class="smap__more">' + tx(m.more) + '</p>';
  }

  // один день контент-плана: время, пост, площадка, статус и смыслы из карты
  function planWidget(p) {
    return tabsRow(p.tabs, 0) +
      '<div class="splan__week"><b>' + tx(p.week) + '</b><span>' + tx(p.weekLabel) + '</span></div>' +
      '<p class="splan__day">' + tx(p.day) + '</p>' +
      '<ul class="splan__rows">' + p.rows.map(function (r) {
        return '<li class="splan__row is-' + r.tone + '">' +
          '<span class="splan__time">' + (r.time ? tx(r.time) : '—') + '</span>' +
          '<div class="splan__body"><b class="splan__title">' + tx(r.title) + '</b>' +
          '<div class="splan__meta">' + chip(r.channel, r.tone) + chip(r.status, r.statusTone) +
          (r.tags || []).map(function (t) { return chip(t.text, t.tone); }).join('') + '</div>' +
          (r.covers ? '<div class="splan__covers"><span>' + tx(p.coversLabel) + '</span>' +
            r.covers.map(function (c) { return chip(c.text, c.tone, true); }).join('') + '</div>' : '') +
          '</div></li>';
      }).join('') + '</ul>';
  }

  function viewShow(id) {
    var s = D.shows[id];
    var body = s.shots ? shotsHtml(s.shots)
      : '<figure class="shot"><div class="smap">' + (s.map ? mapWidget(s.map) : planWidget(s.plan)) + '</div></figure>';
    var text = [].concat(s.text || []).map(function (p) { return '<p class="case__text">' + tx(p) + '</p>'; }).join('');
    return '<div class="screen screen--show">' + topBar('') +
      '<main class="show"><span class="tag">' + tx(s.label) + '</span>' +
      '<h1 class="show__title" tabindex="-1">' + tx(s.title) + '</h1>' +
      (s.textFirst ? text + body : body + text) + '</main>' +
      foot(D.buttons.next) + '</div>';
  }

  function viewLoading() {
    var T = D.loading;
    var step = Math.floor((C.LOADING_MS - 500) / T.steps.length);
    return '<div class="screen screen--loading"><h1 class="loading__title" tabindex="-1">' + tx(T.title) + '</h1>' +
      '<ul class="loading__list">' + T.steps.map(function (s, i) {
        return '<li style="animation-delay:' + (i * step) + 'ms"><span class="tick">' + CHECK + '</span>' + tx(s) + '</li>';
      }).join('') + '</ul></div>';
  }

  function ctaBlock(cta) {
    return '<section class="cta"><p class="cta__text">' + tx(cta.text) + '</p>' +
      '<button class="btn" type="button" data-act="cta">' + tx(cta.button) + '</button>' +
      '<p class="fine">' + tx(cta.note) + '</p></section>' +
      '<button class="textlink" type="button" data-act="restart">' + tx(D.buttons.restart) + '</button>';
  }

  function viewResult() {
    var r = L.result(state.answers);
    var R = D.result;
    if (r.producer) {
      var P = D.producerResult;
      return '<div class="screen screen--result">' +
        '<h1 class="title" tabindex="-1">' + hl(r.title) + '</h1>' +
        '<section class="sheet"><p class="sheet__lead">' + tx(r.what) + '</p>' +
        (r.quotes.length ? '<h3 class="cap">' + tx(P.answersLabel) + '</h3>' + quotesList(r.quotes) : '') +
        '<h3 class="cap">' + tx(P.todoLabel) + '</h3><p>' + tx(r.todo) + '</p></section>' +
        ctaBlock(r.cta) + '</div>';
    }
    var second = r.secondText.split(':');
    return '<div class="screen screen--result">' +
      '<h1 class="title" tabindex="-1">' + hl(r.title) + '</h1>' +

      '<section class="stage"><div class="stamp"><span class="stamp__label">' + tx(R.stageLabel) + '</span>' +
      '<span class="stamp__name">' + tx(r.stageName) + '</span></div>' +
      '<p class="stage__text">' + tx(r.stageText) + '</p>' +
      '<p class="stage__next">' + tx(r.stageNext) + '</p></section>' +

      '<section class="sheet"><span class="tag tag--wine">' + tx(R.mainLabel) + '</span>' +
      '<h2 class="sheet__title">' + tx(r.mainTitle) + '</h2>' +
      '<h3 class="cap">' + tx(R.whatLabel) + '</h3><p>' + tx(r.what) + '</p>' +
      (r.quotes.length ? '<h3 class="cap">' + tx(R.answersLabel) + '</h3>' + quotesList(r.quotes) : '') +
      '<div class="figure"><p>' + nums(r.figure) + '</p><small>' + tx(r.figureNote) + '</small></div>' +
      '<h3 class="cap">' + tx(R.todoLabel) + '</h3><p>' + tx(r.todo) + '</p></section>' +

      '<section class="second"><p><b>' + tx(second[0]) + ':</b>' + tx(second.slice(1).join(':')) + '</p></section>' +

      '<section class="strong"><h2 class="h2">' + tx(R.strongLabel) + '</h2><ul class="checks">' +
      r.strong.map(function (s) { return '<li><span class="tick">' + CHECK + '</span>' + tx(s) + '</li>'; }).join('') +
      '</ul></section>' +

      '<section class="sheet"><h2 class="sheet__title sheet__title--ink">' + tx(R.mapLabel) + '</h2>' + mapRows(r.map) + '</section>' +

      ctaBlock(r.cta) + '</div>';
  }

  function viewForm() {
    var F = D.form;
    var f = state.form;
    var html = '<div class="screen screen--form"><header class="top top--plain">' +
      '<button class="back" type="button" data-act="back" aria-label="' + esc(D.buttons.back) + '">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></header>' +
      '<h1 class="title title--sm" tabindex="-1">' + tx(F.title) + '</h1><form class="form" novalidate>';
    F.fields.forEach(function (fd) {
      var v = f[fd.id] == null ? '' : f[fd.id];
      var lab = '<span class="form__label">' + tx(fd.label) +
        (fd.required ? '' : ' <em>' + tx(F.optional) + '</em>') + '</span>';
      html += '<div class="form__row" data-row="' + fd.id + '">';
      if (fd.type === 'scale') {
        html += lab + '<div class="scale" role="radiogroup" aria-label="' + esc(fd.label) + '">';
        for (var n = fd.min; n <= fd.max; n++) {
          html += '<button type="button" class="scale__b' + (String(v) === String(n) ? ' is-on' : '') + '" data-scale="' + n +
            '" role="radio" aria-checked="' + (String(v) === String(n)) + '">' + n + '</button>';
        }
        html += '</div><div class="scale__ends"><span>' + tx(fd.minLabel) + '</span><span>' + tx(fd.maxLabel) + '</span></div>';
      } else if (fd.type === 'area') {
        html += '<label>' + lab + '<textarea class="field" rows="3" maxlength="1500" data-form="' + fd.id + '">' + esc(v) + '</textarea></label>';
      } else {
        html += '<label>' + lab + '<input class="field" type="text" maxlength="200" data-form="' + fd.id + '" value="' + esc(v) + '"' +
          ' placeholder="' + esc(fd.placeholder || '') + '" autocapitalize="off" autocomplete="off"></label>';
      }
      html += '<p class="form__err" hidden>' + tx(fd.error || '') + '</p></div>';
    });
    html += '<div class="form__row" data-row="consent"><label class="consent">' +
      '<input type="checkbox" data-form="consent"' + (f.consent ? ' checked' : '') + '>' +
      '<span class="consent__box">' + CHECK + '</span>' +
      '<span>' + tx(F.consent) + '. <a href="' + esc(C.POLICY_URL) + '" target="_blank" rel="noopener">' + tx(F.consentLink) + '</a></span></label>' +
      '<p class="form__err" hidden>' + tx(F.consentError) + '</p></div>' +
      '<button class="btn" type="submit">' + tx(F.button) + '</button></form></div>';
    return html;
  }

  function viewThanks() {
    var T = D.thanks;
    return '<div class="screen screen--thanks"><span class="tick tick--big">' + CHECK + '</span>' +
      '<h1 class="title" tabindex="-1">' + tx(T.title) + '</h1>' +
      '<p class="lead">' + tx(T.text) + '</p>' +
      '<a class="btn" href="' + esc(C.TG_LINK) + '" target="_blank" rel="noopener" data-act="tg">' + tx(T.button) + '</a>' +
      '<button class="textlink" type="button" data-act="restart">' + tx(D.buttons.restart) + '</button></div>';
  }

  /* ---------- Вывод на страницу ---------- */

  function render(keep) {
    var id = state.screen;
    var list = screens();
    if (list.indexOf(id) < 0) { id = state.screen = 'start'; }
    if ((id === 'form' || id === 'thanks') && !state.tracked.result) { id = state.screen = 'start'; }

    var html;
    if (id === 'start') html = viewStart();
    else if (L.Q[id]) html = viewQuestion(L.Q[id]);
    else if (D.insights[id]) html = viewInsight(id);
    else if (D.cases[id]) html = viewCase(id);
    else if (D.shows[id]) html = viewShow(id);
    else if (id === 'loading') html = viewLoading();
    else if (id === 'result') html = viewResult();
    else if (id === 'form') html = viewForm();
    else html = viewThanks();

    root.innerHTML = html;
    root.setAttribute('data-screen', id);
    if (keep === true) root.firstChild.classList.add('is-still');
    else {
      var h = root.querySelector('h1');
      if (h) try { h.focus({ preventScroll: true }); } catch (e) { /* не страшно */ }
    }

    if (id === 'loading') {
      timer = setTimeout(function () { go('result'); }, C.LOADING_MS);
    }
    if (id === 'result' && !state.tracked.result) {
      state.tracked.result = 1;
      save();
      send('result', resultRow());
    }
  }

  // перерисовать тот же экран без анимации и вернуть фокус на вариант
  function redraw(focusSel) {
    render(true);
    if (focusSel) {
      var el = root.querySelector(focusSel);
      if (el) try { el.focus({ preventScroll: true }); } catch (e) { /* не страшно */ }
    }
  }

  /* ---------- Действия ---------- */

  function pick(q, id) {
    var a = state.answers;
    var opts = L.optionsFor(q, a);
    var o = opts.filter(function (x) { return x.id === id; })[0];
    if (!o || busy) return;
    var focus = '[data-opt="' + id + '"]';

    if (q.type === 'one') {
      a[q.id] = id;
      save();
      if (o.input) {
        redraw();
        var inp = root.querySelector('.field--other');
        if (inp) inp.focus();
        return;
      }
      busy = true;
      redraw(focus);
      timer = setTimeout(next, 240);
      return;
    }

    var ids = opts.map(function (x) { return x.id; });
    var sel = asArray(a[q.id]).filter(function (x) { return ids.indexOf(x) >= 0; });
    if (sel.indexOf(id) >= 0) sel = sel.filter(function (x) { return x !== id; });
    else if (o.exclusive) sel = [id];
    else {
      sel = sel.filter(function (x) {
        return !opts.filter(function (y) { return y.id === x; })[0].exclusive;
      });
      if (q.type === 'upto2' && sel.length >= 2) {
        var hint = root.querySelector('[data-hint]');
        if (hint) {
          hint.textContent = typo(D.hints.upto2Limit);
          hint.classList.remove('is-warn');
          void hint.offsetWidth;
          hint.classList.add('is-warn');
        }
        return;
      }
      sel.push(id);
    }
    a[q.id] = sel;
    save();
    redraw(focus);
  }

  function submitForm() {
    var F = D.form;
    var f = state.form;
    var firstBad = null;
    F.fields.forEach(function (fd) {
      var v = String(f[fd.id] == null ? '' : f[fd.id]).trim();
      var bad = fd.required && !v;
      showErr(fd.id, bad);
      if (bad && !firstBad) firstBad = fd.id;
    });
    showErr('consent', !f.consent);
    if (!f.consent && !firstBad) firstBad = 'consent';
    if (firstBad) {
      var rowEl = root.querySelector('[data-row="' + firstBad + '"]');
      if (rowEl) {
        rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        var inp = rowEl.querySelector('input, textarea, button');
        if (inp) try { inp.focus({ preventScroll: true }); } catch (e) { /* не страшно */ }
      }
      return;
    }
    if (busy) return;
    busy = true;
    f.tg = normNick(f.tg);
    save();
    var btn = root.querySelector('.form .btn');
    if (btn) { btn.disabled = true; btn.textContent = F.sending; }

    var row = baseRow();
    row['Ник в Телеграме'] = f.tg;
    row['Ссылка на блог'] = f.blog || '';
    row['Что разобрать'] = f.want || '';
    row['Что пробовал(а)'] = f.tried || '';
    row['Почему сейчас'] = f.why || '';
    row['Готовность'] = Number(f.ready);
    row['Согласие на обработку'] = 'да';
    state.tracked.form = 1;
    save();
    var done = false;
    function finish() { if (!done) { done = true; go('thanks'); } }
    send('form', row, true).then(finish);
    setTimeout(finish, 2500);
  }

  function showErr(id, bad) {
    var rowEl = root.querySelector('[data-row="' + id + '"]');
    if (!rowEl) return;
    rowEl.classList.toggle('is-bad', !!bad);
    var err = rowEl.querySelector('.form__err');
    if (err) err.hidden = !bad;
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act], [data-opt], [data-scale]');
    if (!t || !root.contains(t)) return;

    if (t.hasAttribute('data-opt')) {
      var q = L.Q[state.screen];
      if (q) pick(q, t.getAttribute('data-opt'));
      return;
    }
    if (t.hasAttribute('data-scale')) {
      state.form.ready = t.getAttribute('data-scale');
      save();
      [].forEach.call(root.querySelectorAll('[data-scale]'), function (b) {
        var on = b === t;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on);
      });
      showErr('ready', false);
      return;
    }

    var act = t.getAttribute('data-act');
    if (act === 'start') { track('start'); go(screens()[1]); }
    else if (act === 'back') back();
    else if (act === 'next') {
      if (t.disabled || busy) return;
      var cur = L.Q[state.screen];
      if (cur && cur.type === 'text') state.answers[cur.id] = String(state.answers[cur.id] || '').trim();
      next();
    }
    else if (act === 'cta') { track('cta'); go('form'); }
    else if (act === 'tg') track('tg');
    else if (act === 'restart') restart();
  });

  root.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-text')) {
      var key = t.getAttribute('data-text');
      state.answers[key] = t.value;
      save();
      var q = L.Q[key];
      var btn = root.querySelector('.foot .btn');
      if (q && btn) {
        var empty = !t.value.trim();
        btn.disabled = q.required && empty;
        btn.textContent = typo(!q.required && empty ? D.buttons.skip : D.buttons.next);
      }
    } else if (t.hasAttribute('data-form')) {
      var id = t.getAttribute('data-form');
      state.form[id] = t.type === 'checkbox' ? t.checked : t.value;
      save();
      showErr(id, false);
    }
  });

  root.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target.hasAttribute('data-text')) return;
    e.preventDefault();
    var btn = root.querySelector('.foot .btn');
    if (btn && !btn.disabled) btn.click();
  });

  root.addEventListener('submit', function (e) {
    e.preventDefault();
    submitForm();
  });

  /* ---------- Запуск ---------- */

  // перезагрузка на экране загрузки: сразу результат
  if (state.screen === 'loading') state.screen = 'result';
  track('open');
  render();
})();
