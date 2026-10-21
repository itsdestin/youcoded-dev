# Power restyle — context-free UX review

Scope: actual dashboard screenshots of two opt-in candidates, fixed plugged-in/draining example. No installation or measurement changes.

- **Accepted:** the reason for draining required inference from 30 W adapter versus 50 W machine. Both candidates now state `Adapter is ~20 W short` directly below the prominent signed battery watts.
- **Already handled:** battery contribution is visible in both candidates with `Battery draining` and a large red `−20.0 W`. Keep this equally prominent in either choice.
- **Rejected for this design round:** interpreting the separate Everything else detail tile as extra power. It repeats the Other estimate already included in system total, not an additional source or new drain; changing the entire detail grid is outside these flow-layout alternatives. The original tile does not contain the charger tile's net-flow note.
- **Accepted as recommendation, not a decision:** the tester found Power breakdown easier to read than the connector layout. The choice deck recommends it but leaves both visual options to Destin.

## Visible-change ledger

| Number | Candidate | Change | Decision |
|---|---|---|---|
| C-1 / lines | Clean connections | Flat source cards, thin non-animated wires, separate machine destination; charging reverses the battery into a destination | Rejected: user wants a more premium/polished layout and distinct cards for each major input/output |
| C-1 / balance | Power breakdown | Compact total, flat contribution bar, adapter row and prominent red battery-shortfall row | Rejected for the same reason |
| C-2 | Premium cards | Dedicated adapter, battery, CPU, GPU and Other hardware cards, icon tiles, aligned type, state badges, central supply total and thin routed connections | User selected the light card style in chat, requesting Power draw wording and smoother simultaneous-source connections |
| C-3 | Receiving battery | Power draw label, smooth output paths and battery on the lower receiving row | Approved in power-restyle.review-3.answers.json |
| C-4 | Supplying battery | Adapter and battery on the upper source row, independent smooth paths merging into Power draw | Approved in power-restyle.review-3.answers.json |

Both rejected candidates preserved measured/estimated power semantics and remain recorded here only for decision history. After C-3/C-4 approval, the approved card design became the default and rejected layout code was removed. These screenshots cover the dashboard only. During finalization, the separate quick-settings inconsistency was corrected: green charging fill now follows positive shared battery watts, not the cable flag. Executable binding tests reproduce and verify plugged-in draining, provisional negative/positive, idle and unavailable cases; the installed widget was unchanged at that review point. Subsequent authorized file installation is recorded in the archived implementation plan; the desktop was not restarted.

## Round 2 review

- **Accepted clarification:** a fresh reviewer wanted the combined source total named explicitly. Replaced `Total supplied` with `Adapter + battery` while the battery supplements the adapter; while charging it reads `Adapter supply`, and unplugged it reads `Battery supply`. The reviewer phrased simultaneous source contributions as a possible ambiguity, but both sources genuinely supply power in the draining example; no arithmetic or arrow direction was changed.
- **Accepted visual correction from screenshot review:** tablet output cards had misaligned number baselines when titles/badges wrapped. Their headers and note space are aligned at that width; a browser assertion confirmed all four readings share the same vertical position and no horizontal page overflow.
- **Trade-off shown in the deck:** taller than the old layout; battery changes from source row to destination row when charging. Example data and no-install boundary remain explicit.
