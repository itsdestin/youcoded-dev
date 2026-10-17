---
id: 117
title: Phone voice and microphone: three gaps
stage: planning
priority: P3
tags: remote-access, standalone, input-bar, feature
needs: 115
branch: 117-phone-voice-and-mic-three
roadmap: remote-access: Phone voice and mic: three gaps.
created: 2026-10-15
summary: A phone browser cannot use voice input, and pairing a phone mid-dictation leaves the microphone in a confusing state.
area: Devices & sync
side: both
platform: Phone and web
vision: chat.converse.voice, everywhere.platforms.web
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: waits on #115 — A phone browser can only use the microphone on an encrypted connection, which 115 builds.

See also #115: 115's encrypted browser connection is exactly what would give a phone browser the microphone that 117(a) is missing.

Chats

From the old roadmap (remote-access › standalone, status confirmed, seen on all, last checked 2026-09-05)
Phone voice and mic: three gaps. (a) The remote browser client has no mic, since browsers allow it only on secure pages and remote access is plain http; when the channel is encrypted, record in the browser and send audio to the desktop's speech engine (2026-09-05 deck: desktop and Android first). (b) A phone that pairs mid-dictation cannot stop its own microphone; it stays open until the recogniser times out (a few seconds). (c) Pairing while the message box is open leaves the mic button looking live; the first tap shows "voice stopped" instead of the card explaining you are connected to another computer.
