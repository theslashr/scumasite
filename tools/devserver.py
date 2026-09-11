# -*- coding: utf-8 -*-
"""
devserver.py — the site plus a stand-in for /api, for trying the panel locally

    py -3 tools/devserver.py          then http://127.0.0.1:8126/admin/
    password: scuma   (or set ADMIN_PASSWORD)

Cloudflare runs functions/api/[[route]].js in production. Nothing runs it
here, so `python -m http.server` serves the panel but refuses every
password. This answers the same three routes so the whole thing can be
used end to end on this machine.

The difference that matters: **save writes to the files in this folder and
runs build.py**, instead of committing to GitHub. So you can try adding a
painting, see it appear on the local site, and throw the changes away with
git checkout. Nothing here reaches the repository.

Development only. It is not deployed, it is not in .assetsignore's way, and
it has no session signing worth the name.
"""
import io, json, os, re, subprocess, sys, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASSWORD = os.environ.get('ADMIN_PASSWORD', 'scuma')
PORT = int(os.environ.get('PORT', '8126'))

WRITABLE = [
    re.compile(r'^content/[\w-]+\.json$'),
    re.compile(r'^content/collections/[\w-]+\.json$'),
    re.compile(r'^assets/img/[\w-]+\.jpg$'),
    re.compile(r'^assets/img/sm/[\w-]+\.jpg$'),
    re.compile(r'^assets/img/card/[\w-]+\.jpg$'),
    re.compile(r'^assets/img/bomb/card/[\w-]+\.jpg$'),
]

CONTENT = ['hero', 'frammenti', 'progetti', 'gallerie', 'contatti', 'sections']
COLLECTIONS = ['opere', 'bomboniere']


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if '/api/' in (self.path or ''):
            sys.stderr.write('  %s\n' % (fmt % args))

    # ------------------------------------------------------------------
    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('content-type', 'application/json; charset=utf-8')
        self.send_header('content-length', str(len(body)))
        self.send_header('cache-control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        n = int(self.headers.get('content-length') or 0)
        return json.loads(self.rfile.read(n).decode('utf-8')) if n else {}

    def authed(self):
        return (self.headers.get('authorization') or '').startswith('Bearer dev.')

    # ------------------------------------------------------------------
    def do_GET(self):
        if self.path.startswith('/api/load'):
            if not self.authed():
                return self.send_json({'error': 'Sessione scaduta.'}, 401)
            files = {}
            for name in CONTENT:
                files[name] = load(os.path.join('content', name + '.json'))
            for name in COLLECTIONS:
                files['collections/' + name] = load(
                    os.path.join('content', 'collections', name + '.json'))
            return self.send_json({'files': files})
        if self.path.startswith('/api/'):
            return self.send_json({'error': 'Richiesta sconosciuta.'}, 404)
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/login'):
            body = self.read_json()
            if body.get('password') != PASSWORD:
                time.sleep(0.4)
                return self.send_json({'error': 'Password non corretta.'}, 401)
            return self.send_json({'token': 'dev.' + str(int(time.time())), 'hours': 12})

        if self.path.startswith('/api/save'):
            if not self.authed():
                return self.send_json({'error': 'Sessione scaduta.'}, 401)
            files = self.read_json().get('files') or []
            for f in files:
                if not any(p.match(f['path']) for p in WRITABLE):
                    return self.send_json(
                        {'error': 'Percorso non consentito: ' + f['path']}, 400)
            try:
                for f in files:
                    write(f)
                out = subprocess.run([sys.executable, os.path.join(ROOT, 'build.py')],
                                     cwd=ROOT, capture_output=True, text=True)
                if out.returncode:
                    return self.send_json({'error': 'build.py: ' + out.stderr[-400:]}, 500)
                print('  salvato: %d file, poi build.py' % len(files))
                return self.send_json({'ok': True, 'sha': 'locale', 'files': len(files)})
            except Exception as e:
                return self.send_json({'error': str(e)}, 500)

        return self.send_json({'error': 'Richiesta sconosciuta.'}, 404)


def load(rel):
    return json.loads(io.open(os.path.join(ROOT, rel), encoding='utf-8').read())


def write(f):
    import base64
    full = os.path.join(ROOT, f['path'])
    os.makedirs(os.path.dirname(full), exist_ok=True)
    if f.get('base64'):
        with open(full, 'wb') as fh:
            fh.write(base64.b64decode(f['base64']))
    else:
        io.open(full, 'w', encoding='utf-8', newline='').write(f['text'])


if __name__ == '__main__':
    print('Sito    http://127.0.0.1:%d/' % PORT)
    print('Pannello http://127.0.0.1:%d/admin/   password: %s' % (PORT, PASSWORD))
    print('Le modifiche vanno sui file locali, non su GitHub. git checkout per annullare.\n')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
