---
status: active
date: 2026-09-03
roadmap: docs/roadmap/dev-workspace.md → "The 'formalization' push after 1.3"
---

# Making YouCoded a real public product: costs, logistics, and legal exposure

Written for Destin, 2026-09-03, before buying `youcoded.ai`. Every fact about the
repo below was checked against the code on that date; every price and rule about
the outside world came from a September 2026 web search (sources at the end).
Nothing here is legal advice — it is the map to bring to a one-hour lawyer
conversation, so that hour is spent on decisions instead of discovery.

## The short version

1. **One thing in the app breaks Anthropic's rules today.** The usage meter reads the
   Claude Code sign-in token off disk and calls Anthropic's server with it. Anthropic
   forbids exactly that for third-party apps and has been cutting apps off since
   April 2026. Everything else about the Claude integration is the allowed shape.
   Fix this before any publicity.
2. **The Android app is labelled GPLv3 by mistake.** The reason given (the Termux
   terminal component) is wrong: that component is Apache 2.0, and the vendored copy's
   own LICENSE, NOTICE and VENDORED.md say so. Destin is the sole author, so the
   Android app can be relicensed to MIT like the desktop app. That re-opens every
   monetization door on Android.
3. **Removing the download warnings costs about $220 a year plus $25 once**, and needs
   an identity (yours or an LLC's) attached to each store/signing account.
4. **An LLC is worth forming first**, in Arizona, for **$50** with no annual report if the
   statutory agent sits in Maricopa or Pima County. Then every account (Apple, Google,
   Microsoft, trademark) is in the company's name from day one and never needs transferring.
5. **File a trademark for "YouCoded". Skip patents entirely.** Copyright you already
   own automatically.
6. Order of operations, with costs, is at the bottom.

---

## Part 1 — Removing safety warnings and download friction

### What users see today

| Platform | Today | Why |
|---|---|---|
| Windows | "Windows protected your PC" wall; must click "More info → Run anyway" | Installer is not signed at all (`electron-builder.yml` has no signing config) |
| macOS | "cannot be opened because the developer cannot be verified"; must go to System Settings → Privacy to allow | Not signed, not notarized — documented as a deliberate trade-off in `docs/vm-testing.md` |
| Android | "Install unknown apps" permission dance | Distributed as an APK from GitHub Releases, not Google Play |
| Linux | No warning | Linux does not gatekeep |

The download page already ships click-through walkthroughs for the Windows and macOS
walls. The Android release is properly signed with a real keystore in CI secrets, so
Android is the closest to ready.

### Windows

Three routes. All require an identity check on a real person or company.

**A. Azure Artifact Signing (formerly "Trusted Signing")** — recommended.
- Cost: $9.99/month, up to 5,000 signatures. Microsoft issues the certificate and
  rotates it for you; it plugs into GitHub Actions in an afternoon.
- Eligibility: US, Canada, EU or UK business, **or** a self-employed individual. You
  submit a photo ID and a selfie. The old "3 years of business history" requirement
  is gone. An LLC makes the application cleaner.
- Effect: the "Unknown publisher" line disappears immediately. The blue SmartScreen
  wall itself fades as downloads accumulate, typically over weeks. Microsoft's own
  certificates build that reputation fastest.

**B. Traditional certificate from Sectigo / DigiCert / SSL.com.**
- Cost: $200 to $400 a year, and since 2023 the key must live on a hardware USB token
  or a paid cloud vault, which makes signing from CI awkward.
- Do **not** pay extra for "EV" (Extended Validation). Microsoft removed the instant
  SmartScreen pass for EV in 2024; EV and standard certificates now build reputation
  identically.

**C. Microsoft Store.**
- Cost: free. Microsoft dropped registration fees for individuals (2024) and companies
  (2025).
- Effect: Store installs never show SmartScreen at all, and Microsoft signs the
  package. Users also get automatic updates through the Store.
- Risk: the app would be repackaged as MSIX. Full-trust desktop apps are allowed, but
  YouCoded installs Claude Code through a PowerShell installer, spawns terminals and
  writes to `~/.claude`; that needs a real test pass before promising it. Store review
  takes days, not minutes. This is a good *second* channel, not a replacement for the
  direct download.

**What signing does not do:** it does not make the first hundred downloads warning-free.
Expect the wall to shrink from "Windows protected your PC" to nothing over the first
month or two of a signed release. Tell early users that.

### macOS

One route: **Apple Developer Program, $99/year.**
- Sign with a "Developer ID" certificate, then **notarize** (Apple's automated malware
  scan, a few minutes per build), then staple the result into the .dmg. electron-builder
  does all three from CI once the secrets are set. Electron needs exactly one
  entitlement exception (JIT) and the hardened runtime flag.
- Effect: the "cannot be opened" wall disappears **completely and immediately**. Users get
  the ordinary "downloaded from the internet, open?" prompt. No reputation period.
- Individual vs organization enrollment: an individual account shows *your personal
  name* as the publisher in the Gatekeeper prompt. An organization account shows the
  LLC name, but needs a **D-U-N-S number** (free from Dun & Bradstreet, takes 1 to 2
  weeks) and a company email address. Converting individual → organization later is
  possible through Apple support but is a support-ticket ordeal. If the LLC is weeks
  away, wait for it.
- The Mac **App Store** is not realistic. Its sandbox would block spawning Claude Code,
  installing tools, and reading the user's home directory. Distribute outside the store,
  which is what notarization is for.

### Android

Three separate things, often conflated.

**1. The sideload prompt cannot be removed** for APKs downloaded from GitHub. That is
Android, not you.

**2. Google Play listing — $25, once.**
- New *personal* accounts (created after Nov 2023) must run a **closed test with 12
  testers who stay opted in for 14 straight days** before they may publish, and since
  2026 Google also checks the testers actually used the app. *Organization* accounts skip
  this entirely, but need a D-U-N-S number. Another reason the LLC comes first.
- Play also requires: a public privacy-policy URL, a completed "Data safety" form
  (YouCoded sends opt-out telemetry and the marketplace stores GitHub identities, so the
  form is not "collects nothing"), an in-app *and* web account-deletion path (the app
  already has one), a content rating, and a current target API level.
- The `.aab` bundle Play wants is already built by `android-release.yml`; it is uploaded
  to GitHub Releases today and simply never sent to Play.

**3. Google's new developer verification for *all* apps, sideloaded included.**
- From **30 September 2026** in Brazil, Indonesia, Singapore and Thailand, and **globally
  in 2027**, an APK from an unverified developer only installs through an "advanced flow"
  with a mandatory 24-hour lock. The hobbyist "limited distribution" account is free and
  needs no ID but caps you at **20 devices**, so it is useless for a public app.
- Practical meaning: by 2027 the Android app needs a verified developer account with a
  legal name and ID behind it regardless of whether you ever list on Play. Since it is
  the same identity check, do Play at the same time.

**Product risk, not legal:** the Android build pins Claude Code to version 2.1.112
because newer releases ship as a native binary that does not run in the Android
runtime (`docs/cc-dependencies.md`). A Play listing whose core feature depends on a
frozen old version is a support problem waiting to happen. Solve or scope it before
a Play launch.

### Signing cost summary

| Item | Cost | Frequency |
|---|---|---|
| Apple Developer Program | $99 | per year |
| Azure Artifact Signing | ~$120 | per year ($9.99/mo) |
| Google Play registration | $25 | once |
| Microsoft Store | $0 | — |
| D-U-N-S number | $0 | once, 1–2 weeks |
| **Total** | **~$220/yr + $25** | |

---

## Part 2 — Forming an LLC

### Why it is worth doing

An LLC is a legal wall between the product and your personal savings. Someone suing
over the product sues the company. That matters more than usual here because:

- The app runs an agent that **deletes files and executes commands** on users' machines.
- The marketplace **hosts other people's code** that users install.
- There are **social features and multiplayer games** used by students.
- Anthropic's terms for running Claude Code inside a product are their **Commercial
  Terms**, a business contract. A company is the natural party to it.
- Apple, Google, Microsoft, the trademark office and any payment processor all want a
  single legal owner. If that is the LLC from day one, nothing ever has to be transferred.

The wall only holds if you keep company money separate: its own bank account, no
personal spending from it, and the LLC's name on the accounts above.

### Costs (2026)

| Item | Cost | Notes |
|---|---|---|
| State filing fee | $40 to $500 | National average $130. Kentucky $40, Arizona/Mississippi/Missouri/New Mexico $50, Massachusetts $500 |
| Annual report / franchise tax | $0 to $800 per year | Most states $0 to $100. California is the outlier at $800/yr minimum |
| Registered agent | $0 or $100 to $300 per year | $0 if you are your own agent at your home address (address becomes public record). A service keeps your address private |
| EIN (federal tax ID) | $0 | Ten minutes on irs.gov. Needed for the bank account |
| Operating agreement | $0 | Single-member template is fine |
| Federal ownership report (BOI) | $0 | US-formed LLCs have been **exempt since March 2025** |
| Formation service | $0 to $300 extra | LegalZoom / ZenBusiness / Northwest do the paperwork; the state fee is the same either way |
| Lawyer | $500 to $1,500 | Optional. Better spent later on reviewing the terms before monetizing |

**Realistic total, doing it yourself in your home state: $100 to $400 for year one.**
Which state you live in changes the number, and I do not know it.

### Home state vs Delaware / Wyoming

For a solo founder, **home state wins**. Delaware and Wyoming look cheap on paper, but
you still have to register the company as a "foreign LLC" in the state where you live
and work, so you pay two states' fees and file two annual reports. Their advantages
(investor-friendly courts, owner privacy) do not matter until there are investors.

### Taxes

A one-owner LLC is invisible to the IRS by default. Income goes on your personal return
on a Schedule C, and there is no separate federal company return. Do not elect
S-corporation treatment until profits are large enough that a payroll service pays for
itself (rule of thumb: well past $50k a year in profit).

### Arizona specifically (Destin's state, added 2026-09-03)

Arizona is one of the cheapest and simplest states in the country for this.

| Item | Arizona |
|---|---|
| Filing fee (Articles of Organization, Arizona Corporation Commission) | **$50** ($85 with expedited processing) |
| Annual report | **None.** Arizona LLCs file no annual report and pay no yearly state fee |
| Statutory agent (Arizona's name for registered agent) | Required; can be you at an Arizona street address (address becomes public) or a service at ~$50–150/yr |
| Newspaper publication | Required within 60 days **unless the statutory agent's address is in Maricopa or Pima County**, where the state publishes online for free. Elsewhere it is ~$30–300 depending on the paper |
| EIN | $0, irs.gov |
| **Total, doing it yourself in Maricopa/Pima** | **$50** |

One tax note for later: Arizona's sales tax (called Transaction Privilege Tax, TPT) **does** apply to
software sold as a subscription, unlike many states. It is irrelevant while the app is free, and
a merchant-of-record payment provider handles it when the time comes. Arizona has no separate
LLC franchise tax.

### Things in the repo that assume there is no company

- `youcoded/PRIVACY.md` line 5: "It is not a company." Rewrite to name the LLC.
- `youcoded/TERMS.md` names "YouCoded, its maintainer, and its contributors" as the
  indemnified party. Name the LLC.
- The OpenRouter attribution header says `https://youcoded.app`
  (`provider-registry.ts:30`). The roadmap says the domain being bought is `youcoded.ai`.
  Pick one and fix the header.

---

## Part 3 — Copyright, trademark, patents

### Copyright: you already own it, registration is optional

Copyright attaches automatically when the code is written. Registration with the US
Copyright Office ($45 to $65 per work) only matters if you ever sue someone for copying
and want statutory damages. Low priority. Note the MIT license already grants everyone
permission to copy, so a copyright suit over the code itself is close to moot; what
copyright protects in practice is the name, logo, artwork, and any future closed parts.

### Trademark: the one worth doing now

The name "YouCoded" is the asset a copycat would take. A federal trademark gives you the
right to make them stop and to reclaim look-alike domains.

- **Cost:** $350 per class at the USPTO. Software is class 9 (downloadable software) and
  class 42 (online services). Start with class 9 ($350); add 42 ($700 total) if the
  marketplace and sync become paid services. A trademark lawyer adds $1,000 to $2,000
  and mostly buys you a professional conflict search.
- **Before filing:** a clearance search. A web search on 2026-09-03 found no product or
  company named "YouCoded" or "WeCoded". The closest neighbour is **YouWare**, a
  Shenzhen vibe-coding platform founded 2025 with 500k monthly users; the names are
  different enough that this is a "be aware", not a blocker. A proper search of the
  USPTO database has never been recorded in this workspace and must be done first.
- **Owner:** file in the LLC's name. Transferring a mark later is paperwork you can avoid.
- **Timeline:** 12 to 18 months to registration. Use ™ now, ® once registered.
- Consider "WeCoded" too if the marketplace brand is meant to last; otherwise one mark.

### Patents: no

- $10,000 to $20,000 with an attorney, three or more years, and software patents are
  weak and easily designed around.
- The code has been public on GitHub since **16 March 2026**. In the US you have one year
  from first public disclosure to file; most of the rest of the world treats public code
  as unpatentable the day it appears. That clock is already half spent.
- Nothing here is a patentable *invention* in the legal sense; it is an excellent
  *product*. Trademark protects products.

---

## Part 4 — Legal exposure, ranked

### 1. The usage meter uses the Claude sign-in token (fix before publicity)

`youcoded/desktop/hook-scripts/usage-fetch.js` (mirrored at
`youcoded/app/src/main/assets/usage-fetch.js`) reads `~/.claude/.credentials.json`, or the
macOS Keychain item "Claude Code-credentials", takes the OAuth access token, and calls
`https://api.anthropic.com/api/oauth/usage` with it.

Anthropic's Claude Code legal page (updated 2026, fetched 2026-09-03) says, verbatim:

> developers may not collect, store, or intermediate Claude.ai credentials or session
> tokens — sign-in to a Claude account must complete through Anthropic's own flow.

and

> Using OAuth tokens obtained through Claude Free, Pro, or Max accounts in any other
> product, tool, or service — including the Agent SDK — is not permitted

Anthropic began enforcing this in January 2026, clarified it on 19 February 2026, and cut
off third-party harnesses on 4 April 2026. The rest of YouCoded's Claude integration is
the **explicitly permitted** shape: it installs the unmodified official Claude Code
binary through Anthropic's own installer, runs it in a terminal, the user signs in inside
Claude Code itself, and YouCoded never pays for or resells usage. The usage meter is the
one exception, and it is small enough to remove or rebuild in a day.

**What users experience if fixed:** the usage numbers in the status bar either disappear
or come from Claude Code's own `/usage` output instead. Nothing else changes.

### 2. Anthropic's Commercial Terms apply to YouCoded, not just the Consumer Terms

The same page: "preinstalling or running Claude Code in your products or services …
requires agreeing to our Commercial Terms of Service" and complying with three
conditions. YouCoded meets all three today (binary unmodified, no auth method removed,
no paying-on-behalf-of-users). But you personally are the party to that contract right
now. The LLC should be, and someone should actually read the Commercial Terms once.

#### The two contracts, in plain words (added 2026-09-03 on Destin's request)

Anthropic has two rulebooks. The **Consumer Terms** are what you agreed to when you signed up
for a Claude subscription: they cover *you*, a person, using Claude.ai and Claude Code
yourself. The **Commercial Terms** are the rulebook for *businesses that build products on
Anthropic's technology*. Anthropic's Claude Code legal page says that "preinstalling or
running Claude Code in your products or services" requires agreeing to the Commercial Terms.
YouCoded installs and runs Claude Code, so YouCoded-the-product is on the business rulebook
even though you-the-user are on the consumer one.

Agreeing to the Commercial Terms costs nothing and needs no sales call; you accept them by
running Claude Code in your product and by following their conditions. The three conditions
that apply:

1. **Do not modify the Claude Code binary**, and do not hide or disable any of its sign-in
   methods (subscription sign-in, API key). YouCoded installs the official binary through
   Anthropic's own installer and leaves every sign-in method alone. ✔
2. **Do not pay for, resell or sit in the middle of Claude usage** for your users. Each user
   signs in with their own account and is billed by Anthropic directly. YouCoded does this. ✔
   It also rules out any future "YouCoded Pro includes Claude" plan.
3. **Do not collect, store or pass along Claude.ai credentials or session tokens**; sign-in
   must happen inside Anthropic's own flow. YouCoded's sign-in does happen inside Claude Code
   (✔), but the usage meter script read the token off disk (✘, being fixed).

Why the LLC matters here: a contract has two parties. Today the party on YouCoded's side is
you personally. Once the LLC exists, it is the company, and a dispute with Anthropic is a
dispute with the company.

### 3. Using the Claude name

Allowed: saying in plain text that YouCoded "runs Claude Code" or "installs Claude Code".
Not allowed: "Claude" or "Anthropic" in a product, feature or company name, in a logo, or
in any way that implies Anthropic built, endorses or partnered with YouCoded.

Anthropic's general Trademark Guidelines are stricter than the Claude Code page: they say
Anthropic's marks may be used "only as specifically permitted by us," that no alteration of a
logo is permitted, and that nothing may imply "sponsorship or endorsement, or a relationship
or affiliation with Anthropic." The Claude Code page is the specific permission: **plain-text,
truthful statements** that the product runs or installs Claude Code. In practice:

| Allowed | Not allowed |
|---|---|
| "YouCoded runs Claude Code." | The Claude or Anthropic logo anywhere in the app or site |
| "Sign in with your Claude subscription inside Claude Code." | A feature called "Claude Mode" or a tab labelled "Claude" |
| "Works with Claude Code, OpenRouter and local models." | "Powered by Anthropic" as a badge |
| A button that says what it does: "Diagnose with Claude" | "The official Claude desktop app" or anything implying partnership |
| | "youcoded-claude.ai" or any domain containing their marks |

Marketing that says "sign in with your Claude subscription" is accurate only because the
sign-in happens inside Claude Code's own window. Keep that distinction visible in copy.
Feature labels in the app today ("Diagnose with Claude", "View usage on claude.ai") are
descriptive plain text and look fine; the line to watch is a *named feature* like a
"Claude Mode" tab. `docs/archive/specs/2026-07-19-native-workflow-orchestration-design.md`
already recorded this rule.

### 4. Privacy: the policy exists but nothing links to it

- `PRIVACY.md` and `TERMS.md` are real and detailed (effective 5 May 2026), with an
  under-13 clause, an "as is" disclaimer, a limitation of liability and an indemnity.
- **Neither is linked from the landing page** (`youcoded/docs/index.html` has no
  `PRIVACY.md`/`TERMS.md` link) **nor from anywhere inside the app** (no hit in
  `desktop/src` or the Android Kotlin). Google Play and Apple both require a public URL.
  Fix: a footer link on the site and a line in Settings → About.
- The marketplace stores GitHub login, avatar URL, display name and a friends graph; the
  app sends an opt-out install and daily heartbeat ping. That is enough personal data
  that EU users bring GDPR obligations: a policy (have it), a deletion path (have it), and
  a named controller (the LLC).
- Both documents say "not a company" / "its maintainer". Update on LLC formation.

### 5. The marketplace hosts other people's code

- **DMCA safe harbour:** `TERMS.md` section 5 has a takedown process and *admits* no DMCA
  agent is registered. Registration is **$6** at the Copyright Office and takes ten
  minutes. Without it you do not get the safe harbour for copyright claims about plugins
  or themes. Do it the week the LLC exists.
- **The "Likely safe" badge is a legal risk.** The automated scan only checks for leaked
  secrets and file shapes; nothing evaluates what a plugin *does*. A badge that reads as
  a safety verdict can be argued as a representation. `type-icons.tsx:73` already warns
  that an icon implies "a publisher check that has never existed", and
  `docs/roadmap/marketplace.md:44` records that the scan follows the wrong git ref so 13
  entries read "Not checked … forever". Rename the badge to what was checked ("No leaked
  secrets found") and fix the ref before launch. `TERMS.md` section 4 already disclaims
  pre-screening, which helps.
- The Worker has **no working rate limit** (`docs/roadmap/marketplace.md:56`). Not a legal
  item, but an abuse item that becomes one when a public product is spammed.

### 6. The agent can destroy user data

The MIT license disclaims warranty for the code; `TERMS.md` sections 7 and 8 disclaim it
for the services. What is missing is a **first-run disclosure inside the app** that says
in one sentence that the assistant can change and delete files and that the user is
responsible for backups. Cheap, and it is what a court asks about first.

### 7. Licensing clean-up

- **Android is not actually GPLv3** (double-checked 2026-09-03 at Destin's request).
  `youcoded/app/LICENSE`, the root `LICENSE`, `README.md`, `TERMS.md` and a comment in
  `app/build.gradle.kts:225` say the Termux terminal-emulator forces GPLv3. Four independent
  sources say otherwise: the vendored module's own `LICENSE`, `NOTICE` and `VENDORED.md` all
  say Apache 2.0, and Termux's `LICENSE.md` at the exact vendored tag (v0.118.1) reads:
  "released under GPLv3 only license. Exceptions: Terminal Emulator for Android code is used
  which is released under Apache License 2.0. Check terminal-view and terminal-emulator
  libraries." Every other Android dependency is Apache/BSD/MIT-family, and the Termux
  packages fetched at run time from `packages.termux.dev` run as separate programs, which is
  not linking. Destin is the sole author of `app/`. Relicensing to MIT is a documentation
  change with no runtime effect; PR opened 2026-09-03. Roadmap item
  `docs/roadmap/dev-workspace.md:261` (`needs-verify`) closes when it merges.
- Desktop dependencies: **no GPL/AGPL/LGPL.** 333 MIT, 23 ISC, 19 BSD-2, 14 Apache-2.0,
  8 BSD-3, plus a handful of dual-licensed ones where the permissive option applies.
  One package, `buffers@0.1.1`, declares **no license** in its package.json (its GitHub
  README says MIT/X11). It arrives transitively via `exceljs → unzipper → binary`, so it
  cannot be swapped alone; it goes when `exceljs` is replaced or updated. Low risk, noted.
- `wecoded-themes/package.json` says ISC while its LICENSE is Apache 2.0. PR opened 2026-09-03.
- `youcoded-admin/` has no LICENSE file, but the repo is **private**, so none is needed.
- **Gemma models download with no license notice.** Google's Gemma Terms of Use require
  passing its use restrictions to downstream users; Qwen and GPT-OSS are Apache 2.0 and
  fine. Show a one-time notice with a link when a Gemma download starts.

### 8. Open source vs future monetization

The desktop app is MIT: anyone may copy, rebrand and sell it. You cannot take that back
for versions already published, but as sole author you **can** change the license for
future versions. The one outside contributor in the whole workspace is a themes author
(7 commits to `wecoded-themes`), which does not touch the app.

| Option | Users experience | Pros | Cons |
|---|---|---|---|
| **Stay MIT, monetize services** (hosted sync, marketplace pro features, paid plugin/theme revenue share, support) | App stays free and open; paid features are clearly separate | Highest trust; students keep using it; forks are rarely a real threat to a fast-moving app | A large company could ship a rebrand; your moat is pace and community, not the license |
| **Switch future versions to source-available** (BSL / FSL: code visible, competitors may not sell it, converts to open source after N years) | App still free to use; "open source" label goes away | Blocks a competitor selling your app | Community goodwill hit; F-Droid and Linux distros drop it; every "open source" claim on the site must change |
| **Open core** (app MIT, paid cloud features closed) | Free app plus a paid account tier | Common, well understood | Two codebases to keep honest |

Recommendation: **stay MIT and monetize services**, and add a contributor agreement
(a DCO sign-off line is enough) to every repo **now**, before community pull requests
arrive, so the door to changing course stays open.

Two hard limits on any monetization: Anthropic forbids charging for or bundling Claude
usage, so "pay us and get Claude" is off the table; OpenRouter is bring-your-own-key
today, and a YouCoded-run proxy with a markup would put you in the payments and
data-handling business.

### 8a. MIT vs Apache 2.0 (Destin asked, 2026-09-03)

Both let anyone use, copy, modify, sell and close-source the code as long as they keep the
copyright notice. The differences:

| | MIT | Apache 2.0 |
|---|---|---|
| Length | ~170 words | ~10,000 words |
| Patent grant | Silent. Courts generally read an implied one, but it is not written | Explicit: every contributor grants users a license to any patents their contribution touches, and **loses that license if they sue** over the project |
| Trademark | Silent. Trademark law still applies, but the license does not say so | Explicit: "does not grant permission to use the trade names, trademarks" — forks must not call themselves by your name |
| Modified copies | No requirement | Must state that files were changed; must carry the NOTICE file along |
| GPL compatibility | Compatible with GPLv2 and v3 | Compatible with GPLv3 only |
| Who uses it | Most JavaScript / hobby projects | Most corporate-backed projects (Android, Kubernetes, Swift) |

**What this means for YouCoded.** The only clauses that could ever matter are the two Apache
adds: the patent grant protects you if a *contributor* later claims a patent on something they
contributed, and the trademark line makes "a fork may not call itself YouCoded" explicit. Both
are small, real benefits; neither changes what users experience. The costs are a longer license,
a NOTICE file to maintain, and slightly less appeal to hobbyist contributors.

**Recommendation: stay MIT for the app.** The trademark filing gives you the name protection
Apache's clause only restates, and the patent clause only matters once there are many
contributors. If the project were being licensed from scratch today, Apache 2.0 would be a
perfectly good pick, and `wecoded-marketplace` and `wecoded-themes` already use it, so the
mix is fine. Switching later is one commit as long as the DCO sign-off is in place.

### 9. Smaller items

- **Minors.** The privacy policy already says under-13s are not allowed. Add the same
  line to the Terms and pick 13+ in the Play and Apple age questionnaires. Multiplayer
  and social features are why this matters.
- **Domain.** Buy `youcoded.ai` now (a domain transfers to the LLC trivially later). Take
  `youcoded.com` too if it is available; a `.ai` alone invites a `.com` squatter once
  the trademark is public. Set up a mailbox on the domain before enrolling with Apple,
  Google and Microsoft; all three want a business email. Move the Worker off
  `*.workers.dev` onto the domain (`docs/roadmap/marketplace.md:48`).
- **Payments, when they come.** Use a "merchant of record" (Paddle, Lemon Squeezy) so
  sales tax and VAT in fifty states and forty countries are their problem, not yours.
- **Insurance.** Not yet. When there is revenue, general liability plus technology E&O
  runs $500 to $1,500 a year.
- **Release method.** `docs/roadmap/dev-workspace.md:216` — releases are cut by tagging
  master, so a bug-fix release cannot be made without shipping everything. Store
  listings make hot-fixes a normal need. Fix before the first store submission.

---

## Done on 2026-09-03 (free items, opened as pull requests for Destin's review)

| PR | What | Users notice |
|---|---|---|
| [youcoded#403](https://github.com/itsdestin/youcoded/pull/403) | Usage meter rebuilt on Claude Code's own `rate_limits` status-line data; the OAuth-token script, its 5-minute runner and the Anthropic call are gone on both platforms | Chips and status-line row look the same; they fill in after the first reply of a session instead of refreshing while idle |
| [youcoded#400](https://github.com/itsdestin/youcoded/pull/400) | Android relicensed GPLv3 → MIT; root LICENSE, README, TERMS, gradle comment, About-screen license text corrected | Nothing at runtime; About → Licenses reads correctly |
| [youcoded#401](https://github.com/itsdestin/youcoded/pull/401) | Privacy and Terms linked from the site footer and Settings → About (both platforms); Terms gains an Eligibility section (13+); `CONTRIBUTING.md` with DCO sign-off | Two footer links; a "Policies" row in About |
| [wecoded-themes#28](https://github.com/itsdestin/wecoded-themes/pull/28) | `package.json` license field ISC → Apache-2.0; DCO section | None |
| [wecoded-marketplace#83](https://github.com/itsdestin/wecoded-marketplace/pull/83) | DCO section in CONTRIBUTING (docs only; the Worker deploy workflow does not fire) | None |

All three youcoded PRs merge cleanly with each other in any order (checked with `git merge-tree`).

Follow-up found while doing this: `youcoded-core/hooks/statusline.sh` and `write-guard.sh` still
*reference* `usage-fetch.js` (the file itself is not there, so that copy never made the call).
Clean up or archive on the deprecation schedule.

## Order of operations and total cost

Updated 2026-09-03 after the free items above were opened as PRs. Arizona, Maricopa/Pima assumed.

| Step | Who | What | Cost | Needs |
|---|---|---|---|---|
| 0 | ✅ done 2026-09-03 | The five PRs above are merged | $0 | — |
| 1 | ✅ done 2026-09-03 | `youcoded.ai` bought (Cloudflare Registrar). Email Routing: `destin@youcoded.ai` and `support@youcoded.ai` → destinmoss.work@gmail.com (support@ to be re-pointed later) | $160 / 2 yrs | — |
| 2 | ✅ done 2026-09-03 | Site live at https://youcoded.ai (GitHub Pages custom domain, old URL redirects; youcoded#407). Worker at https://api.youcoded.ai (wecoded-marketplace#84/#85; app switched in youcoded#406). OpenRouter header → youcoded.ai (youcoded#408) | $0 | 1 |
| 3 | Destin | File the Arizona LLC (azcc.gov, Articles of Organization, statutory agent in Maricopa/Pima); EIN at irs.gov; business bank account | $50 | — |
| 4 | Claude | Update PRIVACY/TERMS/CONTRIBUTING to name the LLC | $0 | 3 |
| 5 | Destin | D-U-N-S number (free, 1–2 weeks); then Apple Developer Program (organization), Google Play Console (organization), Azure Artifact Signing | $99/yr + $25 + $10/mo | 3 |
| 6 | Claude | Wire signing + notarization into the desktop CI; Play `.aab` upload; data-safety form draft | $0 | 5 |
| 7 | Destin | USPTO clearance search (tmsearch.uspto.gov), then file "YouCoded" in class 9; optionally class 42 | $350 (+$350) | 3 |
| 8 | Destin | Register a DMCA agent (copyright.gov/dmca-directory) | $6 | 3 |
| 9 | Claude, after Destin's wording call | Rename the "Likely safe" badge to what was checked; fix the scan-follows-wrong-ref bug; Gemma license notice on download; first-run "the assistant can change and delete files" line | $0 | Destin picks wording |
| 10 | Destin, optional | One hour with a lawyer: read the Terms once, confirm the Android relicense reasoning | $300–600 | 3 |
| | | **Year-one total, doing it yourself** | **~$700 to $1,050** | |

Steps 3, 7 and 8 need Destin's identity and card and cannot be delegated. Steps 4, 6 and 9
are Claude sessions. Nothing in 5–9 should start before 3.

Cloudflare notes for whoever does step 6: a scoped API token (DNS + Email Routing on the
youcoded.ai zone) lives at `~/.config/youcoded-dev/cloudflare-token` on Destin's laptop; the
Worker's custom domain and the Pages DNS were created with it and the wrangler OAuth login.
The site's DNS records were DNS-only at first so GitHub could issue its certificate; after an hour
GitHub still had not, so since 2026-09-03 ~17:00 the apex and `www` are **proxied through
Cloudflare** (orange cloud), zone SSL mode **Flexible** (Cloudflare → GitHub Pages over plain HTTP,
because GitHub presents a `*.github.io` certificate for this name and a Full-mode handshake fails),
with Always Use HTTPS on. Visitors get a Cloudflare-issued `youcoded.ai` certificate. GitHub will
never issue its own while proxied, and its Pages health check will report a Cloudflare IP — both
expected. To move back to GitHub's certificate: un-proxy the records, wait for GitHub's cert, then
switch SSL mode to Full (strict) and re-proxy, or simply stay as is.

## Open questions for Destin

1. Should Apple/Google/Azure accounts wait for the LLC (recommended; the LLC takes days in
   Arizona, the D-U-N-S number 1–2 weeks) or open in your name now and convert later?
2. Is "WeCoded" a brand you want to keep long-term? It decides whether to file one mark or two.
3. Badge wording for step 9: "No leaked secrets found" is the accurate candidate; your call.

## Sources

- Anthropic, Claude Code legal and compliance: https://code.claude.com/docs/en/legal-and-compliance
- The Register, Anthropic clarifies ban on third-party tool access (2026-02-20): https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/
- Microsoft, Trusted Signing open to individuals: https://techcommunity.microsoft.com/blog/microsoft-security-blog/trusted-signing-is-now-open-for-individual-developers-to-sign-up-in-public-previ/4273554
- Azure Artifact Signing product page: https://azure.microsoft.com/en-us/products/artifact-signing
- textslashplain, Authenticode in 2025: https://textslashplain.com/2025/03/12/authenticode-in-2025-azure-trusted-signing/
- ToDesktop, EV certs no longer grant immediate reputation: https://www.todesktop.com/blog/posts/windows-apps-psa-ev-certs-do-not-grant-immediate-reputation-anymore
- Microsoft Learn, SmartScreen reputation: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- Windows Central, Microsoft Store drops fees: https://www.windowscentral.com/microsoft/windows-11/microsoft-store-drops-fees-for-individual-developers-apple-still-charges-usd99-per-year
- Apple Developer Program: https://developer.apple.com/programs/
- electron-builder notarization: https://www.electron.build/docs/features/code-signing/notarization/
- Google Play, testing requirements for new personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Android Authority, sideloading changes timeline: https://www.androidauthority.com/android-sideloading-changes-timeline-3679204/
- Help Net Security, Android developer verification (2026-03-31): https://www.helpnetsecurity.com/2026/03/31/android-developer-verification-requirement/
- LLC University, filing fees by state: https://www.llcuniversity.com/llc-filing-fees-by-state/
- Arizona LLC fees, publication rule and no-annual-report: https://llcbuddy.com/arizona-llc/ and https://www.llcuniversity.com/arizona-llc/annual-report/
- Arizona TPT on SaaS: https://www.swlaw.com/publication/saas-remains-subject-to-tpt-in-arizona/
- Anthropic Trademark Guidelines: https://www.anthropic.com/legal/trademark-guidelines
- Claude Code status line `rate_limits` fields: https://code.claude.com/docs/en/statusline
- Termux LICENSE.md at v0.118.1 (terminal-emulator is Apache 2.0): https://raw.githubusercontent.com/termux/termux-app/v0.118.1/LICENSE.md
- FinCEN interim final rule Q&A (BOI exemption): https://www.fincen.gov/boi/ifr-qa
- USPTO fee restructure explained: https://www.anchorfilings.com/blog/uspto-trademark-fees-2025-restructure.html
- YouWare (trademark neighbour): https://en.wikipedia.org/wiki/YouWare
