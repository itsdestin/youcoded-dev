# close-out.sh safety fix (patch only, not applied)

Source: workspace branch `origin/session/release-1-3-2`, commits 72805a830 ("verify release backups by current commit ancestry") and b342f7e88, covering `scripts/close-out.sh` and `scripts/ui-review/tests/close-out-wrong-repo.test.sh`. The patch file beside this README is the combined diff of those two commits.

What it fixes:
- The backup check judged "is this branch backed up?" by name (`ls-remote --heads`), so an older branch of the same name on the remote made unpushed work look safe. The fix checks that the LOCAL tip is contained in a remote branch (ancestry, `for-each-ref --contains`).
- A failed `git fetch` was ignored, so stale remote data could report "backed up". The fix fails instead.

Must be re-applied by hand: `scripts/close-out.sh` has since diverged on master (about 275 lines), so `git apply` will not work cleanly. Use the patch as the specification and bring its test along.
