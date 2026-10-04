---
title: Paused Markdown and hidden-layout experiment source
status: active
date: 2026-09-29
---

# Recovery material, not shipping app code

`source-snapshot.tar.gz` preserves the interrupted experiment source, its tests, a binary git diff, file list and SHA-256 manifest. It is not imported, compiled or installed. Archive SHA-256: `96be2238455ca155b954192c453c813f07d7f2716919419046770291c3b5bcad`.

The snapshot contains27 changed/untracked app files from the preserved old app base `bb939f917e3e64437825b24f3b86b02f14843825`. **It includes the accepted Find/chrome/bottom fixes as well as the paused experiments. Never apply the full patch over current master.** Extract to scratch in a new isolated session, verify `snapshot/` against `sha256sum.txt`, compare candidate-specific hunks against current code, and restore only a deliberately selected experiment. Upstream moved first-page loading and added document/reference behavior while this branch retained its comparison base; adaptation is required.

Paused work: shared highlighter registry; conservative literal-paragraph parser; hidden physical-scroll gate; cooperative first-page mdast preparse/cache. The last was interrupted while addressing exact rendered-group coverage, global budgets/queueing and unnecessary test-only props. No final acceptance is implied by files being present or earlier tests being green. Original baseline packages and raw measurements are separate local evidence, not inside this source archive.

Read `docs/active/investigations/2026-09-29-performance-status.md` and `docs/active/plans/2026-09-29-history-rendering-and-stalls.md` first. In particular, measure resume-to-complete-content and immediate activation as well as active typing; retaining a background improvement that merely moves its hitch to the click is forbidden by the task's acceptance criteria.
