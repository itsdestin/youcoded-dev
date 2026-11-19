---
id: 238
title: A Mac that tested the betas landed on 1.3.1 after 1.3.3 was out, and has stayed there
stage: explore
tags: desktop, updates, mac, needs-repro, bug
related: 189
branch: 238-a-mac-that-tested-the
finish: We know whether beta builds on a Mac are offered the newest official release, and fix it if not
created: 2026-11-10
why: Destin, 2026-11-08: 'there seems to be a 1.3.1 device or app online, like, constantly. I'm not really sure how to explain this ... we had a announcement saying, hey, download 1.3.3'. Analytics records (counts only): one US Mac, first seen Aug 28 on the 1.3.0 beta, moved through betas .72, .76 and 1.3.1-beta.87 within days of each, then to 1.3.1 on Oct 23 about 1.5 hours AFTER 1.3.3 was published, and never to 1.3.2 or 1.3.3. Mac installers for all three exist. Unknown: whether a beta build's update path offered 1.3.1 instead of the newest release, or the owner installed an older download by hand.
---
Progress
Done: 2026-11-10 (release-safety session): no update code changed. The updater is the app's own (it reads GitHub's release list, downloads the Mac installer and swaps the app). It writes no log file, so the facts below are the only evidence. Releases 1.3.1, 1.3.2 and 1.3.3 all carry both Mac installers (Apple chip and Intel).
Next: ASK THE MAC TESTER (nothing here changes their Mac). FACTS: (1) the version shown in YouCoded under Settings > About; (2) macOS version and chip (Apple menu > About This Mac); (3) which folder YouCoded.app sits in (Applications, Downloads, other) and whether it was ever opened straight from the installer window; (4) how it was first installed and how it got to 1.3.1: clicked Update in the app, or downloaded and installed by hand, and roughly when; (5) whether an 'Update available' message was ever seen and what they did, and whether Settings shows 'Get beta builds' on or off; (6) which beta versions they remember installing. FILES (in Finder press Cmd+Shift+G, paste the path, Enter; if missing, say so): (a) ~/Library/Application Support/youcoded/update-cache : a screenshot of the folder in list view (names, sizes, dates) plus the small files pending.json, attempt.json and highest-installed.json if present; (b) ~/.youcoded/config.json : a screenshot of only the part that says "updates"; (c) a screenshot of the Applications folder, and of Downloads if it holds YouCoded installers (.dmg), with dates. PRIVACY: do NOT ask for ~/.claude/desktop.log or chat folders; they can hold file paths and error text from chats. The Mac paths are read from the code and not yet confirmed on a real Mac. WHAT EACH ANSWER SETTLES: fact 4 + installer dates = moved to 1.3.1 by hand (the updater itself would have picked 1.3.3); never saw a message + no pending.json = the update check fails silently and shows 'up to date'; fact 3 = app outside Applications, so in-app install is refused; attempt.json failures or a hidden '.YouCoded-update-1.3.3.app' beside the app = download or signature check failed (possible if a beta was signed differently); config 'updates' = automatic install off or a beta setting.
Blocked: Waiting for the Mac tester's answers; Destin sends the request.

Chats
