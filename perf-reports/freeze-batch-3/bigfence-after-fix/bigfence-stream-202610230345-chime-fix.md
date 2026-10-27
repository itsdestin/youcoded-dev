# bigfence-stream (chime-fix)

Exploratory, busy-machine. Cells: median (min-max) over rounds. old = candidate A, new = candidate B. `coloured` 1 = the block was drawn with syntax colour, 0 = drawn plain.

### streamLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 26 (0-52) | 113 (64-162) |
| bigfence-code-20000 | none of 2 | 62 (61-63) |
| bigfence-json-700 | 8968 (8968-8968) n=1/2 | 406.5 (379-434) |

### streamLongtaskTotalMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 26 (0-52) | 241 (64-418) |
| bigfence-code-20000 | none of 2 | 62 (61-63) |
| bigfence-json-700 | 64480 (64480-64480) n=1/2 | 30381 (30035-30727) |

### settleLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 2899 (1923-3875) | 0 (0-0) |
| bigfence-code-20000 | none of 2 | 453.5 (447-460) |
| bigfence-json-700 | 9576 (9576-9576) n=1/2 | 225.5 (148-303) |

### scrollLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 0 (0-0) | 0 (0-0) |
| bigfence-code-20000 | none of 2 | 0 (0-0) |
| bigfence-json-700 | 760 (760-760) n=1/2 | 30.5 (0-61) |

### scrollFrameGapMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 30.2 (17.8-42.5) | 17.8 (17.7-17.8) |
| bigfence-code-20000 | none of 2 | 32.5 (20.2-44.8) |
| bigfence-json-700 | 397.4 (397.4-397.4) n=1/2 | 56 (50.3-61.7) |

### typingStreamMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 24.2 (17.1-31.3) | 221.4 (176.5-266.2) |
| bigfence-code-20000 | none of 2 | 366 (277.5-454.4) |
| bigfence-json-700 | 8947.8 (8947.8-8947.8) n=1/2 | 322.5 (248.6-396.3) |

### typingSettleMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 2810.3 (1788.3-3832.2) | 1011.5 (944-1079) |
| bigfence-code-20000 | none of 2 | 63184.9 (56234.9-70134.9) |
| bigfence-json-700 | 26507.3 (26507.3-26507.3) n=1/2 | 21023.5 (13040.2-29006.7) |

### typingScrollMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 5.3 (3.5-7) | 3 (2.9-3) |
| bigfence-code-20000 | none of 2 | 5.4 (2.9-7.8) |
| bigfence-json-700 | none of 2 | 7.5 (3.2-11.8) |

### endToPaintMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 4048.8 (1981.7-6115.8) | 1117.5 (1101-1134) |
| bigfence-code-20000 | none of 2 | 64064 (56319.6-71808.4) |
| bigfence-json-700 | 70954.4 (70954.4-70954.4) n=1/2 | 21363 (13287.2-29438.8) |

### peakPssMb

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 951.4 (907.8-994.9) | 883.7 (880.4-886.9) |
| bigfence-code-20000 | 2072.9 (2058.5-2087.3) | 1324.5 (1293.5-1355.4) |
| bigfence-json-700 | 3013.5 (2913-3113.9) | 1207.7 (1206.6-1208.7) |

### heapMb

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 46.6 (35.6-57.5) | 30.2 (24.8-35.6) |
| bigfence-code-20000 | none of 2 | 51 (51-51) |
| bigfence-json-700 | 631.3 (631.3-631.3) n=1/2 | 35.6 (35.6-35.6) |

### domNodes

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 16326 (16326-16326) | 326 (326-326) |
| bigfence-code-20000 | none of 2 | 326 (326-326) |
| bigfence-json-700 | 245977 (245977-245977) n=1/2 | 330 (330-330) |

### coloured

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 1 (1-1) | 0 (0-0) |
| bigfence-code-20000 | none of 2 | 0 (0-0) |
| bigfence-json-700 | 1 (1-1) n=1/2 | 0 (0-0) |

### status per rung

| rung | old | new |
|---|---|---|
| bigfence-code-2000 | 2x slow | 2x slow |
| bigfence-code-20000 | 2x failed:timeout | 2x slow |
| bigfence-json-700 | 1x slow, 1x failed:memory-limit | 2x slow |
