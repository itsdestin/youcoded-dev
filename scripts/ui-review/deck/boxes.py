"""Highlight-box maths. Two sources of truth for a box, neither hand-typed:
 - the rig measured an element (window pixels) → rect_to_pct maps it into the crop;
 - nothing was named → diff_bbox finds what changed between the before and after crops.
WHY: v1 decks carried hand-estimated percentages (hand-off gap 3) and the rings drifted."""
import re
import subprocess

GEO = re.compile(r'(\d+)x(\d+)\+(\d+)\+(\d+)')


def parse_geometry(geo):
    m = GEO.fullmatch(geo)
    if not m:
        raise ValueError(f'bad geometry {geo!r}, want WxH+X+Y')
    w, h, x, y = map(int, m.groups())
    return w, h, x, y


def _r(v):
    return round(v, 2)


def rect_to_pct(rect, geo):
    """Window-pixel rect {x,y,w,h} → [x%, y%, w%, h%] of the crop, clipped; None when outside."""
    cw, ch, cx, cy = parse_geometry(geo)
    x0, y0 = max(rect['x'], cx), max(rect['y'], cy)
    x1, y1 = min(rect['x'] + rect['w'], cx + cw), min(rect['y'] + rect['h'], cy + ch)
    if x1 <= x0 or y1 <= y0:
        return None
    return [_r((x0 - cx) / cw * 100), _r((y0 - cy) / ch * 100), _r((x1 - x0) / cw * 100), _r((y1 - y0) / ch * 100)]


def image_size(png):
    out = subprocess.run(['magick', 'identify', '-format', '%w %h', png], capture_output=True, text=True, check=True).stdout.split()
    return int(out[0]), int(out[1])


def px_to_pct(box, size):
    W, H = size
    return [_r(box['x'] / W * 100), _r(box['y'] / H * 100), _r(box['w'] / W * 100), _r(box['h'] / H * 100)]


def diff_bbox(a, b, threshold='6%', pad=6):
    """Bounding box (crop pixels) of what differs between two same-size PNGs; None if nothing does.
    `%@` is ImageMagick's trim box of the thresholded difference (`0x0+W+H` when nothing differs).
    A 1-px black border is added before the trim: without it, a whole-image change (every pixel
    white/differing, no untouched edge anywhere) trims to the same degenerate `0x0+W+H` as a
    truly-identical image — trim has nothing to shrink from either way. The border gives it an
    edge to shrink from in both cases, so "nothing differs" and "everything differs" stop being
    the same answer; the box is then shifted +1,+1 by the border, so x and y are corrected back.
    The 3×3 dilate (`Square:1` — `Square:3` would be 7×7 and grow the box 3 px a side) joins
    hairline changes into one region.
    Different sizes → None (the step then lands in `missing:` and the deck refuses to build)."""
    # WHY the size guard: comparing a Before and an After captured at different window widths
    # makes ImageMagick pad the smaller one, so EVERY pixel past the narrower edge reads as
    # "changed" — a confident ring drawn in the wrong place. A refusal is the only honest answer.
    W, H = image_size(a)
    if image_size(b) != (W, H):
        return None
    out = subprocess.run(['magick', a, b, '-compose', 'difference', '-composite', '-threshold', threshold,
                          '-morphology', 'Dilate', 'Square:1', '-bordercolor', 'black', '-border', '1',
                          '-format', '%@', 'info:'],
                         capture_output=True, text=True, check=True).stdout.strip()
    m = GEO.fullmatch(out)
    if not m:
        return None
    w, h, x, y = map(int, m.groups())
    x, y = x - 1, y - 1
    if w * h < 4:
        return None
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(W, x + w + pad), min(H, y + h + pad)
    return {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}
