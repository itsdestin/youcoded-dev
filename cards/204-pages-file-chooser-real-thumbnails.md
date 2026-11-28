---
id: 204
title: Pages file chooser: real thumbnails for every picture
stage: explore
work: session/90-pages-finish
related: 90
branch: 204-pages-file-chooser-real-thumbnails
created: 2026-10-25
why: Step 2 ships thumbnails only from a JPEG's embedded preview or small images (Electron's thumbnail call is macOS/Windows only; decoding photos on the main process would freeze the app). Build a proper off-main thumbnailer (worker or helper process) so every picture tile shows its picture. Recorded at Destin's request (2026-10-24: record every follow-up).
---
Progress
Done: a first version is built and tried, but only on the unmerged branch session/90-pages-finish (commit c71a4606b). It shows a phone's file chooser picture from a photo's built-in preview or from small images.
Next: plan the full version that makes every picture show its picture, with the decoding done off the main process.
Blocked: nothing; it waits on the decision about the session/90-pages-finish branch (card 90).

Chats
