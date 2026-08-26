#!/usr/bin/env python3
"""make-gallery.py <sheetsDir> <out.html> — one self-contained page listing every
sheet, grouped by the part of the filename before the first '-' (the plan name).
Images are referenced relative to the HTML, so keep gallery.html next to sheets/."""
import os, sys, html

root, out = sys.argv[1], sys.argv[2]
rel = os.path.relpath(root, os.path.dirname(os.path.abspath(out))) or '.'
groups = {}
for f in sorted(os.listdir(root)):
    if not f.lower().endswith(('.jpg', '.png')): continue
    prefix, _, name = f.partition('-')
    groups.setdefault(prefix, []).append((os.path.splitext(name)[0], f))
page = ['<!doctype html><meta charset="utf-8"><title>UI review gallery</title>',
        '<style>body{font:14px system-ui;margin:0;background:#111;color:#ddd}h1{padding:16px 24px;margin:0;background:#1a1a1a;position:sticky;top:0;z-index:2}'
        'h2{padding:12px 24px;margin:24px 0 0;color:#9cf}nav{padding:8px 24px;display:flex;flex-wrap:wrap;gap:8px 16px;background:#161616}nav a{color:#9cf;text-decoration:none}'
        'figure{margin:0;padding:12px 24px}figcaption{padding:6px 0;color:#bbb;font-family:monospace}img{max-width:100%;height:auto;display:block;background:#000}</style>',
        f'<h1>UI review gallery — {html.escape(os.path.basename(os.path.dirname(os.path.abspath(out))))}</h1><nav>']
page += [f'<a href="#g-{html.escape(g)}">{html.escape(g)} ({len(v)})</a>' for g, v in groups.items()]
page.append('</nav><p style="padding:8px 24px;color:#999">Every sheet here was verified by shot.mjs (target existed, expectation held, pixels changed). Missed captures are listed in coverage.md, never shown here.</p>')
for g, items in groups.items():
    page.append(f'<h2 id="g-{html.escape(g)}">{html.escape(g)}</h2>')
    for name, f in items:
        page.append(f'<figure id="{html.escape(g)}-{html.escape(name)}"><figcaption>{html.escape(g)} · {html.escape(name)}</figcaption><img loading="lazy" src="{html.escape(rel)}/{html.escape(f)}" alt="{html.escape(name)}"></figure>')
open(out, 'w').write('\n'.join(page))
print('wrote', out, sum(len(v) for v in groups.values()), 'sheets')
