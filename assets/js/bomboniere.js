/* ============================================================
   bomboniere.js — the 126 small oils, and the collection they make

   Data and one instantiation. The component is in collection.js; this
   file knows only what these paintings are called and how big their
   thumbnails are.
   ============================================================ */
(function () {
  'use strict';

  var mount = document.getElementById('bomboniere');
  if (!mount || !window.Collection || !window.Relief) return;

  var TOTAL = 126;

  /* Thumbnail heights at a common width, so the sheet reserves the right
     box before an image arrives. Without them a lazily loaded thumbnail
     has no intrinsic size at layout time, the columns size to nothing, and
     the pictures overflow buttons that clip them: 126 paintings sliced
     into ribbons. */
  var TW = 220;
  var TH = [
    144,332,146,327,333,336,329,334,337,330,326,327,332,145,
    321,143,327,335,339,145,333,338,329,332,330,331,332,331,
    334,328,334,147,331,148,154,331,149,335,332,337,338,332,
    332,328,332,328,145,327,336,346,341,348,344,341,332,327,
    340,335,331,329,332,320,324,338,332,333,332,336,343,332,
    327,335,336,342,333,142,344,329,340,336,338,332,336,339,
    336,330,336,332,344,339,327,333,145,332,145,331,332,326,
    147,333,324,327,331,332,334,338,144,336,331,146,148,330,
    329,145,144,331,339,144,325,335,334,335,330,341,336,331
  ];

  /* Files are named by their place in the set, n001..n126, from sorting
     the export by batch and then by number within it. The file name is the
     edition number, so there is no table to keep in step.

     The numbers are deliberately not the ones in the original file names.
     Telegram exported the set in two batches and restarted counting in
     each, so of 126 files there were only 95 distinct numbers, 31 of them
     used twice, and the highest was 97 — nothing would ever have been
     numbered 98 to 126. Calling a piece "11 / 126" on that basis would be
     a false claim about a unique work. */
  var items = [];
  for (var k = 1; k <= TOTAL; k++) {
    var id = 'n' + (k < 10 ? '00' : k < 100 ? '0' : '') + k;
    items.push({ id: id, w: TW, h: TH[k - 1] });
  }

  new window.Collection({
    mount: mount,
    items: items,
    thumb: function (id) { return 'assets/img/bomb/thumb/' + id + '.jpg'; },
    full:  function (id) { return 'assets/img/bomb/full/'  + id + '.jpg'; },
    itemLabel: 'Bomboniera ',
    chooseLabel: 'Scegli una bomboniera',
    hint: 'Muovi il puntatore sul quadro',
    touchHint: 'Trascina il dito sul quadro',
    uniqLabel: 'pezzo unico',
    allLabel: 'Vedi tutte le ',
    sheetTitle: 'Bomboniere · 126 pezzi unici'
  });
})();
