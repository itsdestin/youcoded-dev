---
status: active
created: 2026-09-26
owner: marketing — first paid-ads experiment (Google Search, then YouTube)
---

# First ads experiment: Google Search and YouTube

Plain-language plan. Prices are 2026 published industry averages, not quotes; YouCoded's
real prices only appear once ads run. Every "expect" number below is a range with the
reasoning shown, so it can be checked against what actually happens.

## The short version

- **Spend $500 of your own money over ~5 weeks, on Search ads only.** Google currently gives
  a brand-new advertiser $2 of free ad credit for every $1 spent in the first 60 days
  (spend $500 → get $1,000). That $1,000 then pays for round two: YouTube videos plus more of
  whatever won on Search. About $1,500 of advertising for $500.
- **Realistic result of round one: roughly 5–30 new people who actually keep using the app.**
  The app has about 23 active devices a month today (2026-09-13 count), so even the low end
  is noticeable. The main thing $500 buys is *learning which story works*, not growth.
- **Bidding only on "ai agent" / "agentic ai" is the most expensive way to reach the least
  interested people.** Most of those searchers want an article explaining the idea, and the
  advertisers bidding against you are Salesforce, Microsoft, IBM and Google. Keep a small
  "Agents for Everyone" test, but put most of the money on narrower searches from people
  who want what YouCoded actually is.
- **Four things to settle before spending anything** (next section). Two of them could make
  paid visitors give up at the download step, which wastes the money.

## Before any money is spent

1. **Google's approval to advertise free downloadable software.** Google only lets the
   official publisher advertise free desktop software, and you must apply to be certified
   first ([policy](https://support.google.com/adspolicy/answer/13528034?hl=en)). One stated
   requirement is that *your own website* offers the direct download. Today the site's
   download button hands people installer files hosted on GitHub. That may pass (GitHub is
   your official release page) or may be rejected; if rejected, the fix is serving the
   download links through youcoded.ai. **Unknown until we apply.** The application is free.
2. **The "Windows protected your PC" and Mac "can't be opened" warnings.** The installers are
   still unsigned (roadmap: `dev-workspace.md`, blocked on the Windows certificate decision
   from 2026-09-23). A friend you told about the app pushes past that scary screen; a stranger
   who clicked an ad often does not. **This is the single biggest leak in the funnel.** Ads can
   run before it is fixed, but expect the lower end of every number below, and Mac visitors
   in particular are close to wasted until signing lands.
3. **Claims on the site that are not true yet.** Paid traffic brings sceptical strangers, and
   Google's "misrepresentation" policy can suspend an ad account over overclaims. Checked
   against the live site today: the grammar error is fixed, but the integrations grid still
   lists services with no backing (e.g. Safari), per fact sheet §25. Fix before launch.
4. **Phones.** Most Google searches happen on phones, but the desktop app cannot be installed
   from one, and Android installs are a sideloaded APK until the Play listing exists. **Round
   one targets computers only.** The Android story waits for Google Play.

## Who we are talking to — five stories

Each story becomes its own "ad group": its own search words, its own ads, and its own
tracking label, so the dashboard shows which one wins.

| # | Story (the headline idea) | Who it's for | Example searches we'd bid on | Expect |
|---|---|---|---|---|
| A | **Agents for Everyone** — "AI that does the work, not just the chat. Free." | Curious non-technical people | ai agent app, personal ai agent, ai assistant that does tasks, agentic ai for beginners | Most searches, priciest clicks, fewest downloads. Small test budget. |
| B | **Claude Code without the terminal** — "Your Claude plan, in a real app." | People who pay for Claude and find the terminal off-putting | claude code gui, claude code desktop app, claude code windows, claude code for non programmers | Few searches, but the best-fitting people. Likely winner. |
| C | **Free, private, on your own computer** — "Run AI models offline. No subscription." | Privacy- and cost-minded people | local ai app, run llm locally, offline ai assistant, private chatgpt alternative | Crowded (LM Studio, Jan, Ollama apps) but cheap clicks. |
| D | **The AI desk for students** — "Research, write and organise with an AI that works on your files." | Students | ai study assistant app, ai for research papers free | Cheap clicks, uncertain fit. Test lightly. |
| E | **Your phone runs the agent** — "The only agent app that runs on Android itself." | Android users | claude code android, ai agent android app | **Parked** until the Play Store listing. Our most unique claim, but we can't send ad traffic to a sideloaded APK. |

**"YouCoded — Agents for Everyone"** fits Google's 30-character headline limit exactly, and
stays in every ad group as one of the headlines. Google shows 2–3 headlines at a time, picked
from up to 15 we write, and learns which combinations get clicked.

**On "show as the top result":** ads appear above the normal results, marked "Sponsored".
Nobody can buy a guaranteed top spot — Google ranks ads by bid × how relevant it judges the
ad. On narrow searches (story B), top position is cheap and likely. On "ai agent" it means
outbidding enterprise companies, which is not worth it.

**Words we block** ("negative keywords"), so we don't pay for the wrong people: jobs, salary,
course, certification, definition, what is, examples, pdf, stock, Salesforce, Agentforce,
enterprise, and similar. This matters most for story A, where most searchers are learning,
not shopping.

**A caution on the word "Claude."** Using it in the search words is normal. Using it in the
ad text is allowed in the US as a factual description ("works with your Claude plan") until
Anthropic objects — and staying on good terms with Anthropic matters more than one ad. Story
B's ads will say "Claude" only in that factual way, never as if YouCoded were an Anthropic
product.

## How we measure it

Two dashboards, and one blind spot.

1. **Google Ads** shows, per story: how often the ad was shown, clicks, click rate, cost per
   click, total spent.
2. **Your own website dashboard** (the owner Website report, shipped 2026-09-15) already
   tracks "campaign links". Each story gets a link like
   `youcoded.ai/?utm_source=google&utm_campaign=claude-code-gui`, and the dashboard reports,
   per story: visits, people who opened the install instructions, and people who clicked a
   download button, split by Windows / Mac / Linux. No new building needed — each label pair
   just has to be registered with "Copy link" before launch.
3. **The blind spot: nobody sees installs or real use per story.** App usage analytics are
   deliberately not linked to website visits (a privacy decision). We can only watch
   whether the app's overall new-device count rises while ads run. Google also can't see
   downloads, so we tell it to aim for clicks at a price cap, rather than letting it
   "optimise for downloads" — which is fine at this size. Adding Google's own tracking tag
   to the site would fix that, but it contradicts the privacy page; **recommend not
   doing it** in round one.

**The funnel we judge every story on:**
`cost per click` → `% of visitors who click Download` → `cost per download click`.

## What it costs and what to expect

**Round one: Search only, $500 over ~5 weeks (~$14/day), computers only, US + other
English-speaking countries.**

| Step | Assumption (why) | From $500 |
|---|---|---|
| Clicks | $1.50–$4 per click on the narrower searches; tech averages ~$3.80 in 2026; story A higher | ~125–330 visitors |
| Download clicks | 15–25% of well-matched visitors (free app, clear page) | ~20–80 |
| Actually installed | 40–70% — unsigned-installer warnings lose many | ~10–50 |
| Still using it after a week | Roughly half — the app still asks people to set up a model or Claude plan | **~5–30** |

So roughly **$15–100 per lasting user**. That is expensive for a free app, and normal for a
first test. The number improves by: signing the installers, a landing section written for
each story, and cutting the losers.

**Round two: the $1,000 free credit** (arrives up to ~35 days after hitting $500).
- ~$400 on more of the winning Search stories.
- ~$600 on **YouTube**: short 15–30 second clips of the app, shown before videos about AI
  tools and productivity, and as Shorts. YouTube is cheap to be seen on ($0.02–0.05 per
  view; Shorts ~$5 per 1,000 showings), so $600 is roughly 12,000–30,000 views — but very
  few viewers click through (~0.5–1%), so think ~60–250 visits. YouTube is for testing
  *which story makes people watch*, and for recognition, not for downloads.
- The clips come from the app itself — the workspace already has tooling to record the
  real app for the landing page.

**Important timing trick:** the free-credit offer counts from the day the Google Ads account
is created (new = under 14 days old, spend within 60 days). **Don't create the account until
the "before any money" list is done**, or the clock runs out while we wait.

## Rules for cutting and keeping (checked weekly)

- A story with under 2% click rate after 1,000 showings: rewrite its ads once, then cut.
- A story with 50+ clicks and zero download clicks: cut.
- The story with the lowest cost per download click gets the freed money.
- Never judge on the first 3–4 days — Google is still learning.

## Who does what

- **Destin (needs his identity and card):** create the Google Ads account, pass Google's
  identity/business verification (using the LLC), add payment, submit the free-software
  certification form, register the campaign links in the owner dashboard.
- **Claude:** write every ad, search-word list and blocked-word list; build the whole
  campaign as one file Google Ads can import; the landing-page fixes; the YouTube clips;
  and a weekly read of the numbers (from a report download Destin saves, or a screenshot)
  with the cut/keep calls.

## Sources

- Search volume ("agentic ai" ~110,000/month, "ai agents" ~60,500, US):
  [Truelogic](https://www.truelogic.com.ph/blog/ai-agent-search-volume-marketing-automation/)
- Click prices: [WordStream 2026](https://www.wordstream.com/blog/2026-google-ads-benchmarks),
  [Ryze](https://www.get-ryze.ai/blog/google-ads-cost-benchmarks-by-industry-2026),
  [Superscale](https://superscale.ai/learn/google-ads-cpc/)
- YouTube prices: [Digital Applied](https://www.digitalapplied.com/blog/youtube-ads-benchmarks-2026-cpv-cpm-ctr-industry),
  [LocaliQ](https://localiq.com/blog/youtube-advertising-cost/)
- New-advertiser credit: [ALM Corp](https://almcorp.com/blog/google-ads-2x-credit-new-accounts/),
  [Google help](https://support.google.com/google-ads/answer/6388096?hl=en)
- Free desktop software rule: [Google policy](https://support.google.com/adspolicy/answer/13528034?hl=en)
- Product facts: `youcoded-feature-fact-sheet.md` §22, §25; site analytics record
  `docs/archive/design/2026-09-14-site-marketing-analytics/README.md`.
