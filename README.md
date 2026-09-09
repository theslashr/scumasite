# Antonio Burgello — sito

Static site rebuilt from the Google Sites pages at
`sites.google.com/view/burgelloantonio`. No build step, no dependencies to
install — plain HTML, CSS and JS. GSAP is loaded from a CDN.

## Run it

```bash
py -3 -m http.server 8123
```

Then open <http://localhost:8123>. Any static host works (Netlify, Vercel,
GitHub Pages, Aruba…) — just upload the folder.

## Structure

```
index.html            all sections; anchors #opere #frammenti #progetti #gallerie #contatti
assets/css/style.css  design tokens at the top (:root) — colours, fonts, spacing
assets/js/paint.js    the hero painting surface
assets/js/main.js     works grid, filters, lightbox, nav, reveals
assets/img/           40 images pulled from the old site (~19 MB, w1600)
```

## The hero

Three stacked layers:

1. `.hero__art` — a painting, waiting.
2. **gesso canvas** — a toned ground (imprimatura). Brush strokes *erase* it,
   so the painting shows through where the visitor moves.
3. **paint canvas** — the pigment the brush leaves, multiplied over the top.

Both canvases slowly "dry back" (~15 s), so the surface keeps breathing. If
nobody moves for 2.6 s a brush wanders on its own, which is also what runs on
touch devices where there is no cursor.

Tuning lives at the top of `paint.js`: `GESSO_RGB` (the ground) and `PALETTE`
(the pigments). Stroke weight is in `dab()`; persistence is in `dryBack()`.

Swap the hero painting in `index.html` (`#heroArt`). A **wide, bright, high
chroma** painting works best — it has to fight its way out of a dark ground.

## Things to replace before this goes live

- **Work titles and techniques** in the `WORKS` array at the top of `main.js`
  are descriptive placeholders written from looking at each image. Replace
  them with the real titles, media and dimensions from the catalogue.
- **Email.** The old site linked `burgello.artist@gmail.com`; the murales
  poster shows `burgello.antonio@gmail.com`. The site currently uses the
  first. The phone number comes from that poster.
- **Gallery links.** "Museo Spazio Brizzolari" and "T-Affordable" are listed
  but not linked — the old page had no reachable URLs for them.
- **Catalogue PDF.** The old OPERE page offered "Collection Burgello 2025" as
  a download; the file was not retrievable, so no link is wired up yet.
- **Alt text** is written per image, but the artist should check the two
  aerial shots and the posters.

## Accessibility / robustness notes

- Reveals run on IntersectionObserver + CSS transitions, not on the animation
  loop, so content can never be stranded invisible if GSAP fails to load.
- GSAP only drives the extras (scroll parallax, marquee, magnetic buttons).
  Remove the two CDN `<script>` tags and the site still works.
- `prefers-reduced-motion` disables the custom cursor, the idle brush and all
  transitions.
- Lightbox is keyboard driven (Enter/Space to open, ←/→, Esc).
