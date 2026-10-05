#!/usr/bin/env python3
"""Draw the glass buddy rig for a theme from the default buddy's skeleton.

WHY (theme questions deck T-4, Destin 2026-10-04: "a full glass buddy" — the mascot should
match the app icon): the buddy keeps the default rig's parts, pivots and eight faces (so
every pose and animation in mascot-poses.ts works unchanged), and is redressed in the
icon's look (brand identity rounds 11-31): the body panel shows the theme's picture
heavily blurred with a white lift, a thin rim in the theme's deep colour, a soft shadow
all round, dark oval eyes with one sparkle and the soft smile ("soft2").

The blur is baked into an embedded PNG (the rig sanitizer allows raster data URIs), so
nothing blurs at run time while the buddy moves (performance rule 6).

Usage:
    python3 scripts/brand/glass-buddy.py <wallpaper.jpg> <out-dir> <slug> [--rim #7A3FA8]
Writes <out-dir>/<slug>-mascot-rig.svg and one still per face:
    <slug>-mascot-{idle,welcome,inquisitive,shocked}.svg
"""
import argparse
import base64
import os
import re
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
RIG_TS = os.path.join(HERE, '..', '..', 'youcoded', 'desktop', 'src', 'renderer', 'components', 'mascot', 'default-buddy-rig.ts')

BODY = 'M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z'
EYE, SPARKLE = '#2A1046', '#FFFFFF'


def texture(wall: str, tmp: str, tint: str) -> str:
    """The face panel's inside: the icon's own colour run, top to bottom (pink, lavender,
    periwinkle — sampled from the shipped icon.png's face), with the theme's picture laid
    over it at a quarter strength, blurred, so it is still "the theme seen through glass".

    WHY the icon's colours lead (deck glass-buddy-1 GB-1, Destin: "the icon definitely seems
    more colorful/saturated than this buddy"): the YouCoded picture alone is paler than the
    picture the icon's face shows, so the buddy read washed-out next to the icon."""
    out = os.path.join(tmp, 'tex.png')
    top, mid, bot = tint.split(',')
    subprocess.run([
        'magick',
        '(', '-size', '210x90', f'gradient:{top}-{mid}', '-size', '210x90', f'gradient:{mid}-{bot}', '-append', ')',
        '(', wall, '-gravity', 'northwest', '-resize', '1600x', '-crop', '700x600+640+160', '+repage',
        '-resize', '210x180!', '-blur', '0x14', '-modulate', '100,150',
        '-alpha', 'set', '-channel', 'A', '-evaluate', 'set', '25%', '+channel', ')', '-composite',
        # The lighter band across the eyes the icon has, so the dark eyes read.
        '(', '-size', '210x180', 'radial-gradient:rgba(255,255,255,0.32)-rgba(255,255,255,0)', '-roll', '+0-25', ')', '-composite',
        '-strip', '-quality', '90', out,
    ], check=True)
    return base64.b64encode(open(out, 'rb').read()).decode()


def mouth(cx=12.0, cy=13.1, w=3.3):
    """The icon's soft smile (soft2), mapped from its 10x6 box into rig units."""
    k = w / 10
    pts = 'M2.6 1.6 Q5 1.0 7.4 1.6 Q8.2 1.8 7.9 2.7 Q6.8 5.0 5 5.0 Q3.2 5.0 2.1 2.7 Q1.8 1.8 2.6 1.6 Z'
    x0, y0 = cx - w / 2, cy - w * .6 / 2

    def m(match):
        x, y = float(match.group(1)), float(match.group(2))
        return f'{x0 + x * k:.3f} {y0 + y * k:.3f}'
    return re.sub(r'(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)', m, pts)


def eye(cx, cy, rx, ry):
    """Dark oval with one sparkle up and to the right, as on the icon."""
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{EYE}"/>'
            f'<ellipse cx="{cx + .24 * rx:.3f}" cy="{cy - .42 * ry:.3f}" rx="{.36 * rx:.3f}" ry="{.26 * ry:.3f}" fill="{SPARKLE}"/>')


def faces():
    """Eight faces on the default rig's positions, in the icon's style."""
    smile = f'<path d="{mouth()}" fill="{EYE}"/>'
    open_eyes = eye(9.3, 9.55, 1.79, 2.46) + eye(14.7, 9.25, 1.79, 2.46)
    arc = lambda d, w=.85: f'<path d="{d}" fill="none" stroke="{EYE}" stroke-width="{w}" stroke-linecap="round"/>'
    brow = lambda d: f'<path d="{d}" fill="none" stroke="{EYE}" stroke-width=".5" stroke-linecap="round"/>'
    return {
        # Idle on the icon is the open-eyed face; the default rig's sleepy arcs read as
        # "not the icon", so idle shows the icon's face too and blink gives the rest.
        'idle': open_eyes + smile,
        'welcome': open_eyes + smile,
        'curious': open_eyes + brow('M8 7.1 L10.6 6.9') + brow('M13.35 6.6 Q14.7 5.7 16.05 6')
        + f'<ellipse cx="12.05" cy="13.35" rx=".45" ry=".5" fill="{EYE}"/>',
        'shocked': eye(9.3, 9.7, 2.0, 2.75) + eye(14.7, 9.4, 2.0, 2.75)
        + brow('M7.95 6.3 Q9.3 5.7 10.65 6.3') + brow('M13.35 6.0 Q14.7 5.4 16.05 6.0')
        + f'<ellipse cx="12" cy="13.8" rx=".7" ry=".85" fill="{EYE}"/>',
        'dizzy': arc('M9.3 9.8 a.3 .3 0 0 1 .3 .3 a.6 .6 0 0 1 -.6 .6 a.9 .9 0 0 1 -.9 -.9 a1.2 1.2 0 0 1 1.2 -1.2 a1.3 1.3 0 0 1 1.3 1.3', .6)
        + arc('M14.7 9.6 a.3 .3 0 0 1 .3 .3 a.6 .6 0 0 1 -.6 .6 a.9 .9 0 0 1 -.9 -.9 a1.2 1.2 0 0 1 1.2 -1.2 a1.3 1.3 0 0 1 1.3 1.3', .6)
        + arc('M10.4 13.6 L11.2 13 L12 13.6 L12.8 13 L13.6 13.6', .8),
        'blink': arc('M7.8 10 Q9.3 10.6 10.8 10') + arc('M13.2 9.8 Q14.7 10.4 16.2 9.8') + smile,
        'happy': arc('M8 10.4 Q9.3 8.6 10.6 10.4', .9) + arc('M13.4 10.1 Q14.7 8.3 16 10.1', .9) + f'<path d="{mouth(w=3.9)}" fill="{EYE}"/>',
        'shutdown': arc('M8 10 L10.6 10', .8) + arc('M13.4 9.8 L16 9.8', .8) + arc('M11.3 13.3 L12.7 13.3', .5),
    }


def limb_rect(x, y, w, h, r, rim):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="url(#g-limb)"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="url(#g-limb-hi)"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="none" stroke="{rim}" stroke-width=".16"/>')


def build(tex_b64: str, rim: str, tint: str, show: str | None) -> str:
    top, mid, bot = tint.split(',')
    f = faces()
    face_groups = ''.join(
        f'<g id="rig-face-{n}"{"" if (n == (show or "idle")) else " style=\"display:none\""}>{svg}</g>'
        for n, svg in f.items())
    hand = lambda x: (f'<rect x="{x}" y="8.3" width="2.6" height="3.4" rx="1.17" fill="url(#g-limb)" '
                      f'stroke="{rim}" stroke-width=".16"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -5 30 30" data-default-mascot="rig">
  <defs>
    <clipPath id="c-body"><path d="{BODY}"/></clipPath>
    <radialGradient id="g-halo" cx="50%" cy="55%" r="50%">
      <stop offset="55%" stop-color="#28055A" stop-opacity=".2"/>
      <stop offset="100%" stop-color="#28055A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g-shine" cx="28%" cy="6%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".5"/>
      <stop offset="60%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <!-- WHY one colour run in rig space for every limb (deck glass-buddy-2 GB2-2, Destin:
         "the hands/feet need to look like a continuation of the same background used for
         the body"): the body's run goes top 4 -> bottom 16; the limbs carry it on to 21,
         so arms beside the middle are lavender and feet below are periwinkle. -->
    <linearGradient id="g-limb" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="21">
      <stop offset="0" stop-color="{top}"/>
      <stop offset=".353" stop-color="{mid}"/>
      <stop offset=".706" stop-color="{bot}"/>
      <stop offset="1" stop-color="{bot}"/>
    </linearGradient>
    <linearGradient id="g-limb-hi" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".45"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g id="rig-root">
    <!-- The soft glow sits behind everything: inside rig-body it was painted over the hands
         and feet (deck glass-buddy-2 GB2-1). -->
    <ellipse cx="12" cy="11.5" rx="11" ry="10.5" fill="url(#g-halo)"/>
    <g id="rig-arm-left" data-pivot="2.5 9">{limb_rect(1, 9, 3, 4, .8, rim)}</g>
    <g id="rig-arm-right" data-pivot="21.5 9">{limb_rect(20, 9, 3, 4, .8, rim)}<g id="slot-item"/></g>
    <g id="rig-leg-left" data-pivot="8.95 17">{limb_rect(7.2, 17, 3.5, 4, 1.2, rim)}</g>
    <g id="rig-leg-right" data-pivot="15.05 17">{limb_rect(13.3, 17, 3.5, 4, 1.2, rim)}</g>
    <g id="rig-body">
      <g clip-path="url(#c-body)">
        <image href="data:image/png;base64,{tex_b64}" x="5" y="4" width="14" height="12" preserveAspectRatio="none"/>
        <rect x="5" y="4" width="14" height="12" fill="url(#g-shine)"/>
      </g>
      <path d="{BODY}" fill="none" stroke="{rim}" stroke-width=".2"/>
      <path d="M5.45 10.3 L5.45 8 A3.55 3.55 0 0 1 9 4.45 L11.5 4.45" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width=".22" stroke-linecap="round"/>
      {face_groups}
      <g id="slot-eyewear"/>
    </g>
    <g id="slot-hat"/>
    <g id="rig-hand-peek-right" style="display:none">{hand(20.7)}</g>
    <g id="rig-hand-peek-left" style="display:none">{hand(0.7)}</g>
  </g>
</svg>
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('wall')
    ap.add_argument('out')
    ap.add_argument('slug')
    ap.add_argument('--rim', default='#7A3FA8')
    ap.add_argument('--tint', default='#FBC8F8,#D6BAFF,#8E88F4', help="colour run top,middle,bottom (the icon face's)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tex = texture(a.wall, tmp, a.tint)
    open(os.path.join(a.out, f'{a.slug}-mascot-rig.svg'), 'w').write(build(tex, a.rim, a.tint, None))
    # Stills for the places that show a picture instead of the moving rig (Android, the
    # flat variants): the rig with one face showing.
    for still, face in [('idle', 'idle'), ('welcome', 'welcome'), ('inquisitive', 'curious'), ('shocked', 'shocked')]:
        open(os.path.join(a.out, f'{a.slug}-mascot-{still}.svg'), 'w').write(build(tex, a.rim, a.tint, face))
    print('wrote', a.out)


if __name__ == '__main__':
    main()
