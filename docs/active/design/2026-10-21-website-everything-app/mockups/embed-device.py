#!/usr/bin/env python3
"""Re-embed device.html's three pieces (style, div, script) into the live landing page.

The page carries the drawn device loop inline: <style id="device-css">, the <div class="devdemo">
inside #stage, and a <script> whose first line is `/* devdemo */`. After device.html changes,
run this once; it swaps all three in place and leaves everything else alone.
"""
import re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build as mk

F = HERE.parents[4] / 'youcoded' / 'docs' / 'index.html'
s = F.read_text()

# script: the block that starts with the marker (or, first time, the old block has no marker)
m = re.search(r'<script>\s*/\* devdemo \*/.*?</script>', s, re.S)
assert m, 'no devdemo script marker in the page'
assert mk.DEV_SCRIPT.lstrip().startswith('<script>') and '/* devdemo */' in mk.DEV_SCRIPT, 'device.html script lacks the /* devdemo */ marker'
s = s[:m.start()] + mk.DEV_SCRIPT + s[m.end():]

# style
s, n = re.subn(r'<style id="device-css">.*?</style>', lambda _: mk.DEV_STYLE.replace('<style>', '<style id="device-css">'), s, count=1, flags=re.S)
assert n == 1, 'device-css block'

# div: keep its data-i (the card's index in #stage)
m = re.search(r'<div class="devdemo"[^>]*data-i="(\d+)".*?(?=\n\s*<video data-i=)', s, re.S)
assert m, 'devdemo div'
i = int(m.group(1))
new_div = re.sub(r'^<div class="([^"]*)"', lambda mm: '<div class="%s" data-i="%d"' % (mm.group(1), i), mk.DEV_DIV, count=1)
s = s[:m.start()] + new_div + s[m.end():]
assert s.count('class="devdemo"') == 1
F.write_text(s)
print('embedded device.html into', F, '(card index %d)' % i)
