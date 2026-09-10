/* ============================================================
   collection.js — a collection of paintings you can look through

     new Collection({ mount: el, items: [...], thumb: fn, full: fn })

   Three layers, and you only ever pay for the one you are looking at:

     a card in the page  ->  the grid, every piece  ->  one painting, lit

   The card is an image and a count. Opening it builds the grid; picking
   from the grid builds the viewer, which is where WebGL and the relief
   extraction finally happen. A visitor who never opens a collection pays
   nothing for it beyond one cover image, which matters when one of these
   holds 126 paintings.

   `items` is [{ id, w, h }] — the id is what the file is named and what
   the cache is keyed on, w and h are the thumbnail's real pixels so the
   grid can reserve the right box before anything loads.

   relief.js does the lighting; this does the choosing.
   ============================================================ */
(function (root) {
  'use strict';

  /* Seventeen cards on the ellipse, and the painting each one shows is
     reassigned as the ring turns. 126 paintings therefore cost 17 elements
     and the arc scrolls forever in either direction. */
  var SLOTS = 17, MID = 8;
  var CARD_W = 96, CARD_H = 132, MIN_SCALE = 0.34;

  /* How far the hand reaches, and how far a wave does. The waves are
     tighter on purpose: at 620 they covered most of the screen at once, so
     everything brightened together and nothing appeared to move. */
  var CURSOR_R = 620, WAVE_R = 360;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function Collection(opts) {
    if (!(this instanceof Collection)) return new Collection(opts);
    this.o = opts;
    this.items = opts.items;
    this.total = opts.items.length;
    this.mount = opts.mount;
    this.current = -1;
    this.started = false;

    /* On a page of its own there is no card: the grid is what you land on,
       because the page *is* the collection. Closing it goes back to where
       the visitor came from rather than hiding an overlay. */
    if (opts.page) this.openSheet();
    else this._buildCard();
  }

  /* ---------------- the card in the page ---------------- */
  Collection.prototype._buildCard = function () {
    var o = this.o, self = this;
    var cover = o.cover || this.items[Math.floor(this.items.length / 2)].id;

    var card = el('button', 'coll-card');
    card.type = 'button';
    card.setAttribute('aria-label', 'Apri: ' + (o.title || '') + ', ' + this.total + ' opere');
    card.innerHTML =
      '<span class="coll-card__media">' +
        '<img src="' + esc(o.thumb(cover)) + '" alt="" loading="lazy" decoding="async">' +
      '</span>' +
      '<span class="coll-card__body">' +
        '<span class="coll-card__count">' + this.total + ' opere</span>' +
        '<span class="coll-card__title">' + esc(o.title || '') + '</span>' +
        '<span class="coll-card__sub">' + esc(o.blurb || '') + '</span>' +
      '</span>';

    card.addEventListener('click', function () { self.openSheet(); });
    this.card = card;
    this.mount.appendChild(card);
  };

  Collection.prototype._fail = function (msg) {
    if (!this.errEl) {
      this.errEl = el('p', 'coll__err');
      this.errEl.style.cssText = 'text-align:center;color:#b9403a;font-size:.8rem';
      (this.view || this.mount).appendChild(this.errEl);
    }
    this.errEl.textContent = msg;
  };

  /* ---------------- the grid, every piece ----------------
     126 thumbnails is a lot to put in the document for a collection that
     may never be opened, so it is built the first time it is asked for. */
  Collection.prototype._buildSheet = function () {
    if (this.sheet) return;
    var self = this;
    this.sheet = el('div', 'coll-sheet');
    this.sheet.hidden = true;

    var head = el('div', 'coll-sheet__head');
    head.appendChild(el('h4', null, esc(this.o.sheetTitle || this.o.title || '')));
    var close = el('button', null, '&times;');
    close.type = 'button';
    close.setAttribute('aria-label', 'Chiudi');
    close.addEventListener('click', function () { self.closeSheet(); });
    head.appendChild(close);

    var scroll = el('div', 'coll-sheet__scroll');
    this.sheetGrid = el('div', 'coll-sheet__grid');

    var html = '';
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i], n = i + 1;
      html += '<button type="button" data-i="' + i + '" aria-current="false"' +
              ' aria-label="' + esc(it.alt || ((this.o.itemLabel || 'Quadro ') + n)) + '">' +
              '<img src="' + esc(this.o.thumb(it.id)) + '" alt="' + esc(it.alt || '') +
              '" loading="lazy" decoding="async"' +
              ' width="' + it.w + '" height="' + it.h + '">' +
              '<b>' + (n < 10 ? '0' + n : n) + '</b></button>';
    }
    this.sheetGrid.innerHTML = html;
    this.sheetGrid.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      self.openViewer(parseInt(b.dataset.i, 10));
    });

    scroll.appendChild(this.sheetGrid);
    this.sheet.appendChild(head);
    this.sheet.appendChild(scroll);
    document.body.appendChild(this.sheet);
    this.sheetScroll = scroll;
    this.sheetBtns = this.sheetGrid.querySelectorAll('button');

    this.sheet.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') self.closeSheet();
    });
  };

  Collection.prototype._markSheet = function (i) {
    if (!this.sheetBtns) return;
    for (var j = 0; j < this.sheetBtns.length; j++) {
      this.sheetBtns[j].setAttribute('aria-current', String(i === j));
    }
  };

  Collection.prototype.openSheet = function () {
    this._buildSheet();
    var self = this;
    if (!this.viewOpen) this._lastFocus = document.activeElement;
    this.sheet.hidden = false;
    this._markSheet(this.current);
    /* Reflow, then the class - not rAF. A frame callback is the usual way
       to let a transition see the starting value, but it only arrives when
       the page is being painted, and anything that throttles rendering
       (a background tab, a preview pane) leaves the panel mounted and
       never faded in. Reading offsetHeight forces the style to settle
       synchronously, which is all the transition actually needs. */
    void self.sheet.offsetHeight;
    this.sheet.classList.add('in');
    document.documentElement.style.overflow = 'hidden';
    this._measure();
    this._startLit();
    this.sheet.tabIndex = -1;
    this.sheet.focus();
    var cur = this.sheetBtns && this.sheetBtns[this.current];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
  };

  Collection.prototype.closeSheet = function (keepScroll) {
    if (!this.sheet || this.sheet.hidden) return;
    var self = this;
    if (this.o.page && !keepScroll) {
      // nothing behind it to go back to on this page
      if (this.o.backHref) location.href = this.o.backHref;
      return;
    }
    this.sheet.classList.remove('in');
    if (!keepScroll) document.documentElement.style.overflow = '';
    this._stopLit();
    setTimeout(function () { self.sheet.hidden = true; }, 300);
    if (!keepScroll && this._lastFocus && this._lastFocus.focus) this._lastFocus.focus();
  };

  /* ---------------- one painting, lit ----------------
     The viewer is an overlay, not a band in the page. It is the only place
     WebGL is created and the only place the relief extraction runs, and it
     is built the first time a painting is picked. */
  Collection.prototype._buildViewer = function () {
    if (this.view) return;
    var o = this.o, self = this;

    this.view = el('div', 'coll coll-view');
    this.view.hidden = true;

    var head = el('div', 'coll-view__head');
    this.backBtn = el('button', 'coll-view__back', '&larr; <span>Tutte le opere</span>');
    this.backBtn.type = 'button';
    this.backBtn.addEventListener('click', function () { self.backToSheet(); });
    var title = el('span', 'coll-view__title', esc(o.title || ''));
    var close = el('button', 'coll-view__close', '&times;');
    close.type = 'button';
    close.setAttribute('aria-label', 'Chiudi');
    close.addEventListener('click', function () { self.closeViewer(); });
    head.appendChild(this.backBtn);
    head.appendChild(title);
    head.appendChild(close);

    var viewer = el('div', 'viewer');
    this.reel = el('div', 'reel');
    this.reel.tabIndex = 0;
    this.reel.setAttribute('role', 'listbox');
    this.reel.setAttribute('aria-label', o.chooseLabel || 'Scegli un quadro');

    var show = el('div', 'show');
    this.stage = el('div', 'stage');
    this.plate = el('div', 'plate');
    this.cv = el('canvas');
    this.sub = el('p', 'sub', esc(o.hint || 'Muovi il puntatore sul quadro'));
    this.plate.appendChild(this.cv);
    this.plate.appendChild(this.sub);
    this.stage.appendChild(this.plate);

    this.edition = el('div', 'edition');
    this.edition.setAttribute('aria-live', 'polite');
    this.edNum = el('span', 'n', '—');
    this.edition.appendChild(this.edNum);
    this.edition.appendChild(el('span', 'sep', '/'));
    this.edition.appendChild(el('span', 'tot', String(this.total)));
    if (o.uniqLabel) this.edition.appendChild(el('span', 'uniq', esc(o.uniqLabel)));

    show.appendChild(this.stage);
    show.appendChild(this.edition);
    viewer.appendChild(this.reel);
    viewer.appendChild(show);

    this.strip = el('div', 'strip');

    this.view.appendChild(head);
    this.view.appendChild(viewer);
    this.view.appendChild(this.strip);
    document.body.appendChild(this.view);

    if (root.matchMedia && matchMedia('(hover: none)').matches) {
      this.sub.textContent = o.touchHint || 'Trascina il dito sul quadro';
    }

    this.view.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { self.backToSheet(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault(); self.select(self._wrap(self.current + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault(); self.select(self._wrap(self.current - 1));
      }
    });
  };

  Collection.prototype._start = function () {
    if (this.started) return;
    this.started = true;
    var self = this;

    this.relief = new root.Relief(this.cv, {
      plate: this.plate,
      onerror: function (m) { self._fail(m); }
    });
    if (!this.relief.gl) return;
    this.relief.useDeviceTilt();

    // it has said its piece once the hand arrives
    this.stage.addEventListener('pointermove', function () {
      self.sub.classList.add('gone');
    }, { once: true });
    this.stage.addEventListener('pointermove', function (e) { self.relief.aim(e); });
    this.stage.addEventListener('pointerdown', function (e) { self.relief.aim(e); });

    this._buildStrip();
    this._buildReel();
  };

  Collection.prototype.openViewer = function (i) {
    this._buildViewer();
    var self = this;
    this.view.hidden = false;
    this.viewOpen = true;
    document.documentElement.style.overflow = 'hidden';
    // the grid stays mounted underneath, so going back is instant
    this.closeSheet(true);
    // see openSheet: reflow rather than a frame callback
    void this.view.offsetHeight;
    this.view.classList.add('in');
    /* Everything below is the work, not the fade, and none of it may wait
       on a frame: a viewer that opens blank because rAF was withheld is
       the failure this whole path exists to avoid. */
    this._start();
    /* Put the arc where it belongs before anything is shown, rather than
       letting select() ease it there. Opening painting 13 should not spin
       through twelve others to reach it, and the ease runs on rAF, so a
       frame withheld would leave the arc parked at the wrong painting
       under a picture that is already correct. */
    this._jumpTo(i);
    this.select(i);
    this.view.tabIndex = -1;
    this.view.focus();
  };

  Collection.prototype.backToSheet = function () {
    if (!this.viewOpen) return;
    this._hideViewer();
    this.openSheet();
  };

  Collection.prototype.closeViewer = function () {
    if (!this.viewOpen) return;
    if (this.o.page) { this.backToSheet(); return; }
    this._hideViewer();
    document.documentElement.style.overflow = '';
    if (this._lastFocus && this._lastFocus.focus) this._lastFocus.focus();
  };

  Collection.prototype._hideViewer = function () {
    var self = this;
    this.viewOpen = false;
    this.view.classList.remove('in');
    if (this.relief) this.relief.stop && this.relief.stop();
    setTimeout(function () { if (!self.viewOpen) self.view.hidden = true; }, 300);
  };

  /* ---------------- the rail ---------------- */
  Collection.prototype._buildStrip = function () {
    var self = this;
    this.items.forEach(function (it, i) {
      var b = el('button');
      b.type = 'button';
      b.setAttribute('aria-label', it.alt || ((self.o.itemLabel || 'Quadro ') + (i + 1)));
      b.setAttribute('aria-current', 'false');
      var im = el('img');
      im.src = self.o.thumb(it.id);
      im.alt = '';
      im.loading = 'lazy';
      im.decoding = 'async';
      im.width = it.w; im.height = it.h;
      b.appendChild(im);
      b.addEventListener('click', function () { self.select(i); });
      self.strip.appendChild(b);
    });
    this.stripBtns = this.strip.querySelectorAll('button');
  };

  Collection.prototype._markStrip = function (i) {
    if (!this.stripBtns) return;
    for (var j = 0; j < this.stripBtns.length; j++) {
      var on = i === j;
      this.stripBtns[j].setAttribute('aria-current', String(on));
      if (on && this.stripBtns[j].scrollIntoView) {
        // keep the current one in the rail without dragging the page with it
        this.stripBtns[j].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  };

  /* ---------------- the arc ---------------- */
  Collection.prototype._wrap = function (i) {
    var n = this.items.length;
    return ((i % n) + n) % n;
  };

  Collection.prototype._buildReel = function () {
    var self = this;
    this.cards = [];
    this.pos = 0; this.posTarget = 0; this.reelBase = null;
    this.reelRaf = 0; this.dragging = false;

    for (var k = 0; k < SLOTS; k++) {
      var b = el('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      var im = el('img');
      im.alt = ''; im.decoding = 'async';
      b.appendChild(im);
      /* `this.dataset`, not a captured index: the ring reassigns which
         painting a card shows as it turns, so an index closed over at
         build time is the wrong one by the time anyone clicks. (It was
         also all seventeen handlers sharing one `var`.) */
      b.addEventListener('click', function () {
        if (self.moved) return;
        var idx = parseInt(this.dataset.idx, 10);
        if (isNaN(idx)) return;
        self.spinTo(idx);
        self.select(idx);
      });
      this.reel.appendChild(b);
      this.cards.push(b);
    }
    this._drag();
    this._layout();
    if (root.ResizeObserver) {
      new ResizeObserver(function () { self._layout(); }).observe(this.reel);
    }
    root.addEventListener('resize', function () { self._layout(); });
  };

  Collection.prototype._layout = function () {
    if (!this.cards || !this.cards.length) return;
    var w = this.reel.clientWidth, h = this.reel.clientHeight;
    // below 900px the reel is display:none and both of these are zero,
    // which is also how the layout stops running on a phone
    if (w < 2 || h < 2) return;

    // the ellipse sits on the left edge and bulges right
    var rx = Math.max(40, w - CARD_W * 0.62);
    var ry = h * 0.40;
    var step = (Math.PI * 2) / SLOTS;
    var base = Math.round(this.pos), frac = this.pos - base;

    if (base !== this.reelBase) {
      this.reelBase = base;
      for (var k = 0; k < SLOTS; k++) {
        var idx = this._wrap(base + k - MID);
        var card = this.cards[k];
        if (card.dataset.idx !== String(idx)) {
          card.dataset.idx = String(idx);
          card.firstChild.src = this.o.thumb(this.items[idx].id);
          card.setAttribute('aria-label', (this.o.itemLabel || 'Quadro ') + (idx + 1));
        }
      }
    }

    for (var j = 0; j < SLOTS; j++) {
      var th = (j - MID - frac) * step;
      var c = Math.cos(th), sn = Math.sin(th);
      var sc = MIN_SCALE + (1 - MIN_SCALE) * ((c + 1) / 2);
      var e = this.cards[j];
      e.style.width = CARD_W + 'px';
      e.style.height = CARD_H + 'px';
      e.style.transform =
        'translate(' + (c * rx - CARD_W / 2).toFixed(1) + 'px,' +
        (sn * ry - CARD_H / 2).toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
      e.style.zIndex = String(Math.round(sc * 1000));
      var t = (c + 1) / 2;
      e.style.opacity = (0.32 + 0.68 * t).toFixed(3);
      // the same idea as the grid: what you are not looking at keeps less colour
      e.style.filter = 'saturate(' + (0.34 + 0.66 * t).toFixed(3) + ')';
      e.setAttribute('aria-current', String(Math.abs(th) < step / 2));
    }
  };

  /* No ease, no frame: land on it. */
  Collection.prototype._jumpTo = function (i) {
    if (!this.cards || !this.cards.length) return;
    this.pos = this.posTarget = i;
    this._layout();
  };

  Collection.prototype.spinTo = function (target) {
    var n = this.items.length;
    var d = ((target - this._wrap(Math.round(this.posTarget))) % n + n) % n;
    if (d > n / 2) d -= n;
    this.posTarget = Math.round(this.posTarget) + d;
    this._startReel();
  };

  Collection.prototype._startReel = function () {
    if (this.reelRaf) return;
    var self = this;
    this.reelRaf = requestAnimationFrame(function () {
      self.reelRaf = 0;
      var d = self.posTarget - self.pos;
      if (Math.abs(d) < 0.0008) { self.pos = self.posTarget; self._layout(); return; }
      self.pos += d * 0.16;
      self._layout();
      self._startReel();
    });
  };

  Collection.prototype._drag = function () {
    var self = this, downY = 0, dragY = 0, downId = null;
    this.moved = false;

    this.reel.addEventListener('pointerdown', function (e) {
      if (self.reel.clientWidth < 2) return;
      self.dragging = true; self.moved = false;
      downY = dragY = e.clientY; downId = e.pointerId;
    });

    this.reel.addEventListener('pointermove', function (e) {
      if (!self.dragging) return;
      var v = e.clientY;
      if (!self.moved && Math.abs(v - downY) > 4) {
        self.moved = true;
        /* Capture only once it is a drag. Taking it on pointerdown
           retargets the subsequent click to the reel, so no card ever
           saw one and clicking to choose did nothing at all. */
        try { self.reel.setPointerCapture(downId); } catch (err) {}
      }
      if (!self.moved) return;
      var h = self.reel.clientHeight || 1;
      self.posTarget -= ((v - dragY) / h) * SLOTS * 0.55;
      dragY = v;
      self._startReel();
    });

    function up() {
      if (!self.dragging) return;
      self.dragging = false;
      try { self.reel.releasePointerCapture(downId); } catch (err) {}
      if (self.moved) self._settle();
    }
    this.reel.addEventListener('pointerup', up);
    this.reel.addEventListener('pointercancel', up);
  };

  Collection.prototype._settle = function () {
    var i = this._wrap(Math.round(this.posTarget));
    this.posTarget = Math.round(this.posTarget);
    this._startReel();
    this.select(i);
  };

  Collection.prototype._syncReel = function (i) {
    if (!this.cards || !this.cards.length || this.dragging) return;
    if (this._wrap(Math.round(this.posTarget)) === i) return;
    this.spinTo(i);
  };

  /* ---------------- choosing ---------------- */
  Collection.prototype.select = function (i) {
    if (i === this.current) return;
    this.current = i;
    this._markStrip(i);
    this._markSheet(i);
    this._syncReel(i);

    var n = i + 1;
    this.edNum.textContent = n < 10 ? '0' + n : String(n);
    this.edition.classList.remove('in');
    var ed = this.edition;
    // let the removal land before adding it back, so the mark plays again
    setTimeout(function () { ed.classList.add('in'); }, 30);

    var it = this.items[i], self = this;
    var warm = !!(this.relief && this.relief.cache[it.id]);
    this.plate.classList.add('busy');          // fade the picture out first

    /* Wait for the fade before asking for the picture. The extraction runs
       in a worker now, so this is no longer about not freezing the fade -
       it is that swapping the texture under a plate that is still visible
       shows the change happening. A timer, not rAF, because rAF stops in a
       background tab and the load would sit there until it came forward. */
    clearTimeout(this._pending);
    this._pending = setTimeout(function () {
      if (self.current !== i || !self.relief) return;
      self.relief.onload = function () {
        if (self.current === i) self.plate.classList.remove('busy');
      };
      self.relief.show(self.o.full(it.id), it.id);
    }, warm ? 180 : 300);
  };

  /* ---------------- the light on the grid ----------------
     Nothing is painted over it. Every painting carries how lit it is, 0 to
     1, and the CSS turns that into saturation and brightness. Light comes
     from the pointer and from three drifts, so the grid keeps moving when
     nobody is touching it.

     Positions are measured once from offsetLeft/offsetTop and only
     adjusted by scroll afterwards; reading getBoundingClientRect on 126
     elements a frame would force a layout each time. */
  Collection.prototype._measure = function () {
    this.boxes = [];
    if (!this.sheetBtns) return;
    for (var i = 0; i < this.sheetBtns.length; i++) {
      var b = this.sheetBtns[i];
      this.boxes.push({
        el: b,
        x: b.offsetLeft + b.offsetWidth / 2,
        y: b.offsetTop + b.offsetHeight / 2,
        lit: -1
      });
    }
  };

  function falloff(d, r) {
    if (d >= r) return 0;
    /* A smoothstep, not a square. Squared put a card one thumbnail out at
       half lit and two out at a quarter, which read as only the card under
       the hand being lit at all. */
    var t = 1 - d / r;
    return t * t * (3 - 2 * t);
  }

  Collection.prototype._startLit = function () {
    if (this.litRaf) return;
    var self = this;
    this.pmx = -9999; this.pmy = -9999;

    if (!this._litMove) {
      this._litMove = function (e) {
        self.pmx = e.clientX;
        self.pmy = e.clientY + (self.sheetScroll ? self.sheetScroll.scrollTop : 0);
        // the hand should not wait on a frame that a background tab never gives
        self._paintLit();
      };
      this.sheet.addEventListener('pointermove', this._litMove, { passive: true });
      this.sheet.addEventListener('pointerleave', function () {
        self.pmx = self.pmy = -9999;
      }, { passive: true });
    }
    var tick = function () {
      self.litRaf = requestAnimationFrame(tick);
      self._paintLit();
    };
    this.litRaf = requestAnimationFrame(tick);
  };

  Collection.prototype._stopLit = function () {
    if (this.litRaf) { cancelAnimationFrame(this.litRaf); this.litRaf = 0; }
  };

  Collection.prototype._paintLit = function () {
    if (!this.boxes || !this.boxes.length || !this.sheetScroll) return;
    var t = performance.now();
    var W = this.sheet.clientWidth, H = this.sheet.clientHeight;
    var top = this.sheetScroll.scrollTop;

    /* Three drifts on a nine to fifteen second cycle. They started at
       sixty-nine seconds, which is slow enough that nothing appears to
       move at all, and were briefly six, which was too busy. */
    var w1x = W * (0.30 + Math.sin(t * 0.00066) * 0.34);
    var w1y = H * (0.34 + Math.cos(t * 0.00048) * 0.34) + top;
    var w2x = W * (0.70 + Math.sin(t * 0.00055 + 2.1) * 0.32);
    var w2y = H * (0.58 + Math.cos(t * 0.00076 + 1.3) * 0.36) + top;
    var w3x = W * (0.48 + Math.sin(t * 0.00043 + 4.2) * 0.40);
    var w3y = H * (0.74 + Math.cos(t * 0.00060 + 0.7) * 0.30) + top;

    for (var i = 0; i < this.boxes.length; i++) {
      var b = this.boxes[i];
      // only what is on screen, give or take a screen
      if (b.y < top - H || b.y > top + H * 2) continue;

      var v = falloff(Math.hypot(b.x - this.pmx, b.y - this.pmy), CURSOR_R);
      var a = falloff(Math.hypot(b.x - w1x, b.y - w1y), WAVE_R);
      if (a > v) v = a;
      a = falloff(Math.hypot(b.x - w2x, b.y - w2y), WAVE_R);
      if (a > v) v = a;
      a = falloff(Math.hypot(b.x - w3x, b.y - w3y), WAVE_R);
      if (a > v) v = a;

      // only write when it has actually moved, so most stay untouched
      var q = Math.round(v * 100) / 100;
      if (q !== b.lit) { b.lit = q; b.el.style.setProperty('--lit', String(q)); }
    }
  };

  root.Collection = Collection;
})(window);
