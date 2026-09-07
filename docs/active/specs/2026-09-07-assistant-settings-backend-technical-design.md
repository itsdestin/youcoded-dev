---
status: active
date: 2026-09-07
revised: 2026-09-07 (design reviews 1 and 2 — 26 findings, all accepted)
branch: feat/assistant-settings
contract: docs/active/design/2026-09-05-assistant-settings/assistant-settings.contract.json
review: docs/active/reviews/2026-09-07-assistant-settings-design-review-1.md
review2: docs/active/reviews/2026-09-07-assistant-settings-design-review-2.md
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
4. `openDevSessionIn` (`dev-tools.ts:684-712`) — **out of scope, on honest grounds**: it
   does read the user's stored default (the first draft wrongly said it has a fixed model —
   design review 2, R2-7), but it is a developer entry point that no contract row covers,
   and it creates a Claude session regardless. It will keep using the `model` alias.

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

In every case below the form opens on the `model` alias under Claude Code, because **a form
must never open on a runtime that cannot create a session** — a dead Create button is worse
than an ignored preference.

1. Native chosen, native not supported here (remote access, Android, capability flag off).
2. The stored provider no longer exists, or is not ready.
3. The stored model has left that provider's catalog.

**Guards 2 and 3 cannot be answered where the first draft put them** (design review 2,
R2-1). `useNativeBinding` fetches the provider list and catalog only when
`runtime === 'native' && active` (`RuntimeBinding.tsx:190-202`), so asking "does this
provider still exist?" before switching to native is circular: the answer arrives only
after the switch the guard is meant to veto. Worse, the existing resolution silently
substitutes the first ready provider and its first model (`:205-220`), so a stale default
does not fail loudly — it quietly starts a different model than the one chosen.

**So the fetch condition changes, not the guard.** `useNativeBinding` also loads when there
is a native `startModel` to validate, regardless of the current runtime:

```
if (!nativeSupported || !active) return;
if (runtime !== 'native' && !pendingStartModel) return;
```

The form then applies the stored choice once the lists have arrived, and applies it only if
the provider is ready and the model is in its catalog (or the provider is an
openai-compatible endpoint with no catalog, where a freeform id is legitimate). Until then
the form stays exactly where it is today — on the remembered runtime — so there is no flash
of a native form that then reverts.

**A freeform id on an openai-compatible provider passes guard 3 by design**, matching
`needsFreeformModel` at `RuntimeBinding.tsx:212`.

### The existing source-scan test constrains how, not whether

`desktop/tests/runtime-default.test.tsx` test **(f)** is stricter than the first draft
said (design review 2, R2-2). All of it:

- It pins by regex the `useState<Runtime>(() => defaultRuntime())` initialiser in **both**
  files. Those stay exactly as they are; `startModel` is applied after them, never instead.
- It caps the **whole file** at one literal `setRuntime('claude')` /
  `setWelcomeRuntime('claude')`, and that one is already spent
  (`SessionStrip.tsx:399`, `App.tsx:444`, both inside `applyModelChoice`). So the Claude
  fallback must route through `applyModelChoice({ runtime: 'claude', alias })` — a second
  literal anywhere fails the guard.
- It requires that a form-close tail **still contains** `setter(defaultRuntime())`. This
  collides head-on with R1-10's post-create reset, so the order is fixed: reset to
  `defaultRuntime()` first, exactly as today, **then** apply the stored default on top. The
  guard stays green and the default still survives the create.

`youcoded-runtime-default` keeps its single writer: first-run. Nothing here writes it.

`App.tsx:478`'s inferred `sessionDefaults` state shape needs the new fields or the build
will not compile. `preload.ts`'s `defaults` annotation is not imported by the renderer, so
it does not break the build — but it is updated anyway, because a lying type is a trap for
the next reader (design review 2, R2-8).

**A behaviour change worth stating** (R2-9): once a default is stored it beats the
last-used-model memory on every form open. That is the point of the feature, and it is also
the first time `loadLastBinding()` stops being the last word — someone who habitually ends
on one model and set a different default will notice.

`HeaderBar` needs three small edits to thread the new prop through to `SessionStrip`
(R2-10); it has no form of its own.

## T2 — the old protection overrides switch themselves off (contract R17)

**Today.** `defaults:get` merges the stored `permissionOverrides` and pushes them into
main's live permission cache. The switches are gone from the UI, so anyone who turned one
on keeps it on with nothing to see or undo it. Destin chose the reset (R2-5, option a).

**Where it runs.** The first draft said "at startup, where the defaults are first loaded".
**No such load exists** — `setPermissionOverrides` is called only inside the two handlers,
and the comment at `main.ts:399` claiming otherwise is stale (R1-4). This build adds an
explicit call in main, placed **before `remoteServer.start()` (`main.ts:1708`)**, itself
before `registerIpcHandlers` (`:1790`). Nothing can answer a defaults request until it has
run, and a read-modify-write cannot be interleaved with one. (Design review 2 confirmed
`app.whenReady()` is resolved at that point and that `fs`/`path`/`os` are already imported
there.)

**How it is written, so it can be tested.** A pure exported function —
`migratePermissionOverrides(defaultsPath): 'migrated' | 'already-done' | 'skipped'` — in its
own module, not inline in `main.ts`. No test in the 622-file suite imports `main.ts` and
none can (`app.whenReady()` runs at module scope), so a migration written inline is a
migration that cannot be tested at all (design review 2, R2-4). Taking the path as a
parameter also lets the test drive it against a temp file.

It reads the file; if `permissionOverridesClearedAt` is absent it writes every override
`false`, writes the marker as an ISO date, and saves. Idempotent by construction.

**It must not touch Destin's live file.** `run-dev.sh` isolates ports and `userData` but
**not `~/.claude`** (R1-8), so an unguarded migration would perform the real, one-time,
marker-setting rewrite of his live defaults the first time any dev build launched — and
then never again, on his real install, before this shipped. Main therefore calls it only
when `app.isPackaged`, or when `YOUCODED_MIGRATE_DEFAULTS=1` is set explicitly, which
`run-dev.sh` never sets.

**The honest cost of that gate** (R2-4): R17 cannot be demonstrated in an ordinary dev
instance. It stays a `human` contract row and is checked on a real install at acceptance,
or in a dev instance launched deliberately with the opt-in. The alternative — letting dev
builds migrate — trades a testing convenience for the risk of silently rewriting his live
settings, which is not a trade worth making.

**Android is not covered by this and does not inherit it** (design review 2, R2-5). The
phone keeps its own copy of the file and enforces the same overrides
(`SessionService.kt:1890`, `:1901`, `:1930` → `ManagedSession.kt:235`), so after the desktop
resets them a phone can still be running with them on, and has no screen to turn them off.
Filed in `docs/roadmap/android-only.md` as its own item rather than implied by T3's
deferral.

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

## Filed, not built here — with the file names

Design review 2 (R2-6) was right that the previous version of this section filed nothing.
These now exist independently of this document, which is archived at merge:

- `docs/roadmap/remote-access.md` — the settings picker offers native models over remote
  access that the browser cannot run, so a default chosen there does nothing (R1-6). T1's
  fallback stops the dead Create button; narrowing what the picker *offers* would change an
  approved surface, so it is Destin's call.
- `docs/roadmap/user-interface.md` — a second window keeps the old default until its own
  Settings panel is opened and closed (R1-11).
- `docs/roadmap/remote-access.md` — `remote-server.ts`'s `defaults:set` neither deep-merges
  `permissionOverrides` nor refreshes main's enforcement cache (R1-15). Latent today.
- `docs/roadmap/android-only.md` — two items: the dropped `startModel` on the phone's
  settings reply (T3), and Android still enforcing the overrides the desktop resets (R2-5).
- `docs/active/design/2026-09-05-assistant-settings/OPEN-QUESTIONS.md` — the five questions
  no deck has asked, plus the remote-picker question above.
