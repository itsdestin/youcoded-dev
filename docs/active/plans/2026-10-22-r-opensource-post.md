---
status: parked
created: 2026-10-22
source: Destin's own draft (2026-10-22), typo-cleaned only; the earlier transcript-assembled version is superseded
---

# r/opensource post

Flair: **Promotional**. Text post.

## Title

Destin's: **it's time we embrace AI's potential to open source everything (youcoded.ai, MIT)**

Alternative in his own words, if he wants the story to lead instead of the argument:
**i never learned to code. in 8 months AI let me drop microsoft, apple and google, ship swipe typing for KDE Plasma, and build an open-source everything app (youcoded.ai, MIT)**

## Body (Destin's draft, typos fixed, one cut-off sentence completed)

i've always been technologically inclined: i built my first PC when i was 16, one of my first jobs was at Best Buy, and i've always tried my damndest to keep up with the cutting edge of hardware/software innovation. i've also ALWAYS truly despised closed-source software, especially when it's intentionally used to monopolize people and their data (i'm looking at Apple and Microsoft here, specifically).

unfortunately, i went to school for politics and economics and have never had the technical knowledge or expertise i'd need to directly do anything about my pro-tech, anti-monopoly worldview (political advocacy only goes so far). i never learned to code, i was never particularly great at navigating a terminal, and i sure as hell couldn't even begin to do something like build my own app or contribute to the Linux kernel or a major project like KDE.

*that has all changed.* i absolutely understand the frustration and hatred many people feel toward AI and its risks, but i also think there's a truly fantastical potential for this technology to revolutionize the open source community and bring a complete end to the "own nothing, be happy" economy. in the past 8 months, i have 1) COMPLETELY FUCKING ELIMINATED microsoft, apple, and google from my day-to-day life, 2) made significant contributions to the open source community (swipe typing, current-word completion, next-word prediction, etc for KDE Plasma Keyboard), 3) developed an entire open-source AI assistant and everything app from the ground up ( https://youcoded.ai ), 4) otherwise just completely changed the way i interact with computers. the pace of this has only been possible due to advanced LLMs.

what i need you all to understand is that "open source" no longer has to be niche, and contributions no longer have to be limited to experienced developers. open source now has the potential to be, and SHOULD be, about *passion*, and can be improved together, by all of us, more quickly than any corporation could ever possibly hope to keep up. i mentioned my keyboard plugin earlier: that feature had been requested on github and KDE forums EIGHTEEN MONTHS AGO! i solved it in three days. i want you all to really take a moment and think about what it means for the open source ecosystem when the number of contributors suddenly multiplies 1,000x, and free/volunteer developer hours are no longer our bottleneck. i don't think Microsoft Windows exists in 2028 as a closed-source platform. i don't think the PlayStation 7 will ever make it to the concept phase. we're entering a new era, and seeing that now and adopting agentic coding will help us all make it a reality more quickly.

i feel very strongly about my worldview, and toward that end i have created an application that this post is meant to promote (sorry in advance, but i've really been wanting to share this). https://youcoded.ai is my attempt to make open source accessible to normal people, and my hope is that it will maybe help speed the open source revolution, even if just a little. it's a fully open-sourced (MIT) AI assistant and everything app. it's free, it supports any open/closed cloud AI model (Claude + ChatGPT subscriptions and OpenRouter), it includes a built-in runner to use local LLMs, and it lets you modify the UI and create any dashboard, display any information, and integrate any external service you'd like. my goal is to basically eliminate some of the overhead of github/etc for non-developers so my normie friends can make and share cool open-source shit quickly and easily. that said, i really am more passionate about open source than my own project, and i would encourage you all to explore AI-assisted coding regardless of the app you use. [← paste ended at "the ap"; last four words are a guess, finish it your way]

github: https://github.com/itsdestin/youcoded · keyboard: https://github.com/itsdestin/swipe-keyboard [← added; this sub clicks the repo, not the site]

## Review against the sub (read 2026-10-22)

Edits made: it's/its (twice), "1,000x fold" → "1,000x", a double space, the cut-off sentence, and the two repo links. Nothing else touched; capitals-for-emphasis kept because that is how Destin writes.

Three things in this draft will draw fire, with the evidence:

1. **The title tells the room what to do, and the room is skeptical.** The sub's top AI posts this year are "How Vibe Coding Is Killing Open Source" (399), "Help! how do I deal with vibe coders that try to contribute?" (329) and the mods' "AI-Policy" thread (290). A pro-AI exhortation in the title gets downvoted by that crowd before they read the first paragraph. The story title above says the same thing as a fact about one person, which this sub does upvote ("I got my first open-source PR merged today", 341).
2. **"contributors multiply 1,000x" and "contributions no longer limited to experienced developers."** To a maintainer this is not hope, it is the thing ruining their weekends: the 329-point thread is a maintainer describing "500–2000 lines of hot garbage" PRs from people who can't read what they submitted, and QGIS just put a moratorium on AI contributions (on the month's front page). The rest of the post actually argues something they like better: people building *their own* things (a keyboard that didn't exist, an app that didn't exist) instead of flooding someone else's repo. If that paragraph said "builders" instead of "contributors," the maintainers would be on his side.
3. **Windows 2028 / PlayStation 7.** Already flagged once; Destin put it back, so it stays. Cost to know: predictions are the lines people quote back in the comments, and they will.

Smaller: "contributions to the open source community … for KDE Plasma Keyboard" could be read as merged upstream into KDE. It is a standalone plugin (the post later calls it that). Someone will check KDE's repos; "a swipe typing plugin for KDE Plasma Keyboard" closes that door.

## Posting notes

- **Reply yourself, by hand, for the first two to three hours.** Rule 6 removes posts whose authors don't engage, and the moderators ban anyone who answers with an LLM. They said so in August and they check.
- Comments to expect, with the honest answer: "yet another AI wrapper" (what it replaced, the keyboard); "vibe-coded = security risk" (7,400 commits over 7 months, three releases this month, open issues answered); "needs a Claude subscription" (no: local, OpenRouter, ChatGPT or Claude, README lists all four); "does a human review the code" (you direct and test, you do not read every line; say so).
- The sub's measured stance this week: top comment in the 406-comment AI-apps thread (540 points) was "Open source is about access to the source code and the license. Not how the software was created." What gets punished is hiding the AI, drive-by posting and abandonment.

## Fix before posting (repo, not the post)

- **GitHub shows no license for youcoded.** The LICENSE file is a custom wrapper around MIT, so GitHub reports "NOASSERTION" and the repo page shows no MIT badge. This crowd clicks the license first. Fix: plain MIT `LICENSE`, third-party notice moved to a `NOTICE` or `THIRD_PARTY.md`. Needs a go-ahead; it is a repo change.
- Stars: 11. Not fixable before posting; Show HN and r/LocalLLaMA are scheduled ahead of this one in the launch kit for that reason.
