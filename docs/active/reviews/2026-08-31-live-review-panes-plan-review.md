---
status: draft
created: 2026-08-31
reviews: docs/active/plans/2026-08-31-live-review-panes-plan.md
tags: [ui-review, deck, workbench, review]
---

# Review — Live Review Panes plan

Every claim below was checked against the code. The command that backs it is named.

## A. Would break on the first run

### A-1 · A live step never sets `__deckReady`, so every deck test hangs
`deck/page.js` `layout()` opens with
`const img = $('#inner img, #inner video'); if (!img) return;` — and the ONLY place
`window.__deckReady = true` is set is the bottom of `layout()`.
`tests/deck-render.test.mjs:49,67` polls that flag for 10 s before giving up.

B5.3 says a live step "returns before the natural-size maths". Implemented literally,
every live case in B8 fails on a timeout with no useful message. The live branch must set
`document.body.dataset.layout = 'live'` **and** `window.__deckReady = true` before it
returns. One line, but it is the difference between B8 passing and B8 being unusable.

### A-2 · A live-only deck crashes before any live code runs
B2.1 makes `images` and `runs` optional. Two call sites read `spec['images']`
unconditionally, both *outside* the per-step loop B3 patches:

- `deck/crops.py` `crop_images()` line 1: `out_dir = os.path.join(spec['_base'], spec['images'])`
- `deck/spec.py` `_images_folder_warning(spec, warnings)`, called at the end of `validate()`

So B2's own stated test — *"a live-only deck with no `images`/`runs` validating clean"* —
raises `KeyError: 'images'`. B3's `continue` inside the loop does not help. Both functions
need an early return when no step needs a picture.

### A-3 · `workbench-boot-check.mjs` is in the wrong repo
A7 is filed under **Part A — `youcoded`**. The file only exists in `youcoded-dev`:

```
$ find . -name 'workbench-boot-check.mjs' -not -path '*/node_modules/*'
./scripts/workbench-boot-check.mjs
./worktrees/retrieval-repair/scripts/workbench-boot-check.mjs
```

The route change is in `youcoded`; the guard that proves it mounts is in `youcoded-dev`.
That makes A7 a Part B item and breaks the plan's "neither half needs the other" claim —
the boot guard genuinely is serial. Say so rather than discovering it at A8.

### A-4 · `test_boxes` needs ImageMagick
B9 scopes the CI step to *"the suites that need no external binary — `test_spec`,
`test_boxes`, `test_tokens`"*. `tests/test_boxes.py` shells out to `magick` four times
(lines 23, 24, 36, 41). Including it makes the new CI step red on its first run.
`test_spec` and `test_tokens` are clean. Both of those also call `workspace_root()`, which
needs `wecoded-themes/themes` on disk — the workflow's clone step already provides it.

## B. Claims that do not survive measurement

### B-1 · "the two `.test.mjs` files"
There are three: `coverage.test.mjs`, `deck-render.test.mjs`, `shot-measure.test.mjs`.
The spec repeats the same undercount. The *conclusion* — nothing invokes any of them — is
correct; I re-ran the search. But B9's wiring silently leaves two Node suites unwired and
never says so.

### B-2 · Which candidate ids are actually reused
The plan and the spec both say *"`labelled`, `one-line` and `inline` each already appear in
more than one round of one surface."* Parsed out of `registry.tsx`:

| Surface | Rounds | Ids reused across rounds |
|---|---|---|
| `close-prompt-body` | 10 | `labelled`, `one-line` |
| `permissions-mode-control` | 3 | — |
| `full-auto-ask` | 4 | — |
| `bash-grant-width` | 3 | — |
| `chatsearch-results` | 2 | — |
| `chatsearch-present` | 8 | — |

`inline` appears twice, but in **two different surfaces** (`close-prompt-body:4489`,
`bash-grant-width:4807`) — which the `surface` parameter already disambiguates, so it is
not evidence for `round`. The argument for requiring `round` still holds on `labelled` and
`one-line`; the sentence just overstates it, and it is destined for a WHY comment that will
outlive the session.

### B-3 · "Four copies of it today"
B2.3 extracts an assumed-common preamble into `_common(...)`. The four validators are not
symmetric:

- `_validate_clip(spec, st, sid, errors)` takes **no `warnings` argument** and performs
  neither the `themes`-shape check nor the `risk` word-count warning.
- The duplicate-id check lives in `validate()` itself, not in any validator.
- `measured` is checked per-step in two of them, per-option/per-variant in the others.

So it is three copies of the themes/risk half, four of the headline/banned-word half. More
importantly, routing `_validate_clip` through `_common` **adds validation clip steps do not
have today** — a 60-word risk on a clip step starts warning. That may be a fine outcome, but
the plan presents it as a no-op refactor.

### B-4 · `youcoded-dev` does have a worktree convention
The branch table says *"worked in place (workspace repo, no worktree convention)"*.

```
$ git worktree list
/home/destin/youcoded-dev                            686f6cf [master]
/home/destin/youcoded-dev/worktrees/retrieval-repair a349843 [docs/workspace-retrieval-repair]
```

`git status` on the workspace also shows five modified files and a dozen untracked ones
from other sessions. Part B touches seven shared files. Working it in place is the exact
setup that produced the two standing rules about not clobbering other sessions' files.

### B-5 · The setup snippet's paths are wrong after `cd`
```bash
cd youcoded && git fetch origin
git worktree add ../worktrees/live-route -b feat/live-candidate-route origin/master
cp -al youcoded/desktop/node_modules worktrees/live-route/desktop/node_modules
```
Line 3 runs with the working directory already inside `youcoded/`. It should be
`cp -al desktop/node_modules ../worktrees/live-route/desktop/node_modules`.

## C. Omitted

### C-1 · The pop-out link is missing entirely
The spec gives it a named section (*"Pop-out — every pane carries an **open on its own**
link"*) and a row in its own testing table (*"the pane addresses the builder emits … and the
pop-out links"*). The plan's B4 pane dict is
`{'id','label','summary','measured','risk','url'}` and B5's `media()` renders an iframe and
nothing else. Nothing anywhere builds the link. **This is the one thing to add.**

### C-2 · `paneWidth` has no default in the live route
The spec: *"Pane width is the surface's `paneWidth` from the registry (360px when the surface
does not declare one)."* `CompareView.tsx` does exactly that:
`style={{ width: surface.paneWidth ?? 360 }}`. A4 passes `width={surface.paneWidth}` raw, so
a surface without a declared width renders unbounded inside its iframe. Use `?? 360` in both
places, and read the same default in B2.5's fit warning.

### C-3 · The height message cannot say which pane it came from
B5.1 puts `data-pane="<id>"` on the iframe; A4.4 posts `{ type, height }` with no id. With
two to four panes the deck cannot route the message. Either match
`event.source === iframe.contentWindow`, or put the candidate id in the payload. Also: A4.5
carefully pins the origin of messages the *route* accepts and B5 pins nothing on the messages
the *deck* accepts — make it symmetric.

### C-4 · The iframe swallows the keyboard
`page.js` binds `keydown` on `document`. Once a click lands inside a pane, focus is in the
iframe's document and arrow-key navigation, `l` (loupe) and `+`/`-` stop reaching the deck
until Destin clicks back onto the page chrome. On a step whose entire purpose is clicking and
dragging inside the pane, that is the normal case, not the edge case. It needs either a
visible hint or a click-outside/focus handler — but above all it needs to be a known
consequence rather than a surprise on review day.

### C-5 · The spec's stated payoff is not in the plan
The spec closes with *"Consequence for the session-strip review in flight"* — re-author that
review as live pick-one steps. Part C authors a throwaway surface instead, and the plan never
mentions the real one. Either scope it in or say explicitly that it is the next session's job.
(Also: the throwaway surface in C-1 lands in `registry.tsx`, whose header says rounds are
never deleted. Say it must not be merged.)

## D. Overthought

- **A2's pinning test.** It asserts a property of *authored content* — that some surface still
  reuses a candidate id. The plan already concedes the round parameter stays either way, so the
  test can only ever produce a false alarm when someone tidies `close-prompt-body`. The WHY
  comment is the right home for this; the test is not.
- **B5.5's magnifier work.** The loupe handler already searches `$$('#inner img')` and hides
  itself when it finds none — it is inert on a live step today. Only hiding `#zoom` is new.
- **B2.3's `_common` refactor.** It is a rewrite of three shipping validators in service of a
  fifth, and it changes clip-step behaviour (B-3). Defer it, or land it as its own commit with
  the behaviour change stated.

## E. The one thing to subtract — A5

A5 edits `src/renderer/state/theme-context.tsx`, which is the app's real theme system on every
surface, in service of a dev-only tool. It brings a new test and its own row in the plan's
Risks table. It is avoidable.

`theme-context.tsx:171` is exactly:
```ts
const [activeSlug, setActiveSlug] = useState(() => getStored(STORAGE_KEY, DEFAULT_THEME));
```
and `getStored` reads `localStorage`. So the live route's mount branch in `index.tsx` can win
that initialiser with no change to any shipping file:

```tsx
if (__view === 'live') {
  const t = new URLSearchParams(location.search).get('theme');
  if (t) { try { localStorage.setItem('youcoded-theme', t); } catch {} }   // wins ThemeProvider's initialiser
  …
}
```

Same first-paint correctness, no production edit, no new test, one fewer risk row.
Two things to state rather than discover:
- It persists on that origin, so the last theme a pane used becomes the default for other
  workbench tabs on port 5513. Dev-only, and it matches the "stored value" fallback the plan
  already relies on, but it should be a comment.
- The mock's `appearance.get()` returning `null` is still load-bearing either way. Verified
  today at `mock-shim.ts:1261`.

Worth noting what A5 would have shipped: `?theme=` read in the app's own theme initialiser is
inert in Electron (no query string) but **live on the remote-web surface**, where URLs are
real. That is a small unintended reach for a dev feature.

## F. Smaller notes

- **Ports check out.** `run-dev.sh:47` = 50, `run-workbench.sh:40` = 60,
  `record-pair.sh:13` = 300. `LIVE_OFFSET = 340` → 5513, clear of all three, and clear of the
  sweep's shard ports (`30000 + offset + idx`).
- **B8's stub-server port.** The fixture "overrides `live.offset` to that port", but
  `live_base` is `5173 + offset`. It works arithmetically for an ephemeral port, but it is a
  trap. Let `live` accept an explicit `base` (or `port`) that `live_base` prefers, and keep
  `offset` as the thing `serve.py` hands to `run-workbench.sh`.
- **B7 step 5.** `serve()` returns 3 for an already-served spec *before* its `try/finally`.
  Put the workbench boot after that check so the finally always covers what it started.
- **File watching on.** The right call, and the plan defends it well. One cost worth naming:
  a long-lived Vite watcher on top of the other dev servers is what exhausted this machine's
  inotify budget before. Not a blocker — just don't leave it running after Submit.
- **A1 is clean.** `CompareView.tsx:39` holds `Frame`, rendering `panel` / `inset` / bare
  exactly as described, used at one call site. Verbatim extraction is safe.
- **A6 is clean.** `index.tsx:259-265` is the `view === 'compare'` branch with both providers,
  in the `isChild` block at line 240. The plan's snippet matches it.

## G. Verdict

The design is sound and the plan is unusually well-evidenced for its size. Nothing here
challenges the shape of the work. What it needs before execution:

1. Fix A-1 through A-4 — each one stops the plan's own tests from running.
2. Add the pop-out link (C-1). It is in the spec, it is in the spec's test table, and it is
   nowhere in the plan.
3. Drop A5 for the four-line `localStorage` write in the route's mount branch (E).
4. Correct B-1/B-2/B-3 before they become commit messages and WHY comments.
5. Decide out loud whether Part B runs in a worktree (B-4) and whether the session-strip
   re-author is in scope (C-5).
