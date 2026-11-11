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
Next: The old XML reader is still inside the Word library (also in its newest version 1.13.0); the time limit contains it. The Excel preview has no time limit yet.
Blocked: deliberately deferred by Destin; not a release blocker.

Chats
