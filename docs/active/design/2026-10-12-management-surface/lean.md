# Lean and YouCoded

## 1. The post
Closest match: an X post by Boris Cherny (Claude Code's creator), Sept 22, 2026: https://x.com/bcherny/status/2102543349102338309 (I could not open X myself; the quotes come from a write-up: https://www.iqsource.ai/en/blog/boris-cherny-lean-formal-verification-agent-sdk/).
- "I used Opus 5.5 to formally verify the Claude Agent SDK using Lean."
- "A couple short prompts = 16 PRs fixing various bugs and race conditions."
- "I don't know either language well, but Claude is excellent at both." He also mentions TLA+ and says he sometimes combines the two for data flow, concurrency and state.
Important corrections to what you heard: it was the Agent SDK (a library), not "the whole app"; it was a short social post, not an Anthropic engineering article (I found none); and the details (the models, the 16 PRs, the video) were not independently checked. A commenter in the thread pointed out a proof covers the model, not the code, and Claude wrote both.
Related: proof-skills, a third-party Claude Code add-on (v0.1.1, 0 stars) that does this for TLA+/Lean: https://github.com/opum-ai/proof-skills. It claims 98% vs 54% bug-finding on its own five planted-bug tests, at about 2x the cost, and links model to code only by a hand-kept mapping file.

## 2. Lean in plain words
- Lean is a programming language whose compiler checks mathematical proofs. A "proof assistant" refuses to accept a claim ("this can never happen") unless every step is justified.
- Testing checks the cases you tried. Proving covers every possible case, for the thing you described.
- The catch: Lean proves facts about a Lean copy (a "model") of your logic, not your TypeScript. You rewrite the rule in Lean, prove it, then must keep the two in step. If the copy is wrong or drifts, the proof is worthless. There is no mainstream tool that turns TypeScript into Lean or proves TypeScript directly (I found none; proof-skills works by AI-written models plus a mapping file and tests).
- Can prove: pure rules. "Merging two copies of a file never loses an edit", "a session can never be in two states", "a permission check never allows X".
- Cannot prove: anything involving screens, the look of themes, Electron/Android behavior, network, Claude's replies, or "does it feel right".
- Cost: a second version of the logic, someone to read the spec (you can't; the AI would), and upkeep every time the logic changes.

## 3. Cheaper cousins, and what each catches in YouCoded
- Property-based testing (fast-check): the test tool invents thousands of random inputs and checks a rule always holds. Catches: sync/merge, parsing, path handling, and message-ordering bugs. Works directly on your TypeScript, plugs into vitest. Best value.
- Model checking (TLA+ / Alloy): a small sketch of a process, then a tool tries every order of events. Catches race conditions: two windows writing at once, session switch while a message arrives, desktop vs Android reconnects. This is what Cherny's "race conditions" are really about.
- Type-level guarantees: make illegal states impossible to write (e.g. a session is "starting | running | ended", never a mix). Catches impossible-state bugs at build time. Free, you already run tsc.
- AI-written invariants plus tests: ask the agent to list "things that must always be true" for a subsystem and turn each into a test or assertion (or an ast-grep rule). Cheap, catches regressions.

## 4. Verdict
Mostly no for Lean itself. YouCoded is mainly screens, themes, process plumbing and two platforms, which Lean cannot touch, and the model-vs-code gap is the very thing an AI-built, unread codebase can't police. The valuable idea underneath is "check every ordering and every input of the risky logic, not just the cases we thought of". Get that cheaper: first step is pick one risky area (session/state switching, or sync between desktop and Android), have the agent write fast-check property tests (fast-check) and, if races are the worry, one small TLA+ model, and see what bugs surface. If that finds real bugs, Lean for a single tiny core is a later option. Don't commit to Lean up front. Caveat: the evidence is one social post plus a young third-party tool, so treat the hype with caution.
