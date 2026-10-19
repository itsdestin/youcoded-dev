---
status: active
---
# Full CI near-five-minute candidate

User clarified on2026-10-19: target is WHOLE CI from trigger to last required result, not an optimized Linux diagnostic beside slower controls. Continue optimizing all selected coverage with useful parallelism; no merge, branch-protection edit, release/signing change, paid runner upgrade or live-app experiment.

## Goal / measurement

Primary trial is ordinary app PR full coverage: desktop semantic checks, all configured desktop test files/cases, all four existing Linux installer formats, all Android JVM variants/debug/R8APK, and one fail-closed final result. Preserve existing master/nightly/manual desktop OS coverage; test it separately rather than pretending the PR-only Linux matrix proves Windows/macOS. Record trigger→last selected check, queue/setup/transfer/upload/final-gate time and summed runner minutes. Do not call cached/frozen diagnostic time whole-CI acceptance.

## Evidence

Linux diagnostic near5m04 succeeded with4unfiltered shards,4formats, zstd transport. It reused exact frozen inventory/control receipts: generic candidate MUST NOT depend on them. Fresh current-checkout file discovery and current prepared-app payload manifests replace them. Current Android full factorial and matched-pair tests pass all108JVM identities/fullAPK/native/web/backend/legal equivalence. Matched pairs: baseline-first358.173→combined220.175s; reversecombined282.079→baseline245.428s; order effects remain. Combined is a candidate to measure, not a guaranteed causal win.

## Architecture and interfaces

### One orchestrator, not duplicate full controls

Refactor existing `desktop-ci.yml` into full orchestrator retaining required `build (ubuntu-latest)` completion name. `android-ci.yml` becomes reusable (`workflow_call`) plus its existing manual diagnostic/source-preflight entry point; remove duplicate push/PR triggers so one source push does not run old serial Android beside new full CI. Caller uses same candidate SHA. Call Android for full PR/master/manual-all/schedule runs; browser diagnostics remain separate with distinct contexts and no full-build success claim.

Classifier is a small tested Node module, complete NUL diff/no early shell grep. Validate candidate checkout/event immutable refs; verified synthetic PR merge first-parent comparison avoids known event-base/shallow races, unknown shapes/full events conservative. Only proven nonempty docs-only diffs may skip heavy work. Git/event failures remain red.

### Desktop tests / cheap checks

Fresh current-config Vitest files-only discovery; no hard-coded source hashes, artifact run IDs or old case inventory. Fixed unfiltered shard argv, explicit forbidOnly, structured JSON reporting, exact disjoint fresh file union and all job success required. Preserve current assertion/timeouts/OS skips. Report all case statuses, reject failed/unknown report statuses and inconsistent totals; no selector/filter/exclusion. Normal sources/test changes can add files/cases without an old receipt.

PRLinux4shards. Full matrix initiallyLinux4,Windows6,macOS4; tune from observed tails. All source/file-reading/cross-language guards remain in the full selected suite. Linux prep runs all existing types/testtypes/knip/buglint/designlint/Node policy+beta tests; Windows/macOS shard1 runs the same OS-specific cheap checks (rather than repeating them in every shard). Shards start after successful classification independently, not behind a slow global preflight-matrix barrier. Every OS includes shard1; matrix policy tests enforce full coverage and counts. Speculative work may run while a cheap check fails; final status cannot go green.

Browser manual dispatch retains defaultall, exact existing six-file browser group, DEBUG protocol env, default test shell, maxWorkers1, types/knip/lints on all selectedOS and distinct status. Does not impersonate full gate.

### Linux preparation/packages

One current production `npm run build -- --linux --x64 --dir --publish never`; full cheap checks before it, fresh lock-based deps. Capture current-checkout source/lock/config identities and full unpacked path/hash/mode/link manifest. Fast zstd transport with exact decompressed TAR hash/byte proof; independent private copies/temp/output pertarget. No shared mutable/hardlinked app tree.

Four fresh formatsAppImage/deb/rpm/pacman. CI may use the verified faster format-specific compression (deb/pacman gz,rpm gzip) for proven ordinary source/test edits; official release/test-build workflows and default installer settings stay unchanged. Conservatively select default compression on build/dependency/native/Office/resource/asset/workflow/helper changes or unknown paths, and expose the selected packaging mode in the manifest/gate. This preserves the official codec path on packaging-impacting changes; those full runs may exceed five minutes. Do not call fast-format validation identical default-codec coverage. Record bytes/CPU/wall/tradeoffs. All installed core app entries must match the CURRENT prepared manifest, not a prior package; measured old control showed zero core differences for all3nativeformats and only new resources/apparmor-profile under app root. Capture per-target post-builder manifest, require original core unchanged and narrowly account generated metadata; installed core equals post-builder. Retain dependency/control/script metadata for validation/reporting, no ignore of payload or license changes. AppImage extraction validation should be added if bounded using its extraction runtime only/unsquashfs, never launching Electron or a live app; do not overclaim current native-package proof if not implemented.

### Android

Reuse the full baseline workflow coverage, add opt-in generated-asset producer graph/native reuse only after porting OWN previously reviewed source patches without overwriting newer changes. Default app builds remain unchanged. CI combined mode2GiB, full3JVMvariant tests then debug/R8assembly; source collection manual diagnostic keeps original behavior and separate name. Fresh run-local compiled cache with complete verified input/toolchain keys, no source-collection reuse, originalClaudeCode bytes, notices/source evidence maintained. Public AGP generated-source adapter plus whole lint reader family, no individual internal-task exceptions; prove JVM-only light graph and actual fresh R8 output. Parent owns Android source portability; worker owns orchestration. In the reusable Android job only, omit Electron executable download through its supported ELECTRON_SKIP_BINARY_DOWNLOAD flag (web/backend compilation still retains all npm hooks/dependencies), and use artifact compression-level0 for already-compressed APKs. Keep the flag out of Desktop checks/packages. Fresh full Android assembly is the acceptance proof; report actual timings rather than presumed savings.

### Final gate

Exact selected-job manifest/results. Always runs after classification, desktop shard matrix, current-package prep+formatmatrix, reusable Android and browserdiagnostic job. Full route requires ALL selected success and fresh artifact coverage/payload validation. Docs route accepts only proven classification with expected heavy skips. Browser route accepts only actual manual diagnostics, never full context. Missing/failed/cancelled/unexpectedskipped/unknown/mismatchedSHA evidence is red. No branch-protection migration; existing required name becomes stronger by including Android. Manualsourcepreflight remains distinct. Preserve master/macOS/Windows names if feasible, at least requiredLinux exact and no accidental old context confusion.

## Tasks / validation

1. Parent port/review Android producer/runtime helpers from own44da candidate using target-file reads and checked exactdiff, never copying whole stale checkout overcurrent sources; testPython/native fixture/default/fastgraph/R8lint producer proofs. No Kotlin/IPC feature changes.
2. Worker implement/test-drive generic orchestrator/helpers/currentpayload and unfiltered perOSshard aggregation. Preserve ordinaryPR controlcommands by replacing topology, not leaving serial controls besideit. Unit realGit classifier, currentnewtestfile acceptance, source-change mismatchSHA, missing/duplicate files/reports, failure/cancel/skips, packagecore mutation rejection, matrixcoverage and actualparsedYAML. No cache receipts or fixed testcasecounts.
3. Parent independent review + required desktopverify/actionlint/Python. Intentionalgate/format/shard/report mutations reject. Audit commandlists old→new forcoverage. Validate candidate PR and one harmless ordinary source/test change; no source UI visual change unless scoped separately. Actualcold/warm caches trials, mark both total and runnercost.
4. If last selected job remainsabove5, optimize that measuredcriticalpath (Androidcommonpreparation/emitter, workerlimits, artifacts orlongtestgroups) while retaining allchecks. Do not report individualarm aswholeCI. Stop only on completed measuredreport or genuine need for userdecision; no merges inferred.

## Boundaries

Cross-platform failures found are fixed within authorized scope, not dismissed asflakes. Release signing/notarization/nativepins/licenses are not performance knobs. Existing workspace card-onlycandidatePR272 remains separate (different repository): do not silently claim appCI covers workspace/Worker changes. RepositoryregistryWorker pipelines need their own selection when actually modified.
