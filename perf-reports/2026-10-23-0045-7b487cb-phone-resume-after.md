# Phone over a slow network — resume-after

Link: round trip 470 ms, down 5 / up 2 Mbit/s (ASSUMED mobile profile, not measured on a real phone). Conversation: 300 turns + a 2000-line terminal. 2 repeats, each a fresh Chrome profile; cells are median [min–max], milliseconds unless stated.
App 7b487cbb0d2f270c0623b917b3808d49dd70245b (session/remote-access-audit). Times are the phone page's own marks, from the app's log line, counted from page start (cold/reopen) or from the new connection (reconnect).

| step (ms) | cold | reopen | revisit | reconnect | resume |
|---|---|---|---|---|---|
| waited after waking | — | — | — | — | 2501 [2500–2501] |
| page | 951 [949–952] | 584 [579–588] | 4 [2–5] | — | — |
| code ran | 4799 [4702–4896] | 636 [631–640] | 182 [178–185] | — | — |
| first frame | 4801 [4704–4897] | 636 [632–640] | 183 [180–186] | — | — |
| connection code | 5125 [5029–5221] | 676 [671–680] | 193 [190–196] | — | — |
| connecting | 5242 [5144–5339] | 677 [672–681] | 196 [193–199] | — | — |
| connected | 6190 [6091–6289] | 1626 [1621–1630] | 1146 [1144–1148] | 950 [950–950] | 950 [950–950] |
| signed in | 6674 [6574–6773] | 1627 [1622–1632] | 1148 [1145–1150] | 952 [951–952] | 952 [951–952] |
| list | 6695 [6595–6794] | 1649 [1644–1653] | 1198 [1195–1200] | 955 [955–955] | 955 [954–955] |
| terminal | 7196 [7099–7293] | 1648 [1644–1652] | 1198 [1195–1200] | 955 [955–955] | 955 [954–955] |
| conversation | 7336 [7239–7432] | 1788 [1783–1792] | 1321 [1320–1321] | 956 [955–956] | 955 [954–955] |
| drawn | 7543 [7448–7638] | 1945 [1936–1954] | 1528 [1526–1529] | 963 [957–968] | 959 [957–961] |
| drawn, counted from pressing Connect | 2328 [2327–2328] | — | — | — | — |
| drawn, counted from waking | — | — | — | — | 3460 [3457–3462] |
| rig wall clock (coarse, ±100 ms) | 7862 [7761–7962] | 2212 [2210–2213] | 1818 [1816–1820] | 2212 [2211–2212] | 3731 [3725–3737] |
| computer took to answer the conversation | 14 [12–16] | 13 [12–14] | 10 [10–10] | 0 [0–0] | 1 [0–1] |
| conversation answer, KB | 321 [321–321] | 320 [320–320] | 320 [320–320] | 0 [0–0] | 0 [0–0] |
| terminal answer, KB | 223 [223–223] | 222 [222–222] | 222 [222–222] | 0 [0–0] | 0 [0–0] |
| through the proxy, down, KB | 1052 [1013–1090] | 234 [224–243] | 127 [127–127] | 2 [2–2] | 2 [2–2] |
| through the proxy, up, KB | 17 [17–17] | 8 [8–8] | 4 [4–4] | 3 [3–3] | 3 [3–3] |
| connections opened | 15 [15–15] | 4 [3–5] | 3 [3–3] | 1 [1–1] | 1 [1–1] |

- One app boot serves all repeats; each repeat uses a new Chrome profile, so each cold open really is cold. The first cold open also pays the app's first-ever conversation answer.
- Reopen is Page.reload with the cache allowed (saved key, cached code). A phone tab revisited without a reload may be faster.
- Reconnect = the proxy closes every connection at once. The page marks count from the new connection; the rig wall clock also includes the page noticing the drop and its retry wait. A reconnect asks only for what it missed, so its conversation answer is ~0 KB.
- Resume = the page hidden and the link silent (nothing, not even a close, crosses it) for 75 s, then shown again. "Waited after waking" is the time before the new connection began (the page deciding the old one is dead); the other marks count from that connection.
- Not modelled: packet loss, jitter, TCP slow start. The server side is not slowed, only what crosses the link.
