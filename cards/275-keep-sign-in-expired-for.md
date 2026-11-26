---
id: 275
title: Keep "Sign-in expired" for ChatGPT after a restart
stage: explore
tags: accounts, native-runtime
related: 236
branch: 275-keep-sign-in-expired-for
finish: After OpenAI refuses to renew a ChatGPT sign-in, Settings keeps saying "Sign-in expired" (not "Not signed in") across an app restart, until the person signs in again or signs out.
created: 2026-11-18
why: Card #236 shipped this in memory only: clearAccount() deletes the account file, so nothing durable remains to remember the expiry. Offered to Destin 2026-11-18 ("I can add a small saved marker if you want it kept"); no answer yet — needs his yes before building.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
