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
assets/js/main.js        card tilt, nav, reveals, GSAP choreography
assets/js/opere.js       the 14 selected works, as a collection
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

## Collections

**Opere** is a shelf of collections rather than a wall of paintings. There
are two — *Scuma production* (the 14 selected works) and *Bomboniere* (126
small oils) — and both are the same component with different data.

Three layers, and a visitor only pays for the one they are looking at:

```
a card on the home page  ->  collezione.html  ->  one painting, lit
```

The cards are plain `<a>` links to `collezione.html?c=opere` and
`?c=bomboniere`. **A collection is a page, not a panel**: it has a URL to
link and to share, the back button behaves, and no script has to run for the
links to work. The home page loads none of this code — no `relief.js`, no
`collection.js`, no data — and the only canvases in it are the hero's two.

Opening a card **animates into the grid** rather than swapping pages.
Cross-document view transitions need `@view-transition { navigation: auto; }`
on both documents — they are same-origin, which is the only place this
works. The card's cover carries a `view-transition-name`, and
`collezione.html` has a full-bleed ground element carrying the same one, so
the browser reshapes the card into the page instead of crossing the whole
screen over. That ground is in the markup with its name set by an inline
script in the body, because the browser looks for a match at the first
paint and the grid itself arrives a moment later.

Where view transitions are not supported the navigation is what it always
was, so there is nothing to maintain — except the plain CSS fade-in on
`collezione.html`, which runs everywhere and does not delay the navigation
the way a fade-out on click would.

`collezione.html` reads the `c=` parameter, looks the set up in
`window.COLLECTIONS`, and lands on the grid, because on that page the grid
*is* the collection. Picking from it builds the viewer, which is where WebGL
and the relief extraction finally happen.

The cards carry a name and nothing else. **Each one paints itself**: every
few seconds `cardreveal.js` lays the next work in the set over the one
showing, in spatula passes, the way the hero is revealed — only without
being asked. The hero is *you paint the work*; the card is the same language
with no hand on it.

Four things there are worth not undoing.

**The scatter is seeded per transition, not per frame.** The passes are runs
of dabs with their own offsets and moments, plus a few thrown ahead so the
leading edge is not an edge. Drawing that from `Math.random()` each frame
reshuffles the mask sixty times a second, which reads as static rather than
as paint.

**The passes are spread wide and run at a constant rate.** They were packed
into the first third of the sweep and each was eased, so their fast middles
landed on top of one another. Measured as coverage over time that gave:
nothing for the first fifth, five per cent to seventy-five between p=0.3 and
p=0.6, then a crawl to the end — and every worst frame sat inside that rush.
It read as chop, and slowing the sweep down would only have produced a
slower rush. Spread across 62% of the sweep and left linear, the overlapping
passes sum to an even rate; worst-frame coverage went from 4.7% to 1.7%,
against a median of 0.65%. The softness comes from `DAB_FADE` and the blur,
not from easing the passes — **do not re-add an ease there.**

**One blur, not two hundred.** Setting `ctx.filter` and then filling two
hundred ellipses asks for a blur pass per ellipse, per card, per frame — it
dropped frames and dragged the cursor with it. The dabs go into a scratch
canvas unblurred and the whole field is blurred once on its way into the
mask. A full paint costs about 0.5ms.

**Dabs land at full alpha, and the field closes to solid.** Partial-alpha
dabs never accumulate to opaque however many overlap, so the sweep used to
end on a blend of the two paintings — measured at 140 of 156 sample points
still wrong at the end. The last 14% closes with a fill.

**The closing fill is laid in again unblurred.** A blur has nothing to pull
in from beyond the canvas edge, so it thins the alpha there and a rim of the
old painting survived. That was the difference between a max channel error
of 35 and of 10 (mean 0.96) against the destination image.

The cards also take turns — the second is offset by half a cycle, so two
sweeps never run at once.

Covers are **full-size sources, not thumbnails**. A card is 400–650px wide
on a desktop and half again on a retina screen; the bomboniere thumbnails
are 220px, and at nearly three times their size they were visibly grainy.
There is no w800 derivative to reach for yet, so this pays in bytes for
sharpness — making one would get most of those bytes back, and is the
obvious next thing to do here.

The viewer is an overlay and it is dark. The relief highlight is a small
bright thing on a dark surface, and on primed linen it has almost no contrast
to spend, so the effect stops reading. Making it an overlay rather than a
band in the page means that shift happens on a click and reads as
intentional, instead of as a seam mid-scroll.

Two ways of handling a painting now sit on this site and they are
deliberately different: in the hero **you paint the work**, in a collection
**you light it**.

### Four files, four jobs

- `relief.js` — the lighting. Give it a canvas; it takes image URLs.
- `collection.js` — the choosing. The arc, the rail, the sheet, the edition
  mark, and the wiring between them.
- `bomboniere.js`, `opere.js` — the data. What each set is called and how
  big its thumbnails are, and one `new Collection({...})` apiece.

Nothing about any particular set is baked into the first two, so a third
collection is a data file and nothing else.

The bento grid of 14 tiles that used to sit here is gone, replaced by its
card. Its tilt is not: the collection cards carry the same `--mx`/`--my`
treatment, from the same delegated listener in `main.js`, so opening a
collection still feels like handling an object.

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

### Two things not to reintroduce

**Nothing that has to happen may wait on a frame.** Opening a panel used to
do its work inside `requestAnimationFrame` — the usual way to let a
transition see its starting value. But a frame callback only arrives when the
page is being painted, so anything that throttles rendering left the viewer
mounted, blank and never faded in. Reading `offsetHeight` forces the style to
settle synchronously, which is all the transition needed; the building
happens outside any callback. The arc lands on its painting by assignment
rather than by easing there, for the same reason and because opening
painting 41 should not spin through forty others to reach it.

**The overlay is `.coll.coll-view`, not `.coll-view`.** It wears both
classes, and at equal specificity source order decides, so a bare
`.coll-view` lost `position:fixed` to the `.coll` block below it and the
overlay laid itself out *in* the page rather than over it. Specificity rather
than ordering, so moving the blocks around cannot break it again.

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

Numbering is **opt-in per collection** (`numbered: true`), and only the
bomboniere have it. "07 / 126" under a picture is a claim that it is the
seventh of a hundred and twenty-six unique works — true of that set and of
nothing else here. The selected works are a *selection*, not an edition, so
they carry no badge on the grid and no edition mark in the viewer; numbering
them would be inventing a fact about them. The default is off, so a new
collection has to ask for numbers rather than get them by accident.


Each is `NN / 126`, one of a kind, and the numbers are **not** the ones in the
original file names. Telegram exported the set in two batches and restarted
counting in each, so of 126 files there were only 95 distinct numbers, 31 of
them used twice, and the highest was 97 — nothing would ever have been
numbered 98 to 126. Calling a piece "11 / 126" on that basis would be a false
claim about a unique work. The files are `n001`–`n126`, so the file name *is*
the edition number and there is no table to keep in step.

## Content

The prose and the collections live in `content/`, not in the markup. `build.py`
renders `index.html` from `src/index.html` plus that content, and generates
`assets/js/opere.js` and `assets/js/bomboniere.js` from the collection data.

```bash
py -3 build.py
```

```
content/frammenti.json      the timeline — 6 entries, ~950 words, most of the prose
content/progetti.json       4 project cards
content/gallerie.json       exhibitions and artist pages
content/contatti.json       email, phone, socials, studio address
content/sections.json       kicker / title / sub for each section
content/collections/*.json  the paintings in each collection
src/index.html              the template: structure, with <!--{{markers}}-->
```

**Nothing on the server runs this.** `index.html` and the generated JS are
committed, Cloudflare serves them as-is, and the build is not part of the
deploy. If this script is never run again the site keeps working exactly as
it does now — which is the point of doing it this way. The content became
editable without the deployment becoming something that can fail.

Run it after editing anything under `content/`, and commit both the JSON and
what it produced.

### How the split was made

Derived, not transcribed. Fifteen hundred words of someone's autobiography
retyped by hand is fifteen hundred chances to quietly change what he wrote,
so a one-shot script read the markup and wrote both sides from it. The check
that mattered was that a rebuild produced the committed `index.html`
**byte for byte** — which it does, across all eight regions.

That check earned its keep immediately: the first pass silently dropped a
`<p class="tl__lede">` because the extractor only matched bare `<p>`. Reading
the output would not have caught it; a diff did. If these renderers are ever
changed, keep a way to prove the output is unchanged.

The collections could not be byte-checked the same way, because their shape
changed — so they were verified against a snapshot of what the page actually
produced before the split: same 14 and 126 items, same ids, sizes and alt
text, same paths, same labels.

Structure stays in the template: the nav, the hero's canvas layers, the
lightbox, the footer. The line is *content that changes* versus *markup that
defines the design*. The bomboniere numbering is deliberately explicit data
now rather than a loop index — `n047` being the forty-seventh of 126 is a
claim about a unique object, and a claim should be visible.

## Il pannello — the admin at /admin

Antonio edits the site himself at `/admin`: paintings, exhibitions, the
Frammenti text, the projects, contacts and section headings. Add, edit,
reorder, delete. It is in Italian and never shows him a file, a field name
or a tag.

```
admin/           the tool (a page, a stylesheet, a script)
functions/api/   the only server-side code: login, load, save
.github/workflows/build.yml   regenerates the site after he saves
```

**How a save travels.** He presses *Salva e pubblica* → the Function commits
every changed file to `main` in **one commit** → the Action runs `build.py`
and commits the regenerated `index.html` → Cloudflare deploys. About two
minutes end to end.

One commit, not one per file: saving five files a call at a time can leave
the site half-updated if the fourth fails, so the save builds a git tree and
a single commit that either lands or does not.

### Setting it up

1. **A GitHub token.** Fine-grained, this repository only, **Contents: Read
   and write**. Nothing else. It never reaches the browser.
2. **Four secrets** in the Cloudflare Pages project (Settings → Environment
   variables, all four as *secrets*, Production):
   `ADMIN_PASSWORD` (what he types) · `SESSION_SECRET` (any long random
   string) · `GITHUB_TOKEN` · `GITHUB_REPO` (`theslashr/scumasite`).
3. Nothing else. Pages picks `functions/` up on its own.

Until those exist `/api/*` answers "Configurazione incompleta" and the
password is refused — it fails closed, so deploying this before setting them
up is harmless.

### What it refuses to do

**The bomboniere cannot be added to or removed from.** They are a closed
edition of 126 and the numbers are printed on work people already own; the
panel shows them, lets their descriptions be edited, and will not let anyone
change how many there are. A generic CMS would happily let him break that,
which is the main reason this one is not a generic CMS.

The Function also refuses to write anywhere except `content/**` and
`assets/img/**`, so nothing reachable from the panel can touch the code that
builds the site.

### Photographs

The browser does the resizing. The relief viewer needs a full-size picture to
recover the surface from and the grid needs a small one, and there is no
image tool on any machine here — but a canvas makes both from whatever comes
off his phone, which also stops a 6MB photo being committed as-is. Anything
under 1200px wide is refused with the reason, because below that the canvas
weave does not survive and the light stops working.

New paintings are named by the moment they arrived (`q20260911…`), so they
cannot collide with `img01`–`img54`.

### Card covers

The covers cycling on the collection cards are cut for that card and nothing
else: **1000x688**, the card's own 16:11, at the 911px the canvas actually
reaches (607 CSS px at the wrapper's max width, times the 1.5 DPR cap).

Getting there took two wrong turns worth recording. The thumbnails were far
too small — 220px drawn at three times that was the graininess. The
full-size originals were the opposite mistake: the card *crops* to 16:11, so
a portrait was shipping 1280px of height to draw 688 of it. **Capping the
width alone saved nothing for the portraits**, because they were already
under 1000px wide; cropping to the card's ratio first is what did it. 2.24MB
to 1.52MB, a third off the home page.

They were generated in a browser, since there is no image tooling on any
machine here — a canvas, then `tools/devserver.py`'s save route writing the
files. Same technique the panel uses for new paintings.

### The hero order

The paintings after the first are shuffled on every visit, so two people do
not uncover the same sequence. Only the order of the array changes, never the
DOM: which painting sits on top is decided by the z-index `nextArtwork`
assigns, so the markup stays exactly as it was rendered.

**The painting already showing keeps its place at the front.** It is the one
with a real `src` and `fetchpriority="high"`, and it is this page's largest
contentful paint — shuffling it would make load time vary by visit and could
never be previewed.

Bomboniere can go in the pool, but choose them by eye in the panel rather
than feeding all 126 in. The hero is a wide band and `object-fit: cover` on a
portrait source crops away the top and bottom, so a vertical painting shows
as a horizontal slice through its middle. The landscape ones survive it; most
do not. There is also a hard constraint against a large pool: `paint.js`
loads *every* hero image after the page settles, whether it is shown or not,
so the pool is paid for in full on each visit.

### Known gaps

- No preview before publishing. He sees the result on the live site about two
  minutes later, and every version is recoverable.
- One password for one person. If more than one person ever edits, this wants
  real accounts rather than a shared secret.
- Nothing is left that the panel cannot reach. The covers, the first screen,
  the projects, the collections, the text and the headings all come from
  `content/`.

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
