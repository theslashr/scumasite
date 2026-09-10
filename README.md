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
assets/js/paint.js       the hero painting surface
assets/js/main.js        works grid, filters, lightbox, nav, reveals
assets/js/relief.js      the impasto viewer — light over a painting's surface
assets/js/collection.js  arc, rail and sheet; the thing that does the choosing
assets/js/bomboniere.js  the 126 small oils: their data, and one instantiation
assets/css/collection.css  styles for the above, all scoped under .coll
assets/img/              40 images pulled from the old site (~19 MB, w1600)
assets/img/bomb/         the bomboniere: 126 full (~32 MB) + 126 thumbs
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

## Bomboniere

A second collection inside **Opere**, brought over from the standalone
bomboniere prototype. Two ways of interacting with a painting now sit on the
same page and they are deliberately different: in the hero **you paint the
work**, here **you light it**.

The section is dark on purpose. The relief highlight is a small bright thing
on a dark surface, and on primed linen it has almost no contrast to spend —
the effect stops reading. So it commits to its own ground and becomes a room
you step into rather than more of the same wall.

### Three files, three jobs

- `relief.js` — the lighting. Give it a canvas; it takes image URLs.
- `collection.js` — the choosing. The arc, the rail, the sheet, the edition
  mark, and the wiring between them.
- `bomboniere.js` — the data. What these paintings are called and how big
  their thumbnails are, and one `new Collection({...})`.

Nothing about the 126 is baked into the first two, so a second collection is
a data file. The site's own works could become one; they have not, because
the bento grid is doing editorial work that a uniform sheet would undo.

### Where the relief comes from

There is no scanned normal map. It is recovered from each photograph on
load: blur the luminance by one pixel, subtract a wider blur of it, Sobel the
result into normals, and light them with Blinn-Phong. The wide blur removes
the composition, the one-pixel blur removes JPEG noise, and what survives is
the surface — canvas weave is roughly 2–4px at this size, so it comes through
and the noise does not.

That extraction is 400–900ms of arithmetic per painting, and it now runs in a
**worker**. On the standalone page it ran inline and hid under a fade; on a
page also running GSAP a stall that long is a visible hitch in whatever else
is moving. The worker is started from a Blob so there is no second file to
serve, and the same source doubles as the inline fallback — one copy of the
algorithm, whichever thread it lands on. Worker and inline output were
checked byte-for-byte identical across a full 4.35MB map.

Nothing starts until the section is near the viewport, on two triggers rather
than one: an IntersectionObserver, and a scroll check behind it. The observer
is the right tool, but its delivery rides the frame lifecycle, and a section
that silently never starts is a worse failure than one that starts early.

### What this cannot do

- **The photograph's own lighting is baked in.** Whatever lamp was in the
  room leaves a highlight that stays put while yours sweeps. It is additive,
  not a true relight.
- **Luminance is not height.** A dark stroke and a groove look alike to a
  band pass. In impasto the two mostly coincide, which is why this works at
  all, but hard colour edges read as ridges whether or not they are.
- **Dark paintings give weak relief.** Not enough luminance range in the
  shadows to recover a surface from; night scenes land near 5 RMS against 12
  for the brightest, and no setting fixes it.

### Numbering

Each is `NN / 126`, one of a kind, and the numbers are **not** the ones in the
original file names. Telegram exported the set in two batches and restarted
counting in each, so of 126 files there were only 95 distinct numbers, 31 of
them used twice, and the highest was 97 — nothing would ever have been
numbered 98 to 126. Calling a piece "11 / 126" on that basis would be a false
claim about a unique work. The files are `n001`–`n126`, so the file name *is*
the edition number and there is no table to keep in step.

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
