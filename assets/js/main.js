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
     Titles and techniques are descriptive placeholders — swap them
     for the real ones from the catalogue.
     ============================================================ */
  var WORKS = [
    { f:'img10', t:'Il golfo',                    m:'Olio su tela',            c:'paesaggi',        s:'tile--wide' },
    { f:'logo',  t:'Di tutto un viaggio',         m:'Olio a spatola su tela',  c:'paesaggi',        s:'tile--tall' },
    { f:'img02', t:'Sera sulla Senna',            m:'Olio a spatola su tela',  c:'citta notturni',  s:'tile--tall' },
    { f:'img19', t:'Vicolo con lanterna',         m:'Olio a spatola su tela',  c:'citta notturni',  s:'tile--tall' },
    { f:'img42', t:'La piazza e la palma',        m:'Olio a spatola su tela',  c:'citta',           s:'tile--tall' },
    { f:'img54', t:'Il sentiero dei girasoli',    m:'Olio su tela',            c:'paesaggi',        s:'tile--full' },
    { f:'img16', t:'Il ponte',                    m:'Olio su tela',            c:'paesaggi',        s:'tile--wide' },
    { f:'img13', t:'Notturno viola',              m:'Acrilico su tela',        c:'notturni',        s:'' },
    { f:'img08', t:'Il tempo che suona',          m:'Olio a spatola su tela',  c:'materia',         s:'tile--big' },
    { f:'img18', t:'La fontana del danzatore',    m:'Olio a spatola su tela',  c:'citta',           s:'tile--tall' },
    { f:'img11', t:'Luce nel bosco',              m:'Acrilico su tela',        c:'paesaggi',        s:'tile--wide' },
    { f:'img37', t:'Campo di papaveri',           m:'Acrilico su tela',        c:'paesaggi',        s:'' },
    { f:'img48', t:'Il tempo che suona · dettaglio', m:'Olio a spatola',       c:'materia',         s:'' },
    { f:'img28', t:'La clessidra · dettaglio',    m:'Olio a spatola',          c:'materia',         s:'' }
  ];

  /* Images normally come off disk, but a self-contained build can inline them
     and hand them over through window.__IMG instead. */
  function imgSrc(name) {
    return (window.__IMG && window.__IMG[name]) || ('assets/img/' + name + '.jpg');
  }

  var grid = $('#worksGrid');
  if (grid) {
    grid.innerHTML = WORKS.map(function (w, i) {
      return '<figure class="tile ' + w.s + '" data-cat="' + w.c + '" data-i="' + i + '" data-reveal style="--i:' + (i % 5) + '" tabindex="0" role="button" aria-label="Apri: ' + w.t + '">' +
               '<img src="' + imgSrc(w.f) + '" alt="' + w.t + ' — ' + w.m + '" loading="lazy" decoding="async">' +
               '<span class="tile__veil"></span>' +
               '<figcaption class="tile__cap"><h3>' + w.t + '</h3><p>' + w.m + '</p></figcaption>' +
             '</figure>';
    }).join('');
  }

  /* ---------- filters ---------- */
  $$('.filter').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.dataset.filter;
      $$('.filter').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      $$('.tile').forEach(function (tile) {
        var show = f === 'all' || tile.dataset.cat.indexOf(f) !== -1;
        tile.classList.toggle('is-hidden', !show);
      });
      // make sure anything revealed by the filter is marked visible
      $$('.tile:not(.is-hidden)').forEach(function (t) { t.classList.add('in'); });
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    });
  });

  /* ============================================================
     2. LIGHTBOX
     ============================================================ */
  var lb = $('#lightbox'), lbImg = $('#lbImg'), lbTitle = $('#lbTitle'), lbMeta = $('#lbMeta');
  var lbIndex = 0, lastFocus = null;

  function openLB(i) {
    lbIndex = (i + WORKS.length) % WORKS.length;
    var w = WORKS[lbIndex];
    lbImg.src = imgSrc(w.f);
    lbImg.alt = w.t + ' — ' + w.m;
    lbTitle.textContent = w.t;
    lbMeta.textContent  = w.m;

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

    // hero artwork drifts as you leave (the whole stack, not one frame)
    gsap.to('.hero__art', {
      yPercent: 12, scale: 1.14, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
    gsap.to('.hero__inner', {
      yPercent: 26, opacity: 0, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
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
     9. MISC
     ============================================================ */
  $('#year').textContent = new Date().getFullYear();

  window.addEventListener('load', function () {
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });

})();
