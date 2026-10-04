# Office UX review — 1

Practice app, `--scenario default`, then `--scenario stress --params stressRows=2000`. Task: find
and open Office, open a document, switch between open documents, check for an earlier version,
then open "Garden plan.docx" from a conversation's files panel and edit it there.

- U1 accepted (as a deck question) — Expected to be able to edit "Garden plan.docx" right in the files panel, as the task asked / instead the panel only shows a read-only preview of the text — no textbox, no "Edit" button, nothing in the document body responds to a click. The only controls on the file are: open with the default app, copy path, reveal in folder, expand panel, and (via clicking the title) rename the file. There is no way to change the document's contents from this panel — the only edits available are to the file name — screen: chat / files panel, preview — /home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/scratch/explore/20260928-075549/17-click.png
- U2 rejected (the workbench cannot launch other programs; the real app opens the file) — Expected clicking "Open with the default app" (or "Reveal in folder") to do something visible — open the document, show a confirmation, anything / instead nothing on screen changed, no toast, no error, no new tab or window. I could not tell whether the click worked at all — screen: chat / files panel — /home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/scratch/explore/20260928-075549/18-look.png
- U3 accepted — Expected each file to be listed once on the Office start screen / "Garden plan.docx" (and Garden budget.xlsx, Garden talk.pptx) each appear twice — once under "RECENT" and again under "IN COMMUNITY-GARDEN" — with two different "last touched" times for what looks like the same file (e.g. Garden plan.docx: "24 min ago" in one list, "1 d ago" in the other). Nothing on screen explains why the same file has two different recency stamps, which reads as either a stale second copy or a bug in whichever timestamp is wrong — screen: Office home — /home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/scratch/explore/20260928-075549/01-click.png
- U4 accepted — Expected the focused control to always describe what's actually on screen / right after clicking the "Garden plan" tab (while "Garden budget" was the previously open tab), the tool's accessibility read-out still named the focused element "iframe Garden budget.xlsx" for that step, even though Garden plan's content was already the one displayed. This may be a lag in how the document frame announces its own title after a tab switch, which would misdirect a screen-reader user for a moment — screen: Office document tabs — /home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/scratch/explore/20260928-075549/05-click.png
- U5 rejected (eyebrows are uppercase by guide G-7; the project is named as everywhere else) — Minor: recent files are grouped under the heading "IN COMMUNITY-GARDEN" — an all-caps raw project slug rather than a normal name like "Community Garden." A new user who has not named their own project this way may not immediately read it as "this is your project's name" — screen: Office home — /home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/scratch/explore/20260928-075549/01-click.png

Stress pass (`--scenario stress --params stressRows=2000`): reopened Office home, opened
Garden plan.docx, and opened the Session Files panel. All three loaded without any visible
pause, stutter or blank frame — the Office "Recent" list and the Session Files panel both still
showed a small, fixed number of items (6 and 13 respectively) rather than scaling with
`stressRows`, so this pass did not exercise a large list on the screens this task touches.

**Could I complete the task?** Mostly. I found Office, opened its start screen, opened a
document, switched between two open documents (Garden plan and Garden budget) without losing
either one's state, and found the "earlier version" feature (the Versions dialog, with four
timestamped restore points). I could not complete the last step: the files panel in the
conversation only lets you preview or rename "Garden plan.docx," not edit its contents — there
is no in-place editor there, only a read-only text view. The most confusing moment was that
silent "Open with the default app" click (U2): it gave no feedback of any kind, so I could not
tell if it was supposed to be the way to reach an editable copy or if it simply does not work
yet.

## Triage (2026-09-28, implementing session)

- U1: the drawer's floating Edit pill appears only while the file list is collapsed — an
  existing drawer decision that applies to text files too. Changing it changes meaning, so it
  goes on the review deck as a question rather than being changed here.
- U3: Recent and the project list meant different times (opened vs changed). The project
  list now omits files already under Recent, and each list says which time it shows.
- U4: switching tabs now moves focus into the document that is shown.
