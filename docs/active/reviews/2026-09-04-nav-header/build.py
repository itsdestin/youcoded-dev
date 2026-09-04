#!/usr/bin/env python3
"""Builds nav-variants.html — a live playground for the youcoded.ai header bar.

WHY a generator and not a hand-written page: the themes, the mascot art and the
nav's real CSS all live in youcoded/docs/index.html. Transcribing them by hand is
how a mockup starts lying about what the site looks like. This pulls the theme
table and the mascot SVG straight out of the real page, so every bar drawn here
is wearing the site's own material. Verified against the live page by computed
style: the default state matches it exactly (name 700/15.2px, tagline 8.6px,
tile 26px, no weight split, no colour in the words).

Rounds so far:
  1  icon containers + wordmark treatments. Destin kept the accent tile, wanted
     it bigger, rejected every type option.
  2  sizes became SLIDERS; axes moved to what the bar SAYS and what the name is
     SET IN. Found that `.wm` inherits var(--font-theme), so the live logo is
     drawn in a different typeface in all eight themes.
  3  CASE became its own axis with a letter-spacing slider (caps type is
     unjudgeable without tracking control), and COLOUR and WEIGHT became
     per-word axes. "You" gained its own span so the first half is addressable.
  4  Destin picked CAPS + coloured. This round is fifteen variants of THAT one
     look, plus the three controls those variants needed: an "Assistant" axis
     (same size / smaller / moved to line two), two colour treatments that are
     not coloured letters (a filled block, an underline), and an extreme weight
     split.

    python3 build.py            # writes nav-variants.html next to this file
"""
import html
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', 'youcoded', 'docs'))
INDEX = os.path.join(SITE, 'index.html')
# Relative path the built page uses to reach the real wallpapers.
WALL_PREFIX = os.path.relpath(SITE, HERE) + '/'

src = open(INDEX, encoding='utf-8').read()

m = re.search(r'^var THEMES = (\{.*\});$', src, re.M)
if not m:
    raise SystemExit('could not find THEMES in ' + INDEX)
THEMES_JSON = m.group(1)

m = re.search(r'(<svg class="mark-bot".*?</svg>)', src, re.S)
if not m:
    raise SystemExit('could not find the mascot SVG in ' + INDEX)
MASCOT = m.group(1)

# ---------------------------------------------------------------- variants --
# Each axis: (class, short label, one-line plain-English description).
ICONS = [
    ('i-tile',   'Accent tile (today)', 'Solid square in the theme colour with the robot cut out of it. What the site uses today.'),
    ('i-glass',  'Glass tile',          'Same frosted material as the bar itself, with the robot painted IN the theme colour instead of knocked out of it.'),
    ('i-bare',   'No container',        'Just the robot, bigger, in the theme colour. Nothing behind it.'),
    ('i-circle', 'Accent circle',       'The same solid colour, but a round badge instead of a square.'),
    ('i-ink',    'Ink tile',            'Square in the text colour, robot cut out in the page colour. No colour at all up here.'),
]
SAYS = [
    ('s-all',      'Name · Assistant · tagline', 'Everything the bar says today: "YouCoded Assistant" with "AGENTS FOR EVERYONE" underneath.'),
    ('s-nameasst', 'Name · Assistant',           'Keeps "YouCoded Assistant", drops the tagline. Nothing under the name.'),
    ('s-nametag',  'Name · tagline',             'Drops the word "Assistant". The name, then the tagline underneath it.'),
    ('s-name',     'Name only',                  'Just "YouCoded". The bar says nothing else about what it is.'),
]
FONTS = [
    ('n-theme', 'Theme font (today)', 'The name changes typeface with every theme — Comfortaa here, Nunito there. This is what the live site does.'),
    ('n-fixed', 'One brand font',     'The name is always DM Sans, whatever theme the page is wearing. Same shape everywhere.'),
    ('n-serif', 'Serif',              'A serif face, always. Warmer, more like a masthead than a software logo.'),
]
CASE = [
    ('c-as',       'As written (today)',  '"YouCoded Assistant" — capital Y, capital C, the rest lower case.'),
    ('c-lower',    'all lower case',      '"youcoded assistant" throughout. Softer, more like a modern consumer app.'),
    ('c-name',     'NAME in caps',        '"YOUCODED" in capitals, "Assistant" left as written beside it.'),
    ('c-nameasst', 'NAME + ASSISTANT',    '"YOUCODED ASSISTANT" both in capitals. The tagline is already capitals, so the top line now matches it.'),
    ('c-all',      'EVERYTHING in caps',  'Every word in the bar in capitals, all three parts, one consistent block of type.'),
]
COLOUR = [
    ('k-none',     'No colour',         'No colour anywhere in the words. The theme colour appears once, in the tile. This is live today.'),
    ('k-coded',    '"Coded"',           'The second half of the name picks up the theme colour.'),
    ('k-you',      '"You"',             'The first half picks up the colour instead — puts the emphasis on the person, not the code.'),
    ('k-asst',     '"Assistant"',       'The name stays plain and the word "Assistant" carries the colour.'),
    ('k-tag',      'The tagline',        'Name plain, tagline in the theme colour — the colour sits on the promise, not the name.'),
    ('k-codedtag', '"Coded" + tagline', 'Colour in two places: the second half of the name and the tagline underneath.'),
    ('k-name',     'The whole name',    '"YouCoded" entirely in the theme colour. The loudest option.'),
    ('k-youtag',   '"You" + tagline',   'Colour in two places: the first half of the name and the tagline underneath.'),
    ('k-block',    '"Coded" in a block','Not coloured letters — a filled block of colour with the word knocked out of it, matching the tile.'),
    ('k-under',    'Underline',         'The letters stay plain and a coloured rule sits under the name, like a highlighter stroke.'),
]
WEIGHT = [
    ('w-even',   'All the same (today)', 'Name and "Assistant" at one weight. Nothing is emphasised over anything else — this is live today.'),
    ('w-coded',  '"Coded" heavier',    'Light "You", heavy "Coded" — one word with the emphasis inside it.'),
    ('w-xsplit', 'Extreme split',      'The widest possible gap: "You" very thin, "Coded" very heavy. Dramatic; can read as two words.'),
    ('w-you',    '"You" heavier',      'The reverse: heavy "You", light "Coded".'),
    ('w-asst',   '"Assistant" heavy',  '"Assistant" is bold and full strength instead of faded — it stops being a footnote.'),
    ('w-light',  'Everything light',   'Thin, airy type throughout. Quiet and expensive-looking; can get weak on busy wallpapers.'),
    ('w-black',  'Name very heavy',    'The name at maximum weight with "Assistant" light beside it. Blunt and confident.'),
]
ASSIST = [
    ('x-same',  'Same size as the name', '"Assistant" sits on the same line at the same size, just faded.'),
    ('x-small', 'Smaller label',         '"Assistant" shrinks to a small spaced label beside the name, so the name dominates.'),
    ('x-line2', 'Down to line two',      '"Assistant" leaves the name line and joins the tagline below: line one is purely the name.'),
]
TAGLINE = [
    ('g-mono', 'Typewriter caps (today)', 'The tagline in the mono face, tiny and letter-spaced.'),
    ('g-same', 'Same font as the name',   'The tagline set in the name\'s own typeface, still capitals. Makes the two lines read as one lockup.'),
    ('g-sans', 'A normal sentence',       '"Agents for everyone" in ordinary lower case. Much less technical.'),
    ('g-chip', 'In a chip',               'The tagline becomes a small rounded badge beside the name, not a line under it.'),
]
PLACE = [
    ('p-left',   'Left (today)', 'Logo hard left, the About/Features/FAQ links hard right.'),
    ('p-center', 'Centred',      'Logo in the middle of the bar, links still on the right. Reads more like a masthead.'),
]

# Presets. Fields in order; `x` is optional and defaults to x-same so the older
# rows did not all have to be rewritten when the Assistant axis was added.
FIELDS = ('name', 's', 'n', 'c', 'k', 'w', 'g', 'p',
          'tile', 'corner', 'wm', 'bar', 'track', 'tag', 'x', 'i')
DEFAULTS = {'x': 'x-same', 'i': 'i-tile'}


def row(t):
    d = dict(zip(FIELDS, t))
    for key, val in DEFAULTS.items():
        d.setdefault(key, val)
    return d


# The look Destin picked out of round 3, and fifteen variations on it. Everything
# here is caps + coloured; only ONE thing changes per row so each is a real
# comparison rather than a different design.
CAPS_BASE = ('s-all', 'n-fixed', 'c-all')
GROUPS = [
    # Round 5. Everything here is the combination Destin asked for -- glass mark,
    # "YOU" in the theme colour, wide caps -- with one thing moved per row. The
    # last three swap the MARK back so the icon can be judged against the same
    # words rather than against a different lockup.
    ('Glass + YOU', [
        ('Glass · YOU · wide',   's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 31, 34, 0.92, 60, 22, 60, 'x-same', 'i-glass'),
        ('Wider still',          's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 31, 34, 0.92, 60, 30, 60, 'x-same', 'i-glass'),
        ('Previous spacing',     's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 31, 34, 0.92, 60, 13, 60, 'x-same', 'i-glass'),
        ('YOU heavier',          's-all', 'n-fixed', 'c-all', 'k-you', 'w-you',  'g-same', 'p-left', 31, 34, 0.92, 60, 22, 60, 'x-same', 'i-glass'),
        ('YOU lighter',          's-all', 'n-fixed', 'c-all', 'k-you', 'w-coded','g-same', 'p-left', 31, 34, 0.92, 60, 22, 60, 'x-same', 'i-glass'),
        ('YOU + tagline',        's-all', 'n-fixed', 'c-all', 'k-youtag', 'w-even', 'g-same', 'p-left', 31, 34, 0.92, 60, 22, 60, 'x-same', 'i-glass'),
        ('Small ASSISTANT',      's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 32, 34, 1.02, 60, 20, 55, 'x-small', 'i-glass'),
        ('ASSISTANT on line 2',  's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-mono', 'p-left', 32, 34, 1.04, 60, 20, 52, 'x-line2', 'i-glass'),
        ('No tagline',           's-nameasst', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 33, 32, 1.06, 60, 22, 60, 'x-same', 'i-glass'),
        ('Tile 34',              's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 34, 33, 0.94, 62, 22, 60, 'x-same', 'i-glass'),
        ('Tile 38',              's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 38, 32, 0.94, 64, 22, 60, 'x-same', 'i-glass'),
        ('Tile 42',              's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 42, 31, 0.94, 68, 22, 60, 'x-same', 'i-glass'),
        ('Tile 46',              's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 46, 30, 0.94, 72, 22, 60, 'x-same', 'i-glass'),
        ('Tile 42 + bigger name','s-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 42, 31, 1.06, 68, 22, 58, 'x-same', 'i-glass'),
        ('Same, solid tile',     's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 31, 34, 0.92, 60, 22, 60, 'x-same', 'i-tile'),
        ('Same, bare robot',     's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 34, 34, 0.92, 60, 22, 60, 'x-same', 'i-bare'),
        ('Same, circle',         's-all', 'n-fixed', 'c-all', 'k-you', 'w-even', 'g-same', 'p-left', 31, 50, 0.92, 60, 22, 60, 'x-same', 'i-circle'),
    ]),
    ('Caps · coloured', [
        ('CODED in colour',    *CAPS_BASE, 'k-coded',    'w-coded',  'g-same', 'p-left', 31, 34, 0.92, 60, 13, 60),
        ('YOU in colour',      *CAPS_BASE, 'k-you',      'w-you',    'g-same', 'p-left', 31, 34, 0.92, 60, 13, 60),
        ('ASSISTANT in colour', *CAPS_BASE, 'k-asst',    'w-asst',   'g-same', 'p-left', 31, 34, 0.92, 60, 13, 60),
        ('Whole name in colour', *CAPS_BASE, 'k-name',   'w-even',   'g-same', 'p-left', 31, 34, 0.92, 60, 13, 60),
        ('Colour top + bottom', *CAPS_BASE, 'k-codedtag', 'w-coded', 'g-same', 'p-left', 31, 34, 0.92, 60, 13, 60),
        ('Tagline in colour',  *CAPS_BASE, 'k-tag',      'w-even',   'g-same', 'p-left', 31, 34, 0.92, 60, 13, 60),
        ('CODED in a block',   *CAPS_BASE, 'k-block',    'w-even',   'g-same', 'p-left', 31, 34, 0.92, 60, 13, 60),
        ('Coloured underline', *CAPS_BASE, 'k-under',    'w-even',   'g-same', 'p-left', 31, 34, 0.92, 60, 13, 60),
        ('Tighter spacing',    *CAPS_BASE, 'k-coded',    'w-coded',  'g-same', 'p-left', 31, 34, 0.92, 60,  5, 60),
        ('Wider spacing',      *CAPS_BASE, 'k-coded',    'w-coded',  'g-same', 'p-left', 31, 34, 0.92, 60, 22, 60),
        ('Extreme weight split', *CAPS_BASE, 'k-coded',  'w-xsplit', 'g-same', 'p-left', 31, 34, 0.94, 60, 13, 60),
        ('One weight',         *CAPS_BASE, 'k-coded',    'w-even',   'g-same', 'p-left', 31, 34, 0.92, 60, 13, 60),
        ('Small ASSISTANT',    *CAPS_BASE, 'k-coded',    'w-coded',  'g-same', 'p-left', 32, 34, 1.02, 60, 12, 55, 'x-small'),
        ('ASSISTANT on line 2', *CAPS_BASE, 'k-coded',   'w-coded',  'g-mono', 'p-left', 32, 34, 1.04, 60, 12, 52, 'x-line2'),
        ('No tagline',         's-nameasst', 'n-fixed', 'c-all', 'k-coded', 'w-coded', 'g-same', 'p-left', 33, 32, 1.06, 60, 13, 60),
        ('Typewriter tagline', *CAPS_BASE, 'k-coded',    'w-coded',  'g-mono', 'p-left', 31, 34, 0.92, 60, 13, 57),
    ]),
    ('Sizes', [
        ('Live now',           's-all', 'n-theme', 'c-as', 'k-none', 'w-even', 'g-mono', 'p-left', 26, 35, 0.95, 56, -1, 57),
        ('Live, a bit bigger', 's-all', 'n-theme', 'c-as', 'k-none', 'w-even', 'g-mono', 'p-left', 31, 35, 1.02, 58, -1, 57),
        ('One brand font',     's-all', 'n-fixed', 'c-as', 'k-none', 'w-even', 'g-mono', 'p-left', 31, 35, 1.02, 58, -1, 57),
        ('Plain english',      's-all', 'n-fixed', 'c-as', 'k-none', 'w-even', 'g-sans', 'p-left', 31, 35, 1.02, 58, -1, 70),
        ('Big and simple',     's-nameasst', 'n-fixed', 'c-as', 'k-none', 'w-even', 'g-mono', 'p-left', 34, 32, 1.18, 60, -1, 57),
        ('Just the name',      's-name', 'n-fixed', 'c-as', 'k-none', 'w-even', 'g-mono', 'p-left', 34, 32, 1.22, 58, -1, 57),
    ]),
    ('Caps · plain', [
        ('CAPS · one line',     's-nameasst', 'n-fixed', 'c-nameasst', 'k-none', 'w-coded', 'g-mono', 'p-left', 31, 34, 0.92, 58, 12, 57),
        ('CAPS · stacked',      's-all', 'n-fixed', 'c-all', 'k-none', 'w-coded', 'g-same', 'p-left', 31, 34, 0.90, 60, 13, 60),
        ('CAPS · wide + light', 's-all', 'n-fixed', 'c-all', 'k-none', 'w-light', 'g-same', 'p-left', 30, 34, 0.86, 60, 24, 62),
        ('CAPS · tight + heavy', 's-nameasst', 'n-fixed', 'c-nameasst', 'k-none', 'w-black', 'g-mono', 'p-left', 33, 30, 1.02, 60, 2, 57),
        ('CAPS · name only',    's-nametag', 'n-fixed', 'c-name', 'k-none', 'w-even', 'g-same', 'p-left', 32, 34, 1.00, 60, 16, 58),
        ('CAPS · serif',        's-nametag', 'n-serif', 'c-all', 'k-none', 'w-even', 'g-same', 'p-center', 32, 30, 1.02, 62, 14, 58),
    ]),
    ('Colour & weight', [
        ('Coloured "Coded"',    's-all', 'n-fixed', 'c-as', 'k-coded', 'w-coded', 'g-mono', 'p-left', 31, 35, 1.02, 58, -1, 57),
        ('Coloured "You"',      's-all', 'n-fixed', 'c-as', 'k-you', 'w-you', 'g-mono', 'p-left', 31, 35, 1.02, 58, -1, 57),
        ('Coloured "Assistant"', 's-nameasst', 'n-fixed', 'c-as', 'k-asst', 'w-asst', 'g-mono', 'p-left', 31, 35, 1.06, 58, -1, 57),
        ('Coloured tagline',    's-all', 'n-fixed', 'c-as', 'k-tag', 'w-even', 'g-mono', 'p-left', 31, 35, 1.02, 58, -1, 57),
        ('Whole name coloured', 's-nameasst', 'n-fixed', 'c-as', 'k-name', 'w-even', 'g-mono', 'p-left', 31, 35, 1.08, 58, -1, 57),
        ('Flipped hierarchy',   's-all', 'n-fixed', 'c-as', 'k-asst', 'w-light', 'g-mono', 'p-left', 31, 35, 1.06, 58, 1, 57),
        ('Heavy + quiet',       's-nameasst', 'n-fixed', 'c-as', 'k-none', 'w-black', 'g-mono', 'p-left', 33, 32, 1.14, 60, -2, 57),
    ]),
]
GROUPS = [(gname, [row(t) for t in group]) for gname, group in GROUPS]

# "You" needs its own element: with only <b> around "Coded" there is no way to
# colour or weight the first half of the name on its own.
LOGO = (
    '<a href="#" class="logo" onclick="return false"><span class="mark">' + MASCOT + '</span>'
    '<span class="wm"><span class="wm-name"><span class="wm-a">You</span><b>Coded</b></span> '
    '<i>Assistant</i><em>Agents for everyone</em></span></a>'
)
NAVBAR = (
    '<div class="nav-in">' + LOGO +
    '<div class="nav-right"><ul class="nav-links">'
    '<li><a href="#" onclick="return false">About</a></li>'
    '<li><a href="#" onclick="return false">Features</a></li>'
    '<li><a href="#" onclick="return false">FAQ</a></li>'
    '</ul></div></div>'
)


def chips(axis, items, group):
    out = []
    for cls, label, why in items:
        w = html.escape(why, quote=True)
        out.append(
            f'<button class="chip" data-axis="{axis}" data-v="{cls}" data-why="{w}" title="{w}">{label}</button>'
        )
    return f'<div class="grp"><div class="grp-h">{group}</div><div class="chiprow">' + ''.join(out) + '</div></div>'


def stage_style(d):
    # A ratio inside calc() must be UNITLESS -- an earlier '%' here made the
    # whole declaration invalid and the tagline silently rendered full size.
    return (f'--tile:{d["tile"]}px;--tile-r:{d["corner"]}%;--wm-size:{d["wm"]}rem;'
            f'--bar-h:{d["bar"]}px;--wm-track:{d["track"] / 100}em;--tag-size:{d["tag"]}')


stack_rows = ''
for gname, group in GROUPS:
    stack_rows += f'<h2 class="stackh"><span>{gname}</span></h2>'
    for d in group:
        classes = ' '.join(d[k] for k in ('s', 'n', 'c', 'k', 'w', 'g', 'p', 'x'))
        stack_rows += (
            f'<div class="row"><div class="row-tag"><span><b>{d["name"]}</b>'
            f'<i>tile {d["tile"]}px · name {d["wm"]}rem · spacing {d["track"] / 100:+.2f}em</i>'
            f'</span></div>'
            f'<div class="stage {classes}" style="{stage_style(d)}">'
            f'<div class="nav">{NAVBAR}</div></div></div>'
        )

preset_rows = ''
for gname, group in GROUPS:
    btns = ''.join(
        '<button class="pset"'
        + ''.join(f' data-{k}="{d[k]}"' for k in FIELDS if k != 'name')
        + f'>{d["name"]}</button>'
        for d in group
    )
    preset_rows += f'<div class="psetrow"><span class="psetl">{gname}</span>{btns}</div>'

HTML = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>youcoded.ai — header bar options</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,200;0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,800;0,9..40,900;1,9..40,400&family=Fraunces:wght@300;600;700;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{
  --font-ui:'DM Sans',system-ui,sans-serif; --font-mono:'JetBrains Mono',monospace;
  --font-serif:'Fraunces',Georgia,serif;
  --font-theme:'DM Sans',system-ui,sans-serif;
  --wide:1280px;
  --glass:rgba(var(--panel-rgb), var(--panel-op));
  --glass-hi:rgba(255,255,255,.22);
  --hair:rgba(var(--edge-rgb), .55);
}}
html[data-dark="1"]{{ --glass-hi:rgba(255,255,255,.14); --ink:rgba(0,0,0,.42); }}
html[data-dark="0"]{{ --glass-hi:rgba(255,255,255,.55); --ink:rgba(255,255,255,.34); }}
body{{font-family:var(--font-ui);background:#0B0C0E;color:#EDEFF2;min-height:100vh}}

/* ---------- the control chrome. Deliberately neutral grey so it doesn't tint
     your read of bars that are all about colour. ---------- */
.panelbar{{position:sticky;top:0;z-index:200;background:#131519;border-bottom:1px solid rgba(255,255,255,.10);
  padding:10px 18px 11px;display:flex;flex-direction:column;gap:9px;
  max-height:56vh;overflow-y:auto}}
body.compact .axes{{display:none}}
.toggle{{font:inherit;font-size:.78rem;padding:5px 12px;border-radius:8px;cursor:pointer;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#B7BDC5}}
.toggle:hover{{color:#fff}}
.ptop{{display:flex;align-items:center;gap:14px;flex-wrap:wrap}}
.ptitle{{font-family:var(--font-mono);font-size:.64rem;letter-spacing:.14em;text-transform:uppercase;color:#8A9099}}
.seg{{display:flex;gap:4px;background:rgba(255,255,255,.06);padding:4px;border-radius:10px}}
.seg button{{font:inherit;font-size:.82rem;padding:6px 13px;border:0;border-radius:7px;background:none;color:#8A9099;cursor:pointer}}
.seg button.on{{background:rgba(255,255,255,.12);color:#fff}}
.themes{{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}}
.th{{width:26px;height:26px;border-radius:50%;border:1px solid rgba(255,255,255,.18);cursor:pointer;position:relative;padding:0}}
.th span{{position:absolute;inset:5px;border-radius:50%}}
.th.on{{outline:2px solid #5EA9F0;outline-offset:2px}}

.sliders{{display:flex;gap:16px;flex-wrap:wrap;align-items:center;
  padding:8px 12px;border-radius:10px;background:rgba(255,255,255,.04)}}
.sl{{display:flex;align-items:center;gap:7px}}
.sl label{{font-size:.75rem;color:#8A9099;white-space:nowrap;display:flex;align-items:center;gap:6px}}
.sl input[type=range]{{width:104px;accent-color:#5EA9F0}}
.sl b{{font-family:var(--font-mono);font-size:.68rem;color:#C9D1D9;min-width:48px}}
.reset{{font:inherit;font-size:.75rem;padding:5px 11px;border-radius:8px;cursor:pointer;margin-left:auto;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#B7BDC5}}

.axes{{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}}
.grp-h{{font-family:var(--font-mono);font-size:.56rem;letter-spacing:.14em;text-transform:uppercase;color:#6E747C;margin-bottom:5px}}
.chiprow{{display:flex;gap:5px;flex-wrap:wrap}}
.chip{{font:inherit;font-size:.78rem;padding:5px 10px;border-radius:999px;cursor:pointer;white-space:nowrap;
  background:rgba(255,255,255,.05);border:1px solid transparent;color:#B7BDC5}}
.chip:hover{{background:rgba(255,255,255,.09);color:#fff}}
.chip.on{{background:rgba(94,169,240,.16);border-color:rgba(94,169,240,.5);color:#fff}}
.why{{font-size:.75rem;color:#8A9099;min-height:1.2em}}
.why b{{color:#C9D1D9;font-weight:600}}
.psetrow{{display:flex;gap:5px;flex-wrap:wrap;align-items:center}}
.psetl{{font-family:var(--font-mono);font-size:.56rem;letter-spacing:.14em;text-transform:uppercase;
  color:#6E747C;width:104px;flex:none}}
.pset{{font:inherit;font-size:.78rem;padding:5px 11px;border-radius:999px;cursor:pointer;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);color:#B7BDC5}}
.pset:hover{{color:#fff;background:rgba(255,255,255,.10)}}
.hint{{font-size:.74rem;color:#6E747C}}

/* ---------- the canvas the bars sit on: the real wallpaper + the real scrim ---------- */
.canvas{{position:relative;min-height:calc(100vh - 270px);overflow:hidden;background:var(--canvas)}}
.bd{{position:absolute;inset:0;background-size:cover;background-position:center}}
.bd-scrim{{position:absolute;inset:0;background:
  linear-gradient(rgba(var(--canvas-rgb),.30), rgba(var(--canvas-rgb),.62) 55%, rgba(var(--canvas-rgb),.86))}}
.canvas .inner{{position:relative;z-index:2;padding:26px 0 60px}}

/* ---------- the bar itself: copied from the live site, with every number
     Destin can dial exposed as a CSS variable. ---------- */
.stage{{font-family:var(--font-theme);color:var(--fg);
  --tile:26px; --tile-r:35%; --wm-size:.95rem; --bar-h:56px; --wm-track:-.01em; --tag-size:57}}
.nav{{padding:0 18px}}
.nav-in{{max-width:var(--wide);margin:0 auto;min-height:var(--bar-h);padding:0 12px 0 16px;
  display:flex;align-items:center;gap:20px;border-radius:var(--radius);
  background:var(--glass);
  -webkit-backdrop-filter:blur(var(--blur)) saturate(1.5);
  backdrop-filter:blur(var(--blur)) saturate(1.5);
  border:1px solid var(--hair);
  box-shadow:inset 0 1px 0 var(--glass-hi), 0 18px 44px -18px var(--ink)}}
.logo{{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit}}
.mark{{width:var(--tile);height:var(--tile);border-radius:var(--tile-r);
  background:var(--accent);color:var(--on-accent);display:grid;place-items:center;flex:none}}
.mark-bot{{width:62%;height:62%}}
.mark-bot path,.mark-bot rect{{fill:currentColor}}
.wm{{font-size:var(--wm-size);line-height:1.14}}
.wm-name,.wm i{{letter-spacing:var(--wm-track)}}
.wm-a{{font-weight:400}}
.wm b{{font-weight:800}}
.wm i{{font-style:normal;font-weight:500;opacity:.45}}
.wm em{{display:block;font-style:normal;font-family:var(--font-mono);
  font-size:calc(var(--wm-size) * var(--tag-size) / 100);letter-spacing:.1em;
  text-transform:uppercase;opacity:.5;margin-top:2px}}
.nav-right{{margin-left:auto;display:flex;align-items:center;gap:18px}}
.nav-links{{display:flex;gap:20px;list-style:none}}
.nav-links a{{text-decoration:none;font-size:.86rem;font-weight:600;opacity:.72;color:inherit}}

/* ================= THE MARK =============================================== */
/* i-tile is the live one and needs no rule. The glass tile is the same material
   as the bar, so the robot has to be painted IN the accent rather than knocked
   out of it -- which puts a second accent-coloured object next to a coloured
   word, and that is the thing worth judging here. */
.i-glass .mark{{background:var(--glass);color:var(--accent);border:1px solid var(--hair);
  box-shadow:inset 0 1px 0 var(--glass-hi)}}
.i-bare .mark{{background:none;color:var(--accent);border-radius:0}}
.i-bare .mark-bot{{width:100%;height:100%}}
.i-circle .mark{{border-radius:50%}}
.i-ink .mark{{background:var(--fg);color:var(--canvas)}}

/* ================= WHAT THE BAR SAYS ====================================== */
.s-nameasst .wm em{{display:none}}
.s-nametag .wm i{{display:none}}
.s-name .wm i,.s-name .wm em{{display:none}}

/* ================= TYPEFACE =============================================== */
/* n-theme is the LIVE behaviour: no font-family here, so .wm inherits the
   THEME's font and the logo changes shape in every theme. */
.n-fixed .wm{{font-family:'DM Sans',system-ui,sans-serif}}
.n-serif .wm{{font-family:var(--font-serif)}}

/* ================= CASE =================================================== */
.c-lower .wm-name,.c-lower .wm i{{text-transform:lowercase}}
.c-name .wm-name{{text-transform:uppercase}}
.c-nameasst .wm-name,.c-nameasst .wm i{{text-transform:uppercase}}
.c-all .wm-name,.c-all .wm i,.c-all .wm em{{text-transform:uppercase}}

/* ================= COLOUR ================================================= */
/* Every option paints exactly one part, so they read as distinct choices rather
   than as "more colour" vs "less colour". */
.k-coded .wm b{{color:var(--accent)}}
.k-you .wm-a{{color:var(--accent)}}
.k-asst .wm i{{color:var(--accent);opacity:1}}
.k-tag .wm em{{color:var(--accent);opacity:.95}}
.k-codedtag .wm b{{color:var(--accent)}}
.k-codedtag .wm em{{color:var(--accent);opacity:.95}}
.k-name .wm-name{{color:var(--accent)}}
/* Not coloured letters: a filled block, the same material as the tile, with the
   word knocked out of it. Inline-block so its padding cannot fight line-height. */
.k-block .wm b{{display:inline-block;background:var(--accent);color:var(--on-accent);
  padding:0 7px 1px 6px;margin-left:3px;border-radius:7px;line-height:1.18}}
/* Letters stay plain; the colour is a rule under the whole name. */
.k-under .wm-name{{border-bottom:2px solid var(--accent);padding-bottom:2px}}

/* ================= WEIGHT ================================================= */
.w-even .wm-a,.w-even .wm b{{font-weight:700}} .w-even .wm i{{font-weight:700}}
.w-coded .wm-a{{font-weight:400}} .w-coded .wm b{{font-weight:800}} .w-coded .wm i{{font-weight:500}}
.w-xsplit .wm-a{{font-weight:200}} .w-xsplit .wm b{{font-weight:900}} .w-xsplit .wm i{{font-weight:400}}
.w-you .wm-a{{font-weight:800}}   .w-you .wm b{{font-weight:400}}   .w-you .wm i{{font-weight:500}}
.w-asst .wm-a,.w-asst .wm b{{font-weight:700}}
.w-asst .wm i{{font-weight:800;opacity:.9}}
.w-light .wm-a,.w-light .wm b{{font-weight:300}} .w-light .wm i{{font-weight:300;opacity:.55}}
.w-black .wm-a,.w-black .wm b{{font-weight:900}} .w-black .wm i{{font-weight:400;opacity:.5}}
/* Fraunces ships 300/600/700/900 -- it has no 200 or 800 to fall back on. */
.n-serif.w-coded .wm b,.n-serif.w-black .wm-a,.n-serif.w-black .wm b,
.n-serif.w-xsplit .wm b{{font-weight:900}}
.n-serif.w-light .wm-a,.n-serif.w-light .wm b,.n-serif.w-xsplit .wm-a{{font-weight:300}}

/* ================= "ASSISTANT" ============================================ */
.x-small .wm i{{font-size:calc(var(--wm-size) * .62);letter-spacing:.16em;opacity:.42;
  margin-left:2px;position:relative;top:-1px}}
/* Line one becomes purely the name; "Assistant" joins the tagline beneath it. */
.x-line2 .wm-name{{display:block}}
.x-line2 .wm i{{display:inline;font-family:var(--font-mono);font-weight:500;opacity:.5;
  font-size:calc(var(--wm-size) * var(--tag-size) / 100);letter-spacing:.1em}}
.x-line2 .wm i::after{{content:'\\00a0\\00a0\\00b7\\00a0'}}
.x-line2 .wm em{{display:inline;margin-top:0}}
/* With no tagline there is nothing for it to join, so it stays a small label. */
.x-line2.s-nameasst .wm i::after,.x-line2.s-name .wm i::after{{content:''}}

/* ================= TAGLINE ================================================ */
.g-same .wm em{{font-family:inherit;letter-spacing:var(--wm-track);font-weight:500}}
.g-sans .wm em{{font-family:inherit;text-transform:none;letter-spacing:0;
  font-size:calc(var(--wm-size) * .70);opacity:.6;font-weight:500;margin-top:0}}
.g-chip .wm em{{display:inline-block;margin:0 0 0 10px;padding:3px 9px;border-radius:999px;
  background:rgba(var(--fg-rgb),.09);border:1px solid rgba(var(--fg-rgb),.10);
  opacity:.72;vertical-align:2px;font-size:calc(var(--wm-size) * .52)}}

/* ================= PLACEMENT ============================================== */
.p-center .nav-in{{position:relative;justify-content:center}}
.p-center .nav-right{{position:absolute;right:12px;top:50%;transform:translateY(-50%);margin-left:0}}

/* Optional full stop after the name. */
body.dot-on .wm-name::after{{content:'.'}}

/* ---------- single mode: some page under the bar, for context ---------- */
.hero{{max-width:var(--wide);margin:50px auto 0;padding:0 30px;text-align:center;
  font-family:var(--font-theme);color:var(--fg)}}
.kicker{{font-family:var(--font-mono);font-size:.8rem;font-weight:500;letter-spacing:.15em;
  text-transform:uppercase;opacity:.9;margin-bottom:9px}}
.hero h1{{font-family:var(--font-ui);font-size:clamp(2.4rem,5.4vw,4.2rem);font-weight:900;
  letter-spacing:-.05em;line-height:.97}}
.hero h1 em{{font-style:normal;color:var(--accent)}}
.hero p{{font-size:1.06rem;margin-top:13px;opacity:.85}}

/* ---------- stack mode ---------- */
.stackh{{max-width:var(--wide);margin:6px auto 14px;padding:0 30px;font-size:.72rem;font-weight:600;
  letter-spacing:.16em;text-transform:uppercase;color:#fff}}
.stackh span{{background:rgba(10,11,13,.8);padding:5px 12px;border-radius:999px}}
.row{{margin-bottom:30px}}
.row-tag{{max-width:var(--wide);margin:0 auto 7px;padding:0 30px}}
.row-tag>span{{display:inline-flex;align-items:baseline;gap:9px;padding:4px 11px;border-radius:999px;
  background:rgba(10,11,13,.78)}}
.row-tag b{{font-size:.82rem;color:#fff}}
.row-tag i{{font-style:normal;font-family:var(--font-mono);font-size:.6rem;letter-spacing:.08em;
  color:rgba(255,255,255,.55)}}
#stack{{display:none}}
body.mode-stack #single{{display:none}}
body.mode-stack #stack{{display:block}}
/* In "see all at once" every row carries its own sizes, so the sliders would be
   lying about what you are looking at. Disabled there rather than ignored. */
body.mode-stack .sliders{{opacity:.3;pointer-events:none}}
</style>
</head>
<body class="mode-single">

<div class="panelbar">
  <div class="ptop">
    <div class="ptitle">youcoded.ai header bar &middot; round 6</div>
    <div class="seg">
      <button id="m-single" class="on">Try one</button>
      <button id="m-stack">See all at once</button>
    </div>
    <button class="toggle" id="t-axes">Fine-tune &#9662;</button>
    <span class="hint" id="now">Live now</span>
    <div class="themes" id="themes"></div>
  </div>

  <div class="sliders">
    <div class="sl"><label>Tile</label><input type="range" id="s-tile" min="20" max="46" step="1"><b id="v-tile"></b></div>
    <div class="sl"><label>Corners</label><input type="range" id="s-corner" min="0" max="50" step="1"><b id="v-corner"></b></div>
    <div class="sl"><label>Name size</label><input type="range" id="s-wm" min="70" max="150" step="1"><b id="v-wm"></b></div>
    <div class="sl"><label>Letter spacing</label><input type="range" id="s-track" min="-4" max="34" step="1"><b id="v-track"></b></div>
    <div class="sl"><label>Tagline size</label><input type="range" id="s-tag" min="40" max="95" step="1"><b id="v-tag"></b></div>
    <div class="sl"><label>Bar height</label><input type="range" id="s-bar" min="46" max="84" step="1"><b id="v-bar"></b></div>
    <div class="sl"><label><input type="checkbox" id="s-dot"> full stop</label></div>
    <button class="reset" id="reset">Back to what's live</button>
  </div>

  <div id="psets">{preset_rows}</div>
  <div class="axes" id="axes">
    {chips('i', ICONS, 'Mark')}
    {chips('s', SAYS, 'What it says')}
    {chips('c', CASE, 'Case')}
    {chips('k', COLOUR, 'Colour on')}
    {chips('w', WEIGHT, 'Weight')}
    {chips('x', ASSIST, '"Assistant"')}
    {chips('n', FONTS, 'Typeface')}
    {chips('g', TAGLINE, 'Tagline')}
    {chips('p', PLACE, 'Placement')}
  </div>
  <div class="why" id="why"></div>
</div>

<div class="canvas">
  <div class="bd" id="bd"></div><div class="bd-scrim"></div>
  <div class="inner">
    <div id="single">
      <div class="stage" id="stage"><div class="nav">{NAVBAR}</div></div>
      <div class="hero">
        <p class="kicker">Free &middot; Open source &middot; BYO model</p>
        <h1>More than a <em>chatbot</em>.</h1>
        <p>A self-improving, customizable AI agent. Use any AI model from any provider.</p>
      </div>
    </div>
    <div id="stack">{stack_rows}</div>
  </div>
</div>

<script>
var THEMES = {THEMES_JSON};
var WALL = '{WALL_PREFIX}';
function rgb(h){{ h=(h||'#000').replace('#',''); if(h.length===3) h=h.split('').map(function(c){{return c+c}}).join('');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)].join(','); }}
var fontLinks = {{}};
function applyTheme(slug){{
  var t = THEMES[slug]; if(!t) return;
  var r = document.documentElement.style;
  r.setProperty('--panel-rgb', rgb(t.panel));
  r.setProperty('--accent-rgb', rgb(t.accent));
  r.setProperty('--canvas-rgb', rgb(t.canvas));
  r.setProperty('--fg-rgb', rgb(t.fg));
  r.setProperty('--edge-rgb', rgb(t.edge));
  r.setProperty('--canvas', t.canvas); r.setProperty('--accent', t.accent);
  r.setProperty('--on-accent', t.onAccent); r.setProperty('--fg', t.fg);
  r.setProperty('--radius', t.radius); r.setProperty('--blur', t.blur + 'px');
  r.setProperty('--panel-op', t.opacity);
  document.documentElement.setAttribute('data-dark', t.dark ? '1' : '0');
  if (t.fontUrl && !fontLinks[t.fontUrl]) {{
    var l = document.createElement('link'); l.rel='stylesheet'; l.href=t.fontUrl;
    document.head.appendChild(l); fontLinks[t.fontUrl]=1;
  }}
  r.setProperty('--font-theme', t.font || "'DM Sans', system-ui, sans-serif");
  var bd = document.getElementById('bd');
  bd.style.background = t.gradient ? t.gradient : (t.wall ? 'url("' + WALL + t.wall + '")' : t.canvas);
  bd.style.backgroundSize = 'cover'; bd.style.backgroundPosition = 'center';
  document.querySelectorAll('.th').forEach(function(b){{ b.classList.toggle('on', b.dataset.slug === slug); }});
  try {{ localStorage.setItem('yc-navpreview-theme', slug); }} catch(e){{}}
}}

var tw = document.getElementById('themes');
Object.keys(THEMES).forEach(function(slug){{
  var t = THEMES[slug];
  var b = document.createElement('button');
  b.className = 'th'; b.dataset.slug = slug; b.title = t.name;
  b.style.background = t.canvas;
  b.innerHTML = '<span style="background:' + t.accent + '"></span>';
  b.onclick = function(){{ applyTheme(slug); }};
  tw.appendChild(b);
}});

var CLASS_AXES = ['s','n','c','k','w','g','p','x','i'];
var NUM_AXES = ['tile','corner','wm','bar','track','tag'];
var LIVE = {{ s:'s-all', n:'n-theme', c:'c-as', k:'k-none', w:'w-even', g:'g-mono', p:'p-left',
              x:'x-same', i:'i-tile', tile:26, corner:35, wm:95, bar:56, track:-1, tag:57, dot:false }};
// First load lands on the combination asked for, not on the live baseline --
// "Back to what's live" is one click away and is what LIVE is for.
var START = {{ s:'s-all', n:'n-fixed', c:'c-all', k:'k-you', w:'w-even', g:'g-same', p:'p-left',
               x:'x-same', i:'i-glass', tile:38, corner:32, wm:94, bar:64, track:22, tag:60, dot:false }};
var sel = Object.assign({{}}, START);

var els = {{}};
NUM_AXES.forEach(function(k){{ els[k] = document.getElementById('s-' + k); }});
els.dot = document.getElementById('s-dot');

function setMode(stack){{
  document.body.className = (stack ? 'mode-stack' : 'mode-single') + (sel.dot ? ' dot-on' : '')
    + (document.body.classList.contains('compact') ? ' compact' : '');
  document.getElementById('m-stack').classList.toggle('on', stack);
  document.getElementById('m-single').classList.toggle('on', !stack);
}}

// What the chips currently add up to, in words. Shown whenever you are not
// hovering an option, so the line never describes something you already left.
function summary(){{
  var el = document.getElementById('why'); if (!el) return;
  var picked = [];
  document.querySelectorAll('.chip.on').forEach(function(c){{ picked.push(c.textContent); }});
  el.innerHTML = '<b>Showing</b> — ' + picked.join(' &nbsp;·&nbsp; ');
}}

function paint(){{
  var stage = document.getElementById('stage');
  stage.className = 'stage ' + CLASS_AXES.map(function(k){{ return sel[k]; }}).join(' ');
  stage.style.setProperty('--tile', sel.tile + 'px');
  stage.style.setProperty('--tile-r', sel.corner + '%');
  stage.style.setProperty('--wm-size', (sel.wm / 100) + 'rem');
  stage.style.setProperty('--bar-h', sel.bar + 'px');
  stage.style.setProperty('--wm-track', (sel.track / 100) + 'em');
  stage.style.setProperty('--tag-size', sel.tag);
  document.body.classList.toggle('dot-on', !!sel.dot);

  NUM_AXES.forEach(function(k){{ els[k].value = sel[k]; }});
  els.dot.checked = !!sel.dot;
  document.getElementById('v-tile').textContent = sel.tile + 'px';
  document.getElementById('v-corner').textContent = sel.corner + '%';
  document.getElementById('v-wm').textContent = (sel.wm / 100).toFixed(2) + 'rem';
  document.getElementById('v-bar').textContent = sel.bar + 'px';
  document.getElementById('v-track').textContent = (sel.track >= 0 ? '+' : '') + (sel.track / 100).toFixed(2) + 'em';
  document.getElementById('v-tag').textContent = sel.tag + '%';

  document.querySelectorAll('.chip').forEach(function(c){{
    c.classList.toggle('on', sel[c.dataset.axis] === c.dataset.v);
  }});
  var p = null;
  document.querySelectorAll('.pset').forEach(function(b){{
    var d = b.dataset, same = true;
    CLASS_AXES.forEach(function(k){{ if (d[k] !== sel[k]) same = false; }});
    NUM_AXES.forEach(function(k){{
      var v = (k === 'wm') ? Math.round(d[k] * 100) : +d[k];
      if (v !== sel[k]) same = false;
    }});
    if (same) p = b.textContent;
  }});
  document.getElementById('now').textContent = p ? p
    : ('tile ' + sel.tile + 'px · name ' + (sel.wm/100).toFixed(2) + 'rem · '
       + (sel.track >= 0 ? '+' : '') + (sel.track/100).toFixed(2) + 'em');
  summary();
  try {{ localStorage.setItem('yc-navpreview-sel6', JSON.stringify(sel)); }} catch(e){{}}
}}

var whyEl = document.getElementById('why');
function showWhy(c){{ whyEl.innerHTML = '<b>' + c.textContent + '</b> — ' + c.dataset.why; }}
document.querySelectorAll('.chip').forEach(function(c){{
  c.onclick = function(){{ sel[c.dataset.axis] = c.dataset.v; showWhy(c); paint(); }};
  c.onmouseenter = function(){{ showWhy(c); }};
}});
document.getElementById('axes').onmouseleave = summary;

NUM_AXES.forEach(function(k){{
  els[k].oninput = function(){{ sel[k] = +this.value; paint(); }};
}});
els.dot.onchange = function(){{ sel.dot = this.checked; paint(); }};

document.querySelectorAll('.pset').forEach(function(b){{
  b.onclick = function(){{
    var d = b.dataset;
    CLASS_AXES.forEach(function(k){{ sel[k] = d[k]; }});
    NUM_AXES.forEach(function(k){{ sel[k] = (k === 'wm') ? Math.round(d[k] * 100) : +d[k]; }});
    setMode(false); paint(); }};
}});
document.getElementById('reset').onclick = function(){{ sel = Object.assign({{}}, LIVE); paint(); }};
// Options collapsed on load: pick a preset first, open the axes to adjust it.
var tAxes = document.getElementById('t-axes');
function setCompact(on){{
  document.body.classList.toggle('compact', on);
  tAxes.innerHTML = on ? 'Fine-tune \u25BE' : 'Hide options \u25B4';
  try {{ localStorage.setItem('yc-navpreview-compact', on ? '1' : '0'); }} catch(e){{}}
}}
tAxes.onclick = function(){{ setCompact(!document.body.classList.contains('compact')); }};

document.getElementById('m-single').onclick = function(){{ setMode(false); }};
document.getElementById('m-stack').onclick = function(){{ setMode(true); }};

var savedSel = null;
try {{ savedSel = JSON.parse(localStorage.getItem('yc-navpreview-sel6')); }} catch(e){{}}
if (savedSel && savedSel.s && savedSel.k) sel = Object.assign({{}}, LIVE, savedSel);
var savedTheme = null;
try {{ savedTheme = localStorage.getItem('yc-navpreview-theme'); }} catch(e){{}}
applyTheme(savedTheme && THEMES[savedTheme] ? savedTheme : 'cotton-candy-sky');
var savedCompact = null;
try {{ savedCompact = localStorage.getItem('yc-navpreview-compact'); }} catch(e){{}}
setCompact(savedCompact !== '0');
paint();
window.__navPreviewReady = true;
</script>
</body>
</html>
'''

out = os.path.join(HERE, 'nav-variants.html')
open(out, 'w', encoding='utf-8').write(HTML)
print('wrote ' + out)
