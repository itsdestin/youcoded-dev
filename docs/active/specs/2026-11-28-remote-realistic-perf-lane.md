---
title: Realistic performance test on the desktop PC, driven from the laptop
status: draft
date: 2026-11-28
plan: docs/active/plans/2026-11-27-performance-rebuild.md (Phase 0, item 3)
---

# Realistic performance test on the desktop PC

## What it is for

It reproduces the conditions where YouCoded actually hitches on Destin's machines. It measures them the way a person experiences them: frames that reach the screen, delays between a key press and the letter appearing, and freezes. It then compares two versions of the app, before and after a fix, under identical conditions.

**The gap it closes:**
- Today's lab runs with no graphics card, a quiet machine, a few chats and small made-up histories.
- That setup reported "nothing slow" while the real app froze about 6,000 times in two days.

## Why the desktop, not the laptop

| | Desktop (DestinsLinuxPC) | Laptop (Z13) |
|---|---|---|
| Graphics | RTX 4070 SUPER: real blur and animation cost, the thing the lab cannot measure | Strix Halo; it is Destin's working machine |
| Interference | Runs while nobody uses it; numbers are not disturbed by Destin's own work | Every run slows Destin down and his work disturbs the numbers |
| Risk to daily work | None, if the desktop's own YouCoded and files are left alone (below) | Contends with the live app |

**Cost of using the desktop:**
- It must be switched on and on the private network (Tailscale). It shows offline as of 2026-11-28.
- The test uses its screen while running.
- Results come from a different machine than the Z13, so the Z13's own 180 Hz screen still needs an occasional hand check.

## How it works

1. **The laptop starts a run:**
   - **Command:** `node scripts/perf-lab/remote.mjs run --build <commit> --against <commit> --scenarios all`.
   - **Connection:** SSH over Tailscale to the desktop.
   - **What it sends:** only the two commit ids and the scenario names. Nothing personal leaves the laptop.
2. **The desktop prepares, in a throwaway folder:**
   - checks out both commits from GitHub and builds each one;
   - makes a fixture HOME (see "What history it uses");
   - blocks sleep for the length of the run (`systemd-inhibit`).
3. **It runs each scenario 3 times per build, alternating builds** (A, B, A, B…) so drift in the machine's state does not favour one side:
   - **Type while others work:** a fresh chat with the heavy particle-and-glass theme. A typing pattern is played into it while 4 of 16 Claude Code chats stream fake replies from `fake-claude.cjs` (no real model, no cost, no network).
   - **Open every menu:** session menu, model picker, folder picker and ||| menu, 10 times each, first open and repeat opens.
   - **Switch chats:** a click through the session strip, including busy chats.
   - **Sit idle 10 minutes with 16 chats open:** catches timer rhythms like the 5 s and 10 s ones found in the field log.
4. **It measures:**
   - engine stalls (count and length, same detector as the in-app recorder);
   - frames that actually reached the screen (Chrome trace: presented and dropped frames);
   - long frames with the code that caused them;
   - key-to-screen delay for each typed key (Event Timing, from 16 ms up);
   - per-process CPU and GPU time.
5. **It reports back:**
   - only numbers come back: a JSON file, plus a plain-language table built by the same reporting code as `hitch-report.mjs`;
   - the table shows, per scenario, the two builds side by side, and says better, worse or same only when the difference is beyond run-to-run noise;
   - the throwaway folder is deleted.

## What history it uses

**Recommended: a generated history**
- It has the same shape as the Z13's: 136 project folders, about 1,800 session files and about 870 MB. Only those three counts, not names or content, are taken from the laptop.
- Chat content is generated filler: code blocks, tool calls and long and short replies, in realistic proportions.
- **Why:** no private conversation is ever copied to another machine, and every run uses identical data, so runs are comparable over weeks.
- The folder-scan bug depended on file count, not content, so a generated history reproduces it.

**Alternative: the desktop's own real history, read-only from a reflink copy**
- More real, but it changes as Destin uses the desktop, so runs drift.
- It holds his private chats inside a test folder, even though only for the length of the run.

## Safety rules the tool enforces

- **Never touches the desktop's installed YouCoded:**
  - it uses its own app profile and its own HOME;
  - it refuses to start if the desktop's YouCoded is running in the same graphical session (the test needs the screen);
  - it never reads or writes `~/.youcoded`, `~/.claude` or `~/.config/youcoded` on the desktop.
- **No network inside the test app:** sync, marketplace and update checks are off in the fixture settings, and fake-claude is the only "model".
- **No permanent changes to the desktop:** everything lives in one folder under `~/perf-lab-runs/`, removed at the end, plus a startup sweep of leftovers. Installing the SSH key and enabling the SSH server are one-time setup steps, done only with Destin's go-ahead.
- **Runs only when started by hand,** never on a timer, until Destin says otherwise.
- **Validity check before trusting it:** it must show the folder-scan bug on the build before youcoded#803 and its absence after. If it cannot, the tool is wrong and gets fixed before any app decision rests on it.

## What it still will not tell us

- **The Z13's own screen:** results come from a 4070 and the desktop's monitor, not the Z13's 180 Hz panel or its shared memory. A big win on the desktop is very likely a win on the Z13, but the size can differ.
- **Windows, macOS and phones.**
- **Real model streaming:** fake-claude replays realistic chunk sizes and timing, not real network behaviour.

## One-time setup needed

1. **Desktop:** switched on, signed in to the desktop session, and Tailscale running. It shows offline today.
2. **SSH from the laptop to the desktop.** The desktop's SSH server may not be on. Whether it is, and the laptop's key to authorise, are set up once, with Destin's OK, from a session on the desktop or by Destin.
3. **Tools on the desktop:** `node`, `git` and the build dependencies. Its workspace `~/youcoded-dev` already exists.

## Size of the work

| Part | Size |
|---|---|
| Remote runner: SSH, checkout and build, collect, cleanup | Medium |
| Generated-history builder | Small |
| The four scenarios | Medium; reuses `realism.mjs`, `switch-pingpong.mjs`, `gpu-cost-parse.mjs` and the trace plumbing that already exists |
| Before/after report | Small; reuses hitch-report's code |
| First validity run (bug before #803, gone after) | One run on the desktop |
