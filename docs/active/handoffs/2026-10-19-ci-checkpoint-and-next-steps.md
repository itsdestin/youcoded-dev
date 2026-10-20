---
status: active
---
# CI optimization checkpoint and next steps

## Shipped checkpoint

Merged on 2026-10-19:

- **App [PR646](https://github.com/itsdestin/youcoded/pull/646)** → `ba8374dc7e8f0599999a72cda85eeeb16e77e358`.
- **Workspace [PR279](https://github.com/itsdestin/youcoded-dev/pull/279)** → `e9fcc896be9154f6e4b070b081b7b98e844cbfd8`.

The merged app tree exactly equals the accepted full-platform integration tree `0b11a234379b582e7578df56dbde664764de4b09`. Final candidate head was `da640ef359427304329c9a8506f633e2378d1348`; tested integration `4bd7aa268e99820b60c3f69e2ee4d1c721c4b9d6` combined it with master `5fa56a2ee6b94b6980cbb478dc7f65ee60e526fc`.

**A useful checkpoint is shipped. The broader five-minute goal is only partly achieved:** one fresh-source warm Linux + Android PR completed in4m41. Five-minute cold/default/full-platform CI is not established. Destin chose to stop new optimization, stabilize and merge, then hand further work to another session.

## What changed

- One full-app orchestrator requires the selected desktop checks **and Android** before its stable `build (ubuntu-latest)` check can succeed. A failed, cancelled, missing or unexpected skipped result cannot produce a green full-route gate.
- Conservative complete-NUL change classification, immutable checkout identity and current-config unfiltered Vitest discovery. Evidence requires exact disjoint selected file unions and valid report totals/statuses; no frozen file/case counts, historical source hashes or previous-run acceptance receipts.
- PR test matrix: Linux4 shards. Master/scheduled/manual-all matrix: Linux4, Windows6, macOS4. OS semantic checks run once per selected OS, not once per shard.
- Production desktop preparation runs once. Verified zstd/TAR transfer feeds four independent AppImage/deb/rpm/pacman builders; validation checks current payload bytes, modes, links and metadata.
- Eligible ordinary TS/TSX source-only PRs use faster CI compression. Packaging-sensitive, unknown and full events exercise defaults. Existing release/test-build compression and signing remain unchanged. Custom/inherited/implicit builder presets are protected; parser capsules use the actual locked builder parser, verified against the consumer's current lock SRI.
- Android JVM, debug APK and real R8 APK lanes run independently. All three JVM variants execute without task caching. Modeled APK compilation can use Gradle's cache, while custom native/web/backend producers remain current and noncacheable. Serial/default source preflight, source collection, licenses, pins and original Claude Code bytes remain protected.
- Stabilized fixture shutdown, path handling, serializer allocation and temporary Git maintenance without raising CPU budgets, reducing fixtures/checkpoints/assertions or adding platform skips.
- Fixed genuine hidden-chat work discovered during full-platform testing: shared spinner subscriptions, kept approval polling and plan-menu polling/subscriptions now honor existing on-screen context and refresh when shown. The spinner palette no longer addresses an undefined fifth colour. Visible animation cadence and layout are unchanged; fake animation timers and performance now advance together so hidden work is measured deterministically.
- Saved comment journeys explicitly wait for relevant visible-chat scroll/geometry stability. Cosmetic/hidden descendant mutations do not postpone readiness; observation is bounded and cleaned up. Production context-menu dismissal behavior is unchanged.

## What was proven

| Evidence | Trigger → last selected check | Interpretation |
|---|---:|---|
| [39301529656](https://github.com/itsdestin/youcoded/actions/runs/39301529656) | **7m03 /423s** | Ordinary changing-source Linux + Android, compiled-cold APK tasks; support/dependency caches available.34.53 observed raw runner-minutes. |
| [39303013808](https://github.com/itsdestin/youcoded/actions/runs/39303013808) | **4m41 /281s** | Fresh-source warm ordinary Linux + Android route; Debug20/R8 22 actual task-cache hits.29.47 raw runner-minutes. |
| [39334485370](https://github.com/itsdestin/youcoded/actions/runs/39334485370) | **7m31 /451s** | Final PR correctness, including workflow-sensitive default packaging;33.58 raw runner-minutes. Not an uncontended benchmark. |
| [39335085314](https://github.com/itsdestin/youcoded/actions/runs/39335085314) | **8m18 /498s** | Final exact integration: all14 platform shards, default four-format packaging and Android;86.30 raw runner-minutes. Correctness run overlapped PR validation, not a clean speed sample. |

These are actual GitHub trigger/job timestamps, not watcher duration, rounded billing or an individual arm's runtime. Earlier incident-period results are not clean benchmark samples.

Additional correctness evidence:

- Four cold/warm APK download hashes matched their own current CI records; all four APK signatures verified. Complete nested payload audit found no missing/added paths. Every difference was independently accounted for: the exact changed source-documentation line in compiled backend JS, plus R8 metadata matching each actual tested revision. All executable JS bytes otherwise agreed. Nested archives compare path/type/content/size/mode/link targets, not timestamp/ownership envelopes; signing receipts are excluded only after signature verification.
- [39304987937](https://github.com/itsdestin/youcoded/actions/runs/39304987937): changed Kotlin input forced both actual Kotlin compiler tasks to execute while other eligible tasks hit cache; custom producers were fresh, current identities agreed and the full required gate passed.
- [39304576867](https://github.com/itsdestin/youcoded/actions/runs/39304576867): captured actually executing jobs before a superseding push, then confirmed the old run cancelled and its required gate did not falsely succeed.
- Intentional assertion failure in run39278965702 caused actual tests and required gate failure. Incorrect assertion was restored; no bad probe assertion was merged.
- Final local `scripts/verify.sh` passed types, related tests/source guards, knip, lints, invariants, screen checks and all saved journeys. The final small hidden-work batch passed108 focused cases; observer runner tests58/58 and journeys8/8 passed during stabilization. Independent broad CI and focused follow-up reviews were clear. Secret scans passed on published candidate history and exact patches.

## Remaining work worth doing next

**No known failing checkpoint test is being deferred.** The following are optional next optimization/measurement work, not unfinished gates for the merged checkpoint. They remain under umbrella work item **#29**, which also contains unrelated release/build work and must not be closed for this checkpoint alone.

1. **Repeat ordinary warm/cold measurements on current master without self-created contention.** Run at least a few changing-source candidates, report queue/setup/transfer/upload/gate tails, raw runner-minutes and cache outcomes. The4m41 result is a demonstrated sample, not a reliable five-minute SLA. Distinguish compiled-cold from all-caches-cold; do not erase shared caches to manufacture a benchmark.
2. **Optimize the default compression path only if measurement justifies it.** Default RPM/pacman packaging remains expensive; fast source-only PR codecs do not prove identical default-codec coverage. Release/signing/default compression changes are separate decisions, not authorized by the earlier benchmark work.
3. **Reduce full-platform long tails without dropping tests.** Before final fixes, measured Windows shard1 included95s semantic checks plus245s tests; macOS shard1 included44s semantic checks plus344s tests. Those are historical observations, not immutable costs. Profile fresh distributions before changing sharding/sequencing; account for setup duplication and runner concurrency instead of assuming more shards are free.
4. **Source collection is preserved, not five-minute optimized.** The serial/default preflight path and independent producer-ancestry proof remain; no claim that source/archive collection has the warm PR latency.
5. **Reconcile earlier workspace CI fast-path work separately.** Workspace PR272 (`session/29-ci-fastpaths`) was an earlier whole-graph/card-only candidate, not part of PR279 or app646. Do not merge it merely because the app checkpoint shipped. Inspect its current diff and evidence before deciding whether any unique work remains valuable.

No paid runner upgrade, protection change, app release, signing/notarization change or production-state change was part of this checkpoint.

## Start points for a new session

- App workflows: `.github/workflows/desktop-ci.yml`, `.github/workflows/android-ci.yml`.
- Policy/completion: `scripts/ci-policy.mjs`, `ci-android-policy.mjs` and tests.
- Discovery/evidence: `scripts/ci-desktop.mjs`, `ci-evidence.mjs`, `ci-inputs.mjs` and tests.
- Packaging/encoder proof: `scripts/ci-linux.mjs` and its actual-builder tests.
- APK task outcomes: `scripts/ci-gradle-outcomes.mjs`; custom producer ancestry: `scripts/ci-android-producers.gradle`.
- Native run-local reuse: `app/runtime/native-cache.py`, `build-runtime.sh` and tests.
- Workspace readiness operation: `scripts/shoot/driver.mjs`, its behavioral tests and README.

Historical experiment PRs635/637/641/642/644 are superseded by app646, not a merge queue. PR647 is the disposable ordinary-source/Kotlin-input experiment; its source comments and numeric-version fixture are not product implementation to merge wholesale. Validation branches named `session/29-final-ci-*` contain tested synthetic PR merges, not new product features.

Detailed local evidence, if still retained, lives under the session's ignored `scratch/` and `/tmp/full-ci-*`; it is supplemental and may be removed during cleanup. The GitHub run links, merged source and pinning tests above are the durable starting points. Do not make future acceptance depend on those old local receipts.
