/* ============================================================
   relief.js — the impasto viewer

   Light travelling over a painting's surface, recovered from the
   photograph rather than from a scanned height map. Lifted out of the
   bomboniere prototype so both collections on this site can use it.

   Relief(canvas) gives you an object with .show(src), .aim(event) and
   .dispose(). Everything else — which painting, what the page around it
   looks like — belongs to whoever is calling.

   What it cannot do is worth knowing before you use it. The photograph's
   own lighting is baked in, so whatever lamp was in the room leaves a
   highlight that stays put while yours sweeps: this is additive, not a
   true relight. And luminance is not height — a dark stroke and a groove
   look alike to a band pass. In impasto the two mostly coincide, which is
   why it works at all, but hard colour edges read as ridges whether or
   not they are.
   ============================================================ */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------
     The extraction, as source for a worker.

     This is the expensive half: 400-900ms for a 1280px photograph. On the
     standalone prototype it ran inline and hid under a fade. On this site
     the same page is running GSAP, so a main-thread stall of that length
     is a visible hitch in whatever else is moving — hence a worker.

     It is written as a string and started from a Blob so there is no
     second file to serve and no path to get wrong from a page at any
     depth. The cost is that it cannot close over anything here, which is
     why it is a pure ImageData-in, ImageData-out function.
     ------------------------------------------------------------------ */
  var WORKER_SRC = [
    'self.onmessage = function (e) {',
    '  var d = e.data, out = build(d.buf, d.w, d.h);',
    '  self.postMessage({ id: d.id, buf: out.buffer, w: d.w, h: d.h }, [out.buffer]);',
    '};',
    'function build(buf, w, h) {',
    '  var src = new Uint8ClampedArray(buf);',
    '  var n = w * h, i, x, y;',
    '  var lum = new Float32Array(n);',
    '  for (i = 0; i < n; i++) {',
    '    lum[i] = 0.299 * src[i*4] + 0.587 * src[i*4+1] + 0.114 * src[i*4+2];',
    '  }',
    /* Running-sum box blur: O(n) rather than O(n*r). The naive version was
       most of the load time on a 1280px photograph. */
    '  function box(sIn, r) {',
    '    var win = r*2+1, t = new Float32Array(n), res = new Float32Array(n), xx, yy, kk, run;',
    '    for (yy = 0; yy < h; yy++) {',
    '      var row = yy*w; run = 0;',
    '      for (kk = 0; kk <= r; kk++) run += sIn[row + Math.min(kk, w-1)];',
    '      for (xx = 0; xx < w; xx++) {',
    '        t[row+xx] = run / Math.min(win, w);',
    '        var a1 = xx+r+1, s1 = xx-r;',
    '        if (a1 < w) run += sIn[row+a1];',
    '        if (s1 >= 0) run -= sIn[row+s1];',
    '      }',
    '    }',
    '    for (xx = 0; xx < w; xx++) {',
    '      run = 0;',
    '      for (kk = 0; kk <= r; kk++) run += t[Math.min(kk, h-1)*w + xx];',
    '      for (yy = 0; yy < h; yy++) {',
    '        res[yy*w+xx] = run / Math.min(win, h);',
    '        var a2 = yy+r+1, s2 = yy-r;',
    '        if (a2 < h) run += t[a2*w+xx];',
    '        if (s2 >= 0) run -= t[s2*w+xx];',
    '      }',
    '    }',
    '    return res;',
    '  }',
    /* A band pass, not a high pass. Subtracting only the wide blur keeps
       every frequency above the cutoff, and at this size the top of that
       band is JPEG noise rather than canvas: it came through as red-green
       speckle in the map and as sparkle on the lit surface. The weave is
       roughly 2-4px here, so blurring by a single pixel first drops the
       noise and leaves the cloth. */
    '  var low = box(lum, 3), fine = box(lum, 1);',
    '  var hp = new Float32Array(n), NOISE = 0.8/255;',
    '  for (i = 0; i < n; i++) {',
    '    var d = (fine[i] - low[i]) / 255, m = Math.abs(d);',
    '    hp[i] = m < NOISE ? 0 : (d > 0 ? m - NOISE : -(m - NOISE));',
    '  }',
    '  function at(xx, yy) {',
    '    if (xx < 0) xx = 0; else if (xx >= w) xx = w-1;',
    '    if (yy < 0) yy = 0; else if (yy >= h) yy = h-1;',
    '    return hp[yy*w+xx];',
    '  }',
    /* Sobel the band-passed luminance into normals, packed into RGB. */
    '  var o2 = new Uint8ClampedArray(n*4);',
    '  for (y = 0; y < h; y++) {',
    '    for (x = 0; x < w; x++) {',
    '      var gx = (at(x+1,y-1) + 2*at(x+1,y) + at(x+1,y+1))',
    '             - (at(x-1,y-1) + 2*at(x-1,y) + at(x-1,y+1));',
    '      var gy = (at(x-1,y+1) + 2*at(x,y+1) + at(x+1,y+1))',
    '             - (at(x-1,y-1) + 2*at(x,y-1) + at(x+1,y-1));',
    '      var nx = -gx, ny = -gy, nz = 0.28;',
    '      var len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;',
    '      var p = (y*w + x) * 4;',
    '      o2[p]   = Math.round((nx/len * 0.5 + 0.5) * 255);',
    '      o2[p+1] = Math.round((ny/len * 0.5 + 0.5) * 255);',
    '      o2[p+2] = Math.round((nz/len * 0.5 + 0.5) * 255);',
    '      o2[p+3] = 255;',
    '    }',
    '  }',
    '  return o2;',
    '}'
  ].join('\n');

  var workerURL = null;
  function makeWorker() {
    if (!root.Worker || !root.Blob || !(root.URL && root.URL.createObjectURL)) return null;
    try {
      if (!workerURL) {
        workerURL = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      }
      return new Worker(workerURL);
    } catch (e) { return null; }
  }

  /* ---------------- shaders ---------------- */
  var VS = [
    'attribute vec2 a;',
    'varying vec2 v;',
    'void main(){ v = vec2(a.x, 1.0 - a.y); gl_Position = vec4(a * 2.0 - 1.0, 0.0, 1.0); }'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec2 v;',
    'uniform sampler2D uCol;',
    'uniform sampler2D uNrm;',
    'uniform vec3  uLight;',
    'uniform float uRelief;',
    'uniform float uGloss;',
    'uniform float uSpec;',
    'void main(){',
    '  vec3 base = texture2D(uCol, v).rgb;',
    '  vec3 nm = texture2D(uNrm, v).rgb;',
    '  vec3 N = normalize(vec3((nm.xy * 2.0 - 1.0) * uRelief, nm.z * 2.0 - 1.0));',
    '  vec3 L = normalize(uLight);',
    '  vec3 V = vec3(0.0, 0.0, 1.0);',
    '  vec3 H = normalize(L + V);',
    '  float ndl = max(dot(N, L), 0.0);',
    '  float spec = pow(max(dot(N, H), 0.0), uGloss) * uSpec;',
    '  vec2 lp = vec2(0.5) + uLight.xy * 0.42;',
    '  float sheen = smoothstep(0.85, 0.0, distance(v, lp)) * 0.10 * uSpec;',
    '  vec3 col = base * (0.90 + 0.22 * ndl) + vec3(spec) + vec3(sheen);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* Settled by eye across the whole set rather than on any one painting. A
     tight, dim highlight reads as thread catching light; a broad bright one
     reads as plastic. */
  var RELIEF = 3.2, GLOSS = 91.0, SPEC = 0.52;
  var MAXW = 1400;

  function Relief(canvas, opts) {
    if (!(this instanceof Relief)) return new Relief(canvas, opts);
    opts = opts || {};

    this.canvas = canvas;
    this.plate = opts.plate || canvas.parentNode;
    this.onerror = opts.onerror || function () {};
    this.onload = opts.onload || function () {};

    /* Each cached painting holds a normal-map canvas and its decoded
       source, about 8MB the pair. Unbounded that is a gigabyte across 126
       and a dead tab on a phone, so only the last few are kept. */
    this.cacheMax = opts.cacheMax || 6;
    this.cache = {};
    this.order = [];

    this.lx = 0.25; this.ly = 0.35;
    this.tlx = this.lx; this.tly = this.ly;
    this.tilt = 4.3;
    this.lightZ = 0.85;

    /* A phone shows the picture far smaller, so the same movement reads as
       far less of one. A fifth more makes up for it, and both halves have
       to take it or the plate swings further while the light carries on as
       before — which looks like tilting something and having nothing
       happen. tan(angle) = |xy| / z, so dividing z is exactly scaling x
       and y, and it leaves the clamp on the aim still meaning what it
       meant. */
    if (root.matchMedia && matchMedia('(hover: none)').matches) {
      var BOOST = 1.45;
      this.tilt *= BOOST;
      this.lightZ /= BOOST;
    }

    this.token = 0;        // guards against a slow load landing after a newer one
    this.jobId = 0;
    this.jobs = {};
    this.raf = 0;
    this.dead = false;
    this.current = null;

    var gl = canvas.getContext('webgl', { alpha: false, antialias: false })
          || canvas.getContext('experimental-webgl', { alpha: false, antialias: false });
    if (!gl) { this.gl = null; this.onerror('WebGL non disponibile in questo browser.'); return; }
    this.gl = gl;

    try { this._program(); } catch (e) { this.gl = null; this.onerror(String(e.message || e)); return; }

    this.worker = makeWorker();
    var self = this;
    if (this.worker) {
      this.worker.onmessage = function (e) {
        var job = self.jobs[e.data.id];
        delete self.jobs[e.data.id];
        if (job) job(e.data);
      };
      // a worker that dies takes the page down with it unless we fall back
      this.worker.onerror = function () { self.worker = null; };
    }
  }

  Relief.prototype._program = function () {
    var gl = this.gl;
    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1]), gl.STATIC_DRAW);
    var aLoc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    this.U = {
      light:  gl.getUniformLocation(prog, 'uLight'),
      relief: gl.getUniformLocation(prog, 'uRelief'),
      gloss:  gl.getUniformLocation(prog, 'uGloss'),
      spec:   gl.getUniformLocation(prog, 'uSpec')
    };
    gl.uniform1i(gl.getUniformLocation(prog, 'uCol'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'uNrm'), 1);
    this.texCol = gl.createTexture();
    this.texNrm = gl.createTexture();
  };

  Relief.prototype._upload = function (tex, unit, source) {
    var gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  };

  Relief.prototype._remember = function (key, nm) {
    this.cache[key] = nm;
    this.order.push(key);
    while (this.order.length > this.cacheMax) {
      var old = this.order.shift();
      if (old === key || !this.cache[old]) continue;
      // shrink the backing store as well as dropping the reference, or the
      // canvas memory can outlive the object for a while
      this.cache[old].canvas.width = this.cache[old].canvas.height = 1;
      delete this.cache[old];
    }
  };

  Relief.prototype._touch = function (key) {
    var at = this.order.indexOf(key);
    if (at !== -1) { this.order.splice(at, 1); this.order.push(key); }
  };

  /* Turn a decoded image into a normal map, in the worker when there is
     one and inline when there is not. The inline path is not a lesser
     result — it is the same arithmetic, just on the wrong thread. */
  Relief.prototype._extract = function (img, done) {
    var w = Math.min(img.naturalWidth, MAXW);
    var h = Math.round(img.naturalHeight * (w / img.naturalWidth));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    var srcData = ctx.getImageData(0, 0, w, h);

    var self = this;
    function finish(bytes) {
      var nc = document.createElement('canvas');
      nc.width = w; nc.height = h;
      var out = nc.getContext('2d').createImageData(w, h);
      out.data.set(bytes);
      nc.getContext('2d').putImageData(out, 0, 0);
      done({ canvas: nc, w: w, h: h });
    }

    if (this.worker) {
      var id = ++this.jobId;
      this.jobs[id] = function (msg) { finish(new Uint8ClampedArray(msg.buf)); };
      try {
        this.worker.postMessage({ id: id, buf: srcData.data.buffer, w: w, h: h },
                                [srcData.data.buffer]);
        return;
      } catch (e) {
        delete this.jobs[id];
        this.worker = null;
        // the transfer detached the buffer, so re-read before falling back
        srcData = ctx.getImageData(0, 0, w, h);
      }
    }
    setTimeout(function () { finish(inlineBuild(srcData.data, w, h)); }, 0);
  };

  /* The same function the worker runs, for browsers without one. Built by
     evaluating the worker source in a scope where postMessage is a
     collector, so there is exactly one copy of the algorithm. */
  var inlineBuild = (function () {
    var fn = null;
    return function (data, w, h) {
      if (!fn) {
        var scope = { onmessage: null, postMessage: null };
        /* jshint evil:true */
        fn = new Function('self', WORKER_SRC + '\nreturn build;')(scope);
      }
      return fn(data.buffer, w, h);
    };
  })();

  /* Show a painting. `key` is what the cache is keyed on; pass a stable id
     rather than the URL if the same picture can arrive by more than one
     path. */
  Relief.prototype.show = function (src, key) {
    if (!this.gl || this.dead) return;
    key = key || src;
    var self = this, token = ++this.token;

    if (this.cache[key]) {
      this._touch(key);
      this._apply(this.cache[key]);
      this.onload(key);
      return;
    }

    var img = new Image();
    img.decoding = 'async';
    img.onload = function () {
      if (token !== self.token || self.dead) return;   // a newer request won
      self._extract(img, function (nm) {
        if (token !== self.token || self.dead) return;
        nm.img = img;
        self._remember(key, nm);
        self._apply(nm);
        self.onload(key);
      });
    };
    img.onerror = function () {
      if (token !== self.token) return;
      self.onerror('Immagine non caricata: ' + src);
    };
    img.src = src;
  };

  Relief.prototype._apply = function (nm) {
    var gl = this.gl;
    this.canvas.width = nm.w;
    this.canvas.height = nm.h;
    this.canvas.style.aspectRatio = nm.w + ' / ' + nm.h;
    gl.viewport(0, 0, nm.w, nm.h);
    this._upload(this.texCol, 0, nm.img);
    this._upload(this.texNrm, 1, nm.canvas);
    gl.uniform1f(this.U.relief, RELIEF);
    gl.uniform1f(this.U.gloss, GLOSS);
    gl.uniform1f(this.U.spec, SPEC);
    this.current = nm;
    this.start();
  };

  /* The light is normalised to the picture, so edge to edge across it gives
     only +-1. The rest of the range used to come from the margin around the
     picture, which on a phone is zero: the plate fills its box, so the
     effect capped at 1.0 there against 1.2-1.4 on a desktop. The gain makes
     a drag across the picture itself cover the whole range, so it behaves
     the same however much room happens to surround it. */
  var AIM_GAIN = 1.4;

  Relief.prototype.aim = function (e) {
    var r = this.plate.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var nx = (((e.clientX - r.left) / r.width) * 2 - 1) * AIM_GAIN;
    var ny = (((e.clientY - r.top) / r.height) * 2 - 1) * AIM_GAIN;
    this.tlx = Math.max(-1.4, Math.min(1.4, nx));
    this.tly = Math.max(-1.4, Math.min(1.4, ny));
    this.start();
  };

  /* Real device tilt where the browser gives it without being asked. iOS
     needs a gesture to grant it and there is no control here to hang that
     on, so a finger on the picture is the fallback everywhere. */
  Relief.prototype.useDeviceTilt = function () {
    if (!root.DeviceOrientationEvent) return;
    if (typeof root.DeviceOrientationEvent.requestPermission === 'function') return;
    var self = this;
    this._tiltHandler = function (e) {
      if (e.gamma == null || e.beta == null) return;
      self.tlx = Math.max(-1.4, Math.min(1.4, e.gamma / 32));
      self.tly = Math.max(-1.4, Math.min(1.4, (e.beta - 45) / 32));
      self.start();
    };
    root.addEventListener('deviceorientation', this._tiltHandler);
  };

  Relief.prototype.start = function () {
    if (this.raf || this.dead || !this.gl) return;
    var self = this;
    this.raf = requestAnimationFrame(function f() {
      self.raf = 0;
      self._frame();
    });
  };

  Relief.prototype._frame = function () {
    if (this.dead || !this.gl || !this.current) return;
    var dx = this.tlx - this.lx, dy = this.tly - this.ly;
    this.lx += dx * 0.12;
    this.ly += dy * 0.12;
    this._draw();
    // keep going only while it is still moving, so an idle viewer costs nothing
    if (Math.abs(dx) > 0.0006 || Math.abs(dy) > 0.0006) this.start();
  };

  Relief.prototype._draw = function () {
    var gl = this.gl;
    gl.uniform3f(this.U.light, this.lx, this.ly, this.lightZ);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.plate.style.transform =
      'perspective(1100px) rotateY(' + (this.lx * this.tilt).toFixed(2) + 'deg)' +
      ' rotateX(' + (-this.ly * this.tilt).toFixed(2) + 'deg)';
  };

  /* Park the loop without tearing anything down. The viewer is an overlay
     that gets hidden and shown again, and a hidden overlay has no business
     holding a frame callback. */
  Relief.prototype.stop = function () {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  };

  Relief.prototype.dispose = function () {
    this.dead = true;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    if (this._tiltHandler) root.removeEventListener('deviceorientation', this._tiltHandler);
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    for (var k in this.cache) {
      if (this.cache[k]) this.cache[k].canvas.width = this.cache[k].canvas.height = 1;
    }
    this.cache = {}; this.order = [];
    var gl = this.gl;
    if (gl) {
      var ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
    this.gl = null;
  };

  root.Relief = Relief;
})(window);
