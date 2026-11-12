---
id: 161
title: Keep malicious Word files from freezing document previews
stage: explore
priority: P3
tags: files, security, bug
branch: 161-keep-malicious-word-files-from
created: 2026-10-18
why: just add to roadmap to fix later. this is taking way too long
---
Progress
Done: A release review found that the Word preview uses an old embedded XML parser (inside the Mammoth library, version 1.12.2), which could be made to slow down or hang on a crafted file. No code run and no attack demonstrated. Destin chose to defer it and shipped 1.3.1 as it was. Done since then (Oct 24): big Word files are now converted in a background worker, so the main window stays responsive; the crafted-file risk is still there. 2026-11-11, branch session/files-reliability-batch (app fb01783a5, not merged): a Word preview that runs over 60 seconds is stopped and says the document took too long; a crashed converter no longer re-runs the file on the page; the file's embedded style map is ignored. Measured first: a 1.2 KB crafted file ran 17 s and more.
Next: Excel preview gets the same 60-second limit as Word in the next files round (Claude, 2026-11-12, same approved pattern). Word limit landing with app PR #737.
Blocked: 2026-11-12: app PR #737 (files reliability batch) is NOT merged. On GitHub's Linux test machine, tests/office-parse-off-page.test.tsx reports one unhandled error from the Word library (mammoth) twice in two runs: 'Cannot read properties of undefined (reading uint8array)' then 'Cannot read properties of null (reading length)', thrown from a setImmediate tick inside mammoth's bundled zip reader. All 20 tests in the file pass; the stray error fails the job. NOT reproduced locally: Node 26 and Node 22.23.5, branch alone and merged with master, 24 parallel runs, six runs pinned to one core, and a deliberately abandoned conversion at file end. Windows and Mac shards pass. Likely a conversion still running after its test moved on (the file's own comment says an earlier version had exactly that). Fix before landing.

Chats
