/* ============================================================
   worker/index.js — the small amount of server the admin needs

   This site is a Cloudflare **Worker with static assets**, not a Pages
   project. The distinction cost a deploy: the first version of this file
   lived in functions/, which is a Pages-only convention, so it was never
   executed - it was served as a static file and /api/* answered 404.

   Here the Worker sits in front of the asset store. Anything that is not
   /api/ is handed straight to it, so the site itself is untouched by this
   file and there is no CORS to get wrong.

   It does three things and refuses everything else:

     POST /api/login      a password in, a short-lived signed session out
     GET  /api/load       the current content, straight from the repo
     POST /api/save       one commit containing every changed file
     GET  /api/published  whether the site was actually rebuilt after a save

   The GitHub token never leaves this file. The browser only ever holds a
   session token that says "this person typed the password", is signed
   with a secret it cannot see, and expires.

   Secrets, set on the Worker (Settings > Variables and secrets), all four
   as Secret rather than Variable:

     ADMIN_PASSWORD   what Antonio types
     SESSION_SECRET   any long random string; signs the session
     GITHUB_TOKEN     fine-grained token, Contents: read and write, this repo only
     GITHUB_REPO      e.g. theslashr/scumasite
   ============================================================ */

const SESSION_HOURS = 12;

/* What the admin is allowed to write. Anything outside this list is
   refused, so a bug or a tampered-with request cannot reach the code that
   builds the site - only its content and its images. */
const WRITABLE = [
  /^content\/[\w-]+\.json$/,
  /^content\/collections\/[\w-]+\.json$/,
  /^assets\/img\/[\w-]+\.jpg$/,
  /^assets\/img\/sm\/[\w-]+\.jpg$/,
  /^assets\/img\/card\/[\w-]+\.jpg$/,
  /^assets\/img\/bomb\/card\/[\w-]+\.jpg$/,
];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/* ---------------- session ---------------- */
const enc = new TextEncoder();

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function mint(env) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  return `${exp}.${await hmac(env.SESSION_SECRET, String(exp))}`;
}

async function valid(env, token) {
  if (!token) return false;
  const [exp, sig] = String(token).split('.');
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  return timingSafeEqual(sig, await hmac(env.SESSION_SECRET, exp));
}

/* Compare without leaking, through timing, how much of the value matched.
   Overkill for one password on one small site, and still the right way to
   compare a secret. */
function timingSafeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------------- github ---------------- */
function gh(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'burgello-admin',
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function ghJSON(env, path, init) {
  const r = await gh(env, path, init);
  if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

/* One commit for the whole save, built through the git data API rather than
   the contents API. Saving five files one call at a time can leave the site
   half-updated if the fourth fails; a tree and a single commit either lands
   or does not. */
async function commitAll(env, files, message) {
  const branch = 'main';
  const ref = await ghJSON(env, `/git/ref/heads/${branch}`);
  const head = ref.object.sha;
  const base = await ghJSON(env, `/git/commits/${head}`);

  const tree = [];
  for (const f of files) {
    const blob = await ghJSON(env, '/git/blobs', {
      method: 'POST',
      body: JSON.stringify(
        f.base64 ? { content: f.base64, encoding: 'base64' }
                 : { content: f.text, encoding: 'utf-8' }),
    });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const newTree = await ghJSON(env, '/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: base.tree.sha, tree }),
  });
  const commit = await ghJSON(env, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }),
  });
  await ghJSON(env, `/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha;
}

/* ---------------- routes ---------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    /* Everything that is not the API is the site. The asset binding does
       the serving: index.html, the images, the admin page. */
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    return handle(url.pathname.slice('/api/'.length), request, env);
  },
};

async function handle(route, request, env) {

  const missing = ['ADMIN_PASSWORD', 'SESSION_SECRET', 'GITHUB_TOKEN', 'GITHUB_REPO']
    .filter((k) => !env[k]);
  if (missing.length) {
    return json({ error: 'Configurazione incompleta sul server: ' + missing.join(', ') }, 500);
  }

  try {
    if (route === 'login' && request.method === 'POST') {
      const { password } = await request.json();
      if (!password || !timingSafeEqual(password, env.ADMIN_PASSWORD)) {
        // deliberately vague, and slow enough to make guessing tedious
        await new Promise((r) => setTimeout(r, 600));
        return json({ error: 'Password non corretta.' }, 401);
      }
      return json({ token: await mint(env), hours: SESSION_HOURS });
    }

    const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (!(await valid(env, token))) {
      return json({ error: 'Sessione scaduta. Rientra con la password.' }, 401);
    }

    if (route === 'load' && request.method === 'GET') {
      const files = {};
      for (const p of ['hero', 'frammenti', 'progetti', 'gallerie', 'contatti', 'sections']) {
        files[p] = await readJSON(env, `content/${p}.json`);
      }
      for (const c of ['opere', 'bomboniere']) {
        files['collections/' + c] = await readJSON(env, `content/collections/${c}.json`);
      }
      return json({ files });
    }

    /* Did the save actually reach the site?

       Committing content is only half of publishing: a workflow then runs
       build.py and commits the rebuilt index.html. If that fails, the
       content is in the repository, the site never changes, and the panel
       had already said "Pubblicato" - which is the worst thing it could
       say. This lets the panel wait and find out.

       It looks for the rebuild commit rather than asking the Actions API,
       which would need a permission the token deliberately does not have.
       The rebuild is the thing that matters anyway: a workflow that ran
       green but committed nothing has not published anything either. */
    if (route === 'published' && request.method === 'GET') {
      const since = new URL(request.url).searchParams.get('since') || '';
      const commits = await ghJSON(env, '/commits?sha=main&per_page=20');
      const head = commits[0] ? commits[0].sha.slice(0, 7) : null;
      const at = since ? commits.findIndex((c) => c.sha.startsWith(since)) : -1;
      /* If the save is not in this window there is no way to tell which
         rebuild commits came after it, and answering "published" on the
         strength of an older one is the single wrong answer this endpoint
         can give. Say no and let the panel keep waiting: a false alarm
         costs a message, a false all-clear costs him the change. */
      if (since && at === -1) return json({ rebuilt: false, unknown: true, head });
      const newer = at === -1 ? commits : commits.slice(0, at);
      const rebuilt = newer.some((c) => /Rigenerato il sito/i.test(c.commit.message));
      return json({ rebuilt, head });
    }

    if (route === 'save' && request.method === 'POST') {
      const body = await request.json();
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) return json({ error: 'Niente da salvare.' }, 400);

      for (const f of files) {
        if (!WRITABLE.some((re) => re.test(f.path))) {
          return json({ error: `Percorso non consentito: ${f.path}` }, 400);
        }
      }
      const sha = await commitAll(env, files, body.message || 'Modifiche dal pannello');
      return json({ ok: true, sha: sha.slice(0, 7), files: files.length });
    }

    return json({ error: 'Richiesta sconosciuta.' }, 404);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
}

async function readJSON(env, path) {
  const r = await gh(env, `/contents/${path}?ref=main`);
  if (!r.ok) throw new Error(`Non riesco a leggere ${path} (${r.status}).`);
  const data = await r.json();
  // atob gives bytes; the content is UTF-8 and full of accented Italian
  const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
