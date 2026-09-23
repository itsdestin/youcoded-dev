# operations — running YouCoded the project: website, marketing, legal and community
Filing test: is it about youcoded.ai, promotion, the company's legal paperwork or the r/youcoded community, rather than the app or how it is built? Yes.
Not here: the download builds themselves, installer signing and store uploads (dev-workspace → release), or anything inside the app.
seen-on is always n/a here.

- [ ] REVERT NOW THAT 1.3.0 HAS SHIPPED: youcoded.ai's download buttons hand out the newest
      release INCLUDING pre-releases, so visitors get a beta instead of a release. Deliberate
      and temporary while v1.2.4 (May) was the only release (Destin, 2026-09-03). 1.3.0 shipped
      2026-09-20, so the reason is gone: put the buttons back on stable-only. The beta
      pre-releases can STAY published — the in-app beta channel (shipped 2026-09-13) is how a
      tester gets them now, and deleting them would strand anyone already on one
      `n/a` `confirmed` `checked 2026-09-20` `v1.3.0`

- [ ] Landing-page live embed goes fully blurred under framed wallpaper themes — pick Meadow Mist
      from the embed's theme button and the whole app window becomes one blur; the redesign makes
      theme switching a primary interaction so this must ship with it
      `n/a` `needs-verify` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-landing-embed-blur-rounded-clip.md

- [ ] The new site header does not match the two logos nearest it, and both were consciously
      deferred on 2026-09-04 rather than decided. The header is now a glass tile with the robot
      in the theme colour and a wide-caps wordmark; the FOOTER logo a few screens down still
      wears the old solid tile and mixed-case name, and the four theme mascots directly beneath
      the header are master's newer full-bodied art while the header's robot is still the app's
      flat icon. Destin saw both and said leave them for now, so this is a decision waiting to
      be made, not a defect
      `n/a` `decision` `checked 2026-09-04`

- [ ] Landing copy note, recorded so it is not re-derived: conversation tags, private notes and
      one-tap prompt chips are unique (0 of 8 competitors on 2026-08-31) but must not lead the
      landing page — uniqueness is not the argument
      `n/a` `parked` `checked 2026-08-31`

- [ ] The demo videos on the landing page are recordings of the desktop app shrunk to phone
      width, so on a phone the app's own writing inside them is a few pixels tall — you can see
      there is an app, not what it is doing. Re-filming them framed for a phone is the fix
      `n/a` `confirmed` `checked 2026-09-03`

- [ ] On a phone the landing page's "More than a chatbot" and "How we got here" run about three
      and two full screens of unbroken text each; a first-time reader also flagged the third
      About paragraph ("outpace development of competing closed agents") as strategy talk with
      no reason to be on the page
      `n/a` `confirmed` `checked 2026-09-03`

- [ ] The asterisk on the landing page's iOS download button has no footnote anywhere near it —
      the explanation sits about ten screens further down, so someone taps it expecting an App
      Store link
      `n/a` `confirmed` `checked 2026-09-03`

- [ ] The promo film's opening still shows Cotton Candy holding the wand that Destin removed from
      the site's hero button (2026-09-11 refresh). Not asked yet — his call whether to re-film it;
      renders need his go-ahead
      `n/a` `decision` `checked 2026-09-11`

- [ ] Moderating r/youcoded (set up 2026-09-10) is all by hand: Destin approves held posts from
      brand-new accounts, copies Reddit bug reports and ideas into real roadmap entries, and
      flips posts to Fixed or Planned himself. Set up automation for the repetitive parts, such as
      turning new Bug Report and Feature Idea posts into roadmap entries, and marking a post Fixed
      when its fix ships. Reddit stopped giving out new API access in November 2025, so the route
      is Reddit's own Mod Tools Automations or a Community App, not a script with an API key.
      Current setup is recorded in ~/Documents/youcoded-subreddit-setup.md
      `n/a` `decision` `checked 2026-09-10`

- [ ] Public launch paperwork for 1.3.1: the LLC behind every account and a trademark filing.
      Signed installers and the Play listing are dev-workspace → release items. Done 2026-09-03:
      youcoded.ai (site, API, email), the Anthropic-token fix, Android → MIT, the LLC itself
      (Destin's Adventures, LLC), EIN, DMCA agent, legal pages naming the company (youcoded#416).
      D-U-N-S arrived 2026-09-10; in the mail: trade name. The report's "Status" block is the
      current state; Destin's values are in the brain
      `n/a` `in-flight` `checked 2026-09-16` `v1.3.1` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] Website analytics is live, but its account allowance, spending alerts and applicable backup
      window are not fully verified: Free Website was confirmed, the Workers subscription lookup
      returned 403, and provider docs alone say Free 7 days / Paid 30 days. Verify the account's
      billing and alert coverage without assuming a free zone caps Worker costs; no plan upgrade
      was made. Follow-up monitoring, not a new activation approval gate
      `n/a` `needs-verify` `checked 2026-09-15`

- [ ] Website analytics reports cleanup health as unknown after activation, with no last sweep yet.
      Observe the first daily prune, then verify cleanup/recovery monitoring and provider backup
      expiry separately from the active database's 90-day history; live ingestion success does not
      prove retention operations. Follow-up monitoring, not a new activation approval gate
      `n/a` `needs-verify` `checked 2026-09-15`
