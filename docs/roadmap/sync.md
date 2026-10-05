# sync — moving your stuff between devices
Filing test: moving your stuff between devices, and the GitHub transport under it.

- [ ] Two devices editing the same file: no way in the app to see or resolve the conflict.
      The only sign is one amber line in Backup & Sync that vanishes on restart and names no file; there is no
      way to find the "(from …)" copy or pick which version to keep, and the panel can show a green "All synced"
      beside that amber line (seen 2026-09-23). Destin (beta.9 dogfood 2026-07-24; 2026-09-23): "we need to add
      a better resolution mechanism/ui to the roadmap for split conversations with multiple copies" —
      conversation-specific resolution, not just a warning; design open.
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#22): postponed — "1.3.3"
      `settings/sync` `desktop` `decision` `P2` `checked 2026-09-23` `v1.3.3` → docs/active/investigations/2026-09-01-sync-conflict-copy-resolver.md

- [ ] Very long conversations (over 50 MB) stop updating on your other devices. The device that has them keeps
      them, and the Sync panel now says so, but other devices never get the newest messages. Six of Destin's
      conversations (54–107 MB) hit this, 2026-09-16. Needs a way to sync long conversations in pieces.
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#23): postponed until after 1.3.1
      `settings/sync` `all` `decision` `P2` `checked 2026-09-16`

- [ ] Sync security gaps: three things that could expose secrets or let one device pose as another.
      (a) A project where an older app version uploaded a password file (like `.env`) keeps that copy online and
      in history; new edits stay on the device, but removing it means rewriting the project's history on every
      device (decided out of scope, 2026-09-23). (b) The Android app's GitHub backup copies `mcp.json` (which can
      hold service keys) and settings into the backup repository; the desktop app no longer has this backup.
      (c) The sync worker accepts whatever device id a lease message claims without checking the signed-in
      connection, so a client in your account could act as another of your devices (decided 2026-09-21 to file
      as a potential issue, not fix now; report: docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md).
      `settings/sync` `all` `needs-verify` `P2` `checked 2026-09-21` `security`

- [ ] Same conversation on two computers: four gaps in warnings and takeover.
      (a) With the SyncHub down, force-taking-over a session leaves the original holder running as if nothing
      happened, and the two installs keep rewriting each other's lease file (dev repro 2026-07-23; report:
      docs/active/investigations/2026-09-01-lease-loss-undetected-in-file-fallback.md). (b) You can open a
      conversation your other machine is actively working in with no warning (Destin, 2026-09-03); with the hub
      unreachable the app stays silent, and the repro was a dev profile, so confirm in the installed app first.
      (c) A device that slept past its 300 s lease can wake still writing a conversation another device took, with
      no warning; the "yield and take back over" step was not built. (d) Unverified: a conversation resumed on
      another computer may miss the latest helper messages (deferred by Destin 2026-09-23; report:
      docs/active/investigations/2026-09-23-handoff-message-freshness.md).
      `all` `confirmed` `P3` `checked 2026-09-01` → docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md

- [ ] Backup & Sync panel: three wording and status gaps.
      (a) "Last synced" shows the NEWEST time across spaces, so one healthy space and two that cannot reach
      GitHub still read "just synced"; needs a call on newest vs oldest or per-space rows. (b) The (i) popup says
      nothing about two devices having the same conversation open, and the takeover dialog says "didn't answer"
      when it really "couldn't confirm the handoff" (Destin asked, 2026-09-21; decided: no hub-down warning, a
      2–3 sentence paragraph in the popup, keep the first confirmation short). (c) From the PR #126 redesign: the
      "additional backups" master toggle has no real saved state, and the main toggle reads OFF while "Waiting on
      GitHub" (undecided).
      `settings/sync` `desktop` `needs-verify` `P3` `checked 2026-09-01`

- [ ] Sync housekeeping: six leftovers and rare edge cases.
      (a) Two projects made before 2026-09-23 whose names differ only by capitals ("Notes", "notes") still share
      one online copy and mix files. (b) If the app crashes mid-sync, saved copies of files git doesn't manage
      stay in the hidden sync folder forever. (c) A conversation over the size limit here, plus a change to its
      older copy on another device, may fail every sync with "Sync merge could not complete" (reasoned, not
      reproduced). (d) A dev copy of the app syncs the same Personal folder as the real app and they race each
      other (once let six over-limit files into history; now blocked at upload). (e) The old frozen conversation
      index is still read by the resume browser as a fallback; delete it once unneeded. (f) Decided 2026-09-02:
      ignore stray `*.tmp` files everywhere (a crash can strand one and it rides to every device), which would
      also stop syncing a file a user genuinely named `.tmp`.
      `desktop` `confirmed` `P3` `checked 2026-09-01`

- [ ] Starring a model as a favourite on one device leaves the model picker on your other device empty until you
      type, since favourites never leave the device (youcoded#279, 2026-07-31). Same empty list, second cause
      (2026-09-06): a FRESH install has no favourites, so the picker offers nothing — not downloaded local
      models, not even a Claude one — until you guess a name. Destin read it as "local models are missing". A fix
      must cover both: syncing helps the second device, not first run.
      `model-picker` `all` `confirmed` `P3` `checked 2026-09-06` → docs/active/investigations/2026-09-01-model-favourites-localstorage-only.md

- [ ] Parked ideas: sync (four things).
      (a) Same-machine takeover without the hub: two installs sharing `~/YouCoded` cannot deliver a takeover
      request when the SyncHub is down; a file-based request signal would fix it. (b) Restore-from-backup
      redesign (removed earlier), rethought around local models, accounts and platform. (c) YouCoded Cloud sync:
      zero-setup sync with no GitHub, likely a paid tier, end-to-end encrypted, below the existing transport
      contract. (d) A synced per-device SystemState file (hardware, OS, tool versions, local models) the
      assistant can query ("can my laptop run this model"), with an optional Settings dashboard.
      `all` `parked` `P3` `checked 2026-07-03`
