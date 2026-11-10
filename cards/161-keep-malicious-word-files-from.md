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
Done: A release review found that the Word preview uses an old embedded XML parser (inside the Mammoth library, version 1.12.2), which could be made to slow down or hang on a crafted file. No code run and no attack demonstrated. Destin chose to defer it and shipped 1.3.1 as it was. Done since then (Oct 24): big Word files are now converted in a background worker, so the main window stays responsive; the crafted-file risk is still there.
Next: later, reproduce safely with small test files; update or replace the parser and cap how much work a document can cause.
Blocked: deliberately deferred by Destin; not a release blocker.

Chats
