---
id: 161
title: Keep malicious Word files from freezing document previews
stage: explore
tags: files, security, bug
branch: 161-keep-malicious-word-files-from
created: 2026-10-18
why: just add to roadmap to fix later. this is taking way too long
---
Progress
Done: Release review found DocxView.tsx passes user-opened DOCX to mammoth.browser with an older embedded xmldom parser. Reported parser denial-of-service risk; no code execution or zero-interaction exploit demonstrated. Destin explicitly chose to defer and ship 1.3.1 current behavior.
Next: Later, reproduce safely with bounded fixtures; update/rebuild the embedded browser parser and bound document expansion/parsing work. A top-level xmldom override alone does not replace Mammoth's embedded parser.
Blocked: Deliberately deferred by Destin; not a 1.3.1 release blocker. No parser or lockfile change made.

Chats
