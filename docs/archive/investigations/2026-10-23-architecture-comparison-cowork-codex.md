---
status: shipped
---
# YouCoded vs Claude desktop + Cowork vs Codex desktop (quick look, 2026-10-23)

Plain-language, shallow on purpose. YouCoded facts come from our own docs; the other two come from the web, and most of what is known about their insides is NOT published.

## Table

| | YouCoded | Claude desktop + Cowork | Codex desktop |
|---|---|---|---|
| Framework | Electron (a web page inside a desktop shell). The same screens run on Android inside a phone web view. | Not stated by Anthropic. Third-party bug reports call it Electron-based. | Not stated officially. One secondary source says Electron; unconfirmed. |
| Where the agent runs | On your computer, in the app's own background program. Two kinds: Claude Code (a terminal program the app drives) and our own "native" agent for other models. | Two modes. Local: the agent loop runs on your computer, but commands run in a sandboxed Linux virtual machine. Cloud: runs on Anthropic's servers. ([Anthropic](https://support.claude.com/en/articles/14479288-cowork-architecture-overview)) | A small helper program (the "App Server") bundled with the app and started as a child process. Codex Web runs it in a cloud container. ([InfoQ](https://www.infoq.com/news/2026/02/opanai-codex-app-server)) |
| Isolation / safety | Permission prompts; separate test copies for development. No virtual machine for the user's work. | Strongest: a real virtual machine (Apple's on Mac, Hyper-V on Windows), network filtering, permission system. | Per-task git "worktrees" (separate folder copies), plus an operating-system sandbox that limits edits to the working folder and asks before network use. ([OpenAI docs](https://learn.chatgpt.com/docs/app); sandbox details secondary) |
| Long conversations | Loads the newest page of history first, more on scroll-back; only draws what is on screen; folds far-off messages into blank spacers; lists draw 50 at a time. | Not public. | Saved "threads" with stored event history that can be resumed or forked. How the screen handles very long ones: not public. |
| Streaming / drawing | Streamed text redraws at most about 60 times a second; huge code blocks drawn in 20-line pieces; hidden tabs do zero work. | Not public. | Reply arrives as small started / piece / finished events. Screen drawing: not public. |
| Local models | Yes: a built-in local engine plus many cloud providers. | Not documented (looks Claude-only). | Not documented for the desktop app. |
| Desktop / Android / web | Desktop, Android, and a remote browser/phone link to your computer. | Desktop; cloud sessions reachable from the web. Android: not covered here. | Mac, Windows, Linux pages exist; Codex Web in the browser. Android: not covered here. |
| Published perf work | Extensive and internal: rules for every screen element, speed tests that fail the build, an always-on freeze recorder, a lab that measures real app builds. | None found from Anthropic. Users report big memory use, a ~10 GB virtual machine file, and freezes (unofficial bug reports). | None found. |

## What this means for us

1. **Our freezes come from drawing, not from the agent.** Because our agent runs beside the screen, what hurts is the web page redoing work: long code blocks, many open tabs, long histories. That is exactly what our rules and lab target. The recent test showed it: opening a large file took 807 ms before the fixes and 104 ms after.
2. **We are lighter than Cowork on the machine.** Cowork's virtual machine is its safety feature and, per users, its weak spot (large disk file, starts even when unused, memory growth). We skip that cost, but we also lack that level of lock-down. This is a deliberate trade, not an oversight.
3. **Codex's split is worth learning from.** Its agent is a separate program talking to the screen through a small, steady message stream (started / piece / finished). We already do something similar (our "core" runs without Electron), so a freeze in one cannot easily lock the other.
4. **Worktrees are a safety idea we could borrow.** Codex gives each task its own folder copy, so parallel work cannot collide. Our workspace does this for developers; the app itself does not offer it to users.
5. **What they don't do (as far as is public):** run on Android with the same screens, run local models, link a phone to the computer, or publish performance guards. Nobody publishes numbers, so we cannot claim we are faster, only that we measure.
6. **Honest warning:** our own test found one regression still unexplained: typing while a 2,000-line code block streams in got slower (about 61 ms vs 12 ms) with the combined fixes.

## Confidence

- **Verified (our docs / official pages):** all YouCoded cells; Cowork VM, local-vs-cloud and "agent loop native" (Anthropic support article); Codex App Server design (InfoQ summary of OpenAI's post).
- **Secondary, treat with care:** Codex worktrees and sandbox specifics beyond the nav labels; "Codex is Electron"; "Claude desktop is Electron" (user bug reports only).
- **Not public / not found:** how either app handles long conversations, streaming draws, local models, Android, and any internal performance numbers. Nothing here is guessed; those cells say so.
- Searches were standard mode only; the Codex docs page fetched was a landing page with little detail.
