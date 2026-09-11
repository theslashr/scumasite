/* ============================================================
   cardreveal.js — one painting becoming the next, on its own

   The hero has you reveal a painting by painting over it. A collection
   card does the same thing without being asked: every few seconds the
   next work in the set is laid in with spatula strokes until it has
   covered the one before it. Same language, no interaction — the card is
   a thing you glance at on the way past, not something to play with.

   The strokes are the point. A crossfade would be cheaper and would say
   nothing; what should read is paint going on, in passes, with edges.
   ============================================================ */
(function (root) {
  'use strict';

  var HOLD = 4200;    // how long a painting stays before the next one starts
  var SWEEP = 1900;   // how long the covering takes
  var BANDS = 7;      // spatula passes across the picture
  var STAMPS = 18;    // dabs making up one pass
  var SPECKLE = 10;   // dabs thrown ahead of it
  var CLOSE = 0.86;   // from here the covering closes to solid

  /* A small seeded generator, because the scatter has to be decided once
     per transition and then stay put. Drawing it from Math.random() each
     frame reshuffles the whole mask sixty times a second, which does not
     read as paint - it reads as static. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function CardReveal(media, srcs) {
    this.media = media;
    this.srcs = srcs;
    this.imgs = [];
    this.i = 0;
    this.raf = 0;
    this.t0 = 0;
    this.live = false;
    this.cycle = 0;
    this.bands = null;

    this.cv = document.createElement('canvas');
    this.cv.className = 'coll-card__canvas';
    this.cv.setAttribute('aria-hidden', 'true');
    this.media.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');

    // the mask is built once and reused; only what is drawn into it changes
    this.mask = document.createElement('canvas');
    this.mctx = this.mask.getContext('2d');
    /* The dabs are laid here first, unblurred, and the whole field is
       blurred once on its way into the mask. Setting ctx.filter and then
       filling two hundred ellipses asks the browser for two hundred blur
       passes a frame, per card - which is exactly what made this drop
       frames and drag the cursor with it. */
    this.scratch = document.createElement('canvas');
    this.sctx = this.scratch.getContext('2d');

    var self = this;
    this._load(0, function () {
      self._size();
      self._paint(self.imgs[0], null, 1);
      self.media.classList.add('is-live');
      self._load(1);
      self._watch();
    });
  }

  /* Load one source, then hand back. The rest follow the first so the card
     shows something as early as it can rather than waiting on the set. */
  CardReveal.prototype._load = function (n, done) {
    if (n >= this.srcs.length) { if (done) done(); return; }
    var self = this, im = new Image();
    im.decoding = 'async';
    im.onload = function () {
      self.imgs[n] = im;
      if (done) done();
      else self._load(n + 1);
    };
    im.onerror = function () { if (done) done(); };
    im.src = this.srcs[n];
  };

  CardReveal.prototype._size = function () {
    var r = this.media.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    /* Cap the backing store at 2x. Beyond that costs fill rate every frame
       for a difference nobody can see on a card this size. */
    /* 1.5x, not 2x. The mask is composited twice a frame at this size and
       the extra pixels cost real milliseconds for a difference nobody can
       see on a card - and these are photographs of paint, not type. */
    var dpr = Math.min(root.devicePixelRatio || 1, 1.5);
    var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.cv.width === w && this.cv.height === h) return true;
    this.cv.width = this.mask.width = this.scratch.width = w;
    this.cv.height = this.mask.height = this.scratch.height = h;
    return true;
  };

  /* Cover, the way object-fit does: fill the box and crop the overflow,
     because these are mixed portrait and landscape and letterboxing them
     inside a card would look like a mistake. */
  function cover(ctx, im, w, h) {
    var s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    var dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  /* Decide the scatter for one transition. Each pass is a run of dabs
     rather than a line, every dab carrying its own offset, radius and the
     point in the pass at which it appears. Ahead of each pass sit a few
     loose ones, which is what stops the leading edge being an edge.

     All of it is fixed here and only read back during the sweep, so the
     paint lands progressively instead of boiling. */
  CardReveal.prototype._seed = function () {
    var r = rng((this.i + 1) * 9176 + this.srcs.length * 31 + (this.cycle++ | 0) * 7919);
    this.bands = [];
    for (var i = 0; i < BANDS; i++) {
      var dabs = [], k;
      for (k = 0; k < STAMPS; k++) {
        var u = k / (STAMPS - 1);
        dabs.push({
          u: u,
          // the dab's own moment, jittered off its place along the pass
          th: Math.max(0, Math.min(1, u + (r() - 0.5) * 0.16)),
          dy: (r() - 0.5) * 1.25,
          dx: (r() - 0.5) * 0.5,
          rad: 0.42 + r() * 0.62,
          a: 0.72 + r() * 0.28
        });
      }
      for (k = 0; k < SPECKLE; k++) {
        // thrown ahead of the front, small and sparse, like flick off a blade
        var uu = r();
        dabs.push({
          u: uu,
          th: Math.max(0, Math.min(1, uu - 0.10 - r() * 0.13)),
          dy: (r() - 0.5) * 2.3,
          dx: (r() - 0.5) * 0.9,
          rad: 0.12 + r() * 0.3,
          a: 0.5 + r() * 0.5
        });
      }
      this.bands.push({ dabs: dabs, dir: r() < 0.5 ? -1 : 1, wob: r() * 6.28 });
    }
  };

  /* Lay the dabs whose moment has come. Each pass still starts a little
     after the one before it, so the covering arrives in overlapping
     sweeps, but what arrives is a scatter rather than a line. The blur is
     what keeps the result from looking like a mask. */
  CardReveal.prototype._strokes = function (p) {
    var w = this.mask.width, h = this.mask.height;
    var m = this.mctx, sc = this.sctx;
    if (!this.bands) this._seed();
    sc.clearRect(0, 0, w, h);
    sc.save();
    sc.fillStyle = '#000';

    var band = h / BANDS;
    for (var i = 0; i < BANDS; i++) {
      var B = this.bands[i];
      // a stagger of a third of the sweep, so passes overlap rather than march
      var d = (i / BANDS) * 0.34;
      var t = (p - d) / (1 - 0.34);
      if (t <= 0) continue;
      if (t > 1) t = 1;
      // ease out, so a pass lands rather than stopping dead
      t = 1 - (1 - t) * (1 - t);

      var y = band * (i + 0.5);
      for (var k = 0; k < B.dabs.length; k++) {
        var D = B.dabs[k];
        if (t < D.th) continue;
        // the dab fades up over its first moments rather than popping in
        var age = Math.min(1, (t - D.th) / 0.07);
        var x = B.dir > 0 ? (-0.12 + D.u * 1.24) * w : (1.12 - D.u * 1.24) * w;
        /* Full black once it has arrived. Dabs at partial alpha never
           accumulate to opaque however many overlap, so the sweep ended on
           a blend of the two paintings rather than on the new one - the
           picture you were moving to never actually arrived. */
        sc.globalAlpha = age;
        sc.beginPath();
        sc.ellipse(x + D.dx * band, y + D.dy * band + Math.sin(D.u * 5 + B.wob) * band * 0.18,
                   band * D.rad * 1.35, band * D.rad, 0, 0, 6.2832);
        sc.fill();
      }
    }

    /* The last stretch closes to solid. Scattered dabs cannot be relied on
       to cover every pixel, and a transition that leaves a few of the old
       painting showing through has not finished. */
    if (p > CLOSE) {
      sc.globalAlpha = Math.min(1, (p - CLOSE) / (1 - CLOSE));
      sc.fillRect(0, 0, w, h);
    }
    sc.globalAlpha = 1;
    sc.restore();

    // one blur, for the whole field, on its way into the mask
    m.save();
    m.clearRect(0, 0, w, h);
    if (typeof m.filter === 'string') m.filter = 'blur(' + Math.round(h * 0.012) + 'px)';
    m.drawImage(this.scratch, 0, 0);
    /* A blur has nothing to pull in from beyond the edge, so it thins the
       alpha there and a rim of the old painting survives the sweep. Once
       the field is closing, lay it in again unblurred: the texture is
       already spent by then and what matters is that the new painting
       actually arrives, edges included. */
    if (p > CLOSE) {
      m.filter = 'none';
      m.globalAlpha = Math.min(1, (p - CLOSE) / (1 - CLOSE));
      m.drawImage(this.scratch, 0, 0);
    }
    m.restore();
  };

  CardReveal.prototype._paint = function (base, next, p) {
    var w = this.cv.width, h = this.cv.height, c = this.ctx;
    if (!base) return;
    c.clearRect(0, 0, w, h);
    cover(c, base, w, h);
    if (!next || p <= 0) return;

    this._strokes(p);
    // the next painting, kept only where the strokes have been
    var m = this.mctx;
    m.save();
    m.globalCompositeOperation = 'source-in';
    cover(m, next, w, h);
    m.restore();
    c.drawImage(this.mask, 0, 0);
  };

  CardReveal.prototype._frame = function (now) {
    this.raf = 0;
    if (!this.live) return;
    if (!this.t0) this.t0 = now;

    var el = now - this.t0 + (this.stagger || 0);
    var cur = this.imgs[this.i];
    var nxt = this.imgs[(this.i + 1) % this.srcs.length];

    if (!nxt) {                       // the set is still arriving
      this._paint(cur, null, 0);
      this._tick();
      return;
    }
    if (el < HOLD) {
      this._paint(cur, null, 0);
    } else if (el < HOLD + SWEEP) {
      if (!this.sweeping) { this.sweeping = true; this._seed(); }
      this._paint(cur, nxt, (el - HOLD) / SWEEP);
    } else {
      this.i = (this.i + 1) % this.srcs.length;
      this.sweeping = false;
      this.t0 = now;
      this._paint(this.imgs[this.i], null, 0);
      // fetch the one after, the first time round
      if (!this.imgs[this.i + 1] && this.i + 1 < this.srcs.length) this._load(this.i + 1);
    }
    this._tick();
  };

  CardReveal.prototype._tick = function () {
    if (this.raf || !this.live) return;
    var self = this;
    this.raf = requestAnimationFrame(function (n) { self._frame(n); });
  };

  CardReveal.prototype.play = function () {
    if (this.live) return;
    if (!this._size()) return;
    this.live = true;
    this.t0 = 0;
    this._tick();
  };

  /* Cards take turns. Two of these sweeping at the same moment is twice
     the per-frame cost for no more effect, and it is the moment the page
     can least afford it. */
  CardReveal.prototype.offset = function (ms) { this.stagger = ms; };

  CardReveal.prototype.pause = function () {
    this.live = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  };

  /* Only while it is on screen and the tab is in front. Two cards painting
     to canvas behind a tab nobody is looking at is pure waste, and the
     section sits well down a long page. */
  CardReveal.prototype._watch = function () {
    var self = this;
    function check() {
      var r = self.media.getBoundingClientRect();
      var on = r.bottom > -80 && r.top < (root.innerHeight || 0) + 80 &&
               document.visibilityState !== 'hidden';
      if (on) self.play(); else self.pause();
    }
    if (root.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        if (es[0].isIntersecting && document.visibilityState !== 'hidden') self.play();
        else self.pause();
      }, { rootMargin: '80px' }).observe(this.media);
    }
    /* A scroll check behind the observer, for the same reason the
       collections have one: observer delivery rides the frame lifecycle,
       and a card that silently never starts looks broken rather than
       still. */
    root.addEventListener('scroll', check, { passive: true });
    root.addEventListener('resize', function () { self._size(); check(); }, { passive: true });
    document.addEventListener('visibilitychange', check);
    check();
  };

  function init() {
    var reduced = root.matchMedia &&
                  matchMedia('(prefers-reduced-motion: reduce)').matches;
    var mediaEls = document.querySelectorAll('[data-cycle]');
    for (var i = 0; i < mediaEls.length; i++) {
      var srcs = mediaEls[i].getAttribute('data-cycle').split(',');
      // reduced motion keeps the still image the markup already carries
      if (reduced || srcs.length < 2) continue;
      var cr = new CardReveal(mediaEls[i], srcs);
      cr.offset(i * ((HOLD + SWEEP) / 2));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  root.CardReveal = CardReveal;
})(window);
