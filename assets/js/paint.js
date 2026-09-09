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

  // A toned ground (imprimatura) — dark enough for cream type to read,
  // warm enough that multiplied pigment stays chromatic.
  var GESSO_RGB = [62, 48, 39];

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
  var lastMove  = 0;
  var idleT     = 0;

  /* ============================================================
     SIZING
     ============================================================ */
  function size() {
    var r = hero.getBoundingClientRect();
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

  /* A ground brushed on by hand is never flat. */
  function primeGround() {
    gesso.globalCompositeOperation = 'source-over';
    gesso.globalAlpha = 1;

    gesso.fillStyle = 'rgb(' + GESSO_RGB.join(',') + ')';
    gesso.fillRect(0, 0, W, H);

    var g = gesso.createLinearGradient(0, 0, W, H);
    g.addColorStop(0,    'rgba(96, 74, 58, .55)');
    g.addColorStop(0.45, 'rgba(48, 38, 32, .35)');
    g.addColorStop(1,    'rgba(28, 30, 34, .6)');
    gesso.fillStyle = g;
    gesso.fillRect(0, 0, W, H);

    var v = gesso.createRadialGradient(W * .5, H * .45, 0, W * .5, H * .45, Math.max(W, H) * .75);
    v.addColorStop(0, 'rgba(120,96,74,.20)');
    v.addColorStop(1, 'rgba(14,18,24,.55)');
    gesso.fillStyle = v;
    gesso.fillRect(0, 0, W, H);
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
    var R = 46 + load * 76;

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

    var step = 12;
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
    var g = settling ? 0.020 : 0.0009;
    var p = settling ? 0.030 : 0.0022;

    gesso.globalCompositeOperation = 'destination-over';
    gesso.globalAlpha = 1;
    gesso.fillStyle = 'rgba(' + GESSO_RGB.join(',') + ',' + g + ')';
    gesso.fillRect(0, 0, W, H);

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
    var cx = W * 0.5, cy = H * 0.52;
    var ax = W * 0.32, ay = H * 0.24;
    var x = cx + Math.sin(idleT * 0.00026) * ax + Math.sin(idleT * 0.00061) * ax * 0.2;
    var y = cy + Math.cos(idleT * 0.00038) * ay + Math.cos(idleT * 0.00083) * ay * 0.24;

    if (!brush.started) { brush.px = x; brush.py = y; brush.started = true; }
    stroke(brush.px, brush.py, x, y);
    brush.px = x; brush.py = y;
  }

  /* ============================================================
     LOOP
     ============================================================ */
  /* The brush paints a short flourish on arrival so the effect is
     discoverable, then hands over and leaves the surface alone. */
  var INTRO_MS = 5200;
  var bornAt = performance.now();

  var last = bornAt;
  function frame(now) {
    var dt = Math.min(now - last, 48);
    last = now;

    var introRunning = (now - bornAt) < INTRO_MS && lastMove === 0;
    if (introRunning && !reduced) idleStep(dt);

    // settle back to the bare ground once the hand has been still a moment
    var settling = !introRunning && (now - Math.max(lastMove, bornAt)) > 700;

    bleed();
    dryBack(settling);
    requestAnimationFrame(frame);
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

  window.addEventListener('pointermove', function (e) {
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
  hero.addEventListener('pointerdown', function () { document.body.classList.add('painting'); });
  window.addEventListener('pointerup',  function () { document.body.classList.remove('painting'); });

  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t); t = setTimeout(size, 180);
  });

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
  var art = document.querySelector('.hero__art');
  if (art) art.classList.add('is-ready');

  pickTarget();
  brush.colour = PALETTE[0].slice();
  requestAnimationFrame(frame);

  window.addEventListener('load', function () { setTimeout(size, 60); });
})();
