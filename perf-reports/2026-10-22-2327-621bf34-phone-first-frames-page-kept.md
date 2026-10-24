# Phone over a slow network — first-frames-page-kept

Link: round trip 470 ms, down 5 / up 2 Mbit/s (ASSUMED mobile profile, not measured on a real phone). Conversation: 300 turns + a 2000-line terminal. 3 repeats, each a fresh Chrome profile; cells are median [min–max], milliseconds unless stated.
App 621bf340406063117a03e64992146b951357bf18 (session/remote-access-audit). Times are the phone page's own marks, from the app's log line, counted from page start (cold/reopen) or from the new connection (reconnect).

| step (ms) | cold | reopen | revisit | reconnect |
|---|---|---|---|---|
| page | 950 [949–953] | 494 [483–497] | 3 [3–5] | — |
| code ran | 4946 [4800–5266] | 690 [657–701] | 344 [316–394] | — |
| first frame | 4948 [4802–5278] | 693 [658–702] | 346 [319–407] | — |
| connection code | 4959 [4815–5299] | 753 [707–770] | 359 [332–422] | — |
| connecting | 5101 [5000–5440] | 754 [707–770] | 364 [337–430] | — |
| connected | 6049 [5959–6393] | 1704 [1656–1724] | 1317 [1295–1395] | 954 [952–960] |
| signed in | 6526 [6436–6883] | 1705 [1658–1727] | 1318 [1297–1397] | 956 [954–961] |
| list | 6581 [6478–6933] | 1757 [1685–1787] | 1459 [1456–1567] | 960 [959–968] |
| terminal | 7101 [6982–7448] | 1757 [1684–1786] | 1459 [1455–1566] | 959 [957–967] |
| conversation | 7226 [7123–7595] | 1889 [1819–1964] | 1762 [1616–1920] | 960 [959–969] |
| drawn | 7546 [7545–8008] | 2183 [2067–2320] | 2181 [1836–2227] | 963 [962–972] |
| drawn, counted from pressing Connect | 2584 [2485–2594] | — | — | — |
| rig wall clock (coarse, ±100 ms) | 7831 [7830–8272] | 2520 [2314–2629] | 2431 [2127–2530] | 2228 [2221–2325] |
| computer took to answer the conversation | 20 [20–31] | 15 [15–18] | 19 [11–22] | 0 [0–1] |
| conversation answer, KB | 321 [321–321] | 320 [320–320] | 320 [320–320] | 0 [0–0] |
| terminal answer, KB | 223 [223–223] | 222 [222–222] | 222 [222–222] | 0 [0–0] |
| through the proxy, down, KB | 1312 [1312–1313] | 129 [109–129] | 130 [129–130] | 2 [2–2] |
| through the proxy, up, KB | 13 [13–13] | 5 [5–5] | 5 [5–5] | 3 [3–3] |
| connections opened | 15 [15–15] | 1 [1–1] | 3 [3–3] | 1 [1–1] |

- One app boot serves all repeats; each repeat uses a new Chrome profile, so each cold open really is cold. The first cold open also pays the app's first-ever conversation answer.
- Reopen is Page.reload with the cache allowed (saved key, cached code). A phone tab revisited without a reload may be faster.
- Reconnect = the proxy closes every connection at once. The page marks count from the new connection; the rig wall clock also includes the page noticing the drop and its retry wait. A reconnect asks only for what it missed, so its conversation answer is ~0 KB.
- Not modelled: packet loss, jitter, TCP slow start. The server side is not slowed, only what crosses the link.
