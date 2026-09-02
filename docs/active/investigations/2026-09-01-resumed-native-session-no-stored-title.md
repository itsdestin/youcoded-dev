---
date: 2026-09-01
status: active
type: investigation
topic: A resumed native session with no stored title shows "Resuming…" until its next completed turn
---

# Resumed native sessions with no *stored* title stay on `Resuming…`

**Symptom.** Resume a native conversation from the Resume Browser: the row you clicked shows a real name, but the session pill it opens reads `Resuming…` and stays that way until the next completed turn. Only bites someone who resumes purely to re-read a transcript. Residue of youcoded PR #286.

## Mechanism (re-checked against master 2026-09-01)

PR #286 fixed the two structural halves: an already-titled session gets its stored title re-pushed on resume (`youcoded/desktop/src/main/native-resume-title.ts`), and a never-titled one can generate a title (the placeholder no longer fools `hasTitle`).

The remaining gap is the case where the store has **no** title at all — a conversation predating the title feeder, one where all three generation attempts failed (offline provider), or one where `getBinding` returned null. `reapplyStoredTitle` reads only the stored record title and refuses anything that is not a real name, so it finds nothing and no-ops:
<!-- claim: {"path": "youcoded/desktop/src/main/native-resume-title.ts", "contains": "if \\(!isRealSessionName\\(stored\\)\\) return null;"} -->

Meanwhile the Resume Browser row derives its name from the conversation's first user message (`harness/session-store.ts`, overlaid by the store title only when it is real, `session-browser.ts`). So the row reads "help me refactor the auth module" and the pill reads `Resuming…`. It self-heals at the next `turn-complete`.

Same gap exists Claude-Code-side when the topic file has been pruned.

## Fix shape — held on a copy decision

Have the re-apply fall back to the derived (first-message) title. **Held because it is a copy decision, not a mechanical one**: derived titles are raw first-message text, so planting one on the pill makes it look different from a generated title. Destin decides whether that is better or worse than the placeholder before implementation.

## History

Added 2026-08-06. Re-verified 2026-09-01: two commits to `native-resume-title.ts` since (`5f536c82`, `d4db1f80`), neither adds a derived-title fallback.
