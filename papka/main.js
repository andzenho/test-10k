/* ПАПКА: неразрывные пробелы и плавное появление блоков. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  // Короткие слова не висят в конце строки: после предлогов и союзов ставим неразрывный пробел
  var NBSP = String.fromCharCode(160);
  var WJ = String.fromCharCode(8288);
  var SHORT = /(^|[\s(«„])(в|во|к|ко|с|со|о|об|у|и|а|но|на|по|за|из|от|до|не|ни|для|при|под|над|без|про|или|я) (?=\S)/gi;
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var node;
  while ((node = walker.nextNode())) {
    var t = node.nodeValue;
    if (!/\s/.test(t) || /^(SCRIPT|STYLE)$/.test(node.parentNode.nodeName)) continue;
    var fixed = t.replace(SHORT, '$1$2' + NBSP).replace(SHORT, '$1$2' + NBSP)
      // число не отрывается от слова или знака после него: «5 человек», «70 охватах», «14 990 ₽»
      .replace(/(\d) (?=[А-Яа-яЁёA-Za-z₽%$])/g, '$1' + NBSP)
      // тире не начинает строку
      .replace(/ —/g, NBSP + '—')
      // диапазон «2025–2026» не рвётся на две строки
      .replace(/(\d)–(\d)/g, '$1' + WJ + '–' + WJ + '$2');
    if (fixed !== t) node.nodeValue = fixed;
  }

  // Блоки появляются, когда до них докрутили
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach(function (el) { io.observe(el); });
})();

/* Плашка с отсчётом до конца бонуса: появляется, когда долистали до цен, дальше висит до срока */
(function () {
  'use strict';
  var bar = document.getElementById('deal');
  if (!bar) return;
  var until = Date.parse(bar.getAttribute('data-until'));
  if (!(until > Date.now())) { bar.parentNode.removeChild(bar); return; }
  var cells = {};
  ['d', 'h', 'm', 's'].forEach(function (k) { cells[k] = bar.querySelector('[data-t="' + k + '"]'); });
  var timer = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var left = Math.floor((until - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(timer);
      bar.parentNode.removeChild(bar);
      document.body.classList.remove('has-deal');
      return;
    }
    cells.d.textContent = pad(Math.floor(left / 86400));
    cells.h.textContent = pad(Math.floor(left % 86400 / 3600));
    cells.m.textContent = pad(Math.floor(left % 3600 / 60));
    cells.s.textContent = pad(left % 60);
  }
  function show() {
    if (!bar.hidden) return;
    tick();
    bar.hidden = false;
    document.body.classList.add('has-deal');
    timer = setInterval(tick, 1000);
  }

  var prices = document.getElementById('dostup');
  if (!prices || !('IntersectionObserver' in window)) { show(); return; }
  var io = new IntersectionObserver(function (entries) {
    if (entries.some(function (e) { return e.isIntersecting; })) { show(); io.disconnect(); }
  }, { rootMargin: '0px 0px -35% 0px' });
  io.observe(prices);
})();
