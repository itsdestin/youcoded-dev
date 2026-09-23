# Project-detail header/fade — context-free UX review 1

Tester covered Today and Selected at top/middle/end in Meadow Mist at 1024×768; Selected at those positions and Today at top in Halftone Dimension; Selected at 1440×900. The header stayed visible. Findings:

1. **Trade-off to show, not silently change:** With the selected 42px/4%-side content mask, the last visible note gets faint at the bottom edge until it is scrolled into the fully opaque region (Halftone top around Note 7; middle around Note 10). Today clips the note sharply. Tester preferred the selected edge as a clearer boundary but suggested shortening or lowering its fade for text readability. This request is explicitly to test Settings-style numbers on a different, larger surface; do not tune them on the user's behalf. The deck now calls out the edge readability trade-off, and Destin can choose Today, Selected or Other. A direct browser probe confirmed `data-fade-bottom=false` at the actual scroll end, so final content is reachable and unmasked.
2. No further issue at 1440×900 Selected. Today at that size and Halftone middle/end for Today were not checked.

No production Project styling was changed.
