# Take 1B prep: (1) the glow colour of every library still (average colour, used for the light a screen throws on
# its shelf) and (2) a copy of the phone's empty window with the placeholder words "Message your assistant..." wiped
# out, so the film can type into the app's own message box with nothing underneath the letters.
# WHY a wipe by interpolation: the box is a smooth tinted pill, so each row between the compass icon and the
# microphone is rebuilt from the pill's own colour on either side; the real pill, nothing drawn.
# Run from the film folder:  python3 src/round2/take1b-prep.py
import json, os
from PIL import Image
D = 'public/stills/r4'
rows = json.load(open(f'{D}/rows.json'))
glow = {}
for r in rows:
    im = Image.open(f"{D}/{r['file']}").convert('RGB').resize((1, 1), Image.LANCZOS)
    glow[r['file']] = '#%02X%02X%02X' % im.getpixel((0, 0))
json.dump(glow, open('src/round2/take1b-glow.json', 'w'), indent=1)
im = Image.open(f'{D}/youcoded-phone-empty.png').convert('RGB')
px = im.load()
XA, XB = 194, 946           # clean pill colour just left of the words and just right of them
for y in range(2236, 2316):
    a, b = px[XA, y], px[XB, y]
    for x in range(XA + 1, XB):
        p = (x - XA) / (XB - XA)
        px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * p) for i in range(3))
im.save(f'{D}/take1b-phone-clean.png')
print('ok', len(glow))
