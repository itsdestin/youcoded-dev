---
status: draft
created: 2026-08-31
topic: What the WeCoded marketplace should feature on day one
---

# What to feature in the marketplace

## The short version

You asked three questions: should we feature the most-downloaded dev tools, should we feature
Home Assistant integrations, and should we feature the things that make this feel like a real
Jarvis. The honest answers are **no, we can't** (there is no install or vote data yet — the
highest install count in the whole system is one), **not yet** (a good Home Assistant server
does exist out in the world, but our installer physically cannot install that kind of thing
today, so mirroring it would produce a card with no Install button), and **yes — and the best
ones are already ours and are currently hidden.**

The single biggest finding is this: **the most useful everyday-life plugins in the entire
4,156-item catalog are the ones you built, and three of them are not in `featured.json` at
all** — `google-services` (23 skills: Gmail, Drive, Docs, Sheets, Slides, Calendar),
`spotify-services` (12), and `youcoded-chatsearch`. Meanwhile the hero slot is given to
`civic-report`, which only works for people in the United States who care about federal
politics and which requires them to go get an API key before it does anything.

The second biggest finding is a problem with the current list: **nine of the things you feature
today display a grey "Not checked" warning label on their cards**, telling the user "We haven't
checked this one — look at the source before you install it." That is not a good look on a
curated shelf, and it is happening for a boring technical reason rather than a safety one.

---

## 1. Why "most downloaded" is not available

I checked the live statistics endpoint. Every install record in the system is a test install.

```
$ curl -s .../stats | ...
entries with a stats row: 35
max installs: (1, 'youcoded-food')
total installs: 35
any votes: 0
reviews: 1
```

Thirty-five listings have been installed exactly once each, by you, while testing. There are
zero thumbs-up or thumbs-down anywhere in the system and one review.

So there is no popularity signal to read. Whatever ships in `featured.json` on day one is
**your editorial judgement**, not a measurement — and the copy should never imply otherwise
("Most popular", "Trending", "#1 this week" would all be lies right now). The good news is
that this fixes itself: once real people install things, the same file can be re-cut against
real numbers.

### The star counts are real, but they measure the wrong thing

Your grounding note said the `stars` number is repo-level rather than per-listing. That is
correct, and I confirmed the mechanism. I also double-checked the raw numbers against GitHub,
because some of them looked impossible:

```
obra/superpowers            -> 279847 stars
mattpocock/skills           -> 242346
ChromeDevTools/chrome-devtools-mcp -> 50246
huggingface/skills          -> 10991
```

They are accurate. I was wrong to doubt them. But the *attribution* is the problem: 2,743
listings carry a star count and they share only 211 distinct values, because every plugin in a
repo inherits that repo's number. Ninety-six separate listings all show **35,665** — that is
the star count of `anthropics/claude-plugins-public`, the repo they happen to live in, not a
statement about any one of them. All fifteen `superpowers` rows show 279,791.

**Practical rule:** a star count tells you "the repo this came from is famous." It never tells
you "this plugin is good." Use it to break a tie between two things you already like. Never
put it on a card as a ranking.

---

## 2. The thing that will bite you: nine featured items say "Not checked"

The catalog gives every listing a safety label. I read the code that renders it
(`youcoded/desktop/src/renderer/components/marketplace/TrustBadges.tsx`):

- `checked` → **"Likely safe"** — "An automatic check read every file in this version and
  found nothing suspicious."
- `unchecked` → **"Not checked"** — *"We haven't checked this one — read 'What this can do'
  and look at the source before you install it."*

Now here is what your current `featured.json` actually contains:

| Featured today | Label the user sees |
|---|---|
| civic-report, youcoded-encyclopedia, superpowers, youcoded-inbox, wecoded-themes-plugin, remember, notion, youcoded-messaging, wecoded-marketplace-publisher, youcoded-output-styles | Likely safe |
| **skill-creator, plugin-dev, mcp-server-dev, claude-md-management, hookify, math-olympiad, session-report, ralph-loop, code-review** | **Not checked** |

Nine of nineteen. And every one of those nine is **Anthropic's own first-party plugin**.

### Why this happens — and why it is not a safety warning

It is not that those plugins are risky. It is that the scanner never looked at them. The
pattern is completely uniform by *source*, which is the tell:

```
   126 (anthropic, local,       unchecked)   <- ALL of them, no exceptions
   866 (anthropic, git-subdir,  checked)
  1508 (anthropic, url,         checked)
   977 (awesome-copilot, *,     unchecked)   <- ALL of them
   314 (docker, mcp-registry,   unchecked)   <- ALL of them
   252 (cursorrules, file,      checked)
    71 (youcoded, local,        checked)
```

Every single Anthropic plugin that is stored as `local` is unchecked, and every single one
stored the other two ways is checked. Nothing about the plugins themselves varies — only how
the ingest fetched them. It is a gap in the scanning pipeline.

**What I would do:** treat this as a bug to fix rather than a curation constraint. Getting the
scanner to cover the `anthropic/local` source would flip 126 listings — including nine of your
featured picks — from a discouraging grey warning to "Likely safe" in one change. Until that
happens, you have a choice, and neither option is free:

- **Feature them anyway** (what you do now). The picks are genuinely good. Cost: a warning
  label on nine curated cards, which is exactly the opposite of what curation is for, and it
  quietly teaches people to ignore the label — which makes it useless later when it matters.
- **Feature only checked things.** Cost: you lose `skill-creator`, `plugin-dev`, and
  `mcp-server-dev`, and your entire "Build your own" rail collapses. Those are the plugins that
  teach people to make their own stuff, which is a core pillar of the product.

**My recommendation: fix the scanner, and in the meantime keep featuring them.** The picks are
right; the label is wrong. But do not add *more* unchecked items than you have to, and put the
checked ones first inside each rail so the first card a person sees is a clean one.

---

## 3. Home Assistant: it exists upstream, but we cannot install it yet

You asked specifically about Home Assistant. There are two separate questions here — *is there
anything to mirror?* and *could we use it if we mirrored it?* The answers are **yes** and
**no**, in that order, and the second one is what decides this.

### Nothing is in our catalog today

I verified this three independent ways, because a confident "there are none" deserves more than
one search.

**In my catalog snapshot** — searching names, descriptions, tags, authors, repo URLs, capability
labels and every component name:

```
=== home assistant: 0 hits ===
=== alexa/google home: 0 hits ===
=== thermostat/lights/locks: 0 hits ===
=== jarvis: 0 hits ===
=== smart home/iot: 7 hits ===
```

**In the live production catalog**, fetched fresh rather than from my copy:

```
live entries: 4156
smart-home hits in LIVE catalog: 0 []
```

**In Docker's own source file**, before our ingest touches it:

```
'ome Assistant': 0    'hass': 0    'homeassistant': 0
'zigbee': 0           'SmartThings': 0              'Philips Hue': 0
```

The seven "IoT" hits are all industrial and cloud engineering tools —
`docker-aws-iot-sitewise` ("Industrial IoT asset management"),
`copilot-agent-azure-smart-city-iot-architect`, and similar. None of them turn on a lamp.

### What exists in the wild

A parallel web research pass checked the upstream sources. Summarising what it verified:

- **Home Assistant ships its own MCP server.** The `mcp_server` integration landed in Home
  Assistant 2025.2. Crucially, **it is not a package anyone installs** — it is a toggle inside
  a person's own Home Assistant, exposing an HTTP endpoint at `/api/mcp` behind their own
  access token. There is nothing there for a marketplace to distribute.
- **There is essentially one good community server**: `homeassistant-ai/ha-mcp`, ~4,600 stars,
  actively maintained, installable via pip and Docker. (Worth a pinch of salt: it has only ~21
  watchers against 4,600 stars, an odd ratio.) The next best, `tevonsb/homeassistant-mcp` at
  575 stars, has not been touched in seven months, and the one that used to be the reference
  implementation is archived.
- **Docker's catalog has zero Home Assistant entries** — confirmed by listing its `servers/`
  directory directly, which matches what I found in our own copy of it. Docker's set is
  curated for developers and infrastructure; it will never supply consumer breadth.
- **The official MCP Registry has six Home Assistant entries** among ~25,900 servers.

### Why adding a source would not help yet

**First, a distinction worth being precise about, because getting it wrong sends someone off to
build something that already exists.** YouCoded *fully supports MCP servers* — there is a client,
a manager, a registry, per-tool permissions, encrypted secret storage, and `mcp.json` synced
across devices (`desktop/src/main/harness/mcp/`), and installing a plugin that bundles an MCP
server wires it up automatically (`skill-provider.ts` calls `reconcileMcp()` right after a
successful install). The gap is **not** MCP support. It is narrower: the installer only knows how
to clone a git repo, and these listings have no repo to clone — their whole payload is a container
image reference (`sourceRef: docker:mcp/brave-search@sha256:…`). So the accurate statement is
"we support MCP but cannot yet *acquire* a server that ships as an image rather than a repo."

The shape does fit, which is why this is worth doing eventually: a stored server needs an id, a
label, a transport and its secret refs; the supported transports are `stdio` (a command plus
args) or `http`; and a Docker-image server runs as `docker run -i mcp/brave-search`, which is a
valid stdio command. The catalog row even already knows Brave Search needs a `BRAVE_API_KEY`,
because the scanner worked that out. The real obstacles are practical rather than architectural:
it would require **Docker installed on the user's machine** (a heavy dependency for a
non-technical audience, and the honest reason this was deferred), a first-run prompt for the API
key instead of a silent failure, and it would still show "Not checked" because we hold metadata
only.

Here is the part that matters more than whether such a server exists: **our installer cannot
install this class of thing at all.** From the marketplace overhaul plan's own "Deferred"
section, explaining why the official MCP Registry was cut:

> They are not installable (the installer has no `mcp-registry` source type — Task 21 correctly
> shows "Open source" instead of Install), not rateable (a vote requires a prior install), and
> never scanned. So they would arrive as thousands of grey "Not checked" cards diluting the grid
> the curation exists to protect.

I confirmed this in the installer code: it handles exactly three source types — `local`, `url`,
and `git-subdir`. Anything arriving as `mcp-registry` gets an "Open source" link instead of an
Install button. That is why all 314 Docker entries in the catalog today are non-installable.

So if we mirrored `ha-mcp` tomorrow, the result would be **a card with a grey "Not checked"
label and no Install button**, sitting in a featured rail. That is worse than not having it.

### And the registry itself is mostly junk

The obvious move — "just add the official MCP Registry, it has 25,900 servers" — would badly
damage the catalog. The research pass sampled 150 random entries and resolved them against
GitHub: **only 78 still pointed at a live repo**, and of those, the median was **half a star**,
half had one star or fewer, and not one had fifty. Anyone can self-publish to it, and a large
share is marketing spam for paid services. Adding it raw would take the catalog from 4,156
listings to roughly 30,000, of which about 86% would be junk with dead links.

### The smallest version that would actually work

In strict order, because each step is useless without the one before it:

1. **Give the installer a real path for MCP servers.** This is the blocker. Nothing else
   matters until it exists.
2. **Then add one source with a hard quality gate** — drop anything with no installable
   package, and for GitHub-hosted entries require a star floor and a push in the last year.
   On the sampled data that keeps well under 5%, so roughly 500–1,000 real servers rather
   than 25,900.
3. **Or, much cheaper: `punkpeye/awesome-mcp-servers`** — a single human-curated markdown file,
   ~3,500 entries already sorted into the exact categories a non-developer would browse ("Home
   Automation", "Health & Wellness", "Travel"). One fetch, no filtering pipeline. The catch is
   coverage: its Home Automation section has **9 entries** and Health & Wellness has **3**.

### The honest size of the prize

This is the part I want to be blunt about, because the noise around MCP oversells it badly. The
consumer side of this ecosystem is small and immature. Outside Home Assistant, smart home is
essentially empty — the best SmartThings server has 5 stars, the best Philips Hue one has 22,
the best HomeKit one has 3. There is **no official Spotify, Google Calendar, Gmail, or
fitness-tracker MCP server**; every one is a hobbyist project, several already abandoned.
Recipes peak at 37 stars.

The categories that genuinely hold up are exactly three:

| Category | Best of what exists |
|---|---|
| **Notes** | Notion's own official server (~4,600★), Obsidian (~4,400★) — the strongest by far |
| **Home Assistant** | `ha-mcp` (~4,600★) — one good option, not a category |
| **Fitness wearables** | Garmin (~1,100★), Apple Health (~560★), Strava (~475★), Whoop, Oura |

A "Jarvis" shelf built from the whole internet today would honestly be **20 to 40 good
listings**, not hundreds. That is worth having — fitness in particular is a real gap, since our
catalog has literally zero health listings — but it should be understood as *seeding a small
curated shelf*, not as a breadth win.

**My recommendation: do not chase this for launch.** It is a real feature and I would put it on
the roadmap, but it starts with installer work, not with a data source. Adding the source first
would visibly make the marketplace worse. And when it does land, the first rail it enables is
probably **fitness and notes**, not smart home — those are where the quality actually is.

---

## 4. What a "Jarvis" rail can honestly contain today

Stripped of the smart-home fantasy, "Jarvis" means: *it knows my stuff, and it can go do
things in the world on my behalf.* Both halves are actually available — just not from where
you would expect.

I swept the whole catalog for consumer and life categories. The result is stark:

| Area | Installable things that exist |
|---|---|
| Health / fitness | **0** (and this is the one real upstream gap — see §3) |
| Shopping | **0** |
| News / weather | **0** |
| Travel | 0 real ones (all hits were false positives — `code-modernization`, `buildkite`) |
| Personal finance | 0 real ones (`receipts` is a Claude-usage report, `mintlify` is docs) |
| Recipes / food | **1** — and it is yours (`youcoded-food`) |
| Music | 2 — `spotify-services` (yours) and `save-to-spotify` |
| Calendar / email | 11 — the two best are yours (`google-services`, `apple-services`) |
| Notes / journaling | 17 — the three best are yours (`youcoded-encyclopedia`, `youcoded-inbox`, `youcoded-chatsearch`) |

The entire "everyday life" catalog is basically **your own 13 plugins plus about six from
Anthropic's list**. Every one of the five upstream sources is a developer source, so this is
not surprising — but it does mean the answer to "what makes this genuinely useful as a real
assistant" is: *the things you already built, shown properly.*

### The "knows my stuff" half — all yours, mostly hidden

These are the biggest, most capable everyday plugins in the catalog, measured by how much they
actually add:

| Plugin | Adds | Checked? | Featured today? |
|---|---|---|---|
| `google-services` | 23 skills + 1 command | Likely safe | **No** |
| `apple-services` | 15 skills + 1 command | Likely safe | **No** |
| `spotify-services` | 10 skills + 2 commands | Likely safe | **No** |
| `youcoded-encyclopedia` | 5 skills | Likely safe | Yes (hero) |
| `youcoded-chatsearch` | 1 skill | Likely safe | **No** |
| `youcoded-food` | 1 skill | Likely safe | **No** |

**One important nuance so I don't oversell this.** `apple-services` and `google-services` are
*already* surfaced — not in `featured.json`, but in the Integrations rail, which the app renders
*above* the curated rails specifically so people connect their accounts first. I checked
`integrations/index.json`:

```
apple-services, google-services, imessage, todoist,
applescript, canva, github, macos-control, windows-control
```

So they are not invisible. But `spotify-services`, `youcoded-food` and `youcoded-chatsearch` are
in neither place, and `google-services` — a 23-skill plugin that connects a person's entire
Google account — deserves more than a small connection tile.

### The "goes and does things" half — four genuinely good picks

| Plugin | What it does | Status |
|---|---|---|
| `zapier` | "Connect 8,000+ apps to your AI workflow" | Likely safe, installable |
| `browser-use` | "Give Claude a real browser — your Chrome or a cloud browser" | Likely safe, installable |
| `exa` | Web search, deep research, content extraction | Likely safe, installable |
| `firecrawl` | Turns any website into clean readable text (10 skills) | Likely safe, installable |

**`zapier` is the single most Jarvis-shaped thing in the entire catalog** and it is not featured.
Eight thousand app connections is, in practice, the smart-home answer too — Zapier connects to
Home Assistant, Philips Hue, and most consumer devices. It is not as good as a native
integration, but it exists today and it installs today, which the native one does not.

**One I recommend against:** `desktop-commander` (terminal commands, process management, file
operations). It is popular and well-made, but it hands a third-party MCP server broad control of
the user's machine, and — see below — its capability panel does not disclose that. That is fine
for a developer who goes looking for it. It is not something to put on a curated shelf in front
of a college student.

---

## 5. A problem with the "What this can do" panel you should know about

While checking capabilities, I found that the panel **under-reports for plugins that are
wrappers around an MCP server**. The scanner reads the plugin's own files, but an MCP server's
behaviour lives inside the server, which it never sees:

```
desktop-commander  caps: ['network', 'adds']     desc: "terminal commands, process management, and file operations"
github             caps: ['adds']                 hasMcpConfig: True
playwright         caps: ['adds']                 hasMcpConfig: True
serena             caps: ['adds']                 hasMcpConfig: True
context7           caps: ['adds']                 hasMcpConfig: True
```

`desktop-commander` runs terminal commands, and its panel does not say "Runs commands on your
computer." `github`, `playwright`, `serena` and `context7` all reach the network and its panel
says nothing at all beyond "adds".

For skill-and-hook plugins (like all of yours) the panel is honest — `civic-report` correctly
declares shell access, four network hosts and the API key it needs. It is specifically the MCP
wrappers that are blank.

**Effect on users:** someone comparing two cards will think the MCP wrapper is the *safer* one,
because its "What this can do" list is shorter. That is exactly backwards. Worth a roadmap item;
in the meantime it is another reason to keep `desktop-commander` off a curated rail.

---

## 6. Two smaller data problems worth a note

**Stale ids in the stats table.** The stats endpoint still carries `destinclaude-encyclopedia`
and `destinclaude-messaging` — the old naming. Harmless today (nobody reads those numbers), but
they will misattribute installs once real ones arrive.

**Two picks look hollow.** `mattpocock-skills` and `learn-with-coursera` both report zero
components, zero members, and no capabilities — meaning their cards would render with an empty
"What this can do" panel. The upstream repos clearly do contain skills, so this is likely
another ingest detection gap rather than empty plugins. I have kept `learn-with-coursera` in the
proposal below because it is genuinely the only education pick in the catalog, but **look at its
card before you ship it**; if the panel is blank, drop it.

---

## 7. Judging the current `featured.json`

Not wrong. Partly right, and structurally sound — I would keep six of the seven existing rail
titles and most of the picks. The voice is good and I have matched it.

What it gets right:
- The rail *titles* are the right idea. "Not just for coders" is doing real strategic work.
- `superpowers` in the hero is correct — it is the most substantial single plugin available.
- "Build your own" is well-aimed at the personalization pillar.

What I would change, in priority order:
1. **Surface `google-services` and `spotify-services`.** Biggest miss by far.
2. **Reconsider `civic-report` as hero slot one.** I would keep it prominent but move it into
   rails. It is US-only, politically-flavoured, and needs the user to obtain an API key before
   it produces anything — three kinds of friction in the first thing anyone sees. It is a great
   *third* impression and a poor first one.
3. **Add a rail for acting on the world** (`zapier`, `browser-use`) — the closest honest thing
   to the Jarvis question.
4. **Use the themes.** Rails can contain theme slugs (I verified this in `MarketplaceScreen.tsx`
   — a rail resolves each slug against skills *and* themes), and there are seven themes sitting
   unused behind a single legacy entry.
5. **Split the coding picks into their own rail** so the general rails stay general.

### A UI risk you should know about before editing this file

Rails silently drop ids they cannot resolve, and a rail whose items all fail **disappears
entirely** rather than showing an error. From the renderer:

```js
.filter(Boolean) as Array<...>;
if (items.length === 0) return null;
```

So a single typo in a slug does not throw an error — it just makes a rail quietly one card
shorter, and nobody notices for months. **Every id in the proposal below has been checked
programmatically** against the live catalog: exists, is a top-level plugin (not a sub-skill),
and has an installable source type. The check returned `PROBLEMS: none`.

---

## 8. Proposed `featured.json`

Ten rails, up from six. That is more scrolling, which is a real cost — if it feels long, the
two I would cut first are "For fun" and "Make it yours", in that order.

```json
{
  "hero": [
    {
      "id": "google-services",
      "blurb": "Gmail, Drive, Docs, Sheets, Slides, and Calendar — connected in one step.",
      "accentColor": "#d8a84b"
    },
    {
      "id": "youcoded-encyclopedia",
      "blurb": "Your personal knowledge graph — facts, notes, and memories that persist across sessions.",
      "accentColor": "#6b8ecf"
    },
    {
      "id": "superpowers",
      "blurb": "Teach Claude brainstorming, planning, TDD, and subagent-driven development — built-in.",
      "accentColor": "#7bc56b"
    }
  ],
  "rails": [
    {
      "title": "Destin's picks",
      "description": "What I'm using this week.",
      "slugs": [
        "google-services",
        "civic-report",
        "spotify-services",
        "youcoded-encyclopedia",
        "superpowers",
        "wecoded-themes-plugin"
      ]
    },
    {
      "title": "Connect the apps you already use",
      "description": "Your accounts, in the conversation.",
      "slugs": [
        "spotify-services",
        "notion",
        "dropbox",
        "slack",
        "box",
        "zapier"
      ]
    },
    {
      "title": "For everyday life",
      "description": "Not just for coders.",
      "slugs": [
        "civic-report",
        "youcoded-food",
        "youcoded-inbox",
        "youcoded-messaging",
        "save-to-spotify",
        "learn-with-coursera"
      ]
    },
    {
      "title": "Let it go do things",
      "description": "Reaches past the chat window.",
      "slugs": [
        "zapier",
        "browser-use",
        "exa",
        "firecrawl"
      ]
    },
    {
      "title": "If you journal",
      "description": "Capture, recall, connect.",
      "slugs": [
        "youcoded-encyclopedia",
        "youcoded-chatsearch",
        "youcoded-inbox",
        "remember",
        "notion"
      ]
    },
    {
      "title": "Make it yours",
      "description": "Change how the whole app looks.",
      "slugs": [
        "wecoded-themes-plugin",
        "golden-sunbreak",
        "halftone-dimension",
        "kuromi-dreamer",
        "strawberry-kitty",
        "cotton-candy-sky"
      ]
    },
    {
      "title": "Build your own",
      "description": "Build with conversation, not code.",
      "slugs": [
        "wecoded-marketplace-publisher",
        "wecoded-themes-plugin",
        "skill-creator",
        "plugin-dev",
        "mcp-server-dev"
      ]
    },
    {
      "title": "Make Claude better",
      "description": "Meta-skills that level up every workflow.",
      "slugs": [
        "superpowers",
        "remember",
        "youcoded-output-styles",
        "claude-md-management",
        "hookify"
      ]
    },
    {
      "title": "If you write code",
      "description": "The pick of 2,600 developer listings.",
      "slugs": [
        "superpowers",
        "chrome-devtools-mcp",
        "context7",
        "claude-security",
        "pr-review-toolkit",
        "frontend-design"
      ]
    },
    {
      "title": "For fun",
      "description": "Quirkier picks worth a try.",
      "slugs": [
        "math-olympiad",
        "playground",
        "session-report",
        "receipts",
        "ralph-loop"
      ]
    }
  ],
  "skills": [
    { "id": "superpowers", "tagline": "Brainstorming, planning, TDD and code review, built in" }
  ],
  "themes": [
    { "slug": "golden-sunbreak", "tagline": "Weathering With You — Tokyo bathed in god-ray light" }
  ]
}
```

### Notes on the proposal

**Ordering inside rails is deliberate.** In every rail that mixes them, the "Likely safe"
listings come first and the "Not checked" ones last, so the first card a person sees is clean.
"Build your own" and "If you write code" are the two rails where this matters most.

**The `skills` and `themes` arrays at the bottom are legacy.** The type definition says
*"Legacy shape — passed through for older clients; to be dropped in Phase 2."* I have kept them
so older app versions still show something, and swapped `code-review` (unchecked) for
`superpowers` (checked). Delete both arrays whenever Phase 2 lands.

**What I deliberately left out, and why:**

| Left out | Why |
|---|---|
| `desktop-commander` | Third-party MCP server with terminal and file access, and its capability panel does not disclose it. Fine to find; not to recommend. |
| `mattpocock-skills` | Zero detected components — the card would render an empty "What this can do" panel. Revisit after the ingest gap is fixed. |
| `serena` | Excellent, but its value is invisible to anyone who isn't already deep in a large codebase. |
| `github`, `playwright`, `figma`, `stripe` | Good tools, but the rail was full and these are the ones people find by searching anyway. |
| `hyperframes`, `huggingface-skills` | Large and impressive, but narrow — video generation and ML model work. |
| Anything from awesome-copilot, cursorrules, or Docker | **None of them are installable and checked.** Of 4,156 listings, only 2,445 are both, and every one of those comes from Anthropic's list (2,374) or ours (71). |

---

## 9. What I would actually do, in order

1. **Ship the new `featured.json`.** It costs nothing and fixes the biggest miss — your best
   everyday plugins being invisible.
2. **Fix the scanner gap for `anthropic/local` sources.** One change flips 126 listings,
   including nine featured ones, from "Not checked" to "Likely safe."
3. **Fix component detection** for the repos that report zero (`mattpocock-skills`,
   `learn-with-coursera`), so their cards stop looking empty.
4. **Roadmap: disclose MCP-server capabilities**, so the "What this can do" panel stops making
   the most powerful plugins look like the safest ones.
5. **Roadmap: an install path for MCP servers.** This is the real prerequisite for smart home,
   Home Assistant, fitness trackers and the rest — not a new data source. When it lands, seed
   it from a curated shelf of 20–40 servers, and expect fitness and notes to be the strongest
   categories, not smart home.
6. **Revisit this file once real install numbers exist.** Then, and only then, a rail can
   honestly be called "Most installed."

---

## Appendix: how each claim here was checked

| Claim | Method |
|---|---|
| No popularity data | Live `/stats`: 35 rows, max 1 install, 0 votes |
| Star counts are repo-level | 2,743 rows share 211 values; 96 rows share 35,665 (= `anthropics/claude-plugins-public`) |
| Star numbers are nonetheless accurate | GitHub API cross-check on 7 repos |
| No Home Assistant in our catalog | Regex over all text fields in the snapshot (0), the live `/catalog` (0), and Docker's raw source file (0) |
| What exists upstream | Parallel web research pass — GitHub API star/push checks, full crawl of the official MCP Registry, direct listing of Docker's `servers/` directory |
| Registry is mostly junk | 150-entry random sample resolved against GitHub: 78 live, median 0.5 stars |
| "Unchecked" tracks source, not risk | Cross-tab of marketplace × sourceType × scan status — uniform by source |
| Only 2,445 listings are installable + checked | Filter on `sourceType ∈ {local, url, git-subdir}` and `scan.status == checked` |
| Installer handles 3 source types | Read `plugin-installer.ts` — `local`, `url`, `git-subdir`; default case fails |
| MCP servers can't be installed | The overhaul plan's "Deferred" section, confirmed against installer code |
| Rails silently drop bad ids | Read `MarketplaceScreen.tsx` — `.filter(Boolean)` then `if (items.length === 0) return null` |
| Rails accept theme slugs | Same file — each slug is looked up in `skillById` then `themeBySlug` |
| "Not checked" wording | Read `TrustBadges.tsx` |
| Apple/Google already surfaced | Read `wecoded-marketplace/integrations/index.json` |
| MCP wrappers under-report capabilities | Compared `catalog.capabilities` against `components.hasMcpConfig` and descriptions |
| Every proposed id is valid | Programmatic check of all 10 rails + hero against the catalog: `PROBLEMS: none` |
