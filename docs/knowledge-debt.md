# Knowledge Debt

Running list of documentation/rule drift that's been noticed but not yet fixed. Each entry has concrete fix instructions so they persist across sessions.

**How to use this file:**
- Claude appends entries when it notices drift mid-session (outdated claim, renamed file, etc.)
- `/audit` appends entries for any drift detected but not fixed in-session
- User reviews periodically, applies fixes, removes entries
- Each entry stays until resolved — empty file = no known debt

## Entry format

```markdown
## <Title> (noticed YYYY-MM-DD)
- **Claim**: <what docs/rules say>
- **Actual**: <what code does>
- **Fix**: <concrete steps — file, section, change, verify>
- **Priority**: low / medium / high
```

---

## No outstanding knowledge debt

Last audit: 2026-04-11 (Phase 0 baseline — see `docs/AUDIT.md` for full findings).

*Entries will be added here as drift is discovered. `/audit` is the best tool for bulk detection.*
