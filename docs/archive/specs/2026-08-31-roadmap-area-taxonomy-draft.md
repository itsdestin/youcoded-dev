---
date: 2026-09-01
status: superseded
superseded_by: docs/active/specs/2026-09-01-roadmap-restructure-design.md
type: spec
---

# Roadmap schema + area taxonomy — draft v6

Revision after two rounds of Destin's review. v2: 18 areas → **13**;
`git` folded into `files`; `dev-tooling` + `docs` + `build-release` merged into
`dev-workspace`; `website` dropped as an area; every area now carries a **decision rule**,
because names don't stop mis-filing — tests do.

Derived from the 76 free-form tags on 258 open items, plus `docs/MAP.md` → **Hot paths**
(Destin's own words per screen) and its **Subsystem** table. Re-tested after the revision:
all 76 tags map, zero orphans, 6 items untagged.

---

## Field 1 — AREA (required, exactly one)

The rule that resolves every overlap: **file by what is broken, not by where you noticed it.**

| Area | Open | File it here when… | Not here when… |
|---|---|---|---|
| `native-harness` | 58 | The app's own agent is doing work — a turn, a tool call, a permission, a cost figure, a specialist | It's about a chat you already had (`chat-data`) or getting a model onto disk (`local-models`) |
| `dev-workspace` | 32 | It's about building the app, not the app — tests, rigs, guidance docs, releases | A normal user could ever see it |
| `android-only` | 25 | It affects **Android alone** — the app's own Kotlin code, its runtime, its terminal | The same bug exists on desktop too → that shared area, with `seen-on: android` |
| `marketplace` | 25 | Plugins/themes: finding, listing, installing, rating, the Worker behind them | It's the theme *rendering* (`themes`) |
| `user-interface` | 24 | Fixing it changes **more than one screen** — shared primitives, chrome, layout, copy standards | It's one screen only → that screen's own area |
| `files` | 20 | Documents the user opens, edits or organises — the files panel, project files, the git surface | It's a workspace guidance doc (`dev-workspace/knowledge`) |
| `sync` | 17 | Moving your stuff between devices, or the GitHub transport under it | — |
| `other-features` | 14 | A real user-facing feature too small for its own area — see sublevels | Its sublevel has grown past ~8 items (then it graduates) |
| `chat-data` | 13 | Everything kept about a chat — the transcript itself plus its title, tags, notes, search index, resume state | The model is running right now (`native-harness`) |
| `themes` | 9 | How the app looks under a theme — engine, editor, a theme rendering wrong anywhere | Installing/browsing themes (`marketplace`) |
| `remote-access` | 9 | Reaching the app from another device — the protocol, the browser client | — |
| `local-models` | 5 | Getting a model onto this machine and serving it — downloads, disk, the engine process | It would break the same way on a cloud model (`native-harness`) |
| `claude-code` | 4 | The Claude Code integration specifically — terminal, PTY, hooks, prerequisites | — |
| `games` | 3 | The arcade — the games themselves, leaderboards, head-to-head, match relay | — |

**`games` is split out despite only 3 open items** because the *subsystem* is large and
self-contained: four games, a registry, a reducer, leaderboards, head-to-head records, arcade
IPC across five surfaces, a PartyKit relay and Worker routes with their own migration. Open
item count is a bad proxy for whether something deserves a name.

**`social` is dissolved.** With `games` gone, what remained — sign-in, presence, announcements,
buddy — was four unrelated small things under a label that described none of them well. They
move to `other-features` sublevels.

### The three boundary tests that do the real work

- **`native-harness` vs `chat-data`** — *is the model working right now, or is this a chat you're going back to?*
- **`native-harness` vs `local-models`** — *would this break the same way on a cloud model?* Yes → `native-harness`.
- **`user-interface` vs a feature area** — *does the fix change more than one screen?* Yes → `user-interface`.
- **`files` vs `dev-workspace`** — *would a normal user ever see this document?* Yes → `files`.

### Sublevels

Added only when an area passes ~20 open items. Below that, sublevels become a filing decision
nobody makes consistently.

**`native-harness` (58)** — `sessions` 20 · `tools` 17 · `permissions` 9 · `cost` 5 · `specialists` 5 · `skills-mcp` 2

**`dev-workspace` (32)** —
| Sublevel | What's in it |
|---|---|
| `dev-workspace/tests` | The test suite, flakes, CI redness |
| `dev-workspace/rigs` | Workbench, UI review sweep, perf lab, harness evaluator |
| `dev-workspace/knowledge` | CLAUDE.md, rules, MAP, this roadmap, `/audit` |
| `dev-workspace/release` | Packaging, versioning, installers, the public site |

**`marketplace` (25)** — `catalog` (ingest + listings) · `backend` (Worker: votes, comments, limits) · `install` (getting it into the app)

**`other-features` (14)** — `accounts` (sign-in, presence, announcements) · `buddy` (the floating
window) · `onboarding` (first run) · `misc` (genuinely uncategorised)

> **The catch-all needs a brake or it becomes the dump.** Rule: when any `other-features`
> sublevel passes **~8 open items**, it graduates to a top-level area of its own. That is the
> same threshold that governs adding sublevels, applied in the other direction, so the
> taxonomy self-corrects instead of rotting toward one giant "misc".

`android-only` (25) and `user-interface` (24) are at the threshold but split badly — an Android bug
is already narrowed by its `surface`, and `user-interface` splits into the same list as `surface`.
Leave both flat; the second field already does the work.

---

## The naming rule (so this doesn't sprawl again)

Two tests, in order. They are why the names below are what they are:

1. **If the app has its own word for it on screen, use that word.** `remote-access` is the
   app's own copy, verbatim ("Remote Access lets you use YouCoded from any phone…"). An area
   named something the app never says is an area agents mis-file into.
   *Exception, applied knowingly:* `chat-data` overrides the app's noun (*conversations*)
   because the area holds more than the conversations themselves — see the rename table.
2. **Otherwise name the job, not the code.** `user-interface` says what belongs there
   ("the UI parts shared across screens"); `ui-system` only said it was a subsystem.

### v3 renames and why

| Was | Now | Why |
|---|---|---|
| `harness` | `native-harness` | Destin's call. Makes it read as the counterpart to `claude-code` instead of a generic word, and merges today's two synonym tags (`#native-runtime` 45, `#harness` 17). |
| `conversations` | `chat-data` | Destin, 2026-09-01. `data` covers the transcript **and** its tags, notes and search index; `history` implied transcripts only, and the bare app noun didn't say the area holds both. |
| `remote` | `remote-access` | The app's own name for the feature, verbatim. |
| `ui-system` | `user-interface` | Says the filing test out loud. "System" described the code; "shared" describes what qualifies. |
| `devworkspace` | `dev-workspace` | Readability only, consistent with the other hyphenated names. |

### Considered and rejected

- **`session-data`** — rejected for the *`session`* half, not the `data` half. "Session" is the
  most overloaded word in the app (the session drawer, the session strip, the "New Session"
  button, every live session), so it points at the live thing — the opposite of what the area
  holds. `chat` is unambiguous where `session` is not.
- **`conversation-history`** — "history" reads as transcripts alone, and this area also holds
  titles, tags, notes and the search index. `data` was chosen deliberately as the broader word
  that covers both (Destin, 2026-09-01).
- **`design-system`** for `user-interface`. Accurate for the primitives, wrong for the window
  chrome, layout and narrow-viewport work that also lives there.

### The weakest remaining name

`other-features` — by design a catch-all. It is kept honest by the ~8-item graduation rule on
its sublevels (above). (`social` was the weakest name in earlier drafts; it is dissolved.)

---

## Field 2 — SURFACE (optional, exactly one)

Where you'd *see* it. Taken verbatim from `docs/MAP.md` → Hot paths, which is already written
in Destin's vocabulary.

`chat` · `input-bar` · `status-bar` · `session-drawer` · `settings` · `model-picker` ·
`files-panel` · `projects` · `marketplace-screen` · `library` · `terminal` · `theme-editor` ·
`buddy-window` · `arcade` · `onboarding` · `window-chrome` · `landing-page` · `none`

`settings` takes sublevels — it's really nine screens: `permissions` · `themes` ·
`local-models` · `sync` · `specialists` · `accounts` · `defaults` · `development`

**Why two fields:** "the cost number in the status bar is wrong" is `native-harness/cost` **and**
`status-bar`. One field forces a choice, and whichever you pick makes the item invisible to
the other search. This is the feature-areas-*and*-UI-areas split.

---

## Field 3 — SEEN-ON (required)

`desktop` · `android` · `remote-access` · `all`

`seen-on` and the `android-only` area are NOT redundant, and the difference is worth stating
because it is the one place two field values look alike:

- `android-only` (area) — the bug lives in Android's own code. Nothing on desktop shares it.
- `seen-on: android` — the code is **shared**, and the phone is just where it shows. The area
  is the shared one (`user-interface`, `sync`, `chat-data`…).

Filing test: *if you fixed this on desktop, would Android still be broken?* Yes → `android-only`.

---

## Field 4 — SOURCE (required)

| Value | Meaning | Treatment |
|---|---|---|
| `destin` | You hit it, in your words | Trusted. A symptom is a fact about a moment. |
| `agent` | An agent found it while doing something else | A **claim**. Verified before a fix is planned. |

The field that makes automated freshness checking possible, because the two kinds decay
completely differently.

---

## Field 5 — STATUS (required) — **new in v2**

The draft had no status vocabulary at all, which is a real gap for something whose main job
is decision and status tracking. "Open vs shipped" is not enough — most of today's 258 items
are open in name only, and it's impossible to tell which.

| Status | Means | Who moves it |
|---|---|---|
| `confirmed` | Destin has said he's still hitting it | Destin |
| `needs-verify` | An agent claimed it; nobody has checked it since | tooling flags it |
| `in-flight` | Someone is working it now — names the branch or worktree | whoever picks it up |
| `blocked` | Waiting on something the item names | — |
| `decision` | Waiting on **Destin**, not on work | Destin |
| `parked` | Real, but deliberately not now | Destin |

`decision` earns its own status: several open items are questions, not work (should `*.tmp`
stop syncing? which GB convention?). Today they sit in the same pile as three-week
engineering jobs, which is exactly why they're never answered. As a status they're a
two-minute list.

---

## Field 6 — LAST-CHECKED (date) — **new in v2**

The date the item was last confirmed true — by Destin for a symptom, by tooling for a claim.
This is the field that makes "am I still hitting that?" a tractable question instead of a
1,442-line reread: the roadmap can surface *only* what hasn't been checked in 60 days.

Today nothing carries this. `(added …)` looks like it should serve, but it records *filing*,
not confirmation — and 248 of 258 open items were filed within 60 days anyway (74 of them on
2026-08-26/27/28 alone), so age separates nothing. (Corrected 2026-09-01: an earlier draft
said the added date gets rewritten on edit; the git history shows only five such changes ever,
three of them the dedupe rule keeping the *older* date.)

---

## Field 7 — FLAGS (zero or more)

`urgent` (blocks core app functionality — not tweaks or tuning) · `needs-repro` ·
`performance` · `security` · `regression`

`performance` and `security` are flags rather than areas: 18 speed items and 4 security items
span eight different areas, so as areas they'd be hidden from the backlogs they actually
belong to. As flags they stay home and are still listable as one set.

---

## What one entry looks like

```
- [ ] Android forgets your skill settings after the first launch — favourites, quick
      chips and overrides all revert to defaults, every launch after the first
      android-only · settings · android · agent · needs-verify · checked 2026-08-28
      → docs/active/investigations/2026-08-28-android-skill-config.md
```

Deliberately two lines of symptom, not one — it has to name the platform, what breaks, and
when, or it's unreadable a month later. The ~320 words of mechanism this entry carries today
move to the linked report, where they can be checked mechanically and where being wrong is
harmless.

---

## Still open for Destin

1. ~~`social`~~ — resolved: dissolved into `other-features` sublevels (v5).
2. **Is `claude-code` the right area name**, given the app embeds Claude Code throughout?
   Alternative: `cc-sessions`.
3. **Do the Someday/ideas items (31 in the section, 38 typed `idea`) keep their real areas** and get filtered by a `parked`
   status? (Recommended — an idea about sync should surface when someone opens the sync
   backlog, not sit in an "ideas" ghetto.)
