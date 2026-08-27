---
status: active
created: 2026-08-27
spec: docs/active/specs/2026-08-27-review-deck-v2-design.md
---

# Review Deck v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 review deck with the approved page (mockup G), a local server that saves answers to a file and exits when Destin submits, rig-measured highlight boxes, builder-enforced writing rules, and four hand-off rig fixes.

**Architecture:** `scripts/ui-review/review-cards.py` becomes a thin CLI over a new `scripts/ui-review/deck/` Python package (`spec` → `boxes` → `crops` → `build` → `serve`). `build` always crops first — there is no separate crop command and no intermediate boxes file, because a stale one would draw wrong boxes with no error; `serve` builds, then serves; `wait` blocks on the answers file alone, so "Destin is done" never depends on the serving process staying alive. The page itself is three static assets (`page.html.tmpl`, `page.css`, `page.js`) that `build` inlines with the deck data as one JSON object, so the browser renders steps from data. `shot.mjs` gains a `measure` list per shot and a run id; `coverage.mjs` merges by run id per plan; `run-review.sh` probes CDP ports and scopes sheets to the run.

**Tech Stack:** Python 3.14 stdlib only (`http.server`, `json`, `subprocess`, `unittest`); ImageMagick 7 (`magick`); Node 26 (`node --test`, raw CDP over `WebSocket`, `google-chrome-stable`) for the rig and the render check. No new dependencies.

## Global Constraints

- Everything lives in the **workspace repo** (`youcoded-dev`), worktree `worktrees/_deck-tooling`, branch `feat/review-deck-v2`. No sub-repo code changes. Never touch the live app (workspace rule).
- Amber `#FFB020` is the deck's only identity colour (spec §2). Built-in token values must equal `youcoded/desktop/src/renderer/styles/globals.css` (Task 3 test).
- Writing rules (spec §5), exact: headline ≤ 25 words; `changed` and `notice` required; banned words (case-insensitive, whole-word): `token, primitive, selector, IPC, prop, props, reducer, handler, component, Tailwind, CSS class, React, DOM, z-index`; warnings for `box` highlights, auto-highlight > 60% of the crop, risk > 40 words, `measured` without a digit.
- Layout picker (spec §3.4): B/C need content ≥ 820px; A wins ties within 5%; best < 50% → compact; upscale cap 150%.
- Answers file is `<spec-stem>.answers.json` next to the spec; `serve` exits 0 on submit, 2 on timeout (default 240 min), 3 when the same spec is already served. `wait` exits 0/2 the same way and reads only the answers file. `.gitignore` gains `*.answers.json` and `*.serve.json`.
- **The worktree does NOT contain the sub-repo checkouts.** `youcoded/` and `wecoded-themes/` live only at the workspace root (one level above `worktrees/`). Everything that needs them resolves the root with `spec.workspace_root()` — walk up from the package until a directory containing `wecoded-themes/themes` is found; `YOUCODED_WORKSPACE` overrides. Tests that read those files **fail** when the root is not found — never skip (a skipped pin is no pin).
- ImageMagick dilate is `-morphology Dilate Square:1` (a 3×3 kernel). `Square:3` is a 7×7 kernel and grows a box 3 px per side — measured on 2026-08-27, it broke the auto-box tolerances.
- Every non-trivial edit carries a WHY comment (Destin reads the code through comments).
- Python tests: `python3 -m unittest discover -s scripts/ui-review/tests -p 'test_*.py'`. Node tests: `node --test scripts/ui-review/tests/`.
- Commit after every task with the `Co-Authored-By` / `Claude-Session` trailers from the session's Bash instructions.

---

## File map

| Path | Responsibility |
|---|---|
| `scripts/ui-review/review-cards.py` | CLI: `build`, `serve`, `wait`. Rewritten (v1 removed). |
| `scripts/ui-review/deck/__init__.py` | package marker |
| `scripts/ui-review/deck/spec.py` | load spec, merge `crops.json`, `workspace_root()`, writing rules → `(errors, warnings)` |
| `scripts/ui-review/deck/boxes.py` | geometry parsing, window-px → crop-% mapping, pixel-diff bounding box |
| `scripts/ui-review/deck/crops.py` | cut crops with `magick` (one cut per crop × theme × run), resolve each step's highlight per theme × run |
| `scripts/ui-review/deck/build.py` | crop, then inline assets + tokens + deck JSON → one HTML file; refuses on missing pictures/boxes |
| `scripts/ui-review/deck/serve.py` | HTTP server, atomic answers file, submit → exit, feedback summary, browser open, `wait_for_submit` |
| `.gitignore` | `*.answers.json`, `*.serve.json` |
| `scripts/ui-review/deck/tokens.json` | the four built-in token sets the page inlines |
| `scripts/ui-review/deck/page.html.tmpl`, `page.css`, `page.js` | the page (from mockup G) |
| `scripts/ui-review/tests/fixture.py` | builds a synthetic run dir + spec in a temp dir for the Python tests |
| `scripts/ui-review/tests/test_spec.py`, `test_boxes.py`, `test_crops.py`, `test_build.py`, `test_serve.py`, `test_tokens.py`, `test_cli.py` | unit tests |
| `scripts/ui-review/tests/shot-measure.test.mjs`, `coverage.test.mjs`, `deck-render.test.mjs` | node tests |
| `scripts/ui-review/probe-ports.sh` | exits 1 naming any listening port among its args (hand-off gap 1) |
| `scripts/ui-review/shot.mjs` | `measure` per shot; `run` id on every manifest entry |
| `scripts/ui-review/coverage.mjs` | per-plan newest-run merge (gap 6) |
| `scripts/ui-review/run-review.sh` | run id, port probe, sheets scoped to the run (gaps 1, 7) |
| `scripts/ui-review/README.md`, `.claude/skills/ui-review/SKILL.md`, `CLAUDE.md`, `ROADMAP.md`, memory | docs |

---

### Task 1: Spec loading and the writing rules

**Files:**
- Create: `scripts/ui-review/deck/__init__.py` (empty)
- Create: `scripts/ui-review/deck/spec.py`
- Test: `scripts/ui-review/tests/test_spec.py`

**Interfaces:**
- Produces: `load_spec(path) -> dict` (adds `_base`, `_stem`, `_crops`, default `themes`); `validate(spec) -> (errors: list[str], warnings: list[str])`; `run_names(spec) -> list[str]`; `word_count(s) -> int`; `banned_in(text) -> list[str]`; `workspace_root() -> str` (raises `SpecError` when no ancestor holds `wecoded-themes/themes` and `YOUCODED_WORKSPACE` is unset); `SpecError(Exception)`; constants `DEFAULT_THEMES`, `BANNED`, `AUTO_WARN_FRACTION = 0.6`.

- [ ] **Step 1: Write the failing tests**

```python
# scripts/ui-review/tests/test_spec.py
import json, os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.spec import load_spec, validate, run_names, word_count, banned_in, workspace_root, SpecError

def write_spec(d, **over):
    spec = {"title": "T", "key": "t", "out": "t.html", "images": "images", "runs": {"before": "/a", "after": "/b"},
            "crops": {"c": ["main", "home", "100x50+10+20"]},
            "steps": [{"id": "S-1", "surface": "Home", "path": "Chat", "crop": "c",
                       "headline": "Short headline.", "changed": "What changed.", "notice": "You will notice."}]}
    spec.update(over)
    p = os.path.join(d, 'deck.json'); json.dump(spec, open(p, 'w')); return p

class SpecTests(unittest.TestCase):
    def setUp(self): self.d = tempfile.mkdtemp()
    def test_load_merges_shared_crops_and_defaults(self):
        s = load_spec(write_spec(self.d))
        self.assertEqual(s['_stem'], 'deck'); self.assertIn('bubble', s['_crops']); self.assertIn('c', s['_crops'])
        self.assertEqual(s['themes'][0], 'midnight'); self.assertEqual(run_names(s), ['before', 'after'])
    def test_missing_top_level_key_raises(self):
        with self.assertRaises(SpecError): load_spec(self._without('title'))
    def test_workspace_root_holds_the_sub_repos(self):
        # The worktree has no youcoded/ or wecoded-themes/ of its own; the root above worktrees/ does.
        root = workspace_root()
        self.assertTrue(os.path.isdir(os.path.join(root, 'wecoded-themes', 'themes')), root)
        self.assertTrue(os.path.isfile(os.path.join(root, 'youcoded', 'desktop', 'src', 'renderer', 'styles', 'globals.css')), root)
    def _without(self, key):
        p = write_spec(self.d); s = json.load(open(p)); del s[key]; json.dump(s, open(p, 'w')); return p
    def test_three_runs_rejected(self):
        with self.assertRaises(SpecError): load_spec(write_spec(self.d, runs={"a": "/a", "b": "/b", "c": "/c"}))
    def test_valid_spec_has_no_errors(self):
        self.assertEqual(validate(load_spec(write_spec(self.d))), ([], []))
    def test_headline_word_limit(self):
        s = load_spec(write_spec(self.d)); s['steps'][0]['headline'] = ' '.join(['word'] * 26)
        errors, _ = validate(s); self.assertTrue(any('26 words' in e for e in errors))
    def test_banned_words_whole_word_case_insensitive(self):
        self.assertEqual(banned_in('The Token is a primitive'), ['token', 'primitive'])
        self.assertEqual(banned_in('property tokens'), [])          # not whole words
        self.assertEqual(banned_in('ipc call via the DOM'), ['ipc', 'dom'])
        s = load_spec(write_spec(self.d)); s['steps'][0]['changed'] = 'Uses a new CSS class'
        errors, _ = validate(s); self.assertTrue(any('banned word "css class"' in e for e in errors))
    def test_required_fields(self):
        s = load_spec(write_spec(self.d)); del s['steps'][0]['notice']; s['steps'][0]['surface'] = ''
        errors, _ = validate(s); self.assertTrue(any('missing notice' in e for e in errors)); self.assertTrue(any('missing surface' in e for e in errors))
    def test_unknown_crop_is_an_error(self):
        s = load_spec(write_spec(self.d)); s['steps'][0]['crop'] = 'nope'
        self.assertTrue(any('unknown crop' in e for e in validate(s)[0]))
    def test_highlight_rules(self):
        s = load_spec(write_spec(self.d, runs={"today": "/a"}))
        self.assertTrue(any('needs a highlight' in e for e in validate(s)[0]))
        s['steps'][0]['highlight'] = 'auto'; self.assertTrue(any('"auto" highlight needs' in e for e in validate(s)[0]))
        s['steps'][0]['highlight'] = {'box': [1, 2, 3, 4]}; errors, warnings = validate(s)
        self.assertEqual(errors, []); self.assertTrue(any('hand-placed box' in w for w in warnings))
        s['steps'][0]['highlight'] = {'nothing': 1}; self.assertTrue(any('selector, text or box' in e for e in validate(s)[0]))
    def test_warnings_for_long_risk_and_numberless_measured(self):
        s = load_spec(write_spec(self.d)); s['steps'][0]['risk'] = ' '.join(['r'] * 41); s['steps'][0]['measured'] = 'a bit taller'
        _, warnings = validate(s); self.assertEqual(len(warnings), 2)
    def test_duplicate_ids(self):
        s = load_spec(write_spec(self.d)); s['steps'].append(dict(s['steps'][0]))
        self.assertTrue(any('duplicate id' in e for e in validate(s)[0]))
    def test_word_count(self):
        self.assertEqual(word_count("it's a two-line, five-word headline"), 5)

if __name__ == '__main__': unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/destin/youcoded-dev/worktrees/_deck-tooling && python3 -m unittest scripts/ui-review/tests/test_spec.py -v 2>&1 | tail -3`
Expected: `ModuleNotFoundError: No module named 'deck'`

- [ ] **Step 3: Write `spec.py`**

```python
# scripts/ui-review/deck/spec.py
"""Deck spec: loading, crop-registry merge, and the writing rules the builder enforces.

WHY rules in code: on 2026-08-25 a taste argument went into a review as if it were a defect,
and prose reviews were rejected three times for being unreadable — so the deck's vocabulary
(headline · What changed · You'll notice · Risk) and its word limits are checked here, not
remembered. Spec: docs/active/specs/2026-08-27-review-deck-v2-design.md §4–5."""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
UI_REVIEW = os.path.dirname(HERE)
DEFAULT_THEMES = ['midnight', 'light', 'creme', 'dark', 'halftone-dimension', 'meadow-mist']
# Whole-word, case-insensitive. "px" and numbers are fine — measurements are wanted.
BANNED = ['token', 'primitive', 'selector', 'ipc', 'prop', 'props', 'reducer', 'handler',
          'component', 'tailwind', 'css class', 'react', 'dom', 'z-index']
TEXT_FIELDS = ['headline', 'changed', 'measured', 'notice', 'risk', 'surface', 'path']
HEADLINE_MAX = 25
RISK_WARN = 40
AUTO_WARN_FRACTION = 0.6   # an auto-highlight covering more than this much of the crop is "whole surface"


class SpecError(Exception):
    pass


def workspace_root():
    """The directory that holds the sub-repo checkouts (youcoded/, wecoded-themes/).
    WHY walk up: this package usually runs from a worktree (worktrees/<name>/scripts/…), and a
    worktree holds only the workspace repo — the sub-repos are cloned once, at the root above
    worktrees/. Resolving relative to the package silently found nothing on 2026-08-27."""
    if os.environ.get('YOUCODED_WORKSPACE'):
        return os.environ['YOUCODED_WORKSPACE']
    d = HERE
    while True:
        if os.path.isdir(os.path.join(d, 'wecoded-themes', 'themes')):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            raise SpecError('no workspace root above ' + HERE + ' holds wecoded-themes/themes (set YOUCODED_WORKSPACE)')
        d = parent


def load_spec(path):
    with open(path) as f:
        spec = json.load(f)
    for k in ('title', 'key', 'out', 'images', 'runs', 'steps'):
        if k not in spec or spec[k] is None:
            raise SpecError(f'spec is missing "{k}"')
    if not 1 <= len(spec['runs']) <= 2:
        raise SpecError('runs must have one entry (today) or two (before, after)')
    spec['_base'] = os.path.dirname(os.path.abspath(path))
    spec['_stem'] = os.path.splitext(os.path.basename(path))[0]
    with open(os.path.join(UI_REVIEW, 'crops.json')) as f:
        shared = json.load(f)
    shared.pop('_comment', None)
    spec['_crops'] = {**shared, **spec.get('crops', {})}
    spec.setdefault('themes', list(DEFAULT_THEMES))
    return spec


def run_names(spec):
    """Display order of the runs: before then after when both exist, else as written."""
    r = list(spec['runs'].keys())
    return ['before', 'after'] if set(r) == {'before', 'after'} else r


def word_count(s):
    return len(re.findall(r"[\w'’-]+", s or ''))


def banned_in(text):
    low = (text or '').lower()
    return [w for w in BANNED if re.search(r'(?<![\w-])' + re.escape(w) + r'(?![\w-])', low)]


def validate(spec):
    """Returns (errors, warnings) as 'step-id: message' lines. Errors block crop/build."""
    errors, warnings, ids = [], [], set()
    two_runs = len(spec['runs']) == 2
    for i, st in enumerate(spec['steps']):
        sid = st.get('id') or f'step {i + 1}'
        if not st.get('id'):
            errors.append(f'{sid}: missing id')
        elif st['id'] in ids:
            errors.append(f'{sid}: duplicate id')
        ids.add(st.get('id'))
        for k in ('surface', 'path', 'crop', 'headline', 'changed', 'notice'):
            if not st.get(k):
                errors.append(f'{sid}: missing {k}')
        if st.get('crop') and st['crop'] not in spec['_crops']:
            errors.append(f'{sid}: unknown crop "{st["crop"]}" (add it to crops.json or the spec\'s "crops")')
        if word_count(st.get('headline')) > HEADLINE_MAX:
            errors.append(f'{sid}: headline is {word_count(st["headline"])} words (max {HEADLINE_MAX})')
        for k in TEXT_FIELDS:
            for w in banned_in(st.get(k)):
                errors.append(f'{sid}: {k} uses banned word "{w}"')
        hl = st.get('highlight', 'auto' if two_runs else None)
        if hl is None:
            errors.append(f'{sid}: a one-run deck needs a highlight (selector or text)')
        elif hl == 'auto':
            if not two_runs:
                errors.append(f'{sid}: "auto" highlight needs a before and an after run')
        elif isinstance(hl, dict):
            if not any(k in hl for k in ('selector', 'text', 'box')):
                errors.append(f'{sid}: highlight must be "auto" or have selector, text or box')
            elif 'box' in hl:
                warnings.append(f'{sid}: hand-placed box — prefer a selector so the rig measures it')
        else:
            errors.append(f'{sid}: highlight must be "auto" or an object')
        if word_count(st.get('risk')) > RISK_WARN:
            warnings.append(f'{sid}: risk is {word_count(st["risk"])} words — keep it to one sentence')
        if st.get('measured') and not re.search(r'\d', st['measured']):
            warnings.append(f'{sid}: measured has no number in it')
    return errors, warnings
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest scripts/ui-review/tests/test_spec.py -v 2>&1 | tail -3`
Expected: `OK` (13 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-review/deck/__init__.py scripts/ui-review/deck/spec.py scripts/ui-review/tests/test_spec.py
git commit -m "feat(ui-review): deck v2 spec loader and the writing rules the builder enforces"
```

---

### Task 2: Box maths — geometry, window-px → crop-%, pixel-diff bounding box

**Files:**
- Create: `scripts/ui-review/deck/boxes.py`
- Test: `scripts/ui-review/tests/test_boxes.py`

**Interfaces:**
- Produces: `parse_geometry("WxH+X+Y") -> (w, h, x, y)`; `rect_to_pct({x,y,w,h}, geo) -> [x%, y%, w%, h%] | None`; `diff_bbox(a_png, b_png, threshold='6%', pad=6) -> {x,y,w,h} | None` (pixels of the crop); `image_size(png) -> (w, h)`; `px_to_pct(box, (W, H)) -> [x%, y%, w%, h%]`.

- [ ] **Step 1: Write the failing tests**

```python
# scripts/ui-review/tests/test_boxes.py
import os, subprocess, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.boxes import parse_geometry, rect_to_pct, diff_bbox, image_size, px_to_pct

class GeometryTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_geometry('440x600+500+150'), (440, 600, 500, 150))
        with self.assertRaises(ValueError): parse_geometry('440x600')
    def test_rect_inside_crop(self):
        # crop is 400x200 at (100, 50); element at window (200, 100) 100x50 → 25%, 25%, 25%, 25%
        self.assertEqual(rect_to_pct({'x': 200, 'y': 100, 'w': 100, 'h': 50}, '400x200+100+50'), [25.0, 25.0, 25.0, 25.0])
    def test_rect_partly_outside_is_clipped(self):
        self.assertEqual(rect_to_pct({'x': 0, 'y': 0, 'w': 200, 'h': 100}, '400x200+100+50'), [0.0, 0.0, 25.0, 25.0])
    def test_rect_fully_outside_is_none(self):
        self.assertIsNone(rect_to_pct({'x': 900, 'y': 900, 'w': 10, 'h': 10}, '400x200+100+50'))
    def test_px_to_pct(self):
        self.assertEqual(px_to_pct({'x': 50, 'y': 20, 'w': 100, 'h': 40}, (200, 80)), [25.0, 25.0, 50.0, 50.0])

class DiffTests(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(); self.a = os.path.join(self.d, 'a.png'); self.b = os.path.join(self.d, 'b.png')
        subprocess.run(['magick', '-size', '200x100', 'xc:#333333', self.a], check=True)
        subprocess.run(['magick', self.a, '-fill', 'red', '-draw', 'rectangle 50,20 89,49', self.b], check=True)
    def test_size(self): self.assertEqual(image_size(self.a), (200, 100))
    def test_identical_images_have_no_box(self): self.assertIsNone(diff_bbox(self.a, self.a))
    def test_changed_rectangle_is_found_with_padding(self):
        box = diff_bbox(self.a, self.b)
        self.assertIsNotNone(box)
        # contains the 40x30 rectangle at (50,20) and is padded, but not by much
        self.assertLessEqual(box['x'], 50); self.assertLessEqual(box['y'], 20)
        self.assertGreaterEqual(box['x'] + box['w'], 90); self.assertGreaterEqual(box['y'] + box['h'], 50)
        self.assertGreaterEqual(box['x'], 40); self.assertGreaterEqual(box['y'], 10)
        self.assertLessEqual(box['w'], 62); self.assertLessEqual(box['h'], 52)
    def test_box_never_leaves_the_image(self):
        c = os.path.join(self.d, 'c.png'); subprocess.run(['magick', self.a, '-fill', 'red', '-draw', 'rectangle 0,0 9,9', c], check=True)
        box = diff_bbox(self.a, c); self.assertEqual((box['x'], box['y']), (0, 0))
    def test_whole_image_change_is_the_whole_image(self):
        # Trim of a uniform image is empty whether nothing or everything changed; the border in diff_bbox tells them apart.
        w = os.path.join(self.d, 'w.png'); subprocess.run(['magick', '-size', '200x100', 'xc:white', w], check=True)
        self.assertEqual(diff_bbox(self.a, w), {'x': 0, 'y': 0, 'w': 200, 'h': 100})

if __name__ == '__main__': unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest scripts/ui-review/tests/test_boxes.py 2>&1 | tail -2`
Expected: `ModuleNotFoundError: No module named 'deck.boxes'`

- [ ] **Step 3: Write `boxes.py`**

```python
# scripts/ui-review/deck/boxes.py
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
    `%@` is ImageMagick's trim box of the thresholded difference; the 3×3 dilate (`Square:1` —
    `Square:3` would be 7×7 and grow the box 3 px a side) joins hairline changes into one region.
    WHY the 1 px black border: trim of a UNIFORM image is `0x0+W+H` whether it is all black
    (nothing changed) or all white (everything changed) — a whole-surface change read as "nothing
    differs" until 2026-08-27. The border gives trim something to shrink from: identical → 0x0,
    everything → WxH+1+1, so x and y come back shifted by 1."""
    out = subprocess.run(['magick', a, b, '-compose', 'difference', '-composite', '-threshold', threshold,
                          '-morphology', 'Dilate', 'Square:1', '-bordercolor', 'black', '-border', '1',
                          '-format', '%@', 'info:'],
                         capture_output=True, text=True, check=True).stdout.strip()
    m = GEO.fullmatch(out)
    if not m:
        return None
    w, h, x, y = map(int, m.groups())
    if w * h < 4:
        return None
    x, y = x - 1, y - 1   # undo the border's shift
    W, H = image_size(a)
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(W, x + w + pad), min(H, y + h + pad)
    return {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m unittest scripts/ui-review/tests/test_boxes.py -v 2>&1 | tail -3`
Expected: `OK` (10 tests). Measured on 2026-08-27 with ImageMagick 7.1.2, with the border: identical images print `0x0+202+102` (plus a harmless warning on stderr, exit 0) — the `w * h < 4` guard turns that into `None`; a fully changed image prints `200x100+1+1`; the 40×30 rectangle comes back `42x32+50+20` after the 3×3 dilate (→ 49,19 once the border shift is undone).

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-review/deck/boxes.py scripts/ui-review/tests/test_boxes.py
git commit -m "feat(ui-review): highlight-box maths — measured rect to crop %, pixel-diff bounding box"
```

---

### Task 3: Built-in theme tokens, checked against `globals.css`

**Files:**
- Create: `scripts/ui-review/deck/tokens.json`
- Test: `scripts/ui-review/tests/test_tokens.py`

**Interfaces:**
- Produces: `tokens.json` = `{ "<theme>": { "canvas": "#…", …13 keys…, "_dark": bool } }` for `light`, `dark`, `midnight`, `creme`. Keys (exact): `canvas panel inset well accent on-accent fg fg-2 fg-dim fg-muted fg-faint edge link`.

- [ ] **Step 1: Write the failing test**

```python
# scripts/ui-review/tests/test_tokens.py
"""The deck inlines the built-in token values; this pins them to globals.css so a theme
tweak in the app cannot leave the deck wearing last month's Midnight."""
import json, os, re, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.spec import workspace_root
TOKENS = os.path.join(os.path.dirname(HERE), 'deck', 'tokens.json')
# Resolved through workspace_root(), never relative to this file: the worktree has no youcoded/.
GLOBALS = os.path.join(workspace_root(), 'youcoded', 'desktop', 'src', 'renderer', 'styles', 'globals.css')
KEYS = ['canvas', 'panel', 'inset', 'well', 'accent', 'on-accent', 'fg', 'fg-2', 'fg-dim', 'fg-muted', 'fg-faint', 'edge', 'link']

def css_block(css, theme):
    sel = f'[data-theme="{theme}"]'
    i = css.index(sel); j = css.index('}', i)
    return css[i:j]

class TokenTests(unittest.TestCase):
    def test_four_themes_with_all_keys(self):
        t = json.load(open(TOKENS))
        self.assertEqual(sorted(t), ['creme', 'dark', 'light', 'midnight'])
        for theme, tok in t.items():
            for k in KEYS: self.assertRegex(tok[k], r'^#[0-9A-Fa-f]{6}$', f'{theme}.{k}')
            self.assertIsInstance(tok['_dark'], bool)
    def test_values_match_globals_css(self):
        self.assertTrue(os.path.exists(GLOBALS), GLOBALS + ' missing — the pin must fail, not skip')
        css = open(GLOBALS).read(); t = json.load(open(TOKENS))
        for theme, tok in t.items():
            block = css_block(css, theme)
            for k in KEYS:
                m = re.search(r'--' + re.escape(k) + r':\s*(#[0-9A-Fa-f]{6})', block)
                self.assertIsNotNone(m, f'{theme}: --{k} not in globals.css block'); self.assertEqual(tok[k].upper(), m.group(1).upper(), f'{theme}.{k}')
            self.assertEqual(tok['_dark'], 'color-scheme: dark' in block, theme)

if __name__ == '__main__': unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest scripts/ui-review/tests/test_tokens.py 2>&1 | tail -2`
Expected: `FileNotFoundError: … tokens.json`

- [ ] **Step 3: Write `tokens.json`** (values from `globals.css` on 2026-08-27; the test is the authority — if it disagrees, copy the value it reports from `globals.css`)

```json
{
  "light":    {"canvas": "#F2F2F2", "panel": "#EAEAEA", "inset": "#D7D7D7", "well": "#F9F9F9", "accent": "#1A1A1A", "on-accent": "#F2F2F2", "fg": "#1A1A1A", "fg-2": "#444444", "fg-dim": "#656565", "fg-muted": "#797979", "fg-faint": "#989898", "edge": "#C0C0C0", "link": "#2055CA", "_dark": false},
  "dark":     {"canvas": "#111111", "panel": "#191919", "inset": "#222222", "well": "#1C1C1C", "accent": "#D4D4D4", "on-accent": "#111111", "fg": "#E0E0E0", "fg-2": "#B0B0B0", "fg-dim": "#999999", "fg-muted": "#6C6C6C", "fg-faint": "#515151", "edge": "#393939", "link": "#66AAFF", "_dark": true},
  "midnight": {"canvas": "#0D1117", "panel": "#161B22", "inset": "#21262D", "well": "#0D1117", "accent": "#B1BAC4", "on-accent": "#0D1117", "fg": "#C9D1D9", "fg-2": "#A0AAB4", "fg-dim": "#8B949E", "fg-muted": "#6E7681", "fg-faint": "#4E555E", "edge": "#343A41", "link": "#58A6FF", "_dark": true},
  "creme":    {"canvas": "#F6EEE1", "panel": "#EBE1D1", "inset": "#D8CCB9", "well": "#F9F0E2", "accent": "#3D3229", "on-accent": "#F6EEE1", "fg": "#2C2418", "fg-2": "#564938", "fg-dim": "#695E4D", "fg-muted": "#7D7161", "fg-faint": "#9A8F7F", "edge": "#C4B8A6", "link": "#5B4A1E", "_dark": false}
}
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m unittest scripts/ui-review/tests/test_tokens.py -v 2>&1 | tail -3`
Expected: `OK` (2 tests). The `light` block in `globals.css` is `[data-theme="light"], :root {` — `css_block` finds it by the `[data-theme="light"]` prefix, which is fine.

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-review/deck/tokens.json scripts/ui-review/tests/test_tokens.py
git commit -m "feat(ui-review): built-in theme tokens for the deck, pinned to globals.css"
```

---

### Task 4: Test fixture — a synthetic run directory and spec

**Files:**
- Create: `scripts/ui-review/tests/fixture.py`

**Interfaces:**
- Produces: `make_fixture(tmpdir, themes=('midnight','light')) -> spec_path`. Layout it creates:
  - `<tmp>/runs/before/shots-main/<theme>/home.png` and `…/runs/after/…` — 1440×900 flat images; `after` adds a red rectangle at window (560, 260) size 120×40 (inside crop `c` below) and a blue one at (20, 20) 10×10 (outside it).
  - `<tmp>/runs/{before,after}/shots-main/manifest-main-x.json` with one entry per theme: `{name:'home', theme, verified:true, run:'1', measures: {'#send': {x:600,y:300,w:80,h:30}, 'text:Send': {x:600,y:300,w:80,h:30}}}`.
  - `<tmp>/deck/deck.json` with crops `{"c": ["main","home","400x200+500+250"]}` and two steps: `S-1` (auto) and `S-2` (`{"selector": "#send"}`), both crop `c`, and a third `S-3` with `{"text": "Send"}`.

- [ ] **Step 1: Write the fixture**

```python
# scripts/ui-review/tests/fixture.py
"""A synthetic screenshot run for the deck tests: flat 1440x900 'shots' with a known
rectangle that changes, and a manifest with known measurements. Lets every deck test run
without Chrome or the workbench."""
import json, os, subprocess

GEO = '400x200+500+250'

def make_fixture(tmp, themes=('midnight', 'light')):
    for run in ('before', 'after'):
        for theme in themes:
            d = os.path.join(tmp, 'runs', run, 'shots-main', theme); os.makedirs(d, exist_ok=True)
            cmd = ['magick', '-size', '1440x900', 'xc:#202020' if theme == 'midnight' else 'xc:#EEEEEE']
            if run == 'after':
                cmd += ['-fill', 'red', '-draw', 'rectangle 560,260 679,299', '-fill', 'blue', '-draw', 'rectangle 20,20 29,29']
            subprocess.run(cmd + [os.path.join(d, 'home.png')], check=True)
        mf = [{'name': 'home', 'theme': t, 'verified': True, 'run': '1', 'file': f'{t}/home.png',
               'measures': {'#send': {'x': 600, 'y': 300, 'w': 80, 'h': 30}, 'text:Send': {'x': 600, 'y': 300, 'w': 80, 'h': 30}}} for t in themes]
        json.dump(mf, open(os.path.join(tmp, 'runs', run, 'shots-main', 'manifest-main-x.json'), 'w'))
    deck = os.path.join(tmp, 'deck'); os.makedirs(deck, exist_ok=True)
    spec = {'title': 'Fixture review', 'key': 'fixture', 'out': 'fixture.html', 'images': 'images',
            'runs': {'before': os.path.join(tmp, 'runs', 'before'), 'after': os.path.join(tmp, 'runs', 'after')},
            'themes': list(themes), 'crops': {'c': ['main', 'home', GEO]},
            'steps': [
                {'id': 'S-1', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'headline': 'A red block appeared.',
                 'changed': 'A red block was painted.', 'measured': '120 px wide', 'notice': 'You see red.', 'risk': 'None really.'},
                {'id': 'S-2', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'highlight': {'selector': '#send'},
                 'headline': 'The send button moved.', 'changed': 'Moved 4 px.', 'notice': 'Nothing much.'},
                {'id': 'S-3', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'highlight': {'text': 'Send'},
                 'headline': 'Same, by text.', 'changed': 'Moved 4 px.', 'notice': 'Nothing much.'}]}
    p = os.path.join(deck, 'deck.json'); json.dump(spec, open(p, 'w'), indent=1); return p
```

- [ ] **Step 2: Smoke it**

Run: `python3 -c "import sys,tempfile; sys.path.insert(0,'scripts/ui-review/tests'); from fixture import make_fixture; import os; p=make_fixture(tempfile.mkdtemp()); print(p, os.path.exists(os.path.join(os.path.dirname(os.path.dirname(p)),'runs','after','shots-main','light','home.png')))"`
Expected: a path and `True`

- [ ] **Step 3: Commit**

```bash
git add scripts/ui-review/tests/fixture.py
git commit -m "test(ui-review): synthetic run fixture for the deck tests"
```

---

### Task 5: `crops.py` — cut the crops and resolve every highlight box

**Files:**
- Create: `scripts/ui-review/deck/crops.py`
- Test: `scripts/ui-review/tests/test_crops.py`

**Interfaces:**
- Consumes: Task 1 `run_names`, `AUTO_WARN_FRACTION`; Task 2 `rect_to_pct`, `diff_bbox`, `image_size`, `px_to_pct`.
- Produces: `image_name(crop, theme, run) -> str` (`"<crop>--<theme>--<run>.png"`); `newest_manifest_entry(run_dir, plan, shot, theme) -> dict | None` (manifests ordered by run id, then file time — the same rule as Task 10's `coverage.mjs`); `measure_key(hl) -> str`; `crop_images(spec) -> {'boxes': {id: {theme: {run: [x,y,w,h]}}}, 'missing': [str], 'warnings': [str], 'count': int}` where `count` is the number of crop FILES cut (one per crop × theme × run — steps sharing a crop share the file). Nothing is written besides the crop PNGs; `build` consumes the returned boxes directly.

- [ ] **Step 1: Write the failing tests**

```python
# scripts/ui-review/tests/test_crops.py
import json, os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
from deck.spec import load_spec
from deck.crops import crop_images, image_name, measure_key, newest_manifest_entry

class CropTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.spec = load_spec(make_fixture(self.tmp)); self.r = crop_images(self.spec, log=lambda *a: None)
        self.images = os.path.join(self.spec['_base'], 'images')
    def test_every_theme_and_run_is_cut_once(self):
        self.assertEqual(self.r['count'], 1 * 2 * 2)   # crops × themes × runs — S-1..3 share crop "c", so 4 files, not 12
        self.assertTrue(os.path.exists(os.path.join(self.images, image_name('c', 'light', 'after'))))
        self.assertEqual(sorted(os.listdir(self.images)), sorted(image_name('c', t, r) for t in ('midnight', 'light') for r in ('before', 'after')))
    def test_measured_selector_maps_into_the_crop(self):
        # crop is 400x200 at (500,250); #send at (600,300) 80x30 → 25%, 25%, 20%, 15%
        self.assertEqual(self.r['boxes']['S-2']['midnight']['before'], [25.0, 25.0, 20.0, 15.0])
        self.assertEqual(self.r['boxes']['S-3']['light']['after'], [25.0, 25.0, 20.0, 15.0])
    def test_auto_box_is_the_changed_region_inside_the_crop_only(self):
        b = self.r['boxes']['S-1']['midnight']['after']
        # red block at window (560,260) 120x40 → crop (60,10) 120x40 → 15%,5%,30%,20%; the 3x3 dilate adds 1px
        # a side and the pad 6px, so the measured box is (53,3) 134x54 → 13.25%, 1.5%, 33.5%, 27%
        self.assertAlmostEqual(b[0], 15.0, delta=2.5); self.assertAlmostEqual(b[1], 5.0, delta=4)
        self.assertAlmostEqual(b[2], 30.0, delta=5); self.assertAlmostEqual(b[3], 20.0, delta=8)
        self.assertEqual(self.r['boxes']['S-1']['midnight']['before'], b)   # same box on both pictures
        self.assertEqual(self.r['missing'], []); self.assertEqual(self.r['warnings'], [])
    def test_missing_measurement_names_the_fix(self):
        self.spec['steps'][1]['highlight'] = {'selector': '#nope'}
        r = crop_images(self.spec, log=lambda *a: None)
        self.assertTrue(any('"measure": ["#nope"]' in m and 'plans/main.json' in m for m in r['missing']))
        self.assertEqual(r['boxes']['S-2']['light'], {})
    def test_missing_capture_is_reported_not_faked(self):
        os.remove(os.path.join(self.spec['runs']['after'], 'shots-main', 'light', 'home.png'))
        r = crop_images(self.spec, log=lambda *a: None)
        self.assertTrue(any('light/after' in m and 'not captured' in m for m in r['missing']))
    def test_whole_surface_change_warns(self):
        import subprocess
        p = os.path.join(self.spec['runs']['after'], 'shots-main', 'midnight', 'home.png')
        subprocess.run(['magick', p, '-fill', 'red', '-draw', 'rectangle 500,250 899,449', p], check=True)
        r = crop_images(self.spec, log=lambda *a: None)
        self.assertTrue(any('whole-surface change' in w for w in r['warnings']))
    def test_newest_manifest_entry(self):
        e = newest_manifest_entry(self.spec['runs']['before'], 'main', 'home', 'light')
        self.assertEqual(e['measures']['#send']['x'], 600); self.assertIsNone(newest_manifest_entry(self.spec['runs']['before'], 'main', 'nope', 'light'))
    def test_newest_run_id_beats_a_later_file_time(self):
        # An earlier sweep's shard can finish (and write its manifest) AFTER a newer sweep's — the run id decides, not mtime.
        import time
        d = os.path.join(self.spec['runs']['before'], 'shots-main')
        json.dump([{'name': 'home', 'theme': 'light', 'verified': True, 'run': '2', 'measures': {'#send': {'x': 1, 'y': 1, 'w': 1, 'h': 1}}}], open(os.path.join(d, 'manifest-main-newer-run.json'), 'w'))
        old = os.path.join(d, 'manifest-main-x.json'); os.utime(old, (time.time() + 60, time.time() + 60))   # the run-'1' file is now the newest on disk
        self.assertEqual(newest_manifest_entry(self.spec['runs']['before'], 'main', 'home', 'light')['measures']['#send']['x'], 1)
    def test_measure_key(self):
        self.assertEqual(measure_key({'selector': '#a'}), '#a'); self.assertEqual(measure_key({'text': 'Send'}), 'text:Send')

if __name__ == '__main__': unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest scripts/ui-review/tests/test_crops.py 2>&1 | tail -2`
Expected: `ModuleNotFoundError: No module named 'deck.crops'`

- [ ] **Step 3: Write `crops.py`**

```python
# scripts/ui-review/deck/crops.py
"""Cut the 1:1 crops for every step × theme × run and resolve each step's highlight box.
The spec never carries coordinates: a box comes from the rig's measurement of a named element
(manifest `measures`), or from the pixel difference between the before and after crops."""
import glob
import json
import os
import subprocess

from .boxes import diff_bbox, image_size, px_to_pct, rect_to_pct
from .spec import AUTO_WARN_FRACTION, run_names


def image_name(crop, theme, run):
    return f'{crop}--{theme}--{run}.png'


def measure_key(hl):
    return hl['selector'] if 'selector' in hl else f'text:{hl["text"]}'


def newest_manifest_entry(run_dir, plan, shot, theme):
    """The latest manifest entry for (plan, shot, theme) in a run dir. Entries are ordered by
    run id first (the sweep's UI_REVIEW_RUN stamp, Task 9), then file time — the same rule as
    coverage.mjs — so an earlier sweep's late-finishing shard cannot outrank a newer sweep."""
    found, best = None, (-1, -1.0)
    for f in glob.glob(os.path.join(run_dir, f'shots-{plan}', 'manifest-*.json')):
        mtime = os.path.getmtime(f)
        with open(f) as fh:
            for e in json.load(fh):
                if e.get('name') == shot and e.get('theme') == theme:
                    key = (int(e['run']) if str(e.get('run') or '').isdigit() else -1, mtime)
                    if key >= best:
                        found, best = e, key
    return found


def crop_images(spec, log=print):
    out_dir = os.path.join(spec['_base'], spec['images'])
    os.makedirs(out_dir, exist_ok=True)
    runs = run_names(spec)
    two = len(runs) == 2
    boxes, missing, warnings, cut = {}, [], [], set()
    for st in spec['steps']:
        plan, shot, geo = spec['_crops'][st['crop']]
        hl = st.get('highlight', 'auto' if two else None)
        boxes[st['id']] = {}
        for theme in spec['themes']:
            per_run = {}
            for run in runs:
                src = os.path.join(spec['runs'][run], f'shots-{plan}', theme, f'{shot}.png')
                dst = os.path.join(out_dir, image_name(st['crop'], theme, run))
                if not os.path.exists(src):
                    # A missing picture is a capture bug (see coverage.md), never a blank in the deck.
                    missing.append(f'{st["id"]}: {theme}/{run} — {src} not captured')
                    continue
                if dst not in cut:   # steps sharing a crop share the file — cut it once
                    subprocess.run(['magick', src, '-crop', geo, '+repage', dst], check=True)
                    cut.add(dst)
                if isinstance(hl, dict) and 'box' in hl:
                    per_run[run] = hl['box']
                elif isinstance(hl, dict):
                    entry = newest_manifest_entry(spec['runs'][run], plan, shot, theme)
                    rect = ((entry or {}).get('measures') or {}).get(measure_key(hl))
                    if not rect:
                        want = json.dumps([measure_key(hl) if 'selector' in hl else {'text': hl['text']}])
                        missing.append(f'{st["id"]}: no measurement for {measure_key(hl)!r} in {theme}/{run} — add to the '
                                       f'"{shot}" shot of plans/{plan}.json:  "measure": {want}  and re-run that plan')
                        continue
                    pct = rect_to_pct(rect, geo)
                    if pct is None:
                        missing.append(f'{st["id"]}: {measure_key(hl)!r} lies outside crop "{st["crop"]}" in {theme}/{run}')
                        continue
                    per_run[run] = pct
            paths = [os.path.join(out_dir, image_name(st['crop'], theme, r)) for r in runs]
            if hl == 'auto' and all(os.path.exists(p) for p in paths):
                box = diff_bbox(paths[0], paths[1])
                if box is None:
                    missing.append(f'{st["id"]}: nothing differs between before and after in {theme} — name an element instead of "auto"')
                else:
                    size = image_size(paths[0])
                    share = box['w'] * box['h'] / (size[0] * size[1])
                    if share > AUTO_WARN_FRACTION:
                        warnings.append(f'{st["id"]}: the change covers {round(share * 100)}% of the crop in {theme} — whole-surface change, name an element instead')
                    pct = px_to_pct(box, size)
                    per_run = {r: pct for r in runs}
            boxes[st['id']][theme] = per_run
    for m in missing:
        log('missing: ' + m)
    return {'boxes': boxes, 'missing': missing, 'warnings': warnings, 'count': len(cut)}
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m unittest scripts/ui-review/tests/test_crops.py -v 2>&1 | tail -3`
Expected: `OK` (9 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-review/deck/crops.py scripts/ui-review/tests/test_crops.py
git commit -m "feat(ui-review): crop step — cut each crop once, resolve highlight boxes from measurements or pixel diff"
```

---

### Task 6: The page assets and `build.py`

**Files:**
- Create: `scripts/ui-review/deck/page.html.tmpl`, `scripts/ui-review/deck/page.css`, `scripts/ui-review/deck/page.js`, `scripts/ui-review/deck/build.py`
- Test: `scripts/ui-review/tests/test_build.py`

**Interfaces:**
- Consumes: Task 1 `validate`, `run_names`, `SpecError`; Task 5 `image_name`; Task 3 `tokens.json`.
- Produces: `build_page(spec, boxes) -> (html: str, warnings: list[str])`; `theme_tokens(themes) -> {theme: {...}}`; `tokens_css(tokens) -> str`; `deck_data(spec, boxes) -> dict` (the `DECK` object the page reads — shape below). The page's HTTP contract used by Task 7: `GET /answers`, `POST /answers`, `POST /submit`.

`DECK` shape:
```json
{"title": "…", "key": "…", "runs": ["before","after"], "runLabels": {"before":"Before","after":"After","today":"Today"},
 "themes": ["midnight", …], "themeNames": {"midnight":"Midnight", …},
 "steps": [{"id":"S-1","surface":"…","path":"…","headline":"…","changed":"…","measured":"…","notice":"…","risk":"…",
            "images": {"midnight": {"before": "images/c--midnight--before.png", "after": "…"}},
            "boxes":  {"midnight": {"before": [x,y,w,h], "after": [x,y,w,h]}}}]}
```

- [ ] **Step 1: Write the failing tests**

```python
# scripts/ui-review/tests/test_build.py
import json, os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
from deck.spec import load_spec, SpecError
from deck.crops import crop_images
from deck.build import build_page, theme_tokens, tokens_css, deck_data

class BuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.spec = load_spec(make_fixture(self.tmp)); self.boxes = crop_images(self.spec, log=lambda *a: None)['boxes']
    def test_builds_one_self_describing_page(self):
        html, warnings = build_page(self.spec, self.boxes)
        self.assertIn('<title>Fixture review</title>', html); self.assertIn('const DECK=', html)
        self.assertIn('<html lang="en" data-theme="midnight">', html)         # first paint already wears the first theme
        self.assertIn(':root[data-theme="midnight"]{--canvas:#0D1117', html)  # tokens inlined, and outranking page.css's :root defaults
        self.assertIn('.chip{', html); self.assertIn("fetch('/answers'", html)  # css + js inlined
        self.assertEqual(warnings, [])
    def test_deck_data_shape(self):
        d = deck_data(self.spec, self.boxes)
        self.assertEqual(d['runs'], ['before', 'after']); self.assertEqual(d['themeNames']['midnight'], 'Midnight')
        s = d['steps'][1]; self.assertEqual(s['images']['light']['after'], 'images/c--light--after.png'); self.assertEqual(s['boxes']['light']['after'], [25.0, 25.0, 20.0, 15.0])
        self.assertEqual(s['measured'], ''); self.assertEqual(s['risk'], '')
    def test_refuses_when_a_picture_is_missing(self):
        os.remove(os.path.join(self.spec['_base'], 'images', 'c--light--after.png'))
        with self.assertRaises(SpecError) as cm: build_page(self.spec, self.boxes)
        self.assertIn('no picture for light/after', str(cm.exception))
    def test_refuses_when_a_box_is_missing(self):
        self.boxes['S-2']['light'] = {}
        with self.assertRaises(SpecError) as cm: build_page(self.spec, self.boxes)
        self.assertIn('S-2: no highlight box for light', str(cm.exception))
    def test_refuses_on_writing_rule_errors(self):
        self.spec['steps'][0]['headline'] = 'We changed the token'
        with self.assertRaises(SpecError) as cm: build_page(self.spec, self.boxes)
        self.assertIn('banned word "token"', str(cm.exception))
    def test_tokens_for_community_theme_come_from_its_manifest(self):
        # No skip: the worktree has no wecoded-themes/ of its own, build.py must find the workspace root's copy.
        t = theme_tokens(['midnight', 'halftone-dimension', 'meadow-mist'])
        self.assertEqual(t['halftone-dimension']['accent'].lower(), '#e51f48'); self.assertTrue(t['halftone-dimension']['_dark']); self.assertFalse(t['meadow-mist']['_dark'])
        self.assertIn('[data-theme="halftone-dimension"]{', tokens_css(t)); self.assertIn('--radius-md:16px', tokens_css(t))
    def test_unknown_theme_is_an_error(self):
        with self.assertRaises(SpecError): theme_tokens(['no-such-theme'])
    def test_theme_tokens_outrank_the_page_defaults(self):
        # page.css sets the deck's default radii under a bare :root in a LATER <style>; the theme block must be more specific or it loses the tie.
        for line in tokens_css(theme_tokens(['midnight', 'halftone-dimension'])).split('\n'): self.assertTrue(line.startswith(':root[data-theme="'), line)
        self.assertRegex(open(os.path.join(os.path.dirname(HERE), 'deck', 'page.css')).read(), r':root\{[^}]*--radius-md:')
    def test_script_safe_json(self):
        self.spec['steps'][0]['notice'] = 'a </script> tag'
        html, _ = build_page(self.spec, self.boxes); self.assertNotIn('</script> tag', html)

if __name__ == '__main__': unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest scripts/ui-review/tests/test_build.py 2>&1 | tail -2`
Expected: `ModuleNotFoundError: No module named 'deck.build'`

- [ ] **Step 3: Write `page.html.tmpl`**

```html
<!doctype html><html lang="en" data-theme="__THEME__"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<style id="tokens">/*TOKENS*/</style>
<style>/*CSS*/</style></head><body>
<div class="deck">
<div class="chip"><span class="k">Review deck</span><span class="div"></span><span class="t" id="deck-title"></span></div>
<header class="top"><div class="wrap">
  <div class="where"><span class="id" id="wtitle"></span><span class="sep">·</span><span class="eyebrow" id="wsub"></span></div>
  <div class="nav"><button class="btn ghost sm" id="prev">‹ Prev</button><div class="steps" id="steps" title="Click a segment to revisit that step"></div><button class="btn ghost sm" id="next">Next ›</button></div>
  <span class="count" id="count"></span><button class="btn" id="done">Done<span class="long"> — Submit Feedback</span></button>
</div></header>
<main><div class="step on" id="step">
  <div class="thumbs" id="thumbs"></div>
  <div class="content" id="content">
    <div class="stage" id="stage"><div class="zoom"><button id="zout" title="Zoom out (−)">−</button><span class="lvl" id="lvl">100%</span><button id="zin" title="Zoom in (+)">+</button></div><div class="inner" id="inner"></div></div>
    <div class="info"><p class="what" id="headline"></p><div class="cards" id="cards"></div></div>
    <div class="controls">
      <button class="btn ans" data-v="yes"><span class="dot yes"></span>Yes, keep it</button>
      <button class="btn ans" data-v="no"><span class="dot no"></span>No, revert it</button>
      <button class="btn ans" data-v="other"><span class="dot other"></span>Other</button>
      <input class="note" id="note" placeholder="Add a note (optional)">
      <button class="btn primary" id="save">Save &amp; Next ›</button>
    </div>
  </div>
</div></main>
</div>
<div class="loupe" id="loupe"></div>
<div class="veil" id="veil"><div class="dlg"><h2>Submit your feedback?</h2><p id="dlg-text"></p>
<div class="warn" id="skipped"><svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".6"/></svg><span><span id="skipn"></span> Skipped steps are sent as "no answer"; Claude leaves those unchanged.</span></div>
<textarea id="feedback" readonly></textarea>
<div class="row"><button class="btn ghost" id="cancel">Keep reviewing</button><button class="btn" id="first">Go to first skipped</button><button class="btn" id="copy">Copy feedback</button><button class="btn primary" id="submit">Submit</button></div>
</div></div>
<script>const DECK=__DECK__;</script>
<script>/*JS*/</script>
</body></html>
```

- [ ] **Step 4: Write `page.css`** (mockup G's styles, minus the mockup-only badge; `:root` holds only what the tokens don't)

```css
/* Review deck v2 — the approved page (docs/active/prototypes/2026-08-27-deck-mockup-g.html).
   Theme tokens are inlined by build.py into <style id="tokens">; amber is the deck's own colour. */
:root{--radius-sm:4px;--radius-md:8px;--radius-lg:12px;--radius-full:9999px;--yes:#2E9B57;--no:#E5484D;--other:#C99700;--mark:#FFB020;--font:'Cascadia Mono','Cascadia Code','Fira Code',monospace;--content:clamp(900px,80vw,1640px)}
*{box-sizing:border-box} html,body{height:100%;margin:0}
body{font:13px/1.45 var(--font);color:var(--fg);background:var(--well);display:flex;flex-direction:column;padding:18px 10px 10px}
/* the deck is a distinct surface: inset on the darker well, framed in amber, so it never reads as the app's own chrome */
.deck{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;background:var(--canvas);border:2px solid rgba(255,176,32,.6);border-radius:14px;overflow:visible;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 8px 30px rgba(0,0,0,.25)}
body.embedded .deck{margin-bottom:62px}   /* the app's file panel floats an Edit button over this strip */
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);font-weight:500}
/* the chip sits ON the frame: tool name | deck title */
.chip{position:absolute;top:-13px;left:18px;z-index:5;display:inline-flex;align-items:center;height:26px;background:var(--mark);color:#1a1100;border-radius:7px;padding:0 10px 0 9px;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.chip .k{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap} .chip .div{width:1px;height:14px;background:rgba(0,0,0,.35);margin:0 9px} .chip .t{font-size:12px;font-weight:500;white-space:nowrap}
.wrap{width:min(var(--content),100%);margin:0 auto;display:flex;align-items:center;gap:14px;min-width:0}
.top{height:clamp(56px,6vh,64px);flex:none;display:flex;padding:8px 20px 0;background:var(--panel);border-bottom:1px solid var(--edge);border-radius:12px 12px 0 0}
.top .where{flex:none} .top .where .id{white-space:nowrap}
@media (max-width:1400px){.top .where .eyebrow,.top .where .sep{display:none}} @media (max-width:950px){.top .count{display:none}} @media (max-width:760px){.top .long{display:none} .top .nav .btn{padding:0 6px}}
.where{display:flex;align-items:center;gap:10px} .where .id{font-weight:500;font-size:14px} .where .sep{color:var(--fg-faint)}
.nav{display:flex;align-items:center;gap:8px;flex:1;justify-content:center;min-width:0}
.steps{display:flex;gap:3px;align-items:center;flex:1;max-width:360px;min-width:90px} .steps span{flex:1;height:7px;border-radius:3px;background:var(--inset);cursor:pointer;transition:transform .15s}
.steps span:hover{transform:scaleY(1.4)} .steps span.on{box-shadow:0 0 0 2px var(--panel),0 0 0 3px var(--fg)}
.steps span.yes{background:var(--yes)} .steps span.no{background:var(--no)} .steps span.other{background:var(--other)} .steps span.skip{background:var(--fg-faint)}
.count{font-size:11px;color:var(--fg-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.btn{font:inherit;font-size:12px;font-weight:500;height:32px;padding:0 14px;border-radius:var(--radius-md);border:1px solid var(--edge);background:transparent;color:var(--fg);cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;transition:background .15s,transform .15s,filter .15s}
.btn.primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent)} .btn.ghost{border-color:transparent;color:var(--fg-2)} .btn.sm{height:28px;padding:0 10px}
@media (hover:hover){ .btn:hover{background:var(--inset)} .btn.primary:hover{background:var(--accent);filter:brightness(1.12);transform:translateY(-1px)} .btn.ghost:hover{background:var(--inset);color:var(--fg)} }
.btn:disabled{opacity:.45;cursor:default;transform:none;filter:none}
.dot{width:8px;height:8px;border-radius:50%;flex:none} .dot.yes{background:var(--yes)} .dot.no{background:var(--no)} .dot.other{background:var(--other)}
.ans{border-color:var(--edge)} .ans.on{background:var(--inset);border-color:var(--fg);box-shadow:inset 0 0 0 1px var(--fg)}
main{flex:1;min-height:0;display:flex;justify-content:center;padding:14px 20px 16px;overflow:auto}
.step{position:relative;display:flex;width:min(var(--content),100%);flex-direction:column;gap:10px;min-height:0}
.thumbs{position:absolute;left:calc(100% + 16px);top:0;display:flex;flex-direction:column;gap:10px}
body.thumbs-inline .thumbs{position:static;flex-direction:row;justify-content:flex-end;margin-bottom:8px}
.thumb{border:2px solid transparent;border-radius:var(--radius-md);padding:3px;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font:11px var(--font);color:var(--fg-dim)}
.thumb img{height:44px;width:auto;max-width:110px;object-fit:cover;border-radius:3px;display:block} .thumb.on{border-color:var(--accent);color:var(--fg)}
/* ── the three peer containers on one grid; the class is chosen by page.js ── */
.content{flex:1;min-height:0;display:grid;gap:12px}
.content.row-below{grid-template-columns:1fr;grid-template-rows:1fr auto auto;grid-template-areas:"stage" "info" "ctl"}
.content.col-right{grid-template-columns:1fr minmax(320px,30%);grid-template-rows:1fr auto;grid-template-areas:"stage info" "ctl ctl"}
.content.compact{display:flex;flex-direction:column;flex:none}
.compact .stage{flex:none;overflow:visible} .compact .stage .inner{flex-direction:column;align-items:center} .compact .info{overflow:visible}
.step.compact-step{flex:none;min-height:0}
.stage{grid-area:stage} .info{grid-area:info} .controls{grid-area:ctl}
.info,.controls{background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-lg)}
.info{padding:14px 16px;display:flex;flex-direction:column;gap:12px;min-width:0;overflow:auto}
.controls{padding:clamp(10px,1.2vh,14px) 16px;display:flex;flex-wrap:wrap;align-items:center;gap:clamp(8px,0.8vw,14px)}
.compact .controls{display:grid;grid-template-columns:1fr 1fr 1fr;position:sticky;bottom:0;z-index:3;box-shadow:0 -8px 20px rgba(0,0,0,.35)} .compact .controls .ans{max-width:none} .compact .controls .note{grid-column:1/3} .compact .controls #save{grid-column:3}
.stage{position:relative;background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-lg);overflow:auto;min-height:0;line-height:0;font-size:0}
.stage .inner{display:flex;justify-content:center;align-items:center;gap:18px;padding:12px 14px;min-width:100%;min-height:100%}
.content.stacked .stage .inner{flex-direction:column;align-items:center}
.frame{display:block;margin:0}
figcaption{font:500 11px/1 var(--font);text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);margin-bottom:6px;text-align:left}
.pic{position:relative;display:inline-block} .pic img{display:block;height:auto;border-radius:var(--radius-sm);cursor:none} body.no-loupe .pic img{cursor:default}
.box{position:absolute;border:2px solid var(--mark);border-radius:5px;box-shadow:0 0 0 3px rgba(255,176,32,.28),0 0 14px rgba(0,0,0,.45);pointer-events:none}
.zoom{position:sticky;top:10px;float:right;margin:10px 10px -42px 0;z-index:2;display:inline-flex;align-items:center;background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-full);padding:2px;gap:2px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.zoom button{font:inherit;font-size:12px;font-weight:500;width:28px;height:26px;border:0;border-radius:var(--radius-full);background:transparent;color:var(--fg-2);cursor:pointer} .zoom .lvl{font-size:11px;color:var(--fg-dim);min-width:38px;text-align:center;font-variant-numeric:tabular-nums}
.loupe{position:fixed;width:180px;height:180px;border-radius:50%;border:2px solid var(--fg);box-shadow:0 0 0 1px rgba(0,0,0,.5),0 8px 24px rgba(0,0,0,.45);background-repeat:no-repeat;pointer-events:none;display:none;z-index:9;background-color:var(--panel)}
.loupe::before,.loupe::after{content:"";position:absolute;left:50%;top:50%;background:var(--mark);box-shadow:0 0 0 1px rgba(0,0,0,.6)} .loupe::before{width:14px;height:2px;margin:-1px 0 0 -7px} .loupe::after{width:2px;height:14px;margin:-7px 0 0 -1px}
.what{font-size:clamp(15px,1.15vw,19px);font-weight:500;margin:0;line-height:1.35}
.cards{display:grid;gap:10px} .row-below .cards{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))} .col-right .cards{grid-template-columns:1fr} .compact .cards{grid-template-columns:1fr}
.card{background:var(--inset);border:1px solid var(--edge);border-radius:var(--radius-md);padding:10px 12px} .card h3{margin:0 0 6px;font:500 11px/1 var(--font);text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);display:flex;align-items:center;gap:7px}
.card h3 svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round} .card p{margin:0;font-size:13px;color:var(--fg);line-height:1.45} .card .num{margin-top:6px;font-size:11px;color:var(--fg-dim)}
.card.risk{border-color:color-mix(in srgb, var(--mark) 45%, var(--edge))} .card.risk h3{color:var(--mark)}
.ans{flex:1 1 140px;max-width:280px;justify-content:center;height:clamp(34px,4.4vh,52px);font-size:clamp(12px,0.95vw,15px)} .ans .dot{width:clamp(8px,0.7vw,11px);height:clamp(8px,0.7vw,11px)}
#save{height:clamp(34px,4.4vh,52px);font-size:clamp(12px,0.95vw,15px);padding:0 clamp(14px,1.4vw,26px)}
.note{flex:3 1 220px;font:inherit;font-size:clamp(12px,0.85vw,14px);height:clamp(34px,4.4vh,52px);padding:0 12px;border:1px solid var(--edge);border-radius:var(--radius-md);background:var(--well);color:var(--fg)} .note::placeholder{color:var(--fg-muted)}
.veil{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:30} .veil.on{display:flex}
.dlg{width:min(520px,92vw);background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-lg);padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5)} .dlg h2{margin:0 0 10px;font-size:16px;font-weight:500} .dlg p{margin:0 0 10px;color:var(--fg-2);font-size:13px;line-height:1.5}
.dlg .warn{display:flex;gap:8px;align-items:flex-start;background:var(--inset);border:1px solid color-mix(in srgb, var(--mark) 45%, var(--edge));border-radius:var(--radius-md);padding:10px 12px;color:var(--fg);margin:12px 0}
.dlg .warn svg{width:16px;height:16px;flex:none;stroke:var(--mark);fill:none;stroke-width:1.8;margin-top:1px} .dlg .row{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}
#feedback{display:none;width:100%;min-height:140px;font:12px var(--font);padding:10px;border:1px solid var(--edge);border-radius:var(--radius-md);background:var(--well);color:var(--fg)}
```

- [ ] **Step 5: Write `page.js`**

```js
/* Review deck v2 — renders DECK (one JSON object the builder inlines) one step at a time.
   Persistence: the serve.py endpoints when the page is served (GET/POST /answers, POST /submit),
   localStorage + a copy box when it is opened as a plain file. */
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const N = DECK.steps.length, runs = DECK.runs;
  let cur = 0, theme = DECK.themes[0], zoom = 1, loupeOn = true, server = false, stepStart = Date.now();
  const state = { deck: DECK.key, started: new Date().toISOString(), submitted: null, cur: 0, answers: {} };
  const ICON = {
    change: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m12.5 7.5 4 4"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".6"/></svg>' };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (window.top !== window) document.body.classList.add('embedded');
  $('#deck-title').textContent = DECK.title; document.title = DECK.title;
  $('#steps').innerHTML = DECK.steps.map(() => '<span></span>').join('');
  const stage = $('#stage'), inner = $('#inner'), loupe = $('#loupe');

  // ── persistence ──
  const LS = 'deck:' + DECK.key;
  async function load() {
    try { const r = await fetch('/answers', { cache: 'no-store' }); if (r.ok) { server = true; const j = await r.json(); if (j && j.answers) Object.assign(state, j); return; } } catch (e) { /* not served */ }
    try { const j = JSON.parse(localStorage.getItem(LS) || 'null'); if (j && j.answers) Object.assign(state, j); } catch (e) { /* no storage */ }
  }
  async function save() {
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* no storage */ }
    if (server) { try { await fetch('/answers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) }); } catch (e) { /* server gone; localStorage still has it */ } }
  }

  // ── render the current step ──
  function render() {
    const st = DECK.steps[cur];
    document.documentElement.dataset.theme = theme;   // before the pictures load, so a theme switch never flashes the old colours
    $('#wtitle').textContent = st.surface; $('#wsub').textContent = st.path;
    inner.innerHTML = runs.map(r => `<figure class="frame" data-run="${esc(r)}"><figcaption>${esc(DECK.runLabels[r] || r)}</figcaption><div class="pic"><img src="${esc(st.images[theme][r])}" alt=""><span class="box"></span></div></figure>`).join('');
    $$('#inner .frame').forEach(f => { const b = (st.boxes[theme] || {})[f.dataset.run]; const box = f.querySelector('.box'); if (b) box.style.cssText = `left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%`; else box.style.display = 'none'; });
    $('#headline').textContent = st.headline;
    $('#cards').innerHTML = `<section class="card"><h3>${ICON.change}What changed</h3><p>${esc(st.changed)}</p>${st.measured ? `<p class="num">Measured: ${esc(st.measured)}</p>` : ''}</section>`
      + `<section class="card"><h3>${ICON.eye}You'll notice</h3><p>${esc(st.notice)}</p></section>`
      + (st.risk ? `<section class="card risk"><h3>${ICON.warn}Risk</h3><p>${esc(st.risk)}</p></section>` : '');
    const last = runs[runs.length - 1];
    $('#thumbs').innerHTML = DECK.themes.map(t => `<button class="thumb${t === theme ? ' on' : ''}" data-v="${esc(t)}" title="${esc(DECK.themeNames[t])}"><img src="${esc(st.images[t][last])}" alt=""><span>${esc(DECK.themeNames[t])}</span></button>`).join('');
    $$('.thumb').forEach(b => b.onclick = () => { theme = b.dataset.v; render(); });
    $$('#inner img').forEach(i => i.addEventListener('load', layout));
    layout(); paintState();
  }
  function paintState() {
    const a = state.answers[DECK.steps[cur].id] || {};
    $$('.ans').forEach(b => b.classList.toggle('on', b.dataset.v === a.v));
    const note = $('#note'); note.value = a.note || ''; note.placeholder = a.v === 'other' ? 'Explain what you’d like instead…' : 'Add a note (optional)';
    $$('#steps span').forEach((s, i) => { const x = state.answers[DECK.steps[i].id]; s.className = (x && x.v ? x.v : '') + (i === cur ? ' on' : ''); });
    const done = Object.values(state.answers).filter(x => x.v && x.v !== 'skip').length;
    $('#count').textContent = 'step ' + (cur + 1) + ' of ' + N + ' · ' + done + ' answered';
    $('#save').disabled = !(a.v && a.v !== 'skip'); $('#prev').disabled = cur === 0; $('#next').disabled = cur === N - 1; $('#next').textContent = cur === N - 1 ? 'Last step' : 'Next ›';
  }

  // ── layout: try each arrangement for real, keep the one that shows the pictures largest (spec §3.4) ──
  const PAD = 28, CAP = 24, GAP = 18;
  function layout() {
    const c = $('#content'), step = $('#step'); const img = $('#inner img'); if (!img || !img.naturalWidth) return;
    const margin = (document.querySelector('main').clientWidth - step.clientWidth) / 2; document.body.classList.toggle('thumbs-inline', margin < 150);
    const n = runs.length, w = img.naturalWidth, h = img.naturalHeight + CAP;
    const opts = { A: 'row-below', B: 'col-right stacked', C: 'col-right', D: 'row-below stacked' }; const score = {};
    step.classList.remove('compact-step');
    for (const k in opts) {
      if (opts[k].includes('col-right') && c.clientWidth < 820) { score[k] = 0; continue; }   // a side column needs real width
      if (n === 1 && opts[k].includes('stacked')) { score[k] = 0; continue; }                 // one picture: stacking means nothing
      c.className = 'content ' + opts[k]; const SW = stage.clientWidth - PAD, SH = stage.clientHeight - PAD; const stacked = opts[k].includes('stacked');
      score[k] = Math.min(stacked ? SW / w : (SW - GAP * (n - 1)) / n / w, stacked ? (SH - GAP * (n - 1)) / n / h : SH / h);
    }
    let best = 'A'; for (const k of ['B', 'C', 'D']) if (score[k] > score[best] * 1.05) best = k;   // A wins ties
    let s;
    if (score[best] < 0.5) { c.className = 'content compact'; step.classList.add('compact-step'); s = Math.min((c.clientWidth - PAD) / w, 1); }
    else { c.className = 'content ' + opts[best]; s = Math.min(score[best], 1.5); }
    $$('#inner img').forEach(i => i.style.width = (i.naturalWidth * s * zoom) + 'px');
    $('#lvl').textContent = Math.round(zoom * 100) + '%';
    // Read by the render test: the choice, and the scores it was made from (so the test checks the RULE, not a table).
    document.body.dataset.layout = score[best] < 0.5 ? 'compact' : best;
    document.body.dataset.scores = JSON.stringify(score);
    window.__deckReady = true;   // the render test waits for this — set only once a real layout has been chosen
    const b = $('#inner .frame .box'); if (b && zoom > 1) b.scrollIntoView({ block: 'center', inline: 'center' });
  }

  // ── navigation & answers ──
  function record() {
    const id = DECK.steps[cur].id; const a = state.answers[id] || {};
    if (!a.v) a.v = 'skip';
    a.seconds = (a.seconds || 0) + Math.round((Date.now() - stepStart) / 1000); a.theme = theme; a.zoom = zoom;
    state.answers[id] = a;
  }
  function go(i) { if (state.submitted) return; record(); cur = Math.max(0, Math.min(N - 1, i)); state.cur = cur; save(); zoom = 1; stepStart = Date.now(); render(); }   // after Submit nothing moves or saves
  $$('.ans').forEach(b => b.onclick = () => { const id = DECK.steps[cur].id; state.answers[id] = { ...(state.answers[id] || {}), v: b.dataset.v }; paintState(); $('#note').focus(); });
  $('#note').addEventListener('input', e => { const id = DECK.steps[cur].id; state.answers[id] = { ...(state.answers[id] || {}), note: e.target.value }; });
  $('#save').onclick = () => { if (cur === N - 1) openDialog(); else go(cur + 1); };
  $('#next').onclick = () => go(cur + 1); $('#prev').onclick = () => go(cur - 1);
  $$('#steps span').forEach((s, i) => s.onclick = () => go(i));

  // ── submit ──
  function summary() {
    const counts = { yes: 0, no: 0, other: 0, skip: 0 }; const lines = [];
    for (const st of DECK.steps) { const a = state.answers[st.id] || { v: 'skip' }; const v = a.v || 'skip'; counts[v] = (counts[v] || 0) + 1; lines.push(st.id + ' ' + v + (a.note && a.note.trim() ? ' — "' + a.note.trim() + '"' : '')); }
    return DECK.key + ' · ' + (state.submitted ? 'submitted ' + state.submitted.slice(0, 16).replace('T', ' ') : 'not submitted') + ' · ' + counts.yes + ' yes · ' + counts.no + ' no · ' + counts.other + ' other · ' + counts.skip + ' skipped\n' + lines.join('\n');
  }
  function openDialog() {
    record(); stepStart = Date.now(); paintState(); save();   // reset the clock (Keep reviewing → Done must not count twice) and grey the step just marked skip
    const missing = DECK.steps.map((st, i) => [(state.answers[st.id] || {}).v, i]).filter(([v]) => !v || v === 'skip').map(([, i]) => i + 1);
    $('#skipped').style.display = missing.length ? 'flex' : 'none';
    $('#skipn').textContent = missing.length + (missing.length === 1 ? ' step has' : ' steps have') + ' no answer (step' + (missing.length > 1 ? 's ' : ' ') + missing.join(', ') + ').';
    $('#first').style.display = missing.length ? 'inline-flex' : 'none'; $('#first').onclick = () => { $('#veil').classList.remove('on'); go(missing[0] - 1); };
    $('#dlg-text').innerHTML = server
      ? 'Your answers have been saving to a file next to this deck as you went. Submitting tells Claude you\'re finished — it picks them up in the session and replies there. <b>Nothing to copy or paste</b>: close this tab and go back to the conversation.'
      : 'This deck is not being served, so Claude is not watching it. Copy the feedback below and paste it into the chat.';
    $('#feedback').style.display = server ? 'none' : 'block'; $('#copy').style.display = server ? 'none' : 'inline-flex'; $('#submit').style.display = server ? 'inline-flex' : 'none';
    $('#feedback').value = summary(); $('#veil').classList.add('on');
  }
  $('#done').onclick = openDialog; $('#cancel').onclick = () => $('#veil').classList.remove('on');
  $('#submit').onclick = async () => {
    state.submitted = new Date().toISOString();
    try { await fetch('/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) }); } catch (e) { /* server already gone */ }
    $('#veil').classList.remove('on'); $('#done').textContent = 'Submitted ✓'; $('#done').disabled = true; $$('.ans,#save,#note').forEach(e => e.disabled = true);
  };
  $('#copy').onclick = () => { const t = $('#feedback'); t.select(); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).catch(() => document.execCommand('copy')); $('#copy').textContent = 'Copied'; };

  // ── loupe, zoom, keys ──
  const K = 2.5, R = 90;
  stage.addEventListener('mousemove', e => {
    if (!loupeOn) { loupe.style.display = 'none'; return; }
    const img = $$('#inner img').find(i => { const r = i.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
    if (!img) { loupe.style.display = 'none'; return; }
    const r = img.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    loupe.style.display = 'block'; loupe.style.left = (e.clientX - R) + 'px'; loupe.style.top = (e.clientY - R) + 'px';
    loupe.style.backgroundImage = 'url("' + img.src + '")'; loupe.style.backgroundSize = (r.width * K) + 'px ' + (r.height * K) + 'px'; loupe.style.backgroundPosition = (-x * K + R) + 'px ' + (-y * K + R) + 'px';
  });
  stage.addEventListener('mouseleave', () => loupe.style.display = 'none');
  function setZoom(z) { zoom = Math.max(1, Math.min(4, Math.round(z * 10) / 10)); layout(); }
  $('#zin').onclick = () => setZoom(zoom + 0.1); $('#zout').onclick = () => setZoom(zoom - 0.1);
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!state.submitted) { if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); }
    if (e.key === '+' || e.key === '=') setZoom(zoom + 0.1); if (e.key === '-') setZoom(zoom - 0.1); if (e.key === '0') setZoom(1);
    if (e.key === 'l') { loupeOn = !loupeOn; if (!loupeOn) loupe.style.display = 'none'; document.body.classList.toggle('no-loupe', !loupeOn); }
  });
  window.addEventListener('resize', layout);
  load().then(() => {
    const q = new URLSearchParams(location.search);
    cur = q.get('step') ? Math.max(0, Math.min(N - 1, +q.get('step') - 1)) : Math.max(0, Math.min(N - 1, state.cur || 0));
    if (q.get('theme') && DECK.themes.includes(q.get('theme'))) theme = q.get('theme');
    stepStart = Date.now(); render();   // __deckReady is set by layout() once the first picture has decoded
  });
})();
```

- [ ] **Step 6: Write `build.py`**

```python
# scripts/ui-review/deck/build.py
"""Assemble one self-describing HTML page: page.html.tmpl + page.css + page.js + the theme tokens
+ the deck data as one JSON object. Refuses when a picture or a box is missing, or a writing
rule is broken — a deck with a hole in it is worse than no deck (spec §5)."""
import html
import json
import os

from .crops import image_name
from .spec import SpecError, run_names, validate, workspace_root

HERE = os.path.dirname(os.path.abspath(__file__))
NICE = {'midnight': 'Midnight', 'dark': 'Dark', 'light': 'Light', 'creme': 'Crème', 'halftone-dimension': 'Halftone', 'meadow-mist': 'Meadow'}
TOKEN_KEYS = ['canvas', 'panel', 'inset', 'well', 'accent', 'on-accent', 'fg', 'fg-2', 'fg-dim', 'fg-muted', 'fg-faint', 'edge', 'link']
RADIUS_KEYS = ['radius-sm', 'radius-md', 'radius-lg']


def theme_tokens(themes):
    """Built-ins from tokens.json; community themes from their manifest (tokens + shape radii + dark flag)."""
    with open(os.path.join(HERE, 'tokens.json')) as f:
        builtin = json.load(f)
    # Community themes live in the wecoded-themes checkout at the WORKSPACE root — a worktree has none.
    theme_dirs = [os.path.join(workspace_root(), 'wecoded-themes', 'themes')]
    out = {}
    for t in themes:
        if t in builtin:
            out[t] = builtin[t]
            continue
        for d in theme_dirs:
            mf = os.path.join(d, t, 'manifest.json')
            if os.path.exists(mf):
                with open(mf) as f:
                    m = json.load(f)
                tok = {k: v for k, v in m.get('tokens', {}).items() if k in TOKEN_KEYS}
                tok.setdefault('link', tok.get('accent', '#58A6FF'))
                for k in RADIUS_KEYS:
                    if k in (m.get('shape') or {}):
                        tok[k] = m['shape'][k]
                tok['_dark'] = bool(m.get('dark', True))
                out[t] = tok
                break
        else:
            raise SpecError(f'no tokens for theme "{t}" (not built in, no manifest under {theme_dirs})')
    return out


def tokens_css(tokens):
    # `:root[data-theme=…]` (specificity 0,2,0), not `[data-theme=…]` (0,1,0): page.css declares the
    # deck's default radii under a bare `:root` in a LATER <style>, and an equal-specificity tie goes
    # to the later rule — so Halftone's 16 px radii never won until 2026-08-27 (inherited from the mockup).
    lines = []
    for t, tok in tokens.items():
        decl = ';'.join(f'--{k}:{v}' for k, v in tok.items() if not k.startswith('_'))
        lines.append(f':root[data-theme="{t}"]{{{decl};color-scheme:{"dark" if tok.get("_dark", True) else "light"}}}')
    return '\n'.join(lines)


def deck_data(spec, boxes):
    runs = run_names(spec)
    steps = [{
        'id': st['id'], 'surface': st['surface'], 'path': st['path'], 'headline': st['headline'],
        'changed': st['changed'], 'measured': st.get('measured', ''), 'notice': st['notice'], 'risk': st.get('risk', ''),
        'images': {t: {r: f'{spec["images"]}/{image_name(st["crop"], t, r)}' for r in runs} for t in spec['themes']},
        'boxes': boxes.get(st['id'], {}),
    } for st in spec['steps']]
    return {'title': spec['title'], 'key': spec['key'], 'runs': runs,
            'runLabels': {'before': 'Before', 'after': 'After', 'today': 'Today', **spec.get('labels', {})},
            'themes': spec['themes'], 'themeNames': {t: NICE.get(t, t.replace('-', ' ').title()) for t in spec['themes']},
            'steps': steps}


def build_page(spec, boxes):
    errors, warnings = validate(spec)
    runs = run_names(spec)
    for st in spec['steps']:
        for t in spec['themes']:
            for r in runs:
                if not os.path.exists(os.path.join(spec['_base'], spec['images'], image_name(st['crop'], t, r))):
                    errors.append(f'{st["id"]}: no picture for {t}/{r} — run `crop` (and check coverage.md for that shot)')
            have = boxes.get(st['id'], {}).get(t) or {}
            if not all(r in have for r in runs):
                errors.append(f'{st["id"]}: no highlight box for {t} — `crop` could not resolve it (see its output)')
    if errors:
        raise SpecError('\n'.join(errors))

    def read(name):
        with open(os.path.join(HERE, name)) as f:
            return f.read()
    page = read('page.html.tmpl')
    page = page.replace('/*TOKENS*/', tokens_css(theme_tokens(spec['themes']))).replace('/*CSS*/', read('page.css')).replace('/*JS*/', read('page.js'))
    # `</` inside the JSON would end the <script>; escaping it keeps the JSON valid.
    page = page.replace('__TITLE__', html.escape(spec['title'])).replace('__THEME__', html.escape(spec['themes'][0]))
    page = page.replace('__DECK__', json.dumps(deck_data(spec, boxes)).replace('</', '<\\/'))
    return page, warnings
```

- [ ] **Step 7: Run to verify pass**

Run: `python3 -m unittest scripts/ui-review/tests/test_build.py -v 2>&1 | tail -3`
Expected: `OK` (9 tests, none skipped).

- [ ] **Step 8: Commit**

```bash
git add scripts/ui-review/deck/page.html.tmpl scripts/ui-review/deck/page.css scripts/ui-review/deck/page.js scripts/ui-review/deck/build.py scripts/ui-review/tests/test_build.py
git commit -m "feat(ui-review): deck v2 page (approved mockup G) and the builder that inlines it"
```

---

### Task 7: `serve.py` — answers file, submit → exit, feedback summary

**Files:**
- Create: `scripts/ui-review/deck/serve.py`
- Test: `scripts/ui-review/tests/test_serve.py`

**Interfaces:**
- Produces: `answers_path(spec) -> str`; `write_atomic(path, obj)`; `summary(spec, state) -> str` (spec §4.5 format); `make_server(spec, port, on_submit) -> (server, url)`; `serve(spec, port=0, open_browser=True, timeout_min=240, log=print) -> int` (0 submit / 2 timeout / 3 already served); `wait_for_submit(spec, timeout_min=240, poll_s=2, log=print) -> int` (0 when the answers file carries `submitted`, summary logged; 2 on timeout — reads the file only, so a session that lost the `serve` process can still wait); `open_url(url)`.

- [ ] **Step 1: Write the failing tests**

```python
# scripts/ui-review/tests/test_serve.py
import json, os, sys, tempfile, threading, time, unittest, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
from deck.spec import load_spec
from deck.serve import answers_path, make_server, serve, summary, wait_for_submit, write_atomic

def post(url, obj):
    req = urllib.request.Request(url, data=json.dumps(obj).encode(), headers={'content-type': 'application/json'}, method='POST')
    return json.loads(urllib.request.urlopen(req, timeout=5).read())

class ServeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.spec = load_spec(make_fixture(self.tmp))
        open(os.path.join(self.spec['_base'], 'fixture.html'), 'w').write('<p>deck</p>')
    def test_round_trip_and_submit_stops_the_server(self):
        got = {}
        srv, url = make_server(self.spec, 0, lambda state: got.update(state) or threading.Thread(target=srv.shutdown, daemon=True).start())
        t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
        base = url.rsplit('/', 1)[0]
        self.assertEqual(json.loads(urllib.request.urlopen(base + '/answers', timeout=5).read()), {})
        self.assertIn(b'deck', urllib.request.urlopen(url, timeout=5).read())
        post(base + '/answers', {'deck': 'fixture', 'answers': {'S-1': {'v': 'yes'}}})
        self.assertEqual(json.load(open(answers_path(self.spec)))['answers']['S-1']['v'], 'yes')
        self.assertFalse(os.path.exists(answers_path(self.spec) + '.tmp'))
        post(base + '/submit', {'deck': 'fixture', 'answers': {'S-1': {'v': 'yes'}, 'S-2': {'v': 'other', 'note': 'bigger'}}})
        t.join(5); self.assertFalse(t.is_alive())
        self.assertTrue(got['submitted']); self.assertTrue(json.load(open(answers_path(self.spec)))['submitted'])
    def test_summary_format(self):
        state = {'submitted': '2026-08-27T18:40:00Z', 'answers': {'S-1': {'v': 'yes'}, 'S-2': {'v': 'other', 'note': ' bigger '}}}
        s = summary(self.spec, state).split('\n')
        self.assertEqual(s[0], 'fixture · submitted 2026-08-27 18:40 · 1 yes · 0 no · 1 other · 1 skipped')
        self.assertEqual(s[1:], ['S-1 yes', 'S-2 other — "bigger"', 'S-3 skip'])
    def test_serve_returns_0_on_submit_and_prints_summary(self):
        out = []; result = {}
        def run(): result['code'] = serve(self.spec, port=0, open_browser=False, timeout_min=1, log=out.append)
        t = threading.Thread(target=run, daemon=True); t.start()
        for _ in range(50):
            if any(l.startswith('[deck] http') for l in out): break
            time.sleep(0.1)
        url = next(l for l in out if l.startswith('[deck] http')).split(' ', 1)[1]
        post(url.rsplit('/', 1)[0] + '/submit', {'deck': 'fixture', 'answers': {}})
        t.join(5); self.assertEqual(result['code'], 0); self.assertTrue(any('3 skipped' in l for l in out))
        self.assertFalse(os.path.exists(os.path.join(self.spec['_base'], 'deck.serve.json')))
    def test_second_serve_of_same_spec_refuses(self):
        json.dump({'pid': os.getpid(), 'url': 'http://127.0.0.1:1/x'}, open(os.path.join(self.spec['_base'], 'deck.serve.json'), 'w'))
        out = []; self.assertEqual(serve(self.spec, port=0, open_browser=False, timeout_min=1, log=out.append), 3); self.assertTrue(any('REFUSING' in l for l in out))
    def test_write_atomic(self):
        p = os.path.join(self.tmp, 'a.json'); write_atomic(p, {'x': 1}); self.assertEqual(json.load(open(p)), {'x': 1})
    def test_wait_returns_0_when_the_file_says_submitted_and_2_on_timeout(self):
        out = []
        self.assertEqual(wait_for_submit(self.spec, timeout_min=0.002, poll_s=0.05, log=out.append), 2)   # ~0.12 s, no file
        write_atomic(answers_path(self.spec), {'answers': {'S-1': {'v': 'yes'}}})                           # saved, not submitted
        self.assertEqual(wait_for_submit(self.spec, timeout_min=0.002, poll_s=0.05, log=out.append), 2)
        write_atomic(answers_path(self.spec), {'submitted': '2026-08-27T18:40:00Z', 'answers': {'S-1': {'v': 'yes'}}})
        out.clear(); self.assertEqual(wait_for_submit(self.spec, timeout_min=1, poll_s=0.05, log=out.append), 0)
        self.assertTrue(any('1 yes' in l and '2 skipped' in l for l in out))

if __name__ == '__main__': unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest scripts/ui-review/tests/test_serve.py 2>&1 | tail -2`
Expected: `ModuleNotFoundError: No module named 'deck.serve'`

- [ ] **Step 3: Write `serve.py`**

```python
# scripts/ui-review/deck/serve.py
"""Serve a built deck on 127.0.0.1, open it in the browser, save every answer to
<spec-stem>.answers.json as it arrives, and exit when Destin submits.

WHY exit-on-submit: Claude runs `serve` as a background command and is re-invoked when it
exits — that exit IS the notification that the review is done, with the summary on stdout.
No copy, no paste, no "I'm done" message (spec §4.3)."""
import http.server
import json
import os
import socketserver
import subprocess
import threading
import time
import webbrowser


def answers_path(spec):
    return os.path.join(spec['_base'], spec['_stem'] + '.answers.json')


def lock_path(spec):
    return os.path.join(spec['_base'], spec['_stem'] + '.serve.json')


def write_atomic(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, indent=1)
    os.replace(tmp, path)


def summary(spec, state):
    """One line per step, ledger id first, in spec order (spec §4.5)."""
    counts = {'yes': 0, 'no': 0, 'other': 0, 'skip': 0}
    lines = []
    for st in spec['steps']:
        a = (state.get('answers') or {}).get(st['id']) or {}
        v = a.get('v') or 'skip'
        counts[v] = counts.get(v, 0) + 1
        note = (a.get('note') or '').strip()
        lines.append(f'{st["id"]} {v}' + (f' — "{note}"' if note else ''))
    when = (state.get('submitted') or '')[:16].replace('T', ' ')
    head = (f'{spec["key"]} · {"submitted " + when if when else "not submitted"} · '
            f'{counts["yes"]} yes · {counts["no"]} no · {counts["other"]} other · {counts["skip"]} skipped')
    return head + '\n' + '\n'.join(lines)


class _Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def make_server(spec, port, on_submit):
    apath = answers_path(spec)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=spec['_base'], **k)

        def log_message(self, *a):   # quiet; the CLI prints what matters
            pass

        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header('content-type', 'application/json')
            self.send_header('content-length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path.split('?')[0] == '/answers':
                if os.path.exists(apath):
                    with open(apath) as f:
                        return self._json(200, json.load(f))
                return self._json(200, {})
            return super().do_GET()

        def do_POST(self):
            n = int(self.headers.get('content-length') or 0)
            try:
                state = json.loads(self.rfile.read(n) or b'{}')
            except (ValueError, TypeError):
                return self._json(400, {'error': 'body is not JSON'})   # a reply, never a dropped connection
            if self.path == '/answers':
                write_atomic(apath, state)
                return self._json(200, {'ok': True})
            if self.path == '/submit':
                state['submitted'] = state.get('submitted') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                write_atomic(apath, state)
                self._json(200, {'ok': True})
                on_submit(state)
                return
            return self._json(404, {'error': 'unknown path'})

    srv = _Server(('127.0.0.1', port), Handler)
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/{spec["out"]}'


def open_url(url):
    for cmd in (['xdg-open', url], ['open', url]):
        try:
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except FileNotFoundError:
            continue
    return webbrowser.open(url)


def serve(spec, port=0, open_browser=True, timeout_min=240, log=print):
    """Blocks. Returns 0 after a submit (summary logged), 2 on timeout, 3 if this spec is already served."""
    lock = lock_path(spec)
    if os.path.exists(lock):
        try:
            with open(lock) as f:
                other = json.load(f)
            # kill(pid, 0) sends nothing: ProcessLookupError = dead, PermissionError = alive but not
            # ours. Both are OSError, so they must be told apart or a live foreign lock reads as stale.
            try:
                os.kill(other['pid'], 0)
            except ProcessLookupError:
                raise ValueError('stale')
            except PermissionError:
                pass   # alive
            log(f'REFUSING: {spec["_stem"]} is already served by pid {other["pid"]} at {other["url"]}')
            return 3
        except (OSError, ValueError, KeyError):
            pass   # stale or unreadable lock
    result = {}
    holder = {}

    # shutdown() blocks until serve_forever() returns, so calling it on a thread serve_forever owns
    # (every handler thread is one) would deadlock — it always runs on a throwaway thread.
    def on_submit(state):
        result['state'] = state
        threading.Thread(target=holder['srv'].shutdown, daemon=True).start()
    srv, url = make_server(spec, port, on_submit)
    holder['srv'] = srv
    with open(lock, 'w') as f:
        json.dump({'pid': os.getpid(), 'url': url}, f)
    log(f'[deck] {url}')
    if open_browser:
        open_url(url)
    timer = threading.Timer(timeout_min * 60, lambda: threading.Thread(target=srv.shutdown, daemon=True).start())
    timer.daemon = True
    timer.start()
    try:
        srv.serve_forever()
    finally:
        timer.cancel()
        srv.server_close()
        try:
            os.remove(lock)
        except OSError:
            pass
    if 'state' in result:
        log(summary(spec, result['state']))
        return 0
    log(f'[deck] no submit after {timeout_min} min — answers so far are in {answers_path(spec)}')
    return 2


def wait_for_submit(spec, timeout_min=240, poll_s=2, log=print):
    """Block until the answers file carries `submitted`; 0 with the summary logged, 2 on timeout.
    WHY a second way to wait: `serve` runs as a background command and its exit is the signal —
    but a session that was compacted, restarted or lost that process still needs to know when
    Destin is done. This reads only the file, so it works whether or not `serve` is alive."""
    deadline = time.monotonic() + timeout_min * 60
    apath = answers_path(spec)
    while True:
        try:
            with open(apath) as f:
                state = json.load(f)
            if state.get('submitted'):
                log(summary(spec, state))
                return 0
        except (OSError, ValueError):
            pass   # not written yet, or mid-write (write_atomic renames, so this is rare)
        if time.monotonic() >= deadline:
            log(f'[deck] no submit after {timeout_min} min — answers so far are in {apath}')
            return 2
        time.sleep(poll_s)
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m unittest scripts/ui-review/tests/test_serve.py -v 2>&1 | tail -3`
Expected: `OK` (8 tests — the two added by the 2026-08-27 review: a non-JSON POST gets a 400 and writes nothing; a lock naming pid 1 — alive, not ours — still refuses with 3)

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-review/deck/serve.py scripts/ui-review/tests/test_serve.py
git commit -m "feat(ui-review): deck server — answers file on every click, submit ends the process with the summary; wait reads the file alone"
```

---

### Task 8: The CLI — `review-cards.py build | serve | wait`

**Files:**
- Modify: `scripts/ui-review/review-cards.py` (full replacement)
- Test: `scripts/ui-review/tests/test_cli.py`

**Interfaces:**
- Consumes: Tasks 1, 5, 6, 7.
- Produces: `main(argv) -> int`. `build` = crop + build in one go (exit 1 on a writing-rule error, anything missing, or a refusal — the page is NOT written in that case); `serve` = build, then serve (`--no-build` skips the build; exit codes as Task 7); `wait` = `wait_for_submit` (0 / 2). There is no `crop` command and no intermediate file: a stale boxes file would draw wrong rings with no error.

- [ ] **Step 1: Write the failing test**

```python
# scripts/ui-review/tests/test_cli.py
import io, json, os, sys, tempfile, unittest
from contextlib import redirect_stderr, redirect_stdout
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
import importlib.util
spec_ = importlib.util.spec_from_file_location('review_cards', os.path.join(os.path.dirname(HERE), 'review-cards.py')); rc = importlib.util.module_from_spec(spec_); spec_.loader.exec_module(rc)

class CliTests(unittest.TestCase):
    def setUp(self): self.p = make_fixture(tempfile.mkdtemp()); self.d = os.path.dirname(self.p)
    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err): code = rc.main(list(args))
        return code, out.getvalue(), err.getvalue()
    def test_build_crops_and_writes_the_page(self):
        code, out, err = self.run_cli('build', self.p); self.assertEqual(code, 0, err)
        self.assertIn('4 crops', out); self.assertIn('wrote', out); self.assertTrue(os.path.exists(os.path.join(self.d, 'fixture.html')))
    def test_build_reports_missing_as_failure_and_writes_no_page(self):
        s = json.load(open(self.p)); s['steps'][1]['highlight'] = {'selector': '#nope'}; json.dump(s, open(self.p, 'w'))
        code, _, err = self.run_cli('build', self.p); self.assertEqual(code, 1); self.assertIn('missing: S-2', err)
        self.assertFalse(os.path.exists(os.path.join(self.d, 'fixture.html')))
    def test_writing_rule_error_is_reported(self):
        s = json.load(open(self.p)); s['steps'][0]['headline'] = 'Changed the token'; json.dump(s, open(self.p, 'w'))
        code, _, err = self.run_cli('build', self.p); self.assertEqual(code, 1); self.assertIn('banned word', err)
    def test_wait_reads_the_answers_file(self):
        json.dump({'submitted': '2026-08-27T18:40:00Z', 'answers': {}}, open(os.path.join(self.d, 'deck.answers.json'), 'w'))
        code, out, _ = self.run_cli('wait', self.p, '--timeout', '1'); self.assertEqual(code, 0); self.assertIn('3 skipped', out)

if __name__ == '__main__': unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m unittest scripts/ui-review/tests/test_cli.py 2>&1 | tail -2`
Expected: failures — the v1 script has no `main`.

- [ ] **Step 3: Replace `review-cards.py`**

```python
#!/usr/bin/env python3
"""Review deck v2 — the page Destin approves UI changes on, one point per step.

  python3 scripts/ui-review/review-cards.py build <spec.json>     cut the crops, resolve every highlight box, write the HTML next to the spec
  python3 scripts/ui-review/review-cards.py serve <spec.json> [--no-open] [--no-build] [--port N] [--timeout MIN]
        build it, serve it, open the browser, save answers to <spec>.answers.json, exit when Destin submits
  python3 scripts/ui-review/review-cards.py wait  <spec.json> [--timeout MIN]
        block until the answers file says submitted (for a session that no longer holds the `serve` process)

Run `serve` in the background: its exit is the "review finished" signal and it prints the
feedback summary. There is deliberately no separate crop step — a stale intermediate file drew
wrong rings with no error in v1. Spec format + writing rules:
docs/active/specs/2026-08-27-review-deck-v2-design.md (§4–5; archived after merge). History of the
three rejected formats before this one: docs/active/handoffs/2026-08-27-review-deck-tooling-handoff.md."""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deck.build import build_page                       # noqa: E402
from deck.crops import crop_images                      # noqa: E402
from deck.serve import serve, wait_for_submit           # noqa: E402
from deck.spec import SpecError, load_spec, validate    # noqa: E402


def build(spec):
    """Crop + resolve boxes + write the page. Returns 0, or 1 with the reasons on stderr and NO page written."""
    errors, warnings = validate(spec)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    r = crop_images(spec, log=lambda m: print(m, file=sys.stderr))
    for w in warnings + r['warnings']:
        print('warning: ' + w, file=sys.stderr)
    print(f'{r["count"]} crops → {os.path.join(spec["_base"], spec["images"])}')
    if r['missing']:
        return 1
    page, _ = build_page(spec, r['boxes'])
    out = os.path.join(spec['_base'], spec['out'])
    with open(out, 'w') as f:
        f.write(page)
    print('wrote', out)
    return 0


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    for c in ('build', 'serve', 'wait'):
        sub.add_parser(c).add_argument('spec')
    for c in ('serve', 'wait'):
        sub.choices[c].add_argument('--timeout', type=float, default=240, help='minutes to wait for a submit (exit 2 after)')
    sv = sub.choices['serve']
    sv.add_argument('--no-open', action='store_true')
    sv.add_argument('--no-build', action='store_true', help='serve the page as it is on disk')
    sv.add_argument('--port', type=int, default=0)
    a = ap.parse_args(argv)
    try:
        spec = load_spec(a.spec)
        if a.cmd == 'build':
            return build(spec)
        if a.cmd == 'wait':
            return wait_for_submit(spec, timeout_min=a.timeout)
        if not a.no_build and build(spec) != 0:
            return 1
        return serve(spec, port=a.port, open_browser=not a.no_open, timeout_min=a.timeout)
    except SpecError as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 4: Run all Python tests**

Run: `python3 -m unittest discover -s scripts/ui-review/tests -p 'test_*.py' 2>&1 | tail -3`
Expected: `OK` (all tests; skips allowed)

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-review/review-cards.py scripts/ui-review/tests/test_cli.py
git commit -m "feat(ui-review): review-cards.py v2 CLI — build, serve, wait"
```

---

### Task 9: `shot.mjs` — `measure` per shot and the run id

**Files:**
- Modify: `scripts/ui-review/shot.mjs` (header comment ~line 30–41; `session()` return ~line 188; the per-shot loop ~line 197 and ~line 220)
- Test: `scripts/ui-review/tests/shot-measure.test.mjs`

**Interfaces:**
- Produces: manifest entries gain `run: string|null` and, when the shot lists `measure`, `measures: { "<css>" | "text:<label>": {x, y, w, h} | null }` in window pixels; a missing measurement adds `measure missing: <key>` to `reasons` (so the shot is unverified — a deck could not be built from it).

- [ ] **Step 1: Write the failing test**

```js
// scripts/ui-review/tests/shot-measure.test.mjs
// Runs the real shot.mjs against a static page served by python, no workbench needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

test('shot.mjs measures named elements into the manifest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shot-measure-'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><body style="margin:0"><div id="a" style="position:absolute;left:100px;top:50px;width:200px;height:80px;background:red">hello</div>
    <p style="position:absolute;top:300px">enough text on this page for the readiness poll to pass its twenty characters</p></body>`);
  const http = await freePort(), cdp = await freePort();
  const py = spawn('python3', ['-m', 'http.server', String(http), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' });
  try {
    await new Promise(r => setTimeout(r, 800));
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ base: `http://127.0.0.1:${http}/index.html`, boot: 300, width: 800, height: 600,
      shots: [{ name: 'm', actions: [], sameAsBaseline: true, expect: '#a', probe: false, measure: ['#a', { text: 'hello' }, '#missing'] }] }));
    const out = join(dir, 'out');
    const r = spawnSync('node', [join(HERE, '..', 'shot.mjs'), join(dir, 'plan.json'), out, 'midnight'], { env: { ...process.env, CDP_PORT: String(cdp), UI_REVIEW_RUN: '12345' }, encoding: 'utf8', timeout: 60000 });
    const mf = readdirSync(out).find(f => f.startsWith('manifest-'));
    assert.ok(mf, 'manifest written: ' + r.stdout + r.stderr);
    const [entry] = JSON.parse(readFileSync(join(out, mf), 'utf8'));
    assert.equal(entry.run, '12345');
    assert.deepEqual(entry.measures['#a'], { x: 100, y: 50, w: 200, h: 80 });
    assert.deepEqual(entry.measures['text:hello'], { x: 100, y: 50, w: 200, h: 80 });
    assert.equal(entry.measures['#missing'], null);
    assert.ok(entry.reasons.includes('measure missing: #missing'));
    assert.equal(entry.verified, false);
  } finally { py.kill(); }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/ui-review/tests/shot-measure.test.mjs 2>&1 | tail -5`
Expected: fails on `entry.run` (undefined) / `entry.measures`.

- [ ] **Step 3: Edit `shot.mjs`**

In the header comment, after the `{"wait": 500}` line, add:

```js
//   shot-level: "measure": ["<css or js:>", {"text": "Label", "tag": "button"}]
//     → entry.measures[key] = {x,y,w,h} in window pixels (key = the css string or "text:<Label>");
//       a missing element is recorded as null AND fails the shot, because a review deck asked for it.
//   UI_REVIEW_RUN=<id>  stamped on every entry as `run` (coverage.mjs merges by it — hand-off gap 6)
```

In `session()`, change the return line to expose `textExpr`:

```js
  return { send, evaluate, run, shot, probe, errors, close, selExpr, textExpr };
```

In the per-shot loop, change the entry creation:

```js
    const entry = { theme, name: s.name, run: process.env.UI_REVIEW_RUN ?? null, verified: false, reasons: [], errors: [], contrastFails: [] };
```

Immediately after `await sess.shot(file);` (the real screenshot) and before `// --- verification ---`, add:

```js
      // Measure named elements for the review deck (spec §4.2): same DOM the screenshot shows.
      if (Array.isArray(s.measure)) {
        entry.measures = {};
        for (const m of s.measure) {
          const key = typeof m === 'string' ? m : `text:${m.text}`;
          const expr = typeof m === 'string' ? sess.selExpr(m) : sess.textExpr(m.text, m.tag);
          entry.measures[key] = await sess.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`).catch(() => null);
          if (!entry.measures[key]) entry.reasons.push(`measure missing: ${key}`);
        }
      }
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/ui-review/tests/shot-measure.test.mjs 2>&1 | tail -5`
Expected: `# pass 1`. (Chrome headless is required; the test takes ~5 s.)

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-review/shot.mjs scripts/ui-review/tests/shot-measure.test.mjs
git commit -m "feat(ui-review): shot.mjs measures named elements for the deck and stamps the run id"
```

---

### Task 10: `coverage.mjs` — merge by the newest run per plan (gap 6)

**Files:**
- Modify: `scripts/ui-review/coverage.mjs:14-28`
- Test: `scripts/ui-review/tests/coverage.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/ui-review/tests/coverage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const run = (...dirs) => spawnSync('node', [join(HERE, '..', 'coverage.mjs'), ...dirs], { encoding: 'utf8' }).stdout;
const entry = (name, theme, verified, run) => ({ name, theme, verified, reasons: verified ? [] : ['MISSING x'], run });

test('an older run cannot leave a MISSED row behind once the plan re-ran — even when its manifest landed on disk later', () => {
  // Gap 6 exactly: under load the FIRST sweep's shard finished after the SECOND sweep wrote its manifest,
  // so the newest file on disk carried the stale miss. Run id must decide, not file time.
  const d = join(mkdtempSync(join(tmpdir(), 'cov-')), 'shots-main'); mkdirSync(d);
  const fresh = join(d, 'manifest-new.json'); writeFileSync(fresh, JSON.stringify([entry('home', 'light', true, '200'), entry('settings', 'light', true, '200')]));
  utimesSync(fresh, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  writeFileSync(join(d, 'manifest-old-but-late.json'), JSON.stringify([entry('home', 'light', false, '100'), entry('settings', 'light', true, '100')]));
  assert.match(run(d), /2 covered · 0 partial · 0 missed/);
});

test('a surface only an older run captured is still listed (a crashed shard must not erase it)', () => {
  const d = join(mkdtempSync(join(tmpdir(), 'cov-')), 'shots-main'); mkdirSync(d);
  writeFileSync(join(d, 'manifest-a.json'), JSON.stringify([entry('home', 'light', true, '100'), entry('settings', 'light', false, '100')]));
  writeFileSync(join(d, 'manifest-b.json'), JSON.stringify([entry('home', 'light', true, '200')]));   // the re-run's settings shard died
  const out = run(d);
  assert.match(out, /1 covered · 0 partial · 1 missed/); assert.match(out, /shots-main\/settings \| MISSED/);
});

test('legacy manifests without a run id still merge newest-file-wins', () => {
  const d = join(mkdtempSync(join(tmpdir(), 'cov-')), 'shots-main'); mkdirSync(d);
  const old = join(d, 'manifest-a.json'); writeFileSync(old, JSON.stringify([entry('home', 'light', false, undefined)]));
  utimesSync(old, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  writeFileSync(join(d, 'manifest-b.json'), JSON.stringify([entry('home', 'light', true, undefined)]));
  assert.match(run(d), /1 covered · 0 partial · 0 missed/);
});

test('runs are compared per plan directory, so a re-run of one plan keeps the others', () => {
  const root = mkdtempSync(join(tmpdir(), 'cov-')); const a = join(root, 'shots-main'), b = join(root, 'shots-overlays'); mkdirSync(a); mkdirSync(b);
  writeFileSync(join(a, 'manifest-1.json'), JSON.stringify([entry('home', 'light', true, '100')]));
  writeFileSync(join(b, 'manifest-2.json'), JSON.stringify([entry('menu', 'light', true, '900')]));
  assert.match(run(a, b), /2 covered · 0 partial · 0 missed/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/ui-review/tests/coverage.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 1` — the first test: today the later file on disk wins, so the stale miss shows. (The other three pass already; they pin what must NOT change.)

- [ ] **Step 3: Edit `coverage.mjs`** — replace the `for (const d of dirs) { … }` block (lines 14–28) with:

```js
for (const d of dirs) {
  if (!existsSync(d)) continue;
  // Order every entry by (run id, file time) and let the later one win per surface × theme.
  // WHY run id first (hand-off gap 6): under load an EARLIER sweep's shard can write its manifest
  // AFTER a newer sweep's, and "newest file wins" then resurrected a stale MISSED row. The run id
  // (UI_REVIEW_RUN, stamped by run-review.sh) says which sweep an entry belongs to; file time only
  // breaks ties and orders manifests from before 2026-08-27, which carry no run id (-1).
  // Nothing is discarded: a surface only an older sweep captured stays listed — dropping
  // everything but the newest run would silently erase the surfaces of a shard that crashed.
  const files = readdirSync(d).filter(f => /^manifest.*\.json$/.test(f));
  const entries = files.flatMap(f => { const mtime = statSync(`${d}/${f}`).mtimeMs; return JSON.parse(readFileSync(`${d}/${f}`, 'utf8')).map(e => ({ e, run: /^\d+$/.test(String(e.run ?? '')) ? Number(e.run) : -1, mtime })); });
  entries.sort((a, b) => a.run - b.run || a.mtime - b.mtime);
  for (const { e } of entries) {
    const key = `${d.replace(/\/$/, '').split('/').pop()}/${e.name}`;
    const s = bySurface.get(key) ?? { themes: new Map() };
    s.themes.set(e.theme, e);   // later (by run id, then file time) wins
    bySurface.set(key, s);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/ui-review/tests/coverage.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 4`

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-review/coverage.mjs scripts/ui-review/tests/coverage.test.mjs
git commit -m "fix(ui-review): coverage orders manifests by run id before file time — a late-finishing old shard can't resurrect a MISSED row"
```

---

### Task 11: `run-review.sh` — port probe, run id, sheets scoped to the run (gaps 1, 7)

**Files:**
- Create: `scripts/ui-review/probe-ports.sh`
- Modify: `scripts/ui-review/run-review.sh` (after `mkdir -p "$OUT/sheets"`; the job loop; the sheets loop)
- Test: `scripts/ui-review/tests/probe-ports.test.sh`

- [ ] **Step 1: Write the failing test**

```bash
#!/bin/bash
# scripts/ui-review/tests/probe-ports.test.sh — probe-ports.sh must name a busy port and exit 1; exit 0 when all are free.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()")
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 & PID=$!
sleep 0.5
out=$(bash "$HERE/../probe-ports.sh" "$PORT" 1 2>&1); code=$?
kill $PID 2>/dev/null
[[ $code -eq 1 && "$out" == *"$PORT"* ]] || { echo "FAIL: expected exit 1 naming $PORT, got $code: $out"; exit 1; }
bash "$HERE/../probe-ports.sh" 1 2 >/dev/null 2>&1 && echo "ok" || { echo "FAIL: free ports should exit 0"; exit 1; }
```

Run: `bash scripts/ui-review/tests/probe-ports.test.sh`
Expected: `FAIL` (script missing)

- [ ] **Step 2: Write `probe-ports.sh`**

```bash
#!/bin/bash
# probe-ports.sh <port> [<port> ...] — exit 1 naming every port that already has a listener.
# WHY: two review sweeps at offsets 300 and 310 overlapped their CDP port ranges and
# deadlocked for 20 minutes with no error (2026-08-27, hand-off gap 1). Refusing loudly is
# the fix; `ss` is the reliable local truth, `nc` is the fallback where ss is absent.
busy=()
for p in "$@"; do
  if command -v ss >/dev/null 2>&1; then
    [[ -n "$(ss -ltnH "sport = :$p" 2>/dev/null)" ]] && busy+=("$p")
  elif (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then
    busy+=("$p")
  fi
done
if [[ ${#busy[@]} -gt 0 ]]; then
  echo "REFUSING: ports already in use: ${busy[*]} — another sweep is running; use YOUCODED_PORT_OFFSET at least 100 away" >&2
  exit 1
fi
exit 0
```

- [ ] **Step 3: Edit `run-review.sh`**

After `mkdir -p "$OUT/sheets"` add:

```bash
# One id per sweep, stamped on every manifest entry: coverage merges by it, and the sheets
# below are rebuilt only for the plans this sweep actually ran (hand-off gaps 6 and 7).
RUN_ID="$(date +%s%3N)"; export UI_REVIEW_RUN=$RUN_ID
```

In the job loop, replace the `echo "$plan $name $t $k/$n $((30000 + PORT_OFFSET + idx))" >> "$jobfile"` line and add the probe after the loop:

```bash
      port=$((30000 + PORT_OFFSET + idx)); ports+=("$port")
      echo "$plan $name $t $k/$n $port" >> "$jobfile"   # CDP ports keyed by offset so two reviews never share one
```

(declare `ports=()` next to `idx=0`), and after the loop closes (before `echo "[ui-review] $idx capture jobs…"`):

```bash
bash "$HERE/probe-ports.sh" "${ports[@]}" || exit 1
```

Replace `rm -rf "$OUT/sheets"/*.jpg` and the sheets loop with:

```bash
# 3. Sheets (verified shots only — misses live in _unverified/), reports, gallery.
# A sweep rebuilds sheets only for the plans it ran (their manifests carry RUN_ID);
# --reports-only rebuilds everything.
for d in "$OUT"/shots-*; do
  name="${d##*/shots-}"
  if [[ "$REPORTS_ONLY" == 0 ]] && ! grep -lq "\"run\": \"$RUN_ID\"" "$d"/manifest-*.json 2>/dev/null; then continue; fi
  rm -f "$OUT/sheets/$name-"*.jpg
  bash "$HERE/montage.sh" "$d" "$OUT/sheets-$name" "$THEMES" >/dev/null
  for f in "$OUT/sheets-$name"/*.png; do [ -f "$f" ] && magick "$f" -resize 1800x -quality 82 "$OUT/sheets/$name-$(basename "$f" .png).jpg"; done
done
```

- [ ] **Step 4: Verify**

Run: `bash scripts/ui-review/tests/probe-ports.test.sh && bash -n scripts/ui-review/run-review.sh && echo syntax-ok`
Expected: `ok` then `syntax-ok`. (The probe's behaviour is covered by its own test; `run-review.sh` itself needs a workbench and is exercised by the real sweep in Task 14.)

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-review/probe-ports.sh scripts/ui-review/run-review.sh scripts/ui-review/tests/probe-ports.test.sh
git commit -m "fix(ui-review): run-review probes CDP ports, stamps a run id, rebuilds only this sweep's sheets"
```

---

### Task 12: Headless render check of the built page

**Files:**
- Test: `scripts/ui-review/tests/deck-render.test.mjs`

**Interfaces:**
- Consumes: Task 8 CLI (`build`, `serve --no-build`), page's `document.body.dataset.layout`, `dataset.scores` and `window.__deckReady` from Task 6.
- The layout assertion checks the RULE (spec §3.4) against the scores the page reports, not a table of letters: the fixture crop is 400×200 (wide and short), so side-by-side A legitimately wins where the spec's tall theme-dialog crops picked C. A hard-coded table copied from the spec would have failed here and invited "fixing" the approved algorithm.

- [ ] **Step 1: Write the test**

```js
// scripts/ui-review/tests/deck-render.test.mjs
// Builds the fixture deck, serves it with review-cards.py serve --no-open, and drives headless
// Chrome over raw CDP: no console errors, the layout the page chose at three sizes, the answer
// container on screen, and a Yes + Save & Next that lands in the answers file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url)), RC = join(HERE, '..', 'review-cards.py');
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cdp(port, w, h) {
  const chrome = spawn('google-chrome-stable', ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--window-size=${w},${h}`, '--force-device-scale-factor=1', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'deck-render-'))}`, 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(250); }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); let id = 0; const pending = new Map(); const errors = [];
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + m.params.args.map(a => a.value ?? a.description).join(' ')); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result?.value; };
  return { send, evaluate, errors, close: () => { ws.close(); chrome.kill(); } };
}

test('deck renders at three sizes and records an answer', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import make_fixture; print(make_fixture(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('deck.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-open', '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let srvOut = ''; srv.stdout.on('data', d => srvOut += d);
  try {
    await sleep(800);
    const url = `http://127.0.0.1:${port}/fixture.html`;
    // The rule from spec §3.4, applied to the scores the page publishes: B/C/D must beat A by >5% to win;
    // best under 50% → compact. At 400 px wide two 400 px crops side by side reach only ~39%, so compact is certain there (at 520 they still fit at 51% — measured 2026-08-27).
    const expected = scores => { let best = 'A'; for (const k of ['B', 'C', 'D']) if (scores[k] > scores[best] * 1.05) best = k; return scores[best] < 0.5 ? 'compact' : best; };
    for (const size of ['1920x1080', '1100x900', '400x760']) {
      const [w, h] = size.split('x').map(Number); const c = await cdp(await freePort(), w, h);
      try {
        await c.send('Page.navigate', { url: url + '?step=2' });
        for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
        await sleep(400);
        assert.deepEqual(c.errors, [], size);
        const scores = JSON.parse(await c.evaluate('document.body.dataset.scores'));
        assert.equal(await c.evaluate('document.body.dataset.layout'), expected(scores), size + ' ' + JSON.stringify(scores));
        if (size === '400x760') assert.equal(await c.evaluate('document.body.dataset.layout'), 'compact', size);
        assert.equal(await c.evaluate("getComputedStyle(document.querySelector('.controls')).display !== 'none' && document.querySelector('.controls').getBoundingClientRect().bottom <= innerHeight"), true, size + ' controls on screen');
        assert.equal(await c.evaluate("document.querySelectorAll('#inner .frame').length"), 2, size);
        assert.equal(await c.evaluate("document.querySelector('#inner .box').style.left"), '25%', size + ' measured box');
        if (size === '1100x900') {
          await c.evaluate("document.querySelector('.ans[data-v=yes]').click()");
          assert.equal(await c.evaluate("document.querySelector('#save').disabled"), false);
          await c.evaluate("document.querySelector('#note').value='fine'; document.querySelector('#note').dispatchEvent(new Event('input'))");
          await c.evaluate("document.querySelector('#save').click()"); await sleep(600);
          assert.equal(await c.evaluate("document.querySelector('#wtitle').textContent"), 'Home');
          assert.equal(await c.evaluate("document.querySelector('#count').textContent"), 'step 3 of 3 · 1 answered');
        }
      } finally { c.close(); }
    }
    const answers = JSON.parse(readFileSync(join(dirname(spec), 'deck.answers.json'), 'utf8'));
    assert.equal(answers.answers['S-2'].v, 'yes'); assert.equal(answers.answers['S-2'].note, 'fine'); assert.equal(answers.answers['S-2'].theme, 'midnight');
    // submit ends the server with the summary on stdout
    await fetch(`http://127.0.0.1:${port}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answers) });
    const code = await new Promise(r => srv.on('exit', r));
    assert.equal(code, 0); assert.match(srvOut, /fixture · submitted .* · 1 yes · 0 no · 0 other · 2 skipped/); assert.match(srvOut, /S-2 yes — "fine"/);
    assert.equal(existsSync(join(dirname(spec), 'deck.serve.json')), false);
  } finally { if (srv.exitCode === null) srv.kill(); }
});
```

- [ ] **Step 2: Run it**

Run: `node --test scripts/ui-review/tests/deck-render.test.mjs 2>&1 | grep -E "^# (pass|fail)|not ok|Error" | head`
Expected: `# pass 1`. If the choice disagrees with the rule, the failure message prints the scores — the bug is in `layout()`'s scoring or class application (compare with the mockup's `layout()` in `docs/active/prototypes/2026-08-27-deck-mockup-g.py`, which is the approved algorithm); never change the rule in the test.

- [ ] **Step 3: Commit**

```bash
git add scripts/ui-review/tests/deck-render.test.mjs
git commit -m "test(ui-review): headless render check — layouts at three sizes, an answer round-trips to the file"
```

---

### Task 13: Destin's checkpoint — a three-step Phase C deck, before the rest is written

**Files:**
- Create: `docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.json` (three steps only, for now)
- Output (git-ignored): `docs/active/design/2026-08-25-ui-audit/images/phase-c-review-v2/`, `phase-c-review-v2.html`

**Why here:** mockup G was approved as a mockup with three hand-picked crops. This is the first time the real page meets real crops, real theme tokens, the answers file and the browser hand-off — and the only remaining tasks (the ten other steps' copy, the docs) are the expensive ones to redo if something about the page needs to change. Tasks 9–11 (rig) do not depend on this look and run in parallel with it.

- [ ] **Step 1: Write the three-step spec** — the JSON in Task 14 Step 1, with only its three steps, `runs` = `scratch/ui-phase-c-baseline` / `scratch/ui-phase-c-after` (the `final` run is midnight-only, so it cannot feed a six-theme deck), all three `"auto"` (the old runs carry no measurements, and the Before code no longer exists to re-capture — see Task 14).
- [ ] **Step 2: Build and serve** — `python3 scripts/ui-review/review-cards.py serve docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.json` in the background. Expected: `12 crops → …`, `wrote …`, `[deck] http://127.0.0.1:<port>/phase-c-review-v2.html`, the browser opens.
- [ ] **Step 3: Hand it to Destin** with exactly what to try (spec §8): in the tab and in the app's file panel — hover (loupe), `+`/`−` zoom, the theme thumbnails, Yes / No / Other + a note, skip one with `Next ›`, Done → the skipped warning → Submit. Tell him the decisions are already recorded (Phase C shipped as youcoded #332) — this is a look at the tool, not a re-review. Then STOP writing deck content until the background `serve` exits (or `wait` returns) and the summary is read.
- [ ] **Step 4: Act on what he says** before Task 14. Page changes go into `page.css` / `page.js` with the render test re-run; anything he rejects that the spec §2 approved is a spec change — note it in the spec's §2 with the date.

---

### Task 14: Rebuild the full Phase C review as the first v2 deck

**Files:**
- Modify: `docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.json` (the remaining steps)
- Output (git-ignored images; the HTML is committed like the v1 pages): `docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.html`

The deck Destin reviewed as a v1 page (`phase-c-review.json`, 13 points), rebuilt from the same two runs (`scratch/ui-phase-c-baseline`, `scratch/ui-phase-c-after`).

**Constraints this rebuild has, that a fresh review will not:**
- **Auto-diff only.** The 2026-08-25 runs predate `measure` (Task 9), and the Before code was master before Phase C merged — it cannot be re-captured, so no step may use `selector`/`text`. Adding `measure` lines to plans is therefore NOT part of this task (it goes into the README rule in Task 15: *measure is planned before the Before run*).
- **Two of the 13 v1 points are Before-only** (`P-21` #2 — the themes rows, and `Q` #1 — the built-in theme editor question) and cannot live in a two-run deck; both were decided on 2026-08-27 already. Leave them out and say so in the commit message. The deck has **11 steps**.
- If `auto` reports "nothing differs" for a step in some theme (a change that only shows in certain themes), that is a real limit of the pixel diff for an old run: drop that theme from the deck's `themes` only if it affects every step; otherwise leave the step out and note it in the commit — never hand-place a `box` here.

- [ ] **Step 1: Write the v2 spec** — one step per point of `phase-c-review.json`, in its order, with the v2 fields; `"auto"` everywhere. Use exactly this shape for the first three; continue for the remaining eight following the v1 `what`/`fix`/`risk` text rewritten into the four fields under the §5 rules (no banned words; headline ≤ 25 words):

```json
{
  "title": "Phase C review",
  "key": "phase-c-review",
  "out": "phase-c-review-v2.html",
  "images": "images/phase-c-review-v2",
  "runs": { "before": "/home/destin/youcoded-dev/scratch/ui-phase-c-baseline", "after": "/home/destin/youcoded-dev/scratch/ui-phase-c-after" },
  "themes": ["midnight", "light", "creme", "dark", "halftone-dimension", "meadow-mist"],
  "crops": {
    "themes-dialog": ["main", "settings-appearance", "440x600+500+150"],
    "market-hero": ["marketplace", "marketplace", "900x200+0+50"],
    "market-card-counts": ["main", "marketplace", "600x150+10+375"],
    "market-bar": ["marketplace", "marketplace", "760x70+0+248"],
    "market-search": ["marketplace", "marketplace", "300x70+1120+248"],
    "market-narrow-title": ["narrow", "marketplace", "390x56+0+0"],
    "market-explore-empty": ["marketplace", "marketplace-empty", "720x160+0+50"],
    "market-themes-empty": ["empty-marketplace", "marketplace-themes", "1440x240+0+50"],
    "library-empty": ["empty-marketplace", "library", "1440x330+0+0"],
    "library-tabs": ["main", "library", "520x110+0+0"]
  },
  "steps": [
    { "id": "P-3.1", "surface": "Themes dialog", "path": "Settings → Appearance", "crop": "themes-dialog",
      "headline": "Every theme card is now the same height, so the active card no longer grows and stretches its neighbour.",
      "changed": "Picture on top, one text row at the bottom, every card 92 px tall. Built-ins got preview pictures from the marketplace generator; other themes show their own preview.",
      "measured": "Dark 65 px vs Crème 34 px before",
      "notice": "The grid stops jumping when you pick a theme, and every card shows a real preview picture instead of a colour strip.",
      "risk": "In these screenshots Halftone and Meadow still show the colour strip because the rig cannot serve theme folders; in the app they show their own preview." },
    { "id": "P-3.3", "surface": "Themes dialog", "path": "Settings → Appearance", "crop": "themes-dialog",
      "headline": "“Your Themes” reads “Favorited Themes”, “Browse all themes →” is gone, and Browse Theme Marketplace sits above Build New Theme.",
      "changed": "Renamed the heading, removed the text-link row, reordered the two buttons.",
      "notice": "Two fewer things to read under the theme grid; the Marketplace button comes first.",
      "risk": "" },
    { "id": "P-21.1", "surface": "Marketplace", "path": "Marketplace → featured card", "crop": "market-hero",
      "headline": "The featured card uses the theme’s normal card edge; the gold border is gone.",
      "changed": "One border style for every card. The “Featured” eyebrow alone marks the featured plugin.",
      "measured": "1 of 6 border colours remains",
      "notice": "The Marketplace opens calmer — no single card shouts — and the featured one still reads first because it sits first.",
      "risk": "" }
  ]
}
```

- [ ] **Step 2: Build, and act on every `missing:` line**

Run: `python3 scripts/ui-review/review-cards.py build docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.json`
Expected: `… crops → …`, `wrote …`, exit 0. A "nothing differs" line → the constraints above (leave the step out, say so). A "whole-surface change" warning is expected for the full-width marketplace crops — it builds anyway.

- [ ] **Step 3: Serve**

Run: `python3 scripts/ui-review/review-cards.py serve docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.json --no-build` in the background.
Expected: the browser opens on the 11-step deck; Destin's pass (spec §8) — he already saw the tool in Task 13, this is the full-length run: progress bar with 11 segments, skip, submit; the background command exits with the summary.

- [ ] **Step 4: Commit the spec and the built page**

```bash
git add docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.json docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.html
git commit -m "docs(ui-audit): Phase C review rebuilt as the first v2 deck (11 of 13 points — the two Before-only points cannot live in a two-run deck)"
```

---

### Task 15: Docs, ROADMAP, memory, .gitignore

**Files:**
- Modify: `scripts/ui-review/README.md` (the `review-cards.py + crops.json` row and a new "Review deck" section), `.claude/skills/ui-review/SKILL.md` §4 steps 2–4, `CLAUDE.md` line 119 (the sentence naming the deck), `docs/active/handoffs/2026-08-27-review-deck-tooling-handoff.md` (status), `ROADMAP.md` (two `idea` rows), `.gitignore`, memory `feedback-review-page-format.md`.

- [ ] **Step 1: README** — replace the `review-cards.py + crops.json` table row with:

```markdown
| `review-cards.py` + `deck/` + `crops.json` | **the review surface** (v2, 2026-08-27). `build <spec>` cuts 1:1 crops from the run dirs, resolves every highlight box — from the rig's `measure` of a named element, or from the pixel difference between Before and After (the spec never carries coordinates) — and writes the page; it refuses (no page) on a missing picture, an unresolved box, or a broken writing rule. `serve <spec>` builds, serves on 127.0.0.1, opens the browser, saves `<spec>.answers.json` on every click and **exits when Destin submits** — run it in the background and its exit is the notification, with the feedback summary on stdout; `wait <spec>` blocks on the answers file alone for a session that no longer holds that process. Spec template: `docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.json`. |
```

and add under **Writing a shot**:

```markdown
`"measure": ["#send", {"text": "Send"}]` on a shot records those elements' window rectangles in
the manifest (`measures`), which is how a review deck gets an exact highlight box. A missing
element fails the shot. **Plan the `measure` lines before the Before run** — a measurement can
only come from a capture, and the Before code is usually gone by the time the deck is written
(the Phase C rebuild had to be pixel-diff only for exactly this reason). Prefer `aria-label` /
role / `data-testid` selectors over visible text — one copy change broke three plans' `expect`s
in a day (hand-off gap 5).
```

- [ ] **Step 1b: `.gitignore`** — add, next to the existing `docs/active/design/*-ui-audit/images/` line:

```
*.answers.json
*.serve.json
```

Also replace the "Two sweeps at once collide" paragraph with: "Two sweeps at once: `run-review.sh` now probes every CDP port it is about to use (`probe-ports.sh`) and refuses, naming the busy ports — keep offsets ≥ 100 apart and it will never trigger."

- [ ] **Step 2: SKILL.md §4** — replace steps 2–4 with:

```markdown
2. Write `docs/active/design/<audit>/<phase>-review.json` (copy `phase-c-review-v2.json`): one
   step per point with `surface`, `path`, `crop`, `highlight` (`"auto"` for before/after, else
   `{"selector": …}` measured by the rig), and the four texts — **headline** (≤ 25 words, what a
   user sees), **changed** (what was edited, plain words, with `measured` when there is a number),
   **notice** (what changes for users — intended and side effects), **risk** (what could look
   wrong, or is not shown faithfully). The builder refuses jargon (token, primitive, selector,
   IPC, prop, reducer, handler, component…), a missing picture, or an unresolved box.
3. `python3 scripts/ui-review/review-cards.py serve <spec>` **in the background** (it builds
   first; fix every `missing:` line it prints — a measurement that is missing means the plan
   needed a `measure` line before the Before run). The browser opens itself; Destin answers
   Yes / No / Other per step with an optional note and presses Submit; the background command
   exits with the summary (`wait <spec>` if you lost the process). Never ask him to paste anything.
4. Act on the summary exactly (`Other` + note = change it as described); record decisions in the
   findings ledger row, the guide, the ROADMAP entry. Merge, archive, clean up.
```

- [ ] **Step 3: CLAUDE.md** — in the "New Features & UI/UX Changes" paragraph replace the parenthetical after `review deck` with: `(scripts/ui-review/review-cards.py — one point per step: Before | After with the changed region boxed by the rig, a headline and three cards — What changed / You'll notice / Risk — Yes / No / Other, answers saved to a file and handed to Claude on Submit; \`serve <spec>\` in the background does it all)`.

- [ ] **Step 4: Hand-off, ROADMAP, memory**

- Hand-off: set `status: shipped` and add a first line "Superseded by `docs/active/specs/2026-08-27-review-deck-v2-design.md` (built on `feat/review-deck-v2`); gaps 1, 3, 5, 6, 7 closed there; 2 and 4 are ROADMAP ideas."
- ROADMAP: under the tooling section add two `idea` rows dated 2026-08-27: "`#tooling` Workbench serves community theme folders (`theme-asset://`) so decks show real previews" and "`#tooling` Attach your own screenshot to a review-deck step (the serve endpoint can accept uploads)".
- Memory `/home/destin/.claude/projects/-home-destin-youcoded-dev/memory/feedback-review-page-format.md`: rewrite the body to say the v2 deck (`review-cards.py` crop/build/serve, spec `docs/active/specs/2026-08-27-review-deck-v2-design.md`) is the format; list what was rejected on the way on 2026-08-27 — a side list of steps, three restyles (card/edge/warm), bare blue links, Before/After toggles, a separate zoomed strip, ledger ids on the page, hotkeys and auto-advance; keep the older rejections (gallery, prose page, card board). Update the `MEMORY.md` one-liner accordingly.

- [ ] **Step 5: Run everything, then commit**

Run: `python3 -m unittest discover -s scripts/ui-review/tests -p 'test_*.py' 2>&1 | tail -2 && node --test scripts/ui-review/tests/ 2>&1 | grep -E "^# (pass|fail)" && bash scripts/ui-review/tests/probe-ports.test.sh && node scripts/audit-anchors.mjs 2>&1 | tail -2`
Expected: `OK` with **no skips**, `# pass 6` / `# fail 0`, `ok`, and the anchor audit unchanged from before this branch (it does not reference the deck files).

```bash
git add scripts/ui-review/README.md .claude/skills/ui-review/SKILL.md CLAUDE.md docs/active/handoffs/2026-08-27-review-deck-tooling-handoff.md ROADMAP.md .gitignore
git commit -m "docs(ui-review): deck v2 flow — build, serve, wait; measure is planned before the Before run; hand-off gaps closed or filed"
```

(Memory files live outside the repo; edit them directly.)

---

### Task 16: Finish the branch

- [ ] **Step 1:** `bash setup.sh` in the main checkout, then in the worktree `git fetch origin && git rebase origin/master` (docs-only conflicts, if any, keep both). (The branch was already rebased onto master on 2026-08-27 before Task 1, so `CLAUDE.md` line 119 exists in the worktree.)
- [ ] **Step 2:** Push, open the PR on `youcoded-dev` with the spec's §1 table as the body, merge (merge means merge AND push), then:
  - move `docs/active/specs/2026-08-27-review-deck-v2-design.md` and this plan to `docs/archive/{specs,plans}/` with `status: shipped`;
  - flip the ROADMAP tooling entry to `[x]` with the merge sha;
  - `git worktree remove worktrees/_deck-tooling && git branch -D feat/review-deck-v2 && git push origin --delete feat/review-deck-v2`.
- [ ] **Step 3:** Confirm `git branch --contains <sha>` lists `master`.

---

## Execution order (parallel where the files are disjoint)

- **Wave 1 (parallel):** Tasks 1, 2, 3, 4 (Python, disjoint files) and 9, 10, 11 (rig, disjoint files).
- **Wave 2 (parallel):** Task 5 (needs 1, 2, 4) and Task 7 (needs 1, 4).
- **Wave 3:** Task 6 (needs 3, 5) → Task 8 (needs 5, 6, 7) → Task 12 (needs 8).
- **Task 13 — Destin's look** (needs 8; nothing after it is written until he has looked). Tasks 9–11 may still be running.
- **Then:** 14 → 15 → 16.

## Self-review (2026-08-27, after the review round)

- **Spec coverage:** §3 page → Tasks 6, 12; §3.2 embedded/file:// → Task 6 (`embedded`, copy fallback); §3.3 tokens → Tasks 3, 6; §3.4 layout → Task 6 `layout()` + Task 12 rule check; §4.1 spec → Task 1; §4.2 boxes → Tasks 2, 5, 9; §4.3 serve/notify → Tasks 7, 8 (+ `wait`, a fallback the spec did not have — the background process is a single point of failure otherwise); §4.4 file:// → Task 6; §4.5 summary → Task 7 (`summary`) and page (`summary()`), same format; §5 rules → Task 1; §6 gaps 1, 6, 7 → Tasks 10, 11; gap 3 → Tasks 5, 9; gap 5 → Task 15 README; gaps 2, 4 → Task 15 ROADMAP; §7 files → file map; §8 tests → Tasks 1–12; Destin's pass → Tasks 13, 14; §9 rollout → Tasks 14, 16.
- **Deviations from the spec, all deliberate:** no `crop` command (spec §4.3 listed `crop`; a stale intermediate is the v1 bug class); `wait` added; `Square:1` not `Square:3`; coverage orders by run id rather than discarding older runs; the Phase C rebuild is auto-only and 11 steps.
- **Names used across tasks:** `image_name` (5→6), `run_names` (1→5,6,7), `SpecError` (1→6,8), `validate` (1→6,8), `workspace_root` (1→3,6), `crop_images` (5→8,12), `build_page` (6→8), `serve`/`wait_for_submit`/`make_server`/`summary`/`answers_path`/`write_atomic` (7→8,12 test), `measure_key`/`newest_manifest_entry` (5), `document.body.dataset.layout`/`dataset.scores` + `window.__deckReady` (6→12), `entry.measures` / `entry.run` (9→5,10).
- **Placeholders:** none; the Phase C spec in Task 14 gives the shape and the first three steps in full and states the rule for the rest (the remaining eight are the v1 points rewritten under §5 — content, not structure).
