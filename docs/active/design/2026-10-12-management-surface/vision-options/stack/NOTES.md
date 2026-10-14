# Foundations up

**Idea.** The vision is a building: each block rests on the blocks it needs, so the bottom floor is what everything stands on and the top is the dreams needing the most beneath them. A block whose foundation is unfinished hangs on dashed legs; "Build next" ranks unfinished foundations by how much sits on them.

**Floors.** Computed, not placed: a block's floor is the longest chain of `needs[]` under it (0 = needs nothing). Statuses come only from the evidence files. The brief names file C, but C covers only four areas, so I read A, B and C through the page's own loader (`vision_tab.py`). 56 of 205 items have a needs-link and form the building (20/19/12/4/1 per floor); the other 113 features sit in a closed "Everything else" list.

**(a) Complete / in progress / planned:** dot and colour on every block (green strip exists, half dot building, empty planned, hatched idea).
**(b) Connections:** hover or click a block. What holds it up lights green (amber if unfinished); what it holds up lights blue; lines join them, dashed amber where the support is missing. Only `needs[]` is drawn.
**(c) How the app works inside:** weak. It shows dependency, not how parts talk. No MAP.md or code links added.

**Units.** The skeleton's capabilities and features; floors replace pillars (pillar shown only in the side panel).

**Weakest point.** Only about a quarter of items have needs-links, so most of the app, including done things like themes and Marketplace browsing, is outside the picture. A missing link silently drops a block to the ground floor. "Holds up N" counts a big system and a one-line idea as equal.
