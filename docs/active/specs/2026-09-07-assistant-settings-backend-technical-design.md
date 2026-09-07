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

**Today.** `App.tsx` hands both new-session forms `defaultModel={sessionDefaults.model}` —
a Claude alias string. Each form does `setNewModel(defaultModel || 'sonnet')`, and picks
its runtime from `defaultRuntime()` (the `youcoded-runtime-default` localStorage key,
written only by first-run) and its provider/model pair from `loadLastBinding()`. So a
default model that is not a Claude alias has nowhere to land: picking GPT-5.6 in settings
stores it, and the next new-session form still opens on Claude Code.

**Change.** `App.tsx` also passes `defaultStartModel={sessionDefaults.startModel}` to
`SessionStrip` and `HeaderBar`. Where each form initialises (`setNewModel(defaultModel ||
'sonnet')`, both call sites), it instead resolves the pair:

- `startModel.runtime === 'claude'` → runtime `claude`, alias from `startModel.alias`.
- `startModel.runtime === 'native'` **and** native is supported → runtime `native`,
  binding `{providerId, modelId}`.
- `startModel` absent → today's behaviour exactly, unchanged.
- `startModel.runtime === 'native'` but native is NOT supported (remote access, Android,
  the capability flag off) → fall back to the `model` alias on Claude. **Never open a form
  on a runtime that cannot create a session** — a silently dead Create button is worse
  than ignoring the preference.

`youcoded-runtime-default` and `youcoded-last-binding` keep their jobs and their writers:
`startModel` wins when it is set, those two remain the fallback. In particular **nothing
here writes `youcoded-runtime-default`** — first-run is still its only writer, and the
source-scan test that pins that stays green.

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

## T3 — Android carries the new default (contract R24)

**Today.** Android's `defaults:get` builds its reply field by field —
`skipPermissions`, `model`, `projectFolder`, `permissionOverrides`. Anything else in the
file is **dropped on the way out**, so `startModel` would vanish on Android even though
the desktop wrote it into the shared shape.

**Change.** Carry `startModel` through `defaults:get` and `defaults:set` in
`SessionService.kt` as an opaque JSON object — Android does not interpret it. Android has
no native runtime, so T1's guard already makes a native `startModel` fall back to the
Claude alias there; the value must simply survive the round trip rather than be erased for
every other device that syncs the file.

Android already serves `folders:list` and `dialog:open-folder`, so the folder picker on
the General page works there as drawn. Web search stays hidden on Android, gated on
`native.supported` exactly as the mockup shows.

## Tests — three contract rows are `human` only because nothing checks them yet

The contract records R5, R17, R19 and R24 as `human` because no guard existed at signing
time. Three become `mechanical` with this work:

- **R5** — a stored native `startModel` opens the new-session form on that provider and
  model; a native `startModel` with native unsupported opens on the Claude alias instead.
- **R17** — the migration zeroes every override and writes the marker; a second run with
  the marker present changes nothing.
- **R19** — the confirm button stays disabled until the box is ticked; turning the switch
  off is instant with no popup; Cancel leaves the switch off.

R24 stays `human`: it is an Android build, and this machine's Android tests do not render
the settings panel.

## Not in scope

The five questions no deck ever asked (in-between window widths, whether the attention dot
clears itself, whether each My Account link lands on the right page, existing Always-allowed
entries, the ChatGPT-branch shipping order) are Destin's to answer on a later deck. None of
them blocks this build; T1–T3 do not touch any of them.
