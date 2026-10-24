# Phone over a slow network — all-changes

Link: round trip 470 ms, down 5 / up 2 Mbit/s (ASSUMED mobile profile, not measured on a real phone). Conversation: 300 turns + a 2000-line terminal. 3 repeats, each a fresh Chrome profile; cells are median [min–max], milliseconds unless stated.
App 7b487cbb0d2f270c0623b917b3808d49dd70245b (session/remote-access-audit). Times are the phone page's own marks, from the app's log line, counted from page start (cold/reopen) or from the new connection (reconnect).

| step (ms) | cold | reopen | revisit | reconnect | resume |
|---|---|---|---|---|---|
| waited after waking | — | — | — | — | 2501 [2500–2503] |
| page | 951 [950–954] | 629 [594–689] | 2 [2–12] | — | — |
| code ran | 3621 [3361–3679] | 692 [646–790] | 147 [141–450] | — | — |
| first frame | 3623 [3363–3685] | 693 [647–793] | 149 [142–458] | — | — |
| connection code | 3633 [3373–3704] | 745 [688–896] | 158 [150–482] | — | — |
| connecting | 3778 [3453–3891] | 745 [688–897] | 162 [153–491] | — | — |
| connected | 4732 [4409–4842] | 1697 [1638–1861] | 1111 [1106–1452] | 951 [950–965] | 951 [950–958] |
| signed in | 5226 [4884–5332] | 1699 [1638–1862] | 1113 [1107–1462] | 952 [952–970] | 953 [951–961] |
| list | 5254 [4907–5415] | 1740 [1662–1908] | 1156 [1155–1606] | 957 [956–973] | 956 [955–967] |
| terminal | 5753 [5406–5955] | 1735 [1662–1907] | 1155 [1155–1605] | 957 [956–972] | 956 [955–962] |
| conversation | 5892 [5542–6085] | 1877 [1799–2220] | 1273 [1269–1965] | 957 [956–973] | 956 [955–967] |
| drawn | 6120 [5756–6842] | 2096 [1963–2683] | 1503 [1487–2755] | 971 [958–982] | 962 [956–974] |
| drawn, counted from pressing Connect | 2378 [2342–2987] | — | — | — | — |
| drawn, counted from waking | — | — | — | — | 3462 [3457–3477] |
| rig wall clock (coarse, ±100 ms) | 6405 [6074–7133] | 2419 [2216–2937] | 1817 [1816–3059] | 2214 [2213–2333] | 3729 [3728–3737] |
| computer took to answer the conversation | 13 [12–26] | 20 [12–33] | 12 [12–34] | 0 [0–1] | 1 [0–1] |
| conversation answer, KB | 321 [321–321] | 320 [320–320] | 320 [320–320] | 0 [0–0] | 0 [0–0] |
| terminal answer, KB | 223 [223–223] | 222 [222–222] | 222 [222–222] | 0 [0–0] | 0 [0–0] |
| through the proxy, down, KB | 985 [985–1073] | 248 [236–253] | 126 [126–126] | 2 [2–2] | 2 [2–2] |
| through the proxy, up, KB | 9 [9–9] | 8 [6–8] | 4 [4–5] | 3 [3–3] | 3 [3–3] |
| connections opened | 13 [13–13] | 3 [1–3] | 3 [3–3] | 1 [1–1] | 1 [1–1] |

- One app boot serves all repeats; each repeat uses a new Chrome profile, so each cold open really is cold. The first cold open also pays the app's first-ever conversation answer.
- Reopen is Page.reload with the cache allowed (saved key, cached code). A phone tab revisited without a reload may be faster.
- Reconnect = the proxy closes every connection at once. The page marks count from the new connection; the rig wall clock also includes the page noticing the drop and its retry wait. A reconnect asks only for what it missed, so its conversation answer is ~0 KB.
- Resume = the page hidden and the link silent (nothing, not even a close, crosses it) for 75 s, then shown again. "Waited after waking" is the time before the new connection began (the page deciding the old one is dead); the other marks count from that connection.
- Not modelled: packet loss, jitter, TCP slow start. The server side is not slowed, only what crosses the link.
