/* ============================================================
   main.js — grid, lightbox, navigation and GSAP choreography
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine    = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hasGSAP = typeof window.gsap !== 'undefined';

  if (hasGSAP && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ============================================================
     1. WORKS
     The original site never titled the individual paintings, so nothing
     here names them. `alt` only describes what is visible, for screen
     readers. Real titles, techniques and dimensions should come from
     Antonio's catalogue.
     ============================================================ */
  var WORKS = [
    { f:'img10', alt:'Veduta di un golfo, con il vulcano sullo sfondo, le barche e i palazzi sul porto', s:'tile--wide' },
    { f:'logo',  alt:'Mongolfiera variopinta che sale in un cielo azzurro',                              s:'tile--tall' },
    { f:'img02', alt:'Veduta notturna di un fiume, con la torre illuminata e dei papaveri in primo piano', s:'tile--tall' },
    { f:'img19', alt:'Vicolo notturno con una lanterna accesa sui muri ocra',                            s:'tile--tall' },
    { f:'img42', alt:'Piazza con una palma, una fontana e una figura con l’ombrello',                     s:'tile--tall' },
    { f:'img54', alt:'Panorama con un sentiero fra i girasoli che scende verso il mare',                  s:'tile--full' },
    { f:'img16', alt:'Cortile con un ponte e una casa, due figure sedute su una panchina',                s:'tile--wide' },
    { f:'img13', alt:'Bosco notturno sotto un cielo viola e rosa',                                        s:'' },
    { f:'img08', alt:'Natura morta con giradischi, clessidra, libri e una tazzina di caffè',              s:'tile--big' },
    { f:'img18', alt:'Piazza con fontana e la statua di un danzatore',                                    s:'tile--tall' },
    { f:'img11', alt:'Sentiero nel bosco attraversato dalla luce',                                        s:'tile--wide' },
    { f:'img37', alt:'Campo di papaveri rossi con le colline sullo sfondo',                               s:'' },
    { f:'img48', alt:'Dettaglio dei libri dipinti nella natura morta',                                    s:'' },
    { f:'img28', alt:'Dettaglio della clessidra nella natura morta',                                      s:'' }
  ];

  /* Images normally come off disk, but a self-contained build can inline them
     and hand them over through window.__IMG instead. */
  function imgSrc(name) {
    return (window.__IMG && window.__IMG[name]) || ('assets/img/' + name + '.jpg');
  }

  /* Intrinsic sizes, so the grid reserves the right box before an image
     arrives and nothing shifts as they load. */
  var DIMS = {
    img10:[1100,649], logo:[1043,1468], img02:[1080,1440], img19:[1080,1440],
    img42:[1080,1200], img54:[1100,558], img16:[1100,904],  img13:[1100,1100],
    img08:[720,720],   img18:[1100,1497], img11:[559,397],  img37:[1080,851],
    img48:[720,720],   img28:[720,720]
  };

  // skipped when the images are inlined — a data URI has no second size
  function imgAttrs(name) {
    var d = DIMS[name];
    var out = d ? ' width="' + d[0] + '" height="' + d[1] + '"' : '';
    if (!window.__IMG && d) {
      out += ' srcset="assets/img/sm/' + name + '.jpg 550w, assets/img/' + name + '.jpg ' + d[0] + 'w"' +
             ' sizes="(max-width:900px) 50vw, 33vw"';
    }
    return out;
  }

  var grid = $('#worksGrid');
  if (grid) {
    grid.innerHTML = WORKS.map(function (w, i) {
      return '<figure class="tile ' + w.s + '" data-i="' + i + '" data-reveal style="--i:' + (i % 5) + '" tabindex="0" role="button" aria-label="Ingrandisci: ' + w.alt + '">' +
               '<img src="' + imgSrc(w.f) + '" alt="' + w.alt + '" loading="lazy" decoding="async"' + imgAttrs(w.f) + '>' +
             '</figure>';
    }).join('');
  }

  /* ============================================================
     2. LIGHTBOX
     ============================================================ */
  var lb = $('#lightbox'), lbImg = $('#lbImg');
  var lbIndex = 0, lastFocus = null;

  function openLB(i) {
    lbIndex = (i + WORKS.length) % WORKS.length;
    var w = WORKS[lbIndex];
    lbImg.src = imgSrc(w.f);
    lbImg.alt = w.alt;

    lastFocus = document.activeElement;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#lbClose').focus();

    if (hasGSAP && !reduced) {
      gsap.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: .3, ease: 'power2.out' });
      gsap.fromTo(lbImg, { scale: .94, opacity: 0 }, { scale: 1, opacity: 1, duration: .55, ease: 'power3.out' });
    }
  }

  function closeLB() {
    lb.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  if (grid) {
    grid.addEventListener('click', function (e) {
      var tile = e.target.closest('.tile');
      if (tile) openLB(+tile.dataset.i);
    });
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var tile = e.target.closest('.tile');
      if (tile) { e.preventDefault(); openLB(+tile.dataset.i); }
    });
  }

  if (lb) {
    $('#lbClose').addEventListener('click', closeLB);
    $('#lbPrev').addEventListener('click', function () { openLB(lbIndex - 1); });
    $('#lbNext').addEventListener('click', function () { openLB(lbIndex + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLB(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape')     closeLB();
      if (e.key === 'ArrowLeft')  openLB(lbIndex - 1);
      if (e.key === 'ArrowRight') openLB(lbIndex + 1);
    });
  }

  /* ============================================================
     3. NAV
     ============================================================ */
  var nav = $('#nav');
  var onScroll = function () {
    nav.classList.toggle('is-stuck', window.scrollY > window.innerHeight * 0.72);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var toggle = $('#navToggle'), menu = $('#mobileMenu');
  toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    if (open) {
      if (hasGSAP && !reduced) {
        gsap.to(menu, { opacity: 0, duration: .25, onComplete: function () { menu.hidden = true; } });
      } else { menu.hidden = true; }
      document.body.style.overflow = '';
    } else {
      menu.hidden = false;
      document.body.style.overflow = 'hidden';
      if (hasGSAP && !reduced) {
        gsap.fromTo(menu, { opacity: 0 }, { opacity: 1, duration: .28 });
        gsap.fromTo($$('a', menu), { y: 26, opacity: 0 },
          { y: 0, opacity: 1, duration: .5, stagger: .06, ease: 'power3.out', delay: .06 });
      } else {
        $$('a', menu).forEach(function (a) { a.style.opacity = 1; });
      }
    }
  });
  $$('a', menu).forEach(function (a) {
    a.addEventListener('click', function () {
      toggle.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
      document.body.style.overflow = '';
    });
  });

  /* ============================================================
     4. CUSTOM CURSOR
     ============================================================ */
  if (fine && !reduced) {
    document.body.classList.add('has-cursor');
    var cur = $('#brushCursor');
    var cx = window.innerWidth / 2, cy = window.innerHeight / 2, tx = cx, ty = cy;

    window.addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function loop() {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      cur.style.transform = 'translate(' + cx + 'px,' + cy + 'px) translate(-50%,-50%)';
      requestAnimationFrame(loop);
    })();

    $$('a, button, .tile').forEach(function (el) {
      el.addEventListener('pointerenter', function () { gsapSafe(cur, { scale: 1.7, duration: .3 }); });
      el.addEventListener('pointerleave', function () { gsapSafe(cur, { scale: 1,   duration: .3 }); });
    });
  }
  function gsapSafe(el, vars) { if (hasGSAP) gsap.to(el.querySelector('svg'), vars); }

  /* ============================================================
     5. MARQUEE
     ============================================================ */
  var track = $('#marqueeTrack');
  if (track) {
    var words = ['Pittura', 'Murales', 'Porte d’Artista', 'Cromie nei Borghi', 'Scuma Lab', 'Workshop', 'Estemporanee'];
    var unit = words.map(function (w) { return '<span>' + w + '<i></i></span>'; }).join('');
    track.innerHTML = unit + unit;
    if (hasGSAP && !reduced) {
      gsap.to(track, { xPercent: -50, duration: 34, ease: 'none', repeat: -1 });
    }
  }

  /* ============================================================
     6. TEXT SPLITTING + REVEALS
     ============================================================ */
  function splitWords(el) {
    var words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(function (w, i) {
      return '<span class="word"><span style="--i:' + i + '">' + w + '</span></span>';
    }).join(' ');
  }

  $$('[data-split]').forEach(splitWords);

  /* Reveals run on IntersectionObserver + CSS transitions. GSAP is kept for
     the scrubbed and looping flourishes only, so if it never loads the page
     still reads perfectly. */
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }) : null;

  var revealables = $$('[data-reveal],[data-split]');
  if (io) {
    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('in'); });
  }

  // hero copy + hero headline don't wait for a scroll
  requestAnimationFrame(function () {
    document.body.classList.add('ready');
    $$('.hero [data-split]').forEach(function (el) { el.classList.add('in'); });
  });
  // belt and braces: if rAF is throttled (background tab), still show the hero
  setTimeout(function () {
    document.body.classList.add('ready');
    $$('.hero [data-split]').forEach(function (el) { el.classList.add('in'); });
  }, 400);

  if (hasGSAP && !reduced) {

    // hero artwork drifts as you leave (the whole stack, not one frame).
    // No scale: growing a full-bleed image while two blurred canvases sit
    // over it is the expensive part of this scroll, and it wasn't earning it.
    gsap.to('.hero__art', {
      yPercent: 8, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
    });
    /* Clears by half the hero, so the copy is gone early instead of hanging
       on until the next section. scrub takes a number rather than true: it
       eases toward the scroll position over 0.6s instead of snapping to it,
       which is what made the short fade feel steppy. */
    gsap.to('.hero__inner', {
      yPercent: 24, opacity: 0, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: '50% top', scrub: 0.6 }
    });

    $$('[data-parallax]').forEach(function (el) {
      gsap.fromTo(el.querySelector('img') || el,
        { yPercent: -5 }, {
          yPercent: 5, ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true }
        });
    });

  }

  /* ============================================================
     7. FRAMMENTI STICKY MEDIA
     The entries scroll past a picture that holds still and crossfades as
     each one takes its turn. Built from the inline figures, so the images
     are the same files already in the markup and cost no extra requests,
     and if this never runs the figures simply stay where they are.
     ============================================================ */
  var frag = $('.frag'), media = $('.tl-media');
  var wide = window.matchMedia('(min-width:901px)');

  if (frag && media && 'IntersectionObserver' in window && wide.matches) {
    var entries = $$('.tl', frag);
    var shots = entries.map(function (li) { return $('.tl__fig img', li); });

    if (shots.every(Boolean)) {
      shots.forEach(function (src, i) {
        var img = document.createElement('img');
        img.src = src.currentSrc || src.src;
        img.alt = '';
        img.decoding = 'async';
        if (i === 0) img.className = 'is-current';
        media.appendChild(img);
      });
      frag.classList.add('has-sticky');

      var frames = $$('img', media);
      var show = function (i) {
        frames.forEach(function (f, j) { f.classList.toggle('is-current', j === i); });
      };

      /* An entry takes over once it reaches the middle of the screen. Long
         entries can straddle that band together, so rather than trusting
         whichever callback lands last, pick the one sitting nearest the
         centre - that stays right whichever direction you scroll. */
      var live = [];
      var watcher = new IntersectionObserver(function (obs) {
        obs.forEach(function (o) {
          var i = entries.indexOf(o.target);
          var at = live.indexOf(i);
          if (o.isIntersecting && at === -1) live.push(i);
          else if (!o.isIntersecting && at !== -1) live.splice(at, 1);
        });
        if (!live.length) return;
        var mid = window.innerHeight / 2, best = live[0], dist = Infinity;
        live.forEach(function (i) {
          var r = entries[i].getBoundingClientRect();
          var d = Math.abs((r.top + r.bottom) / 2 - mid);
          if (d < dist) { dist = d; best = i; }
        });
        show(best);
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

      entries.forEach(function (li) { watcher.observe(li); });
    }
  }

  /* ============================================================
     8. GALLERY PEEK
     Hovering a gallery link floats one of his paintings beside the cursor.
     Pointer-driven only: touch just follows the link.
     ============================================================ */
  var peek = $('#peek'), peekImg = $('#peekImg');
  if (peek && fine && !reduced) {
    var px = 0, py = 0, shown = false;

    $$('[data-peek]').forEach(function (link) {
      link.addEventListener('pointerenter', function () {
        peekImg.src = imgSrc(link.dataset.peek);
        peek.classList.add('is-on');
        shown = true;
      });
      link.addEventListener('pointerleave', function () {
        peek.classList.remove('is-on');
        shown = false;
      });
    });

    // eased follow, so it trails the cursor rather than snapping to it
    window.addEventListener('pointermove', function (e) { px = e.clientX; py = e.clientY; }, { passive: true });
    var cx = 0, cy = 0;
    (function drift() {
      if (shown) {
        cx += (px + 150 - cx) * 0.12;
        cy += (py - cy) * 0.12;
        // left/top, not transform: the CSS transform carries the centring and
        // the scale-in, and writing it here every frame would wipe both
        peek.style.left = Math.round(cx) + 'px';
        peek.style.top  = Math.round(cy) + 'px';
      } else {
        cx = px + 150; cy = py;
      }
      requestAnimationFrame(drift);
    })();
  }

  /* ============================================================
     9. MISC
     ============================================================ */
  $('#year').textContent = new Date().getFullYear();

  window.addEventListener('load', function () {
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });

})();
