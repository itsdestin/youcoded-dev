---
status: active
---

# Zero-Config Web Search Backend for the Native WebSearch Tool

**Date:** 2026-07-15
**Status:** Research report — feeds the Phase 2 spec (`2026-07-15-phase2-native-harness-design.md` §3.2, settled decision 6).
**Question:** what should power the native harness's `WebSearch` tool for a non-technical user with zero configuration and zero API keys?

## Decision (adopted in the Phase 2 spec)

**Default = Exa keyless hosted endpoint → DDG HTML-scrape fallback → "add a key" prompt.** Keyed upgrades: Tavily (1,000/mo free), Exa key (lifts limits on the same endpoint/code path). Brave intentionally omitted from v1. Chain order ships as data, trivially patchable.

## Comparison (July 2026)

| Option | Zero-config? | Reliability | ToS/legal risk | Notes |
|---|---|---|---|---|
| **Exa hosted MCP endpoint** (`mcp.exa.ai`) | **Yes — officially documented keyless** | High (sanctioned service, JSON, LLM-ready) | Near zero | What opencode ships as its built-in websearch. Per-IP limits (exact numbers undocumented) suit per-user desktop distribution. Also exposes a fetch tool |
| **DDG HTML/lite scrape** | Yes | Degrading but functional; `202 Ratelimit` waves broke Open WebUI/crewAI/LangChain Apr–May 2025; fine at per-user residential-IP volumes | Gray — no official API; DDG historically tolerates low-rate scraping | Good *fallback*, wrong front door |
| **ddgs-style multi-engine rotation** | Yes | Best of the scraping options | Gray × N engines | What Open WebUI moved to after DDG breakage; an arms race we don't want as default |
| **SearXNG public instances** | Technically | Poor — JSON API 403'd on most instances *by operator choice*; volunteer-funded | Ethically bad as a shipped default | Power-user custom-URL option only |
| **Brave Search API** | **No — free tier killed Feb 2026** (card required, $5/mo credits, mandatory attribution) | High when paid | Clean | Cautionary tale for free-tier dependence |
| **Tavily** | No (key; 1,000 credits/mo free) | High | Clean | Best keyed upgrade for LLM-formatted results |
| **Exa keyed** | No (key; 1,000/mo free) | High | Clean | Lifts limits on the SAME endpoint — no code path change |
| **Serper / SerpAPI** | No | High | Clean | Trial-sized free tiers; not defaults |
| **Ollama Web Search** | No (account + key) | High | Clean | Signal: Ollama built a first-party proxied service rather than scrape |
| **Bing Web Search API** | **Dead** (retired 2025-08-11) | — | — | Replacement is an Azure agent product, 40–483% pricier |
| Mojeek / Startpage / Marginalia | No viable free API | — | — | Not defaults |

## What comparable apps ship (the strongest signal)

- **opencode:** built-in websearch = **Exa hosted MCP, keyless** — the direct precedent for a shipped consumer default.
- **Open WebUI:** no-key path = `ddgs` multi-engine scraping (migrated off DDG-only after the 2025 breakage).
- **LibreChat:** no zero-config default; admin-supplied Serper/SearXNG/Tavily keys.
- **Jan:** pre-configured Exa MCP, but user must add a key. **LM Studio:** no built-in search (MCP add-ons). **Ollama:** first-party API, account required.
- Pattern: nobody ships public SearXNG as default; nobody ships keyed APIs as the default; the two viable zero-config patterns in the wild are Exa keyless and client-side scraping.

## Design cautions (baked into the spec)

1. **Provider-continuity risk > ToS risk.** Brave's free tier vanished with minimal notice; Bing vanished entirely. The Exa keyless endpoint could be gated someday → the chain is data-driven and patchable (curated-models remote-update pattern is the reference).
2. **DDG fallback degrades honestly:** `202 Ratelimit` is detectable — surface a real error per `docs/error-message-standards.md`, never retry-hammer.
3. **Never ship a public SearXNG instance as default** — most 403 JSON deliberately; hammering donation-funded instances earns justified hostility.
4. Legal posture for a distributed OSS app: hiQ v. LinkedIn — scraping public data likely isn't CFAA violation, but breach-of-contract claims survive; a documented free endpoint (Exa) is categorically safer than scraping.

## Key citations

- Exa keyless MCP docs: https://exa.ai/docs/reference/exa-mcp ; rate-limit behavior: https://github.com/can1357/oh-my-pi/issues/151
- opencode websearch = Exa hosted MCP: https://opencode.ai/docs/tools/
- Brave free tier removed (Feb 2026): https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/ ; https://api-dashboard.search.brave.com/documentation/pricing
- Bing Search API retirement (2025-08-11): https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- DDG breakage waves: https://github.com/open-webui/open-webui/discussions/13292 ; https://github.com/open-webui/open-webui/discussions/6624
- ddgs metasearch: https://pypi.org/project/ddgs/
- SearXNG JSON 403 by design: https://github.com/searxng/searxng/discussions/1789 ; limiter: https://docs.searxng.org/admin/searx.limiter.html
- Ollama Web Search: https://ollama.com/blog/web-search
- LibreChat config: https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/web_search
- Jan MCP: https://www.jan.ai/docs/desktop/mcp
- Free-tier limits roundup: https://www.buildmvpfast.com/api-costs/ai-search
- hiQ v. LinkedIn: https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn

**Confidence notes:** Exa's exact keyless limits are undocumented (verified only as free/IP-based); Ollama's "~100/day" figure is secondary reporting; Brave's treatment of grandfathered free accounts is disputed between sources.
