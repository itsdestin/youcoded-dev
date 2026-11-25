#!/usr/bin/env python3
"""Serve the PUBLISHED website with a floating switcher between style variants.

WHY: three sessions (2026-11-12, 11-13, 11-18) hand-built the same rig — a copy of
youcoded/docs per variant with one style override each — to let Destin compare looks on
the real page. This is that rig, once.

    python3 scripts/site-variants/serve.py variants.json [--port 8931] [--ref origin/master]

variants.json is a list; each variant may set:
  name    label on the switcher (required)
  accent  replaces the default "youcoded" theme's accent (page AND the live app demo)
  css     any extra CSS injected while that variant is on
Keys 1-9 switch variants; ?v=<n> opens on one. Read-only: the site files come from
`git archive <ref> docs` of the app repo into a temp folder, never the shared checkout.
"""
import argparse, http.server, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.dirname(os.path.dirname(HERE))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('variants'); ap.add_argument('--port', type=int, default=8931)
    ap.add_argument('--ref', default='origin/master')
    ap.add_argument('--app', default=os.path.join(WORKSPACE, 'youcoded'))
    a = ap.parse_args()
    variants = json.load(open(a.variants))
    out = tempfile.mkdtemp(prefix='site-variants-')
    subprocess.run(['git', '-C', a.app, 'fetch', '-q', 'origin'], check=False)
    arch = subprocess.run(['git', '-C', a.app, 'archive', a.ref, 'docs'], check=True, capture_output=True).stdout
    subprocess.run(['tar', '-x', '-C', out], input=arch, check=True)
    site = os.path.join(out, 'docs')
    page = open(os.path.join(site, 'index.html'), encoding='utf-8').read()
    toggle = open(os.path.join(HERE, 'toggle.js'), encoding='utf-8').read()
    inject = '<script>window.__VARIANTS=' + json.dumps(variants) + ';</script><script>' + toggle + '</script></body>'
    page = page.replace('</body>', inject, 1).encode('utf-8')

    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kw): super().__init__(*args, directory=site, **kw)
        def do_GET(self):
            if self.path.split('?')[0] in ('/', '/index.html'):
                self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(page))); self.end_headers(); self.wfile.write(page); return
            super().do_GET()
        def end_headers(self):
            # WHY: without no-store Destin reviews a stale page (2026-08-31 handoff).
            self.send_header('Cache-Control', 'no-store'); super().end_headers()
        def log_message(self, *x): pass

    print(f'site-variants: http://127.0.0.1:{a.port}/  ({len(variants)} variants, site from {a.ref})', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', a.port), H).serve_forever()

if __name__ == '__main__':
    main()
