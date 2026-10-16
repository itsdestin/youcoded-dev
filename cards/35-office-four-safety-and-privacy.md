---
id: 35
title: Office documents: four safety and privacy gaps
stage: planning
priority: P2
tags: files, files-panel, desktop, security
branch: 35-office-four-safety-and-privacy
roadmap: files: Office: four safety and privacy edge cases.
created: 2026-10-15
summary: Pictures in documents can be downloaded without the app's checks, and bits of document text can end up in the app's log.
area: Files & documents
side: behind
platform: Desktop only
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (files, status confirmed, seen on desktop, last checked 2026-10-02)
Office: four safety and privacy edge cases. (a) On Mac and Windows, an Office document holding a picture given as a web address can make the converter download it outside the app's own checks; only Linux blocks this. (b) On Windows, the private folders for saving and temporary files rely on inherited permissions, so another account on the PC might read a document mid-save (untested). (c) An Office editor error line can copy up to 300 characters of the document's text into the app's log. (d) A picture dropped from a web address is checked as public, but the download looks it up again, so a site could still point it at a home-network address; one disguise (Teredo) is not unwrapped either.
