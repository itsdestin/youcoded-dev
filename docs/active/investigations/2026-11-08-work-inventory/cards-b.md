# Cards 111-225 audit (88 cards exist in range; ids 116,120,122,123,126,128,129,132,136-138,140,141,144,165,168,179-181,187,192,200,201 are absent = closed/merged elsewhere or other repo)

Evidence base: docs/shipped.md, docs/wrap-ups.md (2026-11-04..08), `gh pr list --state merged`, origin/master code, worktrees.txt/remote.txt, android-ux-test branch log. Read-only; nothing edited.

Global findings
- Priority: 55 of the 75 non-merged cards in range have NO priority (41 explore, 12 planning, 2 build). Only 20 have P1-P3. All ids 147+ lack it.
- 13 merged cards in range (153,162,163,166,167,169,183,191,193,207,211,215,224) all appear in shipped.md. But their BODIES are stale: 224 says "Done: nothing yet"; 153/191/207/211/215 likewise or "Done: nothing"; 183 Next still says "Destin's merge call" (merged 2026-10-23, youcoded#685); 193 Next still says run the checklist.
- There is NO card for the security program (Oct-30 audit -> youcoded#713/#715/#718, wecoded-marketplace#114/#117/#118, wecoded-themes#41; sec-android, sec-remote-policy, sec-site-ask, sec-plugin-pins, sec-supply-chain, sec-electron-upgrade). wrap-ups literally says "no card". Only leftovers got cards (#216 #217 #219 #221 #223, plus #55 sign-in takeover in the other agent's range, shipped by worker 68f2f39 "bind sign-in to the starting app"; and #161). Audit report: docs/archive/investigations/2026-10-30-security-audit/ (status shipped).
- Android clean rebuild is effectively on master: Kotlin is now only AppWebView/MainActivity/BackendService/QrScanner (no Kotlin settings screen). This kills #133's premise and #112(a).

## Per-card table

| id | title | stage | verdict | evidence | suggested fix |
|---|---|---|---|---|---|
| 112 | Phone and computer parity: four gaps left | planning P2 | stale (partly) | Item (a) "Android joining the shared protocol (A2-A4)" - Android is now a WebView + headless desktop backend on master (app/src/main/kotlin has no UI screens besides WebView). Remaining: file upload, game lobby, laggy buttons, real-phone pass | Re-verify (a) and close it; fold remainder into the phone workstream; add priority already P2 |
| 113 | Remote access: three ideas left as they are | explore P3 | accurate (parked) | Parked ideas by design | Keep or archive; fine |
| 114 | Remote setup: clearer screen and why phone can't connect | planning P2 | stale? | a71a0a92d "phone: tell the person to update the computer when connection refused" is on master; blank-error part likely fixed, four unclear spots on setup screen unknown | Re-verify; likely shrink to remaining setup-screen wording |
| 115 | Build the approved secure phone connection option | planning P2 | accurate | 2026-10-22 note records it is not worth it for speed; remains for "Not secure"/mic. #217 and sec-remote-policy didn't build it | Keep; link #117 (blocked on it) |
| 117 | Phone voice and microphone: three gaps | planning P3 | accurate | Blocked on #115 | Keep |
| 118 | Phone browser: missing theme pictures and blank loads | planning P3 | accurate | no evidence of fix | Keep, merge with #112 remainder |
| 119 | Reach your computer by signing in, without Tailscale | explore P3 | accurate / overlaps untracked mesh-sync-design | mesh-sync-design branch (YouCoded Mesh spec, 8 commits 2026-11-08) matches "mesh" | Link branch; may be subsumed by Mesh |
| 121 | Sync conflicts and Backup & Sync wording | planning P2 | stale-ish | work: session/sync-safety-audit-20260908 (1 unmerged commit on remote, 2 months). "Next: check it still happens." Overlaps untracked sync-rethink-investigation (lost messages, false takeover alarm, no sync visibility) | Re-verify; link sync-rethink branch; consider merging 121/125/127 |
| 124 | Sync security: three gaps | planning P2 | partly stale | (b) GitHub backup removed from computers 2026-10-13 (c2b786bf6). (c) lease device-id unauthenticated: worker/src/sync/room.ts still takes deviceId from message body; sec-worker-hardening (#114) did not obviously cover it - UNVERIFIED. work branch session/google-connections-planning is wrong topic (Google planning) | Verify (c) against #114; drop bad work link; maybe shrink |
| 125 | Same chat on two computers: warnings and takeover | planning P3 | overlap | Same area as 121 and sync-rethink-investigation ("false takeover alarm") | Link/merge into sync workstream |
| 127 | Sync: six leftover cleanups | planning P3 | grab-bag (accurate) | six unrelated rare cases | Fine as parked grab-bag |
| 130 | Themes: display faults, checks and ideas | planning P3 | grab-bag | "three to check + three parked"; "Android ignores theme fonts" may change with Android rebuild; "Next: check it still happens" | Split: verify 3, park 3 |
| 133 | Make one settings screen for desktop and phone | planning P1 | OBSOLETE/done-by-other-work | Android now renders the desktop's own SettingsPanel.tsx (isAndroid branches only); no Kotlin settings. Card still says v1.3.1 blocker, paused 2026-09-18 | Re-verify then close or rewrite to "remove leftover isAndroid forks"; drop P1 |
| 134 | Error messages still guess at causes | planning P1 | accurate | six of seven batches remain per body; no merged PR evidence | Keep; good finish criterion would help |
| 135 | Shared look: hover hints, contrast, mismatched screens | planning P2 | stale work link | work: session/ui-consistency-audit; its worktree is 0 ahead/1196 behind = merged/abandoned (fix batches 1-2 landed: 183c41ae9, 82e27f473, 7d4e59841) | Update progress: which batches landed; remove dead work link |
| 139 | Phone-width and touch polish: three groups | planning P3 | accurate + overlaps | Touch-scroll part merged (#634). Overlaps heavily with #213 (phone polish decks on android-ux-test) and untracked narrow-screen-proposals | Merge into narrow-screen/phone workstream; link branches |
| 142 | Dialogs, help bubbles, window drag: three fixes | planning P3 | accurate | none | Keep |
| 143 | Small missing conveniences and wording fixes | planning P3 | grab-bag | "check it still happens" | Verify/split |
| 145 | Motion, voice, chat images: five parked ideas | explore P3 | stale link | work: followup/right-pane-motion - branch gone from remotes | Remove work link |
| 146 | Reload returns to the wrong chat | planning P3 | needs verify | "check it still happens" | Verify |
| 147 | Management surface: next round | planning (no P) | accurate | Work board shipped (#627). Three follow-ups open; includes "rebuild priority and version tags" - which is exactly the missing-priority problem | Do now; this is the board fix |
| 148 | Native sessions stop before job done | planning (no P) | accurate but UNCOMMITTED WORK | worktrees: session/148-harness-performance-lab has 40 dirty files (workspace) + 27 dirty (youcoded), 0 commits ahead, local-only = not backed up. Blocked on USD 10 spend cap (USD 0.27 left) | Back up the worktrees; needs spend decision from Destin |
| 149 | Design passes for surfaces left out | planning | accurate | none | Keep; overlaps #150, #135 |
| 150 | Design guide: six open questions + tooling | explore | accurate | none | Merge with 149 (same design-guide stream) |
| 151 | Code tidy-ups from July reviews | explore | probably stale | July reviews; "plan it" | Re-verify each of five items or drop |
| 152 | App background follows desktop wallpaper | explore | accurate (idea) | none | Keep |
| 153 | Work items, Work board, pages that see chats | merged | accurate; body stale | shipped.md 2026-10-17 | fix body |
| 154 | Keep unseen deliverables easy to find | explore | accurate | none | Keep |
| 155 | Connect Google and Drive files | planning | accurate (paused) | WIP backed up on session/155-google-files (1 commit pushed); paused pending rclone-vs-OAuth rethink | Keep; paused decision is Destin's |
| 156 | Add Google Calendar | planning | accurate | blocked on #155 | Keep |
| 157 | Add Gmail | explore | accurate | blocked on #155 | Keep |
| 158 | Extend connected accounts to Microsoft/Apple | explore | accurate | none | Keep |
| 159 | Contacts and tasks | explore | accurate | none | Keep |
| 160 | Explore assistant control of desktop apps | explore | accurate | none | Keep |
| 161 | Malicious Word files freezing previews | explore | accurate | mammoth ^1.12.2 still in package.json; deliberately deferred by Destin | Keep; tag security |
| 162 | Linux updates: installer progress | merged | accurate | #630 | - |
| 163 | Restore Welcome back sessions | merged | accurate | #662 | - |
| 164 | Continue one conversation across Claude Code and native | explore | accurate | none | Related #11/#12 |
| 166 | Refresh website demo | merged | accurate | #640 | - |
| 167 | Linux launcher icons | merged | accurate | #639 | - |
| 169 | Claude message queues on par | merged | accurate | #657 | - |
| 172 | Upgrade desktop engine (selection-layout crash) | explore | DONE-NOT-CLOSED | desktop/package.json on origin/master: electron ^44.10.0 (commit dd20559df "Electron 41.10.7 -> 44.10.0 (security support; Node 24.22.1)"); card needs >=43.8/44.9. Part of sec-electron-upgrade in #713 | Close with ref dd20559df/#713; confirm crash gone on real use |
| 173 | Explore loading long history in pieces | explore | accurate | none | Related #98 and history-rendering plan |
| 174 | Public roadmap powered by cards | explore | accurate | none | Keep |
| 175 | site-assets.sh: regenerate the ideas-wall stills... | planning | QUALITY (jargon title) | title is developer jargon | Retitle e.g. "Refresh the website's picture wall automatically"; fold into dev-tooling grab |
| 176 | Custom providers: unknown conversation size errors | explore | accurate; jargon title | none | Retitle for non-dev |
| 177 | Android shows Local models page that can't work | explore | accurate? | no fix seen on master; android-ux-test branch has no commit for it (UNVERIFIED) | Fold into #213 stream (it is listed in 213's Related) |
| 178 | Practice chats show a 2025 date | planning | accurate; tooling bug, jargon | none | Dev-tooling grab |
| 182 | Phone keeps disconnecting; can't refresh/send | build | mostly done; stage honest | workspace #308 merged; a71a0a92d, a2e9c0404 on master; remaining = real-phone pass + "computer asleep" status deck | Move to polish; list remaining as 2 items |
| 183 | Automatic updates with emergency brake | merged | accurate; body stale | #685, shipped 2026-10-23; Next still says merge call | fix body (pointer to #189) |
| 184 | Gradual rollout | explore | accurate | blocked on 183 which is now merged -> unblocked | remove "waits on #183" |
| 185 | YouCoded credit on commits | explore | accurate | none | Keep |
| 186 | List YouCoded in AUR | explore | accurate | none | Keep |
| 188 | Automatic updates: later improvements | explore | possible duplicate of 184/189 | related 183/189 | Merge into one "updates follow-ups" card |
| 189 | Try auto-updates on a real Mac and Windows | planning | accurate | machine-needed; blocks next release | Keep; release gate |
| 190 | Resume/Welcome back preview covers first line | explore | accurate | none | Keep (small) |
| 191 | Model switches show as divider | merged | accurate | #689 | - |
| 193 | Message queue: stuck chip messages... | merged | accurate; body stale | #691; Next still lists checklist | fix body |
| 194 | Attachment cards show no image preview (dev/phone/Android) | explore | accurate | none | Phone/files stream |
| 195 | Checked secrets-scan command | explore | accurate; recurred 4x | recurrence notes through 2026-11-07 | HIGH value tiny fix; do now |
| 196 | shoot --check: Pages kit menu times out | explore | accurate | android-ux-test added SHOOT_CPU_THROTTLE (4311d19e2) to reproduce - may be relevant | Link |
| 197 | Easy version history, separate folders per session | explore | accurate (idea) | partly done by workspace-start | Keep |
| 198 | Isolated zero-context chats | explore | accurate | blocked on 197 | Keep |
| 199 | Many more helpers per session | explore | accurate | none | Keep |
| 202 | Sharing pages, phase 2 | explore | accurate; overlap | #90 (Pages next phases) is in flight on session/90-pages-finish (62 ahead) | Check overlap with #90 |
| 203 | Pages on Android: folder/all-files access | explore | accurate; overlap | same | Link to #90 |
| 204 | Pages file chooser real thumbnails | explore | accurate | none | Link to #90 |
| 205 | Phone: assistant's browser approvals you can't see | explore | accurate; UNTRACKED branch | session/user-notify (12 ahead, 2026-10-26) commit "browser:answer is the one phone-callable Browser channel (card #205)" - card doesn't link branch | Add work link; review branch status |
| 206 | Bring Signal into YouCoded | explore | accurate | none | Connections stream |
| 207 | Assistant reads comments outside project | merged | accurate | #707 | - |
| 208 | Move Destin's 5 roundup comments | planning | accurate (waits on his app update) | cannot check; housekeeping | Keep; tiny |
| 209 | Script to drive a real dev window's Claude Code | explore | accurate | none | Dev tooling |
| 210 | Buddy tray icon stays after turning Minimize off (Linux) | explore | accurate | cause found 2026-10-31; fix needs D-Bus lib | Keep; Linux-only |
| 211 | Analytics: honest numbers | merged | accurate | #711/#113/#21; later analytics-phone-wording + analytics-day-detail branches have NO card | add progress/follow-up card |
| 212 | Worker worktrees start without dependencies | explore | accurate; recurred 3x | notes 11-01, 11-05, 11-07 | Do now (tiny, repeated cost) |
| 213 | Android test findings | build | STALE PROGRESS | "Done: nothing yet". Reality: session/android-ux-test = 57 app commits + 28 workspace commits (2026-11-01..11-08): startup crash (ICU) fix, sync, attach, density, keyboard glide, terminal keys, skills drawer, no-folder project, fullscreen mode; experiment/phone-terminal-typing (55 ahead) also. Last item: phone leftovers question sheet + fullscreen investigation. report at docs/archive/investigations/2026-11-01-android-ux-test/report.md. Nothing merged; release-blocker | Rewrite Progress; move to polish; push branch to PR soon (huge unmerged) |
| 214 | Rebuild first-run tour | explore | accurate | session/first-run-fixes only has keychain wording commit | Keep |
| 215 | Voice typing: say when mic hears nothing | merged | accurate | #712 | - |
| 216 | Phone sign-in expiry: owner notice and retry | planning | accurate (follow-up of #713) | CLOSE_DEVICE_EXPIRED exists in remote-close-codes.ts | Keep |
| 217 | Move file previews and Pages to walled-off address | explore | accurate | security deck Q-14 | Keep |
| 218 | Dev instances share real youcoded-defaults.json | planning | DUPLICATE/overlap of #17 "Test copies of the app can change the real one" | #17 title same theme; #218 specific file | Link/merge into #17 |
| 219 | Rebuild Android once Alpine patches Node | planning | accurate; waiting on outside | Alpine patch status unknown from here | Add "check Alpine monthly" to Next; blocked-by external |
| 220 | Check native sessions for commands stuck Running | explore | accurate (valid) | #716 fixed only Claude Code causes; native uses exitUnknown/maybeStillRunning (shell-registry.ts, background-commands.ts) - not checked | Keep; needs repro |
| 221 | Server traffic limits | explore | PARTLY stale | #113 "working rate limits" and #114 "cap sign-in starts, abuse limits (stats cache, heartbeat)" landed; Cloudflare dashboard rule is the remaining piece, needs Destin ~10 min | Reword to "Cloudflare dashboard rule only" |
| 222 | Rearrange main chat window (sidebar) | explore | accurate; overlaps | narrow-screen-proposals branch (top bar, session list) | Link |
| 223 | Google Messages connector rebuild exe | explore | accurate | Dependabot PR #115 open; go.mod still x/crypto 0.48.0; deferred by Destin | Keep; low |
| 224 | Can't send: "Queue identity is not ready" | merged | accurate; body stale | #719 | fix body |
| 225 | Marketplace that fits a phone | explore | accurate; overlap | narrow-screen work | Link |

## Untracked work (branches with commits not on master and no card linking them)
- session/test-suite-rethink: youcoded 102 ahead, workspace 61, admin 1. Real-app gate ("walk-through on the candidate"), what-changed screens, Work board tiles. Biggest uncarded stream; nearest card #29 (release pipeline) but not linked.
- session/mesh-sync-design (8 ahead, YouCoded Mesh spec/explainer): relates to #119 only by word "mesh".
- session/sync-rethink-investigation (1 ahead; lost messages, false takeover alarm, no sync visibility): relates to #121/#125/#98.
- session/sync-slim-history (plan for card #98 piece 1): mentions #98 in commit but card doesn't link.
- session/narrow-screen-proposals (youcoded 4 + workspace 9; round 4 answers): relates to #139/#222/#225; no card links it.
- session/user-notify (12+8 ahead): notify-user plan + #205 browser channel; no card named "notify user".
- session/persona-prompt-eval (5+5): hybrid prompt spec/Prompt Arena; mentioned only under other cards (17/27/52/77/90/98/127 text hits, not branch links).
- session/local-model-hardening (17+1): linked only by NEW card #226 (ok).
- session/first-run-fixes / nightly-test-fixes (1-2 commits each): small, unmerged; nightly-test-fixes (Windows/macOS test fixes) unmerged for a week; #214 born from first-run-fixes.
- session/analytics-day-detail, analytics-phone-wording (+marketplace/admin): follow-ups to merged #211, no open card.
- session/usage-visibility-20260929 (usage statistics UI; 3+7 commits, 5+ weeks), session/model-picker-tags (card #47 mentions), session/plugin-project-controls (#75, drafts PR #571/#203), onedrive-no-auto-download (draft PRs, no card), sync-retry-feedback (#444 2 months open), theme-plugin-update, dev-xray-tools, integrations-research (cards 155-158 mention).
- experiment/phone-terminal-typing: part of #213 but not named.
- session/148-harness-performance-lab: card exists but worktrees dirty/unbacked-up.
- The security program (above): no card.
- Worktrees dirty and unbacked: 11-claude-direct-controls (4+47), 93-list-stream-fix (185 dirty), ui-consistency-audit (80 dirty), android-ux-test (34+1 dirty), 148 (40+27).

## Candidate workstreams (open cards only)

1. Phone & Android finish (XL; RELEASE BLOCKER). Cards 213, 182, 112, 114, 115, 117, 118, 177, 194, 205 (+user-notify branch), 203, 219, and #1 (other agent). Deps: #213 branch merge first; #115 before #117. Done = android-ux-test merged, real-phone pass of every "yes" finding, #182 real-phone pass, phone microphone path decided.
2. Release & updates gate (M). 189, 184, 188, 195, 212, 186, 29 and test-suite-rethink branch. Deps: needs real Mac/Windows machine (#189). Done = Mac+Windows install tested, brake works, rollout decision, scan-then-push script.
3. Security follow-ups (S-M). New umbrella card + 161, 216, 217, 219, 221, 223, 124(c), 55. Deps: Destin in Cloudflare dashboard (221), Alpine (219). Release-blocker: none flagged by Destin. Done = each leftover fixed or consciously accepted.
4. Sync & multi-device (L). 121, 124, 125, 127, 119, 98 + sync-rethink, mesh-sync-design, sync-slim-history. Deps: Mesh decision (spike) shapes the rest. Done = Destin picks Mesh or fix path; lost-message and false-takeover bugs fixed.
5. Connected accounts (L). 155 (paused for rclone question), 156, 157, 158, 159, 206, 160, 223. Deps: #155 decision first. Done = Google files round-trip approved and shipped.
6. Design system & screens consistency (L). 133, 134, 135, 139, 142, 143, 130, 149, 150, 152, 190, 214, 222, 225, narrow-screen-proposals branch. Deps: #150 questions decided before 149. Done = guide questions answered, error-message batches done, narrow-screen design shipped.
7. Native engine & chat reliability (L). 148 (spend cap), 164, 176, 220, 146, 173, 226 (+local-model-hardening branch), persona-prompt-eval, 154. Deps: harness spending approval. Done = native sessions finish jobs, stuck commands checked, local engine fixes landed.
8. Workspace & tooling hygiene (M). 147, 151, 175, 178, 195, 196, 197-199, 208, 209, 218 (+#17). Done = priority tags rebuilt, repeated-pain fixes shipped.
9. Pages (M). 202, 203, 204 + #90 and session/90-pages-finish. Done = Pages step 4 shipped, sharing phase 2 scoped.
10. Small/Linux/misc (S). 210, 186, 185, 174.

Done-not-closed to apply immediately: #172 (Electron 44.10.0), plus stale bodies on #153/#183/#191/#193/#207/#211/#215/#224. Obsolete: #133. Partly stale: #112, #114, #124, #221. Duplicates: #218 vs #17, #188 vs #184/#189, #149 vs #150.
