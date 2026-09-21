# sync — moving your stuff between devices
Filing test: moving your stuff between devices, and the GitHub transport under it.

- [ ] Very long conversations (over 50 MB) stop updating on your other devices — the device that has them keeps
      them, and the Sync panel now says so, but the other devices never get the newest messages. Six of Destin's
      conversations (54–107 MB) hit this, 2026-09-16. Needs a way to sync long conversations in pieces.
      `settings/sync` `all` `decision` `checked 2026-09-16`

- [ ] The Personal sync history only grows: 1.7 GB on GitHub and 2.5 GB on the Z13 on 2026-09-16, with a
      save every few seconds while a conversation is running. GitHub asks repositories to stay under about 1 GB
      and warns hard near 5 GB, and nothing trims the history yet.
      `settings/sync` `all` `decision` `checked 2026-09-16`

- [ ] A device that falls far behind may never catch up on a slow connection: each upload step is cut off
      after 5 minutes and retried from the start. Not seen yet — the 2026-09-16 repair sent 280 MB in 44 s.
      `settings/sync` `desktop` `needs-verify` `checked 2026-09-16`

- [ ] If a conversation is over the sync size limit on this device AND another device changes its older
      copy, sync here may fail every cycle with "Sync merge could not complete". Reasoned in the 2026-09-16
      code review, not reproduced.
      `settings/sync` `desktop` `needs-verify` `checked 2026-09-16`

- [ ] A dev copy of the app syncs the same Personal folder as the real app at the same time, so the two
      race each other's sync steps. It let six over-limit files into the unpublished history on 2026-09-07
      (that case is now blocked at upload); other effects of the race are unverified.
      `settings/sync` `desktop` `needs-verify` `checked 2026-09-16`

- [ ] "Last synced" on the Backup & Sync self row is the NEWEST time across all your spaces, so
      one healthy space and two that cannot reach GitHub still read "just synced". Left as it
      was when the offline-ticking half shipped 2026-09-16; needs a call on newest vs oldest
      (or per-space rows). The rule itself lives in one helper (`self-sync-status.ts`) called
      from two places in main; the panel only picks which source to read
      `settings/sync` `desktop` `decision` `checked 2026-09-16`

- [ ] With the SyncHub down, force-taking-over a session from a second install leaves the original holder running as
      if nothing happened — no interrupt, no "moved" pill, and the two installs keep rewriting each other's lease file.
      Seen in the M2 dev repro, 2026-07-23 (CC and native alike).
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-lease-loss-undetected-in-file-fallback.md

- [ ] Two devices can resume the same conversation and both end up writing at once even when the
      SyncHub is healthy. Claiming is not one atomic step today: a resume that sees the lease free
      still syncs, opens the session, and only then asks to acquire — another device can take it in
      between, the loser's "no" is only logged, and the session stays open anyway. Two resumes
      started together can both pass the same gate for the same reason. Lease records also expire
      silently after 300 s without renewals, so a device that sleeps long enough can come back
      writing while another already holds the lease with no warning on either side. Found in the
      lease/handoff audit, 2026-09-21 (H1, H4, H5, plus the acknowledge half of H3).
      `settings/sync` `all` `decision` `checked 2026-09-21` → docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md

- [ ] A forced takeover or a failed final push can leave the resuming device starting from an older
      copy of the conversation: the new owner is in and working before the old device has finished
      sending its last turns, and those turns only show up later as a conflict copy. Nothing is
      lost permanently, but the person who resumed starts stale with no sign anything is missing.
      Needs an agreed meaning for "handoff finished" — either the resuming device waits for the old
      device's last push, or it says "final changes still arriving" and catches up afterwards.
      Same audit (H2, H3).
      `settings/sync` `desktop` `decision` `checked 2026-09-21` → docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md

- [ ] Backup & Sync transparency pass on lease handoffs: the (i) popup says nothing about what
      happens when two devices have the same conversation open, and the takeover dialog's wording
      promises more than the system can know — "didn't answer" when really it "couldn't confirm the
      handoff". The first confirmation also doesn't say the old device ends up with its own separate
      copy unless you hover, and the conflict notice disappears. Destin asked for this directly
      (2026-09-21). Same audit (F1/F4 hub-down warning, F3, F7, M1).
      `settings/sync` `desktop` `decision` `checked 2026-09-21` → docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md

- [ ] The sync worker accepts whatever device id a lease message claims without checking it against
      the signed-in connection that sent it, so a client in your account could act as another of
      your devices — acquiring, renewing or releasing its lease. Needs the lease to be bound to the
      authenticated connection plus a test that a forged device id is refused. Same audit (M2).
      `settings/sync` `all` `decision` `checked 2026-09-21` → docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md

- [ ] You can open a conversation your OTHER machine is actively working in, and nothing warns you —
      no dialog, no pill, no note. Destin, 2026-09-03, resuming from a dev window while the same
      sessions ran on his laptop. Mechanism is understood and is the ACQUIRER half of the item
      above: `acquire()` in `conversations/lease-client.ts` asks the hub, and on a null reply
      (hub down / no delivery path) holds OPTIMISTICALLY and returns ok — the never-block rule.
      The takeover dialog's three phases (`confirm` / `force` / `undeliverable`, `App.tsx`) all
      hang off the hub having ANSWERED, so a hub that cannot answer produces silence rather than
      any of them. The lease-FILE fallback cannot cover this since files moved to `userData`
      (`fbc5d296`, 2026-07-30) and two machines never share that dir. So cross-machine protection
      is exactly as good as hub reachability, and degrades silently to none. Never-block is a
      deliberate choice; never-WARN looks like an oversight of it — an optimistic hold could still
      say "couldn't check your other devices". CAVEAT before acting: this repro was a dev profile,
      whose isolated userData may mean it never connects to the hub at all, so confirm in the
      installed app first
      `settings/sync` `desktop` `needs-verify` `checked 2026-09-03` → docs/active/investigations/2026-09-01-lease-loss-undetected-in-file-fallback.md

- [ ] Star a model as a favourite on one device and the model picker on your other device opens empty, with no hint
      why, until you type. Favourites never leave the device they were set on. From youcoded#279, 2026-07-31.
      **Same empty list, second cause, seen 2026-09-06:** a FRESH install has no favourites at all, so the picker
      offers nothing — not the local models you just downloaded, not even a Claude one — until you guess to type a
      name. Destin hit it in a clean profile and reasonably read it as "local models are missing". Whatever fixes the
      empty state has to cover both: syncing favourites helps the second device and does nothing for the first run.
      `model-picker` `all` `confirmed` `checked 2026-09-06` → docs/active/investigations/2026-09-01-model-favourites-localstorage-only.md

- [ ] Backup & Sync popup follow-ups still owed from the PR #126 redesign: the "additional backups" master toggle has
      no real saved on/off (it just mirrors whether any backup is active), and the main toggle's checked-state while
      "Waiting on GitHub" reads OFF — undecided. 2026-07-15.
      `settings/sync` `desktop` `needs-verify` `checked 2026-09-01`

- [ ] Legacy conversation-index full retirement: the frozen read-only index (and its on-disk file) is still read by
      the resume browser as a fallback; delete the read path and the file once the residual legacy-only rows are
      confirmed unneeded. From the PITFALLS "Legacy sync demolition (Plan 2c)" sweep, 2026-07-15.
      `desktop` `needs-verify` `checked 2026-09-01`

- [ ] Decided 2026-09-02: ignore stray `*.tmp` files everywhere. A crash between write and rename can strand one
      in a synced folder and it then rides to every device as junk. Per-writer sweeps (PR #296) already cover the
      known writers; a blanket rule would also stop syncing and backing up any file a user genuinely named `.tmp`.
      Destin's call, deliberately not slipped into #296 (2026-08-12).
      `desktop` `confirmed` `checked 2026-09-02`

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

