---
status: active
date: 2026-09-07
revised: 2026-09-07 (design review 1 — 15 findings, all accepted)
branch: feat/assistant-settings
contract: docs/active/design/2026-09-05-assistant-settings/assistant-settings.contract.json
review: docs/active/reviews/2026-09-07-assistant-settings-design-review-1.md
---

# Assistant settings — backend technical design

The UI is signed (24 rows, 2026-09-07). This is what has to be BUILT for the rows the
mockup could only draw. Everything else on the branch is already real: the panel, its five
pages, the blocks it hosts, the folder picker, both popups, the `wide` dialog size, the
Android mount, and — since design review 1 — the attention dot, which was permanently on
for every Android install and is now fixed and pinned.

**Already true, verified, needing nothing:** `defaults:get`/`defaults:set` in main
(`ipc-handlers.ts:1337-1370`) and in `remote-server.ts` (`:1942-1965`) are generic merges,
so `startModel` already persists and reads back on desktop and over remote access. No new
IPC channel is needed anywhere.

Two things must be built.

## T1 — the default model actually starts the conversation (contract R5)

**The forms are not the problem.** They understand native models completely: a `runtime`
(`SessionStrip.tsx:378`), a provider/model `binding` (`:379`), a derived `modelChoice`
(`:390-394`) and an `applyModelChoice(c: ModelChoice)` setter that already does the right
thing for both runtimes (`:396-404`). Native session creation works.

**The gap is the pipe from Settings.** `App.tsx` passes the saved default as
`defaultModel?: string` — a Claude alias and nothing else. There is no way to say "my
default is GPT-5.6", so each form falls back to `defaultRuntime()` and `loadLastBinding()`.

**Why that hides.** Set your default to the model you were already using and the form opens
on it — from the last-used memory, not your preference. The setting only visibly fails when
the two disagree, which is the case nobody tests.

### The four readers

Design review 1 (R1-1, R1-14) found the first draft named the wrong ones. They are:

1. `SessionStrip.tsx:764` — the post-create reset.
2. `SessionStrip.tsx:2420` — the "+ New Session" menu handler.
3. `App.tsx:3518` — the **Welcome / empty-state form**, the first screen after a relaunch.
   Its setter is `setWelcomeRuntime`. (`HeaderBar` only passes `defaultModel` through; it
   has no form of its own.)
4. `openDevSessionIn` — **explicitly out of scope**: it is a developer entry point with its
   own fixed model, and nothing on the contract covers it.

### The change

`App.tsx` passes `defaultStartModel={sessionDefaults.startModel}` alongside the existing
`defaultModel`. At readers 1–3, when it is present, resolve it through the form's existing
`applyModelChoice` (or the Welcome form's equivalent) instead of calling `setNewModel`
alone — `setNewModel` only moves the Claude alias, so on its own it is a no-op for a native
default (R1-2).

**The post-create reset (reader 1) must re-apply the stored default too** (R1-10), or a
native default lasts exactly one session — the same defect as review R2-3, re-entering
through a different door.

### Three guards, all landing on Claude

`applyModelChoice` is trusted with a good choice; these decide whether the choice is good.
In every case the form opens on the `model` alias under Claude Code, because **a form must
never open on a runtime that cannot create a session** — a dead Create button is worse than
an ignored preference.

- Native chosen, native not supported here (remote access, Android, capability flag off).
- The stored provider no longer exists (the user deleted it).
- The stored model has left the catalog. `useNativeBinding` otherwise substitutes a
  different provider/model silently (R1-7).

### The existing source-scan test constrains how, not whether

`desktop/tests/runtime-default.test.tsx` test **(f)** pins, by regex, the
`useState<Runtime>(() => defaultRuntime())` initialiser in **both** files this touches, and
forbids a literal `setRuntime('claude')` / `setWelcomeRuntime('claude')` within 600 chars of
**every** form close (R1-3, verified directly). So:

- The initialisers stay exactly as they are. `startModel` is applied **after** them, never
  in place of them.
- The Claude fallback goes through `applyModelChoice({ runtime: 'claude', alias })`, never
  a literal `setRuntime('claude')` near a close block.
- `youcoded-runtime-default` keeps its single writer: first-run. Nothing here writes it.

`preload.ts`'s `defaults` signature and `App.tsx:478`'s inferred `sessionDefaults` shape
both need the `startModel` field or the build will not compile (R1-13).

## T2 — the old protection overrides switch themselves off (contract R17)

**Today.** `defaults:get` merges the stored `permissionOverrides` and pushes them into
main's live permission cache. The switches are gone from the UI, so anyone who turned one
on keeps it on with nothing to see or undo it. Destin chose the reset (R2-5, option a).

**Where it runs.** The first draft said "at startup, where the defaults are first loaded".
**No such load exists** — `setPermissionOverrides` is called only inside the two handlers,
and the comment at `main.ts:399` claiming otherwise is stale (R1-4). So this build adds an
explicit migration call in main, placed **before `remoteServer.start()` (`main.ts:1708`)**,
which is itself before `registerIpcHandlers` (`:1790`). Nothing can answer a defaults
request until it has run, and a read-modify-write cannot be interleaved with one.

**How it runs.** Read the defaults file; if `permissionOverridesClearedAt` is absent, write
every override `false`, write the marker as an ISO date, save. Idempotent by construction —
it can never run twice, and a user with no stored overrides is unaffected either way.

**It must not touch Destin's live file.** `run-dev.sh` isolates ports and `userData` but
**not `~/.claude`** (R1-8), so an unguarded migration would perform the real, one-time,
marker-setting rewrite of his live defaults the first time any dev build launched — and
then never again, on his real install, before this ever shipped. The migration is therefore
gated to a packaged non-dev run and is a no-op in a dev instance.

Android has its own copy of the file and its own override sync; that half is deferred with
T3 below.

## T3 — Android — DEFERRED (Destin, 2026-09-07)

Filed in `docs/roadmap/android-only.md`. The row and panel are already mounted in
`AndroidSettings`, which is what contract row R24 states; what is deferred is only carrying
`startModel` through Android's `defaults:get`, which copies four named fields and drops the
rest (`SessionService.kt:1885-1890`).

The first draft justified this as data loss across devices. That was wrong twice (R1-9):
the phone keeps its own file (`.claude-mobile/youcoded-defaults.json`), nothing syncs it,
and Android's `defaults:set` merges key by key so it **preserves** fields it does not know
(`:1919-1921`). Only the read side filters. So the whole cost is what the phone's row
displays — and the phone has no runtime that could use a cross-provider default anyway.

## Tests — added, but no signed row is downgraded

The contract records R5, R17, R19 and R24 as `checkedBy: "human"`. The first draft proposed
flipping three to `mechanical`. **It does not** (R1-12): the acceptance deck asks Destin a
yes/no only for `human` rows, so flipping R5 would mean he is never asked "does the model I
chose actually start my conversation?" — the whole feature — because a unit test said yes.
Every one of R1-1, R1-2, R1-6, R1-7 and R1-10 is a case a narrow test passes while the
promise fails. A signed artifact is not edited to make a build look finished.

The guards are added anyway, as guards:

- A stored native `startModel` opens each of the three forms on that provider and model;
  with native unsupported, a deleted provider, or a model gone from the catalog, each opens
  on the Claude alias.
- The post-create reset re-applies the stored default rather than dropping to the remembered
  runtime.
- The migration zeroes every override and writes the marker; a second run changes nothing;
  a dev run does nothing at all.
- The skip-permissions confirmation: the button stays disabled until the box is ticked,
  turning off is instant with no popup, Cancel leaves the switch off.

## Filed, not built here

- **The settings picker offers native models over remote access that the remote client's own
  form will refuse** (R1-6). T1's fallback stops the dead Create button, but what the picker
  *offers* is an approved surface, so narrowing it is Destin's call, not a silent change.
  It joins the five questions no deck has asked.
- **A second window keeps the old default until its own Settings panel is opened and closed**
  (R1-11).
- **`remote-server.ts`'s `defaults:set` neither deep-merges `permissionOverrides` nor
  refreshes main's enforcement cache, and its `DEFAULTS_INITIAL` omits the field** (R1-15).
  Latent today because nothing writes overrides any more; it should not stay latent.
