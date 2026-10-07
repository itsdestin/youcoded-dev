# operations — running YouCoded the project: website, marketing, legal and community
Filing test: is it about youcoded.ai, promotion, the company's legal paperwork or the r/youcoded community, rather than the app or how it is built? Yes.
Not here: the download builds themselves, installer signing and store uploads (dev-workspace → release), or anything inside the app.
seen-on is always n/a here.

- [ ] Public launch paperwork for 1.3.1: the LLC behind every account and a trademark filing. Signed
      installers and the Play listing are dev-workspace → release items. Done by 2026-09-03:
      youcoded.ai (site, API, email), the Anthropic-token fix, Android to MIT, the LLC (Destin's
      Adventures, LLC), EIN, DMCA agent, legal pages. D-U-N-S arrived 2026-09-10; in the mail: trade
      name. The report's "Status" block is the current state; Destin's values are in the brain.
      `n/a` `in-flight` `P1` `checked 2026-09-16` `v1.3.1` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] Landing page: 4 faults.
      (a) The demo videos are the desktop app shrunk to phone width, so on a phone the app's writing
      is a few pixels tall; re-film them for a phone. (b) On a phone "More than a chatbot" and "How we
      got here" run about three and two screens of unbroken text, and the third About paragraph
      ("outpace development of competing closed agents") reads as strategy talk. (c) The asterisk on
      the iOS download button has no footnote nearby; the explanation is about ten screens down.
      (d) The promo film's opening still shows Cotton Candy holding the wand removed from the hero
      button; Destin's call whether to re-film.
      `n/a` `confirmed` `P3` `checked 2026-09-03`

- [ ] Moderating r/youcoded (set up 2026-09-10) is all by hand: Destin approves held posts from new
      accounts, copies bug reports and ideas into roadmap entries, and flips posts to Fixed or
      Planned. Wanted: automate the repetitive parts (new Bug Report and Feature Idea posts into
      roadmap entries; mark Fixed when a fix ships). Reddit stopped issuing new API access in
      November 2025, so the route is Mod Tools Automations or a Community App. Setup is recorded in
      ~/Documents/youcoded-subreddit-setup.md.
      `n/a` `decision` `P3` `checked 2026-09-10`

- [ ] Website analytics monitoring: 2 follow-ups, not approval gates.
      (a) Account allowance, spending alerts and backup window are not fully verified (Workers
      subscription lookup returned 403; docs say Free 7 days / Paid 30); verify billing and alert
      coverage without assuming a free zone caps Worker costs. (b) Cleanup health reads unknown with no
      last sweep; observe the first daily prune, then verify cleanup, recovery and provider backup
      expiry separately from the 90-day history.
      `n/a` `needs-verify` `P3` `checked 2026-09-15`

- [ ] Parked: landing copy note, recorded so it is not re-derived. Conversation tags, private notes
      and one-tap prompt chips are unique (0 of 8 competitors, 2026-08-31) but must not lead the
      landing page; uniqueness is not the argument.
      `n/a` `parked` `P3` `checked 2026-08-31`
