# How it's wired

**The idea.** One picture of the app's real parts (13, plus 3 faint ones for things not built yet), joined by connections that each carry a plain sentence and a status. Three "Follow" buttons walk one path step by step: a message, a marketplace install, a sync.

**(a) Systems: complete / in progress / planned.** Green stripe = exists (from MAP.md and checked files). The dashed boxes (Mesh, Scheduled agents, Saved agent recipes) take their status from `vision-evidence-C.json`. Clicking Sync or Phone lists its vision items with recorded status.

**(b) Connections planned / in progress.** Dashed grey = planned, solid dark = being built. The side panel opens on "What is not finished", each with its reason read from `needs` and `shares`, not hand-written. Only five such connections exist in the data.

**(c) How the app works inside.** 17 working connections, from MAP.md and real code. Hover gives a plain sentence; clicking shows the file behind it, labelled "Where it lives in the code".

**Levels / units.** One level: a "part" is a MAP.md subsystem rolled up with neighbours (all sign-in and model code is "Cloud AI companies"). What is inside a part is a plain list in the side panel. This keeps the first screen near a dozen boxes.

**Weakest point.** It shows the inside well but the vision thinly: only 3 of 16 boxes come from the vision, most vision items have no recorded status so they do not appear, and nothing shows a part's size or importance. Some straight lines cross (Claude Code to Saved conversations). The layout is hand-placed, so a new part means moving boxes. Android's unfinished move onto the shared core is not drawn as its own connection.
