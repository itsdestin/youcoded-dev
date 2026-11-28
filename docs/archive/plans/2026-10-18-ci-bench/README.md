# CI speed experiments (card #29), 2026-10-18/19

Copied from three workspace branches, each tip commit adding one plan doc under `docs/active/plans/`:
- `session/29-android-build-bench` commit 8618c9c69: `2026-10-18-android-ci-speed-experiments.md`
- `session/29-android-paired-bench` commit d205a1766: `2026-10-19-android-matched-runner-trial.md`
- `session/29-linux-build-bench` commit 3fa005abf: `2026-10-18-five-minute-ci-experiments.md`

Why kept: these hypotheses and baselines exist nowhere else (the app branches' PRs #635-#647 hold only code).

Key finding: the Android timings (283.7s / 388.3s / 297s / 325.2s) were confounded by the CI runners having different CPU types, so wall time alone must not be used to pick a winner.
