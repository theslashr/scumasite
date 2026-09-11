/* ============================================================
   admin.js — the editing tool

   Everything Antonio can change, and nothing he cannot. It loads the
   content from the repo, keeps it in memory while he works, and sends back
   one commit when he presses save.

   Two rules shape the whole thing:

   1. He never sees a file, a field name or a piece of markup. The screen
      talks about quadri, mostre and testi.

   2. It refuses what would make the site say something untrue. The
      bomboniere are a closed edition of 126 - the numbers are printed on
      work people already own - so this tool shows them and will not let
      anyone add to or remove from them.
   ============================================================ */
(function () {
  'use strict';

  var TOKEN_KEY = 'burgello.session';
  var state = { files: null, dirty: {}, section: 'opere', token: null, images: [] };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (t, c, h) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (h != null) n.innerHTML = h;
    return n;
  };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  /* ---------------- talking to the server ---------------- */
  function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    headers['content-type'] = 'application/json';
    if (state.token) headers.authorization = 'Bearer ' + state.token;
    return fetch('/api/' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || ('Errore ' + r.status));
        return d;
      });
    });
  }

  function toast(msg, bad) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, bad ? 7000 : 3500);
  }

  /* ---------------- the gate ---------------- */
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#loginBtn'), err = $('#loginErr');
    err.hidden = true;
    btn.disabled = true; btn.textContent = 'Un momento…';
    api('login', { method: 'POST', body: { password: $('#pw').value } })
      .then(function (d) {
        state.token = d.token;
        try { sessionStorage.setItem(TOKEN_KEY, d.token); } catch (e2) {}
        start();
      })
      .catch(function (e2) {
        err.textContent = e2.message;
        err.hidden = false;
        btn.disabled = false; btn.textContent = 'Entra';
        $('#pw').select();
      });
  });

  function start() {
    $('#gate').hidden = true;
    $('#app').hidden = false;
    $('#state').textContent = 'Caricamento…';
    api('load')
      .then(function (d) {
        state.files = d.files;
        buildNav();
        render();
        setDirty(false);
      })
      .catch(function (e) {
        $('#state').textContent = '';
        toast(e.message, true);
        if (/Sessione/.test(e.message)) location.reload();
      });
  }

  // a session from earlier today, so he is not asked twice in an afternoon
  try {
    var saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) { state.token = saved; start(); }
  } catch (e) {}

  /* ---------------- sections ---------------- */
  var SECTIONS = [
    { id: 'hero',       label: 'Prima schermata' },
    { id: 'opere',      label: 'Opere Sparse' },
    { id: 'bomboniere', label: 'Bomboniere' },
    { id: 'gallerie',   label: 'Mostre e gallerie' },
    { id: 'frammenti',  label: 'Frammenti di vita' },
    { id: 'progetti',   label: 'Progetti' },
    { id: 'contatti',   label: 'Contatti' },
    { id: 'sections',   label: 'Titoli delle sezioni' },
  ];

  function buildNav() {
    var side = $('#side');
    side.innerHTML = '';
    SECTIONS.forEach(function (s) {
      var b = el('button', null, s.label);
      b.type = 'button';
      b.setAttribute('aria-current', String(s.id === state.section));
      b.addEventListener('click', function () {
        state.section = s.id;
        buildNav();
        render();
      });
      side.appendChild(b);
    });
  }

  function setDirty(on, what) {
    if (what) state.dirty[what] = true;
    var any = on === false ? false : Object.keys(state.dirty).length > 0;
    if (on === false) state.dirty = {};
    $('#saveBtn').disabled = !any;
    $('#state').textContent = any ? 'Modifiche non salvate' : 'Tutto salvato';
    $('#state').className = 'bar__state' + (any ? ' dirty' : '');
  }

  function render() {
    var main = $('#main');
    main.innerHTML = '';
    ({
      hero: renderHero,
      opere: renderOpere,
      bomboniere: renderBomboniere,
      gallerie: renderGallerie,
      frammenti: renderFrammenti,
      progetti: renderProgetti,
      contatti: renderContatti,
      sections: renderSections,
    })[state.section](main);
  }

  function head(main, title, lead) {
    main.appendChild(el('h2', null, esc(title)));
    main.appendChild(el('p', 'lead', lead));
  }

  function field(label, value, onInput, opts) {
    opts = opts || {};
    var f = el('div', 'field');
    var id = 'f' + Math.random().toString(36).slice(2, 8);
    var l = el('label', null, esc(label));
    l.setAttribute('for', id);
    f.appendChild(l);
    var input = opts.multiline ? el('textarea') : el('input');
    input.id = id;
    input.value = value == null ? '' : value;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.addEventListener('input', function () { onInput(input.value); });
    f.appendChild(input);
    if (opts.hint) f.appendChild(el('p', 'hint', esc(opts.hint)));
    return f;
  }

  function tools(onUp, onDown, onDelete, deleteMsg) {
    var t = el('div', 'item__tools');
    function mk(cls, label, title, fn) {
      var b = el('button', cls, label);
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', fn);
      t.appendChild(b);
    }
    if (onUp) mk('iconbtn', '↑', 'Sposta su', onUp);
    if (onDown) mk('iconbtn', '↓', 'Sposta giù', onDown);
    if (onDelete) {
      mk('iconbtn iconbtn--danger', '✕', 'Elimina', function () {
        if (confirm(deleteMsg || 'Eliminare definitivamente?')) onDelete();
      });
    }
    return t;
  }

  function move(arr, i, d, key) {
    var j = i + d;
    if (j < 0 || j >= arr.length) return;
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    setDirty(true, key);
    render();
  }

  function paraEditor(obj, key, dirtyKey, label) {
    var wrap = el('div', 'field');
    wrap.appendChild(el('label', null, esc(label || 'Testo')));
    var list = el('div', 'paras');
    (obj[key] || []).forEach(function (p, i) {
      var row = el('div', 'para');
      var ta = el('textarea');
      ta.value = p;
      ta.addEventListener('input', function () {
        obj[key][i] = ta.value;
        setDirty(true, dirtyKey);
      });
      row.appendChild(ta);
      var del = el('button', 'iconbtn iconbtn--danger', '✕');
      del.type = 'button';
      del.title = 'Elimina paragrafo';
      del.addEventListener('click', function () {
        if (!confirm('Eliminare questo paragrafo?')) return;
        obj[key].splice(i, 1);
        setDirty(true, dirtyKey);
        render();
      });
      row.appendChild(del);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    var add = el('button', 'addbtn', '+ Aggiungi paragrafo');
    add.type = 'button';
    add.style.marginTop = '.5rem';
    add.addEventListener('click', function () {
      (obj[key] = obj[key] || []).push('');
      setDirty(true, dirtyKey);
      render();
    });
    wrap.appendChild(add);
    return wrap;
  }

  /* ---------------- the first screen ----------------
     The paintings hiding under the primed canvas. The first is the one
     showing when the page opens; the rest arrive as the ground dries back
     and the next stroke uncovers a different picture. Order is what he is
     really editing here, so it leads. */
  function renderHero(main) {
    var list = state.files.hero;
    head(main, 'Prima schermata',
      'I quadri nascosti sotto la tela. Il primo è quello che si vede aprendo il sito; gli altri compaiono man mano che si dipinge sopra.');

    var grid = el('div', 'grid');
    list.forEach(function (im, i) {
      var card = el('div', 'pic');
      var pic = el('img');
      pic.src = '../' + im.src;
      pic.alt = ''; pic.loading = 'lazy';
      card.appendChild(pic);

      var bar = el('div', 'pic__bar');
      bar.appendChild(el('span', 'pic__n', i === 0 ? 'in apertura' : String(i + 1)));
      bar.appendChild(tools(
        i > 0 ? function () { move(list, i, -1, 'hero'); } : null,
        i < list.length - 1 ? function () { move(list, i, 1, 'hero'); } : null,
        // one has to remain, or the first screen has nothing under the canvas
        list.length > 1 ? function () {
          list.splice(i, 1); setDirty(true, 'hero'); render();
        } : null,
        'Togliere questo quadro dalla prima schermata?'
      ));
      card.appendChild(bar);
      grid.appendChild(card);
    });
    main.appendChild(grid);

    main.appendChild(uploader(function (added) {
      added.forEach(function (a) {
        list.push({ src: 'assets/img/' + a.id + '.jpg',
                    width: String(a.fullW), height: String(a.fullH) });
      });
      setDirty(true, 'hero');
      render();
    }));
  }

  /* ---------------- the cover that cycles on the card ----------------
     Shared by both collections, because the card is the same object in
     each: a handful of paintings that lay themselves over one another. */
  function coverEditor(main, key) {
    var coll = state.files['collections/' + key];
    coll.cycle = coll.cycle || [];
    var dirty = 'collections/' + key;
    var bomb = key === 'bomboniere';

    main.appendChild(el('h3', null, 'Copertina della card'));
    main.appendChild(el('p', 'lead',
      'I quadri che si dipingono uno sull’altro sulla card in homepage. Il primo è quello che si vede appena la pagina si apre.'));

    var grid = el('div', 'grid');
    coll.cycle.forEach(function (src, i) {
      var card = el('div', 'pic');
      var im = el('img');
      im.src = '../' + src;
      im.alt = ''; im.loading = 'lazy';
      card.appendChild(im);
      var bar = el('div', 'pic__bar');
      bar.appendChild(el('span', 'pic__n', i === 0 ? 'in apertura' : String(i + 1)));
      bar.appendChild(tools(
        i > 0 ? function () { move(coll.cycle, i, -1, dirty); } : null,
        i < coll.cycle.length - 1 ? function () { move(coll.cycle, i, 1, dirty); } : null,
        // one has to stay: an empty cycle leaves the card with no picture
        coll.cycle.length > 1 ? function () {
          coll.cycle.splice(i, 1); setDirty(true, dirty); render();
        } : null,
        'Togliere questo quadro dalla copertina?'
      ));
      card.appendChild(bar);
      grid.appendChild(card);
    });
    main.appendChild(grid);

    main.appendChild(uploader(function (added) {
      added.forEach(function (a) { coll.cycle.push(a.card); });
      setDirty(true, dirty);
      render();
    }, {
      card: true,
      label: '+ Aggiungi un quadro alla copertina',
      hint: 'Ritagliato automaticamente nella forma della card, quindi scegli quadri che reggono un taglio largo. ' +
            (bomb ? 'Le bomboniere sono quasi tutte verticali: sulla card se ne vede una fascia centrale.' : '')
    }));
  }

  /* ---------------- opere ---------------- */
  function renderOpere(main) {
    var coll = state.files['collections/opere'];
    head(main, 'Opere Sparse',
      'I quadri della selezione. Puoi aggiungerne, toglierne e cambiarne l’ordine quando vuoi: non sono numerati, quindi nulla di quello che il sito dichiara dipende da quanti sono.');

    var grid = el('div', 'grid');
    coll.items.forEach(function (it, i) {
      var card = el('div', 'pic');
      var img = el('img');
      img.src = '../assets/img/sm/' + it.id + '.jpg';
      img.alt = '';
      img.loading = 'lazy';
      card.appendChild(img);

      var bar = el('div', 'pic__bar');
      bar.appendChild(el('span', 'pic__n', String(i + 1)));
      bar.appendChild(tools(
        i > 0 ? function () { move(coll.items, i, -1, 'collections/opere'); } : null,
        i < coll.items.length - 1 ? function () { move(coll.items, i, 1, 'collections/opere'); } : null,
        function () {
          coll.items.splice(i, 1);
          setDirty(true, 'collections/opere');
          render();
        },
        'Togliere questo quadro dal sito?\n\nLa foto resta nel sito, ma il quadro non sarà più mostrato.'
      ));
      card.appendChild(bar);

      var alt = el('input', 'pic__alt');
      alt.value = it.alt || '';
      alt.placeholder = 'Descrizione della foto';
      alt.title = 'Serve a chi non può vedere l’immagine, e a Google.';
      alt.addEventListener('input', function () {
        it.alt = alt.value;
        setDirty(true, 'collections/opere');
      });
      card.appendChild(alt);
      grid.appendChild(card);
    });
    main.appendChild(grid);

    main.appendChild(uploader(function (added) {
      added.forEach(function (a) {
        coll.items.push({ id: a.id, w: a.thumbW, h: a.thumbH, alt: '' });
      });
      setDirty(true, 'collections/opere');
      render();
    }));

    coverEditor(main, 'opere');
  }

  /* ---------------- bomboniere: shown, not edited ---------------- */
  function renderBomboniere(main) {
    var coll = state.files['collections/bomboniere'];
    head(main, 'Bomboniere', 'Le 126 bomboniere, numerate una per una.');

    var n = el('div', 'notice');
    n.appendChild(el('h3', null, 'Serie chiusa'));
    n.appendChild(el('p', null,
      'Ogni bomboniera è numerata <strong>NN / 126</strong> ed è dichiarata pezzo unico. ' +
      'Il numero non è una didascalia: è una promessa fatta a chi ha ricevuto quel quadro.'));
    n.appendChild(el('p', null,
      'Per questo da qui non si aggiunge e non si toglie nulla. Se un giorno vorrai ampliare la serie, ' +
      'va deciso insieme: o si rinumera tutto, oppure diventa una seconda serie a parte. ' +
      'Le descrizioni qui sotto invece puoi cambiarle liberamente.'));
    main.appendChild(n);

    var grid = el('div', 'grid');
    coll.items.forEach(function (it, i) {
      var card = el('div', 'pic');
      var img = el('img');
      img.src = '../assets/img/bomb/thumb/' + it.id + '.jpg';
      img.alt = ''; img.loading = 'lazy';
      card.appendChild(img);
      var bar = el('div', 'pic__bar');
      bar.appendChild(el('span', 'pic__n',
        (i + 1 < 10 ? '0' : '') + (i + 1) + ' / 126'));
      card.appendChild(bar);
      var alt = el('input', 'pic__alt');
      alt.value = it.alt || '';
      alt.placeholder = 'Descrizione della foto';
      alt.addEventListener('input', function () {
        it.alt = alt.value;
        setDirty(true, 'collections/bomboniere');
      });
      card.appendChild(alt);
      grid.appendChild(card);
    });
    main.appendChild(grid);

    coverEditor(main, 'bomboniere');
  }

  /* ---------------- gallerie ---------------- */
  function renderGallerie(main) {
    var g = state.files.gallerie;
    head(main, 'Mostre e gallerie',
      'Le mostre, e le pagine dove sei presente. La prima voce è quella che compare più in alto sul sito.');

    g.items.forEach(function (it, i) {
      var box = el('div', 'item');
      var h = el('div', 'item__head');
      h.appendChild(el('span', 'item__n', String(i + 1)));
      h.appendChild(el('span', 'item__title', esc(it.title || 'Senza titolo')));
      h.appendChild(tools(
        i > 0 ? function () { move(g.items, i, -1, 'gallerie'); } : null,
        i < g.items.length - 1 ? function () { move(g.items, i, 1, 'gallerie'); } : null,
        function () { g.items.splice(i, 1); setDirty(true, 'gallerie'); render(); },
        'Eliminare "' + (it.title || '') + '" dal sito?'
      ));
      box.appendChild(h);

      var r = el('div', 'row2');
      r.appendChild(field('Quando', it.when, function (v) { it.when = v; setDirty(true, 'gallerie'); },
        { placeholder: 'Dal 24 ottobre al 22 novembre 2025' }));
      r.appendChild(field('Titolo', it.title, function (v) { it.title = v; setDirty(true, 'gallerie'); render(); }));
      box.appendChild(r);

      if (it.href !== undefined) {
        box.appendChild(field('Collegamento', it.href, function (v) { it.href = v; setDirty(true, 'gallerie'); },
          { hint: 'Si apre in una nuova scheda.' }));
      } else {
        box.appendChild(field('Dove', it.where, function (v) { it.where = v; setDirty(true, 'gallerie'); },
          { placeholder: 'Spazio Brizzolari · Viale Kennedy 188, Firenze' }));
      }
      box.appendChild(paraEditor(it, 'paras', 'gallerie', 'Descrizione'));
      main.appendChild(box);
    });

    var add = el('button', 'addbtn', '+ Aggiungi una mostra');
    add.type = 'button';
    add.addEventListener('click', function () {
      g.items.push({ when: '', title: 'Nuova mostra', where: '', paras: [''] });
      setDirty(true, 'gallerie');
      render();
    });
    main.appendChild(add);
  }

  /* ---------------- frammenti ---------------- */
  function renderFrammenti(main) {
    var list = state.files.frammenti;
    head(main, 'Frammenti di vita',
      'Il racconto, dall’alto verso il basso come appare sul sito. Sono parole tue: cambiale quando vuoi.');

    list.forEach(function (e, i) {
      var box = el('div', 'item');
      var h = el('div', 'item__head');
      h.appendChild(el('span', 'item__n', String(i + 1)));
      h.appendChild(el('span', 'item__title', esc(e.title || 'Senza titolo')));
      h.appendChild(tools(
        i > 0 ? function () { move(list, i, -1, 'frammenti'); } : null,
        i < list.length - 1 ? function () { move(list, i, 1, 'frammenti'); } : null,
        function () { list.splice(i, 1); setDirty(true, 'frammenti'); render(); },
        'Eliminare "' + (e.title || '') + '"?\n\nIl testo andrà perso.'
      ));
      box.appendChild(h);

      var r = el('div', 'row2');
      r.appendChild(field('Quando', e.year, function (v) { e.year = v; setDirty(true, 'frammenti'); },
        { placeholder: 'Maggio 2018 · Londra' }));
      r.appendChild(field('Titolo', e.title, function (v) { e.title = v; setDirty(true, 'frammenti'); render(); }));
      box.appendChild(r);

      if (e.lede !== undefined) {
        box.appendChild(field('Frase di apertura', e.lede,
          function (v) { e.lede = v; setDirty(true, 'frammenti'); }, { multiline: true }));
      }
      box.appendChild(paraEditor(e, 'paras', 'frammenti', 'Racconto'));
      if (e.image) {
        box.appendChild(field('Descrizione della foto', e.image.alt || '',
          function (v) { e.image.alt = v; setDirty(true, 'frammenti'); },
          { hint: 'Per chi non può vederla. Non compare sulla pagina.' }));
        box.appendChild(photoSwap(e, 'frammenti'));
      }
      box.appendChild(field('Didascalia della foto', e.meta || '',
        function (v) { e.meta = v; setDirty(true, 'frammenti'); },
        { placeholder: 'Scatto di…', hint: 'Compare sotto il racconto. Lascia vuoto se non serve.' }));
      main.appendChild(box);
    });
  }

  /* ---------------- progetti ---------------- */
  function renderProgetti(main) {
    var list = state.files.progetti;
    head(main, 'Progetti', 'Le quattro schede nella sezione Progetti.');
    list.forEach(function (c, i) {
      var box = el('div', 'item');
      var h = el('div', 'item__head');
      h.appendChild(el('span', 'item__n', String(i + 1)));
      h.appendChild(el('span', 'item__title', esc(c.title || '')));
      h.appendChild(tools(
        i > 0 ? function () { move(list, i, -1, 'progetti'); } : null,
        i < list.length - 1 ? function () { move(list, i, 1, 'progetti'); } : null,
        null
      ));
      box.appendChild(h);
      var r = el('div', 'row2');
      r.appendChild(field('Etichetta', c.tag, function (v) { c.tag = v; setDirty(true, 'progetti'); },
        { placeholder: 'Su commissione' }));
      r.appendChild(field('Titolo', c.title, function (v) { c.title = v; setDirty(true, 'progetti'); render(); }));
      box.appendChild(r);
      box.appendChild(paraEditor(c, 'paras', 'progetti', 'Descrizione'));
      if (c.image) {
        box.appendChild(field('Descrizione della foto', c.image.alt || '',
          function (v) { c.image.alt = v; setDirty(true, 'progetti'); },
          { hint: 'Per chi non può vederla. Non compare sulla pagina.' }));
        box.appendChild(photoSwap(c, 'progetti'));
      }
      main.appendChild(box);
    });
  }

  /* ---------------- contatti ---------------- */
  function renderContatti(main) {
    var cols = state.files.contatti;
    head(main, 'Contatti', 'Come ti si raggiunge. Comparirà in fondo a ogni pagina.');
    cols.forEach(function (col, ci) {
      var box = el('div', 'item');
      var h = el('div', 'item__head');
      h.appendChild(el('span', 'item__title', esc(col.label || '')));
      box.appendChild(h);
      box.appendChild(field('Titolo della colonna', col.label,
        function (v) { col.label = v; setDirty(true, 'contatti'); render(); }));
      col.blocks.forEach(function (b, bi) {
        if (b.type === 'link') {
          var r = el('div', 'row2');
          r.appendChild(field('Testo', b.text, function (v) { b.text = v; setDirty(true, 'contatti'); }));
          r.appendChild(field('Indirizzo', b.href, function (v) { b.href = v; setDirty(true, 'contatti'); },
            { hint: 'Email: mailto:… · Telefono: tel:…' }));
          box.appendChild(r);
        } else {
          box.appendChild(field(b.type === 'addr' ? 'Indirizzo' : 'Nota', b.html,
            function (v) { b.html = v; setDirty(true, 'contatti'); }, { multiline: true }));
        }
      });
      main.appendChild(box);
    });
  }

  /* ---------------- section headings ---------------- */
  function renderSections(main) {
    var s = state.files.sections;
    head(main, 'Titoli delle sezioni', 'Le intestazioni che aprono ogni parte del sito.');
    var NAMES = { opere: 'Opere', frammenti: 'Frammenti di vita', progetti: 'Progetti', gallerie: 'Gallerie' };
    Object.keys(s).forEach(function (k) {
      var h = s[k];
      var box = el('div', 'item');
      var hd = el('div', 'item__head');
      hd.appendChild(el('span', 'item__title', esc(NAMES[k] || k)));
      box.appendChild(hd);
      var r = el('div', 'row2');
      r.appendChild(field('Sopratitolo', h.kicker, function (v) { h.kicker = v; setDirty(true, 'sections'); }));
      r.appendChild(field('Titolo', h.title, function (v) { h.title = v; setDirty(true, 'sections'); }));
      box.appendChild(r);
      // always offered, not only where one exists already: an empty one is
      // simply not printed, so he can add a subtitle to a section that has
      // never had one
      box.appendChild(field('Sottotitolo', h.sub || '',
        function (v) { h.sub = v; setDirty(true, 'sections'); },
        { multiline: true, hint: 'Lascia vuoto per non mostrarlo.' }));
      main.appendChild(box);
    });
  }

  /* ---------------- adding paintings ----------------
     The browser does the resizing. The viewer needs a full-size picture to
     recover the relief from and the grid needs a small one, and there is no
     image tool on anyone's machine here - but a canvas can produce both from
     whatever comes off his phone, which also keeps a 6MB photo from being
     committed as-is. */
  var FULL_MAX = 1600, THUMB_W = 550;
  /* The card's own shape. Its canvas reaches 911px, so 1000 wide is enough,
     and anything outside the 16:11 crop is pixels the card never draws. */
  var CARD_W = 1000, CARD_H = Math.round(1000 * 11 / 16);

  function uploader(onDone, opts) {
    opts = opts || {};
    var wrap = el('div', 'field');
    var label = el('label', 'addbtn');
    var idle = opts.label || '+ Aggiungi quadri (puoi sceglierne più di uno)';
    label.textContent = idle;
    label.style.display = 'block';
    label.style.textAlign = 'center';
    var input = el('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    label.appendChild(input);
    wrap.appendChild(label);
    wrap.appendChild(el('p', 'hint', opts.hint ||
      'Foto alla luce del giorno, quadro dritto e senza flash. Il file originale, non quello passato da WhatsApp: la compressione cancella proprio la trama che fa funzionare la luce.'));

    input.addEventListener('change', function () {
      var files = [].slice.call(input.files || []);
      if (!files.length) return;
      label.textContent = 'Preparo le immagini…';
      var done = [], i = 0;
      (function next() {
        if (i >= files.length) {
          label.textContent = idle;
          label.appendChild(input);
          input.value = '';
          if (done.length) {
            toast(done.length + (done.length === 1 ? ' quadro pronto' : ' quadri pronti') +
                  '. Premi "Salva e pubblica" per metterli online.');
            onDone(done);
          }
          return;
        }
        prepare(files[i++], function (res) {
          if (res) done.push(res);
          next();
        }, opts);
      })();
    });
    return wrap;
  }

  /* Replace the photograph on an entry that already has one. The srcset is
     rebuilt here rather than left alone: it names both files by width, and a
     stale one would hand the browser the old picture at some screen sizes
     and the new one at others. */
  function photoSwap(entry, dirtyKey) {
    var wrap = el('div', 'field');
    wrap.appendChild(el('label', null, 'Foto'));
    var row = el('div', 'para');
    var prev = el('img');
    prev.src = '../' + entry.image.src;
    prev.alt = '';
    prev.style.cssText = 'width:5.5rem;height:5.5rem;object-fit:cover;border-radius:3px;border:1px solid var(--line-soft)';
    row.appendChild(prev);
    var label = el('label', 'addbtn');
    label.textContent = 'Cambia foto';
    label.style.alignSelf = 'center';
    var input = el('input');
    input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    label.appendChild(input);
    input.addEventListener('change', function () {
      var f = (input.files || [])[0];
      if (!f) return;
      label.textContent = 'Preparo…';
      prepare(f, function (res) {
        label.textContent = 'Cambia foto';
        input.value = '';
        if (!res) return;
        entry.image.src = 'assets/img/' + res.id + '.jpg';
        entry.image.width = String(res.fullW);
        entry.image.height = String(res.fullH);
        entry.image.srcset = 'assets/img/sm/' + res.id + '.jpg 550w, ' +
                             'assets/img/' + res.id + '.jpg ' + res.fullW + 'w';
        entry.image.sizes = '(max-width:860px) 100vw, 50vw';
        setDirty(true, dirtyKey);
        render();
      });
    });
    row.appendChild(label);
    wrap.appendChild(row);
    return wrap;
  }

  function prepare(file, cb, opts) {
    opts = opts || {};
    if (!/^image\//.test(file.type)) {
      toast('"' + file.name + '" non è un’immagine.', true);
      return cb(null);
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      if (img.naturalWidth < 1200) {
        toast('"' + file.name + '" è troppo piccola (' + img.naturalWidth +
              ' px). Serve almeno 1200 px sul lato lungo, altrimenti la luce sul quadro non funziona.', true);
        return cb(null);
      }
      var id = newId();
      if (opts.card) {
        // one file, cut to the card and nothing else
        var cardImg = crop(img, CARD_W, CARD_H);
        state.images.push({ path: 'assets/img/card/' + id + '.jpg', base64: cardImg.b64 });
        setDirty(true, 'images');
        cb({ id: id, card: 'assets/img/card/' + id + '.jpg' });
        return;
      }
      var full = draw(img, Math.min(img.naturalWidth, FULL_MAX));
      var thumb = draw(img, Math.min(img.naturalWidth, THUMB_W));
      state.images.push({ path: 'assets/img/' + id + '.jpg', base64: full.b64 });
      state.images.push({ path: 'assets/img/sm/' + id + '.jpg', base64: thumb.b64 });
      setDirty(true, 'images');
      cb({ id: id, thumbW: thumb.w, thumbH: thumb.h, fullW: full.w, fullH: full.h });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      toast('Non riesco ad aprire "' + file.name + '".', true);
      cb(null);
    };
    img.src = url;
  }

  /* Fill the box and crop the overflow, exactly as the card itself does, so
     what gets stored is what gets drawn and no pixel is sent unused. */
  function crop(img, w, h) {
    var c = $('#scratch');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    var dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    var data = c.toDataURL('image/jpeg', 0.82);
    return { w: w, h: h, b64: data.slice(data.indexOf(',') + 1) };
  }

  function draw(img, w) {
    var h = Math.round(img.naturalHeight * (w / img.naturalWidth));
    var c = $('#scratch');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    var data = c.toDataURL('image/jpeg', 0.86);
    return { w: w, h: h, b64: data.slice(data.indexOf(',') + 1) };
  }

  /* An id that cannot collide with the ones already there. The existing
     files are img01..img54 and logo; a dated name keeps new ones obviously
     new and sorts them by when they arrived. */
  function newId() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'q' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
           p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
           Math.floor(Math.random() * 90 + 10);
  }

  /* ---------------- saving ---------------- */
  var PATHS = {
    hero: 'content/hero.json',
    frammenti: 'content/frammenti.json',
    progetti: 'content/progetti.json',
    gallerie: 'content/gallerie.json',
    contatti: 'content/contatti.json',
    sections: 'content/sections.json',
    'collections/opere': 'content/collections/opere.json',
    'collections/bomboniere': 'content/collections/bomboniere.json',
  };

  $('#saveBtn').addEventListener('click', function () {
    var btn = $('#saveBtn');
    var files = [];
    Object.keys(state.dirty).forEach(function (k) {
      if (k === 'images') return;
      files.push({ path: PATHS[k], text: JSON.stringify(state.files[k], null, 2) + '\n' });
    });
    state.images.forEach(function (im) { files.push(im); });
    if (!files.length) return;

    btn.disabled = true;
    $('#app').classList.add('busy');
    $('#state').textContent = 'Pubblico…';

    api('save', { method: 'POST', body: { files: files, message: 'Modifiche dal pannello' } })
      .then(function () {
        state.images = [];
        setDirty(false);
        $('#app').classList.remove('busy');
        toast('Pubblicato. Il sito si aggiorna da solo entro un paio di minuti.');
      })
      .catch(function (e) {
        $('#app').classList.remove('busy');
        btn.disabled = false;
        $('#state').textContent = 'Modifiche non salvate';
        toast('Non sono riuscito a pubblicare: ' + e.message +
              ' Le tue modifiche sono ancora qui, riprova fra poco.', true);
      });
  });

  // the browser's own guard, for the tab closed mid-edit
  window.addEventListener('beforeunload', function (e) {
    if (Object.keys(state.dirty).length) { e.preventDefault(); e.returnValue = ''; }
  });
})();
