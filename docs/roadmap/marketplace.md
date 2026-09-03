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

- [ ] The stylesheet claims the marketplace grid pre-blurs one backdrop element, but no rule doing that
      could be found — so either the comment is wrong or every card carries its own live blur layer
      under a wallpaper theme. The comment currently justifies a "don't worry about it" decision
      `marketplace-screen` `all` `needs-verify` `checked 2026-08-07` `performance`

## backend

- [ ] There is no way to pay a pack author anything. Wanted: a tip that splits between YouCoded and
      the authors whose packs the user actually uses — Destin's ranking is the current theme's author
      first, then skill and other authors by a usage signal (invocations or installs, unresolved).
      Undesigned, and blocked on three missing pieces: an author claim-and-verify flow, a payout
      integration, and usage numbers the marketplace does not collect yet
      `marketplace-screen` `all` `parked` `checked 2026-09-02`

- [ ] A plugin that ships from a non-default branch gets scanned against the wrong code. Four live
      listings (three `netsuite-*`, one `42crunch`) were stamped "Likely safe" having read nothing;
      the false verdicts were cleared by hand 2026-08-31 and the 13 netsuite rows now read
      "Not checked" — and will forever, until the scan follows the branch the listing names.
      `all` `needs-verify` `checked 2026-09-03` `security` `v1.3` → docs/active/investigations/2026-09-01-marketplace-ingest-ignores-source-git-ref.md

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

- [ ] The "Likely safe" badge reads as a safety verdict, but the scan only looks for leaked secrets
      and file shapes; a public product cannot imply a check that never happened. Wording is
      Destin's call — candidate "No leaked secrets found"
      `marketplace-screen` `all` `decision` `checked 2026-09-03` `v1.3` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] No DMCA agent is registered ($6, ten minutes at copyright.gov), so the takedown process in the
      Terms carries no safe-harbour protection for plugin and theme copyright claims. Blocked on
      having the LLC's name to register it under
      `n/a` `blocked` `checked 2026-09-03` `v1.3` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

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

- [ ] Two marketplace plugins (spotify-services, youcoded-messaging) ship MCP manifests that use
      a placeholder the app never fills in, so their server command comes out literally wrong for
      everyone — the docs said the app expanded it; it only expands a different token
      `marketplace-screen` `all` `needs-verify` `checked 2026-09-01`

- [ ] Those same manifests list the platforms they support as a list, but the app reads a single
      platform field — so the platform filter silently does nothing for both plugins
      `marketplace-screen` `all` `needs-verify` `checked 2026-09-01`

- [ ] A tip jar that splits a user's donation between YouCoded and the marketplace authors whose
      packs they actually use. Destin's proposed ranking for who appears in the split: the author
      of the theme currently in use first, then skill and other pack authors ranked by some usage
      signal (invocation count, install count — unresolved which). Undesigned, and every piece is
      missing: authors have no way to claim an account or connect a payout method (Buy Me a Coffee
      or similar), there is no split math or UI, and the usage-ranking signal does not exist in
      marketplace analytics yet
      `marketplace-screen` `all` `parked` `checked 2026-09-03`
