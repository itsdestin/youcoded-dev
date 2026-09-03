---
date: 2026-09-01
status: active
type: investigation
topic: Git surface — after an amend/rebase while "Show more" pages are open, the next page skips commits
---

# Git review: "Show more" paging goes stale after a history rewrite

**Symptom.** In a file's git review, click "Show more" one or more times, then rewrite history
(amend, rebase) from outside. Until the review is closed and reopened, further "Show more"
clicks can skip commits — the gap is silent. Advisory-grade: bounded, and documented in the
code's WHY comment.

**Mechanism (verified against master 2026-09-01).** `GitReviewView.tsx` keeps the extra pages
in `extraLog` and asks for the next page with `logSkip = log.length`. After a rewrite, entries
in `extraLog` that no longer exist in history still count toward that skip, so the request
over-skips and the commits in the gap are never shown. The page-one dedupe-by-sha (chosen
over clearing `extraLog` on refresh, so a refresh does not collapse the pages) keeps the
overlap case correct but cannot detect a rewrite.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/git/GitReviewView.tsx", "contains": "const skip = log\\.length;"} -->

**Fix direction.** A rewrite-detection guard: when page one's shas no longer prefix the shas
held in `extraLog`, drop `extraLog` and restart paging.

**History.** Filed 2026-08-12 (the other residual from the PR #304 review; the unkeyed drawer
half was fixed the same day in PR #307, `6a97e345`).
