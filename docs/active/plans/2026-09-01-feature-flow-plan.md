---
status: draft
created: 2026-09-01
type: plan
spec: docs/active/specs/2026-09-01-feature-flow-design.md
measured_at:
  youcoded-dev: 5dacdf7 (origin/master, merged into docs/feature-flow-plan as 6d1c11b)
reviewed: 2026-09-01 — a second session verified every line anchor and interface against the code; the findings are folded in (see "Review changes" at the end)
---

# Feature Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the review deck carry the whole feature flow — questions before drawing, a contract at sign-off, an acceptance deck at the end — with a script that checks the contract holds together and a close-out section that reports it.

**Architecture:** Everything lands in the existing deck tool (`scripts/ui-review/review-cards.py` + `scripts/ui-review/deck/`). One new step shape — *words-only* (a step with no picture; `"words": true`) — of which the *contract* step (a words step that carries `rows`) is a variant, not a fourth dispatch branch; plus a `contract.py` module for `contract-check` and `acceptance`. Answers files start being committed. Docs, one rule, and the `ui-mockup` skill are updated last so they describe what exists.

**Tech Stack:** Python 3 (stdlib only, `unittest`), vanilla JS/CSS in the deck page, bash for `close-out.sh`, Node `--test` + headless Chrome for the one render test.

## Global Constraints

- Deck writing rules apply to every new text field: `HEADLINE_MAX = 25` words, `BANNED` words (`token`, `primitive`, `selector`, `ipc`, `prop`, `props`, `reducer`, `handler`, `component`, `tailwind`, `css class`, `react`, `dom`, `z-index`) in any user-facing field.
- New Python tests must be **picture-free** (no `magick`, no `ffmpeg`, no Chrome) so CI runs them — the pattern is `tests/test_live.py`. Register each new module in `.github/workflows/workspace-ci.yml` (line 107), `scripts/ui-review/README.md` (the `<!-- runnable -->` block, ~line 262) and `docs/MAP.md` (the UI review rig row, line 19).
- Every non-trivial edit gets a WHY comment (Destin reads code through comments).
- Python tests run from the tests directory: `cd scripts/ui-review/tests && python3 -m unittest <module>`. Never `-t .`.
- The spec's `runs`/`images` rule: a deck with no picture steps at all names neither (today `all_live`); this plan widens that to "no picture steps" without changing what a picture deck requires.
- Do not touch `youcoded/` — this plan is workspace-only. Commit with explicit paths (never `git add -A`).
- Branch: if youcoded-dev PR #10 (this plan) is still open, continue on `docs/feature-flow-plan` in `worktrees/feature-flow` (origin/master is already merged in); if it has merged, `git worktree add worktrees/feature-flow -b feat/feature-flow origin/master` and work there.
- **Line numbers in this plan are approximate; the quoted text beside each one is the anchor.** Find the text, never count lines.
- **Every file the flow writes sits beside the contract and shares its stem.** `<feature>.contract.json` → `<feature>.contract.answers.json` (the sign-off), `<feature>.contract.verdicts.json` (the grader's input), `<feature>.contract.acceptance.json` (the acceptance deck), `<feature>.contract.acceptance.answers.json`. No other names.
- **A guard named by a `mechanical` row may live on the feature branch.** `contract-check` looks for it on disk under the workspace root AND on the contract's `branch` (`git cat-file -e`), because the workspace root from a worktree is the main checkout, where a test the branch adds does not exist until merge. An uncommitted guard does not count.

---

### Task 0: Track answers files under `docs/`

**Files:**
- Modify: `.gitignore` (the two lines `*.answers.json` / `*.answers.*.json`, ~line 112, directly above `*.serve.json`)
- Add to git: every `docs/**/*.answers.json` and `docs/**/*.answers.*.json` on disk in the main checkout

**Interfaces:**
- Produces: committed answers files that Task 4's `contract-check` and Task 6's dry run read.

- [ ] **Step 1: Stop ignoring answers files**

Delete the two lines `*.answers.json` and `*.answers.*.json` from `.gitignore` and put this comment where they were (`scratch/` is already ignored wholesale on its own line near the top, so throwaway decks need no pattern of their own):

```
# Deck answers (*.answers.json) are Destin's decisions and are COMMITTED (feature-flow design §2).
# Throwaway decks live in scratch/, which is ignored above. `*.serve.json` is a runtime lock.
```

- [ ] **Step 2: Verify the rule from the worktree**

Run:
```bash
cd /home/destin/youcoded-dev/worktrees/feature-flow
touch docs/active/design/probe.answers.json
git check-ignore -v docs/active/design/probe.answers.json; echo "docs rc=$?"
mkdir -p scratch && touch scratch/probe.answers.json && git check-ignore -v scratch/probe.answers.json; echo "scratch rc=$?"
rm -f docs/active/design/probe.answers.json scratch/probe.answers.json
```
Expected: `docs rc=1` (not ignored), `scratch rc=0` with the `.gitignore:…:scratch/` line printed.

- [ ] **Step 3: Copy the existing answers files into the worktree and stage them**

The files live only in the main checkout (they were never tracked). Copy, then stage by explicit path:

```bash
cd /home/destin/youcoded-dev
find docs -name '*.answers.json' -o -name '*.answers.*.json' | while read -r f; do
  mkdir -p "worktrees/feature-flow/$(dirname "$f")" && cp "$f" "worktrees/feature-flow/$f"
done
cd worktrees/feature-flow
git add .gitignore
find docs \( -name '*.answers.json' -o -name '*.answers.*.json' \) -print0 | xargs -0 git add --
git status --short | head -40
```
Expected: 27 answers files staged (the count on 2026-09-01; `find` above prints the real one) plus `.gitignore`.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(deck): commit answers files under docs/ — they are Destin's decisions, not runtime output

Every *.answers.json was gitignored since deck v2 (d81214a). The contract in
docs/active/specs/2026-09-01-feature-flow-design.md resolves its rows to these
files, so they need history and a clean-checkout life. scratch/ was already
ignored on its own line, so throwaway decks need no pattern.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CiVWE2jGoEVCkp9bYYtuE2"
```

---

### Task 1: Words-only steps (no picture), one-option decide, per-step button labels

**Files:**
- Modify: `scripts/ui-review/deck/spec.py` (`load_spec` ~line 53; `validate` dispatch ~line 175; `_validate_decide` ~lines 218–258; new `is_words`, `is_contract`, `no_pictures`, `_validate_words`, `_validate_options`)
- Modify: `scripts/ui-review/deck/crops.py:40-52` (skip words steps)
- Modify: `scripts/ui-review/deck/build.py` (`_decide_step` ~line 63; `deck_data` ~line 122; `build_page` existence loop ~line 152)
- Modify: `scripts/ui-review/deck/page.js` (`YES`/`NO` line 104; `render()` lines 148–210; `layout()` line 226; `renderAnswers` line 124)
- Modify: `scripts/ui-review/deck/page.css` (after line 72)
- Create: `scripts/ui-review/tests/test_words.py`
- Modify: `scripts/ui-review/tests/fixture.py` (append `words_spec`)
- Modify: `scripts/ui-review/tests/deck-render.test.mjs` (second test)
- Modify: `.github/workflows/workspace-ci.yml:107`, `scripts/ui-review/README.md` (~262), `docs/MAP.md:19`

**Interfaces:**
- Produces: `is_words(step) -> bool`, `no_pictures(spec) -> bool`, `_validate_options(st, sid, errors, warnings, minimum)` in `deck/spec.py`; deck data for a words step: `{'id', 'kind': 'decide'|None, 'words': True, 'surface', 'path', 'headline', 'changed', 'measured', 'notice', 'risk', 'yes', 'no', 'options'?}`; `fixture.words_spec(tmp, **over) -> path`.
- Consumed by: Task 3 (contract steps are laid out as words steps), Task 4 (acceptance deck emits words steps).

- [ ] **Step 1: Add the words fixture**

Append to `scripts/ui-review/tests/fixture.py`:

```python
# ── words-only decks ────────────────────────────────────────────────────────────────────
def words_spec(tmp, **over):
    """A QUESTIONS deck: no pictures anywhere. One question with a single option (plus the
    page's own Other), one with three, and one statement to approve with relabelled buttons.
    Picture-free on purpose, like live_spec — this is CI coverage."""
    deck = os.path.join(tmp, 'deck')
    os.makedirs(deck, exist_ok=True)
    spec = {
        'title': 'Questions fixture', 'key': 'questions-fixture', 'out': 'questions.html',
        'themes': ['midnight', 'light'],
        'steps': [
            {'id': 'Q-1', 'words': True, 'surface': 'Games', 'path': 'Questions',
             'headline': 'Where does the invite live?',
             'options': [{'id': 'a', 'label': 'In the friends list (recommended)', 'summary': 'One place for everything about a friend.'}]},
            {'id': 'Q-2', 'words': True, 'surface': 'Games', 'path': 'Questions',
             'headline': 'How many boards on screen at once?',
             'options': [{'id': 'a', 'label': 'One', 'summary': 'Simplest.'},
                         {'id': 'b', 'label': 'Two', 'summary': 'Mine and theirs.'},
                         {'id': 'c', 'label': 'As many as fit', 'summary': 'Costs a layout rule.'}]},
            {'id': 'Q-3', 'words': True, 'surface': 'Games', 'path': 'Questions',
             'headline': 'A game you leave keeps running for the other player.',
             'changed': 'Stated, not asked: the alternative would surprise the friend who stayed.',
             'notice': 'Nothing yet — this becomes a row of the contract.',
             'yes': 'Holds', 'no': 'Fails'},
        ],
    }
    spec.update(over)
    p = os.path.join(deck, 'questions.json')
    with open(p, 'w') as f:
        json.dump(spec, f, indent=1)
    return p
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/ui-review/tests/test_words.py`:

```python
"""Words-only steps: a question or a statement with NO picture. Validation, the data the page
gets, and the runs/images rule. Picture-free like test_live.py — this is what CI runs.
Plan: docs/active/plans/2026-09-01-feature-flow-plan.md Task 1."""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from fixture import words_spec                                   # noqa: E402
from deck.build import build_page, deck_data                     # noqa: E402
from deck.crops import crop_images                               # noqa: E402
from deck.spec import SpecError, is_words, load_spec, no_pictures, validate   # noqa: E402


def spec_with(tmp, mutate, **over):
    p = words_spec(tmp, **over)
    with open(p) as f:
        raw = json.load(f)
    mutate(raw)
    with open(p, 'w') as f:
        json.dump(raw, f)
    return load_spec(p)


def errs(spec):
    return validate(spec)[0]


class WordsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_words_deck_needs_no_images_or_runs(self):
        s = load_spec(words_spec(self.tmp))
        self.assertTrue(no_pictures(s))
        self.assertNotIn('images', s)
        self.assertEqual(list(s['runs']), ['today'])
        self.assertEqual(errs(s), [])

    def test_one_option_is_enough_without_a_picture(self):
        s = load_spec(words_spec(self.tmp))
        self.assertEqual([e for e in errs(s) if 'Q-1' in e], [])

    def test_a_picture_decide_still_needs_two_options(self):
        # The two-option floor stays for picture decks: one option plus Other is a yes/no in disguise.
        s = spec_with(self.tmp, lambda r: r['steps'].append(
            {'id': 'D-1', 'surface': 'Games', 'path': 'Board', 'crop': 'bubble', 'highlight': {'text': 'Send'},
             'headline': 'Bigger?', 'options': [{'id': 'a', 'label': 'Yes', 'summary': 'x'}]}),
            images='images/questions', runs={'today': '/nowhere'})
        self.assertTrue(any('D-1: a decide step needs at least 2 options' in e for e in errs(s)))

    def test_words_step_refuses_a_picture(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0].update({'crop': 'bubble'}))
        self.assertTrue(any('Q-1: a words step has no crop' in e for e in errs(s)))

    def test_words_statement_needs_its_body(self):
        s = spec_with(self.tmp, lambda r: r['steps'][2].pop('notice'))
        self.assertTrue(any('Q-3: missing notice' in e for e in errs(s)))

    def test_words_step_obeys_the_writing_rules(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['options'][0].update({'summary': 'Uses a new reducer'}))
        self.assertTrue(any('banned word "reducer"' in e for e in errs(s)))

    def test_deck_data_marks_words_and_carries_labels(self):
        s = load_spec(words_spec(self.tmp))
        d = deck_data(s, {})
        q1, q3 = d['steps'][0], d['steps'][2]
        self.assertTrue(q1['words'] and q3['words'])
        self.assertEqual(q1['kind'], 'decide'); self.assertEqual(len(q1['options']), 1)
        self.assertNotIn('images', q1); self.assertNotIn('boxes', q1)
        self.assertEqual((q3['yes'], q3['no']), ('Holds', 'Fails'))
        self.assertNotIn('kind', q3)

    def test_crop_and_build_skip_words_steps(self):
        s = load_spec(words_spec(self.tmp))
        r = crop_images(s, log=lambda m: None)
        self.assertEqual((r['count'], r['missing']), (0, []))
        page, warnings = build_page(s, r['boxes'])
        self.assertIn('"words": true', page)
        self.assertEqual(warnings, [])

    def test_is_words_is_the_flag_not_a_guess(self):
        # A step that merely FORGOT its crop is still an error, not a silent words step.
        self.assertFalse(is_words({'id': 'x', 'headline': 'h'}))
        self.assertTrue(is_words({'id': 'x', 'words': True}))
        # A contract step (rows) is a words step too — even with no rows yet, so the empty
        # contract gets the contract error in Task 3, not "missing crop".
        self.assertTrue(is_words({'id': 'x', 'rows': []}))


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 3: Run to see them fail**

Run: `cd scripts/ui-review/tests && python3 -m unittest test_words -v`
Expected: `ImportError: cannot import name 'is_words'`.

- [ ] **Step 4: spec.py — the flag, the deck rule, the validator**

In `scripts/ui-review/deck/spec.py`, after `is_clip` (~line 114) add:

```python
def is_contract(step):
    """A CONTRACT step is the rows that define done (feature-flow design §3), rendered as a
    table and answered yes/no/other as ONE step. It is a WORDS step (is_words is true for it)
    that carries `rows`; keyed on the key's PRESENCE so an empty `rows: []` still reaches the
    contract validator ("a contract with no rows defines nothing") instead of the picture
    one ("missing crop"). Validation and the page come in Task 3 of the plan."""
    return 'rows' in step


def is_words(step):
    """A WORDS-ONLY step has no picture at all — `"words": true`, an explicit flag rather than
    "no crop", so a step that merely forgot its crop is still an error and never renders
    silently pictureless. With `options` it is a decide (pick one of the written options, or
    Other); with `rows` a contract; otherwise a statement to approve (`changed` + `notice`
    are its body). Users: the QUESTIONS deck answered before anything is drawn, the contract,
    and the acceptance deck's human rows (feature-flow design §3, §5, §7)."""
    return step.get('words') is True or is_contract(step)


def no_pictures(spec):
    """A deck with no picture steps at all — every step is live or words-only (a contract is
    words-only). It names no `images` folder and no `runs`; every code path that reaches for
    either bails out first (load_spec, crops.py, build.py, review-cards.py). Widens
    live.all_live."""
    return bool(spec['steps']) and all(is_live(st) or is_words(st) for st in spec['steps'])
```

(`is_live` is already imported at the top of `spec.py`. After the next change `all_live` is no longer used in `spec.py` — drop it from that import.)

In `load_spec`, replace `if all_live(spec):` with `if no_pictures(spec):` and update the comment's first line to `# A deck whose every step is LIVE, WORDS-ONLY or a CONTRACT has no`.

In `validate`, after the `is_live` block and before `if is_choice(st):`, add:

```python
        if is_words(st):
            _validate_words(spec, st, sid, errors, warnings)
            continue
```

Extract the option loop out of `_validate_decide`. Replace the block from `opts = st['options']` through the `measured has no number` warning (~lines 234–253; the `themes` and `risk` checks after it stay) with:

```python
    _validate_options(st, sid, errors, warnings, minimum=2)
```

and add, after `_validate_decide`:

```python
def _validate_options(st, sid, errors, warnings, minimum):
    """The written options of a decide step. `minimum` is 2 for a picture decide (one option
    plus Other is a yes/no step in disguise) and 1 for a words-only question, where the
    recommended answer alone plus Other is exactly the shape Destin asked for (2026-09-01)."""
    opts = st['options']
    if not isinstance(opts, list) or len(opts) < minimum:
        errors.append(f'{sid}: a decide step needs at least {minimum} option{"s" if minimum > 1 else ""}')
        return
    if len(opts) > 3:
        warnings.append(f'{sid}: {len(opts)} options — more than three usually means two questions')
    seen = set()
    for i, o in enumerate(opts):
        oid = o.get('id') or f'option {i + 1}'
        if not o.get('id'):
            errors.append(f'{sid}: {oid} has no id')
        elif o['id'] in seen:
            errors.append(f'{sid}: duplicate option id "{o["id"]}"')
        seen.add(o.get('id'))
        for k in ('label', 'summary'):
            if not o.get(k):
                errors.append(f'{sid}/{oid}: missing {k}')
        for k in OPTION_TEXT_FIELDS:
            for w in banned_in(o.get(k)):
                errors.append(f'{sid}/{oid}: {k} uses banned word "{w}"')
        if o.get('measured') and not re.search(r'\d', o['measured']):
            warnings.append(f'{sid}/{oid}: measured has no number in it')


def _validate_words(spec, st, sid, errors, warnings):
    """No picture, so every picture field is refused rather than required — the same stance
    as _validate_live. The question shape is the existing one: `options` → pick one. A
    contract (`rows`) is validated by _validate_rows (Task 3), which this dispatches to."""
    for k in ('surface', 'path', 'headline'):
        if not st.get(k):
            errors.append(f'{sid}: missing {k}')
    for k in ('crop', 'clip', 'highlight', 'variants', 'live'):
        if st.get(k):
            errors.append(f'{sid}: a words step has no {k} — there is no picture')
    _headline_and_words(st, sid, errors)
    if is_contract(st):
        _validate_rows(spec, st, sid, errors)          # Task 3 adds it; until then a contract step is not valid
    elif st.get('options'):
        _validate_options(st, sid, errors, warnings, minimum=1)
    else:
        for k in ('changed', 'notice'):
            if not st.get(k):
                errors.append(f'{sid}: missing {k} (a words step with no options is a statement to approve; these are its body)')
    for k in ('yes', 'no'):
        if st.get(k) and word_count(st[k]) > 4:
            errors.append(f'{sid}: {k} label is {word_count(st[k])} words — a button, keep it under 5')
    th = st.get('themes')
    if th is not None and (not isinstance(th, list) or not th or not all(isinstance(t, str) for t in th)):
        errors.append(f'{sid}: themes must be a non-empty list of theme names')
    if word_count(st.get('risk')) > RISK_WARN:
        warnings.append(f'{sid}: risk is {word_count(st["risk"])} words — keep it to one sentence')
```

Note the `_validate_decide` docstring's claim "at least 2 options" now lives in `_validate_options`; the existing `test_spec` decide tests keep passing because the message text for `minimum=2` is unchanged.

- [ ] **Step 5: crops.py — skip words steps**

In `scripts/ui-review/deck/crops.py`, change the import line to
`from .spec import AUTO_WARN_FRACTION, is_choice, is_words, no_pictures, run_names, step_themes, is_clip`, replace `if all_live(spec):` (~line 41) with `if no_pictures(spec):` and update the comment above it (LIVE → live or words-only), drop `all_live` from the `.live` import (nothing else in crops.py uses it), and after the `if is_live(st): continue` in the loop add:

```python
        if is_words(st):
            continue   # words only (a question, a statement, a contract) — nothing to cut, no `crop` to look up
```

Add a Task-1 step to `_validate_words`'s "until Task 3" gap: in `spec.py` define a placeholder so Task 1's suite runs green on its own:

```python
def _validate_rows(spec, st, sid, errors):
    errors.append(f'{sid}: contract steps are not supported yet (plan Task 3)')
```

(Task 3 replaces the body. `live.all_live` stays for `test_live.py`, which pins it.)

- [ ] **Step 6: build.py — the words step data and the existence loop**

In `scripts/ui-review/deck/build.py` import `is_words` from `.spec`, extract the option mapping and add the words builder:

```python
def _option(o):
    return {'id': o['id'], 'label': o['label'], 'summary': o['summary'],
            'measured': o.get('measured', ''), 'cost': o.get('cost', '')}


def _words_step(spec, st):
    """No picture: the cards take the whole row (page.js lays a `words` step out without a
    stage). With `options` it answers like a decide; without, like an approve, and `yes`/`no`
    relabel the buttons — "Holds / Fails" on an acceptance row, not "Yes, build it"."""
    d = {'id': st['id'], 'words': True, 'surface': st['surface'], 'path': st['path'], 'headline': st['headline'],
         'changed': st.get('changed', ''), 'measured': st.get('measured', ''),
         'notice': st.get('notice', ''), 'risk': st.get('risk', ''),
         'yes': st.get('yes', ''), 'no': st.get('no', ''),
         **({'themes': list(st['themes'])} if st.get('themes') else {})}
    if st.get('options'):
        d['kind'] = 'decide'
        d['options'] = [_option(o) for o in st['options']]
    return d
```

In `_decide_step` replace the inline options list with `[_option(o) for o in st['options']]`. In `deck_data` add the dispatch **before** `is_choice`:

```python
    steps = [_live_step(spec, st) if is_live(st)
             else _words_step(spec, st) if is_words(st)
             else _choice_step(spec, st, boxes, runs[-1]) if is_choice(st)
             ...
```

In `build_page`'s loop, after `if is_live(st): continue`, add:

```python
        if is_words(st):
            continue   # nothing on disk to check — a question, a statement or a contract has no picture
```

(`frames()` in page.js already falls through to `runs.map(...)` for a step with no `kind`, and `render()` ends with `layout()`, so the module-load `curFrames = frames(DECK.steps[0])` and the words layout both work with the edits in Step 7 — verified 2026-09-01.)

- [ ] **Step 7: page.js — render and lay out a words step**

In `scripts/ui-review/deck/page.js`:

1. Line 104: keep `YES`/`NO` as the deck defaults and add per-step labels right below:
```js
  // A words step may relabel the buttons ("Holds / Fails" on an acceptance row): the deck's
  // build/keep wording is about a picture, and a statement has none.
  const yesLabel = st => st.yes || YES, noLabel = st => st.no || NO;
```
   and in `renderAnswers` use `${yesLabel(st)}` / `${noLabel(st)}` in place of `${YES}` / `${NO}`.

2. In `render()`, replace `curFrames = frames(st);` and the `inner.innerHTML = …` line with:
```js
    // A words step has no frames: the stage is hidden by layout() and the cards fill the row.
    curFrames = st.words ? [] : frames(st);
    inner.innerHTML = curFrames.map(f => `<figure class="frame${f.pickable ? ' pickable' : ''}${st.kind === 'clip' ? ' clip' : ''}" data-run="${esc(f.key)}"${f.pickable ? ` title="Pick ${esc(f.key)}"` : ''}><figcaption>${f.caption}</figcaption><div class="pic">${media(st, f)}</div></figure>`).join('');
```
   Change `$('#zoom').hidden = st.kind === 'live';` to `$('#zoom').hidden = st.kind === 'live' || !!st.words;`.
   Replace `const last = curFrames[curFrames.length - 1].key;` with `const last = curFrames.length ? curFrames[curFrames.length - 1].key : null;` and make the thumbs expression start with `st.words ? '' :` (a words step has no picture of any theme; the theme pills would be empty).

3. At the top of `layout()`, before the live line:
```js
    if (DECK.steps[cur].words) {   // no picture to size: one column of cards, answer bar under it
      $('#content').className = 'content words'; $('#step').classList.remove('compact-step');
      document.body.dataset.layout = 'words'; window.__deckReady = true; return;
    }
```

- [ ] **Step 8: page.css — the words layout**

After line 72 (`.content.compact{…}`) add:

```css
/* WORDS: no stage at all — the question and its option cards take the row (feature-flow §5) */
.content.words{grid-template-columns:1fr;grid-template-rows:1fr;grid-template-areas:"decide"} .content.words .stage{display:none}
.words .cards{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))} .words .card.option{min-height:96px}
```

- [ ] **Step 9: Run the Python tests**

Run: `cd scripts/ui-review/tests && python3 -m unittest test_words test_spec test_live -v`
Expected: all pass (`test_words` 9 tests).

- [ ] **Step 10: Add the render test**

Append to `scripts/ui-review/tests/deck-render.test.mjs` (reuse `cdp`, `freePort`, `sleep`, `RC`, `HERE` from the file):

```js
test('a words-only deck renders with no stage and records a pick', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-words-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import words_spec; print(words_spec(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('questions.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-open', '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await sleep(800);
    const c = await cdp(await freePort(), 1400, 900);
    try {
      await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/questions.html` });
      for (let i = 0; i < 40 && !(await c.evaluate('window.__deckReady === true')); i++) await sleep(100);
      assert.equal(await c.evaluate('document.body.dataset.layout'), 'words');
      assert.equal(await c.evaluate("getComputedStyle(document.querySelector('#stage')).display"), 'none');
      assert.equal(await c.evaluate("document.querySelectorAll('.card.option').length"), 1);          // Q-1: one option
      assert.equal(await c.evaluate("[...document.querySelectorAll('.ans')].map(b => b.dataset.v).join(',')"), 'other');
      await c.evaluate("document.querySelector('.card.option').click()");
      await c.evaluate("document.querySelector('#save').click()");   // → Q-2
      await c.evaluate("document.querySelector('#next').click()");   // → Q-3
      await sleep(200);
      assert.equal(await c.evaluate("[...document.querySelectorAll('.ans')].map(b => b.textContent).join(',')"), 'Holds,Fails,Other');
      await sleep(400);
      const answers = JSON.parse(readFileSync(spec.replace(/\.json$/, '.answers.json'), 'utf8'));
      assert.deepEqual([answers.answers['Q-1'].v, answers.answers['Q-1'].pick], ['pick', 'a']);
      assert.deepEqual(c.errors, []);
    } finally { c.close(); }
  } finally { srv.kill(); }
});
```

Run: `node --test scripts/ui-review/tests/deck-render.test.mjs`
Expected: 2 tests pass. (Local only — needs Chrome.)

- [ ] **Step 11: Register the suite**

- `.github/workflows/workspace-ci.yml:107`: `run: python3 -m unittest -v test_spec test_tokens test_live test_words`, and add `test_words` to the comment above it that lists the picture-free suites.
- `scripts/ui-review/README.md` `<!-- runnable -->` block: `python3 -m unittest test_spec test_tokens test_live test_words`; the "Everything" count line changes — run the discover command and write the real number.
- `docs/MAP.md:19`: same command change in the guard-tests column.
- `scripts/ui-review/review-cards.py` docstring: after the five kinds sentence add: `A step may instead be WORDS-ONLY ("words": true — a question with 1–3 written options, or a statement to approve; no picture, no images folder needed): that is the questions deck asked before anything is drawn.`

- [ ] **Step 12: Commit**

```bash
git add scripts/ui-review/deck/spec.py scripts/ui-review/deck/crops.py scripts/ui-review/deck/build.py scripts/ui-review/deck/page.js scripts/ui-review/deck/page.css scripts/ui-review/review-cards.py scripts/ui-review/tests/test_words.py scripts/ui-review/tests/fixture.py scripts/ui-review/tests/deck-render.test.mjs .github/workflows/workspace-ci.yml scripts/ui-review/README.md docs/MAP.md
git commit -m "feat(deck): words-only steps — a question deck with no picture, one option is enough

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CiVWE2jGoEVCkp9bYYtuE2"
```

---

### Task 2: Note tags — fix now / fix later / just noting

**Files:**
- Modify: `scripts/ui-review/deck/page.html.tmpl:19` (after the note input)
- Modify: `scripts/ui-review/deck/page.js` (`paintState` line 212; note input handler line 272)
- Modify: `scripts/ui-review/deck/page.css:165` (after `.note`)
- Modify: `scripts/ui-review/deck/serve.py:40-57` (`summary`)
- Test: `scripts/ui-review/tests/test_words.py` (summary case), `deck-render.test.mjs` (tag click)

**Interfaces:**
- Produces: answers entries gain `note_kind: 'now' | 'later' | 'noting'` whenever `note` is non-empty; `summary()` prints ` [fix now]` etc. after the quoted note.
- Consumed by: Task 6's contract agent prompt (routing rule for notes).

- [ ] **Step 1: Failing summary test**

Add to `WordsTests` in `test_words.py`:

```python
    def test_summary_names_the_note_tag(self):
        from deck.serve import summary
        s = load_spec(words_spec(self.tmp))
        state = {'submitted': '2026-09-01T10:00:00Z', 'answers': {
            'Q-1': {'v': 'pick', 'pick': 'a', 'note': 'but smaller', 'note_kind': 'now'},
            'Q-3': {'v': 'yes', 'note': 'fine', 'note_kind': 'noting'}}}
        lines = summary(s, state).split('\n')
        self.assertEqual(lines[1], 'Q-1 pick a — "but smaller" [fix now]')
        self.assertEqual(lines[3], 'Q-3 yes — "fine" [just noting]')
```

Run: `cd scripts/ui-review/tests && python3 -m unittest test_words.WordsTests.test_summary_names_the_note_tag`
Expected: FAIL — `'Q-1 pick a — "but smaller"' != 'Q-1 pick a — "but smaller" [fix now]'`.

- [ ] **Step 2: serve.py summary**

In `summary()` replace the `lines.append(...)` line with:

```python
        # The tag says what the note IS — next-round work, a roadmap line, or a remark — so the
        # contract agent routes it instead of guessing (feature-flow design §5).
        tag = NOTE_KIND.get(a.get('note_kind'), '')
        lines.append(f'{st["id"]} {what}' + (f' — "{note}"' + (f' [{tag}]' if tag else '') if note else ''))
```

and add near the top of `serve.py`: `NOTE_KIND = {'now': 'fix now', 'later': 'fix later', 'noting': 'just noting'}`.

- [ ] **Step 3: The tag buttons**

`page.html.tmpl` line 19 — after the `<input class="note" …>` add:

```html
        <span class="tags" id="tags" hidden><button class="tag" data-kind="now">Fix now</button><button class="tag" data-kind="later">Fix later</button><button class="tag" data-kind="noting">Just noting</button></span>
```

`page.css` after `.note` (line 165):

```css
/* Note tags: what the note IS. Shown only once a note has text; "Just noting" is preselected so nothing is inferred. */
.tags{display:inline-flex;gap:6px} .tag{font:inherit;font-size:11px;padding:4px 9px;border:1px solid var(--edge);border-radius:999px;background:var(--well);color:var(--fg-dim);cursor:pointer} .tag.on{border-color:var(--mark);color:var(--fg);box-shadow:inset 0 0 0 1px var(--mark)}
.compact .controls .tags{grid-column:1/4}
```

`page.js`:

1. In `paintState()` after the `note.placeholder` line:
```js
    const hasNote = !!(a.note && a.note.trim());
    $('#tags').hidden = !hasNote;
    $$('#tags .tag').forEach(b => b.classList.toggle('on', hasNote && b.dataset.kind === (a.note_kind || 'noting')));
```
2. Replace the note `input` handler (line 272) with:
```js
  $('#note').addEventListener('input', e => {
    const id = DECK.steps[cur].id; const a = { ...(state.answers[id] || {}), note: e.target.value };
    // A note that just gained text is "just noting" until he says otherwise — a visible default,
    // not an inference: it is on screen, selected, and one click away from the other two.
    if (a.note.trim() && !a.note_kind) a.note_kind = 'noting';
    if (!a.note.trim()) delete a.note_kind;
    state.answers[id] = a; paintState(); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300);
  });
  $('#tags').addEventListener('click', e => {
    const b = e.target.closest('.tag'); if (!b || state.submitted) return;
    const id = DECK.steps[cur].id; state.answers[id] = { ...(state.answers[id] || {}), note_kind: b.dataset.kind }; paintState(); save();
  });
```
3. In `lockSubmitted()` add `.tag` to the disabled selector: `$$('.ans,#save,#note,.tag')`.
4. In the page's own `summary()` (line 280) mirror the tag: after `a.note.trim() + '"'` append `+ (a.note_kind ? ' [' + {now:'fix now',later:'fix later',noting:'just noting'}[a.note_kind] + ']' : '')`.

- [ ] **Step 4: Render test — the tag lands in the file**

In the words render test from Task 1, after the `#save` click line insert:

```js
      await c.evaluate("document.querySelector('#prev').click()");   // back to Q-1
      await c.evaluate("const n = document.querySelector('#note'); n.value = 'smaller'; n.dispatchEvent(new Event('input'))");
      assert.equal(await c.evaluate("document.querySelector('#tags').hidden"), false);
      await c.evaluate("document.querySelector('.tag[data-kind=later]').click()");
      await c.evaluate("document.querySelector('#save').click()");   // → Q-2 again
```
and extend the final assertion: `assert.equal(answers.answers['Q-1'].note_kind, 'later');`.

- [ ] **Step 5: Run and commit**

Run: `cd scripts/ui-review/tests && python3 -m unittest test_words test_serve && cd ../../.. && node --test scripts/ui-review/tests/deck-render.test.mjs`
Expected: all pass.

```bash
git add scripts/ui-review/deck/page.html.tmpl scripts/ui-review/deck/page.js scripts/ui-review/deck/page.css scripts/ui-review/deck/serve.py scripts/ui-review/tests/test_words.py scripts/ui-review/tests/deck-render.test.mjs
git commit -m "feat(deck): a note carries a tag — fix now / fix later / just noting — so nothing about it is inferred

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CiVWE2jGoEVCkp9bYYtuE2"
```

---

### Task 3: The contract step

**Files:**
- Modify: `scripts/ui-review/deck/spec.py` (`_validate_rows` body replaces Task 1's placeholder; constants)
- Modify: `scripts/ui-review/deck/build.py` (`_words_step` gains its rows branch)
- Modify: `scripts/ui-review/deck/page.js` (`render()` cards branch)
- Modify: `scripts/ui-review/deck/page.css`
- Modify: `scripts/ui-review/tests/fixture.py` (`contract_spec`)
- Create: `scripts/ui-review/tests/test_contract.py`
- Create: `scripts/ui-review/templates/contract.json` (the template Task 6's agent copies)

**Interfaces:**
- Produces: `CHECKED_BY = ('mechanical', 'deck', 'live-app', 'human')`; deck data `{'id', 'kind': 'contract', 'words': True, 'surface', 'path', 'headline', 'changed', 'measured', 'notice', 'risk', 'rows': [{'id','statement','checkedBy','guard','threshold','source','note','verdict','evidence'}], 'yes', 'no'}` (the words-step keys plus `kind`, `rows`, and defaulted button labels); `fixture.contract_spec(tmp, **over) -> path` which also writes two source decks with **submitted** answers files beside it. `is_contract` and the no-pictures / crop / build skips already exist from Task 1 — a contract step is a words step, so nothing is dispatched anew here.
- Consumed by: Task 4 (`contract.py` reads rows and `sources`), Task 5.

- [ ] **Step 1: Fixture**

Append to `fixture.py`:

```python
# ── contract ────────────────────────────────────────────────────────────────────────────
def contract_spec(tmp, **over):
    """A contract deck plus the two source decks its rows point at, each with a SUBMITTED
    answers file — so contract-check has something real to resolve. Picture-free."""
    deck = os.path.join(tmp, 'deck')
    os.makedirs(deck, exist_ok=True)
    # Source deck 1: a words question, answered. Source deck 2: a picture step, answered.
    q = {'title': 'Q', 'key': 'arcade-questions', 'out': 'q.html', 'themes': ['midnight'],
         'steps': [{'id': 'Q-1', 'words': True, 'surface': 'Games', 'path': 'Questions', 'headline': 'Where does the invite live?',
                    'options': [{'id': 'a', 'label': 'Friends list', 'summary': 'One place.'}]}]}
    r1 = {'title': 'R1', 'key': 'arcade-r1', 'out': 'r1.html', 'images': 'images/r1', 'runs': {'today': '/nowhere'},
          'crops': {'c': ['main', 'home', '10x10+0+0']},
          'steps': [{'id': 'S-1', 'surface': 'Board', 'path': 'Games', 'crop': 'c', 'highlight': {'text': 'Send'},
                     'headline': 'Boards are told apart.', 'changed': 'A colour band.', 'notice': 'Two boards.'},
                    {'id': 'S-2', 'surface': 'Board', 'path': 'Games', 'crop': 'c', 'highlight': {'text': 'Send'},
                     'headline': 'Skipped one.', 'changed': 'x', 'notice': 'y'}]}
    for name, s in (('q', q), ('r1', r1)):
        with open(os.path.join(deck, f'{name}.json'), 'w') as f:
            json.dump(s, f, indent=1)
    with open(os.path.join(deck, 'q.answers.json'), 'w') as f:
        json.dump({'deck': 'arcade-questions', 'submitted': '2026-09-01T09:00:00Z',
                   'answers': {'Q-1': {'v': 'pick', 'pick': 'a', 'seconds': 12}}}, f)
    with open(os.path.join(deck, 'r1.answers.json'), 'w') as f:
        json.dump({'deck': 'arcade-r1', 'submitted': '2026-09-01T09:30:00Z',
                   'answers': {'S-1': {'v': 'yes', 'note': 'band could be thinner', 'note_kind': 'later', 'seconds': 20},
                               'S-2': {'v': 'skip', 'seconds': 1}}}, f)
    spec = {
        'title': 'Arcade — contract', 'key': 'arcade-contract', 'out': 'contract.html', 'themes': ['midnight'],
        'branch': 'feat/arcade-fixture',
        'sources': {'arcade-questions': 'q.json', 'arcade-r1': 'r1.json'},
        'steps': [{'id': 'C', 'surface': 'Games arcade', 'path': 'Contract', 'headline': 'This is what done means.',
                   'rows': [
                       {'id': 'R1', 'statement': 'The invite lives in the friends list.', 'checkedBy': 'deck',
                        'threshold': 'pass/fail', 'source': 'arcade-questions#Q-1'},
                       {'id': 'R2', 'statement': "A second player's board is tellable from mine at a glance.",
                        'checkedBy': 'human', 'threshold': 'pass/fail', 'source': 'arcade-r1#S-1', 'note': 'band could be thinner'},
                       # The guard must exist under workspace_root() — which from a WORKTREE is the main
                       # checkout, so it has to be a file already on master, not one this branch adds.
                       {'id': 'R3', 'statement': 'The board fills the pane at every width.', 'checkedBy': 'mechanical',
                        'guard': 'scripts/ui-review/tests/test_spec.py', 'threshold': 'the named test passes',
                        'source': 'arcade-r1#S-1'},
                   ]}],
    }
    spec.update(over)
    # `<feature>.contract.json` — the `.contract` in the stem is what close-out.sh globs for.
    p = os.path.join(deck, 'arcade.contract.json')
    with open(p, 'w') as f:
        json.dump(spec, f, indent=1)
    return p
```

- [ ] **Step 2: Failing tests**

Create `scripts/ui-review/tests/test_contract.py`:

```python
"""The contract step (rows Destin signs off) and, from Task 4, contract-check + the acceptance
deck. Picture-free like test_live.py. Design: docs/active/specs/2026-09-01-feature-flow-design.md §3–§7."""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
from fixture import contract_spec                                   # noqa: E402
from deck.build import build_page, deck_data                        # noqa: E402
from deck.spec import is_contract, load_spec, no_pictures, validate   # noqa: E402


def spec_with(tmp, mutate, **over):
    p = contract_spec(tmp, **over)
    with open(p) as f:
        raw = json.load(f)
    mutate(raw)
    with open(p, 'w') as f:
        json.dump(raw, f)
    return load_spec(p)


def errs(spec):
    return validate(spec)[0]


class ContractStepTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_valid_contract_has_no_errors_and_no_pictures(self):
        s = load_spec(contract_spec(self.tmp))
        self.assertTrue(is_contract(s['steps'][0])); self.assertTrue(no_pictures(s))
        self.assertEqual(errs(s), [])

    def test_row_fields(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][0].update({'checkedBy': 'vibes', 'source': 'nohash'}))
        e = errs(s)
        self.assertTrue(any('C/R1: checkedBy must be one of mechanical, deck, live-app, human' in x for x in e))
        self.assertTrue(any('C/R1: source must look like <deck key>#<step id>' in x for x in e))

    def test_mechanical_needs_a_guard(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][2].pop('guard'))
        self.assertTrue(any('C/R3: a mechanical row needs a guard' in x for x in errs(s)))

    def test_source_key_must_be_in_sources(self):
        s = spec_with(self.tmp, lambda r: r['sources'].pop('arcade-r1'))
        self.assertTrue(any('C/R2: source deck "arcade-r1" is not in the spec\'s "sources"' in x for x in errs(s)))

    def test_verdict_needs_evidence(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][0].update({'verdict': 'pass'}))
        self.assertTrue(any('C/R1: a verdict needs evidence' in x for x in errs(s)))
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][0].update({'verdict': 'maybe', 'evidence': 'x'}))
        self.assertTrue(any('C/R1: verdict must be pass or fail' in x for x in errs(s)))

    def test_statement_obeys_writing_rules(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][0].update({'statement': 'The reducer stores it.'}))
        self.assertTrue(any('C/R1: statement uses banned word "reducer"' in x for x in errs(s)))

    def test_duplicate_row_ids(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][1].update({'id': 'R1'}))
        self.assertTrue(any('C: duplicate row id "R1"' in x for x in errs(s)))

    def test_empty_rows_is_the_contract_error_not_a_missing_crop(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0].update({'rows': []}))
        e = errs(s)
        self.assertTrue(any('C: a contract with no rows defines nothing' in x for x in e), e)
        self.assertFalse(any('missing crop' in x for x in e), e)

    def test_contract_refuses_options(self):
        s = spec_with(self.tmp, lambda r: r['steps'][0].update({'options': [{'id': 'a', 'label': 'x', 'summary': 'y'}]}))
        self.assertTrue(any('C: a contract step has no options' in x for x in errs(s)))

    def test_deck_data_and_page(self):
        s = load_spec(contract_spec(self.tmp))
        st = deck_data(s, {})['steps'][0]
        self.assertEqual((st['kind'], st['words']), ('contract', True))
        self.assertEqual([r['id'] for r in st['rows']], ['R1', 'R2', 'R3'])
        self.assertEqual((st['yes'], st['no']), ('Yes, that is done', 'No, something is missing'))
        self.assertNotIn('options', st)
        page, _ = build_page(s, {})
        self.assertIn('"kind": "contract"', page)


if __name__ == '__main__':
    unittest.main()
```

Run: `cd scripts/ui-review/tests && python3 -m unittest test_contract -v`
Expected: `ImportError: cannot import name 'is_contract'`.

- [ ] **Step 3: spec.py**

`is_contract` already exists (Task 1) and `_validate_words` already dispatches a rows step to `_validate_rows`. Add near the other constants:

```python
CHECKED_BY = ('mechanical', 'deck', 'live-app', 'human')
SOURCE_RE = re.compile(r'^[\w.-]+#[\w.-]+$')
```

Replace Task 1's placeholder `_validate_rows` with (the shared words checks — surface/path/headline, picture fields refused, headline length and banned words — already ran in `_validate_words`):

```python
def _validate_rows(spec, st, sid, errors):
    """The rows of a contract step (feature-flow design §3). Each row is one statement of what
    done means, who checks it, and the answered deck step it came from."""
    if st.get('options'):
        errors.append(f'{sid}: a contract step has no options — the rows are its body')
    rows = st['rows']
    if not isinstance(rows, list):
        errors.append(f'{sid}: rows must be a list')
        return
    sources = spec.get('sources') or {}
    seen = set()
    for i, r in enumerate(rows):
        rid = r.get('id') or f'row {i + 1}'
        if not r.get('id'):
            errors.append(f'{sid}: {rid} has no id')
        elif r['id'] in seen:
            errors.append(f'{sid}: duplicate row id "{r["id"]}"')
        seen.add(r.get('id'))
        if not r.get('statement'):
            errors.append(f'{sid}/{rid}: missing statement')
        for k in ('statement', 'threshold', 'note'):
            for w in banned_in(r.get(k)):
                errors.append(f'{sid}/{rid}: {k} uses banned word "{w}"')
        if r.get('checkedBy') not in CHECKED_BY:
            errors.append(f'{sid}/{rid}: checkedBy must be one of {", ".join(CHECKED_BY)}')
        if r.get('checkedBy') == 'mechanical' and not r.get('guard'):
            errors.append(f'{sid}/{rid}: a mechanical row needs a guard (a workspace-relative test or script path)')
        src = r.get('source') or ''
        if not SOURCE_RE.match(src):
            errors.append(f'{sid}/{rid}: source must look like <deck key>#<step id>')
        elif src.split('#')[0] not in sources:
            errors.append(f'{sid}/{rid}: source deck "{src.split("#")[0]}" is not in the spec\'s "sources"')
        if 'verdict' in r:
            if r['verdict'] not in ('pass', 'fail'):
                errors.append(f'{sid}/{rid}: verdict must be pass or fail')
            if not r.get('evidence'):
                errors.append(f'{sid}/{rid}: a verdict needs evidence (what was run or looked at)')
    if not rows:
        errors.append(f'{sid}: a contract with no rows defines nothing')
```

(The `themes` and `risk` checks at the end of `_validate_words` run for a contract step too — it returns to `_validate_words` after this.)

- [ ] **Step 4: build.py**

Add the constant and give `_words_step` its rows branch (import `is_contract` from `.spec`):

```python
ROW_KEYS = ('id', 'statement', 'checkedBy', 'guard', 'threshold', 'source', 'note', 'verdict', 'evidence')
```

In `_words_step`, replace the `if st.get('options'):` tail with:

```python
    if is_contract(st):
        # The rows, verbatim, and the two buttons a sign-off needs; page.js draws `rows` as a table.
        d['kind'] = 'contract'
        d['rows'] = [{k: r.get(k, '') for k in ROW_KEYS} for r in st['rows']]
        d['yes'] = st.get('yes') or 'Yes, that is done'
        d['no'] = st.get('no') or 'No, something is missing'
    elif st.get('options'):
        d['kind'] = 'decide'
        d['options'] = [_option(o) for o in st['options']]
    return d
```

Nothing changes in `deck_data`, `build_page` or `crops.py`: Task 1's `is_words` skips already cover a contract step.

- [ ] **Step 5: page.js and CSS**

In `render()`'s `$('#cards').innerHTML = …` chain, add a first branch:

```js
    const graded = st.kind === 'contract' && st.rows.some(r => r.verdict);
    const rowsTable = () => `<section class="card contract"><table><thead><tr><th>#</th><th>Statement</th><th>Checked by</th><th>Threshold</th><th>From</th>${graded ? '<th>Verdict</th>' : ''}</tr></thead><tbody>${st.rows.map(r => `<tr class="${esc(r.verdict)}"><td>${esc(r.id)}</td><td>${esc(r.statement)}${r.note ? `<p class="src">“${esc(r.note)}”</p>` : ''}</td><td>${esc(r.checkedBy)}${r.guard ? `<p class="src">${esc(r.guard)}</p>` : ''}</td><td>${esc(r.threshold || 'pass / fail')}</td><td class="src">${esc(r.source)}</td>${graded ? `<td>${esc(r.verdict || '—')}${r.evidence ? `<p class="src">${esc(r.evidence)}</p>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></section>`;
    $('#cards').innerHTML = st.kind === 'contract'
      ? rowsTable()
        + (st.notice ? `<section class="card"><h3>${ICON.eye}You'll notice</h3><p>${esc(st.notice)}</p></section>` : '')
        + (st.risk ? `<section class="card risk"><h3>${ICON.warn}Risk</h3><p>${esc(st.risk)}</p></section>` : '')
      : pickList(st)
      ? …(existing chain unchanged)…
```

`page.css`, after the words rules from Task 1:

```css
/* CONTRACT: the rows as a table; a graded row is tinted by its verdict */
.card.contract{overflow:auto} .card.contract table{border-collapse:collapse;width:100%;font-size:12px} .card.contract th{text-align:left;font-weight:600;color:var(--fg-dim);padding:6px 8px;border-bottom:1px solid var(--edge)} .card.contract td{padding:6px 8px;border-bottom:1px solid var(--edge);vertical-align:top}
.card.contract .src{margin:2px 0 0;font-size:11px;color:var(--fg-muted)} .card.contract tr.pass td:last-child{color:var(--yes)} .card.contract tr.fail td:last-child{color:var(--no)}
.words .cards:has(.contract){grid-template-columns:1fr}
```

(`--yes` / `--no` are the existing answer-button colours, defined on `:root` at the top of `page.css` — verified 2026-09-01.)

- [ ] **Step 6: Template**

Create `scripts/ui-review/templates/contract.json` — the fixture's contract spec with placeholder text replaced by instructions in the values, e.g. `"statement": "<one sentence, in the user's experience>"`, `"source": "<deck key>#<step id>"`, `"branch": "<feature branch>"`, `"sources": {"<deck key>": "<spec path relative to this file>"}`. Two example rows (one `human`, one `mechanical`).

- [ ] **Step 7: Run, register, commit**

Run: `cd scripts/ui-review/tests && python3 -m unittest test_contract test_words test_spec -v`
Expected: all pass (`test_contract` 10).

Register `test_contract` in `workspace-ci.yml`, README and MAP alongside `test_words` (Task 1 Step 11 lists the three places). Add to the `review-cards.py` docstring: `A CONTRACT step ("rows") is the definition of done signed off as one step; see docs/active/specs/2026-09-01-feature-flow-design.md.`

```bash
git add scripts/ui-review/deck/spec.py scripts/ui-review/deck/build.py scripts/ui-review/deck/page.js scripts/ui-review/deck/page.css scripts/ui-review/tests/fixture.py scripts/ui-review/tests/test_contract.py scripts/ui-review/templates/contract.json scripts/ui-review/review-cards.py .github/workflows/workspace-ci.yml scripts/ui-review/README.md docs/MAP.md
git commit -m "feat(deck): the contract step — the rows that define done, signed off as one step

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CiVWE2jGoEVCkp9bYYtuE2"
```

---

### Task 4: `contract-check` and `acceptance`

**Files:**
- Create: `scripts/ui-review/deck/contract.py`
- Modify: `scripts/ui-review/review-cards.py` (subcommands)
- Test: `scripts/ui-review/tests/test_contract.py` (append)

**Interfaces:**
- Produces: `check_contract(spec) -> list[str]` (empty = holds); `answers_for(spec_path) -> (spec_dict|None, answers_dict|None, why:str)`; `guard_exists(root, branch, guard) -> bool` (on disk under `root`, or committed on `branch` / `origin/<branch>` in the repo the path's first segment names); `signoff(spec) -> (ok: bool, line: str)` (the contract's OWN answers file is submitted and its contract step answered `yes` — the gate's third fact, design §4); `acceptance_status(spec) -> (ok: bool, line: str)` (`<stem>.acceptance.json` exists and its answers are submitted); `acceptance_spec(spec, verdicts) -> dict`.
- CLI `review-cards.py contract-check <spec>`: problems → one per line on stderr, exit 1. Otherwise exit 0 and print three lines, each prefixed `ok: ` or `todo: ` so `close-out.sh` (Task 5) maps them to its OK/TODO without parsing JSON: `ok: contract holds: N rows, every source answered and submitted, every guard found`, then the sign-off line, then the acceptance line. Signing and acceptance are reported, never required — the contract agent runs this before Destin has seen the deck.
- CLI `review-cards.py acceptance <contract.json>`: writes `<stem>.acceptance.json` beside it from `<stem>.verdicts.json` (i.e. `<feature>.contract.verdicts.json`), prints the path; exit 1 with reasons if a graded row lacks a verdict.
- Consumed by: Task 5 (`close-out.sh` calls `contract-check`), Task 6 (dry run), Task 7 (docs).

- [ ] **Step 1: Failing tests**

Append to `test_contract.py`:

```python
class ContractCheckTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_fixture_contract_holds(self):
        from deck.contract import check_contract
        s = load_spec(contract_spec(self.tmp))
        self.assertEqual(check_contract(s), [])

    def test_unsubmitted_source_is_reported(self):
        from deck.contract import check_contract
        p = contract_spec(self.tmp)
        ap = os.path.join(os.path.dirname(p), 'r1.answers.json')
        a = json.load(open(ap)); a['submitted'] = None; json.dump(a, open(ap, 'w'))
        problems = check_contract(load_spec(p))
        self.assertTrue(any('R2: r1.json answers were never submitted' in x for x in problems), problems)

    def test_rotated_answers_are_found(self):
        # serve re-run after a submit moves the file to <stem>.answers.<stamp>.json (serve.rotate_submitted);
        # the check reads the newest SUBMITTED file, whichever name it carries.
        from deck.contract import check_contract
        p = contract_spec(self.tmp); d = os.path.dirname(p)
        os.replace(os.path.join(d, 'r1.answers.json'), os.path.join(d, 'r1.answers.202609010930.json'))
        json.dump({'deck': 'arcade-r1', 'submitted': None, 'answers': {}}, open(os.path.join(d, 'r1.answers.json'), 'w'))
        self.assertEqual(check_contract(load_spec(p)), [])

    def test_skipped_step_is_not_a_source(self):
        from deck.contract import check_contract
        s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][1].update({'source': 'arcade-r1#S-2'}))
        self.assertTrue(any('R2: step S-2 of arcade-r1 was not answered' in x for x in check_contract(s)))

    def test_unknown_step_and_missing_guard(self):
        from deck.contract import check_contract
        s = spec_with(self.tmp, lambda r: (r['steps'][0]['rows'][0].update({'source': 'arcade-r1#S-9'}),
                                           r['steps'][0]['rows'][2].update({'guard': 'scripts/nope.py'})))
        problems = check_contract(s)
        self.assertTrue(any('R1: no step "S-9" in r1.json' in x for x in problems), problems)
        self.assertTrue(any('R3: guard scripts/nope.py does not exist' in x for x in problems), problems)

    def test_guard_committed_on_the_branch_counts(self):
        # A feature's mechanical rows mostly name tests the feature ADDS. From a worktree the
        # workspace root is the main checkout, where that file does not exist until merge — so
        # the check also looks on the contract's branch. Uncommitted still does not count.
        import subprocess
        from unittest import mock
        from deck.contract import check_contract, guard_exists
        root = os.path.join(self.tmp, 'ws'); os.makedirs(os.path.join(root, 'scripts'))
        g = lambda *a: subprocess.run(['git', '-C', root, *a], check=True, capture_output=True, text=True)
        g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't')
        open(os.path.join(root, 'README'), 'w').write('x'); g('add', 'README'); g('commit', '-qm', 'base')
        g('checkout', '-qb', 'feat/x')
        open(os.path.join(root, 'scripts', 'guard.py'), 'w').write('# guard'); g('add', 'scripts/guard.py'); g('commit', '-qm', 'guard')
        g('checkout', '-q', 'main')                      # back on main: the guard is NOT on disk
        self.assertFalse(os.path.exists(os.path.join(root, 'scripts', 'guard.py')))
        self.assertTrue(guard_exists(root, 'feat/x', 'scripts/guard.py'))
        self.assertFalse(guard_exists(root, 'main', 'scripts/guard.py'))
        self.assertFalse(guard_exists(root, 'feat/x', 'scripts/uncommitted.py'))
        with mock.patch.dict(os.environ, {'YOUCODED_WORKSPACE': root}):
            s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][2].update({'guard': 'scripts/guard.py'}), branch='feat/x')
            self.assertEqual(check_contract(s), [])
            s = spec_with(self.tmp, lambda r: r['steps'][0]['rows'][2].update({'guard': 'scripts/guard.py'}), branch='main')
            self.assertTrue(any('R3: guard scripts/guard.py is neither on disk under' in x for x in check_contract(s)))

    def test_signoff_is_the_contracts_own_answer(self):
        from deck.contract import signoff
        p = contract_spec(self.tmp); s = load_spec(p)
        ok, line = signoff(s)
        self.assertFalse(ok); self.assertIn('not signed', line)
        ap = p.replace('.json', '.answers.json')
        json.dump({'deck': 'arcade-contract', 'submitted': None, 'answers': {'C': {'v': 'yes'}}}, open(ap, 'w'))
        ok, line = signoff(s)
        self.assertFalse(ok); self.assertIn('not signed', line)             # answered but never submitted
        json.dump({'deck': 'arcade-contract', 'submitted': '2026-09-01T11:00:00Z', 'answers': {'C': {'v': 'no', 'note': 'R2 is wrong'}}}, open(ap, 'w'))
        ok, line = signoff(s)
        self.assertFalse(ok); self.assertIn('answered "no"', line); self.assertIn('R2 is wrong', line)
        json.dump({'deck': 'arcade-contract', 'submitted': '2026-09-01T11:00:00Z', 'answers': {'C': {'v': 'yes'}}}, open(ap, 'w'))
        ok, line = signoff(s)
        self.assertTrue(ok); self.assertIn('signed 2026-09-01 11:00', line)

    def test_acceptance_status(self):
        from deck.contract import acceptance_status
        p = contract_spec(self.tmp); s = load_spec(p); d = os.path.dirname(p)
        ok, line = acceptance_status(s)
        self.assertFalse(ok); self.assertIn('acceptance deck not built', line)
        json.dump({'key': 'x', 'steps': []}, open(os.path.join(d, 'arcade.contract.acceptance.json'), 'w'))
        ok, line = acceptance_status(s)
        self.assertFalse(ok); self.assertIn('acceptance deck not submitted', line)
        json.dump({'submitted': '2026-09-01T12:00:00Z', 'answers': {'C': {'v': 'yes'}}}, open(os.path.join(d, 'arcade.contract.acceptance.answers.json'), 'w'))
        ok, line = acceptance_status(s)
        self.assertTrue(ok); self.assertIn('acceptance deck submitted 2026-09-01 12:00', line)

    def test_cli_contract_check(self):
        import importlib.util
        spec_ = importlib.util.spec_from_file_location('review_cards', os.path.join(os.path.dirname(HERE), 'review-cards.py'))
        rc = importlib.util.module_from_spec(spec_); spec_.loader.exec_module(rc)
        import io
        from contextlib import redirect_stderr, redirect_stdout
        p = contract_spec(self.tmp)
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = rc.main(['contract-check', p])
        self.assertEqual(code, 0, err.getvalue())
        lines = out.getvalue().splitlines()
        self.assertTrue(lines[0].startswith('ok: contract holds: 3 rows'), lines)
        self.assertTrue(lines[1].startswith('todo: not signed'), lines)
        self.assertTrue(lines[2].startswith('todo: acceptance deck not built'), lines)
        # A source problem is exit 1 with the problems on stderr and nothing on stdout.
        ap = os.path.join(os.path.dirname(p), 'r1.answers.json')
        a = json.load(open(ap)); a['submitted'] = None; json.dump(a, open(ap, 'w'))
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = rc.main(['contract-check', p])
        self.assertEqual(code, 1); self.assertIn('never submitted', err.getvalue()); self.assertEqual(out.getvalue(), '')


class AcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_refuses_without_verdicts_for_graded_rows(self):
        from deck.contract import acceptance_spec, AcceptanceError
        s = load_spec(contract_spec(self.tmp))
        with self.assertRaises(AcceptanceError) as cm:
            acceptance_spec(s, {'R1': {'verdict': 'pass', 'evidence': 'answered a'}})
        self.assertIn('R3 (mechanical) has no verdict', str(cm.exception))

    def test_builds_the_acceptance_deck(self):
        from deck.contract import acceptance_spec
        s = load_spec(contract_spec(self.tmp))
        acc = acceptance_spec(s, {'R1': {'verdict': 'pass', 'evidence': 'answered a'},
                                  'R3': {'verdict': 'fail', 'evidence': 'test_contract.py: 1 failed'}})
        self.assertEqual(acc['key'], 'arcade-contract-acceptance')
        self.assertEqual([st['id'] for st in acc['steps']], ['C', 'R2'])
        c, r2 = acc['steps']
        self.assertEqual([r.get('verdict') for r in c['rows']], ['pass', None, 'fail'])
        self.assertTrue(r2['words']); self.assertEqual((r2['yes'], r2['no']), ('Holds', 'Fails'))
        self.assertEqual(r2['headline'], "A second player's board is tellable from mine at a glance.")
        self.assertIn('band could be thinner', r2['changed'])
        # It is itself a valid deck.
        d = os.path.dirname(contract_spec(self.tmp))
        ap = os.path.join(d, 'arcade.contract.acceptance.json'); json.dump(acc, open(ap, 'w'))
        self.assertEqual(validate(load_spec(ap))[0], [])
```

Run: `cd scripts/ui-review/tests && python3 -m unittest test_contract -v`
Expected: the new cases fail with `ModuleNotFoundError: No module named 'deck.contract'`.

- [ ] **Step 2: contract.py**

Create `scripts/ui-review/deck/contract.py`:

```python
"""The gate's three facts, and the acceptance deck built from the contract.

contract-check reads what the design calls the gate (feature-flow design §4): (1) the contract
holds — every row's `source` names a step that exists in a deck the spec's `sources` map points
at, that deck's answers were SUBMITTED, that step was answered (not skipped), and every
`mechanical` guard exists on disk or on the contract's branch; (2) the contract was SIGNED —
its own answers file is submitted and the contract step answered yes; (3) the acceptance deck
was submitted. Only (1) is an exit code: the contract agent runs this before Destin has seen
the deck, so (2) and (3) are reported as `ok:` / `todo:` lines that close-out.sh relays.

acceptance merges the grader's verdicts into the contract: step 1 is the table with a verdict
beside every graded row, then one words step per human / live-app row for Destin to tick."""
import glob
import json
import os
import subprocess

from .spec import is_contract, workspace_root


class AcceptanceError(Exception):
    pass


def contract_steps(spec):
    return [st for st in spec['steps'] if is_contract(st)]


def _when(stamp):
    return (stamp or '')[:16].replace('T', ' ')


def guard_exists(root, branch, guard):
    """A `mechanical` row's guard, as a workspace-relative path. True if it is on disk under
    `root`, or committed on `branch` (or `origin/<branch>`) in the repo the path's first
    segment names — `youcoded/desktop/tests/x.test.ts` is looked up in the `youcoded` repo as
    `desktop/tests/x.test.ts`; `scripts/x.py` in the workspace repo itself.
    WHY the branch: from a worktree, workspace_root() is the MAIN checkout, where a test the
    feature branch adds does not exist until merge — and those are most of the guards a
    contract names. An uncommitted file is found nowhere, on purpose."""
    if not guard:
        return False
    if os.path.exists(os.path.join(root, guard)):
        return True
    if not branch:
        return False
    first, _, rest = guard.partition('/')
    repo, rel = (os.path.join(root, first), rest) if rest and os.path.exists(os.path.join(root, first, '.git')) else (root, guard)
    for ref in (branch, f'origin/{branch}'):
        r = subprocess.run(['git', '-C', repo, 'cat-file', '-e', f'{ref}:{rel}'], capture_output=True)
        if r.returncode == 0:
            return True
    return False


def answers_for(spec_path):
    """(raw spec, newest SUBMITTED answers, why) for a source deck. Returns (None, None, why)
    when the spec cannot be read; (spec, None, why) when nothing submitted exists.
    WHY the glob: serve.rotate_submitted moves a submitted file to <stem>.answers.<stamp>.json
    before a re-serve, so the plain file may be the EMPTY new one while the decisions sit in
    the stamped one. The newest submitted file wins, whichever name it carries."""
    try:
        with open(spec_path) as f:
            raw = json.load(f)
    except (OSError, ValueError) as e:
        return None, None, f'cannot read {os.path.basename(spec_path)}: {e}'
    base, stem = os.path.dirname(spec_path), os.path.splitext(os.path.basename(spec_path))[0]
    candidates = [os.path.join(base, stem + '.answers.json')] + sorted(glob.glob(os.path.join(base, stem + '.answers.*.json')), reverse=True)
    seen_any = False
    for c in candidates:
        try:
            with open(c) as f:
                a = json.load(f)
        except (OSError, ValueError):
            continue
        seen_any = True
        if a.get('submitted'):
            return raw, a, ''
    rel = os.path.basename(spec_path)
    return raw, None, (f'{rel} answers were never submitted' if seen_any else f'{rel} has no answers file')


def check_contract(spec):
    """One problem per line; empty means the contract holds together."""
    problems, cache = [], {}
    sources = spec.get('sources') or {}
    root = workspace_root()
    for st in contract_steps(spec):
        for r in st['rows']:
            tag = f'{st["id"]}/{r["id"]}'
            key, _, sid = (r.get('source') or '').partition('#')
            rel = sources.get(key)
            if not rel:
                problems.append(f'{tag}: source deck "{key}" is not in the spec\'s "sources"')
                continue
            if key not in cache:
                cache[key] = answers_for(os.path.join(spec['_base'], rel))
            raw, ans, why = cache[key]
            if raw is None:
                problems.append(f'{tag}: {why}')
                continue
            if raw.get('key') != key:
                problems.append(f'{tag}: {rel} is deck "{raw.get("key")}", not "{key}"')
            if sid not in {s.get('id') for s in raw.get('steps', [])}:
                problems.append(f'{tag}: no step "{sid}" in {rel}')
            if ans is None:
                problems.append(f'{tag}: {why}')
                continue
            a = (ans.get('answers') or {}).get(sid) or {}
            if not a.get('v') or a['v'] == 'skip':
                problems.append(f'{tag}: step {sid} of {key} was not answered')
            if r.get('checkedBy') == 'mechanical' and not guard_exists(root, spec.get('branch'), r.get('guard', '')):
                problems.append(f'{tag}: guard {r.get("guard")} is neither on disk under {root} nor committed on branch "{spec.get("branch") or "(no branch in the spec)"}"')
    return problems


def signoff(spec):
    """Fact (2): the contract's OWN answers — submitted, and the contract step answered yes.
    Returns (ok, one line for close-out)."""
    steps = contract_steps(spec)
    sid = steps[0]['id'] if steps else None
    _, ans, why = answers_for(os.path.join(spec['_base'], spec['_stem'] + '.json'))
    if ans is None:
        return False, f'not signed — {why}; serve {spec["_stem"]}.json and answer it'
    a = (ans.get('answers') or {}).get(sid) or {}
    if a.get('v') == 'yes':
        return True, f'signed {_when(ans.get("submitted"))} — {sid} yes' + (f' — "{a["note"].strip()}"' if (a.get('note') or '').strip() else '')
    if a.get('v') in ('no', 'other'):
        return False, f'answered "{a["v"]}" {_when(ans.get("submitted"))} — the contract is not agreed' + (f': "{a["note"].strip()}"' if (a.get('note') or '').strip() else '')
    return False, f'not signed — submitted {_when(ans.get("submitted"))} but step {sid} was skipped'


def acceptance_status(spec):
    """Fact (3): `<stem>.acceptance.json` exists and its newest answers file is submitted."""
    acc = os.path.join(spec['_base'], spec['_stem'] + '.acceptance.json')
    if not os.path.exists(acc):
        return False, f'acceptance deck not built — write {spec["_stem"]}.verdicts.json, then review-cards.py acceptance {spec["_stem"]}.json'
    _, ans, why = answers_for(acc)
    if ans is None:
        return False, f'acceptance deck not submitted — serve {os.path.basename(acc)}'
    return True, f'acceptance deck submitted {_when(ans.get("submitted"))}'


GRADED = ('mechanical', 'deck')


def acceptance_spec(spec, verdicts):
    """The acceptance deck as a spec dict. `verdicts` is {row id: {verdict, evidence}} from
    <stem>.verdicts.json. Refuses when a graded row has none: an ungraded row is not a pass."""
    steps = contract_steps(spec)
    if len(steps) != 1:
        raise AcceptanceError(f'expected exactly one contract step, found {len(steps)}')
    st = steps[0]
    missing = [f'{r["id"]} ({r["checkedBy"]})' for r in st['rows'] if r.get('checkedBy') in GRADED and not (verdicts.get(r['id']) or {}).get('verdict')]
    if missing:
        raise AcceptanceError('no verdict for graded rows: ' + ', '.join(m + ' has no verdict' for m in missing))
    rows = []
    for r in st['rows']:
        v = verdicts.get(r['id']) or {}
        rows.append({**r, **({'verdict': v['verdict'], 'evidence': v.get('evidence', '')} if v.get('verdict') else {})})
    table = {**st, 'id': st['id'], 'rows': rows, 'headline': 'The contract, graded — accept these verdicts?',
             'yes': 'Yes, accept', 'no': 'No, something is wrong'}
    human = [{'id': r['id'], 'words': True, 'surface': st['surface'], 'path': 'Acceptance',
              'headline': r['statement'],
              'changed': 'Checked by you.' + (f' Your note at review: “{r["note"]}”' if r.get('note') else ''),
              'notice': r.get('threshold') or 'pass / fail',
              'yes': 'Holds', 'no': 'Fails'}
             for r in st['rows'] if r.get('checkedBy') in ('human', 'live-app')]
    return {'title': spec['title'] + ' — acceptance', 'key': spec['key'] + '-acceptance',
            'out': spec['_stem'] + '.acceptance.html', 'themes': list(spec['themes']),
            'branch': spec.get('branch', ''), 'sources': dict(spec.get('sources') or {}),
            'steps': [table] + human}
```

- [ ] **Step 3: CLI**

In `review-cards.py`: import `from deck.contract import AcceptanceError, acceptance_spec, acceptance_status, check_contract, contract_steps, signoff`; register `for c in ('build', 'serve', 'wait', 'contract-check', 'acceptance'):`; in `main` before the `serve` branch:

```python
        if a.cmd == 'contract-check':
            if not contract_steps(spec):
                print('no contract step in this spec (a step with "rows")', file=sys.stderr)
                return 1
            problems = check_contract(spec)
            if problems:
                print('\n'.join(problems), file=sys.stderr)
                return 1
            n = sum(len(st['rows']) for st in contract_steps(spec))
            # Three facts, three lines, `ok:`/`todo:` prefixed so close-out.sh can relay them
            # without parsing anything. Only the first is an exit code (see contract.py).
            print(f'ok: contract holds: {n} rows, every source answered and submitted, every guard found')
            for ok, line in (signoff(spec), acceptance_status(spec)):
                print(('ok: ' if ok else 'todo: ') + line)
            return 0
        if a.cmd == 'acceptance':
            vpath = os.path.join(spec['_base'], spec['_stem'] + '.verdicts.json')
            try:
                with open(vpath) as f:
                    verdicts = json.load(f)
            except OSError:
                print(f'no verdicts file at {vpath} — the grader writes {{rowId: {{verdict, evidence}}}} there first', file=sys.stderr)
                return 1
            try:
                acc = acceptance_spec(spec, verdicts)
            except AcceptanceError as e:
                print(str(e), file=sys.stderr)
                return 1
            out = os.path.join(spec['_base'], spec['_stem'] + '.acceptance.json')
            with open(out, 'w') as f:
                json.dump(acc, f, indent=1)
            print('wrote', out, '— now: review-cards.py serve', out)
            return 0
```

Add `import json` at the top and the two commands to the docstring:

```
  python3 scripts/ui-review/review-cards.py contract-check <feature>.contract.json
        every row's source resolves to an answered step in a submitted deck and every mechanical guard exists on disk or on
        the contract's branch (exit 1 lists what doesn't); then reports, as ok:/todo: lines, whether the contract was signed
        (its own answers file) and whether the acceptance deck was submitted
  python3 scripts/ui-review/review-cards.py acceptance <feature>.contract.json
        merge <feature>.contract.verdicts.json into <feature>.contract.acceptance.json — the contract graded, plus a yes/no per human row
```

- [ ] **Step 4: Run and commit**

Run: `cd scripts/ui-review/tests && python3 -m unittest test_contract -v`
Expected: 21 tests pass.

```bash
git add scripts/ui-review/deck/contract.py scripts/ui-review/review-cards.py scripts/ui-review/tests/test_contract.py
git commit -m "feat(deck): contract-check reads the gate's three facts; acceptance builds the graded deck

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CiVWE2jGoEVCkp9bYYtuE2"
```

---

### Task 5: `close-out.sh` Contract section

**Files:**
- Modify: `scripts/close-out.sh` (insert before `echo "Docs"`, line ~118; add `DOCS_DIR` override near line 22)
- Create: `scripts/ui-review/tests/close-out-contract.test.sh`

**Interfaces:**
- Consumes: `review-cards.py contract-check` (Task 4) — its exit code and its `ok:` / `todo:` lines; a contract spec's top-level `"branch"`.
- Produces: a `Contract` section with `OK` / `TODO` / `--` lines, always exit 0. No JSON is read here; every fact comes from `contract-check`.

- [ ] **Step 1: The test**

Create `scripts/ui-review/tests/close-out-contract.test.sh`:

```bash
#!/usr/bin/env bash
# close-out.sh gets a Contract section: no contract → a note; a contract that holds but is
# unsigned with no acceptance deck → OK + TODO + TODO; signed and accepted → three OKs; a
# contract that does not hold → TODO with the problems indented. Runs against a temp docs dir.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; WS="$(cd "$HERE/../../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
python3 -c "import sys; sys.path.insert(0, '$HERE'); from fixture import contract_spec; print(contract_spec('$TMP'))" >/dev/null
X="$TMP/docs/active/design/x"; mkdir -p "$X" && mv "$TMP/deck/"* "$X/"

out=$(CLOSE_OUT_DOCS="$TMP/nothing" bash "$WS/scripts/close-out.sh" no-such-branch-zz workspace)
grep -q "^Contract" <<<"$out" || { echo "no Contract section"; exit 1; }
grep -q "no contract names this branch" <<<"$out" || { echo "missing 'no contract' note"; echo "$out"; exit 1; }

# pass()/fail() print colour escapes between the OK/TODO word and the message, so match loosely.
out=$(CLOSE_OUT_DOCS="$TMP/docs" bash "$WS/scripts/close-out.sh" feat/arcade-fixture workspace)
grep -q "OK.*contract holds: 3 rows" <<<"$out" || { echo "expected 'contract holds'"; echo "$out"; exit 1; }
grep -q "TODO.*not signed" <<<"$out" || { echo "expected unsigned TODO"; echo "$out"; exit 1; }
grep -q "TODO.*acceptance deck not built" <<<"$out" || { echo "expected acceptance TODO"; echo "$out"; exit 1; }

echo '{"submitted":"2026-09-01T11:00:00Z","answers":{"C":{"v":"yes"}}}' > "$X/arcade.contract.answers.json"
echo '{"key":"arcade-contract-acceptance","steps":[]}' > "$X/arcade.contract.acceptance.json"
echo '{"submitted":"2026-09-01T12:00:00Z","answers":{"C":{"v":"yes"},"R2":{"v":"yes"}}}' > "$X/arcade.contract.acceptance.answers.json"
out=$(CLOSE_OUT_DOCS="$TMP/docs" bash "$WS/scripts/close-out.sh" feat/arcade-fixture workspace)
grep -q "OK.*signed 2026-09-01 11:00" <<<"$out" || { echo "expected signed OK"; echo "$out"; exit 1; }
grep -q "OK.*acceptance deck submitted" <<<"$out" || { echo "expected acceptance OK"; echo "$out"; exit 1; }

python3 - "$X/r1.answers.json" <<'PY'
import json, sys; p = sys.argv[1]; a = json.load(open(p)); a['submitted'] = None; json.dump(a, open(p, 'w'))
PY
out=$(CLOSE_OUT_DOCS="$TMP/docs" bash "$WS/scripts/close-out.sh" feat/arcade-fixture workspace)
grep -q "TODO.*contract does not hold" <<<"$out" || { echo "expected does-not-hold TODO"; echo "$out"; exit 1; }
grep -q "never submitted" <<<"$out" || { echo "expected the problem line"; echo "$out"; exit 1; }
echo "close-out contract section: ok"
```

Run: `bash scripts/ui-review/tests/close-out-contract.test.sh`
Expected: `no Contract section`, exit 1.

- [ ] **Step 2: The section**

In `scripts/close-out.sh`, after `WORKSPACE=…` (line 22) add:

```bash
# Where contracts are looked for. Overridable so the test can point it at a temp folder.
DOCS_DIR="${CLOSE_OUT_DOCS:-$WORKSPACE/docs}"
```

Insert before `echo "Docs"`:

```bash
echo
echo "Contract"
# The contract is the definition of done for a feature (docs/active/specs/2026-09-01-feature-flow-design.md).
# It names its branch, so this is the ONLY lookup — no "branch" field, no contract, and the
# note below says so rather than guessing which deck folder this work came from.
CONTRACTS=$(rg -l --glob '*.contract.json' -F "\"branch\": \"$BRANCH\"" "$DOCS_DIR" 2>/dev/null || true)
if [[ -z "$CONTRACTS" ]]; then
  note "no contract names this branch — the feature flow was not used, or the contract has no \"branch\""
else
  while IFS= read -r c; do
    REL="${c#"$WORKSPACE"/}"
    # contract-check owns every fact (does it hold, was it signed, was acceptance submitted):
    # exit 1 + problems on stderr when it does not hold; otherwise `ok:` / `todo:` lines
    # that are relayed here verbatim, so this script never reads an answers file itself.
    if OUT=$(python3 "$WORKSPACE/scripts/ui-review/review-cards.py" contract-check "$c" 2>&1); then
      while IFS= read -r line; do
        case "$line" in
          ok:\ *)   pass "${line#ok: } — $REL" ;;
          todo:\ *) fail "${line#todo: }" ;;
          *)        note "$line" ;;
        esac
      done <<<"$OUT"
    else
      fail "contract does not hold — $REL:"
      echo "$OUT" | sed 's/^/       /'
    fi
  done <<<"$CONTRACTS"
fi
```

(Rotated answers files — `<stem>.answers.<stamp>.json` after a re-serve — are handled inside `contract-check` by `answers_for`, for the sign-off and the acceptance deck alike.)

- [ ] **Step 3: Run, register, commit**

Run: `bash scripts/ui-review/tests/close-out-contract.test.sh`
Expected: `close-out contract section: ok`.

Add the test to the README's local block (`bash scripts/ui-review/tests/close-out-contract.test.sh` — local because `close-out.sh` shells out to `rg` and runs `git fetch`, neither of which the CI runner is set up for) and to the close-out header comment (`# Contract section: feature-flow design §4`).

```bash
git add scripts/close-out.sh scripts/ui-review/tests/close-out-contract.test.sh scripts/ui-review/README.md
git commit -m "feat(close-out): a Contract section — does the contract hold, was the acceptance deck submitted

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CiVWE2jGoEVCkp9bYYtuE2"
```

---

### Task 6: The contract agent prompt, dry-run on the arcade

**Files:**
- Create: `scripts/ui-review/contract-agent.md`
- Dry-run output (NOT committed): `scratch/feature-flow/games-arcade.contract.json`. It is a test of the prompt, not a deliverable — and a contract in `docs/` naming `feat/games-arcade-shell` would make `close-out.sh` report an unsigned contract on a branch that closed out on 2026-08-31, forever.

**Interfaces:**
- Consumes: Task 0's committed answers files, Task 3's template, Task 4's `contract-check`.
- Produces: the prompt every implementing session dispatches (with the `Agent` tool, fresh context) to write a contract.

- [ ] **Step 1: The prompt**

Create `scripts/ui-review/contract-agent.md`:

```markdown
# Contract agent

You write the contract for a feature: the rows that define "done", built ONLY from what Destin
answered on the decks. You are a fresh agent on purpose — the session that drew the designs
grades its own work generously; you do not.

## Inputs (you get nothing else)
- Every deck spec for the feature, in order: `<feature>.questions.json`, then each review round.
- Their answers files (`*.answers.json`; if a stamped `*.answers.<stamp>.json` exists and the
  plain file is unsubmitted, the stamped one is the real answer set).
- `scripts/ui-review/templates/contract.json` — the shape to fill.

Do NOT read the design spec, the implementation plan, chat transcripts or the code. If the
answers do not support a row, the row does not exist; write what was missed into a
`## Not covered` list at the end of your reply so the next round can ask.

## How an answer becomes a row
- `yes` with no note, or a note tagged **just noting** → one row. Statement = the step's
  headline rewritten as what the user experiences (present tense, no code words — the deck's
  banned list applies). `source` = `<deck key>#<step id>`; `note` = the note text verbatim.
- `pick X` → a row stating the picked option's label as a fact ("The invite lives in the
  friends list"). Other options are not rows.
- `other` → a row from the note ONLY if it states a requirement; a wish or a question is
  `## Not covered`.
- A note tagged **fix now** → NOT a row (it was the next round's work; the next round's
  answer is the source). Tagged **fix later** → not a row; list it under `## Roadmap` in your
  reply with the source, for the session to file.
- `no` / `skip` → no row. A skipped step is unanswered, never "fine".

## `checkedBy`
- `mechanical` only when you can name a test or guard path (workspace-relative) that checks
  the statement and EXISTS — on disk, or committed on the feature branch you were told
  (`contract-check` looks in both places). Do not invent one; if none exists, the row is
  `human` and you say so in `## Not covered` ("R4 needs a test").
- `deck` when the approved step's picture IS the check (re-shot from the built branch).
- `live-app` when only the real running app can show it (sync, other users, terminals).
- `human` otherwise.

## Rules
- One sentence per statement, in the user's words. ≤ 25 words.
- `threshold` is pass/fail unless a number was approved on the deck (a `measured` field).
- Set `branch` to the feature branch you were told; `sources` maps every deck key you cite to
  its spec path relative to the contract file.
- Finish with: `python3 scripts/ui-review/review-cards.py contract-check <path>` and paste its
  output. A contract that does not hold (exit 1) is not delivered; the `todo: not signed`
  line is expected — signing is Destin's, after you.
```

- [ ] **Step 2: Dry run**

Dispatch a fresh `Agent` (general-purpose) with the prompt file, the three arcade specs and answers under `docs/archive/design/2026-08-30-games-arcade/` (`step1-sizing`, `board-contrast`, `head-to-head`), branch `feat/games-arcade-shell`, output path `scratch/feature-flow/games-arcade.contract.json` (`sources` paths are relative to the contract file, so they point back into `docs/archive/…`). (The arcade had no questions deck; say so in the dispatch.)

Then run: `python3 scripts/ui-review/review-cards.py contract-check scratch/feature-flow/games-arcade.contract.json`
Expected: exit 0, `ok: contract holds: N rows …`, `todo: not signed …`, `todo: acceptance deck not built …`. Read the rows: a reader who knows the arcade should recognise it (the board fills the pane; a second player's board is tellable; the head-to-head layout). If a row is not traceable to a `yes`/`pick`, the prompt is wrong — fix the prompt, not the output. Paste the rows and the check output into the commit message below; the file itself stays in `scratch/`.

- [ ] **Step 3: Commit**

```bash
git add scripts/ui-review/contract-agent.md
git commit -m "feat(deck): the contract agent prompt, dry-run against the arcade's three decks

<the dry run's rows and contract-check output>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CiVWE2jGoEVCkp9bYYtuE2"
```

---

### Task 7: The rule, the skill, the docs

**Files:**
- Create: `.claude/rules/feature-flow.md`
- Modify: `.claude/skills/ui-mockup/SKILL.md:78-88` (After approval)
- Modify: `scripts/ui-review/README.md` (deck section, ~line 62 — one paragraph)
- Modify: `docs/MAP.md:19` (rule column: `react-renderer · feature-flow`)
- Modify: `CLAUDE.md` "New Features & UI/UX Changes" (one sentence)
- Modify: `ROADMAP.md` (the entry for this work, under Features)

- [ ] **Step 1: The rule**

Create `.claude/rules/feature-flow.md`:

```markdown
---
paths:
  - "**/scripts/ui-review/deck/**"
  - "**/scripts/ui-review/review-cards.py"
  - "**/scripts/ui-review/contract-agent.md"
  - "**/docs/active/design/**"
  - "**/scripts/close-out.sh"
last_verified: 2026-09-01
verify:
  - path: scripts/ui-review/deck/contract.py
    contains: "def check_contract"
  - path: scripts/ui-review/contract-agent.md
  - test: scripts/ui-review/tests/test_contract.py
  - test: scripts/ui-review/tests/test_words.py
---

# Feature flow — the deck is the one surface

Design: `docs/active/specs/2026-09-01-feature-flow-design.md`.

## Questions before drawing
**Invariant:** a new feature's step-2 questions are a words-only deck (`<feature>.questions.json`,
`"words": true` decide steps, 1–3 options), served and submitted before any UI is drawn.
**Why:** answers in chat are not a source; a contract row must resolve to an answered step.
**Guard:** `test_words.py`; the `ui-mockup` skill's checklist.

## The contract is a deck, and its sources are answered steps
**Invariant:** `<feature>.contract.json` is a one-step `rows` deck; every row's `source` is
`<deck key>#<step id>` of a submitted, non-skipped answer. Not the design spec, not the plan,
not the transcript. Written by a FRESH agent from `scripts/ui-review/contract-agent.md`.
**Why:** provenance — the rows are Destin's decisions, and a generator grading itself is generous.
**Guard:** `review-cards.py contract-check`; `test_contract.py`.

## Answers files are committed
**Invariant:** `docs/**/*.answers.json` (and the stamped rotations) are tracked; only `scratch/`
is ignored. Never add them back to `.gitignore`.
**Why:** they are the only record of decisions; ignored for three months, they lived on one disk.
**Guard:** none — candidate (an anchor test on `.gitignore`).

## Reopen only through a deck
**Invariant:** when implementation contradicts approved UI, the implementing session serves a
one-step words-only `decide` deck and waits; a chat question is not a route back. The answer
amends the contract row's `source`.
**Why:** a chat answer is not a source (see above).
**Guard:** none — candidate.

## The gate is three facts, and one command reports them
**Invariant:** `review-cards.py contract-check <feature>.contract.json` is the only reader of
the gate: (1) every row's source resolves and every `mechanical` guard exists on disk or on
the contract's `branch` (exit 1 otherwise); (2) the contract was signed — `<feature>.contract.answers.json`
submitted with the contract step `yes`; (3) `<feature>.contract.acceptance.answers.json` is
submitted. `close-out.sh` relays its `ok:` / `todo:` lines and reads no answers file itself.
**Why:** a guard the branch adds is not in the main checkout until merge; a contract nobody
signed is not a definition of done; two readers of one file drift.
**Guard:** `test_contract.py` (ContractCheckTests); `close-out-contract.test.sh`.

## Acceptance is graded rows plus human rows
**Invariant:** the grader writes `<feature>.contract.verdicts.json` (beside the contract, same
stem — the CLI reads exactly that name); `review-cards.py acceptance` refuses when a
`mechanical` or `deck` row has no verdict.
**Why:** an ungraded row is not a pass.
**Guard:** `test_contract.py` (AcceptanceTests).
```

- [ ] **Step 2: The skill**

In `.claude/skills/ui-mockup/SKILL.md`, insert before `## The mechanism: edit the real components` (line 13):

```markdown
## Before drawing anything: the questions deck

Step 2 of the feature flow (`docs/active/specs/2026-09-01-feature-flow-design.md` §5) is a
deck, not a chat. Write `docs/active/design/<date>-<feature>/<feature>.questions.json` — one
`"words": true` step per question, one to three options (the recommended one first, its why in
`summary`), no picture — and `serve` it in the background. Do not ask what the design guide or
the code already answers; do not ask what has an obvious answer (state it, the review deck
will show it). Draw only after it is submitted: its answers are the first source of the
contract.
```

Replace the `## After approval` list (lines 80–88) with:

```markdown
## After approval

Decisions must not live only in chat — and the deck answers ARE the record (they are committed):

1. **Write the contract.** Dispatch a fresh agent with `scripts/ui-review/contract-agent.md`,
   the questions deck, every round's spec and answers, and the branch name. Serve
   `<feature>.contract.json`; it is the last thing Destin answers before the build. Run
   `review-cards.py contract-check` on it and paste the output into the handoff.
2. Turn the `MOCK_ONLY` entries the approved UI depends on into real handlers (main +
   `preload.ts` + `remote-shim.ts` + `SessionService.kt`, guarded by `ipc-channels.test.ts`),
   then drop them from the registry.
3. A design spec under `docs/active/specs/` is written only when the work crosses repos,
   touches a migration or a protocol, or has ordering constraints (design §8). Otherwise the
   contract plus the approved decks is the plan.
4. Add ROADMAP entries for every *fix later* note the contract agent listed, and follow the
   workspace knowledge rules (pinning test > ast-grep rule > WHY comment > path-scoped rule).
5. At the end: write `<feature>.contract.verdicts.json` beside the contract, run
   `review-cards.py acceptance`, serve the acceptance deck; `bash scripts/close-out.sh <branch>`
   reports whether the contract holds, was signed, and was accepted.

Merging cannot shift appearance, because nothing was ever copied.
```

- [ ] **Step 3: README, MAP, CLAUDE.md, ROADMAP**

- `scripts/ui-review/README.md` deck row: append one sentence naming words-only steps, the contract step, `contract-check` and `acceptance`, pointing at the design doc.
- `docs/MAP.md:19` rule column → `react-renderer · feature-flow`; add `contract-check` / `acceptance` to the entry-points cell.
- `CLAUDE.md` → "New Features & UI/UX Changes": after the review-deck sentence add: `The flow around the deck — questions deck first, contract at sign-off, acceptance deck at the end — is `.claude/rules/feature-flow.md`.`
- `ROADMAP.md` under `## Features`: `- [ ] \`feature\` \`#workspace\` \`#ui-review\` **Feature flow: questions deck → review rounds → contract → acceptance, with contract-check in close-out** — design \`docs/active/specs/2026-09-01-feature-flow-design.md\`, plan \`docs/active/plans/2026-09-01-feature-flow-plan.md\`. Four assumptions await Destin's veto (design §9). (added 2026-09-01)`

- [ ] **Step 4: Verify the anchors and the rule firing**

Run: `node scripts/audit-anchors.mjs`
Expected: green (the new rule's `verify:` entries resolve).

In a fresh Claude session, Read `worktrees/feature-flow/scripts/ui-review/deck/contract.py` through the Read tool (a shell `touch` or `cat` loads no rule — only Claude's own file tools do), then `tail -3 ~/.claude/instructions-loaded.log` — expect a `feature-flow.md` line (the `**/` glob fires inside the worktree). If no session is at hand, note it in the handoff as unverified.

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/feature-flow.md .claude/skills/ui-mockup/SKILL.md scripts/ui-review/README.md docs/MAP.md CLAUDE.md ROADMAP.md
git commit -m "docs(feature-flow): the rule, the skill's questions-deck and contract steps, MAP and README pointers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CiVWE2jGoEVCkp9bYYtuE2"
```

---

### Task 8: Ask the design's own questions on the first questions deck, then run it once end to end

**Files:**
- Create: `docs/active/design/2026-09-01-feature-flow/feature-flow.questions.json`

- [ ] **Step 1: The design's four assumptions become the first questions deck**

The design (§9) leaves four assumptions for Destin to veto, and Task 1 built exactly the deck meant for that — so it is used here rather than a chat question. Write `feature-flow.questions.json` (`key: feature-flow-questions`, `title: Feature flow — four assumptions`, `themes: ["midnight", "light"]`): four `"words": true` decide steps, `surface: "Feature flow"`, `path: "Design §9"`, ids `Q-1`…`Q-4`, one per §9 question, the design's assumption as the first (recommended) option with its why in `summary`, the alternative second, both in the deck's plain words. Q-1 acceptance deck (keep it / fold human rows into the contract); Q-2 reopen with a default (proceed on a marked default / always stop); Q-3 plan documents only for cross-repo, migration or ordering work (yes / always write one); Q-4 commit answers files (commit / copy beside the contract at sign-off). Validate with `review-cards.py build`.

- [ ] **Step 2: Serve it without opening a window, and do not wait**

```bash
mkdir -p scratch && python3 scripts/ui-review/review-cards.py serve docs/active/design/2026-09-01-feature-flow/feature-flow.questions.json --no-open --timeout 720 > scratch/feature-flow-questions.serve.log 2>&1 &
sleep 2 && rg -n '\[deck\] http' scratch/feature-flow-questions.serve.log
```

Put the printed URL in the final message to Destin. Everything in Tasks 0–7 was built under the design's assumptions; a veto on this deck is the first reopen (design §6) and is acted on by the session that sees the submit. Do NOT open his browser (memory: warn before opening windows).

- [ ] **Step 3: Commit the spec**

```bash
git add docs/active/design/2026-09-01-feature-flow/feature-flow.questions.json
git commit -m "docs(feature-flow): the design's four assumptions as the first questions deck

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CiVWE2jGoEVCkp9bYYtuE2"
```

- [ ] **Step 4: The first real run**

Not a code task. The next small UI feature Destin asks for runs through the whole flow: questions deck → rounds → contract → build → verdicts → acceptance → `close-out.sh`. The handoff for that feature records, from the answers files on disk:

| Number | Where it comes from |
|---|---|
| rounds | count of `<feature>-r*.json` |
| Destin-seconds | sum of `seconds` across every answers file |
| reopen decks | count of one-step decide decks served mid-build |
| rows failed at acceptance | `verdict: fail` rows + human `no` answers |
| what was skipped, what the questions missed | the contract agent's `## Not covered` list, and any row Destin answered `no` |

Then `/wrap-up`. The design doc's `status:` flips to `active` on the first run and `shipped` when the flow has run twice without a chat question standing in for a deck.

---

## Self-review

**Spec coverage.** §2 defect (answers ignored) → Task 0. §3 contract format, who writes it → Tasks 3, 6. §4 gate: three facts, `contract-check`, close-out section, rotation → Tasks 4, 5. §5 questions deck (no picture, one option), note tags → Tasks 1, 2. §6 reopen → rule in Task 7 (the `default` option is an assumption; nothing built until Destin answers Q2 — a `default` field on a words decide step is a one-line addition to `_validate_words` when he does). §7 acceptance → Task 4. §8 plan tier → skill text in Task 7; roadmap loop deferred by design. §10 deferred items have no tasks, by design. Measurement → Task 8.

**Placeholders.** None: every code step carries its code. Task 3 Step 6 (the template) describes values rather than pasting a full JSON — acceptable because the fixture in Step 1 is the worked example, and the template is that fixture with instruction strings.

**Type consistency.** `is_words` / `no_pictures` / `is_contract` / `_validate_options(st, sid, errors, warnings, minimum)` / `_validate_rows(spec, st, sid, errors)` are defined in Task 1/3 and used with those names in crops.py, build.py, contract.py and every test. Deck data keys `words`, `kind`, `yes`, `no`, `rows`, `options` match between build.py and page.js. `answers_for` returns the 3-tuple that `check_contract`, `signoff`, `acceptance_status` and the tests expect; `signoff` / `acceptance_status` return `(bool, str)` and the CLI prefixes them. `note_kind` values `now|later|noting` match page.js, serve.py `NOTE_KIND`, the fixture and the agent prompt.

## Review changes (2026-09-01)

A second session verified the plan against the code before execution. What changed, and why:

- **The gate's third fact was missing.** The design's gate is three facts; the plan checked two. `contract-check` now also reports whether the contract's own answers file is submitted with a `yes`, and whether the acceptance deck was submitted — and `close-out.sh` relays those lines instead of reading JSON itself.
- **Guards now resolve on the branch.** `workspace_root()` from a worktree is the main checkout, so a test the feature adds was "missing" until merge. `guard_exists` also asks git for the file on the contract's `branch`.
- **One name for the verdicts file.** The design and docs said `<feature>.verdicts.json`; the CLI read `<stem>.verdicts.json`. Everything now uses the contract's stem: `<feature>.contract.verdicts.json`.
- **The contract is a words step, not a fourth kind.** `is_words` is true for a `rows` step; the validator and builder branch on `rows` inside the words path. One predicate in the no-pictures rule, the crop skip and the build loop instead of two.
- **`is_contract` keys on the key's presence**, so `rows: []` reaches "a contract with no rows defines nothing".
- **`.gitignore`:** the two lines are deleted, not replaced — `scratch/` was already ignored wholesale. The plan's line numbers were wrong (97–98 → 112–113 on master); every line number is now marked approximate with a text anchor.
- **The arcade dry run stays in `scratch/`.** A contract for a closed-out branch under `docs/` would make close-out report it unsigned forever.
- **Task 8 asks the design's four questions on a questions deck** — the plan's own tool, dogfooded — rather than leaving them in prose.
- The rule-firing check now says to Read the file through Claude's tools; a shell `touch` loads no rule.
