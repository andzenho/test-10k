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
