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
     7. MARQUEE
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
     8. TEXT SPLITTING + REVEALS
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
     9. FEED TABS
     Only one embed is shown at a time; the handle beside the tabs
     follows whichever is active.
     ============================================================ */
  var HANDLES = {
    ig: ['https://www.instagram.com/burgello_artist/', '@burgello_artist'],
    tt: ['https://www.tiktok.com/@scuma_art', '@scuma_art']
  };
  $$('.feed__tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var want = tab.dataset.pane;
      $$('.feed__tab').forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      $$('.feed__pane').forEach(function (pane) {
        pane.hidden = pane.id !== (want === 'ig' ? 'paneIg' : 'paneTt');
      });
      var h = $('#feedHandle');
      if (h && HANDLES[want]) {
        h.setAttribute('href', HANDLES[want][0]);
        h.innerHTML = HANDLES[want][1] + '<i aria-hidden="true">&#8594;</i>';
      }
    });
  });

  /* ============================================================
     10. TIKTOK
     Only loaded if the embed is actually on the page.
     ============================================================ */
  if ($('.tiktok-embed')) {
    var tk = document.createElement('script');
    tk.async = true;
    tk.src = 'https://www.tiktok.com/embed.js';
    document.body.appendChild(tk);
  }

  /* ============================================================
     11. MISC
     ============================================================ */
  $('#year').textContent = new Date().getFullYear();

  window.addEventListener('load', function () {
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });

})();
