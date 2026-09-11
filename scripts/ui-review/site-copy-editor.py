#!/usr/bin/env python3
"""Edit copy on the site, seeing the real page.

    python3 scripts/ui-review/site-copy-editor.py serve youcoded/docs/index.html [--port N] [--timeout MIN]

Serves the real site HTML (real CSS, and now the real media/gallery/site assets)
with every text block editable in place. Edits autosave and Submit writes
<out-dir>/edits.json + <out-dir>/edits.md, mapping every changed block old -> new.

WHY the asset mirror: the first version served a lone HTML file from /tmp, so the
hero mascots, the feature loops, the gallery and the live embed iframe were all
broken images. Copy sits next to those pictures, so a page that cannot show them
is not the page being edited (2026-09-10).

WHY it writes to disk: Submit used to only download edits.json into the browser's
download folder, so a session could not read the edits without asking Destin to
find the file. /save replaces that.
"""
import argparse
import html as _html
import json
import os
import re
import sys
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler, ThreadingHTTPServer
from socketserver import ThreadingMixIn
from threading import Timer

# Editor chrome. The first version toggled body.ce-show-hint but shipped no CSS
# for it, so "Show editable" did nothing (2026-09-10).
EDITOR_CSS = '''
<style>
/* WHY bottom-RIGHT, not bottom-centre: the site has its own centred fixed pills
   (`.dlfloat` docks at bottom:34px, `.topcta`), and a centred toolbar overlapped
   the download pill — measured y839-886 over the pill's y794-866 on 2026-09-10. */
#ce-toolbar{position:fixed;right:16px;bottom:16px;z-index:2147483647;
  display:flex;gap:12px;align-items:center;padding:9px 14px;border-radius:999px;
  background:#1c1917;color:#f5f5f4;font:13px/1.3 system-ui,-apple-system,sans-serif;
  box-shadow:0 10px 40px rgba(0,0,0,.45);white-space:nowrap;pointer-events:auto}
#ce-toolbar .ce-title{font-weight:700;letter-spacing:.02em}
#ce-toolbar button{border:1px solid rgba(255,255,255,.28);background:transparent;color:#f5f5f4;
  border-radius:999px;padding:5px 12px;font:inherit;cursor:pointer}
#ce-toolbar button[aria-pressed=true]{background:#f5f5f4;color:#1c1917}
#ce-toolbar #ce-submit{background:#f97316;border-color:#f97316;color:#fff;font-weight:600}
#ce-toolbar #ce-submit[disabled]{opacity:.55;cursor:default}
#ce-status{position:fixed;right:16px;bottom:66px;z-index:2147483647;
  background:#1c1917;color:#f5f5f4;border-radius:999px;padding:6px 14px;
  font:13px system-ui,sans-serif;max-width:70vw;text-align:right}
#ce-status:empty{display:none}
[data-c-type="text"]{outline:2px dashed transparent;outline-offset:3px;border-radius:4px;
  transition:outline-color .15s}
body.ce-show-hint [data-c-type="text"]{outline-color:rgba(127,127,127,.42)}
[data-c-type="text"]:hover{outline-color:#f97316}
[data-c-type="text"]:focus{outline:2px solid #f97316;background:rgba(249,115,22,.07)}
[data-c-type="text"].ce-edited{outline-color:#c98a2e;background:rgba(201,138,46,.07)}
body.ce-mode{padding-bottom:64px}
/* On a phone the full toolbar is wider than the screen; let it wrap and sit above
   the site's bottom pills. */
@media(max-width:640px){
  #ce-toolbar{left:10px;right:10px;bottom:10px;flex-wrap:wrap;justify-content:center;
    border-radius:16px;font-size:12px;padding:8px 10px;white-space:normal}
  #ce-status{bottom:auto;top:12px;right:10px;left:auto;max-width:80vw}
}
</style>
'''


def _mask_code(html_src):
    """Replace <script>, <style> and comment bodies with inert placeholders so a
    markup-matching regex can't reach HTML that is only a JS string or CSS text."""
    store = []

    def hide(m):
        store.append(m.group(0))
        return f'\x00MASK{len(store) - 1}\x00'

    masked = re.sub(r'<script\b[^>]*>[\s\S]*?</script>|<style\b[^>]*>[\s\S]*?</style>|<!--[\s\S]*?-->', hide, html_src)
    return masked, store


def _unmask_code(html_src, store):
    for i, chunk in enumerate(store):
        html_src = html_src.replace(f'\x00MASK{i}\x00', chunk)
    return html_src


# Prose tags marked wherever they appear; container tags marked by class.
_PROSE_TAGS = ('h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'li', 'label', 'legend', 'summary')
_CONTAINER_TAGS = ('div', 'article', 'section', 'aside')
_OPEN_RE = re.compile(r'<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>', re.S)
# An id like id="sw-${theme.id}" is filled in by the page's own script; renaming
# it would change what getElementById substitutes. Template ids are free to skip
# because the button that needs them is found by its class, not this id.
_TEMPLATE_ID_RE = re.compile(r'<[^>]*\bid\s*=\s*["\'][^"\']*\$\{')

# Container classes that mean prose. A name in `exact` matches that class token
# exactly; the rest match as substrings.
_TEXT_CLASSES = {
    'hero-sub', 'hero-actions', 'btn', 'section-desc', 'section-label', 'section-title',
    'intro-box', 'permission-note', 'download-note', 'download-card-platform',
    'download-card-text', 'download-card-label', 'prereq-text',
    'footer-legal', 'nav-links', 'nav-link',
    'origin-story', 'origin-story-text', 'origin-story-link',
    'faq-question', 'faq-answer', 'faq-answer-inner',
    'showcase-text', 'showcase-label', 'showcase-title', 'showcase-desc',
    'showcase-item', 'word-cycler-static', 'rv-caption',
    'install-modal', 'acct', 'flinks', 'dlchip', 'dlbtn', 'trypill',
    'topcta', 'roadmap-chip', 'roadmap-item', 'roadmap-title',
    'footer-logo', 'footer-inner',
}
# WHY 'a' is exact: the FAQ answers use class="a", and the generic matcher treats
# any class *containing* the name as a match, so 'a' would have captured nearly
# every div on the page (2026-09-10).
_EXACT_CLASSES = {'a'}


def identify_text_blocks(html_src):
    """Mark every prose-bearing OPENING tag with a data-c id, then inject the
    editing toolbar and script.

    WHY opening tags only: the first version matched whole elements
    (`<div class="faq">...</div>`), so a matched ancestor consumed the nested
    FAQ answers before they could be seen, and any attribute text inside the
    element was matched twice. Walking opening tags has neither problem, and
    blocks with no text are dropped on the page instead (2026-09-10)."""

    # Don't mark markup inside <script>/<style>/comments. The install-modal HTML
    # lives in a JS string, and marking it produced 15 phantom data-c IDs that
    # inflated the count and could never be edited (2026-09-10).
    html_src, masked = _mask_code(html_src)

    text_prose = {t: re.compile(rf'<{t}\b', re.I) for t in _PROSE_TAGS}
    container = re.compile(rf'<({"|".join(_CONTAINER_TAGS)})\b', re.I)

    starts = set()
    for _t, pat in text_prose.items():
        starts.update(m.start() for m in pat.finditer(html_src))
    starts.update(m.start() for m in container.finditer(html_src))

    counter = [0]
    out, pos = [], 0
    for s in sorted(starts):
        if s < pos:
            continue
        m = _OPEN_RE.match(html_src, s)
        if not m:
            continue
        tag, attrs = m.group(1), m.group(2)
        out.append(html_src[pos:s])
        if 'data-c=' in attrs or _TEMPLATE_ID_RE.match(m.group(0)) or not _markable(tag, attrs):
            out.append(m.group(0))
        else:
            out.append(f'<{tag}{attrs} data-c="b{counter[0]}" data-c-type="text">')
            counter[0] += 1
        pos = m.end()
    out.append(html_src[pos:])
    html_src = ''.join(out)

    html_src = _unmask_code(html_src, masked)

    payload = EDITOR_CSS + _EDITOR_JS
    if '</body>' in html_src:
        html_src = html_src.replace('</body>', payload + '\n</body>')
    else:
        html_src = html_src + '\n' + payload

    return html_src, counter[0]


def _markable(tag, attrs):
    tag = tag.lower()
    if tag in _PROSE_TAGS:
        return True
    if tag not in _CONTAINER_TAGS:
        return False
    m = re.search(r'\bclass\s*=\s*["\']([^"\']*)["\']', attrs)
    if not m:
        return False
    tokens = m.group(1).split()
    if not tokens:
        return False
    if any(t in _EXACT_CLASSES for t in tokens):
        return True
    return any(pat in t for t in tokens for pat in _TEXT_CLASSES)


_EDITOR_JS = '''
<script>
(function(){
  // WHY blocks.length and not the injected __BLOCKS__: the marking regex also
  // matches HTML inside the site's own <script> templates (~15 of them), which
  // are never DOM nodes. The injected count over-reported "140" for 125 real
  // blocks (2026-09-10).
  // WHY the filter: container markup (e.g. <div class="faq">) is marked too, so
  // its own bare whitespace must not become an editable "block" (2026-09-10).
  var marked = [].slice.call(document.querySelectorAll('[data-c-type="text"]'));
  var blocks = marked.filter(function(el){ return el.textContent.trim().length > 1; });
  marked.filter(function(el){ return blocks.indexOf(el) === -1; })
        .forEach(function(el){ el.removeAttribute('data-c-type'); el.removeAttribute('data-c'); });
  var BLOCKS = blocks.length;
  var edits = {};
  var originals = {};
  var autosave = true;

  // WHY clean: blocks nest (a <span> inside a <p>), so a captured innerHTML
  // carries the editor's own data-c / contenteditable markers. Written back to
  // the real index.html they would be junk attributes (2026-09-10).
  // WHY force-open: some prose panels are <details> that start collapsed, and text
  // inside a closed one cannot be seen or clicked to edit. This is an editor-only
  // view of the page: the original file, and the shipped page, are untouched.
  var detailsForced = [];
  document.querySelectorAll('details').forEach(function(d){
    if (!d.open) { detailsForced.push(d); d.open = true; }
  });

  function cleanHtml(html){
    var box = document.createElement('div');
    box.innerHTML = html;
    box.querySelectorAll('[data-c],[data-c-type],[contenteditable],[spellcheck]').forEach(function(e){
      e.removeAttribute('data-c'); e.removeAttribute('data-c-type');
      e.removeAttribute('contenteditable'); e.removeAttribute('spellcheck');
      e.classList.remove('ce-edited');
      if (e.getAttribute('class') === '') e.removeAttribute('class');
    });
    // Restore the closed panels before comparing, so the editor's own force-open
    // is not recorded as an edit the moment someone clicks Submit (2026-09-10).
    detailsForced.forEach(function(d){ d.open = false; });
    try { return box.innerHTML; } finally { detailsForced.forEach(function(d){ d.open = true; }); }
  }

  document.body.classList.add('ce-mode');

  var statusEl = document.createElement('div');
  statusEl.id = 'ce-status';
  document.body.appendChild(statusEl);

  var toolbar = document.createElement('div');
  toolbar.id = 'ce-toolbar';
  toolbar.innerHTML =
    '<span class="ce-title">Copy Editor</span>' +
    '<span><b>' + BLOCKS + '</b> text blocks</span>' +
    '<button id="ce-hint" aria-pressed="false" title="Show which blocks are editable">Show editable</button>' +
    '<button id="ce-submit" title="Save all edits">Submit edits</button>';
  document.body.appendChild(toolbar);

  function flash(msg){ statusEl.textContent = msg; clearTimeout(flash._t);
    flash._t = setTimeout(function(){ statusEl.textContent = ''; }, 2600); }

  function save(silent){
    var data = { key: 'site-copy-editor', site: document.title,
      submitted: silent ? null : new Date().toISOString().slice(0,19) + 'Z',
      blockCount: BLOCKS, edits: edits };
    try { localStorage.setItem('site-copy-editor', JSON.stringify(data)); } catch(e) {}
    fetch('/save', { method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify(data) })
      .then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(){ if(!silent) flash('Saved to disk — tell Claude.'); })
      .catch(function(){ if(!silent) flash('Save failed — is the server still up?'); });
    return data;
  }
  var saveT = null;
  function autosaveNow(){ if(!autosave) return; clearTimeout(saveT); saveT = setTimeout(function(){ save(true); }, 800); }

  blocks.forEach(function(el){
    el.contentEditable = 'true';
    el.spellcheck = true;
    var bid = el.dataset.c;
    originals[bid] = el.innerHTML;

    el.addEventListener('focus', function(){ statusEl.textContent = 'Editing: ' + bid; });
    el.addEventListener('blur', function(){ statusEl.textContent = ''; });
    el.addEventListener('input', function(ev){
      // WHY the target check: blocks nest (a <span> inside a <p>), and `input`
      // bubbles, so without this an edit typed in the inner block is also
      // captured — and shown as an edit — on every ancestor (2026-09-10).
      if (ev && ev.target !== el) return;
      var current = cleanHtml(this.innerHTML);
      if (current.trim() === cleanHtml(originals[bid]).trim()) {
        delete edits[bid]; this.classList.remove('ce-edited');
      } else {
        edits[bid] = { original: cleanHtml(originals[bid]), current: current };
        this.classList.add('ce-edited');
      }
      updateCount(); autosaveNow();
    });
  });

  function updateCount(){
    var n = Object.keys(edits).length;
    document.querySelector('#ce-toolbar b').textContent = BLOCKS;
    flash(n + ' block' + (n !== 1 ? 's' : '') + ' edited');
  }

  document.getElementById('ce-hint').addEventListener('click', function(){
    var on = this.getAttribute('aria-pressed') !== 'true';
    this.setAttribute('aria-pressed', on);
    document.body.classList.toggle('ce-show-hint', on);
  });

  document.getElementById('ce-submit').addEventListener('click', function(){
    var data = save(false);
    var n = Object.keys(data.edits).length;
    flash(n ? ('Submitted — ' + n + ' edit' + (n === 1 ? '' : 's') + ' saved to disk.') : 'Submitted — no edits yet.');
    this.textContent = 'Submitted ✓';
  });

  window.addEventListener('beforeunload', function(){ save(true); });
})();
</script>'''


def mirror_assets(site_html, out_dir):
    """Symlink every sibling of the site HTML into out_dir so media/, gallery/,
    icons/ and site/ resolve exactly as they do on the live site."""
    src_dir = os.path.dirname(os.path.abspath(site_html))
    names = []
    for name in sorted(os.listdir(src_dir)):
        if name == 'index.html':
            continue
        dst = os.path.join(out_dir, name)
        if os.path.lexists(dst):
            names.append(name)
            continue
        try:
            os.symlink(os.path.join(src_dir, name), dst)
            names.append(name)
        except OSError:
            pass
    return names


def build(site_html, out_dir):
    with open(site_html, encoding='utf-8') as f:
        src = f.read()

    os.makedirs(out_dir, exist_ok=True)
    edited, count = identify_text_blocks(src)

    # WHY index.html and not site.edit.html: the live embed's iframe and every
    # root-relative asset expect to sit at the server root.
    out_path = os.path.join(out_dir, 'index.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(edited)

    mirrored = mirror_assets(site_html, out_dir)
    return out_path, count, mirrored


def submitted_state(out_dir):
    """The real submission already on disk, or None. Read before every write so a
    stale page cannot erase one."""
    jpath = os.path.join(out_dir, 'edits.json')
    if not os.path.exists(jpath):
        return None
    try:
        with open(jpath, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_edits(out_dir, data):
    """Write the edit state. REFUSES to overwrite a real submission with an empty
    one.

    WHY: an autosave fires 800ms after every keystroke, from every open page. A tab
    left open across a server restart posts its own empty state over a submission
    that was already made — exactly what happened on 2026-09-10, wiping a finished
    set of site edits. A genuine "I cleared my edits" is not a thing a person needs.
    """
    edits = data.get('edits') or {}
    prev = submitted_state(out_dir)
    if not edits and prev and (prev.get('submitted') or (prev.get('edits') or {})):
        print('[site-copy-editor] REFUSED to overwrite the saved edits with an empty '
              'state (a stale page autosaved). The submission is intact.')
        return os.path.join(out_dir, 'edits.json'), os.path.join(out_dir, 'edits.md'), False

    jpath = os.path.join(out_dir, 'edits.json')
    with open(jpath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    def text(s):
        return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', _html.unescape(s or ''))).strip()

    stamp = (data.get('submitted') or datetime.now().strftime('%Y-%m-%dT%H:%M:%S'))[:16].replace('T', ' ')
    lines = [f'# Site copy edits ({stamp})', '']
    if not edits:
        lines.append('_No edits._')
    for bid, e in edits.items():
        lines.append(f'- **{bid}**')
        lines.append(f'  - was: {text(e.get("original"))}')
        lines.append(f'  - now: {text(e.get("current"))}')
    mpath = os.path.join(out_dir, 'edits.md')
    with open(mpath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    return jpath, mpath, True


def main():
    ap = argparse.ArgumentParser(description='Edit copy directly on the site')
    sub = ap.add_subparsers(dest='cmd', required=True)

    for name in ('serve', 'build'):
        s = sub.add_parser(name)
        s.add_argument('site', help='Path to the site index.html')
        # WHY not /tmp: the answer files live here, and a /tmp path is easy to
        # `rm -rf` when restarting the server — which destroyed a finished set of
        # Destin's edits on 2026-09-10. scratch/ is git-ignored and outlives a
        # session; pass an explicit --out-dir if you want a fresh one.
        s.add_argument('--out-dir', default='scratch/site-copy-edit',
                       help='Where the built page and the edits.* files go (default: scratch/site-copy-edit)')
        if name == 'serve':
            s.add_argument('--port', type=int, default=0)
            s.add_argument('--timeout', type=int, default=10080)

    a = ap.parse_args()
    out_path, count, mirrored = build(a.site, a.out_dir)
    print(f'[site-copy-editor] built {out_path} — {count} text blocks')
    print(f'[site-copy-editor] assets linked: {", ".join(mirrored) or "(none)"}')

    if a.cmd == 'build':
        return 0

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=a.out_dir, **kwargs)

        def do_GET(self):
            if self.path in ('/', '/index.html', '/site.edit.html'):
                self.path = '/index.html'
            return super().do_GET()

        def do_POST(self):
            if self.path != '/save':
                self.send_error(404)
                return
            length = int(self.headers.get('content-length') or 0)
            try:
                data = json.loads(self.rfile.read(length) or b'{}')
            except ValueError:
                data = {}
            jpath, mpath, wrote = write_edits(a.out_dir, data)
            self.send_response(200)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'wrote': wrote,
                                         'json': jpath, 'md': mpath}).encode())

        def log_message(self, fmt, *args):
            pass  # suppress request logs

    # WHY threaded: the first version used the single-threaded HTTPServer, and one
    # browser preconnect to a not-yet-requested path stalled the entire server —
    # the page stopped loading and no cur/edit could be fetched (2026-09-10).
    server = ThreadingHTTPServer(('127.0.0.1', a.port or 0), Handler)
    port = server.server_address[1]
    url = f'http://127.0.0.1:{port}/'
    print(f'[site-copy-editor] server running at {url}')
    print(f'[site-copy-editor] edits land in {os.path.join(a.out_dir, "edits.md")}')

    timer = Timer(a.timeout * 60, lambda: server.shutdown())
    timer.daemon = True
    timer.start()

    def handle_sig():
        print('\n[site-copy-editor] stopping...')
        server.shutdown()
        sys.exit(0)

    import signal
    signal.signal(signal.SIGINT, lambda s, f: handle_sig())
    signal.signal(signal.SIGTERM, lambda s, f: handle_sig())

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        timer.cancel()
        server.server_close()
        print(f'[site-copy-editor] edits file: {out_path}')
        sys.exit(0)


if __name__ == '__main__':
    sys.exit(main())
