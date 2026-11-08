---
id: 223
title: Google Messages connector: rebuild its Windows program with the patched security library
stage: explore
tags: marketplace, security
branch: 223-google-messages-connector-rebuild-its
created: 2026-11-08
why: Destin 2026-11-07: 'google messages can wait, it's currently not really used anyway'. 16 Dependabot alerts (7 critical) on golang.org/x/crypto in wecoded-marketplace/youcoded-messaging/mcp-servers/gmessages; none reachable (it uses only hkdf/chacha20poly1305/cryptobyte, no ssh). Dependabot PR #115 bumps go.mod, but the committed prebuilt gmessages.exe (22.9 MB, last built 2026-04-15) only gets the fix when rebuilt — replacing a program people run, so test sending and receiving a text before release.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
