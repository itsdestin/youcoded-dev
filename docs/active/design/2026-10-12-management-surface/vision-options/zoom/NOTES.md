# Zoom in

**The idea.** One canvas of nested boxes: ten big boxes (major systems), each as large as what it holds and filled with one square per feature, coloured by status (green exists, dark being built, grey planned, hatched idea). Click a box to zoom into its groups, again for one feature; breadcrumb, "Zoom out" or Esc goes back.

**(a) Status of systems.** The first screen is the answer: how much green, dark, grey and hatched area each box has. Hover any square for its title, status and reason.

**(b) Connections.** Only for the box in focus. The other nine systems shrink into a right-hand column; lines run to those it needs or shares work with. Green solid = both ends exist, dark = in progress, grey dashed = planned. Thickness = how many links. A plain list below ("X needs Y", with the reason) is grouped the same way; names are clickable.

**(c) Inside the app.** Only the nesting plus the needs/shares entries. Nothing from MAP.md or code was added. Statuses come from evidence files A, B and C, merged with the current page's own loader.

**Levels.** System, group, feature, in Destin's own tree. Box size = feature count; a feature is the smallest thing with its own status, so area needs no typed-in number.

**Weakest point.** Every feature counts equally, so a one-line idea takes the same area as a big shipped feature: size means "how many things", not "how much work". The overview shows no connections by design, so dependencies are seen one box at a time, and a missing line does not prove independence. The glide animation was not watched in headless shots; check by hand. `index.html#sync` opens a zoomed view directly.

Files: `build.py` + `template.html` make `index.html`; `shot.png`, `shot-detail.png`.
