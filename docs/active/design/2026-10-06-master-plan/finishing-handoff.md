# Master-plan mockup finishing handoff

Scope: UI-only workbench fixtures; all previous work preserved. No commit, push, backend, actual permission, publication, file access or GitHub writes. The real PageHost, opaque sandbox and Page style kit/theme tokens are unchanged.

## Candidate and pictures

- Candidate spec: `master-plan.review.json`; generated HTML: `master-plan.review.html`. **Not served.**
- Earlier overview: `runs/final/pages/page/page-master-plan/{meadow-mist,halftone-dimension}.png`.
- Finished photos: `runs/finished/pages/page/page-master-plan/…` and sibling `page-master-plan#{vision,edit,history,public,access,exceptions}/…`, each in both themes; manifest reports **14/14**.
- Finished overview and full Halftone subview contact sheet were visually inspected. History, public comparison and revocation were also visually inspected after real keyboard actions.
- Deck preview was generated successfully at `preview/contact.png`. **Parent must visually inspect it before serving:** this specialist's provider refused to attach that image after its eight-image turn budget was exhausted. Do not count that deck contact as reviewed.

Numbered changes: 1 scan-friendly work list + attention rail; 2 editable structured item fields; 3 dated/reporter/source history; 4 exact public before/proposed comparison + confirmation; 5 scoped folder/revoke/host + separate network reads; 6 exception states; 7 vision separate from scheduled work. Fictional records and inert actions are disclosed in deck Risk cards, not in the Page.

## Restart

From `/home/destin/youcoded-dev/worktrees/sessions/master-plan-20261006`:

```sh
YOUCODED_PORT_OFFSET=62 bash scripts/run-workbench.sh /home/destin/youcoded-dev/worktrees/sessions/master-plan-20261006/youcoded
```

Workbench is serving at `http://127.0.0.1:5235/?mode=workbench` (5173 + 62, not 5295). The takeover launch exited with `Port 5235 is already in use`: the preserved prior server is PID 3268784, confirmed by `ss`, `/proc/3268784/cwd` (this component's desktop directory), `ps` (Vite --port 5235), and HTTP 200. No process was stopped or modified. Restart only if that server has stopped. The launcher has no label/profile arguments. Leave it for the tester/parent; explore's isolated browser is separate.

## Working sanctioned tester recipe — tested, not guessed

The numbered explorer omits controls in the opaque Page frame. **Keyboard input still reaches it.** Never add `allow-same-origin` or change production sandbox permissions.

```sh
node scripts/shoot/explore.mjs start --screen pages/page/page-master-plan
node scripts/shoot/explore.mjs click 37  # Manage pages in this default view; use its current number if changed
node scripts/shoot/explore.mjs key Escape
node scripts/shoot/explore.mjs key Tab   # enters Page, focuses Edit vision
node scripts/shoot/explore.mjs key Enter # Edit vision fields
node scripts/shoot/explore.mjs key Tab
node scripts/shoot/explore.mjs key Enter # Active work
node scripts/shoot/explore.mjs key Tab
node scripts/shoot/explore.mjs key Tab
node scripts/shoot/explore.mjs key Enter # Sources & history
node scripts/shoot/explore.mjs key Tab
node scripts/shoot/explore.mjs key Enter # Public changes
node scripts/shoot/explore.mjs key Tab
node scripts/shoot/explore.mjs key Enter # Folder access
node scripts/shoot/explore.mjs key Tab
node scripts/shoot/explore.mjs key Enter # Revoke access
```

Read each screenshot: explorer reports outer focus as `iframe "YouCoded plan"`, not the inner control, but visible focus rings and changed content show the actual target. Verified images: `scratch/explore/20261006-105059/{04,06,09,11,15}-key.png` (vision editor, active work, history, public comparison, revoked access). Original independent tester coverage remains blocked, **not retroactively passed**. U1 is triaged accepted. Rerun independent UX with this recipe; touch, stress/empty and full task coverage are not claimed.

Sanctioned probe also verified the host at nonzero latency. Enter Pages then select `[data-rail-page="page-master-plan"]` inside `document.querySelector('iframe').contentDocument`; the nested `iframe[title="YouCoded plan"]` has sandbox `allow-scripts allow-popups allow-forms` and `contentDocument === null`. Probe screenshot: `/tmp/master-plan-probe.png`. Do not query the outer toolbar or Chat DOM and mistake it for the Page.

## Verification

- `cd youcoded/desktop && npx vitest run tests/master-plan-page-fixture.test.ts tests/shoot-screens.test.ts`: `Test Files 2 passed (2); Tests 9 passed (9)`.
- Title-save implementation mutation, `npx vitest run tests/master-plan-page-fixture.test.ts -t 'edits structured fields locally'`: exit 1, `expected 'Ignored' to be 'Folder access'`; restored immediately. `/tmp/master-plan-mutation.log`.
- `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/master-plan-20261006/youcoded`: exit 0, all nine checks PASS, `OK — all checks passed.` `/tmp/master-plan-final-verify.log`. Android/Worker not covered (fixture-only scope).
- `node scripts/shoot/shoot.mjs 'pages/page/page-master-plan*' --out docs/active/design/2026-10-06-master-plan/runs/finished`: exit 0, `14/14 pictures`. `/tmp/master-plan-shoot.log`.
- `python3 scripts/ui-review/review-cards.py preview docs/active/design/2026-10-06-master-plan/master-plan.review.json`: exit 0, generated contact. No serve.
- `git -C youcoded diff --check`: exit 0. Own diff read back; only fixture/screens/test code is changed.

One intermediate verify failed because importing jsdom directly lacked type declarations; fixed by using Vitest's jsdom environment, with no dependency changes. Final verify is green.
