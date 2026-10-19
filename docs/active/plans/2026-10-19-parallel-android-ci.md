---
status: active
---
# Parallel Android CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow the checklist and report real red/green evidence.

**Goal:** Shorten the measured full-app critical path by running all JVM tests, debug assembly and fresh R8 assembly independently, without dropping any selected work.

**Architecture:** Keep the same reusable Android workflow, but use a JVM job and a two-variant APK matrix, then an always-evaluated Android completion job. Each producer binds output hashes to the current checkout identity; completion verifies exact selected status and the three current scope records. The standalone collect_sources path retains the existing complete serial default producer graph and source/archive behavior. First trial adds no Gradle build-cache change, so scheduling effects are measurable separately.

**Tech Stack:** GitHub Actions, Node built-ins, Gradle/AGP, existing current-input helpers.

## Global Constraints

- Existing parent orchestrator and required build (ubuntu-latest) still require the entire reusable Android result.
- All three JVM variants, debug APK, real R8 releaseTest APK, both APK uploads and Python redistribution fixtures remain selected.
- Production/release/source-collection defaults, source pins, licenses and unmodified Claude Code bytes remain unchanged.
- Current-source input identity only; no frozen source counts/hashes, prior-run receipts or new paid runners.

## Task 1: Scoped current-input output proof

**Files:** scripts/ci-inputs.mjs, scripts/ci-inputs.test.mjs.

**Interface:** Preserve androidOutputs(root) for the complete serial path; support androidOutputs(root, scope), where scope is exactly all|jvm|debug|releaseTest. all selects both APKs and all three JVM XML directories; jvm selects all three nonempty JVM report directories only; debug/releaseTest select exactly their nonempty APK directory. Reject unknown scopes. Preserve Gradle's actual command exit as the success authority.

Each normal producer emits ci-android-evidence.json with {scope,identity,outputs}; output entries retain {path,sha256}. The existing start action records identity; finish actions compare it with current tracked identity and hash real outputs. Complete serial android action remains compatible with current manual source preflight.

Aggregate exact normal scopes jvm/debug/releaseTest from artifacts under ci-android-results. Require exactly one record per scope, all identities equal current identity, no unknown/duplicate/missing scopes or output paths, and path/hash structure valid for that scope. Reject a missing JVM variant or APK even when another scope is nonempty. Write combined ci-android-evidence.json. Select actual artifact record names consistently in YAML/helper tests; do not trust a caller-supplied success boolean.

- [ ] Write fixture tests for each scope, unknown scope, missing one JVM directory, missing APK, duplicate/missing/unknown scope, mismatched identity and duplicate output path; run node --test scripts/ci-inputs.test.mjs and observe red.
- [ ] Implement the minimal scoped proof and aggregation using existing identity/hash helpers, no new dependencies.
- [ ] Rerun that test and the full five-module Node CI contract command; retain actual output.

## Task 2: Independent producer jobs and completion

**Files:** .github/workflows/android-ci.yml, desktop/tests/desktop-ci.test.ts.

Normal mode (!inputs.collect_sources):

1. JVM job: immutable checkout, Node22 for identity tooling, JDK17, setup-gradle; Python runtime redistribution fixtures; all-variant public lint graph dry-run with existing opt-in flags; ./gradlew test with same2GiB heap/producer flags; current scoped JVM proof; upload one uniquely named current-scope record. No native tool installation, Docker comparator, runtime downloads or npm install needed for JVM-only execution. Validate its graph still excludes generated payload work.
2. APK matrix: variants Debug/ReleaseTest, fail-fast:false, no dependency on JVM job. Retain current Node22/JDK17/setup-gradle/clang+lld/comparator/download cache, Android-only Electron skip, current input start/finish, opt-in source registration/init proof, fresh run-local native cache. Fixed variant mapping permits ONLY assembleDebug or assembleReleaseTest; no arbitrary command input. Each builds one complete fresh APK and proves its scope. Preserve artifact names youcoded-debug/youcoded-releasetest, compression-level0, error for missing files and existing retention. Upload scope records with unique artifact names; do not race to upload a common name.
3. Source preflight job: selected ONLY for inputs.collect_sources. Keep existing full serial test/debug/R8/default graph, collection environment, source/archive checks/uploads and failure evidence. No opt-in graph/native cache. Avoid duplicate normal producer execution on this path.
4. Android completion: always evaluated, needs JVM, APK matrix and source-preflight. Validate EXACT selected status set: normal requires JVM+APK success and preflight skipped; source mode requires preflight success and normal jobs skipped. Missing/failed/cancelled/unknown/unexpected skips fail. Use JSON via environment, not interpolated shell source. Normal mode downloads only current run's three scope artifacts, aggregates current identity/output evidence and uploads android-current-inputs. Source mode retains complete preflight evidence and does not overwrite that artifact. The parent sees failure from either a producer or this final proof; no extra concurrency group.

- [ ] Add parsed actual-YAML contracts proving independence, exact matrix variants, complete all-three-JVM command, real debug/R8 commands, tool/env scoping, preserved standalone preflight and always completion needs.
- [ ] Run targeted contract against existing serial YAML and retain the expected red.
- [ ] Implement the workflow topology with minimum helper code and accurate WHY comments; keep fixed supported Gradle flags unchanged for scheduling comparison.
- [ ] Add a truth-table test for the exact selected needs set. Mutate real YAML to remove APK from completion needs, observe targeted contract red, restore and rerun green.

## Task 3: Review and hosted measurement

- [ ] node --test scripts/ci-policy.test.mjs scripts/ci-evidence.test.mjs scripts/ci-linux.test.mjs scripts/ci-desktop.test.mjs scripts/ci-inputs.test.mjs.
- [ ] Parsed Vitest workflow contracts and actionlint both actual workflows; bash scripts/verify.sh on the app worktree.
- [ ] Fresh reviewer checks scoped evidence, matrix aggregation, failure/cancellation and source-preflight parity.
- [ ] Parent publishes only reviewed explicit paths after the separate FPM import repair has been recorded. Worker does not commit/push.
- [ ] Run real full ordinary-source stacked PR and default-codec candidate, record trigger-to-last-required-gate, all step/setup/transfer/upload times and runner-minutes. More runners do not establish a speed win without the whole clock. Static local verification is not Android assembly or Windows/macOS execution.
- [ ] Compare cold run with unchanged serial evidence: ordinary403s Android job, JVM40s+debug136s+R8150s; firstdefault419s. No guaranteed parallel runtime estimate. Do not count the previous failed format runs as acceptance. Consider ordinary Gradle build-cache separately only after cold scheduling proof, with cache-hit versus actual R8 execution explicitly distinguished.
