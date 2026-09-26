---
date: 2026-09-22
status: superseded
type: handoff
topic: Minimalist chrome style — what Destin asked for, what is built, and where the last session lost him
superseded_by: docs/archive/handoffs/2026-09-24-appearance-panel-START-HERE.md
---

# Minimalist chrome — START HERE

## Read this first: why this handoff exists

A session worked this for three review rounds and never converged. Destin's verdict on the
session: **"you're fucking this up."** Round 3's deck was built and served but is
**unanswered** and should probably be scrapped. The code is in decent shape; the *process*
went wrong. Both are recorded below so a new session does not repeat the loop.

**Update, 2026-09-23 — supersedes the header treatment below.** Destin clarified that
his rejection was of the **full-width veil**, not individual button surfaces: "i'm
fine with the buttons having background of some sort. i want them to visible
appear to rise out of the background." He picked the **soft cushion** among three
local glass treatments (`minimalist-chrome.header-lenses.answers.json`) and said
"chat/terminal toggle loocks broken though. and the outer container of the
session switcher should match the buttons i think." The correction puts the
cushion on the toggle's outer shell (not its buttons, which obscured the moving
highlight), matches the session switcher's outer shell, and removes the veil.
The next iteration removed Terminal clipping but had a stretched gradient
that formed a bright beam through the 530px session switcher, and a mint-tinted
Chat/Terminal selection; Destin's next feedback: "much closer" but those two
looked janky (`minimalist-chrome.softened-header.answers.json`). A subsequent
version puts the long switcher's low-opacity backing on its own feathered
pseudo-layer and makes the toggle's sliding selection neutral. Destin approved
that structure and asked to remove all gradient/colour from the header controls
(`minimalist-chrome.glass-structure.answers.json`). The current worktree applies
transparent local blur to the buttons, session strip and selection. Destin's
verdict on that version: "this is good," but the header controls and status dots
need more visibility/glow, and the selected session should be more transparent.
The first contrast experiment forced theme foreground on buttons and put a
canvas-coloured rim around each dot; Destin rejected it: "the white
backround/outline around the status dots is too stark, and the black on the
buttons is very jarring/ugly" (`minimalist-chrome.header-emphasis.answers.json`).
He approved a restrained replacement: original control/label colours with a
low-opacity same-colour halo, semantic dot glows WITHOUT rings, and the
26%-opaque selected pill. This remains the uncommitted production-style state,
NOT an approved final design. The restrained version was then rejected as
"not visible enough against the background". A three-option deck with faint
cushions, colored glyphs and sculpted edges did not address the underlying
issue: theme tokens are checked against panel/canvas averages, not the real
wallpaper under a control. Meadow Mist's fg-2 is about 2.6:1 over the header's
blue pixels; gray status is about 1:1. Destin asked for a shared treatment for
other wallpaper-exposed surfaces. A subsequent single stronger local-panel
prototype was not selected: he asked for more different/unique designs.
`minimalist-chrome.distinct-choice.json` offered THREE distinct visual
prototypes: light wallpaper-aware ink, compact icon backlights, and rectangular
raised keys. Destin picked **wallpaper-aware ink as a direction**, but said the
status dots were wrong (idle too bright, red/green too dull) and icons too white.
He asked to see tuning in many existing themes. An isolated screenshot-only
prototype at `wallpaper-ink-tuner.js` now samples the real header crop, derives
icon tint from theme tokens, preserves saturated semantic hues, holds animated
status opacity above 80%, and keeps idle gray subdued. Six image-wallpaper themes
were captured before/after in `minimalist-chrome.ink-tuning.json` (review pending).
On Meadow Mist, the measured icon sample is 3.19:1, green/red dots ~3.1:1, idle
2.12:1; these are source-image estimates, **not a runtime guarantee**. This is
NOT production code or final visual approval. Gradient/pattern backgrounds and
window changes need their own strategy before implementation. Do not treat the
older "no panel at all" wording or unanswered round-3 deck as the current design.

**Update, 2026-09-23 — visual approval became app behavior.** Destin answered
`minimalist-chrome.ink-tuning.answers.json` yes/yes, then signed the two-row
`minimalist-chrome.ink-tuning.contract.json`. The pure solver and browser hook
(`youcoded/desktop/src/renderer/themes/wallpaper-header-ink.ts` and
`hooks/use-wallpaper-header-ink.ts`) now sample each *image-wallpaper* control
and status dot separately in cushion/float chrome; local CSS vars leave flat,
gradient and other styles untouched. Mixed-color Golden Sunbreak forced per-control
AND per-dot derivation; do not regress to a single header/strip average. Active
status breathing bottoms at 80% unless Reduced Effects or the OS motion setting
stops it; idle remains dark/slate, not bright white. Source-image math does not
model partial wallpaper opacity, overlaid patterns or blur; this is a visual
estimate, not a guaranteed pixel contrast. Desktop `verify.sh` passed; Android
Gradle tests were up-to-date with XML results of 281 tests, zero failures in
each of three variants. Isolated Workbench captures: 6/6 image themes at
1440×900, 3/3 flat/gradient themes without ink overrides, and Golden Sunbreak
at 1280×800 with 12 tinted controls / 11 tinted dots. The before/after built
review is `minimalist-chrome.ink-built-review.json`; visual and acceptance
reviews remain pending. Do not claim this is shipped or accepted.

**The work is unshipped and uncommitted.** Worktree:
`/home/destin/youcoded-dev/worktrees/sessions/theme-minimal-chrome`
Session key (reuse it): `theme-minimal-chrome`

---

## 1. EARLIER FEEDBACK — verbatim; the 2026-09-23 update above governs the header.

**Original ask** (2026-07-19, restated 2026-09-01 — see
`docs/active/investigations/2026-09-01-chrome-style-bare.md`):

> keep the bare minimum elements — session switcher, header icons, status chips, input area —
> **"with no backgrounds and no wrapping chrome"**

> elements that **"rise/pop out of the canvas, like a sign being pushed through melted glass
> or seran wrap"**

**Round 1 review** (2026-09-20, answers in `minimalist-chrome.review.answers.json`):

> R-1: yes — **"but the raising doesn't look as smooth as i want. i want the individual
> controls to kinda fade into the background magically lmao"**
> R-2: yes — **"we may need to give them a blur/glass effect in this theme type. the glow also
> looks a little odd in the new style."**

**Round 2 review** (2026-09-21, answers in `minimalist-chrome.review-2.answers.json`) —
**this is the one that matters most:**

> R-1: **other** — **"these indiviual buttons still have an obvious ass panel behind them. the
> point of this new theme style is to remove the panel, so all of the individual buttons
> appear to be floating directly over the wallpaper and each individual button appears to
> blend into or rise out of the wallpaper behind it in some fashion"**
> R-2 (message box + chips): **yes** — approved, keep as is.
> C-1 (edge on content surfaces): **pick `bordered`** — "A thin edge", the 1px outline.

### The decisions Destin has actually made (do not re-open these)

| Decision | Value | Source |
|---|---|---|
| Kit/theme name | **Minimalist** | Destin typed it |
| Manifest value | `chrome-style: "float"` | chosen by the session (not `minimal`, which already means something in `input-style`/`header-style`) |
| Pop **every** header control | yes, over "only pills/chips" and "leave header bare" | round 1 |
| Header controls: **no surface at all** | yes — no fill, no border, no blur | round 2 R-1 |
| Content surfaces (field, chips, status chips, session pill): **keep a soft surface** | yes | round 2 R-2 |
| Content surface edge | **`bordered`** (1px `--edge`) | round 2 C-1 |
| Veil behind header | 4 variants built; **`solid` (97% + 14px fade) is the default** | round 1, deck `minimalist-chrome.veil.json` — never answered, default stands |

### The rule that came out of round 2, in one line

**A CONTROL gets no surface. A SURFACE keeps one.** The header buttons are controls; the
message box, quick chips, status chips and session pill are surfaces.

---

## 2. WHAT IS BUILT (all working, none committed)

All paths below are inside
`worktrees/sessions/theme-minimal-chrome/youcoded/`.

| File | State | What it does |
|---|---|---|
| `desktop/src/renderer/styles/float-chrome.css` | **new, 310 lines** | the whole mode. Wrappers lose their surface; content pops gain one; **header controls get NO surface** (glyph + `text-shadow` only); 4 veil variants. |
| `desktop/src/renderer/themes/theme-engine.ts` | modified | injects the literal-radius `backdrop-filter` for content pops (must be injected — see §4a); reads `?chrome=`, `?veil=`, `?pop=` in workbench only. |
| `desktop/src/renderer/themes/theme-types.ts` | modified | `ChromeStyle` gains `'float'`. |
| `desktop/src/renderer/workbench-mode.ts` | modified | `workbenchChromeStyle()`, `workbenchVeil()`, `workbenchPop()` — dev-only URL knobs, `null` in production. |
| `desktop/src/renderer/styles/globals.css` | modified | imports the new file; `float` `chrome-glass` override; line budget 2921 → 2941. |
| `desktop/src/renderer/components/QuickChips.tsx` | modified | adds the `quick-chip` class marker (Tailwind cannot express "the chip"). |
| `desktop/tests/float-chrome-pops.test.ts` | **new, 158 lines** | 9 tests pinning the glass selectors, the neutral shadow, and **that the header must NOT be frosted**. |
| `desktop/line-budgets.json` | modified | globals.css → 2941. |

**Also edited, in the SHARED `wecoded-marketplace` checkout** — **uncommitted and NOT on a
branch**, so these 5 files have no version history:
`wecoded-themes-plugin/skills/theme-builder/` → `theme-preview.css` (Minimalist mirror),
`scripts/kit-presets.json` (the `float` preset named **Minimalist**),
`scripts/manifest-template.jsonc`, `scripts/sync-check.cjs`, `SKILL.md`.
A new session must decide whether to preserve these into a proper branch before anything
else touches that checkout. They are not covered by `verify.sh`.

### Verified

- `bash scripts/verify.sh <worktree>` → **all checks pass** (types, tests, knip, lint,
  ast-grep). Android and the marketplace worker are NOT covered by it.
- Glass measured on Meadow Mist: `blur(22px) saturate(1.2)`, fill `58%`, on the field, chips,
  status chips and session pill.
- Midnight: no blur (correct — nothing behind a solid theme), neutral `rgba(0,0,0,0.16)` shadow.
- Header controls measured `rgba(0,0,0,0)` fill and border — **the panel is genuinely gone.**
- Hover on a header control: 7% `--fg` wash, glyph to full contrast (`state-layer` idiom).

### NOT verified

- The header change has **never been reviewed by Destin.** Round 3 exists for exactly that and
  is unanswered.
- Android (`./gradlew test`) — not run.
- Real dev instance (`run-dev.sh`) — only the workbench was used.

---

## 3. WHERE THE DECKS AND ANSWERS LIVE

`worktrees/sessions/theme-minimal-chrome/docs/archive/design/2026-09-20-minimalist-chrome/`

| Deck | Ran | Destin answered? |
|---|---|---|
| `minimalist-chrome.review.json` | round 1 (2026-09-20) | **yes** — both approved, with the two notes in §1 |
| `minimalist-chrome.veil.json` | veil strength, 4 options | **no** — default `solid` stands |
| `minimalist-chrome.review-2.json` | round 2 (2026-09-21) | **yes** — R-1 rejected, R-2 + C-1 approved |
| `minimalist-chrome.review-3.json` | round 3 (2026-09-22) | **NO — unanswered. Probably scrap it.** |

Shot runs: `runs/after` (round-1 state), `runs/r2`, `runs/r3/shots-main`.
Each deck's `*.answers.json` is beside it and is the durable record.

---

## 4. TWO REAL BUGS THAT WERE FOUND AND FIXED (keep these)

**(a) The glass never worked at all.** The first round's blur rule was gated on
`[data-panels-blur]` — an attribute **nothing in the renderer has set since the
glassmorphism refactor.** theme-engine writes `--panels-blur` as a *custom property* and gates
on `[data-wallpaper]`. So the rule matched nothing on any theme and every pop shipped with no
glass, while the CSS read as if it had some. Rewritten into the engine's injected block,
pinned by `float-chrome-pops.test.ts`.

**Why it must be injected in theme-engine and not written in the CSS file:** a
`backdrop-filter` needs a LITERAL px radius. Chromium does not repaint
`backdrop-filter: blur(var(--x))` when `--x` changes.

**(b) The "odd glow" was a real colour bug.** The shadow was tinted `var(--edge)` — which is a
**border** token. On Midnight, `--edge` (`#343A41`) is *lighter* than `--canvas` (`#0D1117`),
so every control wore a grey halo on the app's darkest theme. Now neutral
`rgba(0,0,0,calc(var(--shadow-strength)*N))`, the house shadow.

**(c) The guard was blind, and that was caught.** The first version of the "header must not be
frosted" test **passed while the panel was still present** — it split the CSS on `{` and
looked for `.header-bar`, but a selector *list* is one chunk, so a header selector added back
sat in a chunk that also contained the content pops. Rewritten to split **per selector**;
proven by putting the panel back and watching it go red, then green.

---

## 5. HOW TO SEE IT (do this before building any deck)

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/theme-minimal-chrome
nohup bash scripts/run-workbench.sh theme-minimal-chrome > /tmp/wb.log 2>&1 &   # serves :5233
```

Then, in the workbench (`?mode=workbench&child=1&scenario=default`), add:

| Param | Values | Effect |
|---|---|---|
| `chrome=float` | `float` | turns the mode on (the whole reason these knobs exist is that a community theme's `chrome-style` is a file Destin installed — a review cannot rewrite it) |
| `veil=` | `light` `medium` `solid` `panel` | header band strength; `solid` ships |
| `pop=` | `bordered` `soft` | edge on content surfaces; `bordered` is Destin's pick and ships |

**Theme switching:** put `theme=<slug>` in the URL — **it is honoured only on the
`view=live` route** (`&view=live&child=1`). On the plain workbench it is silently ignored, and
setting `data-theme` from a script does not work either, because the theme engine writes its
tokens as inline custom properties on `<html>` and re-applies them. Meadow Mist is the theme
that matters: it is the wallpaper pack, and it is the one Destin reviews on both times.

---

## 6. WHAT IS ACTUALLY OPEN

1. **Does the header now satisfy him?** This is the only substantive question. The change
   matches his round-2 wording literally (fill and border both measure transparent), but he
   has not seen it. Show him *that*, not a re-litigation of the mode.
2. **Hover/press on a borderless control** — a judgement call the session made alone: the
   app's `.state-layer` wash (7%/13% of `--fg`). Defensible and measured, but never shown to him.
3. **`soft` vs `bordered`** — settled (`bordered`), recorded in the CSS, `soft` kept as a
   recorded alternative. Do not re-ask.
4. **Veil** — 4 variants were built and never answered; `solid` ships. Do not re-ask unless he
   raises it.
5. **Kit integration** — the marketplace `wecoded-marketplace` edits are unverified and in a
   SHARED checkout.

---

## 7. PROCESS FAILURES — do not repeat these

1. **Three decks, no convergence, and he never approved "the thing."** Round 1 showed crops
   next to *other elements*; the header treatment itself kept being the thing that was wrong.
   **Before building any deck, look at the header at 1:1 in Meadow Mist yourself** and ask
   whether a control has a surface. If it does, that is the bug — fix it before showing him.
2. **A UI review deck is not the place to discover the design.** Both rejections were about a
   principle ("no panel; floating over the wallpaper"), which a picture-diff deck cannot
   settle. If the principle is unclear, ask him in **words** (a questions deck or plain chat)
   and then show one picture of the result.
3. **An element-level flip-flop is a signal to stop and ask.** The header treatment changed
   4 times (flat → panel+glass → panel+nothing → nothing). That oscillation should have
   triggered a direct question, not another round.
4. `pkill -f "review-cards.py serve"` **killed the session's own shell twice** (the pattern
   matched the bash command line). Identify exact PIDs instead.
5. `pkill`/`find /` style broad commands: avoid. `find /` ran for 2 minutes for nothing.

---

## 8. STARTING THE NEW SESSION

Reuse the session key so the worktree resumes:

```bash
node scripts/workspace-start.mjs --session theme-minimal-chrome
```

Then, in order:

1. Read §1 above (Destin's verbatim guidance) — that is the spec.
2. Start the workbench (§5) and **look at the header in Meadow Mist at 1:1.**
3. Decide honestly: does a header control show a panel? `measured: fill and border both
   `rgba(0,0,0,0)`` says no.
4. If it looks right, show him **one** picture of the header before/after — round-1 state
   (`runs/after`) vs now (`runs/r3`). Both are 1440x900 shots named `home.png`. Crop
   `1440x110+0+0`. Do not build a new three-page deck.
5. Do not re-ask anything in the tables in §1.
6. `bash scripts/verify.sh` before claiming done; Android is unverified.
7. Nothing is committed. Destin decides when it ships.
