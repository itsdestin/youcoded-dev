---
status: active
---
# Android CI speed experiments — isolated candidate

User authorized needed Linux/Android experiments targeting near five minutes total on 2026-10-18. No merge, production release/signing, paid runner upgrade or live-app interaction is authorized. This branch begins at the same green `a85342b9a` source as the Linux experiment; ordinary Android/Desktop CI remains a default-behavior control.

## Hypotheses / first controlled batch

1. Run-local verified musl reuse avoids identical native compilation across variants. Fingerprint actual musl archive, patch/build/cache-helper sources, pins, exact sysroot input lock and CRT, toolchain/host and relevant compiler environment. Artifact hash/mode verified before restoration; atomic cache publication; bad/stale cache means recompile. The workflow provides an EMPTY runner-temp cache, never restores compiled native output from another run. Default behavior is unchanged unless explicitly enabled. Disable this experiment in source-collection mode. Always retain/extract patched musl source/COPYRIGHT even on a hit: redistribution.finalize consumes these unconditionally. Preserve all per-variant interpreter/RUNPATH transformations, shim and original ClaudeCode bytes.
2. Opt-in `-PciPackagingDependencies=true` attaches web/backend/native generated inputs to actual assets/JNI merge consumers rather than all preBuild/JVM-unit prerequisites. Keep every JVM variant test and both debug/R8 ReleaseTest APKs. Existing default hooks unchanged. Prove task graph and final content; no blanket task exclusions.
3. Compare default2GiB and explicit4GiB Gradle heaps only after/folded into the combined mode, recording runner resources and memory/time. No assumption that memory is the bottleneck.

Matrix modes: baseline, common-native, packaging-graph, combined, combined-4g; normal hosted Ubuntu runners, bounded parallelism3 so Linux experiments plus normal controls do not exhaust ordinary runner capacity. Full benchmark includes slower controls and is not claimed as five-minute winning CI. Source/pin/lock/compiler/package-selection fingerprints must match before comparisons are considered valid.

## Files / TDD

- `app/runtime/native-cache.py`, `app/runtime/test_native_cache.py`: dependency-free key/store/restore helper with changed-input/toolchain/env, tamper, mode, atomic/publication and missing-input tests. No caller may reuse directory presence alone.
- `app/runtime/build-runtime.sh`: opt-in common compile cache only; sources/COPYRIGHT always present and provenance freshly recorded. New helper is included by existing runtime source snapshot traversal.
- `app/build.gradle.kts`: opt-in packaging dependency graph and explicit cache-mode input; default, release config, source collection, variant IDs and R8 settings unchanged.
- `scripts/android-speed-benchmark.py` and its tests: fixed supported modes/Gradle argument arrays; process spans and structured source/tool/memory/cache/task/test reports; collect both APKs; compare decompressed installed payloads and native bytes against baseline. Normalize only known archive timestamp containers, never hide runtime code/test omissions.
- New named-head PR-only `.github/workflows/android-speed-benchmark.yml` guarded to this experiment branch. Keep existing android-ci.yml/desktop-ci.yml unchanged so the full normal CI control/contracts run. Read-only permissions, no production secrets/publishing, short diagnostic-artifact retention.

## Acceptance

Write and observe failing tests before implementation. All selected JVM test identities/counts must equal baseline. All native `.so`, frontend content and unpacked backend content/modes/links/legal records must match for the same variant; package/signing container timestamps may differ, not runtime code. Validate required APKs and exact variant IDs. Fail comparisons or label an experiment invalid on mismatched source/package inputs, missing reports/assets, changed native output or failed tests; never declare performance wins from partial success.

Local syntax/unit/schema checks first; independent review before candidate publication. Hosted CI provides actual Gradle task graph, fresh assembly/R8 and wall-time evidence. Phone startup/install remains a later promotion check, not implied by static equivalence. Preserve pins so no unverified upstream-version change is introduced. No cache or graph experiment is merged merely because faster.

After first measurements, examine the remaining critical path before additional experiments (e.g. verified single-extraction staging, backend incremental emit, task output/configuration cache or more independent assembly jobs). Do not add their theoretical savings together or change every variable at once.
