# Phone over a slow network — first-open-early

Link: round trip 470 ms, down 5 / up 2 Mbit/s (ASSUMED mobile profile, not measured on a real phone). Conversation: 300 turns + a 2000-line terminal. 3 repeats, each a fresh Chrome profile; cells are median [min–max], milliseconds unless stated.
App 1a3e9e198983f8dced6b3a7e37a522b108961b39 (session/remote-access-audit). Times are the phone page's own marks, from the app's log line, counted from page start (cold/reopen) or from the new connection (reconnect).

| step (ms) | cold | reopen | reconnect |
|---|---|---|---|
| page | 948 [948–952] | 481 [480–482] | — |
| code ran | 4336 [4331–4915] | 606 [606–646] | — |
| first frame | 4338 [4332–4917] | 606 [606–647] | — |
| connection code | 4349 [4343–4926] | 648 [648–689] | — |
| connecting | 4483 [4481–5062] | 649 [648–690] | — |
| connected | 5429 [5427–6013] | 1594 [1593–1635] | 947 [946–947] |
| signed in | 5905 [5903–6495] | 2070 [2068–2110] | 1421 [1420–1421] |
| list | 5925 [5923–6515] | 2073 [2071–2113] | 1424 [1424–1425] |
| terminal | 6888 [6888–7015] | 2137 [2130–2174] | 1425 [1424–1425] |
| conversation | 7027 [7026–7153] | 2230 [2228–2269] | 1425 [1424–1425] |
| drawn | 7218 [7214–7350] | 2383 [2380–2417] | 1426 [1426–1427] |
| drawn, counted from pressing Connect | 2766 [2325–2774] | — | — |
| rig wall clock (coarse, ±100 ms) | 7507 [7501–7679] | 2717 [2714–2719] | 2716 [2714–2717] |
| computer took to answer the conversation | 11 [10–12] | 11 [10–12] | 0 [0–1] |
| conversation answer, KB | 321 [321–321] | 320 [320–320] | 0 [0–0] |
| terminal answer, KB | 223 [223–223] | 222 [222–222] | 0 [0–0] |
| through the proxy, down, KB | 1311 [1311–1311] | 111 [111–111] | 2 [2–2] |
| through the proxy, up, KB | 13 [13–13] | 5 [5–5] | 2 [2–2] |
| connections opened | 10 [10–15] | 2 [1–2] | 1 [1–1] |

- One app boot serves all repeats; each repeat uses a new Chrome profile, so each cold open really is cold. The first cold open also pays the app's first-ever conversation answer.
- Reopen is Page.reload with the cache allowed (saved key, cached code). A phone tab revisited without a reload may be faster.
- Reconnect = the proxy closes every connection at once. The page marks count from the new connection; the rig wall clock also includes the page noticing the drop and its retry wait. A reconnect asks only for what it missed, so its conversation answer is ~0 KB.
- Not modelled: packet loss, jitter, TCP slow start. The server side is not slowed, only what crosses the link.
