<!-- first run of the 2026-09-04 feature flow's code reviewer (scripts/ui-review/code-reviewer.md), on a pre-flow branch: data for the 'measure after three features' roadmap item -->

> **Triage (implementing session, 2026-09-04): F1 accepted (blocker) · F2 accepted · F3 accepted · F4 accepted (covered by the F1 fix). Fix: youcoded 047eba65. Follow-on filed on docs/roadmap/local-models.md (the count is read before the model loads). Merged 2026-09-05.**

# Code review — fix/engine-slot-count-field (commit 984b3410)

Repo: /home/destin/youcoded-dev/worktrees/engine-slot-field (youcoded), diffed against origin/master. Five files touched: engine-manager.ts, capability-profile.ts (comments only), probe-tools.mjs, engine-manager-slot-count.test.ts, docs/engine-dependencies.md.

## verify.sh

```
verify: /home/destin/youcoded-dev/worktrees/engine-slot-field (base master)
  tests: related to 4 changed file(s) + 34 source-scanning guards
PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)
OK — all checks passed.   Not covered: Android (./gradlew test), marketplace worker.
```

## How I confirmed the engine facts

No llama-server was running (pgrep). I started the pinned dev binary (`~/.config/youcoded-dev/engine/b10665-vulkan/llama-b10665/llama-server`) myself on scratch ports 18999/18998 with the app's EXACT spawn shape from engine-supervisor.ts:309 (`--jinja --models-dir <scratch dir with one symlinked GGUF> --models-max 2 --sleep-idle-seconds 300 -c 16384`, plus `-ngl 0` to stay off the GPU), against `Qwen3.5-2B-Q8_0`, then killed it by pid. Script and raw logs: this scratchpad, `probe.sh`, `probe-18999.log`, `probe-18998.log`.

## Findings

- F1 — desktop/src/main/engine/engine-manager.ts:454 — `GET /props?model=<id>` is not a status read on b10665: it AUTOLOADS the named model and blocks until the load finishes, so every place that awaits `effectiveContextWindow` (via `contextAndSlotsFor`, ipc-handlers.ts:2382 → native-session-host.ts `resolveContextAndProfile`, called from `create` :2749, `createChild` :2848, `resumeSpecialist` :864, `resume` :3204, `setBinding` :3908) now loads a model into RAM/VRAM before the user has sent anything — resuming an old local-model conversation, or swapping the picker to a local model, pays the full load (seconds to tens of seconds, with NO timeout: engine-manager.ts has no `AbortSignal` on this fetch), and with `--models-max 2` that load can evict the LRU model a live conversation is mid-way through using. The old model-less `/props` returned instantly and loading happened on the first send. The branch's own text claims the opposite three times: engine-manager.ts:471 ("answers `n_ctx: 0` whenever the named model is not currently resident"), engine-manager-slot-count.test.ts:196–199 ("a not-yet-loaded model can still get this shape"), docs/engine-dependencies.md:26–27 ("or a model not yet resident"). — Confirmed by probe: bare `/props` → `{"role":"router","models_autoload":true,…,"n_ctx":0}`; `GET /models` before → `status.value: "unloaded"`; one `GET /props?model=Qwen3.5-2B-Q8_0` returned 200 with the full loaded body (`total_slots: 4`, `n_ctx: 16384`) and `GET /models` immediately after → `status.value: "loaded"`, before any chat call. `llama-server --help` on the same binary: `--models-autoload … (default: enabled)`; the supervisor passes no `--no-models-autoload`.

- F2 — desktop/src/main/engine/engine-manager.ts:449–451 and :491–493, docs/engine-dependencies.md:30 and :195, desktop/test-engine/probe-tools.mjs:17–18 — the WHY comments and doc state as fact that with `?model=` the reported `n_ctx` is "the PER-SLOT window (`-c` / slots)"; under the app's actual spawn shape it is the FULL `-c`, because with no `--parallel` the slot count is auto and b10665 then defaults `--kv-unified` ON (`--help`: "enabled if number of slots is auto"), so the code's behaviour is unchanged from before (16384 reported, not 4096) and the new contract statement is false. This matters beyond wording: docs/engine-dependencies.md § "Parallel slots" (:333–354) discusses adding `--parallel 4` explicitly; the moment anyone does, kv-unified turns off and every local session's context window silently drops to `-c`/4 while EngineCard's knob (EngineCard.tsx:54) still shows the full `-c` — the exact "gauge and threshold disagree" split the native-runtime rule's ONE-number principle forbids, with no test pinning the parity. — Confirmed by two probe runs: app shape → server log `n_slots = 4, n_ctx_slot = 16384, kv_unified = 'true'`, `/props?model=` `default_generation_settings.n_ctx = 16384`; same args + `--parallel 4` → `n_ctx_slot = 4096, kv_unified = 'false'`, `n_ctx = 4096`.

- F3 — desktop/tests/engine-manager-slot-count.test.ts:133–135 — the fixture `{ n_ctx: 4096, total_slots: 4 }` with `contextSize: 16_384` is labelled "The exact b10665 router-mode answer … with `-c 16384 --parallel 4`", i.e. it was measured with a flag the supervisor never passes (engine-supervisor.ts:296–309 has no `--parallel`); the test passes because the code just echoes whatever number arrives, but it pins the app to a response shape it never sees and its assertion text ("NOT the -c we passed … that is the TOTAL shared across all slots") is wrong for the shipped spawn. — Confirmed by F2's probe pair plus reading the spawn args.

- F4 — desktop/src/main/engine/engine-manager.ts:454 — a model that is sleeping (`--sleep-idle-seconds 300`, `status.value: "sleeping"`) is probably WOKEN by this GET for the same autoload reason as F1, so resuming/opening a conversation on a model that had gone to sleep pays a wake before any send; the response body carries an `is_sleeping` key the code ignores. — Not measured (would need a 5-minute idle wait); inferred from `models_autoload: true` and the `is_sleeping` key in the probe's key list. [PLAUSIBLE]

## Checked and found fine

- URL-encoding: `GET /props?model=odd%20model%26id` → 400 `model 'odd model&id' not found` — the router decodes the id correctly, and the test at :150–159 pins the encoding.
- Unknown / not-yet-rescanned model: 400 with a JSON `{"error":…}` body; `res.json()` parses it, `loadedRaw` and the slot field are undefined → configured `-c` and `totalSlots: null`, no throw, and no `?reload=1` is sent (the engine rule forbids polling with it). `res.ok` is never checked, which is what makes this work — by accident rather than design, but correct.
- `total_slots ?? n_slots` precedence, `0`/absent → null: covered by the updated tests; `n_slots` is genuinely absent on b10665 (`'n_slots': None` in the probe).
- Callers depending on the old behaviour: `effectiveContextWindow` has exactly one production caller (ipc-handlers.ts:2382); everything else is test stubs (`rg -n effectiveContextWindow` repo-wide). No Android or remote-shim path reads `/props` (repo-wide `rg "/props"` hits desktop only).
- Dead/duplicate code: knip green; `resolveSlotCount` is the single slot parser; the stale `n_slots` name survives only in the intended fallback and its comments.

## Not covered

- F4's sleeping-model wake (needs a 5-minute idle), and how long `/props?model=` blocks for a multi-GB model on Vulkan (I loaded a 2 GB Q8 on CPU only).
- Whether NativeSessionHost's ref-count (`retainModel` in `wire()`, native-session-host.ts:2710) is taken late enough that a model autoloaded by F1 during `resolveContextAndProfile` can be unloaded by another session's `releaseModel` before `wire()` runs — I read the order but did not trace the concurrent case.
- Android and the marketplace worker (verify.sh does not cover them; nothing in the diff touches them).

One line on the design: reading the slot count off `/props?model=` is the right source, but if the load side-effect (F1) is unwanted, the same numbers are available without loading anything — `total_slots` is a spawn-shape constant, and the model-less `/props` still answers instantly — so the fix may want a `/models`-status check before naming the model.
