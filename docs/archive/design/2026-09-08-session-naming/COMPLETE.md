---
status: shipped
date: 2026-09-09
---

# Session naming — complete

Merged to master 2026-09-09: `youcoded` `9d445011`, workspace `406949c6`.
Design record: `docs/archive/specs/2026-09-08-session-naming-design.md`.

## The two gates that did not run, and why

`close-out.sh` will say a contract is unsigned and an acceptance deck missing.
Both are true, and both were **waived by Destin on 2026-09-09**: *"that's fine
without contract and such, this should be marked complete."*

- **`session-naming.contract.answers.json` shows `submitted: null`.** He
  answered its single step `yes` on 2026-09-09 at 10:00; the served deck timed
  out two hours later before he pressed submit. The answer is real and is in
  the file — the submission stamp is not, and it has deliberately NOT been
  written by hand. A sign-off nobody performed must not be forged into the
  record, however small the gap.
- **No grader ran and no acceptance deck was built.** What stands in their
  place: a fresh code reviewer with none of the implementing context, whose
  twelve findings were all accepted and fixed
  (`docs/archive/reviews/2026-09-09-session-naming-code-review.md`), and
  Destin's own live use of a dev build, which turned up three defects the
  reviewer and the suite both passed — the Save-flicker, the settings jitter,
  and Basic quoting his message back instead of deriving a name.

**Do not re-open this to chase the gates.** The work shipped, the contract's
twelve rows are all implemented, and the decision to stop was his.

## What shipped, and what is still unproven

Off / Basic / AI in Assistant settings; rename from the session switcher's
pencil, its right-click menu and the saved-conversation list; a saved name that
automatic naming can never replace. Verified: `scripts/verify.sh --full` green,
Android 741/741.

**Cross-device sync of the ownership record is NOT verified.** The merge is
unit-tested and the sidecar sits inside the Personal sync space, but "rename on
the laptop, agree on the desktop" needs two real machines and two real builds.
It is the one claim this feature has not earned.
