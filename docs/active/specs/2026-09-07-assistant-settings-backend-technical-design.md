---
status: draft
date: 2026-09-07
branch: feat/assistant-settings
contract: docs/active/design/2026-09-05-assistant-settings/assistant-settings.contract.json
---

# Assistant settings — backend technical design

The UI is signed (24 rows, 2026-09-07). This is what has to be BUILT for the rows the
mockup could only draw. Everything not listed here is already real on the branch: the
panel, its five pages, the blocks it hosts, the folder picker, the two popups, the
`wide` dialog size, the Android row's mount.

`defaults:set` in main and in `remote-server.ts` are generic merges, so **`startModel`
already persists and reads back on desktop and over remote access.** No new channel is
needed anywhere. Three things are genuinely missing.

## T1 — the default model actually starts the conversation (contract R5)

**Correction (Destin, 2026-09-07).** An earlier draft of this section said the new-session
forms only understand Claude's aliases. That is false, and the correction makes the job
smaller. The forms understand native models completely: they hold a `runtime`
(`SessionStrip.tsx:378`), a provider/model `binding` (`:379`), a derived `modelChoice` for
the unified picker (`:390-394`), and an `applyModelChoice(c: ModelChoice)` setter that
already does the right thing for BOTH runtimes (`:396-404`). Native session creation works.

**The real gap is the pipe from Settings to the form, not the form.** `App.tsx` passes the
saved default as `defaultModel?: string` — a Claude alias and nothing else — and the two
places that apply it call `setNewModel(defaultModel || 'sonnet')` (`SessionStrip.tsx:764`,
`:2420`; the welcome form's equivalent is `App.tsx:3518`). There is no way to say "my
default is GPT-5.6", so the form falls back to `defaultRuntime()` (the
`youcoded-runtime-default` key) and `loadLastBinding()` (the last binding actually used).

**Why this is worth care rather than a quick patch.** Those fallbacks make the bug hide.
Someone who was last using GPT-5.6 and then sets GPT-5.6 as their default sees the form
open on GPT-5.6 and concludes the setting works — it was the last-used memory. The setting
only visibly fails when the two disagree, which is exactly the case nobody tests.

**Change.** `App.tsx` passes `defaultStartModel={sessionDefaults.startModel}` to
`SessionStrip` and `HeaderBar`. At each of the three points that currently apply
`defaultModel`, when `defaultStartModel` is present, call the existing `applyModelChoice`
with it instead of `setNewModel`. No new resolution logic in the form — the setter that
handles both runtimes is already there.

One guard on top of `applyModelChoice`: if the stored choice is native and native is NOT
supported here (remote access, Android, the capability flag off), fall back to the `model`
alias on Claude. **Never open a form on a runtime that cannot create a session** — a dead
Create button is worse than ignoring the preference. The same guard covers a stored choice
whose provider the user has since deleted, or whose model has left the catalog: the picker
resolves nothing, so the form must land on Claude rather than on a blank binding.

`youcoded-runtime-default` and `youcoded-last-binding` keep their jobs and their writers:
`startModel` wins when set, those two remain the fallback. **Nothing here writes
`youcoded-runtime-default`** — first-run stays its only writer, and the source-scan test
pinning that stays green.

## T2 — the old protection overrides switch themselves off (contract R17)

**Today.** `defaults:get` merges the stored `permissionOverrides` over the defaults and
pushes them into main's live permission cache via `setPermissionOverrides`. The switches
that set them are gone from the UI, so anyone who ever turned one on keeps it on with
nothing to see or undo it. Destin chose the reset (round 2, R2-5, option a).

**Change.** A one-time migration in main, keyed by a marker written into the same defaults
file (`permissionOverridesClearedAt`, an ISO date). When the marker is absent: write every
override `false`, write the marker, then carry on. Idempotent — it can never run twice, and
a user who has no stored overrides is unaffected either way.

**It runs at startup, where the defaults are first loaded for the hook cache — not lazily
inside the `defaults:get` handler.** `remote-server.ts` reads the same file with its own
handler, so a lazy migration could be beaten to the file by a remote client and serve the
old values once. Running it before either handler can answer removes the race.

Android keeps its own copy of this file (`.claude-mobile/youcoded-defaults.json`) and its
own override sync, so it needs the same migration in `SessionService.kt`.

## T3 — Android carries the new default (contract R24) — DEFERRED

**Destin, 2026-09-07: skip the Android focus for now.** Deferred, not dropped: filed as
`docs/roadmap/android-only.md`. What is deferred is only the round trip below; the
Assistant settings row and panel are already mounted in `AndroidSettings`, which is what
contract row R24 states.

**Correcting this document.** An earlier draft of this section said `startModel` would be
"erased for every other device that syncs the file". That is wrong, and the correction
narrows the risk to almost nothing:

- The phone keeps its own file (`.claude-mobile/youcoded-defaults.json`,
  `SessionService.kt:1883`), not the desktop's `~/.claude/youcoded-defaults.json`. The two
  are never the same file, so nothing the phone does can reach a desktop value.
- Android's `defaults:set` merges the whole payload key by key and writes it back
  (`SessionService.kt:1919-1921`), so it **preserves keys it does not know about**. Only
  `defaults:get` filters, and it filters on the way OUT (`SessionService.kt:1885-1890`).

So the whole consequence of deferring is: on the phone, the panel shows the legacy Claude
alias rather than a cross-provider default. The phone has no native runtime, so that alias
is the only default it could act on anyway. Nothing is lost and nothing is corrupted.

When it is picked up, the change is one line each way in `SessionService.kt` — carry
`startModel` through `defaults:get` as an opaque object — plus the same one-time override
migration as T2, against the phone's own copy of the file.

## Tests — three contract rows are `human` only because nothing checks them yet

The contract records R5, R17, R19 and R24 as `human` because no guard existed at signing
time. Three become `mechanical` with this work:

- **R5** — a stored native `startModel` opens the new-session form on that provider and
  model; a native `startModel` with native unsupported opens on the Claude alias instead.
- **R17** — the migration zeroes every override and writes the marker; a second run with
  the marker present changes nothing. Desktop only while T3 is deferred.
- **R19** — the confirm button stays disabled until the box is ticked; turning the switch
  off is instant with no popup; Cancel leaves the switch off.

R24 stays `human`: it is an Android build, and this machine's Android tests do not render
the settings panel. With T3 deferred it is unchanged from what the branch already does —
the row and panel are mounted; only the cross-provider default does not reach the phone.

## Not in scope

The five questions no deck ever asked (in-between window widths, whether the attention dot
clears itself, whether each My Account link lands on the right page, existing Always-allowed
entries, the ChatGPT-branch shipping order) are Destin's to answer on a later deck. None of
them blocks this build; T1 and T2 do not touch any of them.
