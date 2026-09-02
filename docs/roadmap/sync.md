# sync — moving your stuff between devices
Filing test: moving your stuff between devices, and the GitHub transport under it.

- [ ] Sync dead-ends on a stock machine with no `gh` installed — "Setting up…" then a green "All synced" over an empty
      space (beta.8 macOS VM, 2026-07-20). The gh-free path is code-complete on master; the only thing left is
      Destin's fresh-VM pass through the first real push with no gh installed (build ≥ `647bd242`).
      `settings/sync` `desktop` `blocked` `checked 2026-09-01`

- [ ] Tag or note a conversation from a phone and an open desktop window keeps showing the old tag/note until some
      unrelated event refreshes it (other phones update fine). Found 2026-08-22.
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-remote-set-tag-no-desktop-notify.md

- [ ] "Last synced just now" on the Backup & Sync self row and the Settings row while the device has been offline for
      days — recency ticks every poll whether or not GitHub was reached. From the PR #276 review, 2026-07-30.
      `settings/sync` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-sync-recency-counts-cycles-not-contact.md

- [ ] A crash-damaged sync repo on a device that is also offline (or signed out) shows an auth/network error every
      cycle and never repairs itself until it reconnects, though the repair needs no network. 2026-07-30.
      `settings/sync` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-corrupt-offline-sync-repo-never-heals.md

- [ ] With the SyncHub down, force-taking-over a session from a second install leaves the original holder running as
      if nothing happened — no interrupt, no "moved" pill, and the two installs keep rewriting each other's lease file.
      Seen in the M2 dev repro, 2026-07-23 (CC and native alike).
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-lease-loss-undetected-in-file-fallback.md

- [ ] Star a model as a favourite on one device and the model picker on your other device opens empty, with no hint
      why, until you type. Favourites never leave the device they were set on. From youcoded#279, 2026-07-31.
      `model-picker` `all` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-model-favourites-localstorage-only.md

- [ ] Backup & Sync popup follow-ups still owed from the PR #126 redesign: the "additional backups" master toggle has
      no real saved on/off (it just mirrors whether any backup is active), and the main toggle's checked-state while
      "Waiting on GitHub" reads OFF — undecided. 2026-07-15.
      `settings/sync` `desktop` `needs-verify` `checked 2026-09-01`

- [ ] Legacy conversation-index full retirement: the frozen read-only index (and its on-disk file) is still read by
      the resume browser as a fallback; delete the read path and the file once the residual legacy-only rows are
      confirmed unneeded. From the PITFALLS "Legacy sync demolition (Plan 2c)" sweep, 2026-07-15.
      `desktop` `needs-verify` `checked 2026-09-01`

- [ ] Decide: should stray `*.tmp` files be ignored by sync outright? A crash between write and rename can strand one
      in a synced folder and it then rides to every device as junk. Per-writer sweeps (PR #296) already cover the
      known writers; a blanket rule would also stop syncing and backing up any file a user genuinely named `.tmp`.
      Destin's call, deliberately not slipped into #296 (2026-08-12).
      `desktop` `decision` `checked 2026-09-01`

- [ ] Sync will hit GitHub's size ceiling for any daily user — the Z13's Personal space was 841 MB local / 652 MB on
      GitHub against a 1 GB soft limit, nothing ever prunes, and a handful of huge transcripts are the whole cost.
      Needs a design pass on where transcript bytes should live so every transcript is on every device, always.
      Measured 2026-07-30.
      `all` `parked` `checked 2026-09-01` → docs/active/investigations/2026-09-01-transcript-storage-long-term.md

- [ ] When two devices edit the same file, the only sign is one amber line in Backup & Sync that vanishes on restart
      and names no file — there is no way in the app to find the "(from …)" copy or pick which version to keep.
      Destin, beta.9 dogfood 2026-07-24; milestone his call.
      `settings/sync` `desktop` `parked` `checked 2026-09-01` → docs/active/investigations/2026-09-01-sync-conflict-copy-resolver.md

- [ ] Idea: same-machine takeover handoff without the hub — two installs sharing `~/YouCoded` (dev instance + built
      app) can see each other's lease files but can't deliver a takeover request when the SyncHub is down, since
      the request has exactly one transport. A file-based request signal would make hub-less handoff work. 2026-07-23.
      `desktop` `parked` `checked 2026-09-01`

- [ ] Idea: restore-from-backup redesign (removed in Plan 2c) — rethink it around local models, accounts and platform.
      2026-07-15.
      `all` `parked` `checked 2026-07-15`

- [ ] Idea: YouCoded Cloud sync transport — zero-setup sync with no GitHub needed, likely a paid tier (R2 content-
      addressed chunked storage, client-side end-to-end encryption, accounts). Must slot in below the SyncTransport
      contract-test seam with nothing above it changing. Spec §16. 2026-07-03.
      `all` `parked` `checked 2026-07-03`

- [ ] Idea: a synced per-device SystemState file (CPU/GPU/RAM/storage, OS, tool versions, local models, last seen)
      in the Personal space, queryable by the assistant ("what machines do I have", "can my laptop run this model"),
      with an optional Settings → System View dashboard. 2026-07-14.
      `all` `parked` `checked 2026-07-14`

- [ ] The last open v1.3 gate: after signing in to GitHub from inside the app (Connect GitHub), does
      Account → Connected accounts actually show that login? Sync working is not proof — it also works
      after a terminal `gh auth login` without the in-app flow ever running
      `settings/accounts` `desktop` `decision` `checked 2026-09-01` `v1.3`

- [ ] In the sync setup wizard the repo-name text box sits inside the radio button's label, so
      clicking into the box also flips the radio. Bug 1 of the 2026-07-19 input-migration family
      `settings/sync` `desktop` `needs-verify` `checked 2026-09-01`
