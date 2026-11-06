---
status: shipped
---

> **Archived 2026-11-05.** Fixes shipped in youcoded#713 and #715, wecoded-marketplace#114 and #117, wecoded-themes#41. Destin's 14 decisions on the questions it raised (not one per finding; the fixes themselves are in those PRs): `docs/archive/design/2026-10-30-security-decisions/security.questions.answers.json`. Still open: server traffic limits (card #221). Dropped: an "approve before signing" GitHub environment (with one account, a stolen login approves itself). Findings below describe the code as of 2026-10-30, not today.

# YouCoded Security Audit — 2026-10-30

**Scope:** the desktop app, the Android app, the online server (marketplace, accounts, friends, games), the plugin and theme stores, app updates, and the GitHub accounts and build machinery that produce all of it. Nine specialists each took one way an attacker could come in. They read the code only: nothing was changed, nothing was sent to the live servers, and the running YouCoded app was not touched. The lead re-checked the most serious findings against the code.

**Bottom line:** YouCoded has **no "anyone on the internet can take over your computer" hole**. The foundations are better than most hobby projects: updates are signed and checked, passwords are kept in the computer's own password vault, every window is walled off from the rest of the computer, and outsiders can't sneak code in through GitHub. But there are **5 problems worth fixing soon** and about **15 worth fixing before growing**. Most are small fixes.

---

## Fix first (serious, and mostly cheap)

| # | Problem in plain words | Who could do it | Size of fix |
|---|---|---|---|
| 1 | **A hidden loophole lets a command skip the "Allow?" prompt.** In Claude Code chats, any command that also mentions the folder YouCoded uses for chat titles is approved automatically, in every mode, including "Ask first." A web page that tricks the assistant could get a harmful command run with no prompt. *(Confirmed by the lead: `desktop/src/main/permission-auto-approve.ts:12` and `:174`.)* | Someone who plants instructions in a web page, file or email the assistant reads | Tiny (one pattern) |
| 2 | **Sign-in link takeover.** An attacker starts a YouCoded sign-in and sends the link to a victim. When the victim approves on GitHub, the attacker becomes logged in as them. If the victim is Destin, the attacker gets admin pages too. *(Already on file as card #55.)* | Anyone who can send a link | Small–medium |
| 3 | **A booby-trapped project folder can run code and steal the GitHub key when backup syncs it.** The hidden backup folder inside a project is trusted if it already exists, and a downloaded project can contain one. Separately, the app hands its GitHub key (which can change any of the user's repos) to whatever server that backup folder points at. *(Confirmed by the lead: `sync-spaces/git-transport.ts:421`, `:58`.)* | Someone who gets a user to download a project and turn on backup for it | Small |
| 4 | **Everything rests on one GitHub login.** No second approval is needed to change the app. One "version tag" builds, signs and ships a release to every user. A stolen GitHub login = a malicious official update. | Anyone who steals Destin's GitHub login | Settings only: passkey/security-key login, a protection rule on release tags, an "approve" click before signing |
| 5 | **Out-of-date building blocks with known flaws.** 16 known issues in libraries the app uses (2 critical, 8 high), including the HTML cleaner and the MCP library. GitHub's automatic security alerts are switched off on all public repos, so nobody was told. | Varies; most probably aren't reachable in how YouCoded uses them, but the cleaner is a last line of defence | Small (update + turn alerts on) |

## Fix before growing (medium)

**Assistant safety**
- 6. **The assistant can read files and send them out without asking, even in "Ask first."** Reading files and fetching web pages never prompt. A tricked assistant could read a private file and send it out inside a web address. *(Normal for AI assistants, but worth tightening: ask before fetching new websites, or before reading outside the project.)*
- 7. **Shortcut files (symlinks) fool the folder limits.** A shortcut inside a downloaded project that points at your SSH keys or shell settings slips past the "secret files" list. The phone feature already handles this correctly; the assistant's file tools don't.
- 8. **The assistant can edit its own permission file and the project's auto-run scripts** without a prompt in "Auto-edit" mode.
- 9. **Full Auto's safety stops are a word list.** They catch `rm -rf` and secret files, but miss many other ways to delete or upload (`find -delete`, Python, encoded commands, PowerShell wrappers). That's normal for this kind of check, but users should be told plainly that **Full Auto is a speed bump, not a safety net.**
- 10. **Some one-click "Always allow" choices cover more than their label says** (e.g. allowing `curl` also allows uploads; allowing `npm install` allows install scripts).
- 11. **The assistant isn't blocked from reading YouCoded's own login files** (marketplace and GitHub tokens, remote-access password).

**Themes and displayed content**
- 12. **Themes can load styling from someone else's server, and that server can change it after approval.** Themes can't run code, but changed styling could hide or relabel the "Allow?" prompt. The theme filter has 3 confirmed bypasses, and the font link isn't checked at all.
- 13. **The main window has no "only run our own code" lock (CSP).** Code comments claim it has one; it doesn't. No way to get code in was found, but this is the standard second wall.
- 14. **An HTML file opened in the file viewer can read other project files and send them online.** Limited to files the viewer can already show (secret files are blocked), and it needs a click.
- 15. **"Open file" runs program files** (.exe, .sh, .bat) with one click.

**Hardening the app itself**
- 16. **The assistant's built-in browser runs with Chrome's own safety walls off.** A Chrome flaw on a bad site would have nothing to contain it. One-line fix, needs testing per system.
- 17. **Electron's built-in lockdown switches are all left off**, so another program could hijack YouCoded's process to run code under its name.
- 18. **The local AI model server has no password**, so other programs (and possibly websites) can use it. Wastes power; can't reach files.

**The server**
- 19. **The server can be flooded cheaply**, burning the daily database allowance (outage) or running up the Cloudflare bill. The rate limiter can be bypassed.
- 20. **Fake likes, installs and user counts** can be created cheaply.

**Data and privacy**
- 21. **Backup reuses an existing GitHub repo without checking it's private.** If it's public, conversations get published.
- 22. **The privacy policy is incomplete.** It doesn't mention that computer name, project names and a device ID go to the cross-device sync service, or the friends "online" feature, and two statements in it are inaccurate. This is a trust and legal risk once there are more users.
- 23. **Bug reports go to a public GitHub repo** and only scrub two kinds of keys (the user does see an editable preview first).

**Updates and plugins**
- 24. **YouCoded's built-in plugins update to whatever is newest on GitHub at every launch**, with no fingerprint check. If tampered with, every user gets it next launch. (Item 4 is the main protection here.)
- 25. **The key that signs updates can be used by anyone with write access to the app's GitHub repo.**

**Remote access and Android**
- 26. **Remote-access password guessing is only slowed, never locked out**, and short passwords are allowed. Only devices on your private Tailscale network can try. *(Note: remote access is switched on right now on this computer.)*
- 27. **A paired phone has full control of the computer**, by design. Losing a paired phone matters; there's no expiry on pairings.
- 28. **Android allows unencrypted connections**, so on shared Wi-Fi the phone pairing password could be read (Tailscale users are protected).
- 29. **The "ask before buy/send/delete" check in the assistant's browser looks for English button words**, so "Continue" or another language slips through.

**Shared computers only:** the safety-check scripts have a fallback channel in a shared folder that another account on the same computer could hijack to approve prompts.

Low-severity items (about 30) are in the specialist reports below.

---

## What we checked and found solid

These are the things you can say with confidence:

- **No way found to take over the app by sending it text.** Chat messages, files, plugin output and web pages are shown as plain content; links are limited to web and email; remote images need a click.
- **Every window is walled off** from the computer (isolation on, Node off, sandbox on), and the app's internal message channels have no "do anything" door.
- **App updates are signed and checked** against a built-in key before anything runs; older versions can't be pushed back; downloads only come from approved hosts over HTTPS.
- **Downloads of Node, Git and the local AI engine are fingerprint-checked.**
- **Passwords and API keys live in the computer's password vault**, not plain files, and stay out of the app's display layer. The app refuses to save them unencrypted.
- **The sudo (administrator) password is handled very well:** kept in memory only, wiped after use, never shown to the AI.
- **New users start in "Ask first."** Full Auto and Skip permissions are opt-in. Helper agents can't get more permissions than the chat that started them.
- **Remote access is off by default** and, when on, only reachable from your private Tailscale network, never the open internet or Wi-Fi. Pairing keys are stored and checked safely; unpairing really works; a phone can't change the host password or unpair others.
- **No other program or website can control YouCoded** on a normal one-person computer: every background connection needs a random secret or is private-network only. There are no clickable `youcoded://` links to abuse.
- **The Android app** exposes nothing to other phone apps, has backups off, and keeps its signing passwords out of the code.
- **The server:** no database injection, no way to read or change another user's data, admin pages refuse anyone else, secure random sign-in tokens stored scrambled, no IP addresses kept.
- **GitHub:** strangers' pull requests get no secrets and their text never runs as a command; build permissions are read-only by default; no leaked keys anywhere in the history of any repo; secret-leak blocking is on; Windows and Mac installers are properly signed.
- **The theme files themselves** can't run code or reach files outside their folder.

## Not checked (outside what code reading can see)

- Whether Destin's GitHub account uses two-factor login, and the GitHub setting for approving outside contributors' automated checks (Settings → Actions → General).
- Cloudflare account settings (firewall rules, API key permissions).
- The old game-room server that card #55 says is still running (its code isn't in these repos).
- Live testing: nothing was run against a real running app or server. Every finding comes from reading the code. The two re-checked items (#1 and #3) are confirmed by the lead in the code.

## Specialist reports (full detail, file:line evidence, suggested fixes)

All in `/tmp/claude-1000/-home-destin-youcoded-dev/c314c6e8-8bec-4ee2-ba8c-5dc5f2ae1169/scratchpad/security-audit/`:
`01-remote-access.md`, `02-electron-ipc.md`, `03-agent-safety.md`, `04-supply-chain-app.md`, `05-github-ci-deps.md`, `06-worker-backend.md`, `07-local-listeners.md`, `08-secrets-privacy.md`, `09-android-browser.md`.
