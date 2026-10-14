# Zoom in (labelled "Systems")

**The idea.** One canvas of nested boxes: ten big boxes (major systems), each sized by how much it holds and filled with one square per feature, coloured by status. Click a system to zoom in, again for one feature; breadcrumb, "Zoom out" or Esc goes back.

**Round 2 changes.**
- Reads only `../facts.json` (no evidence loader). Statuses and links come from it.
- Switcher: opens on `#focus=<id>` (a system or any node; unknown ids such as `part:` open normally), reports each selection with `postMessage({bp:'focus',...})`, `null` on zoom-out. Own title band is dropped when framed; legend stays.
- After zooming: the "rest of the app" mini boxes, the connecting lines and the long "What it connects to" list are gone. A short "Connects to" column lists other systems with one word each (exists, in progress, planned, partly planned), five shown, rest behind "More". Hover gives the reason.
- Header is one short line ("Mostly still ahead. 4 of 13 features exist.").
- Zoomed features are neutral tiles with a thin status stripe, the name, and a dot plus status word, instead of walls of colour. The first view keeps coloured squares.
- Feature detail: name, status, one-to-two-line why, up to three facts (Waiting on / Holds up / Shares work with), everything else behind "More".
- Animation: the glide was replaced by a 150 ms fade (verified: canvas opacity 0 mid-swap, layout correct after).

**Answers.** (a) first view colour areas; (b) connections shown only for the zoomed system, as a list; (c) the nesting plus needs/shares.

**Weakest point.** Size means "how many features", not effort; tiles in small groups still have empty area. Connections are only a list now, so a link's direction is only in the hover text.

**Missing facts.** None needed; `label`/`catch` fields were unused.
