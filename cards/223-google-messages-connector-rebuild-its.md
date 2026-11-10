---
id: 223
title: Google Messages connector: rebuild its Windows program with the patched security library
stage: explore
priority: P3
tags: marketplace, security
branch: 223-google-messages-connector-rebuild-its
created: 2026-11-08
why: Destin 2026-11-07: 'google messages can wait, it's currently not really used anyway'. 16 Dependabot alerts (7 critical) on golang.org/x/crypto in wecoded-marketplace/youcoded-messaging/mcp-servers/gmessages; none reachable (it uses only hkdf/chacha20poly1305/cryptobyte, no ssh). Dependabot PR #115 bumps go.mod, but the committed prebuilt gmessages.exe (22.9 MB, last built 2026-04-15) only gets the fix when rebuilt — replacing a program people run, so test sending and receiving a text before release.
work: session/security-server-batch
---
Progress
Done: Rebuilt on branch session/security-server-batch (not merged): the Windows program now carries the security library at 0.58.0 (was 0.48.0; the automated update proposed only 0.52.0) and a newer Go, which also clears 24 known flaws in the old program's built-in networking code. A scan of the new program finds none it can reach. Messaging plugin raised to 1.0.1 so installed copies pick it up.
Next: Before release, on a Windows computer: start it, pair, send and receive one text. It could not be run here (no Windows). After merge, close the automated update PR wecoded-marketplace#115 as superseded.
Blocked: needs a Windows computer and a paired phone for the send-and-receive test.

Chats
- 2026-11-10 session/security-server-batch: Batch 5: rebuilt with the patched library; untested on Windows
