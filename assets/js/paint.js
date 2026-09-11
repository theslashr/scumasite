/* ============================================================
   paint.js — the cursor is a loaded brush, on wet paper.

   Three layers over the hero:
     .hero__art   a painting, waiting underneath
     gesso        a toned ground. Strokes ERASE it, so the painting
                  shows through wherever the visitor moves.
     paint        the pigment the brush leaves, multiplied on top.

   Softness comes from three places: the canvases render at a fraction
   of device resolution and get scaled up, every dab is a radial
   gradient with no hard edge, and the pigment layer bleeds outward a
   little each frame the way colour creeps through wet paper.
   ============================================================ */
(function () {
  'use strict';

  var hero   = document.querySelector('.hero');
  var gessoC = document.getElementById('gessoCanvas');
  var paintC = document.getElementById('paintCanvas');
  if (!hero || !gessoC || !paintC) return;

  var gesso = gessoC.getContext('2d');
  var paint = paintC.getContext('2d');

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse  = window.matchMedia('(hover: none)').matches;

  /* Internal resolution. Below 1 the bitmap is scaled up by the browser,
     which softens everything for free. */
  var RES    = 0.45;
  /* The canvases overhang the hero so the CSS blur never exposes an edge. */
  var MARGIN = 60;

  // Primed linen: a warm off-white, the colour of gesso over cloth. Pigment
  // multiplies onto it the way it does on a real primed canvas.
  var GESSO_RGB = [233, 224, 206];

  var PALETTE = [
    [42, 166, 196],   // cyan
    [217, 162, 39],   // ochre
    [216, 69, 47],    // red
    [31, 122, 108],   // teal
    [107, 74, 158],   // violet
    [194, 65, 126],   // magenta
    [58, 108, 152]    // slate blue — anything darker goes muddy under multiply
  ];

  var W = 0, H = 0;

  var brush = {
    px: 0, py: 0,
    started: false,
    colour: PALETTE[0].slice(),
    target: PALETTE[1].slice(),
    reload: 0,
    forced: null
  };

  var pointer   = { has: false };
  var lastMove  = 0;   // last cursor movement
  var lastPaint = 0;   // last stroke laid down, by hand or by the brush itself
  var idleT     = 0;

  /* which painting is waiting under the ground */
  var artFrames = [], artIndex = 0;
  var paintedSinceSwap = false;

  /* How long the surface has to be still before the next painting slides in.
     This used to wait for the ground to be completely opaque again: 700ms to
     start settling and 2200ms on top, and the count restarted on every stroke,
     so it took three seconds of doing nothing and never happened at all if you
     kept painting. It now goes while the ground is still flooding back, about
     two thirds of the way closed, so the picture changes under a returning
     veil rather than behind a shut one. */
  var SWAP_AFTER_MS = 1500;

  /* ============================================================
     SIZING
     ============================================================ */
  function size() {
    var r = hero.getBoundingClientRect();
    // A zero-width measurement primes the ground at a degenerate size and then
    // CSS stretches it across the hero. Wait for a real box instead.
    if (r.width < 2 || r.height < 2) { setTimeout(size, 120); return; }
    W = Math.max(1, Math.round(r.width  + MARGIN * 2));
    H = Math.max(1, Math.round(r.height + MARGIN * 2));

    [gessoC, paintC].forEach(function (c) {
      c.width  = Math.max(1, Math.round(W * RES));
      c.height = Math.max(1, Math.round(H * RES));
    });

    // draw in CSS pixels; the bitmap just happens to be smaller
    gesso.setTransform(RES, 0, 0, RES, 0, 0);
    paint.setTransform(RES, 0, 0, RES, 0, 0);

    primeGround();
    paint.clearRect(0, 0, W, H);
  }

  /* The toned ground, kept off-screen and rebuilt only on resize. dryBack
     heals from this rather than from a flat fill, so a patch that has been
     painted over and dried does not come back smoother than its surroundings. */
  var groundC = document.createElement('canvas');
  var ground  = groundC.getContext('2d');

  /* A ground brushed on by hand is never flat. */
  function primeGround() {
    groundC.width  = Math.max(1, Math.round(W * RES));
    groundC.height = Math.max(1, Math.round(H * RES));
    ground.setTransform(RES, 0, 0, RES, 0, 0);
    ground.globalCompositeOperation = 'source-over';
    ground.globalAlpha = 1;

    ground.fillStyle = 'rgb(' + GESSO_RGB.join(',') + ')';
    ground.fillRect(0, 0, W, H);

    var g = ground.createLinearGradient(0, 0, W, H);
    g.addColorStop(0,    'rgba(255,250,238,.55)');
    g.addColorStop(0.45, 'rgba(228,218,198,.30)');
    g.addColorStop(1,    'rgba(196,186,168,.45)');
    ground.fillStyle = g;
    ground.fillRect(0, 0, W, H);

    var v = ground.createRadialGradient(W * .5, H * .45, 0, W * .5, H * .45, Math.max(W, H) * .75);
    v.addColorStop(0, 'rgba(255,252,244,.28)');
    v.addColorStop(1, 'rgba(146,134,116,.42)');
    ground.fillStyle = v;
    ground.fillRect(0, 0, W, H);

    mottle();

    gesso.globalCompositeOperation = 'source-over';
    gesso.globalAlpha = 1;
    gesso.clearRect(0, 0, W, H);
    gesso.drawImage(groundC, 0, 0, W, H);
  }

  /* Scumbled patches and a few broad drags. Smooth gradients were what made
     the ground read as a brown fill: real toned canvas is uneven, because it
     was brushed on and the cloth underneath drinks it unevenly. */
  function mottle() {
    var i;
    for (i = 0; i < 30; i++) {
      var x = Math.random() * W, y = Math.random() * H;
      var r = Math.max(W, H) * (0.05 + Math.random() * 0.17);
      var col = Math.random() < 0.55 ? '196,174,140' : '156,152,144';
      var a = (0.05 + Math.random() * 0.085).toFixed(3);
      var rg = ground.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(' + col + ',' + a + ')');
      rg.addColorStop(1, 'rgba(' + col + ',0)');
      ground.fillStyle = rg;
      ground.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (i = 0; i < 10; i++) {
      var yy = Math.random() * H;
      var hh = H * (0.02 + Math.random() * 0.06);
      var la = (0.028 + Math.random() * 0.035).toFixed(3);
      var lg = ground.createLinearGradient(0, yy, 0, yy + hh);
      lg.addColorStop(0,  'rgba(178,160,132,0)');
      lg.addColorStop(.5, 'rgba(178,160,132,' + la + ')');
      lg.addColorStop(1,  'rgba(178,160,132,0)');
      ground.fillStyle = lg;
      ground.fillRect(0, yy, W, hh);
    }
  }

  /* ============================================================
     COLOUR — the brush runs dry and gets reloaded
     ============================================================ */
  function pickTarget() {
    var next;
    do { next = PALETTE[(Math.random() * PALETTE.length) | 0]; }
    while (next === brush.target);
    brush.target = next.slice();
    brush.reload = 260 + Math.random() * 420;
  }

  function advanceColour(dist) {
    if (brush.forced) { brush.colour = brush.forced.slice(); return; }
    brush.reload -= dist;
    if (brush.reload <= 0) pickTarget();
    for (var i = 0; i < 3; i++) {
      brush.colour[i] += (brush.target[i] - brush.colour[i]) * 0.03;
    }
  }

  /* ============================================================
     A DAB — a soft pool of colour, no edge anywhere
     ============================================================ */
  function pool(ctx, x, y, r, alpha, c) {
    if (r <= 0) return;
    var col = c || [0, 0, 0];
    var head = 'rgba(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ',';
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,    head + alpha + ')');
    g.addColorStop(0.42, head + (alpha * 0.62) + ')');
    g.addColorStop(0.75, head + (alpha * 0.22) + ')');
    g.addColorStop(1,    head + '0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function dab(x, y, speed) {
    // slow hand = a fat loaded pool; quick flick = a thinner, longer wash
    var load = Math.max(0, Math.min(1, 1 - speed / 90));
    var R = (74 + load * 116) * (coarse ? 1.35 : 1);

    // satellites break the circle up so the pool spreads unevenly
    var sats = [];
    for (var i = 0; i < 3; i++) {
      var a = Math.random() * Math.PI * 2;
      var d = R * (0.25 + Math.random() * 0.55);
      sats.push([x + Math.cos(a) * d, y + Math.sin(a) * d, R * (0.34 + Math.random() * 0.42)]);
    }

    // ---- reveal ----
    gesso.globalCompositeOperation = 'destination-out';
    gesso.globalAlpha = 1;
    pool(gesso, x, y, R * 1.22, 0.26, null);
    for (i = 0; i < sats.length; i++) pool(gesso, sats[i][0], sats[i][1], sats[i][2] * 1.2, 0.17, null);

    // ---- pigment ----
    paint.globalCompositeOperation = 'source-over';
    paint.globalAlpha = 1;
    pool(paint, x, y, R, 0.075, brush.colour);
    for (i = 0; i < sats.length; i++) pool(paint, sats[i][0], sats[i][1], sats[i][2], 0.045, brush.colour);
  }

  function stroke(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    paintedSinceSwap = true;
    lastPaint = performance.now();

    var step = 16;   // the pools are wide enough that they still overlap
    var n = Math.max(1, Math.ceil(dist / step));
    for (var i = 1; i <= n; i++) {
      var t = i / n;
      dab(x0 + dx * t, y0 + dy * t, dist);
    }
    advanceColour(dist);
  }

  /* ============================================================
     WET PAPER — pigment creeps outward, then slowly dries
     ============================================================ */
  function bleed() {
    var w = paintC.width, h = paintC.height;
    if (!w || !h) return;
    paint.save();
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.globalCompositeOperation = 'source-over';
    paint.globalAlpha = 0.055;
    var k = 1.013;
    paint.translate(w / 2, h / 2);
    paint.scale(k, k);
    paint.translate(-w / 2, -h / 2);
    paint.drawImage(paintC, 0, 0);
    paint.restore();
  }

  /* While the hand is moving the surface stays wet and strokes linger.
     A moment after it stops, the ground floods back so the copy over the
     top is easy to read again. */
  function dryBack(settling) {
    /* Faster while wet on touch: with no scrim there, anything painted over
       the copy has to close up on its own rather than be covered. */
    var g = settling ? 0.020 : (coarse ? 0.0034 : 0.0009);
    var p = settling ? 0.030 : 0.0022;

    gesso.globalCompositeOperation = 'destination-over';
    gesso.globalAlpha = g;
    gesso.drawImage(groundC, 0, 0, W, H);
    gesso.globalAlpha = 1;

    paint.globalCompositeOperation = 'destination-out';
    paint.globalAlpha = 1;
    paint.fillStyle = 'rgba(0,0,0,' + p + ')';
    paint.fillRect(0, 0, W, H);

    gesso.globalCompositeOperation = 'source-over';
    paint.globalCompositeOperation = 'source-over';
  }

  /* ============================================================
     IDLE — if nobody paints, the brush paints itself
     ============================================================ */
  function idleStep(dt) {
    idleT += dt;
    /* Centred, the wash clears the ground exactly where the copy sits, which
       is what forced a veil over the top on a phone. Roam the lower band
       instead: the painting comes up around and below the words, and the words
       keep their canvas without anything smeared over them. */
    var cx = W * 0.5, cy = H * (coarse ? 0.70 : 0.52);
    /* On touch there is no pointer to follow the hero with, and revealing a
       painting a fingertip at a time is not an interaction anyone will finish.
       So the brush roams wider and travels faster there, and the wash below
       runs for most of the cycle: the paintings arrive on their own, and a
       finger only adds to what is already happening. */
    var reach = coarse ? 0.46 : 0.32;
    var rise  = coarse ? 0.26 : 0.24;
    var sp    = coarse ? 1.6  : 1;
    var ax = W * reach, ay = H * rise;
    var x = cx + Math.sin(idleT * 0.00026 * sp) * ax + Math.sin(idleT * 0.00061 * sp) * ax * 0.2;
    var y = cy + Math.cos(idleT * 0.00038 * sp) * ay + Math.cos(idleT * 0.00083 * sp) * ay * 0.24;

    if (!brush.started) { brush.px = x; brush.py = y; brush.started = true; }
    stroke(brush.px, brush.py, x, y);
    brush.px = x; brush.py = y;
  }

  /* ============================================================
     LOOP
     ============================================================ */
  /* The brush paints on a rhythm of its own on every device, because most
     visitors never think to drag across the hero and would otherwise see one
     still painting behind a closed ground. A wash, then a pause long enough
     for the ground to close and the next painting to take its place.

     The moment a hand does take part the brush steps aside, and stays out of
     the way until the cursor has been still for HAND_OVER_MS. */
  var CYCLE_MS     = coarse ? 8200 : 7000;   // wash + rest
  var PAINT_MS     = coarse ? 5400 : 3300;   // of which this much is the wash
  var HAND_OVER_MS = 2500;   // how long the brush waits after you paint
  var bornAt       = performance.now();

  function autoPainting(now) {
    if (reduced) return false;
    if (lastMove && now - lastMove < HAND_OVER_MS) return false;
    return ((now - bornAt) % CYCLE_MS) < PAINT_MS;
  }

  var last = bornAt;
  function frame(now) {
    var dt = Math.min(now - last, 48);
    last = now;

    if (autoPainting(now)) idleStep(dt);

    /* Keyed to the last stroke rather than the last cursor move, so the
       self-painting rhythm on touch settles between washes too. */
    var settling = (now - Math.max(lastPaint, bornAt)) > 700;

    /* The flood-back is the cover for the change, so the change rides it
       rather than waiting it out. */
    if (paintedSinceSwap && now - Math.max(lastPaint, bornAt) > SWAP_AFTER_MS) {
      nextArtwork();
      paintedSinceSwap = false;
    }

    bleed();
    dryBack(settling);
    requestAnimationFrame(frame);
  }

  /* ============================================================
     ARTWORKS
     ============================================================ */
  /* The incoming painting is stacked ON TOP and faded in while the outgoing
     one stays fully opaque underneath. A straight crossfade would leave both
     half transparent at the midpoint and let the background show through. */
  var artZ = 1;
  function nextArtwork() {
    if (artFrames.length < 2) return;

    var prev = artFrames[artIndex];
    artIndex = (artIndex + 1) % artFrames.length;
    var next = artFrames[artIndex];

    next.style.zIndex = ++artZ;
    next.classList.add('is-current');

    // drop the old one only once the new one has fully arrived
    clearTimeout(next._fadeT);
    next._fadeT = setTimeout(function () {
      prev.classList.remove('is-current');
    }, 1300);
  }

  function setupArtworks() {
    var wrap = document.querySelector('.hero__art');
    if (!wrap) return;
    artFrames = Array.prototype.slice.call(wrap.querySelectorAll('img'));
    artIndex = Math.max(0, artFrames.indexOf(wrap.querySelector('.is-current')));

    /* Shuffle the ones after the current painting, so two visits do not
       uncover the same sequence. Only the order of this array changes and
       never the DOM: which painting is on top is decided by the z-index
       nextArtwork assigns, so the markup can stay as it was rendered.

       The painting already showing keeps its place at the front. It is the
       one with a real src and fetchpriority, and it is this page's largest
       contentful paint - shuffling that would make the load time vary by
       visit and could never be previewed. Everything after it is fair game. */
    for (var i = artFrames.length - 1; i > artIndex + 1; i--) {
      var j = artIndex + 1 + Math.floor(Math.random() * (i - artIndex));
      var t = artFrames[i]; artFrames[i] = artFrames[j]; artFrames[j] = t;
    }

    // the first is already loading; fetch the rest once the page has settled
    window.addEventListener('load', function () {
      setTimeout(function () {
        artFrames.forEach(function (img) {
          var src = img.getAttribute('data-src');
          if (src && !img.getAttribute('src')) img.setAttribute('src', src);
        });
      }, 900);
    });
  }

  /* ============================================================
     INPUT — strokes land the instant the hand moves
     ============================================================ */
  function toLocal(e) {
    var r = hero.getBoundingClientRect();
    return {
      x: e.clientX - r.left + MARGIN,
      y: e.clientY - r.top  + MARGIN,
      inside: e.clientY >= r.top && e.clientY <= r.bottom &&
              e.clientX >= r.left && e.clientX <= r.right
    };
  }

  /* Touch and the mouse want opposite things here. A mouse has no pressed
     state to wait for, so it paints as it passes. A finger that is moving is
     almost always scrolling: pointermove keeps arriving throughout, and
     because toLocal reads the hero's rect, the surface slides under a finger
     that is not moving at all. That is where the stray colour came from, and
     every stray stroke refreshed lastPaint, so the swap timer never ran out
     and the painting never changed. On touch, moving scrolls and holding
     paints; nothing is painted from pointermove at all. */
  var holdAt = null, holdTimer = 0, holdFrom = null;

  function holdTick() {
    if (!holdAt) return;
    dab(holdAt.x, holdAt.y, 0);
    lastPaint = performance.now();
    paintedSinceSwap = true;
  }
  function startHold(p) {
    holdAt = p;
    clearInterval(holdTimer);
    // slow enough that the pool spreads instead of punching a hole
    holdTimer = setInterval(holdTick, 95);
  }
  function endHold() {
    holdAt = null; holdFrom = null;
    clearInterval(holdTimer); holdTimer = 0;
    document.body.classList.remove('painting');
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') {
      // past this the gesture is a scroll, so stop painting and let it go
      if (holdFrom && Math.hypot(e.clientX - holdFrom.cx, e.clientY - holdFrom.cy) > 12) endHold();
      return;
    }
    var p = toLocal(e);
    if (!p.inside) { pointer.has = false; return; }

    if (!pointer.has || !brush.started) {
      brush.px = p.x; brush.py = p.y;
      brush.started = true;
    }
    pointer.has = true;
    lastMove = performance.now();

    stroke(brush.px, brush.py, p.x, p.y);
    brush.px = p.x; brush.py = p.y;
  }, { passive: true });

  window.addEventListener('pointerleave', function () { pointer.has = false; });
  hero.addEventListener('pointerdown', function (e) {
    document.body.classList.add('painting');
    // a tap should leave a mark too, not just a drag
    var p = toLocal(e);
    if (p.inside) {
      brush.px = p.x; brush.py = p.y; brush.started = true;
      dab(p.x, p.y, 0);
      lastPaint = performance.now();
      paintedSinceSwap = true;
      if (e.pointerType === 'touch') {
        holdFrom = { cx: e.clientX, cy: e.clientY };
        startHold(p);
      }
    }
  });
  window.addEventListener('pointerup',     endHold);
  window.addEventListener('pointercancel', endHold);
  // a long press is how you paint here, so it must not raise the callout menu
  hero.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t); t = setTimeout(size, 180);
  });
  // window resize misses the cases that actually matter here: the hero settling
  // after fonts land, or being measured before layout. Watch the box itself.
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      clearTimeout(t); t = setTimeout(size, 180);
    }).observe(hero);
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  window.ScumaPaint = {
    setColour: function (hex) {
      if (!hex || hex === 'auto') { brush.forced = null; return; }
      var n = parseInt(hex.slice(1), 16);
      brush.forced = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      brush.colour = brush.forced.slice();
    },
    clear: function () {
      primeGround();
      paint.clearRect(0, 0, W, H);
      brush.started = false;
    }
  };

  /* ---------- go ---------- */
  size();
  setupArtworks();
  var art = document.querySelector('.hero__art');
  if (art) art.classList.add('is-ready');

  pickTarget();
  brush.colour = PALETTE[0].slice();
  requestAnimationFrame(frame);

  window.addEventListener('load', function () { setTimeout(size, 60); });
})();
