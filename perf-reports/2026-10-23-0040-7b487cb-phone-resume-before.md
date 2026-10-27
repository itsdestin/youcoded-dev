# Phone over a slow network — resume-before

Link: round trip 470 ms, down 5 / up 2 Mbit/s (ASSUMED mobile profile, not measured on a real phone). Conversation: 300 turns + a 2000-line terminal. 2 repeats, each a fresh Chrome profile; cells are median [min–max], milliseconds unless stated.
App 7b487cbb0d2f270c0623b917b3808d49dd70245b (session/remote-access-audit). Times are the phone page's own marks, from the app's log line, counted from page start (cold/reopen) or from the new connection (reconnect).

| step (ms) | cold | reopen | revisit | reconnect | resume |
|---|---|---|---|---|---|
| waited after waking | — | — | — | — | 10001 [10001–10001] |
| page | 950 [947–953] | 605 [574–636] | 3 [2–3] | — | — |
| code ran | 5042 [4713–5371] | 662 [623–700] | 190 [182–198] | — | — |
| first frame | 5044 [4715–5372] | 663 [624–701] | 191 [183–199] | — | — |
| connection code | 5359 [5026–5691] | 709 [662–755] | 202 [193–211] | — | — |
| connecting | 5489 [5161–5817] | 710 [663–756] | 205 [196–213] | — | — |
| connected | 6437 [6108–6766] | 1659 [1613–1705] | 1155 [1146–1164] | 951 [951–951] | 956 [951–961] |
| signed in | 6918 [6585–7250] | 1660 [1614–1706] | 1157 [1147–1166] | 952 [951–952] | 957 [951–963] |
| list | 6942 [6612–7271] | 1683 [1635–1730] | 1201 [1191–1211] | 957 [956–957] | 961 [954–967] |
| terminal | 7440 [7110–7770] | 1682 [1635–1728] | 1200 [1191–1208] | 957 [956–957] | 960 [954–966] |
| conversation | 7579 [7248–7909] | 1820 [1774–1866] | 1324 [1312–1335] | 957 [956–957] | 961 [955–967] |
| drawn | 7780 [7446–8114] | 1995 [1920–2070] | 1540 [1509–1570] | 960 [959–960] | 962 [956–968] |
| drawn, counted from pressing Connect | 2322 [2316–2328] | — | — | — | — |
| drawn, counted from waking | — | — | — | — | 10963 [10957–10969] |
| rig wall clock (coarse, ±100 ms) | 8108 [7781–8434] | 2262 [2210–2313] | 1812 [1811–1813] | 2212 [2210–2214] | 11276 [11267–11284] |
| computer took to answer the conversation | 11 [11–11] | 12 [11–12] | 11 [10–12] | 1 [0–1] | 1 [0–1] |
| conversation answer, KB | 321 [321–321] | 320 [320–320] | 320 [320–320] | 0 [0–0] | 0 [0–0] |
| terminal answer, KB | 223 [223–223] | 222 [222–222] | 222 [222–222] | 0 [0–0] | 0 [0–0] |
| through the proxy, down, KB | 1052 [1013–1090] | 204 [163–244] | 127 [127–127] | 2 [2–2] | 2 [2–2] |
| through the proxy, up, KB | 18 [17–19] | 7 [6–8] | 4 [4–4] | 3 [3–3] | 3 [3–3] |
| connections opened | 15 [15–15] | 2 [1–3] | 3 [3–3] | 1 [1–1] | 1 [1–1] |

- One app boot serves all repeats; each repeat uses a new Chrome profile, so each cold open really is cold. The first cold open also pays the app's first-ever conversation answer.
- Reopen is Page.reload with the cache allowed (saved key, cached code). A phone tab revisited without a reload may be faster.
- Reconnect = the proxy closes every connection at once. The page marks count from the new connection; the rig wall clock also includes the page noticing the drop and its retry wait. A reconnect asks only for what it missed, so its conversation answer is ~0 KB.
- Resume = the page hidden and the link silent (nothing, not even a close, crosses it) for 75 s, then shown again. "Waited after waking" is the time before the new connection began (the page deciding the old one is dead); the other marks count from that connection.
- Not modelled: packet loss, jitter, TCP slow start. The server side is not slowed, only what crosses the link.
