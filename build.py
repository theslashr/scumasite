# -*- coding: utf-8 -*-
"""
build.py — render index.html from src/index.html + content/*.json

    py -3 build.py

The site is still a static file that Cloudflare serves as-is. This does not
run on deploy and nothing on the server depends on it: index.html is
committed, so if this script is never run again the site keeps working
exactly as it does today. That is the point of building it this way - the
content is editable without the deployment becoming something that can
fail.

Run it after editing anything under content/, and commit both the JSON and
the regenerated index.html.
"""
import io, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))

def rd(p):
    return io.open(os.path.join(ROOT, p), encoding='utf-8', newline='').read()

def rj(p):
    return json.loads(rd(p))

def wr(p, s):
    io.open(os.path.join(ROOT, p), 'w', encoding='utf-8', newline='').write(s)

def texts(seq):
    """Paragraphs with something in them.

       The admin lets a paragraph be added and left blank - mid-thought, or
       deleted by emptying it - and a blank one used to reach the page as
       <p></p>, which is a visible gap nobody asked for. Filtering here
       rather than forbidding it there: he should not have to tidy up after
       himself for the page to be right."""
    return [t for t in (seq or []) if str(t).strip()]

def img_tag(im, indent):
    """An <img> with its attributes in the order the markup has always used,
       so a rebuild is a no-op rather than a diff."""
    out = '<img src="%s" alt="%s" loading="lazy" decoding="async"' % (im['src'], im['alt'])
    for k in ('width', 'height', 'srcset', 'sizes'):
        if im.get(k):
            out += ' %s="%s"' % (k, im[k])
    return out + '>'

# ---------------------------------------------------------------- regions
def frammenti():
    out = []
    for e in rj('content/frammenti.json'):
        b = []
        # The marker already sits at the right indent, so the opening line of
        # the first item carries none of its own.
        b.append(('      ' if out else '') + '<li class="tl" data-reveal>')
        b.append('        <div class="tl__rail" aria-hidden="true"></div>')
        b.append('        <span class="tl__dot" aria-hidden="true"></span>')
        b.append('        <div class="tl__body">')
        b.append('          <p class="tl__year">%s</p>' % e['year'])
        b.append('          <h3>%s</h3>' % e['title'])
        if e.get('lede'):
            b.append('          <p class="tl__lede">%s</p>' % e['lede'])
        for p in texts(e['paras']):
            b.append('          <p>%s</p>' % p)
        if e.get('meta'):
            b.append('          <p class="tl__meta">%s</p>' % e['meta'])
        if e.get('image'):
            b.append('          <figure class="tl__fig">')
            b.append('            ' + img_tag(e['image'], 12))
            b.append('          </figure>')
        b.append('        </div>')
        b.append('      </li>')
        out.append('\n'.join(b))
    return '\n\n'.join(out)

def progetti():
    out = []
    for c in rj('content/progetti.json'):
        b = []
        b.append(('      ' if out else '') + '<article class="card" data-reveal>')
        b.append('        <div class="card__media">%s</div>' % img_tag(c['image'], 0))
        b.append('        <div class="card__body">')
        b.append('          <p class="card__tag">%s</p>' % c['tag'])
        b.append('          <h3>%s</h3>' % c['title'])
        for p in texts(c['paras']):
            b.append('          <p>%s</p>' % p)
        b.append('        </div>')
        b.append('      </article>')
        out.append('\n'.join(b))
    return '\n\n'.join(out)

def gallerie():
    g = rj('content/gallerie.json')
    b = ['<article class="gal__feature" data-reveal>',
         '        ' + img_tag(g['feature'], 8),
         '      </article>',
         '',
         '      <div class="gal__list">']
    items = []
    for it in g['items']:
        k = []
        if it.get('href'):
            k.append('        <a class="gal__item gal__item--link" data-reveal')
            k.append('           href="%s" target="_blank" rel="noopener">' % it['href'])
            close = '        </a>'
            peek = ' data-peek="%s"' % it['peek'] if it.get('peek') else ''
            # the arrow belongs to the link, not to the title he types
            h3 = '          <h3%s>%s<i aria-hidden="true">&#8599;</i></h3>' % (peek, it['title'])
        else:
            k.append('        <article class="gal__item" data-reveal>')
            close = '        </article>'
            h3 = '          <h3>%s</h3>' % it['title']
        k.append('          <p class="gal__when">%s</p>' % it['when'])
        k.append(h3)
        if it.get('where'):
            k.append('          <p class="gal__where">%s</p>' % it['where'])
        for p in texts(it['paras']):
            k.append('          <p>%s</p>' % p)
        k.append(close)
        items.append('\n'.join(k))
    b.append('\n\n'.join(items))
    b.append('      </div>')
    return '\n'.join(b)

def contatti():
    out = []
    for col in rj('content/contatti.json'):
        b = [('      ' if out else '') + '<div class="contact__col" data-reveal>',
             '        <p class="contact__label">%s</p>' % col['label']]
        for blk in col['blocks']:
            if blk['type'] == 'link':
                ext = ' target="_blank" rel="noopener"' if blk.get('external') else ''
                b.append('        <a class="contact__big" href="%s"%s>%s</a>'
                         % (blk['href'], ext, blk['text']))
            else:
                b.append('        <p class="contact__%s">%s</p>' % (blk['type'], blk['html']))
        b.append('      </div>')
        out.append('\n'.join(b))
    return '\n\n'.join(out)

def sechead(sec):
    def render():
        h = rj('content/sections.json')[sec]
        b = ['<header class="sec-head">',
             '      <p class="kicker" data-reveal>%s</p>' % h['kicker'],
             '      <h2 class="sec-title" data-split>%s</h2>' % h['title']]
        if h.get('sub'):
            b.append('      <p class="sec-sub" data-reveal>%s</p>' % h['sub'])
        b.append('    </header>')
        return '\n'.join(b)
    return render

REGIONS = {
    'frammenti': frammenti,
    'progetti': progetti,
    'gallerie': gallerie,
    'contatti': contatti,
}
for _s in ('opere', 'frammenti', 'progetti', 'gallerie'):
    REGIONS['sechead-' + _s] = sechead(_s)

# ---------------------------------------------------------------- collections
COLLECTION_JS = u'''/* ============================================================
   %(key)s.js — generated by build.py from content/collections/%(key)s.json

   Do not edit this file. Edit the JSON and run the build; anything written
   here by hand is lost the next time someone does.

   The paths are here rather than in the data because they are code: the
   collection component wants functions, and a CMS has no business editing
   a URL pattern it cannot check.
   ============================================================ */
(function () {
  'use strict';

  var items = %(items)s;

  window.COLLECTIONS = window.COLLECTIONS || {};
  window.COLLECTIONS.%(key)s = {
    items: items,
    thumb: function (id) { return %(thumb)s; },
    full:  function (id) { return %(full)s; },
%(config)s
  };
})();
'''

def js_str(s):
    return json.dumps(s, ensure_ascii=False)

def path_expr(pattern):
    """'a/{id}.jpg' -> "'a/' + id + '.jpg'" """
    parts = pattern.split('{id}')
    out = []
    for n, p in enumerate(parts):
        if n:
            out.append('id')
        if p:
            out.append(js_str(p))
    return ' + '.join(out)

def collection(key):
    c = rj('content/collections/%s.json' % key)
    lines = []
    for it in c['items']:
        bits = ['id:%s' % js_str(it['id']), 'w:%d' % it['w'], 'h:%d' % it['h']]
        if it.get('alt'):
            bits.append('alt:%s' % js_str(it['alt']))
        lines.append('    { ' + ', '.join(bits) + ' }')
    items = '[\n' + ',\n'.join(lines) + '\n  ]'

    cfg = []
    for k in ('title', 'cover', 'itemLabel', 'chooseLabel', 'sheetTitle',
              'uniqLabel', 'hint', 'touchHint'):
        if c.get(k):
            cfg.append('    %s: %s' % (k, js_str(c[k])))
    cfg.append('    numbered: %s' % ('true' if c.get('numbered') else 'false'))

    return COLLECTION_JS % {
        'key': key,
        'items': items,
        'thumb': path_expr(c['thumb']),
        'full': path_expr(c['full']),
        'config': ',\n'.join(cfg),
    }

COLLECTIONS = ['opere', 'bomboniere']

def main():
    html = rd('src/index.html')
    for name, fn in REGIONS.items():
        marker = '<!--{{%s}}-->' % name
        if marker not in html:
            sys.exit('build: no marker for region %r in src/index.html' % name)
        html = html.replace(marker, fn())
    wr('index.html', html)
    print('built index.html (%d bytes) from %d regions' % (len(html), len(REGIONS)))

    for key in COLLECTIONS:
        js = collection(key)
        wr('assets/js/%s.js' % key, js)
        n = len(rj('content/collections/%s.json' % key)['items'])
        print('built assets/js/%s.js (%d items)' % (key, n))

if __name__ == '__main__':
    main()
