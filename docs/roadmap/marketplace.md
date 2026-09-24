# marketplace — finding, installing and rating plugins and themes
Filing test: finding, listing, installing, rating plugins or themes, and the Worker behind
them. Not here: the theme renders wrong (themes).

## catalog

- [ ] The marketplace distributes themes and skills but nothing that changes how the assistant is
      instructed. Wanted: packs that replace the native harness's system prompt and its built-in tool
      descriptions, installed the way a theme is. Undesigned, and it needs three things a theme does
      not: a boundary so a pack cannot silently strip real safety instructions, a preview of what a
      pack changes before installing, and a revert to the stock prompt
      `marketplace-screen` `all` `parked` `checked 2026-09-02`

- [ ] The "What this can do" panel under-reports capable plugins: measured 2026-08-31, `github`,
      `playwright`, `serena` and `context7` listed a single "Adds…" line with no shell, network or
      key. Re-checked 2026-09-01 on the live catalog: all four now show their real shell/network/key
      lines after the rescan. Still unverified: `desktop-commander` wraps a terminal-command server
      and lists only "Connects to the internet" + "Adds 6 skills" — is that honest for what it does?
      `marketplace-screen` `all` `needs-verify` `checked 2026-09-01` `security`

- [ ] Two theme previews (Devil's Garden, Kuromi Dreamer) showed a blank band in the Electron app
      while the same registry URLs loaded fine in a browser (2026-08-25). Since 2026-08-30 a preview
      that fails to load falls back to the theme's colour swatches instead of blank — but whether the
      pictures themselves load in the app now is unverified.
      Destin 2026-09-02: still failing — and previews in general are unreliable (not always created or shown correctly); fix the class
      `marketplace-screen` `desktop` `confirmed` `checked 2026-09-02`

- [ ] A theme installed from a pre-release preview can show the old mascot after its first
      marketplace publication, even though the published art changed: Morning Rounds' blue
      preview and red release both declared 1.0.0, so Update was hidden and applying kept the
      blue installed files. The PR bump guard compares only against main; it explicitly skips a
      new slug, even when that slug was already installed from a preview. Destin asked to ship
      1.0.1 for now (wecoded-themes#34); prevent this for future preview-to-first-release
      installs without making every genuinely new theme bump unnecessarily, 2026-09-22
      `marketplace-screen` `desktop` `confirmed` `checked 2026-09-22`

## backend

- [ ] The Regions list in admin analytics is empty — "Region data isn't coming through yet." Every
      device in the last 30 days arrives with a blank region, while countries come through fine.
      Seen on Destin's analytics dashboard 2026-09-13; cause not looked into
      `n/a` `needs-verify` `checked 2026-09-13`

- [ ] Destin's Android phone (both the regular app and the ReleaseTest app) is still counted as a
      user in admin analytics — both of his Linux computers are left out as of 2026-09-13. Android
      gives each app its own private ID that a USB connection can't read for these builds, so the
      likely fix is a "Copy analytics ID" control in the app's About screen, then adding both IDs
      `n/a` `confirmed` `checked 2026-09-13`

- [ ] Every marketplace refresh re-downloads the whole catalog (~1 MB on the wire, ~5,000 rows)
      even when one listing changed. Wanted: send only what changed since the client's last version,
      on both platforms. Not urgent at today's size; the unlock at ~20,000 rows.
      `all` `needs-verify` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-marketplace-catalog-payload-size.md

- [ ] The catalog payload carries detail-page data (capabilities, scan findings, licence, member
      list) for every row, though a grid card needs a fraction of it. Wanted: a slim list payload,
      the rest fetched when a card is opened. Do this before any paging work.
      `all` `needs-verify` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-marketplace-catalog-payload-size.md

- [ ] You cannot delete your own marketplace comment, on any platform. Reviews had it; comments
      have only the admin takedown route.
      `marketplace-screen` `all` `needs-verify` `checked 2026-09-01`

- [ ] You cannot report a marketplace comment. Deliberately left out of the feedback v1 (the mockup's
      Report button filed against the commenter's star rating and was removed 2026-08-28); this is a
      re-add that needs the reporting UI, an admin queue and a resolution flow, not a redesign.
      `marketplace-screen` `all` `needs-verify` `checked 2026-09-01` → docs/active/investigations/2026-09-01-marketplace-report-a-comment.md

- [ ] WeCoded as a public sub-registry others can read (Layer E): the official MCP Registry
      sub-registry API with our verdicts attached, a well-known skills index for Hermes-style taps,
      installed skills written to each agent's path, and reading the 25,291-server official MCP
      Registry. Sequenced after the trust layer and abuse handling exist; it is a public commitment.
      `all` `parked` `checked 2026-08-27` → docs/active/investigations/2026-09-01-marketplace-public-sub-registry-layer-e.md

- [ ] The "Likely safe" badge claims more than the scan checks: it only looks for leaked secrets
      and file shapes. Destin, 2026-09-23: keep the "Likely safe" wording and make the scan earn it
      instead — "maybe just use an llm … to evaluate for certain criteria". Wanted: an AI review of
      each plugin against a written list of what makes one unsafe, feeding the badge
      `marketplace-screen` `all` `confirmed` `checked 2026-09-23` `v1.3.1` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] Harden account sign-in against link-based account takeover: the GitHub device-flow can be abused
      to hijack a YouCoded account — social layer only (comments, friends, game records, sync, up to
      deleting the account), NOT the user's GitHub account, computer or files. Pre-launch review rated
      it MEDIUM, and the exploitable pool is smallest at launch (the attack needs an existing account),
      so it is deferred — but fix before the accounts/social features get real traction. Fix designed
      (device-flow → loopback proof); needs a real phone and a staged Worker rollout. Exploit detail is
      kept out of this public repo — full record in the private security folder
      (~/system/youcoded-security-2026-09-10/, "#5").
      `all` `parked` `checked 2026-09-10` `security`

- [ ] Retire the old `wecoded-marketplace-api.destinj101.workers.dev` API address. It is kept alive
      by `workers_dev = true` in worker/wrangler.toml only because shipped builds hardcode it —
      stable v1.2.4 and every beta up to 1.3.0-beta.71 do. Attaching the api.youcoded.ai custom
      domain on 2026-09-03 silently switched it off and took the games lobby, Backup & Sync and the
      whole account API down for those users; a hand deploy brought it back on 2026-09-06, a later
      deploy from master turned it off again, and the line finally landed on master 2026-09-11
      (wecoded-marketplace#90 — the address answered 200 again the same day). Retire only once no
      supported build names it: that needs a released build everyone is on, and ideally the address
      read from config rather than compiled in, so the next move cannot repeat this
      `all` `confirmed` `checked 2026-09-11`

- [ ] The "publish to marketplace" plugin can't be changed through a normal pull request: any
      change makes the plugin check scan the whole plugin, and the plugin's deliberate fake keys
      (kept on purpose to test its own secret scrubbing) fail the blocking hard-coded-key scan; a
      version bump is required too. Because of this, the 2026-09-23 help-text update was
      dropped, so the plugin still tells authors to copy `${PACKAGE_DIR}` instead of
      recommending `{{plugin_root}}` and the `platforms` list, which the MCP authoring guide
      already documents. Wanted: let the scan tell deliberate test fixtures from real content,
      then land the wording (found 2026-09-23)
      `n/a` `confirmed` `checked 2026-09-23`

## install

- [ ] 314 Docker-packaged MCP listings can be browsed but not installed — the detail page shows
      "Open source" instead of "Get". The app supports MCP servers fully; the installer just has
      no way to acquire a container image, and it would need Docker on the user's machine.
      `marketplace-screen` `all` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-marketplace-docker-mcp-install.md

- [ ] Installed plugins vanish when Claude Code refreshes its marketplace: seen 2026-07-18, both
      bundled plugins registered and enabled but their folders gone. Bundled ones silently
      reinstall on next launch; any other installed plugin stays dead until reinstalled by hand.
      Needs a design pass before fixing.
      `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-marketplace-plugins-install-into-cc-owned-dir.md

- [ ] Nothing warns you when a plugin you already installed turns unsafe. The catalog re-scans on
      every author push and can flip a listing to "Caution", but the Library row never changes and
      no notification fires — the shield only shows on the marketplace page you have no reason to
      revisit.
      `library` `all` `needs-verify` `checked 2026-09-01` `security` → docs/active/investigations/2026-09-01-marketplace-installed-plugin-turns-unsafe.md

- [ ] There is no way to pay a pack author anything. Wanted: a tip jar that splits a user's
      donation between YouCoded and the marketplace authors whose packs they actually use.
      Destin's proposed ranking for who appears in the split: the author of the theme currently
      in use first, then skill and other pack authors ranked by some usage signal (invocation
      count, install count — unresolved which). Undesigned, and every piece is missing: authors
      have no way to claim an account or connect a payout method (Buy Me a Coffee or similar),
      there is no split math or UI, and the usage-ranking signal does not exist in marketplace
      analytics yet (was two items, 2026-09-02 and 2026-09-03; merged 2026-09-16)
      `marketplace-screen` `all` `parked` `checked 2026-09-16`

- [ ] People who installed the Spotify plugin on Linux or Android with an older build keep a
      broken, failed connection entry for it, because the app's plugin check only ever adds
      entries and never removes one the plugin no longer supports on that device. Low priority
      (found 2026-09-23)
      `all` `parked` `checked 2026-09-23`
