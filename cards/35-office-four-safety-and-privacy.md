---
id: 35
title: Office editor: faults, safety and privacy gaps
stage: planning
priority: P2
tags: files, files-panel, desktop, security, needs-repro, bug
branch: 35-office-four-safety-and-privacy
roadmap: files: Office: four safety and privacy edge cases.
created: 2026-10-15
summary: The Office editor has seven small faults, plus safety gaps: pictures downloaded without the app's checks and document text in the log.
area: Files & documents
side: behind
platform: Desktop only
vision: chat.files.office
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (files, status confirmed, seen on desktop, last checked 2026-10-02)
Office: four safety and privacy edge cases. (a) On Mac and Windows, an Office document holding a picture given as a web address can make the converter download it outside the app's own checks; only Linux blocks this. (b) On Windows, the private folders for saving and temporary files rely on inherited permissions, so another account on the PC might read a document mid-save (untested). (c) An Office editor error line can copy up to 300 characters of the document's text into the app's log. (d) A picture dropped from a web address is checked as public, but the download looks it up again, so a site could still point it at a home-network address; one disguise (Teredo) is not unwrapped either.

Merged in #36 "Office editor: seven small faults"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (files, status confirmed, seen on desktop, last checked 2026-10-02)
Office editor: seven small faults. (a) The Home tab's Recent list is out of date until you leave the Office page and return. (b) When the Office page gives up listing a very large project's files, "In <project>" looks like a project with no Office files. (c) Ctrl+S during an automatic save can make the label say "Saved" a moment early. (d) A printed or PDF-saved document can break pages differently than on screen; a spreadsheet PDF can have blank pages past the chosen range. (e) The File tab sometimes lacks its Export entry just after opening (seen once). (f) Dropping several pictures at once into Excel or PowerPoint may stack them (only Word tried). (g) After applying Heading 1, the style gallery's dark tiles once showed empty (seen once).
