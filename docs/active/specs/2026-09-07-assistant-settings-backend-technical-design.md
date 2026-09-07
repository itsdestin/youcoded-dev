---
status: active
date: 2026-09-07
revised: 2026-09-07 (design reviews 1, 2 and 3 — 34 findings, all accepted; round 3 is the cap)
branch: feat/assistant-settings
contract: docs/active/design/2026-09-05-assistant-settings/assistant-settings.contract.json
review: docs/active/reviews/2026-09-07-assistant-settings-design-review-1.md
review2: docs/active/reviews/2026-09-07-assistant-settings-design-review-2.md
review3: docs/active/reviews/2026-09-07-assistant-settings-design-review-3.md
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

### Nothing is overridden — an unusable choice leaves the picker empty

**Destin, 2026-09-07, replacing every earlier version of this section:** "nothing should be
overridden. if users select an openrouter/claude code/chatgpt plan model, they should get
that. if the provider is unavailable, the model selector should just start empty."

The rule is one line: **the stored choice is applied as chosen, whatever provider it names.
If it cannot be resolved, nothing is selected.** No fallback to Claude, no substitution of a
neighbouring model, no silent repair.

That includes the Claude direction. Picking Fable via Claude Code gives Fable via Claude
Code, engine included — which also settles design review 3's R3-4, whose fix (never let a
Claude default move the runtime) broke the ordinary case to protect an unusual one.

It deletes the three guards two earlier revisions of this document argued about. Every one
of them chose a model on the user's behalf, which is the thing that must not happen. What
replaces them:

| The stored default | What the form does |
|---|---|
| resolves — provider ready, model in its catalog | opens on it, engine included |
| names a provider that is gone or not ready | opens with **nothing selected** |
| names a model that has left the catalog | opens with **nothing selected** |
| is native, on a device with no native runtime (remote, Android) | opens with **nothing selected** |

"Nothing selected" is a state the form already understands: `effectiveBinding` is null and
the Create button is already gated on it (`SessionStrip.tsx:747`). The user picks and
continues. The failure is visible and one click from fixed, which is the point — an empty
selector tells the truth; a substituted model does not.

R3-4's underlying observation stays true and is filed where it belongs: **the picker offers
Claude Code models on an install with no Claude login**, so someone can choose one and land
on an engine they cannot sign in to. The backend must not answer that by discarding their
choice. What the picker should OFFER is a design question and it is Destin's —
`OPEN-QUESTIONS.md`, question 7.

### The same rule applies to the last-used model, not just the stored default

`useNativeBinding` substitutes silently today: an unready provider falls to
`readyProviders[0]`, an unknown model to `providerModels[0]`
(`RuntimeBinding.tsx:204-219`). A previous revision proposed suppressing that only where a
stored default failed, leaving it in place for the last-used binding — two behaviours for
one situation, decided by how the model happened to get there.

**Destin, 2026-09-07: "we should fix this too."** So the rule is unconditional. Whenever a
binding cannot be resolved — stored default or last-used memory — the form starts with
nothing selected.

Concretely, the two fallbacks become empty rather than first-available:

- `selectedProviderId`: `readyProviders[0]?.id ?? ''` → `''` when the named provider is not
  ready. It still falls to the first ready provider when there is no binding at all, which
  is a first run with nothing to honour, not a substitution.
- `selectedModelId`: `providerModels[0]?.id ?? ''` → `''` when the named model is not in the
  catalog, with the same exception for no binding at all.

`effectiveBinding` is then null and Create stays gated (`SessionStrip.tsx:747`), which is
the behaviour the form already has for "no model chosen yet".

**This is wider than the Assistant settings feature** — it changes the new-session form for
people who never open the panel, so it is called out here rather than buried: it is a
deliberate, requested behaviour change, and it needs its own before/after on the acceptance
deck so Destin sees the empty state he asked for.

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
- It requires that a form-close tail **still contains** `setter(defaultRuntime())`, and it
  measures a **600-character window** in which comments are blanked rather than removed —
  `SessionStrip`'s create tail has only 262 characters of headroom (design review 3, R3-8).
  A long WHY comment placed above the pinned reset turns the guard red with a message about
  something else entirely, so the WHY for this change goes above the function, not inside
  that window. This
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

**The stored label must not outlive the choice** (design review 3, R3-5). `startModelLabel`
— added this round so the Settings row can name a native default without a catalog lookup —
is a snapshot taken at pick time and never rechecked. Meanwhile guards 2 and 3 quietly send
the forms back to Claude when the provider is gone. Without this, the row would keep saying
"ChatGPT · GPT-5.6" confidently about a provider that no longer exists, while every new
conversation actually started on Claude. So: **when the panel opens and its picker has
loaded, an invalid stored choice clears both `startModel` and `startModelLabel`** — the row
falls back to the Claude alias, which is what is really happening. Self-healing, one write,
and only where the data to judge it already exists.

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
when `app.isPackaged`.

**No environment opt-in.** A previous revision offered `YOUCODED_MIGRATE_DEFAULTS=1` as a
way to try the migration in a dev instance. Design review 3 (R3-1) caught that this
reopens R1-8 exactly: the defaults path is `os.homedir()`-based, dev does not isolate
`~/.claude`, so the "verification" would perform the real, one-way, marker-setting rewrite
of Destin's live settings. The opt-in is gone.

**How R17 is verified instead:** against a COPY. The function takes its path as a
parameter, so the unit test drives it on a temp file, and a manual check points it at a
copy of a real defaults file — never at `~/.claude`. R17 stays a `human` contract row and
is answered on a real install at acceptance.

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
