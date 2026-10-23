# bigfence-stream (renderer-fixes)

Exploratory, busy-machine. Cells: median (min-max) over rounds. old = candidate A, new = candidate B. `coloured` 1 = the block was drawn with syntax colour, 0 = drawn plain.

### streamLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 864.5 (0-1729) | 144 (140-148) |
| bigfence-code-20000 | none of 2 | 139.5 (139-140) |
| bigfence-json-700 | 3213 (3213-3213) n=1/2 | 500 (438-562) |

### streamLongtaskTotalMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 864.5 (0-1729) | 17801 (17171-18431) |
| bigfence-code-20000 | none of 2 | 2773 (2669-2877) |
| bigfence-json-700 | 57622 (57622-57622) n=1/2 | 30855.5 (30820-30891) |

### settleLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 871 (0-1742) | 26 (0-52) |
| bigfence-code-20000 | none of 2 | 435 (432-438) |
| bigfence-json-700 | 5994 (5994-5994) n=1/2 | 112.5 (111-114) |

### scrollLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 0 (0-0) | 0 (0-0) |
| bigfence-code-20000 | none of 2 | 0 (0-0) |
| bigfence-json-700 | 738 (738-738) n=1/2 | 0 (0-0) |

### scrollFrameGapMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 17.8 (17.8-17.8) | 18.2 (18.1-18.2) |
| bigfence-code-20000 | none of 2 | 49.9 (49.6-50.1) |
| bigfence-json-700 | 385.1 (385.1-385.1) n=1/2 | 51.7 (45.2-58.1) |

### typingStreamMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 20.4 (15.1-25.6) | 155.7 (140.8-170.5) |
| bigfence-code-20000 | none of 2 | 350.8 (348-353.5) |
| bigfence-json-700 | 3128.1 (3128.1-3128.1) n=1/2 | 382.1 (323.2-441) |

### typingSettleMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 1610.1 (1473.8-1746.3) | 768.3 (759.3-777.4) |
| bigfence-code-20000 | none of 2 | 55870.7 (55805.3-55936) |
| bigfence-json-700 | 16927.9 (16927.9-16927.9) n=1/2 | 13765.8 (13073.5-14458.1) |

### typingScrollMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 4.4 (3.1-5.6) | 3.4 (3.1-3.7) |
| bigfence-code-20000 | none of 2 | 141.4 (62.8-220) |
| bigfence-json-700 | none of 2 | 3.1 (3-3.1) |

### endToPaintMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 1784.8 (1778.5-1791) | 1112.2 (1110.5-1113.8) |
| bigfence-code-20000 | none of 2 | 56092.1 (56055.8-56128.4) |
| bigfence-json-700 | 51932.2 (51932.2-51932.2) n=1/2 | 14153.3 (13462.4-14844.1) |

### peakPssMb

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 986.1 (967.3-1004.9) | 1022.4 (1020.3-1024.5) |
| bigfence-code-20000 | 2106.1 (2097.7-2114.5) | 1461.1 (1451.8-1470.4) |
| bigfence-json-700 | 2967.6 (2922.1-3013) | 1278.8 (1232.9-1324.7) |

### heapMb

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 63.7 (54.2-73.1) | 29.5 (23.4-35.6) |
| bigfence-code-20000 | none of 2 | 51 (51-51) |
| bigfence-json-700 | 670.4 (670.4-670.4) n=1/2 | 35.6 (35.6-35.6) |

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
| bigfence-json-700 | 1x slow, 1x failed:timeout | 2x slow |
