#!/usr/bin/env python3
"""Writes the campaign's scene JSONs into scripts/campaign/scenes/ (one source of truth for the
shared settings, so a resolution step-down is one edit). Run: python3 scripts/campaign/gen-scenes.py
WHY generated: 15+ scenes share the same window size, zoom, fps, holds and typing speed."""
import json, os, sys
OUT = os.environ.get('CAMP_OUT') or os.path.join(os.path.dirname(__file__), 'scenes')
os.makedirs(OUT, exist_ok=True)
W, H, Z = int(os.environ.get('CAMP_W', 1920)), int(os.environ.get('CAMP_H', 1200)), float(os.environ.get('CAMP_Z', 1.66667))
PW, PH, PZ = 1080, 2340, 2.6
CPS = 12
SITE = 'http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&seed=none&latency=0&replySpeed=2&replyClock=now&model=Gemma+3'
NEUTRAL = {"movePt": [0.97, 0.5], "ms": 450, "settle": 100}  # off every control, so no hover tooltip covers the page
HEAD, TAIL = {"hold": 500}, {"hold": 1500}
BOX = {"click": "[placeholder^='Message']", "settle": 200}

def scene(name, base, actions, theme='youcoded', phone=False, pause=True, why=''):
    s = {"base": base, "theme": theme, "width": PW if phone else W, "height": PH if phone else H,
         "zoom": PZ if phone else Z, "fps": 30, "boot": 3000, "pauseBackground": pause,
         "why": "2026-11-18 campaign 'you coded that.': " + why, "actions": [HEAD] + actions + [TAIL]}
    json.dump(s, open(os.path.join(OUT, name + '.json'), 'w'), indent=1)

def ask(text, reply_done):
    return [BOX, {"typeSlow": text, "cps": CPS, "mark": "typed"}, {"key": "Enter", "mark": "enter", "settle": 300},
            {"waitForText": reply_done, "tag": "p", "timeout": 20000, "settle": 600}]
def inpage(**k): return {**k, "in": "page"}
LAMP = "js:document.querySelector('.fav-grid [data-toggle]')"
LIVING = "js:[...document.querySelectorAll('.room')].find(r=>r.querySelector('h2')&&r.querySelector('h2').textContent.trim()==='Study').querySelector('[data-toggle], [data-room]')"
def lamp_lights(slow=1):
    return [inpage(click=LAMP, settle=int(1800*slow), mark="lamp"),
            inpage(moveTo=LIVING, ms=int(900*slow)), {"hold": int(500*slow)},
            inpage(click=LIVING, settle=int(1800*slow), mark="lights")]

# 1 house-ask
scene('house-ask', SITE + '&title=home&reply=ad-house',
      ask('make me a page that runs my house', 'Your Home page is ready.') +
      [{"click": "button[aria-label='Open Home']", "mark": "open", "settle": 100}, NEUTRAL,
       inpage(waitForText="Favorites", timeout=20000, settle=300, mark="favorites"), {"hold": 1200}] + lamp_lights(),
      why='ask typed, reply, open Home, lamp off, living room lights off')
# 2 house-page
scene('house-page', SITE + '&title=home&reply=ad-house',
      [{"click": "button[aria-label='Open Home']", "mark": "open", "settle": 100}, NEUTRAL,
       inpage(waitForText="Favorites", timeout=20000, settle=300, mark="favorites"), {"hold": 2500}] + lamp_lights(1.6),
      why='Home page settled, slow toggles, for a camera push-in')
# 3 money
scene('money', SITE + '&title=money&reply=ad-money',
      ask('where does my money go?', 'Your Finance page is ready.') +
      [{"click": "button[aria-label='Open Finance']", "mark": "open", "settle": 100}, NEUTRAL,
       inpage(waitForText="Net worth", tag="button", timeout=20000, settle=300, mark="networth"), {"hold": 1500},
       inpage(clickText="Bills & subscriptions", tag="button", settle=1500),
       inpage(waitForText="Spending", tag="button", settle=300),
       inpage(clickText="Spending", tag="button", settle=2000, mark="spending"),
       inpage(waitForText="1Y", tag="button", settle=300),
       inpage(clickText="1Y", tag="button", settle=1500, mark="1y")],
      why='ask, open Finance, Net worth, Spending, 1Y')
# 4 paint
STAGE = "#c"
def stroke(pts, ms): return inpage(stroke=STAGE, pts=pts, ms=ms, settle=250)
def swatch(i): return inpage(click=f"#swatches .yc-swatch:nth-child({i})", settle=200)
import math
def circle(cx, cy, r, n=28, a0=0, a1=2*math.pi):
    return [[round(cx + r*math.cos(a0+(a1-a0)*i/n), 4), round(cy + r*math.sin(a0+(a1-a0)*i/n), 4)] for i in range(n+1)]
sun = [stroke(circle(0.78, 0.22, 0.07), 900)]
rays = [stroke([[0.78+0.10*math.cos(a), 0.22+0.16*math.sin(a)], [0.78+0.15*math.cos(a), 0.22+0.24*math.sin(a)]], 220) for a in [i*math.pi/4 for i in range(8)]]
paint_actions = (
  [swatch(6), inpage(click="#size", settle=100), {"eval": "0", "settle": 0}] +
  [swatch(6)] + sun + rays +
  [swatch(7), stroke([[0.0,0.85],[0.2,0.72],[0.45,0.8],[0.7,0.7],[1.0,0.82]], 1100), stroke([[0.0,0.95],[0.3,0.88],[0.6,0.93],[1.0,0.9]], 900)] +
  [swatch(12), stroke([[0.3,0.82],[0.3,0.5]], 450), swatch(7), stroke(circle(0.3,0.42,0.09,24), 800), swatch(11), stroke(circle(0.3,0.42,0.025,10), 300), stroke(circle(0.22,0.38,0.02,10), 300), stroke(circle(0.38,0.38,0.02,10), 300)] +
  [swatch(4), stroke(circle(0.6,0.78,0.03,12), 300), stroke(circle(0.68,0.8,0.03,12), 300), stroke(circle(0.76,0.77,0.03,12), 300)]
)
paint_actions = [a for a in paint_actions if a.get("eval") != "0" and a.get("click") != "#size"]
PAINT = SITE + '&title=paint&reply=ad-paint&adPages=paint'
scene('paint-ask', PAINT, ask('a paint app for my niece', 'Your Paint studio is ready.') +
      [{"click": "button[aria-label='Open Paint studio']", "mark": "open", "settle": 300},
       inpage(waitFor="#c", timeout=20000, settle=800, mark="studio"), {"hold": 800}] + paint_actions + [{"hold": 800}],
      why='ask, open studio, paint a sun, hills, flower')
scene('paint-page', PAINT, [{"click": "button[aria-label='Open Paint studio']", "mark": "open", "settle": 300},
       inpage(waitFor="#c", timeout=20000, settle=800, mark="studio"), {"hold": 800}] + paint_actions + [{"hold": 800}],
      why='paint page alone, painting a sun, hills, flower')
# 5 trip
TRIP = SITE + '&title=lisbon&reply=ad-trip&adPages=trip'
trip_page = [{"click": "button[aria-label='Open Lisbon with Ana']", "mark": "open", "settle": 100}, NEUTRAL,
       inpage(waitForText="Day by day", timeout=20000, settle=800, mark="page"), {"hold": 1500},
       {"scroll": 520, "ms": 2200, "settle": 600, "mark": "scroll"},
       inpage(click="#days .day:nth-child(5) .yc-switch", settle=1500, mark="book"), {"hold": 600}]
scene('trip', TRIP, ask('plan lisbon with my sister', 'Your Lisbon page is ready.') + trip_page, why='ask, open trip board, scroll, book a day')
scene('trip-page', TRIP, trip_page, why='trip board page alone')
# 6 look + 7 look-themes
LOOK = 'http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&seed=none&latency=150&replySpeed=2&replyClock=now&model=Gemma+3&title=golden+hour&reply=ad-look'
scene('look', LOOK, ask('make it feel like golden hour', 'Golden hour installed')[:-1] +
      [{"waitForText": "Created 2 files", "timeout": 15000, "settle": 500},
       {"eval": "window.__workbenchAppearanceSync({theme:'golden-sunbreak'})", "settle": 900, "mark": "swap"}, {"hold": 2100}],
      pause=False, why='ask for a look, reply, theme swap to golden-sunbreak')
# 7 look-themes: the same chat, held in whatever THEME env names (one take per theme). Typing is quick
# and the reply is done by ~5 s, then a 3.0 s hold, so every take has the same shape and layout.
scene('look-themes', LOOK, [BOX, {"typeSlow": "make it feel like golden hour", "cps": 12, "mark": "typed"}, {"key": "Enter", "settle": 300},
      {"waitForText": "Created 2 files", "timeout": 15000, "settle": 500, "mark": "ready"}, {"hold": 3000, "mark": "held"}],
      pause=False, why='same chat state held in each theme (THEME env), 3 s')
# still-home: the Home page the moment it opens (house alive: lamp 71%, room lights on); last frame = the still.
scene('still-home', SITE + '&title=home&reply=ad-house',
      [{"click": "button[aria-label='Open Home']", "settle": 300}, inpage(waitForText="Favorites", timeout=20000, settle=300), {"hold": 2500}],
      why='Home page alive, for the poster still')
