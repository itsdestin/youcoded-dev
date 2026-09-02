# marketplace — finding, installing and rating plugins and themes
Filing test: finding, listing, installing, rating plugins or themes, and the Worker behind
them. Not here: the theme renders wrong (themes).

## catalog

- [ ] The "What this can do" panel under-reports capable plugins: measured 2026-08-31, `github`,
      `playwright`, `serena` and `context7` listed a single "Adds…" line with no shell, network or
      key. Re-checked 2026-09-01 on the live catalog: all four now show their real shell/network/key
      lines after the rescan. Still unverified: `desktop-commander` wraps a terminal-command server
      and lists only "Connects to the internet" + "Adds 6 skills" — is that honest for what it does?
      `marketplace-screen` `all` `needs-verify` `checked 2026-09-01` `security`

- [ ] Below five votes a marketplace card says "3 people found this helpful" / "1 of 2 people found
      this helpful" instead of a percentage (shipped 2026-08-28, flagged by Destin for a second look).
      Untested: does a grid mixing worded counts and bare "Helpful 92%" read as inconsistent, and does
      a new plugin showing "1 person found this helpful" look weaker than one showing nothing?
      Options: keep it · show the raw count as a numeral beside the thumbs · show nothing under five.
      One workbench deck answers it.
      `marketplace-screen` `all` `decision` `checked 2026-08-30`

- [ ] Two theme previews (Devil's Garden, Kuromi Dreamer) showed a blank band in the Electron app
      while the same registry URLs loaded fine in a browser (2026-08-25). Since 2026-08-30 a preview
      that fails to load falls back to the theme's colour swatches instead of blank — but whether the
      pictures themselves load in the app now is unverified.
      `marketplace-screen` `desktop` `needs-verify` `checked 2026-09-01` `needs-repro`

- [ ] The stylesheet claims the marketplace grid pre-blurs one backdrop element, but no rule doing that
      could be found — so either the comment is wrong or every card carries its own live blur layer
      under a wallpaper theme. The comment currently justifies a "don't worry about it" decision
      `marketplace-screen` `all` `needs-verify` `checked 2026-08-07` `performance`

## backend

- [ ] A plugin that ships from a non-default branch gets scanned against the wrong code. Four live
      listings (three `netsuite-*`, one `42crunch`) were stamped "Likely safe" having read nothing;
      the false verdicts were cleared by hand 2026-08-31 and the 13 netsuite rows now read
      "Not checked" — and will forever, until the scan follows the branch the listing names.
      `all` `confirmed` `checked 2026-09-01` `security` → docs/active/investigations/2026-09-01-marketplace-ingest-ignores-source-git-ref.md

- [ ] Put the Worker on a custom domain. It is served from a `workers.dev` address, where
      Cloudflare's edge cache and the rate limiter both do nothing. The work is small and gated
      only on Destin picking a domain — the same decision the landing-page rebuild needs.
      `all` `decision` `checked 2026-09-01` → docs/active/investigations/2026-09-01-marketplace-worker-workers-dev-no-cache.md

- [ ] The Worker's rate limit has never fired in production — measured 2026-08-28: 160 requests in
      ~2 s against a 60-per-minute route, all 200, zero 429s. Ratings, reports, installs, exports and
      public reads have no brake at all until the custom domain above lands.
      `all` `confirmed` `checked 2026-09-01` `security` → docs/active/investigations/2026-09-01-marketplace-worker-workers-dev-no-cache.md

- [ ] Every marketplace refresh re-downloads the whole catalog (~1 MB on the wire, ~5,000 rows)
      even when one listing changed. Wanted: send only what changed since the client's last version,
      on both platforms. Not urgent at today's size; the unlock at ~20,000 rows.
      `all` `confirmed` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-marketplace-catalog-payload-size.md

- [ ] The catalog payload carries detail-page data (capabilities, scan findings, licence, member
      list) for every row, though a grid card needs a fraction of it. Wanted: a slim list payload,
      the rest fetched when a card is opened. Do this before any paging work.
      `all` `confirmed` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-marketplace-catalog-payload-size.md

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
      `library` `all` `confirmed` `checked 2026-09-01` `security` → docs/active/investigations/2026-09-01-marketplace-installed-plugin-turns-unsafe.md

- [ ] Two marketplace plugins (spotify-services, youcoded-messaging) ship MCP manifests that use
      a placeholder the app never fills in, so their server command comes out literally wrong for
      everyone — the docs said the app expanded it; it only expands a different token
      `marketplace-screen` `all` `needs-verify` `checked 2026-09-01`

- [ ] Those same manifests list the platforms they support as a list, but the app reads a single
      platform field — so the platform filter silently does nothing for both plugins
      `marketplace-screen` `all` `needs-verify` `checked 2026-09-01`
