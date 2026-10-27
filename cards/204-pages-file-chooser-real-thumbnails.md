---
id: 204
title: Pages file chooser: real thumbnails for every picture
stage: explore
related: 90
branch: 204-pages-file-chooser-real-thumbnails
created: 2026-10-25
why: Step 2 ships thumbnails only from a JPEG's embedded preview or small images (Electron's thumbnail call is macOS/Windows only; decoding photos on the main process would freeze the app). Build a proper off-main thumbnailer (worker or helper process) so every picture tile shows its picture. Recorded at Destin's request (2026-10-24: record every follow-up).
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
