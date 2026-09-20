---
status: active
date: 2026-09-20
related: docs/active/specs/2026-09-20-youcoded-pages-phase2-technical-design.md
---

# Phase 2 design review, round 1 — triage

A fresh reviewer attacked the design's own promise ("a page reaches exactly what its approval
lists, and nothing else") with the real code in front of it. 18 findings, triaged below. The
design doc is amended where a finding is accepted; the amendments are the record.

| # | Finding | Verdict |
|---|---|---|
| 1 | `prepareHostedDocument` injects with a regex, so `<!-- <head> -->` puts the CSP inside a comment | **accepted** — emit our own shell, author HTML appended |
| 2 | A page can navigate its own frame away (CSP has no directive; `will-navigate` is main-frame only) | **accepted** — `will-frame-navigate` refusal + `frame-src 'none'` on the app document |
| 3 | Saved keys keyed by service NAME, so a second page can point the same key at its own host | **accepted** — key by `service|address`, offer only on an exact address match |
| 4 | `guardedFetch` spreads headers into every redirect hop, so a 302 walks the credential away | **accepted** — `allowHost` callback consulted before each hop; credentials dropped off-host |
| 5 | The approval is bound to the connection list, never to the page's code; ids are recycled | **accepted in part** — canonical project path in the key, orphan records dropped, `page.html` hash recorded. Whether a code change should RE-ASK is Destin's call, not mine: it is a question on the next deck |
| 6 | `api.openweathermap.org.evil.example` is a legal address and reads as OpenWeather | **accepted** — the real website is named and emphasised, the rest dim |
| 7 | The credential can come back in a body, a header, a final URL or an error string | **accepted** — redacted everywhere before the answer leaves main; key-in-query supported explicitly, and such a URL is never echoed |
| 8 | The page's own bootstrap accepts `postMessage` from anyone (an opened window holds `opener`) | **accepted** — `e.source !== parent` returns; request ids matched against the bootstrap's own map |
| 9 | WebRTC and DNS prefetch are outside `connect-src` | **accepted** — `webrtc 'block'`, `x-dns-prefetch-control: off` |
| 10 | Approvals, keys and freshness in one file written up to 60×/min, with no lock | **accepted** — freshness in memory; approvals through `mutateFileUnderLock`; unknown version refuses |
| 11 | Nothing handles safeStorage being unavailable: Allow silently does nothing | **accepted** — typed failure surfaced as `<ErrorState>`; no approval recorded when the key could not be stored |
| 12 | Freshness records any finished request, so the band can say "now" over week-old numbers | **accepted** — recorded per connection, only on a 2xx |
| 13 | `pages:approve` is a remote channel; "no keys on the phone" was renderer-only | **accepted** — main refuses key material from a remote caller |
| 14 | "Cannot send changes" describes a two-way channel as one-way | **accepted, needs Destin** — the wording is approved copy, so it changes on a deck, not here |
| 15 | The whole-internet bullets omit the home network; DNS rebinding beats the guard | **accepted** — pin the validated address for this path; the fourth bullet is deck wording |
| 16 | `keyHelp` is author text shown at the key box and outside the fingerprint | **reversed on build** — see below |
| 17 | The approval gate reads the list summary, not the loaded document | **accepted** — gate on the loaded page |
| 18 | Absolute-URL requirement, `accept` header combining, popups | **accepted** — stated and handled |

**Finding 16 was accepted and then reversed while building**, which is why the code and this
table disagreed for a day. Hashing the key instructions into the fingerprint means an author
fixing a typo in them pauses every installed copy of that page — a re-ask nobody can act on,
which is exactly how people learn to press Allow without reading. The instructions are also only
ever shown while a key is being entered, which is before any approval exists to lapse. The
narrower fix stands instead: the steps are labelled as the author's words, and the key placement
(header or query parameter) IS in the fingerprint, so moving a key into the URL does re-ask.

Nothing else was rejected. Two items (14, 15's wording) and one question (5's re-ask) go to
Destin on a deck, because they change copy he has already approved.

Confirmed sound, so not re-litigated: the host side of the postMessage bridge (`e.source`
identity, so a previewed HTML artifact cannot impersonate a page); `URL.hostname` handling of
IDN, userinfo, case and IPv6; `net-guard`'s private-address matching; and the CSP's coverage of
fetch, websockets, beacons, form posts, workers, service workers, nested frames, CSS `url()`
and violation reporting.
