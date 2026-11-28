# System map groupings (evidence for the master plan)

Findings: `docs/active/investigations/2026-10-08-system-map-groupings.md`.

Files here: `grouping-A-code.png`, `grouping-B-systems.png`, `grouping-C-streams.png` (pictures; dashed yellow boxes are
code no MAP row claims; orange lines cross a group border), `graph.json` (nodes with files/lines, edges, the three groupings,
numbers, hard-to-place list), `*.dot` (picture sources).

Regenerate, from the workspace root (needs Node and graphviz `dot`; the desktop dependencies are not needed):

    cd docs/active/design/2026-10-06-master-plan/map
    node parse.mjs map-rows.json                      # reads ../../../../MAP.md rows (run from workspace root; see below)
    MIN=3 node graph.mjs map-rows.json /tmp/g.json    # from workspace root: files -> subsystems -> edges
    node group.mjs /tmp/g.json graph.json map-rows.json
    node render.mjs                                   # writes the three PNGs

`parse.mjs`, `graph.mjs` read paths relative to the workspace root, so run those two as
`node docs/active/design/2026-10-06-master-plan/map/graph.mjs ...` from the root. Assumptions: only `youcoded/desktop/src`
`.ts/.tsx` files (tests and `.d.ts` excluded); Android (Kotlin) is out of scope; relative imports only (the project has no
path aliases); `parse.mjs` reads the first 84 lines of `docs/MAP.md` (the subsystem table) so re-check that number if the table grows.
