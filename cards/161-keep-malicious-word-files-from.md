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
Done: 2026-11-12, same branch (app PR #737): Excel preview now stops after 60 seconds and says the spreadsheet took too long, same as Word. Also found why GitHub's Linux test run failed (a test left a real Word conversion running) and fixed the test.
Next: Excel's worker crash still re-reads the file on the page (Word no longer does); decide if Excel should match.
Blocked: 2026-11-12: app PR #737 (files reliability batch) is NOT merged. On GitHub's Linux test machine, tests/office-parse-off-page.test.tsx reports one unhandled error from the Word library (mammoth) twice in two runs: 'Cannot read properties of undefined (reading uint8array)' then 'Cannot read properties of null (reading length)', thrown from a setImmediate tick inside mammoth's bundled zip reader. All 20 tests in the file pass; the stray error fails the job. NOT reproduced locally: Node 26 and Node 22.23.5, branch alone and merged with master, 24 parallel runs, six runs pinned to one core, and a deliberately abandoned conversion at file end. Windows and Mac shards pass. Likely a conversion still running after its test moved on (the file's own comment says an earlier version had exactly that). Fix before landing.

Chats
