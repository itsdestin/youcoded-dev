# YouCoded Google Integration — Options Research (2026-09-26)

Goal: replace "user creates own GCP project + gws CLI" with something smoother for
non-developer users, covering Gmail, Calendar, Drive/Docs/Sheets. Read-only research,
no code changes made.

## Ranked option table

| # | Option | User setup | Our one-time cost | Our ongoing cost/burden | Coverage | Privacy | Risk |
|---|---|---|---|---|---|---|---|
| 1 | macOS EventKit (read Calendar via already-synced OS account) | Zero — if they already added Google to System Settings > Internet Accounts | Low (EventKit binding) | Low | Calendar read/write only, macOS only, no Gmail/Drive | Best — tokens never touch us, OS-mediated | Low |
| 2 | Android CalendarContract (device calendar synced from Google) | Zero — grant READ/WRITE_CALENDAR permission | Low | Low | Calendar CRUD only, Android only, no Gmail/Drive | Best — no OAuth, no token at all | Low |
| 3 | Vendor-owned OAuth client, Desktop-app/PKCE type, sensitive scopes only (Calendar, drive.file), skip Gmail/full-Drive | One click "Sign in with Google" | Brand + sensitive-scope verification (weeks, no CASA) | Low-medium (token refresh, annual policy compliance) | Calendar CRUD, Drive (drive.file only — files we create), no Gmail read, no full Drive | Good if tokens stay local | Medium |
| 4 | Vendor-owned OAuth client, full scopes incl. Gmail modify + Drive full | One click | CASA assessment: $540–$3,000+/yr (AL1/AL2), weeks-months for full verification, ongoing annual re-assessment | Medium-high: annual CASA renewal, verification maintenance, scope justification videos | Full: Gmail read/send/labels, Calendar CRUD, Drive/Docs/Sheets full | Depends on architecture | Medium-high (cost + review risk) |
| 5 | Google Apps Script + clasp bridge ("google-automation-mcp" pattern) | User runs one command, signs in via clasp's Google OAuth (browser), manually flips on Apps Script API toggle once | Low — no GCP project, no consent screen, no CASA (Google's own clasp client absorbs it) | Low-medium (dependent on a community tool's maintenance) | Full Gmail/Calendar/Drive/Docs/Sheets, but capped: ~100 email recipients/day, ~90 min total script runtime/day (~2,700 calls) | Good — Google's own infra, no third-party token custody | Medium (unofficial pattern, rate caps, single community maintainer) |
| 6 | Google's official `gws` CLI / Gemini CLI Workspace extension | User still runs `gcloud`-driven project bootstrap (gws automates but still creates a real GCP project) OR user does manual Cloud Console setup | Low (adopt their CLI) | Low, but doesn't remove the pain | Full — Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin | Good — local execution, user's own tokens | Same testing-mode caps (25 scopes, 100 users, 7-day tokens) unless user verifies own app — i.e., barely improves on status quo |
| 7 | Third-party broker (Composio, Arcade.dev, Pipedream, Klavis) using THEIR verified Google app | One click through their hosted consent flow | Subscription cost (see below) tied to per-user call volume — expensive at scale for many free users | Low (they run verification/CASA) | Full, broker-dependent | Weak — tokens live on their servers unless self-hosted (Nango, Klavis are open source) | Medium — vendor lock-in, cost scaling, third party holds tokens |
| 8 | Non-OAuth: Gmail app password (IMAP/SMTP) | User enables 2FA, generates 16-char app password, pastes it in | Zero | Zero | Gmail send/read only (IMAP/SMTP), no labels API richness, no Calendar/Drive | Good — no third party, but a password-like secret changes hands | Low-medium (still a credential to store safely; per-client password) |
| 9 | Non-OAuth: Calendar private iCal URL | User copies "secret address" from Calendar settings | Zero | Zero | Calendar READ ONLY, no write, no Gmail/Drive | Good | Low |
| 10 | CalDAV for Google | — | — | — | **Dead end**: Google now requires OAuth for CalDAV too (since March 14, 2025) | n/a | n/a — not viable as a "no OAuth" fallback anymore |

Bottom line ranking for "smoothest path that still gets Gmail + Calendar + Drive":
**#5 (Apps Script/clasp bridge) > #1/#2 (OS-native, but partial coverage) > #3 (vendor app, narrowed scopes) > #6 (gws, marginal improvement) > #4 (vendor app, full scopes+CASA) > #7 (paid broker) > #8/#9 (fallback, partial).**

---

## 1. Vendor-owned verified OAuth app (YouCoded registers one client)

### Scope sensitivity tiers
- **Gmail**: `gmail.readonly`, `gmail.modify`, `gmail.send` etc. are **restricted** scopes (broad mailbox access) — full CASA required. Narrower scopes exist but the useful ones (read/modify/labels) are restricted.
- **Calendar**: calendar scopes are **sensitive** (not restricted) — needs standard sensitive-scope verification (justification + demo video) but **no CASA**.
- **Drive**: `drive` (full) is **restricted** → CASA. `drive.file` (only files the app itself created/opened) is **non-sensitive** → no verification burden at all.
- Source: [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [OAuth 2.0 Scopes](https://developers.google.com/identity/protocols/oauth2/scopes)

**Practical implication:** If YouCoded scoped itself to Calendar (sensitive, no CASA) + `drive.file` (no verification needed) + skip Gmail read/modify, we avoid CASA entirely and only need standard brand + sensitive-scope verification. Gmail is the scope that forces CASA.

### CASA cost/tier/timeline (2026)
- CASA (Cloud Application Security Assessment) is required for **restricted scopes** (Gmail modify/read broad, Drive full, etc.), assessed by a Google-authorized third-party lab, must be **redone annually**.
- Now organized as assurance levels **AL1/AL2** (formerly "tiers"), both "Lab Tested — Lab Verified."
- Cost: cheapest labs (e.g., TAC Security) ≈ **$540/year**; some Tier-2-equivalent assessments run **$3,000+/year**; typical range "a few hundred to a few thousand dollars."
- One blog reports a solo developer shelving a personal app specifically because of the $540/yr CASA cost.
- Sources: [DeepStrike: Google CASA 2026](https://deepstrike.io/blog/google-casa-security-assessment-2025), [yurudeep.com — shelved app over $540/yr CASA](https://yurudeep.com/posts/aicoding/2026/20260717/en/), [App Defense Alliance CASA Requirements](https://appdefensealliance.dev/casa/casa-requirements), [Orbis blog — passing CASA Tier 2](https://meetorbis.com/blog/how-we-passed-google-casa-tier-2-with-claude), [Agentic Fabriq — CASA for AI agent startups](https://www.agenticfabriq.com/blog/google-oauth-verification-casa)

### Does "tokens never touch our servers" avoid CASA?
**Unverified / genuinely ambiguous.** Google's restricted-scope docs gate assessment partly on "ability to access data from or through a third-party server," which sounds like it would exempt a fully local, client-only app. But the verification-tier FAQ also ties assessment level to "user count × scope sensitivity," which doesn't obviously exempt anything based on architecture. A live, **unanswered** Google Developer forum thread asks exactly this question (client-only Android app, `drive.readonly`, no backend) and gets no authoritative resolution — confirms this is a real, currently-unsettled gray area, not a solved question. **Recommend treating CASA as required for any restricted scope regardless of local-only architecture, unless/until Google support explicitly confirms an exemption for our exact setup.**
Source: [Google Developer forum — client-only app CASA question](https://discuss.google.dev/t/does-a-client-only-android-app-with-no-server-need-the-casa-security-assessment-for-drive-readonly/393638) (unanswered as of research date)

### Unverified app caps (Testing mode)
- Testing-mode apps: max **100 test users**, manually added by email on the consent screen.
- Testing-mode refresh tokens **expire after 7 days** — a real problem for "sign in once, keep working" UX.
- Both limits disappear once the app passes verification and is published ("In production"), or if a Workspace admin marks the app "Trusted" for their org (irrelevant for our consumer users).
- Sources: [OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [Unipile — 100 user limit](https://www.unipile.com/google-oauth-100-user-limit/), [Unipile — refresh token](https://www.unipile.com/google-oauth-refresh-token/)

### Brand verification requirements
- Any External app showing a name/logo on the consent screen needs **brand verification**: public homepage describing the app, linked ToS + privacy policy (same domain as homepage and consent screen), domain verification for all URLs used (homepage, redirect URIs, JS origins).
- Separate from — and can block independently of — sensitive/restricted scope verification.
- Sources: [Brand Verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [Comply with OAuth 2.0 policies](https://developers.google.com/identity/verification/authentication-policy-compliance)

### Desktop OAuth client type, PKCE, client secrets in open source
- Google's own docs for "OAuth 2.0 for iOS & Desktop Apps" say installed-app client secrets are **not confidential** — "obviously not treated as a secret" — and recommend PKCE (S256) + a **loopback redirect** (127.0.0.1:port) opened in the system browser. This flow **continues to be supported on desktop** (Google is deprecating loopback for native iOS/Android/Chrome OAuth client types, but not desktop).
- HOWEVER: Google's **API Terms of Service, section 4(b)**, is reported to **prohibit including the Client ID/secret in open-source repositories**, treating developer credentials as confidential — a direct tension with the "desktop secrets aren't really secret" guidance. In practice this is normally unenforced (Thunderbird, gcalcli, gogcli all ship theirs in the open), but it's a policy-compliance gray zone worth flagging, not a green light.
- Sources: [OAuth 2.0 for iOS & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app), [Loopback migration guide](https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration), [GitHub issue: client secrets in desktop open-source apps](https://github.com/googleapis/google-auth-library-nodejs/issues/959)

### How other open-source desktop mail clients do it
- **Thunderbird**: ships its own client ID + secret directly in its open-source codebase (MPL licensed, publicly visible). This is safe *for them* mainly because (a) Google explicitly tolerates it for installed apps, (b) the "secret" grants no special mailbox access — real authorization still requires the user's own Google login + consent, and (c) Mozilla has presumably passed Google's app verification/CASA under their own brand.
- Community CLIs (**gcalcli**, **gogcli**) explicitly tell each user to create their **own** Desktop-type OAuth client — they do *not* ship a shared credential, largely to dodge Google's per-app user caps and to avoid becoming a single high-traffic target subject to CASA.
- Sources: [Mozilla/tb-planning: Google OAuth 2.0](https://groups.google.com/g/tb-planning/c/RRSPwp36bi0), [gcalcli setup](https://github.com/insanum/gcalcli/blob/HEAD/docs/api-auth.md), [gogcli auth docs](https://deepwiki.com/steipete/gogcli/4-authentication-and-security)

**Recommendation for option 1**: A **narrow-scope** vendor app (Calendar sensitive scope + `drive.file`, explicitly excluding Gmail read/modify and full Drive) is realistic without CASA — verification effort is "weeks," not "months + recurring $$." Full Gmail/Drive coverage under our own brand means recurring CASA cost and annual re-review; only worth it if Google usage becomes core enough to justify $500–$3,000/yr forever plus verification maintenance.

---

## 2. Google's own offerings

### `gws` — official-ish Google Workspace CLI (github.com/googleworkspace/cli)
- New (2026) single binary covering Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin, dynamically built from the Discovery API; ships 40+ "agent skills" for LLM tool use. Apache-2.0. **Explicitly says "not an officially supported Google product."**
- **Still requires each user to create their own GCP project and OAuth client** — `gws auth setup` just automates the `gcloud` calls to do it, it does **not** provide a shared/pre-verified client. There is no hosted auth broker.
- Testing-mode apps built this way are capped at **~25 scopes** (gws's "recommended" preset requests 85+, which breaks in testing mode) — worse than the two-scope minimal cut we'd want.
- **Verdict: does not meaningfully reduce user setup pain vs. our current gws-based flow** — it's the same bootstrap-your-own-project story, just with a nicer CLI on top once auth exists.
- Sources: [googleworkspace/cli README](https://github.com/googleworkspace/cli/blob/main/README.md), [Medium: Google shipped a CLI for Workspace](https://medium.com/coding-nexus/google-just-shipped-a-cli-for-all-of-google-workspace-and-it-works-with-ai-agents-too-204fe2bbd2f6)

### Google's official Workspace MCP servers (announced 2026)
- Google Workspace Developer Preview Program now offers **remote-managed MCP servers** for Gmail, Drive, Docs, Calendar, Chat with a standardized "connect Claude/Antigravity to Workspace" story, inheriting the signed-in user's own permissions.
- **Access is gated behind Developer Preview Program membership** — not general availability, and no evidence it removes the per-developer-app verification requirement; it appears to be Google standardizing the *protocol*, not offering us a pre-verified shared client to embed in our app.
- Sources: [Google Workspace Updates blog, May 2026](https://workspaceupdates.googleblog.com/2026/05/agent-tools-and-security-updates-for-workspace-developers.html), [Configure the Google Workspace MCP servers](https://developers.google.com/workspace/guides/configure-mcp-servers)

### Gemini CLI Workspace extension
- Installs via `gemini extensions install`, then wraps `gws` under the hood — same auth story as above (your own project) **unless** paired with the Apps Script/clasp trick (see below), in which case the extension's docs describe using Apps Script for "native, secure authorization" without a separate consent-screen setup.
- Sources: [Gemini CLI Workspace extension docs](https://gemini-cli-extensions.github.io/workspace/), [Medium: Gemini CLI Extensions for Workspace](https://medium.com/google-cloud/simplified-google-workspace-automation-with-gemini-cli-extensions-cbd86bcd7948)

### Apps Script as a bridge — the most promising Google-native no-GCP-project path
- Pattern demonstrated by the community tool **`google-automation-mcp`** (`uvx google-automation-mcp`, aka `gmcp`): uses Google's own **`clasp`** (Apps Script CLI) OAuth flow — the user signs in via a normal Google browser prompt using **Google's pre-existing clasp OAuth client**, no GCP console, no consent-screen configuration, no client secret of ours at all.
- One manual one-time step: toggle "Apps Script API" on at `script.google.com/home/usersettings`, then the tool deploys a small Apps Script **Web App** in the *user's own Google account* that acts as a router/proxy for Gmail, Drive, Sheets, Calendar, Docs, Forms, Tasks calls, executed with the script's own permissions (i.e., the user's account, no third party ever holds a token).
- **Real limitations** for a consumer product: Google-imposed consumer quotas on Apps Script — **~100 email recipients/day** and **~90 minutes of total script runtime/day** (roughly 2,700 tool calls/day) shared across every workspace surface. Fine for a personal assistant doing occasional Gmail/Calendar actions; not fine for heavy bulk email.
- Because it rides on Google's own clasp client, there is **no CASA, no brand verification, no user cap, no 7-day token expiry** for us to manage — Google already verified clasp.
- Risk: this is a clever community pattern (single-maintainer tool), not an official Google-sanctioned integration path; Google could tighten Apps Script's OAuth surface or quotas at any time, and we'd be depending on an unofficial technique.
- Sources: [Google Automation MCP (Glama)](https://glama.ai/mcp/servers/sam-ent/google-automation-mcp), [Apps Script API Evangelist writeup](https://apievangelist.com/2026/09/08/google-oauth-console-only-service-accounts-scriptable/), [Apps Script scopes docs](https://developers.google.com/apps-script/concepts/scopes)

---

## 3. Third-party auth brokers / hosted MCPs

| Provider | Free tier | Paid | Own Google verified app? | Self-host / OSS |
|---|---|---|---|---|
| **Composio** | 20K tool calls/mo | $29/mo (200K calls), $229/mo (2M calls), overage per 1K, Enterprise custom | Has a managed/shared Google auth option for quick start, but explicitly recommends **bringing your own OAuth app** for production with many users, and may still require **you** to submit for Google verification depending on config | Not self-hostable (SaaS) |
| **Pipedream Connect** | 3 connected accounts | Credit-based; "chatty agent hits the wall fast" per one review | Uses Pipedream's own connected-account infra | Not self-hostable |
| **Arcade.dev** | Hobby/free: 100 user challenges/mo, 1,000 standard + 50 "pro" tool executions/mo, 1 hosted MCP server | Paid tiers scale executions | Ships built-in auth for 43+ integrations incl. Google Workspace, so it appears to hold its own verified app(s) | Not confirmed self-hostable |
| **Nango** | Self-host free (limited features) or Cloud/BYOC | Tiered cloud pricing | You typically configure your own OAuth app per integration (Nango manages the token lifecycle, not the Google verification) | **Yes** — fully open source, Elastic License, self-hostable |
| **Klavis AI** | Open source | Hosted option available | Handles multi-tenant OAuth for catalog incl. Gmail/Sheets | **Yes** — Apache-2.0, self-hostable |
| **Zapier MCP** | Consumes "tasks" from a Zapier plan | Zapier plan pricing | Zapier-branded auth, no per-customer embedding model — built for a person automating their **own** accounts, not for embedding in another app | No |

**Assessment for "many free users":** All the *credit/call-metered* brokers (Composio, Pipedream, Arcade) become expensive fast at real usage — a chatty assistant doing routine Gmail/Calendar checks for thousands of free users would burn through free tiers in days and push YouCoded into a recurring per-call bill for something Google itself provides for free via OAuth. They mainly save the *verification/CASA* burden, not raw cost. **Self-hosted, open-source brokers (Nango, Klavis)** avoid the token-custody privacy problem and the metered-cost problem, but you still need your own registered Google OAuth app behind them — they don't grant you Google's verification, just nicer plumbing.
Sources: [Composio pricing](https://composio.dev/pricing), [Composio managed vs custom auth](https://docs.composio.dev/docs/custom-app-vs-managed-app), [Arcade pricing 2026](https://www.arcade.software/post/arcade-pricing), [Nango self-hosting](https://nango.dev/docs/guides/platform/self-hosting), [Nango GitHub](https://github.com/NangoHQ/nango), [Klavis AI overview](https://chatgate.ai/post/klavis-ai), [Zapier MCP vs Nango](https://zapier.com/blog/nango-vs-zapier/)

---

## 4. Community MCP servers / CLIs

- **taylorwilsdon/google_workspace_mcp** — most mature community option: MIT license, 3,200+ stars, active (3,059+ commits, 93 open issues, 119 open PRs), Docker/Helm deployment options, covers Gmail/Docs/Sheets/Slides/Calendar/Tasks/Contacts/Drive/Forms/Apps Script/Custom Search (well over 100 tools total). **Still requires the deployer's own OAuth credentials** — supports local "confidential client" flow or OAuth 2.1 multi-user with bearer tokens / domain-wide delegation for hosted/enterprise use. No shared/pre-verified client; same verification burden as building it ourselves, but saves the engineering effort of building 100+ tool wrappers.
  Source: [taylorwilsdon/google_workspace_mcp](https://github.com/taylorwilsdon/google_workspace_mcp), [workspacemcp.com](https://workspacemcp.com/)
- **gcalcli** (insanum) — mature, Python, Calendar-only. Each user creates their own Desktop-type OAuth client and passes `--client-id`; hits the standard "unverified app" browser warning ("Advanced > Go to gcalcli (unsafe)"). No shared client.
  Source: [gcalcli auth docs](https://github.com/insanum/gcalcli/blob/HEAD/docs/api-auth.md)
- **gogcli / gog** (steipete) — broader Go CLI: Gmail, Calendar, Drive, Docs, Sheets, Contacts. Stores OAuth client credentials separately from refresh tokens (OS keychain); supports `--readonly`/scope-narrowing flags for least privilege. Still: **user must create their own GCP project + Desktop OAuth client** before first use.
  Source: [gogcli README](https://github.com/steipete/gogcli), [gogcli auth setup](https://deepwiki.com/steipete/gogcli/2.2-authentication-setup)

**Verdict:** none of the community tools solve the "user must own a GCP project" problem — they're better *client libraries*, not auth-broker replacements. Only the Apps Script/clasp trick (`google-automation-mcp`, section 2) and OS-native calendar reads (sections 6-7 below) genuinely remove that step.

---

## 5. Non-OAuth fallbacks

- **App passwords (IMAP/SMTP)**: still allowed in 2026, requires 2-Step Verification enabled, 16-character password generated per client at `myaccount.google.com/apppasswords`. "Less secure apps" (plain password, no 2FA) has been fully dead since 2022 (personal) / March 2025 (Workspace). App passwords are a legitimate, Google-sanctioned fallback for mail only — no Calendar/Drive equivalent, and no Gmail label/thread API richness (raw IMAP/SMTP only). Simplest possible Gmail send/receive path, but it's a shared secret we'd have to store safely, and some users will find "generate an app password" only marginally less confusing than OAuth.
  Sources: [Gmail app password setup](https://cli.nylas.com/guides/gmail-app-password-setup), [Google Workspace: transition from less secure apps to OAuth](https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth)
- **Calendar private iCal URL**: read-only "secret address," trivially copy-pasted from Calendar settings. Zero setup friction, but strictly read-only, no write, and it's a bearer-secret URL (must be treated carefully, resettable if leaked).
  Source: [Google Calendar Help: secret address](https://support.google.com/calendar/answer/37648)
- **CalDAV for Google**: **dead end as an OAuth-avoidance path.** Google's CalDAV endpoint moved to `apidata.googleusercontent.com/caldav/v2/` and, since **March 14, 2025**, requires OAuth 2.0 just like the REST API — password-based CalDAV access was explicitly cut off alongside IMAP/SMTP/POP basic auth. It's read/write-capable, but only reachable via the same OAuth client we'd need anyway, so it offers no shortcut.
  Sources: [CalDAV API guide](https://developers.google.com/workspace/calendar/caldav/v2/guide), [Transition from less secure apps to OAuth](https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth)

---

## 6. Android specifics

- **CalendarContract** (`android.provider.CalendarContract`): with `READ_CALENDAR`/`WRITE_CALENDAR` permissions, an app can read and write events on **any calendar already synced to the device**, including a Google account's calendar that Android itself keeps in sync. **No OAuth, no Google Cloud project, no token at all** — this is genuinely free for Calendar CRUD. Caveat: calendars tied to a device *account* are only visible to apps acting as a registered sync adapter for writes in some paths; read access via the provider is generally available with the permission alone, and Android also offers an **intent-based handoff** to the Calendar app (even less permission needed, but no direct data access for the app itself).
  Sources: [Android Calendar provider overview](https://developer.android.com/identity/providers/calendar-provider), [CalendarContract deep dive](https://proandroiddev.com/android-calendar-api-in-action-a-deep-dive-into-calendarcontract-e7ccc90511e5)
- **Credential Manager + `AuthorizationClient`**: lets an Android app request Google API scopes tied to the account already signed into the device, surfaced via a native system prompt (no webview OAuth screen) and reusing a previously-signed-in account/grant. This is a nicer *UX* wrapper, **but it does not remove the underlying requirement**: sensitive/restricted scopes (Gmail, full Drive) still require the same app verification (and CASA for restricted scopes) — verification is "tied to the scopes being requested rather than the authentication method." So on Android this buys a much smoother in-flow consent experience, not an exemption from verification/CASA.
  Sources: [Android: Authorize access to Google user data](https://developer.android.com/identity/authorization), [AuthorizationClient reference](https://developers.google.com/android/reference/com/google/android/gms/auth/api/identity/AuthorizationClient), [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)

**Net for Android Calendar**: CalendarContract is close to a free lunch — real Calendar CRUD, zero OAuth, zero Google Cloud involvement, works today. No equivalent exists for Gmail or Drive on Android (those are genuinely separate Google services with no OS-level content provider).

---

## 7. Desktop specifics (reading via OS calendar store)

- **macOS**: `EventKit` (`EKEventStore`) is the single framework behind every account added in System Settings → Internet Accounts (iCloud, Google, Exchange, CalDAV). If the user has already linked their Google account to macOS (common), an Electron app can read/write those calendar events via a native EventKit binding (e.g., a small Swift/Obj-C helper or an existing npm/native module) with **zero OAuth** — "the desktop did the OAuth, the app never sees a credential." Only a standard macOS calendar-access permission prompt is involved. This is genuinely free Calendar coverage for Mac users who've already connected Google to macOS — but it's calendar-only (no Gmail/Drive equivalent on macOS), and does nothing for users who haven't added the Google account to macOS itself.
  Sources: [Local MCP — Connect Claude to Apple Calendar, no OAuth](https://www.local-mcp.com/guides/claude-calendar-mac-no-oauth), [EventKit no-OAuth pattern discussion](https://github.com/dongdongbh/mindwtr/issues/203)
- **Windows**: **no equivalent exists.** Windows' Mail & Calendar app syncs Google accounts internally, but there is no general-purpose, third-party-readable calendar content-provider API analogous to EventKit; UWP's `WebAccountProvider`/Graph-style APIs are oriented around Microsoft's own ecosystem (Outlook/Graph), not a generic "read whatever calendar the OS already synced" surface for arbitrary desktop (Win32/Electron) apps. A third-party desktop app on Windows still has to go through Google's own OAuth (or a Windows-side integration with Outlook's own OAuth, which isn't what we want). **Confirmed dead end for Windows.**
  Sources: [Windows 11 Mail and Calendar Google sync](https://mspoweruser.com/how-to-add-google-calendar-to-desktop-in-windows-11-a-step-by-step-guide/), general search — no third-party read API found for Windows' synced Google calendar.

---

## Overall recommendation

**Two-track approach, ranked easiest-to-hardest:**

1. **Now, no-cost, partial wins:** Ship CalendarContract on Android and EventKit on macOS for users who've already connected Google to their OS — zero setup, zero OAuth, genuinely delightful for Calendar. Doesn't touch Gmail/Drive or Windows/Linux.
2. **Best all-platform, all-service smoothing:** Adopt the **Apps Script/clasp bridge pattern** (à la `google-automation-mcp`) as YouCoded's primary Google integration. One Google sign-in via Google's own pre-verified clasp client, one manual "turn on Apps Script API" toggle, then full Gmail+Calendar+Drive+Docs+Sheets access with no GCP project, no consent-screen setup, no CASA, no brand verification, no 100-user cap, no 7-day token expiry for us to manage. Trade-off: consumer Apps Script quotas (~100 emails/day, ~90 min runtime/day) are fine for an assistant's typical Gmail/Calendar actions but would choke a bulk-mail feature; also rests on an unofficial (if Google-native) technique that a future Google policy change could break.
3. **If we want our own polished "Sign in with Google" button under YouCoded's brand:** register a Desktop-app OAuth client, keep the scope list narrow — Calendar (sensitive, no CASA) + `drive.file` (no verification at all) — and deliberately **exclude Gmail read/modify and full Drive** from that flow, routing Gmail instead through the app-password fallback or the Apps Script bridge. This avoids CASA entirely while still delivering a real "just click sign in" experience for Calendar/Drive.
4. **Avoid for now:** full-scope vendor-owned OAuth (recurring $500–$3,000+/yr CASA plus ongoing verification maintenance) and metered third-party brokers (Composio/Arcade/Pipedream — free tiers too small for "many free users," and per-call billing scales against us as usage grows). Revisit only if Google/Gmail becomes a paid, premium-tier feature where the economics change.

**Flagged as unverified / needs a direct answer from Google, not inferred from docs:** whether a genuinely local-only, no-backend-server architecture is exempt from CASA for restricted scopes. Docs hint at it, a live Google Developer forum thread asks the exact question and remains unanswered. Do not build a plan that assumes this exemption without confirming it (e.g., via Google's own OAuth verification support channel) first.
