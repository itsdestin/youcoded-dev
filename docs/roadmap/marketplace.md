# marketplace — finding, installing and rating plugins and themes
Filing test: finding, listing, installing, rating plugins or themes, and the Worker behind
them. Not here: the theme renders wrong (themes).

## catalog

- [ ] Catalog listings and previews: 3 small faults.
      (a) The "What this can do" panel under-reported capable plugins; four now show their real
      shell/network/key lines, but `desktop-commander` lists only "Connects to the internet" +
      "Adds 6 skills" — unverified whether that is honest. (b) Theme previews (Devil's Garden,
      Kuromi Dreamer) showed a blank band in the app; they now fall back to colour swatches, but
      whether the pictures load is unverified. Destin 2026-09-02: "previews in general are
      unreliable (not always created or shown correctly); fix the class". (c) A theme installed
      from a preview can keep the old mascot after its first release (Morning Rounds: Update hidden
      because both versions said 1.0.0); prevent it without forcing every new theme to bump.
      `marketplace-screen` `all` `confirmed` `P3` `checked 2026-09-01` `security`

- [ ] Parked ideas: 4 marketplace ideas, none designed.
      (a) Packs that replace the assistant's system prompt and tool descriptions, installed like a
      theme; needs a safety boundary, a preview of changes and a revert. (b) WeCoded as a public
      registry others can read (Layer E), after trust and abuse handling exist (report:
      docs/active/investigations/2026-09-01-marketplace-public-sub-registry-layer-e.md). (c) A tip jar
      that splits a donation between YouCoded and the authors whose packs you use; authors cannot
      claim accounts or payouts and no usage signal exists. (d) Spotify installed on Linux or
      Android with an older build keeps a broken, failed connection entry; low priority.
      `all` `parked` `P3` `checked 2026-08-27`

## backend

- [ ] Admin analytics, comments and service upkeep: 6 small faults.
      (a) The Regions list in admin analytics is empty; every device arrives with a blank region.
      (b) Destin's Android phone is still counted as a user; likely fix is a "Copy analytics ID"
      control in About. (c) You cannot delete your own marketplace comment. (d) You cannot report
      a marketplace comment; needs a reporting UI, admin queue and resolution flow (report:
      docs/active/investigations/2026-09-01-marketplace-report-a-comment.md). (e) The old
      `wecoded-marketplace-api...workers.dev` address must stay alive until no supported build uses
      it; switching it off once took down the games lobby, sync and accounts. (f) The "publish to
      marketplace" plugin cannot be changed by a normal pull request because its deliberate test
      keys trip the key scan, so its help-text update was dropped.
      `all` `confirmed` `P3` `checked 2026-09-01`

- [ ] The "Likely safe" badge claims more than the scan checks: it only looks for leaked secrets
      and file shapes. Destin, 2026-09-23: keep the wording and make the scan earn it — "maybe just
      use an llm … to evaluate for certain criteria". Wanted: an AI review of each plugin against a
      written list of what makes one unsafe, feeding the badge.
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#20): postponed — "1.3.2/1.3.3"
      `marketplace-screen` `all` `confirmed` `P2` `checked 2026-09-23` `v1.3.2` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] Harden account sign-in against link-based account takeover. The GitHub device-flow can be
      abused to hijack a YouCoded account — social layer only (comments, friends, game records,
      sync, deleting the account), not the user's GitHub account, computer or files. Rated MEDIUM
      and deferred because the exploitable pool is smallest at launch; fix before accounts get real
      traction. Fix designed (device-flow to loopback proof); needs a real phone and a staged Worker
      rollout. Exploit detail is in the private security folder (~/system/youcoded-security-2026-09-10/, "#5").
      `all` `parked` `P2` `checked 2026-09-10` `security`

## install

- [ ] Installing and library: 3 faults.
      (a) 314 Docker-packaged MCP listings can be browsed but not installed; the page shows "Open
      source" instead of "Get" (report: docs/active/investigations/2026-09-01-marketplace-docker-mcp-install.md).
      (b) Installed plugins vanish when Claude Code refreshes its marketplace; bundled ones reinstall
      on launch, others stay dead until reinstalled by hand; needs a design pass (report:
      docs/active/investigations/2026-09-01-marketplace-plugins-install-into-cc-owned-dir.md). (c)
      Nothing warns you when an installed plugin turns unsafe; the Library row never changes (report:
      docs/active/investigations/2026-09-01-marketplace-installed-plugin-turns-unsafe.md).
      `all` `confirmed` `P3` `checked 2026-09-01` `security`
