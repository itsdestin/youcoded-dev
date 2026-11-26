# scripts/ui-review/deck/shotmark.py
"""Reads (and, for a crop, carries over) the label `shoot` and `explore` write into every real screenshot.

WHY (Destin, 2026-11-23: "it make fully custom/unique mockup ui's instead of basing on the real app?"): a deck's design
options were photographs of hand-written HTML pasted into a frozen copy of a screen. The writer is
scripts/shoot/shotmark.mjs (it says why); this side lets the deck builder refuse a question's or option's picture
that does not carry the label, and lets a session crop a real screenshot without losing it (`crop-shot`)."""
import json
import struct
import zlib

KEY = b'youcoded-shot'
SIG = b'\x89PNG\r\n\x1a\n'


def read_mark(path):
    """The label's info dict, or None (not a PNG, no label, unreadable)."""
    try:
        with open(path, 'rb') as f:
            data = f.read()
    except OSError:
        return None
    if not data.startswith(SIG):
        return None
    at = 8
    while at + 8 <= len(data):
        n, typ = struct.unpack('>I4s', data[at:at + 8])
        if typ == b'tEXt':
            body = data[at + 8:at + 8 + n]
            key, _, text = body.partition(b'\x00')
            if key == KEY:
                try:
                    return json.loads(text.decode('latin-1'))
                except ValueError:
                    return None
        if typ in (b'IDAT', b'IEND'):
            return None
        at += 12 + n
    return None


def _with_mark(png_bytes, info):
    """Insert the label right after the header (the same place shotmark.mjs puts it)."""
    body = KEY + b'\x00' + json.dumps(info).encode('latin-1')
    chunk = struct.pack('>I', len(body)) + b'tEXt' + body + struct.pack('>I', zlib.crc32(b'tEXt' + body) & 0xffffffff)
    end = 8 + 4 + 4 + 13 + 4
    return png_bytes[:end] + chunk + png_bytes[end:]


def crop_shot(src, dst, box):
    """Cut `box` (left, top, width, height in pixels) out of a labelled screenshot and keep the label, noting the crop.
    Refuses a picture without the label: cropping does not make a drawing real."""
    info = read_mark(src)
    if info is None:
        raise ValueError(f'{src} is not a real screenshot (no label from shoot or explore), so it cannot be cropped into one')
    from io import BytesIO
    from PIL import Image
    left, top, w, h = (int(v) for v in box)
    with Image.open(src) as im:
        if w <= 0 or h <= 0 or left < 0 or top < 0 or left + w > im.width or top + h > im.height:
            raise ValueError(f'the box {box} does not fit inside the {im.width}x{im.height} picture')
        out = BytesIO()
        im.crop((left, top, left + w, top + h)).save(out, 'PNG')
    info = dict(info, crop=[left, top, w, h])
    with open(dst, 'wb') as f:
        f.write(_with_mark(out.getvalue(), info))
    return info
