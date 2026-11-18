---
status: reference
created: 2026-11-18
owner: Destin approves every change; sessions read it before making anything public
---

# YouCoded brand guide

**Read this before you make anything people outside the project will see:** the website, a
video, a poster, an ad, a Reddit or Hacker News post, a store or directory listing, a README,
release notes, a share image or an email. It covers how YouCoded looks and how it talks.

- **Seeing it:** `docs/brand/guide.html` shows the logo, colours, type and do/don't examples
  drawn with these exact values. Open it in a browser or in YouCoded.
- **The app's own screens are not covered here.** Inside the app the theme paints everything;
  those screens follow `docs/active/design/2026-10-13-ui-design-guide.md`. The two meet at the
  first-run setup screens, which use the brand look (design guide → "First-run setup and sign-in").
- **Where the rules came from:** the logo and icon came from the Oct 2026 brand rounds
  (`docs/archive/design/2026-10-01-brand-identity-v2/DECISIONS.md`, every pick tied to a deck answer).
  The colours, headline type and labels come from the Sept 2026 website redesign. The tagline was
  changed on 2026-10-18 and confirmed by Destin on 2026-11-18. The voice comes from Destin's own words
  (`docs/vision/2026-10-22-why-youcoded-voice-notes.md`).
- **Changing it:** anything here that a reader would notice needs Destin's approval. Fix a wrong
  value or path straight away and tell him.

---

## 1. The brand in one breath

YouCoded is a free, open-source AI assistant and "everything app" for Windows, Mac, Linux and
Android, plus any phone browser through your own computer. You ask it in plain words for what you
want: help with files and writing, a page for something in your life, a new feature, a game or a
whole new look. It builds those things inside the app, on whichever AI model you choose, including
free ones running on your own computer. It was built entirely through conversation with AI by
someone who has never written code.

**What it stands for:** software you own, not rent. Anything a big company makes, a community
of passionate people can now make better, without needing to know how to code. "Open source
everything."

**Who it's for:** students, professionals and everyday AI users first. Developers are welcome
(full terminal, Claude Code support), but they are not the audience we write for.

---

## 2. The name

**Lowercase is the default** (Destin, 2026-11-18). Write **youcoded** everywhere the brand is
speaking casually or as itself, and save **YouCoded** for formal, properly grammatical writing.

| Where | Write it | Notes |
|---|---|---|
| **Brand voice** (taglines, short lines, headlines on posters and films, end cards, social posts and bios, captions, merch, the logo) | **youcoded** | Lowercase, one word. Short lines around it go lowercase too (section 3). |
| **Formal writing** (legal text, press releases, store and directory descriptions, documentation, emails to companies, full paragraphs on the website or README) | **YouCoded** | Capital Y and capital C, one word, inside normally capitalised sentences. |
| As the logo | **youcoded** | Set as the logo (section 4). |
| Web address | **youcoded.ai** | **Always all lowercase, everywhere** (Destin, 2026-11-18): never capitals, small caps or an all-caps style, never "www.", never "YouCoded.ai". On its own (end card, poster) set it in Outfit 600; inside a sentence it takes the sentence's font. Never JetBrains Mono. |
| Initials | **yc** | Only as the initials tile (section 4). Never "YC" in text. |

**When unsure:** if the text would look normal on a poster, a sticker or a social post, use
lowercase. If it would look normal in a letter or a legal page, use YouCoded.

**Never:** "Youcoded", "You Coded", "YOUCODED", "YC", or "youcoded" at the start of a formal
sentence (rephrase instead). "The YouCoded app" only when "YouCoded" alone doesn't read well.

**Related names:**
- **WeCoded** is only the name of the GitHub folders behind the marketplace and community themes
  (`wecoded-marketplace`, `wecoded-themes`). In public, say "the YouCoded marketplace" and
  "community themes". "WeCoded" is not trademarked or decided as a brand.
- **YouCoded Pages** (small apps inside YouCoded) is a feature name: capital P when it means the feature.
- The company behind it is **Destin's Adventures, LLC**. Use that only in legal text.

---

## 3. Tagline and key lines

**Short brand lines are all lowercase**, name and words alike (Destin, 2026-11-18): taglines,
slogans, poster and film headlines, end-card lines, bios, captions. Acronyms keep their capitals
("AI"). Full sentences in formal writing use normal capitals.

| Line | Use it for |
|---|---|
| **open source everything** | **The tagline (official, Destin 2026-11-18).** Next to the logo, end cards, profile bios, merch. |
| **your personal AI assistant and open source everything app** | The one-line description in brand places: page titles, profile bios, README subtitle, share text. In formal places (store and directory listings) write "YouCoded is your personal AI assistant and open source everything app." |
| **make your technology useful, fun, yours.** | A brand headline for ads, posters and films. (The website shows it in title case today: see section 13.) |

**Retired, do not use in new work:** "agents for everyone" (the Oct 2026 tagline; still on the
app's first-run setup screen until that screen is updated), "YouCoded Assistant", "Agents for
Everyone", and any "a GUI for Claude Code" framing.

---

## 4. The logo

The logo is **typed, not drawn**: lowercase "youcoded" in Outfit SemiBold, with "you" in the
brand gradient and "coded" in deep plum, usually beside the glass-buddy icon. **There is no
logo image file yet.** Make it with live text (website), the `Wordmark` / `Lockup` parts in the
marketing films' brand kit, or by following the recipe below.

### The recipe

| Part | Value |
|---|---|
| Font | Outfit, weight 600 (SemiBold) |
| Letter spacing | −3.5% (`letter-spacing: -0.035em`) |
| "you" | Gradient at 100°, `#9D5BD0` → `#D25AA0` |
| "coded" | Deep plum `#21152C` |
| On a dark background | "coded" in the light text colour (`#F3EAF9`); "you" keeps the gradient |

<!-- verify: {"path": "youcoded/docs/index.html", "contains": "#9D5BD0"} -->
<!-- verify: {"path": "youcoded/docs/index.html", "contains": "#D25AA0"} -->

### Versions (lockups)

1. **Icon + name, with tagline** (side by side). The main version: website top bar, posters,
   profile banners. The tagline is Outfit 400, lowercase, grey-violet `#8A7B96`, at 0.33× the
   name's size, tucked under the name starting just past the "y".
2. **Icon + name** (side by side). When the tagline would be too small to read, or is said
   elsewhere: website footer, end cards.
3. **Stacked:** name with the tagline under it, no icon, centred. Used on the app's setup screens.
   The tagline is 0.34× the name's size.
4. **Name only.** Small spaces where the icon would crowd it.
5. **"yc" initials tile:** a white glass tile, "yc" in Outfit, only the "y" in the gradient.
   Approved but not used anywhere yet. Use it where even the icon is too detailed.

**Spacing between icon and name:** a quarter of the icon's height. The name sits slightly
raised (3.5% of the icon's height).

### Clear space and minimum sizes

- **Clear space:** leave at least **half the icon's height** empty on every side of the logo.
- **Minimum sizes:** icon 16px · icon + name lockup 96px wide · name alone 64px wide · "yc" 12px.

### In other themes

When a page or film uses another YouCoded theme, the name's colours come from that theme's
mascot (the website does this when you switch themes):

| Theme | "you" gradient | "coded" |
|---|---|---|
| YouCoded (default), Cotton Candy Sky | `#9D5BD0` → `#D25AA0` | `#21152C` |
| Meadow Mist | `#4D90B1` → `#59A5A1` | `#0E3A24` |
| Strawberry Kitty | `#AF4F52` → `#A55964` | `#5A1428` |
| Kuromi Dreamer | `#A658A4` → `#8059A5` | `#2A1748` |
| Golden Sunbreak | `#72A559` → `#A59A59` | theme's own light text (dark theme) |
| Devil's Garden | `#B56049` → `#A56459` | theme's own light text (dark theme) |
| Halftone Dimension | `#C95A86` → `#7A7BC8` | theme's own light text (dark theme) |

<!-- verify: {"path": "youcoded/docs/index.html", "contains": "#4D90B1"} -->

**Outside a theme context (ads, posters, posts), always use the default purple version.**

### Logo don'ts

- Don't set "youcoded" in any other font, or bold it past 600.
- Don't write it in capitals, or capitalise the logo as "YouCoded".
- Don't change the gradient's colours or direction, or apply it to "coded".
- Don't add outlines, glows or 3D effects, and don't squash or stretch it.
- Don't put it on a busy photo without a calm patch behind it.
- Don't replace the "o" or any letter with the mascot (tried in the Oct rounds and rejected).

---

## 5. The icon and the mascot

- **The glass buddy** is the face of the brand: a white frosted-glass tile with the mascot's
  face panel, two dark oval eyes with one sparkle each, and a soft medium smile. It is the app icon.
- **It changes with the theme.** Each marketplace theme has its own version (its wallpaper in
  the face, its eye and rim colours). In marketing, use the **default** icon unless the piece is
  about themes.
- **Other approved versions:** a mid-grey glass icon (not used yet); the installer icon (the face
  rising out of an open box); a one-colour outline face for the Mac menu bar.
- **Mascots:** each theme has an animated mascot. A cameo is welcome in films and posts; the
  brand never *needs* one.
- **Files:** website icons `youcoded/docs/brand/` (copies in `docs/brand/assets/`); the 1024px app icon
  `youcoded/desktop/assets/icon.png`; mascot drawings `youcoded/docs/mascots/`. Every app, installer
  and theme icon is generated by `youcoded/scripts/build-icons.mjs` from
  `youcoded/scripts/icons/brand-icons.html`. Change them there, never by hand.

<!-- verify: {"path": "youcoded/scripts/icons/brand-icons.html"} -->

---

## 6. Colour

Built from the default "YouCoded" theme, which is also the website's default look.

### Light (default)

| Name | Hex | Use |
|---|---|---|
| Lavender (canvas) | `#F7F0FB` | Main background |
| Lilac (panel) | `#EFE3F6` | Cards and panels on the lavender |
| Edge | `#C9B0DB` | Borders and dividers |
| Deep plum (ink) | `#21152C` | Text, and "coded". Use it instead of black. |
| Plum 2 | `#43354E` | Secondary text |
| Grey-violet | `#8A7B96` | Taglines and small notes only (it is too faint for body text) |
| **Brand purple** | `#9750AA` | The one accent: a key word, a button, a link. Chosen by Destin 2026-11-18 (option "C": a third of the way from the logo gradient's purple toward its pink, darkened so text stays readable). Replaces `#8B47B8`. |
| Gradient | `#9D5BD0` → `#D25AA0` | "you" in the logo, and at most one bold moment per piece |

<!-- verify: {"path": "youcoded/desktop/src/renderer/themes/builtin/youcoded.json", "contains": "#F7F0FB"} -->

### Dark (from the "YouCoded Night" theme)

| Name | Hex | Use |
|---|---|---|
| Plum-black (canvas) | `#140B1E` | Dark backgrounds. Use it instead of pure black. |
| Panel | `#1F1329` | Cards on dark |
| Light text | `#F3EAF9` | Text, and "coded" |
| Soft text | `#B3A8BC` | Secondary text |
| Light purple | `#C387D3` | The accent on dark: C's lighter partner (the brand purple is too dark to read there). Replaces `#C99BF0`. |


### Rules

- **Mostly lavender and plum, a little purple.** Roughly: background 70%, text 20%, purple and
  gradient 10% or less. One key word in purple per headline.
- **No pure black (`#000`) and no pure grey.** Every neutral leans plum.
- **One extra colour at most.** A film or campaign may add one supporting colour for its idea,
  but it must sit well beside the purple, and the purple must still read as the brand. On dark,
  the accent stays purple, not gold, red, coral or orange.
- **Readability (measured):** plum on lavender 15.6:1 ✓ · brand purple on lavender 4.7:1 ✓ (fine
  for text) · brand purple on a lilac panel 4.2:1, so on panels use it only for big or bold words ·
  white on brand purple 5.2:1 ✓ (buttons) · gradient ends on lavender 3.3–3.9:1, so
  only for large type like the logo · grey-violet on lavender 3.5:1, so taglines only · on dark,
  light purple 7.0:1 ✓, brand purple 3.7:1 ✗.
- **Avoid the generic AI-ad look:** purple-to-blue gradients, glowing orbs, sparkles, floating
  particles, circuit lines.
- **Logos of AI companies** (Claude, OpenAI etc.) keep their own colours wherever they appear.
  That is the app's separate "provider colours" system, not ours.

---

## 7. Type

Three typefaces, all free from Google Fonts (open licence, fine for print, web and video).
**No other typefaces.** The only exception is text that exists inside a scene (a sign, a page
someone is reading), kept small and clearly part of the scene.

| Typeface | Job | Settings |
|---|---|---|
| **Outfit** | The logo, the tagline, website navigation and section text, the app's setup screens | Logo 600, −3.5% spacing · tagline 400 |
| **DM Sans** | Headlines and body text | Big headline 900 (Black), −5% spacing, tight lines (0.97) · section heading 800, −4% · body 400/500, lines 1.6 |
| **JetBrains Mono** | **Only** the short label above a headline ("kicker") and small badges, as on the website | 500, ALL CAPS, +15% spacing, small |

<!-- verify: {"path": "youcoded/docs/index.html", "contains": "family=Outfit"} -->

- **Headlines:** short, one key word in brand purple. On posters, films and ads they are all
  lowercase (section 3); website section headings use sentence case. A full stop at the end is
  fine and is the house style on the website ("Whatever you want it to be.").
- **Kickers:** one to three words, e.g. "WHAT IS THIS?", "FEATURES". Never a sentence.
- **JetBrains Mono stays rare** (Destin, 2026-11-18: fine as the website uses it, disliked anywhere
  else). Never use it for the web address, a list of platforms, captions, buttons, body text or
  anything longer than three words. Those use DM Sans 500 (or Outfit for the web address).
  At most one kicker per screen, poster or frame.

---

## 8. Spacing, alignment and hierarchy

Every layout follows these five rules, so spacing is never a guess. (The app's own screens use the
spacing scale in the UI design guide. This section is for marketing pieces and the website.)

1. **One spacing scale.** Every gap, margin and padding is a step on this scale:
   **0.5 · 1 · 1.5 · 2 · 3 · 4 · 6 · 8 × the base unit.** The base unit is **8px** on the web and
   **the short side ÷ 60** in video and posters (18px on a 1080-wide frame). No gaps between steps.
2. **Group, then space the groups.** Things that belong together sit close together. The gap
   *between* groups is at least **twice** the gap *inside* a group. If every gap is the same, nothing
   reads as a group (that was the fault in the first end card).
3. **Safe margins.** Nothing comes closer to the edge than **8% of the short side**. In vertical
   video, keep text out of the bottom 20% and top 12% too. A line that doesn't fit gets smaller or
   breaks onto two lines. It never touches the edge.
4. **One alignment per piece.** Either everything is centred or everything lines up on one left
   edge. Never mix the two in one frame. A centred block sits slightly above the true middle
   (its centre about 45% from the top).
5. **Three levels at most**, and each one looks clearly different from its neighbours:
   - **Level 1, what to remember:** the logo or the headline. The biggest thing, by far.
   - **Level 2, what to do:** the web address, a button, a call to action. About half to a third the
     size of level 1, in strong ink.
   - **Level 3, fine print:** platforms, small notes. Clearly smaller (about ⅔ of level 2) and
     softer in colour.
   Two lines next to each other never share a style unless they are the same level.

**Worked example: the end card** (9:16, base unit *b* = short side ÷ 60):

| Group | Part | Size | Gap below |
|---|---|---|---|
| Brand (level 1) | Icon | 14*b* tall | 2*b* |
| | Logo "youcoded" | 6*b* text size | **6*b*** (gap between groups) |
| Action (level 2 + 3) | `youcoded.ai`, Outfit 600, lowercase, plum | 2.5*b* | 1*b* |
| | "Free · Windows · Mac · Linux · Android", DM Sans 500, plum 2 | 1.5*b* | — |

Everything centred, the whole block centred slightly above the middle, at least 8% clear at the
sides. `docs/brand/guide.html` shows this next to the old version.
- The app's own text font is Outfit in the default theme (other themes change it). That's
  about the app, not marketing.

---

## 9. Pictures and video

- **The app on screen is the real app.** Every shot of YouCoded is filmed or screenshotted from
  the real interface (the workbench tools in `scripts/ui-review/README.md` → "Recording a loop", or
  `scripts/shoot/`). Never draw, mock up or fake the app's screens. Illustration, type and 3D are
  welcome *around* the app.
- **Themes are a feature:** footage of the app can use whichever theme suits the shot. Everything
  around the footage (titles, end card, frame) uses the brand look.
- **Example content is believable and private:** practice data only, never real accounts, names
  or messages. Ideas that land: a smart-home control page, a money page, a game, a new theme.
- **Video:** made for watching muted. Every on-screen text stays up at least 1.2 s plus 0.25 s per
  word. Vertical 1080×1920 for Reels, TikTok and Shorts; keep text out of the bottom 20% and top 12%.
  Music is composed in code (`scripts/promo/music/`), so there is nothing to license. Mix to about
  −14 LUFS.
- **End card** on every film: the icon, the logo, `youcoded.ai`, and "Free · Windows · Mac · Linux ·
  Android", held at least 2.5 s, on lavender.
- **Posters:** 4:5 (1080×1350) for feeds and 9:16 (1080×1920) for stories, each carrying the
  icon + name lockup.
- **Share image** (what shows when someone posts a link): `youcoded/docs/og-image.png`, made by
  `youcoded/docs/tools/gen-og-image.mjs`. Bump its `?v=` number when it changes.

---

## 10. Voice and tone

### Personality

| We are | We are not |
|---|---|
| **Hopeful:** a real chance to own your technology again | Doom-y, or "AI will replace you" |
| **Plain:** words anyone's parent would understand | Jargon ("agentic", "LLM", "harness", "MCP") |
| **Honest:** say what works today, and what it costs | Hype, invented numbers, "coming soon" dressed up as shipped |
| **A little defiant:** tired of renting software and being locked in | Smug, preachy, or insulting to people who use Apple, Google or Microsoft |
| **Warm and human:** one person built this with AI, and it shows | Corporate ("leverage", "solutions", "empower") |

### How to write

- **Lead with what YouCoded becomes**: pages, features and looks you ask for. Not "a front end
  for Claude Code". The narrow hook gets the click; the bigger idea gets the install.
- **Show, don't list.** One concrete example ("a control panel for your house") beats five
  adjectives.
- **Short sentences. Everyday words.** Say "your own computer", not "local inference". Say
  "files", not "artifacts".
- **Talk to "you".** Use "we" only when it's honestly a community ("anyone can help build it").
- **Respect developers.** Destin's view that coding by hand is fading must never read as a dig at
  people who code. Frame it as "you don't need to code", never as "coders are obsolete".
- **Destin's story** is the strongest material we have: no coding background, dropped Microsoft,
  Apple and Google, built this in months. **Quote his own words** from
  `docs/vision/2026-10-22-why-youcoded-voice-notes.md`; don't paraphrase him into things he didn't say.
  Posts under his own name are in his voice (lowercase, frank, sometimes sweary; the
  `destins-writing-style` skill), which is looser than brand copy.

### Words

| Prefer | Avoid |
|---|---|
| assistant, app, your computer, free, open source | agent framework, harness, LLM, inference, client |
| any AI model, a free model on your own computer | model-agnostic, local-first, BYOK |
| pages, themes, add-ons, the marketplace | plugins and skills (fine for developer readers), artifacts |
| asks before it acts | autonomous, fully automated |

**Banned outright (Destin):** "real app", "real files", "actually reads", "does real work",
"self-improving".
**Banned as AI-ad clichés:** "unleash", "supercharge", "seamless", "revolutionize",
"next-generation", "game-changer", "your AI copilot", "the future of…".

---

## 11. What we can and can't claim

Every claim must be true in the app people can download today. Check it against the app's
source before it goes out; the fact sheet (`youcoded-feature-fact-sheet.md`) is a list of
features, not approved copy, and parts of it date from August 2026.

**Strong and true (lead with these):**
- **It becomes what you ask for:** pages, features and looks, built inside the app.
- **Every device:** Windows, Mac, Linux, Android, and any browser through your own computer.
  Most rival apps have no phone app at all. The Android app runs the assistant on the phone itself.
- **Any AI model:** your Claude or ChatGPT plan, hundreds of models through OpenRouter, or a free
  model running privately on your own computer (no extra software needed).
- **Free and open source** (MIT licence). Cloud AI models are paid to whoever provides them.
- **You stay in control:** it asks before it acts, and every permission can be taken back.

**Never claim:**
- **An iPhone app.** iPhones and iPads use YouCoded in the browser, connected to your own
  computer. Say exactly that.
- **A big community.** Most marketplace add-ons are imported, and most community themes were
  made by the project itself. Don't say "see what people have built" yet.
- **Developer-editor (IDE) features.**

**Check the app before claiming** (the Aug 2026 site spec said never claim these, and some have
shipped since, e.g. background commands in Oct 2026, editing Word, Excel and PowerPoint files):
long-running background tasks; reading PDFs; automations or scheduled tasks; AI models running
inside the Android app itself.

**Numbers:** only ones you can show the source for, dated. On 2026-11-18 the marketplace had 302
live add-ons, 13 of them made for YouCoded (`wecoded-marketplace/README.md`). Never write
"336 community plugins".

**Competitors:** you may name them; no comparison tables, and don't argue against something they
no longer do (ChatGPT and Claude can reach your files now). Compare on what still holds: every
device, any model, your own storage, open source.

**Required wording:** wherever we name Anthropic, OpenAI or OpenRouter at length (website footer,
store listings, README), include: *"YouCoded is an independent, community-built project. Not
affiliated with, endorsed by, or officially supported by Anthropic, OpenAI, or OpenRouter."*
Say "Claude" and "ChatGPT" for the products; never imply a partnership.

<!-- verify: {"path": "youcoded/docs/index.html", "contains": "Not affiliated with, endorsed by"} -->

---

## 12. By channel

| Channel | Notes |
|---|---|
| **Website** youcoded.ai | Source `youcoded/docs/index.html`; rules in `.claude/rules/landing-page.md`. Destin edits copy in place with `scripts/ui-review/site-copy-editor.py`. |
| **Short films and ads** | Brief and brand kit: `scripts/marketing/` (branch `session/marketing-videos` until merged). The first promo film's tools: `scripts/promo/`. |
| **Google Ads** | Plan: `docs/active/plans/2026-10-27-google-ads-beginner-experiment.html` (card #228). Headlines follow section 10; no claim from section 11's "never" list. |
| **Reddit, Hacker News, Product Hunt** | Drafts and order: `docs/active/plans/2026-10-22-discovery-launch-kit.md`. Posts go out under Destin's name and in his voice, only with his go-ahead. |
| **GitHub** | README subtitle is the one-line description (section 3). Repo descriptions name YouCoded and link youcoded.ai. |
| **Directories and stores** (SourceForge, AlternativeTo, winget, later Google Play) | Name: YouCoded. Short description: the one-line description. Icon: the default glass buddy. |
| **In-app announcements** | One short plain sentence (`youcoded-admin` → announce skill). |

---

## 13. Known gaps (as of 2026-11-18)

These are places that don't match this guide yet. Fixing any of them changes something people
can see, so each needs Destin's go-ahead.

- The app's first-run setup screen still shows the retired tagline "agents for everyone".
- The website and the app's default YouCoded themes still use the old purples (`#8B47B8`, and
  `#C99BF0` on dark). Updating them is a visible change; the website's recorded demo clips would
  need re-filming too.
- The website's big headline is in title case ("Make Your Technology Yours."); short brand lines
  are now lowercase.
- The GitHub README's paragraphs write "youcoded" in lowercase; paragraphs are formal writing, so
  they should say "YouCoded". (Its subtitle is a brand line and stays lowercase.)
- The marketplace and themes GitHub pages have bare descriptions and don't link to youcoded.ai;
  Destin's GitHub profile has no bio or link.
- No logo image files (SVG/PNG of the wordmark and lockups) exist for people outside the codebase,
  such as a press kit or a designer.
- The marketing films' brand kit uses `#140B1C` for its dark background; the app's Night theme
  (and this guide) use `#140B1E`. The difference is invisible.
- "YouCoded" is not trademarked yet (`~/system/legal/README.md`).
