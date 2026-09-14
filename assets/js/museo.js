/* ============================================================
   museo.js — one wall, one lamp

   A prototype. The Opere Sparse hang in a single row along a dark wall and
   the visitor walks it, carrying the light. Everything on screen is one
   WebGL canvas, lit by one point lamp:

     the wall     plaster with a tiling surface map, the lamp's pool on it,
                  and the shadow each canvas throws, because the canvases
                  stand off the wall and the lamp is close
     a painting   its photograph and the surface map relief.js already
                  pulls out of it, so the brushwork catches the same lamp

   The labels are ordinary DOM text laid over the canvas, so they stay
   selectable and readable to a screen reader.

   What is assumed, because the data does not say:
     - every painting hangs at the same long side. There are no real
       dimensions in the collection, so true scale is not possible yet.
     - they hang on one centre line, the way a museum hangs a room at
       eye level.
   ============================================================ */
(function () {
  'use strict';

  var stage = document.getElementById('museo');
  var which = stage && stage.getAttribute('data-collection');
  var data = window.COLLECTIONS && window.COLLECTIONS[which];
  var canvas = document.getElementById('museoWall');
  if (!data || !stage || !canvas) return;

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var touch = matchMedia('(hover: none)').matches;

  var gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false })
        || canvas.getContext('experimental-webgl', { alpha: false });
  if (!gl) { document.documentElement.classList.add('museo-nogl'); return; }

  var items = data.items;
  var N = items.length;
  var S = (window.Relief && window.Relief.SETTINGS) || { relief: 3.2, gloss: 91, spec: 0.52 };

  /* How much of the viewer's relief a room takes, 0-1. The Bomboniere were
     photographed flat and evenly lit, so their surface maps are mostly
     brushwork. The Opere Sparse were not: glare, grain and the camera's own
     sharpening all come through the same filter as texture, and at full
     strength the lamp turns that into an embossed crust. The page says how
     much its collection can take. */
  var TAME = parseFloat(stage.getAttribute('data-relief'));
  if (isNaN(TAME)) TAME = 1;

  /* ---------------- the room ---------------- */
  var vw = 0, vh = 0, dpr = 1;
  var L = 0;          // long side of every painting, CSS px
  var GAP = 0;        // wall between two paintings
  var CY = 0;         // the centre line
  var DEPTH = 0;      // how far a canvas stands off the wall
  var LAMP_Z = 0;     // the lamp's distance from the wall
  var slots = [];     // per painting: { x (world centre), w, h }
  var LABEL_BESIDE = true;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = stage.clientWidth; vh = stage.clientHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);

    // big enough to see the brushwork, small enough to see the wall around it
    L = Math.round(Math.min(vh * 0.54, vw * 0.8));
    LABEL_BESIDE = vw >= 720;
    GAP = Math.round(LABEL_BESIDE ? Math.max(L * 0.62, 220) : Math.max(L * 0.34, 64));
    CY = Math.round(vh * (LABEL_BESIDE ? 0.47 : 0.44));
    DEPTH = L * 0.075;
    LAMP_Z = L * 0.95;

    var x = 0;
    slots = items.map(function (it) {
      var a = it.w / it.h, w, h;
      if (a >= 1) { w = L; h = L / a; } else { h = L; w = L * a; }
      var s = { x: x + w / 2, w: w, h: h };
      x += w + GAP;
      return s;
    });
  }

  function camFor(i) { return slots[i].x - vw / 2; }
  function nearest(c) {
    var mid = c + vw / 2, best = 0, bd = Infinity;
    for (var i = 0; i < N; i++) {
      var d = Math.abs(slots[i].x - mid);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* ---------------- shaders ---------------- */
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  /* Light is worked out in linear terms and brought back at the end, or the
     pool's falloff bands and its edge looks cut out. One lamp, the same in
     both shaders: inverse-square from its distance, a soft cone so the pool
     has an edge, and the warm colour of a halogen spot. */
  var LIGHT = [
    'uniform vec3  uLamp;',      // x, y on screen; z out from the wall
    'const vec3 LAMP = vec3(1.0, 0.90, 0.76);',
    'float lampAt(vec3 P, vec3 N, out vec3 Ld) {',
    '  vec3 Lv = uLamp - P;',
    '  float d2 = dot(Lv, Lv);',
    '  Ld = Lv / sqrt(d2);',
    '  float z = uLamp.z - P.z;',
    '  float fall = (z * z) / d2;',             // 1 straight under the lamp
    '  float cone = smoothstep(0.50, 0.92, Ld.z);',
    '  return fall * cone * 2.4;',
    '}',
    'vec3 toScreen(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }',
    'float dither(vec2 p) { return (fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0; }'
  ].join('\n');

  var VS_WALL = [
    'attribute vec2 a;',
    'void main(){ gl_Position = vec4(a * 2.0 - 1.0, 0.0, 1.0); }'
  ].join('\n');

  var FS_WALL = [
    'precision highp float;',
    'uniform vec2  uView;',       // CSS px
    'uniform float uDpr;',
    'uniform float uCam;',
    'uniform float uDepth;',
    'uniform float uLampR;',      // the lamp's own size, for the penumbra
    'uniform sampler2D uPlaster;',
    'uniform vec4  uRects[8];',   // x, y, w, h on screen
    'uniform int   uCount;',
    LIGHT,
    /* Soft coverage of a box: 1 inside, 0 beyond `soft` outside its edge. */
    'float box(vec2 p, vec4 r, float soft) {',
    '  vec2 c = r.xy + r.zw * 0.5;',
    '  vec2 q = abs(p - c) - r.zw * 0.5;',
    '  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);',
    '  return 1.0 - smoothstep(-soft, soft, d);',
    '}',
    'void main(){',
    '  vec2 p = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;',
    '  vec4 pl = texture2D(uPlaster, (p + vec2(uCam, 0.0)) / 420.0);',
    '  vec3 N = normalize(vec3((pl.xy * 2.0 - 1.0) * 0.20, 1.0));',
    /* a dark slate, the site ink let down with grey, with the plaster
       carrying a little of its own unevenness in the colour as well */
    '  vec3 albedo = vec3(0.034, 0.041, 0.052) * (0.93 + pl.b * 0.14);',
    '  vec3 Ld;',
    '  float I = lampAt(vec3(p, 0.0), N, Ld);',
    '  float ndl = max(dot(N, Ld), 0.0);',
    /* Each canvas stands uDepth off the wall, so its shadow is the canvas
       projected from the lamp onto the wall: the same box scaled about the
       point under the lamp, by z / (z - depth). Rather than scale the box,
       scale this pixel the other way and test it against the real one. The
       penumbra grows the same way a real one does, with the gap between
       the thing and the surface its shadow lands on. */
    '  float k = uLamp.z / max(uLamp.z - uDepth, 1.0);',
    '  float pen = uLampR * uDepth / max(uLamp.z - uDepth, 1.0) + 1.5;',
    '  float shadow = 0.0, ao = 0.0;',
    '  for (int i = 0; i < 8; i++) {',
    '    if (i >= uCount) break;',
    '    vec2 back = uLamp.xy + (p - uLamp.xy) / k;',
    '    shadow = max(shadow, box(back, uRects[i], pen));',
    // the room's own light is kept out of the gap behind a canvas too
    '    ao = max(ao, box(p, uRects[i], uDepth * 0.9));',
    '  }',
    '  vec3 amb = albedo * 0.16 * (1.0 - 0.55 * ao);',
    '  vec3 col = amb + albedo * LAMP * I * ndl * (1.0 - 0.92 * shadow);',
    '  gl_FragColor = vec4(toScreen(col) + dither(gl_FragCoord.xy), 1.0);',
    '}'
  ].join('\n');

  var VS_ART = [
    'attribute vec2 a;',
    'uniform vec2 uView;',
    'uniform vec4 uRect;',
    'varying vec2 v;',
    'varying vec2 p;',
    'void main(){',
    '  v = a;',
    '  p = uRect.xy + a * uRect.zw;',
    '  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* The painting takes the viewer's lighting - the same relief, gloss and
     highlight strength relief.js settled on - but from a lamp at a real
     position, so across a canvas the light rakes one way on the near side
     and the other way on the far one. */
  var FS_ART = [
    'precision highp float;',
    'varying vec2 v;',
    'varying vec2 p;',
    'uniform sampler2D uCol;',
    'uniform sampler2D uNrm;',
    'uniform float uHasN;',
    'uniform float uDepth;',
    'uniform float uRelief;',
    'uniform float uGloss;',
    'uniform float uSpec;',
    'uniform vec2  uPx;',          // one CSS px, in uv
    LIGHT,
    'void main(){',
    '  vec3 base = pow(texture2D(uCol, v).rgb, vec3(2.2));',
    '  vec3 nm = texture2D(uNrm, v).rgb;',
    '  vec3 N = mix(vec3(0.0, 0.0, 1.0),',
    '               normalize(vec3((nm.xy * 2.0 - 1.0) * uRelief, nm.z * 2.0 - 1.0)), uHasN);',
    '  vec3 Ld;',
    '  float I = lampAt(vec3(p, uDepth), N, Ld);',
    '  float ndl = max(dot(N, Ld), 0.0);',
    '  vec3 H = normalize(Ld + vec3(0.0, 0.0, 1.0));',
    '  float spec = pow(max(dot(N, H), 0.0), uGloss) * uSpec * uHasN;',
    /* the turn of the canvas over its stretcher: a pixel or two of the
       edge falls away from the light */
    '  vec2 e = min(v, 1.0 - v) / uPx;',
    '  float edge = smoothstep(0.0, 2.5, min(e.x, e.y));',
    '  vec3 col = base * (0.010 + LAMP * I * (0.55 + 0.45 * ndl)) + LAMP * spec * I * 0.35;',
    '  col *= 0.55 + 0.45 * edge;',
    '  gl_FragColor = vec4(toScreen(col) + dither(gl_FragCoord.xy), 1.0);',
    '}'
  ].join('\n');

  var wallProg, artProg;
  try {
    wallProg = program(VS_WALL, FS_WALL);
    artProg = program(VS_ART, FS_ART);
  } catch (e) {
    document.documentElement.classList.add('museo-nogl');
    if (window.console) console.error(e);
    return;
  }

  function uniforms(prog, names) {
    var u = {};
    names.forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });
    return u;
  }
  var UW = uniforms(wallProg, ['uView', 'uDpr', 'uCam', 'uDepth', 'uLampR', 'uPlaster', 'uRects', 'uCount', 'uLamp']);
  var UA = uniforms(artProg, ['uView', 'uRect', 'uCol', 'uNrm', 'uHasN', 'uDepth', 'uRelief', 'uGloss', 'uSpec', 'uPx', 'uLamp']);

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1]), gl.STATIC_DRAW);

  function bindQuad(prog) {
    var loc = gl.getAttribLocation(prog, 'a');
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function texture(source, repeat) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    var wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return t;
  }

  /* ---------------- plaster ---------------- */
  /* A tiling surface for the wall, made once: wrapped value noise over a
     few scales, turned into normals. Nothing downloaded, and a power of two
     so WebGL 1 will repeat it. The height rides along in blue for a trace
     of unevenness in the colour. */
  function plaster(size) {
    var h = new Float32Array(size * size);
    var seed = 1234567;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    [[4, 0.50], [16, 0.30], [64, 0.20], [128, 0.26], [256, 0.12]].forEach(function (oct) {
      var n = oct[0], amp = oct[1], cell = size / n, g = new Float32Array(n * n), i, x, y;
      for (i = 0; i < n * n; i++) g[i] = rnd();
      for (y = 0; y < size; y++) {
        var fy = y / cell, y0 = Math.floor(fy), ty = fy - y0;
        ty = ty * ty * (3 - 2 * ty);
        var r0 = (y0 % n) * n, r1 = ((y0 + 1) % n) * n;
        for (x = 0; x < size; x++) {
          var fx = x / cell, x0 = Math.floor(fx), tx = fx - x0;
          tx = tx * tx * (3 - 2 * tx);
          var c0 = x0 % n, c1 = (x0 + 1) % n;
          var a = g[r0 + c0] + (g[r0 + c1] - g[r0 + c0]) * tx;
          var b = g[r1 + c0] + (g[r1 + c1] - g[r1 + c0]) * tx;
          h[y * size + x] += (a + (b - a) * ty) * amp;
        }
      }
    });
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
    var STR = 6.0;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var l = h[y * size + (x + size - 1) % size], r = h[y * size + (x + 1) % size];
        var u = h[((y + size - 1) % size) * size + x], dn = h[((y + 1) % size) * size + x];
        var nx = (l - r) * STR, ny = (u - dn) * STR;
        var o = (y * size + x) * 4;
        d[o]     = Math.max(0, Math.min(255, (nx * 0.5 + 0.5) * 255));
        d[o + 1] = Math.max(0, Math.min(255, (ny * 0.5 + 0.5) * 255));
        // the height goes in blue rather than alpha: a canvas keeps its
        // pixels premultiplied, and a low alpha would wipe out the normal
        d[o + 2] = Math.max(0, Math.min(255, (h[y * size + x] - 0.35) * 255));
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  var plasterTex = texture(plaster(512), true);
  var flatNormal = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 1;
    var x = c.getContext('2d'); x.fillStyle = 'rgb(128,128,255)'; x.fillRect(0, 0, 1, 1);
    return texture(c, false);
  })();

  /* ---------------- paintings ---------------- */
  /* Each painting is first its thumbnail, then its full photograph with a
     surface map once the visitor is close. Only the ones near where they
     stand keep any of that on the graphics card - 126 full photographs and
     126 surface maps would not fit on a phone. */
  var KEEP = 5;        // paintings either side that stay loaded
  var FULL = 2;        // paintings either side that get the full treatment
  var art = [];        // per painting: { col, nrm, stage: 0 none, 1 thumb, 2 full, 3 mapped }
  for (var ai = 0; ai < N; ai++) art.push({ col: null, nrm: null, stage: 0, busy: false });

  // the colour texture no larger than the painting will ever be drawn
  function fitted(img, w) {
    // a page opened in a hidden tab can lay out at zero; never go below a
    // size that still reads, rather than upload a texture with no pixels
    var tw = Math.min(img.naturalWidth, Math.max(640, Math.ceil(w * dpr * 1.25)));
    var th = Math.round(img.naturalHeight * tw / img.naturalWidth);
    var c = document.createElement('canvas');
    c.width = tw; c.height = th;
    var x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, tw, th);
    return c;
  }

  function load(src, done) {
    var img = new Image();
    img.decoding = 'async';
    img.onload = function () { done(img); };
    img.onerror = function () { done(null); };
    img.src = src;
  }

  function release(i) {
    var a = art[i];
    if (a.col) gl.deleteTexture(a.col);
    if (a.nrm) gl.deleteTexture(a.nrm);
    a.col = a.nrm = null;
    a.stage = 0;
  }

  var extracting = false;
  function feed() {
    var here = nearest(cam);
    for (var i = 0; i < N; i++) {
      if (Math.abs(i - here) > KEEP && art[i].stage) release(i);
    }
    // thumbs for everything in reach, nearest first
    for (var k = 0; k <= KEEP; k++) {
      [here - k, here + k].forEach(function (j) {
        if (j < 0 || j >= N || art[j].stage || art[j].busy) return;
        art[j].busy = true;
        load(data.thumb(items[j].id), function (img) {
          var a = art[j];
          a.busy = false;
          if (!img || a.stage || Math.abs(j - nearest(cam)) > KEEP) return;
          a.col = texture(img, false);
          a.stage = 1;
          kick();
        });
      });
    }
    // then one full photograph and its surface map at a time, nearest first
    if (extracting) return;
    for (k = 0; k <= FULL; k++) {
      var list = k ? [here + k, here - k] : [here];
      for (var m = 0; m < list.length; m++) {
        var j = list[m];
        if (j < 0 || j >= N || art[j].stage !== 1) continue;
        upgrade(j);
        return;
      }
    }
  }

  function upgrade(j) {
    extracting = true;
    load(data.full(items[j].id), function (img) {
      var a = art[j];
      if (!img || a.stage !== 1) { extracting = false; feed(); return; }
      var col = texture(fitted(img, slots[j].w), false);
      gl.deleteTexture(a.col);
      a.col = col;
      a.stage = 2;
      kick();
      if (!window.Relief || !window.Relief.extract) { extracting = false; feed(); return; }
      window.Relief.extract(img, function (nm) {
        extracting = false;
        if (art[j].stage === 2) {
          art[j].nrm = texture(nm.canvas, false);
          art[j].stage = 3;
          reveal[j] = now();
          kick();
        }
        nm.canvas.width = nm.canvas.height = 1;
        feed();
      });
    });
  }
  var reveal = {};     // when a painting's surface arrived, to ease it in

  /* ---------------- walking and the lamp ---------------- */
  var cam = 0, vel = 0;               // world px, px per ms
  var seek = null;                    // a camera position being eased to
  var lamp = { x: 0, y: 0 }, lampT = { x: 0, y: 0 };
  var dragging = null;
  var lastInput = 0;

  function clampCam(c) { return Math.max(camFor(0), Math.min(camFor(N - 1), c)); }

  function goTo(i, instant) {
    i = Math.max(0, Math.min(N - 1, i));
    seek = camFor(i);
    vel = 0;
    if (instant || reduced) { cam = seek; seek = null; }
    kick();
  }

  function aimLamp(x, y) {
    lampT.x = x;
    // held a little above the finger, so the finger is not on the spot it lights
    lampT.y = y - (touch ? L * 0.18 : 0);
    kick();
  }

  function onInput() {
    lastInput = now();
    document.documentElement.classList.add('museo-used');
  }

  canvas.addEventListener('pointerdown', function (e) {
    onInput();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    dragging = { id: e.pointerId, x: e.clientX, t: now(), down: now(), moved: 0 };
    vel = 0; seek = null;
    aimLamp(e.clientX, e.clientY);
    stage.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse' || dragging) aimLamp(e.clientX, e.clientY);
    if (!dragging || e.pointerId !== dragging.id) return;
    var t = now(), dx = e.clientX - dragging.x, dt = Math.max(1, t - dragging.t);
    cam = clampCam(cam - dx);
    // a short running average, so one ragged event does not throw it
    vel = vel * 0.6 + (-dx / dt) * 0.4;
    dragging.x = e.clientX; dragging.t = t;
    dragging.moved += Math.abs(dx);
    kick();
  });

  // the painting under a point on screen, if there is one
  function paintingAt(x, y) {
    var wx = x + cam;
    for (var i = 0; i < N; i++) {
      var s = slots[i];
      if (Math.abs(wx - s.x) <= s.w / 2 && Math.abs(y - CY) <= s.h / 2) return i;
    }
    return -1;
  }
  function centred() { return seek != null ? nearest(seek) : nearest(cam); }

  /* The lamp is the cursor, so there is none over the wall - except over a
     neighbour, which can be clicked to walk to it. */
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || dragging) return;
    var i = paintingAt(e.clientX, e.clientY);
    canvas.style.cursor = (i !== -1 && i !== centred()) ? 'pointer' : '';
  });

  function endDrag(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    // a click or a tap, not a drag: on a painting either side, walk to it
    if (dragging.moved < 6 && now() - dragging.down < 500) {
      var hit = paintingAt(e.clientX, e.clientY);
      if (hit !== -1 && hit !== centred()) {
        dragging = null;
        stage.classList.remove('is-dragging');
        canvas.style.cursor = '';
        goTo(hit);
        return;
      }
    }
    // a finger that stopped before lifting should not be flung
    if (now() - dragging.t > 90) vel = 0;
    if (reduced) vel = 0;
    if (dragging.moved < 4) vel = 0;
    if (!vel) settle();
    dragging = null;
    stage.classList.remove('is-dragging');
    kick();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  var wheelTimer = 0;
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    onInput();
    var unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? vh : 1;
    // most mice only scroll vertically; walking is sideways either way
    var d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
    seek = null; vel = 0;
    cam = clampCam(cam + d);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(settle, 260);
    kick();
  }, { passive: false });

  addEventListener('keydown', function (e) {
    var here = seek != null ? nearest(seek) : nearest(cam);
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { goTo(here + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { goTo(here - 1); }
    else if (e.key === 'Home') { goTo(0); }
    else if (e.key === 'End') { goTo(N - 1); }
    else return;
    e.preventDefault();
    onInput();
    // the keyboard has no pointer, so the lamp comes to the painting
    lampT.x = vw / 2 - L * 0.28; lampT.y = CY - L * 0.42;
    kick();
  });

  // come to rest in front of a painting rather than between two
  function settle() { goTo(nearest(cam)); }

  /* ---------------- labels, rail, where you are ---------------- */
  var labelLayer = document.getElementById('museoLabels');
  var labels = {};
  /* No titles yet, so a painting is named by where it hangs - the order
     the collection has now, not a catalogue number. */
  function nameOf(i) { return 'Dipinto n. ' + (i + 1); }

  function labelFor(i) {
    if (labels[i]) return labels[i];
    var el = document.createElement('div');
    el.className = 'museo-label';
    el.innerHTML =
      '<p class="museo-label__artist">Antonio Burgello</p>' +
      '<p class="museo-label__title">' + nameOf(i) + '</p>' +
      (data.uniqLabel ? '<p class="museo-label__meta">' + data.uniqLabel + '</p>' : '') +
      // what the painting shows, for anyone who cannot see the wall
      (items[i].alt ? '<p class="sr-only">' + items[i].alt.replace(/</g, '&lt;') + '</p>' : '');
    labelLayer.appendChild(el);
    labels[i] = el;
    return el;
  }

  var rail = document.getElementById('museoRail');
  var railMark = document.getElementById('museoRailMark');
  var count = document.getElementById('museoCount');
  var live = document.getElementById('museoLive');
  var shown = -1;

  rail.addEventListener('pointerdown', function (e) {
    onInput();
    function to(ev) {
      var r = rail.getBoundingClientRect();
      var f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      goTo(Math.round(f * (N - 1)), true);
    }
    to(e);
    rail.setPointerCapture(e.pointerId);
    rail.onpointermove = to;
    rail.onpointerup = rail.onpointercancel = function () { rail.onpointermove = null; };
  });

  function where(i) {
    if (i === shown) return;
    shown = i;
    count.textContent = (i + 1) + ' / ' + N;
    railMark.style.left = (N > 1 ? i / (N - 1) * 100 : 0) + '%';
    rail.setAttribute('aria-valuenow', String(i + 1));
    rail.setAttribute('aria-valuetext', nameOf(i) + ', ' + (i + 1) + ' di ' + N);
    clearTimeout(where.t);
    where.t = setTimeout(function () {
      live.textContent = nameOf(shown) + ', ' + (shown + 1) + ' di ' + N;
      try { history.replaceState(null, '', '#' + items[shown].id); } catch (e) {}
    }, 600);
  }

  /* ---------------- the frame ---------------- */
  var raf = 0, last = 0;
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame(t) {
    raf = 0;
    var dt = last ? Math.min(64, t - last) : 16;
    last = t;
    var moving = step(dt);
    draw(t);
    if (moving) kick(); else last = 0;
  }

  function step(dt) {
    var moving = false;
    if (!dragging && vel) {
      cam = clampCam(cam + vel * dt);
      vel *= Math.exp(-dt / 330);
      if (cam === camFor(0) || cam === camFor(N - 1)) vel = 0;
      if (Math.abs(vel) < 0.08) { vel = 0; settle(); }
      moving = true;
    }
    if (seek != null && !dragging) {
      var d = seek - cam;
      cam += d * (1 - Math.exp(-dt / 140));
      if (Math.abs(d) < 0.3) { cam = seek; seek = null; } else moving = true;
    }
    var lx = lampT.x - lamp.x, ly = lampT.y - lamp.y;
    var ease = reduced ? 1 : 1 - Math.exp(-dt / (touch ? 60 : 90));
    lamp.x += lx * ease; lamp.y += ly * ease;
    if (Math.abs(lx) > 0.3 || Math.abs(ly) > 0.3) moving = true;
    for (var r in reveal) { if (now() - reveal[r] < 700) moving = true; else delete reveal[r]; }
    return moving;
  }

  function draw() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    feed();

    var lampZ = LAMP_Z;
    var visible = [];
    for (var i = 0; i < N; i++) {
      var s = slots[i];
      var x = s.x - cam - s.w / 2, y = CY - s.h / 2;
      // a shadow reaches a little past its canvas
      if (x + s.w < -L * 0.4 || x > vw + L * 0.4) continue;
      visible.push({ i: i, x: x, y: y, w: s.w, h: s.h });
    }

    // the wall
    gl.useProgram(wallProg);
    bindQuad(wallProg);
    gl.uniform2f(UW.uView, vw, vh);
    gl.uniform1f(UW.uDpr, canvas.width / vw);
    gl.uniform1f(UW.uCam, cam);
    gl.uniform1f(UW.uDepth, DEPTH);
    gl.uniform1f(UW.uLampR, L * 0.16);
    gl.uniform3f(UW.uLamp, lamp.x, lamp.y, lampZ);
    var rects = new Float32Array(32);
    visible.slice(0, 8).forEach(function (r, k) {
      rects[k * 4] = r.x; rects[k * 4 + 1] = r.y; rects[k * 4 + 2] = r.w; rects[k * 4 + 3] = r.h;
    });
    gl.uniform4fv(UW.uRects, rects);
    gl.uniform1i(UW.uCount, Math.min(8, visible.length));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, plasterTex);
    gl.uniform1i(UW.uPlaster, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // the paintings
    gl.useProgram(artProg);
    bindQuad(artProg);
    gl.uniform2f(UA.uView, vw, vh);
    gl.uniform1f(UA.uDepth, DEPTH);
    gl.uniform1f(UA.uRelief, S.relief * TAME);
    gl.uniform1f(UA.uGloss, S.gloss);
    gl.uniform1f(UA.uSpec, S.spec * TAME);
    gl.uniform3f(UA.uLamp, lamp.x, lamp.y, lampZ);
    gl.uniform1i(UA.uCol, 0);
    gl.uniform1i(UA.uNrm, 1);

    var seen = {};
    visible.forEach(function (r) {
      var a = art[r.i];
      seen[r.i] = true;
      placeLabel(r, lampZ);
      if (!a.col) return;
      gl.uniform4f(UA.uRect, r.x, r.y, r.w, r.h);
      gl.uniform2f(UA.uPx, 1 / r.w, 1 / r.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, a.col);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, a.nrm || flatNormal);
      var has = a.nrm ? 1 : 0;
      if (has && reveal[r.i]) has = Math.min(1, (now() - reveal[r.i]) / 700);
      gl.uniform1f(UA.uHasN, has);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });

    for (var key in labels) {
      if (!seen[key]) { labels[key].remove(); delete labels[key]; }
    }
    where(seek != null ? nearest(seek) : nearest(cam));
  }

  function placeLabel(r, lampZ) {
    var el = labelFor(r.i);
    var lx, ly;
    if (LABEL_BESIDE) { lx = r.x + r.w + Math.min(36, GAP * 0.14); ly = r.y + r.h; }
    else { lx = r.x; ly = r.y + r.h + 18; }
    el.classList.toggle('is-below', !LABEL_BESIDE);
    el.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px)';
    // lit the way the wall under it is lit, but never so dark it cannot be read
    var dx = lamp.x - (lx + 60), dy = lamp.y - ly;
    var d2 = dx * dx + dy * dy + lampZ * lampZ;
    var lit = Math.min(1, (lampZ * lampZ) / d2 * 1.4);
    el.style.opacity = (0.38 + 0.62 * lit).toFixed(2);
  }

  /* ---------------- start ---------------- */
  function resize() {
    var here = N ? nearest(cam) : 0;
    layout();
    cam = camFor(here); seek = null; vel = 0;
    kick();
  }
  addEventListener('resize', resize);

  layout();
  var start = 0;
  var hash = location.hash.slice(1);
  for (var hi = 0; hi < N; hi++) if (items[hi].id === hash) start = hi;
  cam = camFor(start);
  // before anyone moves it, the lamp is on the first painting, from above left
  lamp.x = lampT.x = vw / 2 - L * 0.28;
  lamp.y = lampT.y = CY - L * 0.42;
  rail.setAttribute('aria-valuemax', String(N));
  document.documentElement.classList.add('museo-ready');
  kick();

  // for checking the room by hand, where the browser holds back animation frames
  window.__museo = {
    frame: function (dt) { step(dt || 16); draw(); },
    lamp: function (x, y) { lamp.x = lampT.x = x; lamp.y = lampT.y = y; draw(); },
    go: function (i) { goTo(i, true); draw(); },
    art: art,
    tame: function (v) { TAME = v; draw(); },
    state: function () { return { cam: cam, lamp: lamp, L: L, CY: CY, vw: vw, vh: vh, slots: slots }; }
  };
})();
