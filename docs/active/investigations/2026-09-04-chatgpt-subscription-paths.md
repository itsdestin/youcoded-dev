---
status: active
date: 2026-09-04
tags: [chatgpt, openai, codex, providers, native-runtime, subscription]
roadmap: docs/roadmap/native-harness.md ("Third-party agent CLIs as session providers")
supersedes_in_part: docs/active/specs/2026-08-31-codex-session-provider-design.md §1 (the "three approaches that must not be re-proposed" table — one of the three is now the recommended path)
---

# Bringing a ChatGPT subscription into YouCoded — the paths, compared

Destin wants a user who pays for ChatGPT (Plus, Pro, Team) to use that plan inside
YouCoded. Four days ago the only worked-out path was "run OpenAI's Codex agent as a
second engine" (the 2026-08-31 spec). This note re-checks the ground under that spec,
because OpenAI changed its public position since it was written, and compares every
route on what the user gets, what it costs to build, and what can break.

Everything below was verified on 2026-09-04 against OpenAI's public source and the
tools that already ship this; sources are listed at the end.

---

## 1. What changed since the Codex spec (2026-08-31)

| The spec said | True today |
|---|---|
| Talking to OpenAI directly with the user's ChatGPT sign-in is "the shape Anthropic banned outright" and must not be re-proposed | OpenAI's Codex lead (Tibo Sottiaux) and Sam Altman publicly welcomed ChatGPT subscriptions inside third-party tools (July 2026). OpenAI's own "Codex for Open Source" page names OpenCode, Cline, pi and OpenClaw as tools people should feel free to use. Pi and OpenCode alone are ~10% of Codex traffic. Still **not in the terms of use either way** — tolerated and encouraged, not contractual. |
| Usage limits are invisible to us | The Codex app-server has `account/rateLimits/read` (5-hour and weekly windows). The direct endpoint returns a specific `usage_limit_reached` code on 429. |
| Not signed in → hand the user to `codex login` in a terminal | The app-server has `account/login/start` with a `chatgpt` mode that returns a URL for us to open, a device-code mode, and an (experimental) mode that accepts tokens we obtained ourselves. |
| The Codex SDK has no way to answer an approval | Still true (re-checked `sdk/typescript/src/thread.ts`: `approvalPolicy` and `sandboxMode` pass through, no callback). |
| app-server is OpenAI's official embedding interface | Still true, and OpenAI relabelled it (plus `codex exec` and the SDK) as the "Codex Harness" under Apache-2.0 on 2026-08-20. Its docs still say "experimental… not supported for production workloads". |

The spec's own rule — *wrap another vendor's agent only when that is the sole path to
capacity the user already paid for* — now points the other way: there is a direct path.

---

## 2. How the direct path works (the mechanism every named tool uses)

Read from pi's source (`packages/ai/src/auth/oauth/openai-codex.ts`,
`packages/ai/src/api/openai-codex-responses.ts`), which is what OpenAI counted as 10% of
Codex traffic:

- **Sign-in** is a normal browser OAuth flow against `auth.openai.com` (PKCE, scope
  `openid profile email offline_access`, callback on `http://localhost:1455/auth/callback`),
  using the Codex CLI's public client id. There is also a device-code variant for
  machines without a browser. Tokens refresh; the ChatGPT account id is read out of the
  token itself.
- **Requests** go to `https://chatgpt.com/backend-api/codex/responses` — the same
  Responses API shape as `api.openai.com`, with three extra headers
  (`chatgpt-account-id`, `originator`, `OpenAI-Beta: responses=experimental`) and three
  forced body fields (`store: false`, `stream: true`, a non-empty `instructions`). pi sets
  `originator: pi`, i.e. it identifies itself honestly rather than pretending to be the
  Codex CLI. Reasoning comes back encrypted (`include: ["reasoning.encrypted_content"]`)
  and prompt caching works via `prompt_cache_key`.
- **Models** are whatever the signed-in plan exposes — the GPT-5.5 / GPT-5.6 family and
  the codex variants; the list differs by plan and is discoverable per account.
- **Our stack already speaks this.** `@ai-sdk/openai@4.0.51` (in `desktop/node_modules`)
  has a Responses path with `store`, `promptCacheKey` and
  `include: reasoning.encrypted_content` as first-class options, and accepts a custom
  `baseURL` and `headers`. The native runtime's provider registry
  (`desktop/src/main/providers/provider-registry.ts`) builds every provider with one
  `create…()` call per `ProviderType`; this is one more case.

---

## 3. The paths

### A. Sign in with ChatGPT inside YouCoded's own assistant  ← recommended

Add a `chatgpt` provider type to the native runtime. Settings → Providers gets a
"ChatGPT" row with a **Sign in** button instead of an API-key box. After the browser
round-trip, the plan's models appear in the model picker like any other provider, and
every native session can be bound to one.

**What the user gets:** every feature the native assistant already has — the 16 tools,
permission cards, remembered rules, skills, MCP connections, the file panel, resume,
Chat Search, session naming, the cost/usage chip — with GPT models on the plan they
already pay for. Nothing to install. Android gets it the day the Android native runtime
(M8) exists, because that runtime is planned as a plain OpenAI-compatible client.

**What it costs:** roughly one to two weeks. An OAuth module (browser + device-code,
token storage in the existing secrets store, refresh, sign-out), one provider case, a
model-list call, a usage read for the chip, the two error states (signed out, limit
reached with the reset time), and the Settings row.

**What can break:**
- *Policy.* Not contractual. OpenAI could turn this off for third parties the way
  Anthropic did in April. Mitigation: the provider is one case behind one flag; if it
  dies, the row shows a specific message and the rest of the app is untouched. The same
  exposure a dozen named tools carry today, and OpenAI has said the opposite of "stop".
- *Shared quota.* Usage counts against the same 5-hour and weekly Codex windows as the
  Codex CLI/app. On Plus that is tens of messages per five hours for the top model.
  The chip must show the window, not hide it.
- *Endpoint quirks.* `store: false` means OpenAI keeps nothing — fine, we already keep
  the whole transcript ourselves. Reasoning is encrypted and must be passed back
  verbatim on multi-turn (the AI SDK does this).
- *Team/Enterprise admins* can disable Codex for a workspace; then sign-in succeeds but
  requests fail. Needs the specific error, not a guess.

### B. Run OpenAI's Codex agent as a second engine (the 2026-08-31 spec, updated)

Spawn `codex app-server`, drive it over JSON-RPC, render its events in our chat view,
bridge its approvals to our permission cards, export our skills and MCP entries into
`~/.codex`.

**What the user gets:** OpenAI's agent loop, sandboxing and compaction, on the plan they
pay for; a coding-agent-shaped session in a document-and-research-shaped app.
Desktop only (Android boots on Claude Code's layout and has no app-server).

**What it costs:** the spec's own estimate is about four weeks across five phases, plus
a permanent second-runtime maintenance line, and 64 two-way provider branches becoming
three-way. Two things got cheaper since the spec: sign-in and usage limits are now
protocol calls, so the "not installed / not signed in / limit reached" screens shrink.

**What can break:** everything in the spec's §7 still holds — the user's own
`~/.codex/config.toml` can silently disable our permission cards, skills paths have
moved once already, hooks and sub-agents from the marketplace don't carry, the
interface is labelled experimental. Policy exposure is *lower* than A (we drive
OpenAI's program with OpenAI's interface) but the sign-in token is the same one.

**When B is still worth it:** if Destin specifically wants Codex's *agent* (its
sandbox, its compaction, its plugins, its cloud tasks) rather than OpenAI's *models*.
That is a different feature — "Codex inside YouCoded" — not "use my ChatGPT plan".

### C. A generic agent seam (ACP) with Zed's `codex-acp` adapter

Implement the Agent Client Protocol once; get Codex, Gemini CLI, Claude Agent and Cursor
through one door. Same bridging work as B behind a lowest-common-denominator protocol
and a third party's adapter (versioned separately from Codex), so lower fidelity than B
and one more moving part. Right answer only if "many third-party agents" becomes a goal;
the platform vision says the opposite (one first-party harness, every model).

### D. Rejected without change

- **Codex SDK** — still cannot ask the user anything (re-verified).
- **Terminal wrap of the Codex CLI** — no hooks, private log format; the spec's reasons
  stand.
- **OpenAI API key / OpenRouter** — already works today, but bills per token, which is
  the thing a subscriber is trying not to pay twice for.

---

## 4. Side by side

| | A. Sign in with ChatGPT | B. Codex engine | C. ACP |
|---|---|---|---|
| Uses the plan already paid for | yes | yes | yes |
| Works with our tools, permissions, skills, MCP, resume, search | all, unchanged | after ~2 weeks of bridging; hooks and sub-agents never | less than B |
| Android | when M8 lands | no | no |
| Build size | ~1–2 weeks | ~4 weeks | ~4 weeks |
| Ongoing cost | one provider case | a second agent runtime | a second runtime plus an adapter |
| Fits "one harness, every model" | yes | no (kept as a what-if) | no |
| Policy footing | tolerated, publicly encouraged, not contractual | same token; official interface | same as B |
| Session shape for a student writing a paper | our assistant with a GPT model | a coding agent | a coding agent |

---

## 5. Recommendation

**Build A.** It is the smaller job, it delivers the plan's models into every feature the
app already has, it is the only path that ever reaches Android, and it is exactly the
direction the platform vision already set for every other vendor. Keep the Codex spec
parked as "Codex-the-agent inside YouCoded", a separate feature to pick up only if the
agent itself becomes the point.

Two things to settle before designing the UI:

1. **Accept the policy footing.** OpenAI has said yes out loud and no on paper. Ship
   behind a flag, identify ourselves honestly in `originator`, and treat a cut-off as
   a known risk with a specific error, not a surprise.
2. **Naming.** "ChatGPT" is right here in a way it was wrong for the Codex spec: the
   user is signing in with their ChatGPT account to use ChatGPT's models. What they get
   is YouCoded's assistant on those models, and the Settings copy should say so.

Later, not now: once A exists, the same sign-in could feed B (`account/login/start` has
a mode that accepts our tokens, marked experimental), so A does not close the door on B.

---

## Sources (read 2026-09-04)

- OpenAI's public position: manifest.build, "ChatGPT Plus: $200 of tokens for $20 while it lasts" (2026-07-01) — quotes Tibo Sottiaux and Sam Altman; names OpenCode, pi, Cline, OpenClaw, OpenHands, KiloCode, Crush, Aider, Droid, Hermes.
- openai/codex discussion #8338 — OpenAI staff declined to answer the third-party-client question directly (Dec 2025 – Feb 2026).
- pi source: `badlogic/pi-mono` `packages/ai/src/auth/oauth/openai-codex.ts` (OAuth constants) and `packages/ai/src/api/openai-codex-responses.ts` (endpoint, headers, forced fields, 429 codes).
- Codex app-server protocol: `openai/codex` `codex-rs/app-server-protocol/src/protocol/v2/account.rs` (`account/login/start` modes, `account/rateLimits/read`), `item.rs` (`item/commandExecution/requestApproval`); docs at learn.chatgpt.com/docs/app-server ("experimental… not supported for production workloads").
- Codex SDK: `openai/codex` `sdk/typescript/src/threadOptions.ts`, `thread.ts` — `approvalPolicy: never | on-request | on-failure | untrusted`, `sandboxMode`, no approval callback.
- Codex Harness open-sourcing (2026-08-20, Apache-2.0): opensourceforu.com; OpenClaw's `codex-harness` plugin docs (spawns app-server; ChatGPT OAuth; falls through to an API key when the plan's window is exhausted).
- codex-acp: `agentclientprotocol/codex-acp` (ACP server over app-server; ChatGPT, API-key and gateway auth).
- Cline, "Bring your ChatGPT subscription to Cline" (2026-01-22); OpenClaw provider docs (GPT-5.6 sol/terra/luna, 5.5, codex-spark by plan; profile blocked until Codex's advertised reset time).
- In-repo: `desktop/src/shared/provider-types.ts` (`ProviderType`), `desktop/src/main/providers/provider-registry.ts` (per-type `create…()` cases), `desktop/node_modules/@ai-sdk/openai@4.0.51/dist/index.js` (`store`, `promptCacheKey`, `reasoning.encrypted_content`).
