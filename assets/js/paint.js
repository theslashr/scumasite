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

  /* Primed linen: a warm off-white, the colour of gesso over cloth. Pigment
     multiplies onto it the way it does on a real primed canvas.

     Warm, not tan. Measured on screen the ground used to composite around
     hue 40 at 19-30% saturation and 78-84% lightness, against the site's own
     --canvas at 93% - which reads as sepia rather than as cloth, and reads
     that way most on a phone, where there is no hover to paint it away and
     the ground is nearly all you see. The warmth is in the hue; the brown
     was in the saturation and the missing light. */
  var GESSO_RGB = [240, 235, 226];

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

    /* The unevenness of a ground brushed by hand, kept - but as changes in
       light rather than in colour. Every stop below sits within a few points
       of the base hue; it is only the lightness that moves. */
    var g = ground.createLinearGradient(0, 0, W, H);
    g.addColorStop(0,    'rgba(255,252,246,.55)');
    g.addColorStop(0.45, 'rgba(238,232,222,.30)');
    g.addColorStop(1,    'rgba(220,213,201,.38)');
    ground.fillStyle = g;
    ground.fillRect(0, 0, W, H);

    var v = ground.createRadialGradient(W * .5, H * .45, 0, W * .5, H * .45, Math.max(W, H) * .75);
    v.addColorStop(0, 'rgba(255,253,249,.26)');
    v.addColorStop(1, 'rgba(199,191,178,.30)');
    ground.fillStyle = v;
    ground.fillRect(0, 0, W, H);

    mottle();

    gesso.globalCompositeOperation = 'source-over';
    gesso.globalAlpha = 1;
    gesso.clearRect(0, 0, W, H);
    gesso.drawImage(groundC, 0, 0, W, H);

    bakeReserve();
  }

  /* Scumbled patches and a few broad drags. Smooth gradients were what made
     the ground read as a brown fill: real toned canvas is uneven, because it
     was brushed on and the cloth underneath drinks it unevenly. */
  function mottle() {
    var i;
    for (i = 0; i < 30; i++) {
      var x = Math.random() * W, y = Math.random() * H;
      var r = Math.max(W, H) * (0.05 + Math.random() * 0.17);
      // near-neutral, so the patches read as unevenly drunk primer rather
      // than as tea stains: the mottling was most of the remaining sepia
      var col = Math.random() < 0.55 ? '198,189,174' : '168,166,162';
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
      lg.addColorStop(0,  'rgba(190,183,171,0)');
      lg.addColorStop(.5, 'rgba(190,183,171,' + la + ')');
      lg.addColorStop(1,  'rgba(190,183,171,0)');
      ground.fillStyle = lg;
      ground.fillRect(0, yy, W, hh);
    }
  }

  /* ============================================================
     RISERVA - a wash of primer under the words
     ============================================================ */
  /* On a phone the copy sits straight on the ground being erased, so when a
     painting comes through, the words go with it. The fixes before this were
     all soft: a scrim that read as a smudge at phone size, then a halo on
     the letters, then steering the idle brush below them.

     The first riserva masked the words completely, rewriting the simulation
     every frame so the ground under each line was never lifted. Both halves
     of that were wrong. At full strength it hid most of the painting on a
     narrow phone, where the copy is most of the hero's height. And writing
     into the simulation meant fighting it at the feathered edge - ground
     growing back under, strokes eroding, pigment spreading outward and being
     cut back at a fixed line, on a canvas at 45% resolution - so the edge
     visibly crawled.

     So now it is a separate still layer, above the paint and below the weave
     and the words: the primer, cut to the shape of the lines, at partial
     strength. The simulation runs untouched, and this only moves when the
     copy does.

     How much primer each line gets is measured, not chosen, and each line
     gets only what it needs - the ink against the worst backdrop it could
     land on, at the WCAG AA ratio for its size:

       the paragraph  4.5:1 over pure black             0.585 -> 0.62
       the tagline    4.5:1 over the darkest painting   0.55
       the name       3:1, large text, same painting    0.415 -> 0.42

     "The darkest painting" is n111, the night seascape: its darkest 5% sits
     at rgb(0,17,64), measured across all 25 hero paintings. The paragraph is
     held to pure black on top of that because it is the text that has to be
     read; the name is display type, where AA asks 3:1, so it can let most of
     the painting through. The bar is left out entirely: its small glow reads
     better up there than a patch behind the logo and the menu button. */
  var RESERVE = coarse;
  var reserveGroups = [];

  var RESERVE_STRENGTH = {
    '.hero__eyebrow': 0.55,
    '.hero__title':   0.42,
    '.hero__lead':    0.62
  };

  /* The solid part, held tight to the letters in CSS px [across, up/down].
     Everything outside it is the soft primer stroke, sized to the type. */
  var RESERVE_PAD = {
    '.hero__eyebrow': [4, 2],
    '.hero__title':   [4, 0],
    '.hero__lead':    [4, 1]
  };

  /* Seeded, so a shape is decided once per layout and stays put. The lines
     are re-measured several times on the way in - fonts, the headline's
     rise - and a stroke redrawn from Math.random() each time would visibly
     change shape under the words. */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // a round dab of primer: solid out to half its radius, then falling away
  function primerDab(c, x, y, R) {
    var g = c.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0,    'rgba(0,0,0,1)');
    g.addColorStop(0.5,  'rgba(0,0,0,1)');
    g.addColorStop(0.78, 'rgba(0,0,0,.42)');
    g.addColorStop(1,    'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, R, 0, 6.2832);
    c.fill();
  }

  /* One line's wash, laid the way the hero lays paint: overlapping round
     dabs travelling along the line, with a few loose ones above and below.

     It replaces a rounded rectangle with a fixed 16px feather, which read
     as a soft band on a small line and as a pale block behind the name -
     the name's two lines merged into one box, and a feather that thin on
     type that large is nearly a hard edge. The dabs scale with the line:
     a dab's radius is the line's own height, so a big line gets a broad,
     uneven edge and a small one a narrow edge, and nothing anywhere has a
     corner.

     Under the letters it is still a solid core, so the measured strengths
     hold: the dabs only ever add outside it, and their solid middle reaches
     past the core's edge so that edge is never seen. */
  function primerStroke(c, q, rnd) {
    var x = q[0], y = q[1], w = q[2], h = q[3];
    c.fillStyle = '#000';
    rounded(c, x, y, w, h, Math.min(h / 2, 4 * RES));
    c.fill();

    var cy = y + h / 2, from = x + h * 0.2, to = x + w - h * 0.2;
    var step = h * 0.38;
    for (var cx = from; cx <= to + 0.01; cx += step) {
      primerDab(c,
        cx + (rnd() - 0.5) * step * 0.4,
        cy + (rnd() - 0.5) * h * 0.22,
        h * (0.95 + rnd() * 0.3));
    }
    // loose dabs off the long edges, so neither is a straight line
    var loose = Math.max(2, Math.round(w / (h * 1.6)));
    for (var k = 0; k < loose; k++) {
      primerDab(c,
        from + rnd() * Math.max(1, to - from),
        cy + (rnd() < 0.5 ? -1 : 1) * h * (0.35 + rnd() * 0.25),
        h * (0.55 + rnd() * 0.35));
    }
  }

  /* How far a node is currently pushed by transforms between it and the
     element being measured. The headline's words rise into place and the
     other lines ease in, so measuring while any of that is under way puts
     the shape where the text is passing through rather than where it
     settles - the name's words were caught 68px low, on top of the
     paragraph, and the two washes stacked to 0.78. Taking the transform
     back out gives the resting position whatever moment this runs at. */
  function travel(node, el) {
    var x = 0, y = 0, cur = node.nodeType === 1 ? node : node.parentNode;
    while (cur && cur.nodeType === 1) {
      var tf = getComputedStyle(cur).transform;
      var m = tf && tf !== 'none' && tf.match(/matrix(3d)?\(([^)]+)\)/);
      if (m) {
        var v = m[2].split(',').map(parseFloat);
        x += m[1] ? v[12] : v[4];
        y += m[1] ? v[13] : v[5];
      }
      if (cur === el) break;
      cur = cur.parentNode;
    }
    return [x, y];
  }

  /* The boxes of the text itself, line by line, where they come to rest.
     An element's own box spans the whole column even when its line is short
     and centred. */
  function lineRects(el) {
    var out = [], range = document.createRange(), n;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      if (n.parentNode.closest && n.parentNode.closest('.sr-only')) continue;
      range.selectNodeContents(n);
      var rs = range.getClientRects(), off = travel(n, el);
      for (var i = 0; i < rs.length; i++) {
        if (rs[i].width > 1 && rs[i].height > 1) {
          out.push({ left: rs[i].left - off[0], top: rs[i].top - off[1],
                     width: rs[i].width, height: rs[i].height });
        }
      }
    }
    if (!out.length) {
      var r = el.getBoundingClientRect(), o = travel(el, el);
      out.push({ left: r.left - o[0], top: r.top - o[1], width: r.width, height: r.height });
    }
    return out;
  }

  function rounded(c, x, y, w, h, r) {
    if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* One layer per thing that moves on its own: the copy scrolls and fades
     with .hero__inner, the bar is fixed to the viewport. Each canvas sits
     exactly over the gesso canvas (same class, same overhang, same blur), so
     the primer drawn into it lines up with the ground around it. */
  function veilFor(key) {
    var id = 'heroVeil-' + key, c = document.getElementById(id);
    if (!c) {
      c = document.createElement('canvas');
      c.id = id;
      c.className = 'hero__canvas hero__canvas--veil';
      c.setAttribute('aria-hidden', 'true');
      // after the pigment, before the weave: the cloth texture stays on top
      paintC.parentNode.insertBefore(c, paintC.nextSibling);
    }
    return c;
  }

  function bakeGroup(key, anchorSel, sels, hr) {
    var anchor = document.querySelector(anchorSel);
    if (!anchor || !groundC.width) return null;
    var cw = groundC.width, ch = groundC.height;

    var c = veilFor(key);
    c.width = cw; c.height = ch;
    var vc = c.getContext('2d');
    var any = false;

    /* Each kind of text is drawn into its own mask at full opacity and laid
       into the layer at its own strength, so a line's core is exactly the
       measured amount - drawing the passes straight in at partial alpha
       would compound where the feather and the core overlap. */
    var tmp = document.createElement('canvas');
    tmp.width = cw; tmp.height = ch;
    var tc = tmp.getContext('2d');

    /* Lightest first, and each one replaces rather than stacks. The name's
       stroke is broad now and reaches down over the paragraph's first line;
       laid on top of each other with plain source-over they compounded, and
       the paragraph's core measured 0.671 instead of 0.62. */
    var order = sels.map(function (sel, si) { return { sel: sel, si: si }; })
      .sort(function (a, b) {
        return (RESERVE_STRENGTH[a.sel] || 0.62) - (RESERVE_STRENGTH[b.sel] || 0.62);
      });

    order.forEach(function (o) {
      var sel = o.sel, si = o.si;
      var el = document.querySelector(sel);
      if (!el) return;
      var pad = RESERVE_PAD[sel] || [4, 1];
      var rects = lineRects(el).map(function (r) {
        return [
          (r.left - hr.left + MARGIN - pad[0]) * RES,
          (r.top  - hr.top  + MARGIN - pad[1]) * RES,
          (r.width  + pad[0] * 2) * RES,
          (r.height + pad[1] * 2) * RES
        ];
      });
      if (!rects.length) return;
      any = true;

      /* Each kind of line into its own mask at full opacity, then laid into
         the layer at its own strength - so the solid core under the letters
         is exactly the measured amount, however the dabs overlap. */
      tc.clearRect(0, 0, cw, ch);
      rects.forEach(function (q, li) {
        primerStroke(tc, q, seeded((si + 1) * 7919 + li * 104729 + Math.round(q[2] * 10)));
      });

      /* Take out what is already there in proportion to this mask, then lay
         this line in: inside its core the result is exactly its own
         strength, outside its stroke nothing changes, and across the soft
         edge one blends into the other instead of adding up. */
      vc.globalCompositeOperation = 'destination-out';
      vc.globalAlpha = 1;
      vc.drawImage(tmp, 0, 0);
      vc.globalCompositeOperation = 'source-over';
      vc.globalAlpha = RESERVE_STRENGTH[sel] != null ? RESERVE_STRENGTH[sel] : 0.62;
      vc.drawImage(tmp, 0, 0);
      vc.globalAlpha = 1;
    });
    if (!any) return null;

    // the live ground, cut to that shape - the mottling is random per
    // resize, and a stale copy would show as a patch that does not match
    vc.globalCompositeOperation = 'source-in';
    vc.drawImage(groundC, 0, 0);
    vc.globalCompositeOperation = 'source-over';

    var ar = anchor.getBoundingClientRect();
    return { key: key, canvas: c, anchor: anchor,
             ax: ar.left - hr.left, ay: ar.top - hr.top, t: '', o: '' };
  }

  function bakeReserve() {
    if (!RESERVE || !W || !H) return;
    var hr = hero.getBoundingClientRect();
    if (hr.width < 2) return;
    reserveGroups = [
      bakeGroup('copy', '.hero__inner', ['.hero__eyebrow', '.hero__title', '.hero__lead'], hr)
    ].filter(Boolean);
    document.documentElement.classList.toggle('hero-reserve', reserveGroups.length > 0);
    holdReserve();
  }

  /* Once a frame: follow the words if they have moved and fade with them.
     Nothing is drawn here - only a transform and an opacity, and only when
     they change - so a still page makes no writes at all. */
  function holdReserve() {
    if (!reserveGroups.length) return;
    var hr = hero.getBoundingClientRect();
    for (var i = 0; i < reserveGroups.length; i++) {
      var rg = reserveGroups[i];
      var ar = rg.anchor.getBoundingClientRect();
      var dx = (ar.left - hr.left) - rg.ax;
      var dy = (ar.top - hr.top) - rg.ay;
      var fade = parseFloat(rg.anchor.style.opacity);
      if (isNaN(fade)) fade = 1;

      var t = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      // the strengths are baked into the pixels; this only fades with the copy
      var o = Math.max(0, Math.min(1, fade)).toFixed(3);
      if (t !== rg.t) { rg.canvas.style.transform = t; rg.t = t; }
      if (o !== rg.o) { rg.canvas.style.opacity = o; rg.o = o; }
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

    /* ---- reveal ----
       A touch lifts more ground than a hover does. On a desktop the pointer
       is painting continuously, so 0.26 a dab compounds quickly; on a phone
       a tap is often the whole gesture, and one dab at 0.26 took a quarter
       of the ground off the very centre and less everywhere else - a broad,
       faint lift rather than paint going on. The ground also floods back
       nearly four times faster on touch, so a single tap was half undone
       before a second one arrived.

       It can be raised without the copy suffering because the type on a
       phone carries its own tight shadow rather than relying on the scrim,
       which is display:none there. */
    var lift = coarse ? 0.46 : 0.26;
    var satLift = coarse ? 0.30 : 0.17;
    gesso.globalCompositeOperation = 'destination-out';
    gesso.globalAlpha = 1;
    pool(gesso, x, y, R * 1.22, lift, null);
    for (i = 0; i < sats.length; i++) pool(gesso, sats[i][0], sats[i][1], sats[i][2] * 1.2, satLift, null);

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
    holdReserve();
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

    // and start fetching the one after, so it is there when its turn comes
    preloadArt(artIndex + 1);

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

    /* Only ever the next one. This used to fetch every painting in the pool
       once the page had settled, which was fine at five and is not at
       twenty-five: the whole pool was paid for on every visit whether a
       visitor uncovered two paintings or none.

       One ahead is enough. A swap only happens after the ground has dried
       back over the picture, which is tens of seconds of painting away, so
       there is always time for the next one to arrive. */
    window.addEventListener('load', function () {
      setTimeout(function () { preloadArt(artIndex + 1); }, 900);
    });
  }

  function preloadArt(n) {
    if (!artFrames.length) return;
    var img = artFrames[((n % artFrames.length) + artFrames.length) % artFrames.length];
    var src = img.getAttribute('data-src');
    if (src && !img.getAttribute('src')) img.setAttribute('src', src);
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

  /* The lines have to be measured where they finally sit: after the
     webfonts land, which rewraps the lead, and after the headline's words
     have finished rising in. */
  if (RESERVE) {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(bakeReserve);
    window.addEventListener('load', function () {
      setTimeout(bakeReserve, 900);
      setTimeout(bakeReserve, 2400);
    });
  }
})();
