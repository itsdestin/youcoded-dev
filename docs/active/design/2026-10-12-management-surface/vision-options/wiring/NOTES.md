# How it works (round 2)

**The idea.** One picture of the app's real parts, joined by connections that each carry a plain sentence and a status. Three "Follow" buttons walk one path step by step: a message, a marketplace install, a sync.

**Round 2 changes.**
- Reads only `../facts.json` (parts, connections, traces and merged statuses); the hand-written copies were deleted from `build.py`.
- Light theme like the other views.
- Diagram narrowed (boxes 144 wide, 160 apart, 944 total) and sideways scrolling switched off, so no horizontal scrollbar at 1440 wide, framed or not.
- "What is not finished" is five one-line rows ("Mesh needs Scheduled agents · planned"); the reason shows on hover and in the connection's own detail.
- Part detail is: name, status, one sentence, at most three facts (waiting on / holds up / items still to do / working links), everything else (rest of the description, inside list, connections, big-picture items, code locations) behind a closed More.
- Trace steps show one short sentence; a long step keeps its remainder under More. The repeated "All steps" list became numbered dots.
- Opens on `#focus=part:<id>` or any node id (the part whose vision list holds it, else its system's part). Selecting a part sends `{bp:'focus', id:'part:<id>', title}`; clicking empty space sends `id:null`.
- Own title band hidden when framed; legend kept.

**Weakest point.** Only 3 of 16 boxes come from the vision. Some straight lines still cross. Layout is hand-placed. Android's unfinished move to the shared core is not drawn. Selecting a line does not report a focus.
