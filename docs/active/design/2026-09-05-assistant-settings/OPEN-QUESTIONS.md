---
status: active
date: 2026-09-07
feature: Assistant settings
---

# Assistant settings — questions no deck has asked

The contract agent and both design reviews found these. None blocks the build; each is a
decision only Destin can make, and each would otherwise be settled by whoever writes the
code, silently. They go on a deck when he wants them, not before.

1. **In-between window widths.** The panel has been reviewed wide (1440) and at phone width
   (390). Nothing has ever asked what it should do between roughly 640 and 900, where the
   page list and the page both want the room. Flagged as a risk on review round 1, step P-2,
   and never turned into a question.

2. **Does the red attention dot clear itself?** It appears when a provider is genuinely
   broken. Nothing says whether fixing the provider clears it immediately, on the next
   drawer open, or only after a restart.

3. **Where should "My Account" go for each provider?** Today: Claude's usage page, the
   ChatGPT account settings, the OpenRouter credits page. Approved as a picture; the three
   destinations were never named to him in words.

4. **Existing Always-allowed entries.** The reset decision (R2-5) covered the old protection
   overrides. It said nothing about the entries already in the Always-allowed list, which
   are a different mechanism and are untouched by this work.

5. **The ChatGPT branch as a shipping prerequisite.** The Cloud providers page is built on
   top of the ChatGPT sign-in work. That was recorded as a risk on review round 1, step P-5,
   but he was never asked to accept it as an ordering constraint.

**Plus one raised by design review 2, which is a design question rather than a bug:** over
remote access the model picker offers models the browser cannot run. The build makes such a
default fall back to Claude rather than break, but narrowing what the picker OFFERS would
change a surface he already approved, so it is his call. Filed in
`docs/roadmap/remote-access.md` as well, so it survives this document.
