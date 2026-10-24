# bigfence-stream (desk-bigfence)

Exploratory, busy-machine. Cells: median (min-max) over rounds. old = candidate A, new = candidate B. `coloured` 1 = the block was drawn with syntax colour, 0 = drawn plain.

### streamLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 0 (0-1556) | 111 (110-141) |
| bigfence-code-20000 | 195 (193-213) | 113 (111-127) |
| bigfence-json-700 | 3692 (3481-3902) | 527 (491-576) |

### streamLongtaskTotalMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 0 (0-1556) | 13542 (13421-13637) |
| bigfence-code-20000 | 810 (748-913) | 2394 (2302-2549) |
| bigfence-json-700 | 58771 (56942-59780) | 27355 (27299-28182) |

### settleLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 1510 (0-1533) | 50 (0-51) |
| bigfence-code-20000 | 122818 (122670-125485) | 419 (416-435) |
| bigfence-json-700 | 5438 (5351-5470) | 107 (104-110) |

### scrollLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 0 (0-0) | 0 (0-0) |
| bigfence-code-20000 | 0 (0-0) | 0 (0-0) |
| bigfence-json-700 | 688 (682-691) | 0 (0-0) |

### scrollFrameGapMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 17.6 (17.6-17.7) | 17.8 (17.6-19.1) |
| bigfence-code-20000 | 22.4 (19-25.3) | 23.1 (17.7-23.9) |
| bigfence-json-700 | 352.9 (350.8-355.9) | 57.5 (56.1-58.1) |

### typingStreamMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 11.6 (9.6-12.5) | 61.3 (56.4-74.4) |
| bigfence-code-20000 | 163.8 (153.7-188.9) | 173.2 (136.5-235.5) |
| bigfence-json-700 | 3620 (3329.4-3855.7) | 436.9 (217.2-484.9) |

### typingSettleMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 1320.1 (1311.9-1333.8) | 803.2 (787.8-854.5) |
| bigfence-code-20000 | 122684.1 (122582.8-125396.3) | 50902 (50748-50943.3) |
| bigfence-json-700 | 14789.9 (12987.8-16262.5) | 12718.2 (12701.3-12861.9) |

### typingScrollMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 2.6 (2.5-2.6) | 2.5 (2.5-3.2) |
| bigfence-code-20000 | 8.8 (8.4-30.9) | 77.9 (19.1-95.4) |
| bigfence-json-700 | none of 3 | 2.6 (2.6-25.3) |

### endToPaintMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 1600.4 (1539.3-1617.2) | 1073.5 (1043.3-1086.7) |
| bigfence-code-20000 | 123052.8 (122948.6-125758) | 51158.7 (51030.8-51195.3) |
| bigfence-json-700 | 40214.7 (38857.3-42079) | 13003 (12997.2-13132.7) |

### peakPssMb

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 950.6 (940.7-970.9) | 991.6 (963.9-998.4) |
| bigfence-code-20000 | 2257.2 (2189.2-2350.5) | 1479.8 (1478.2-1519.5) |
| bigfence-json-700 | 2914.6 (2820.8-3011.5) | 1156.2 (1113.2-1203.2) |

### heapMb

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 35.6 (35.6-98.2) | 23.4 (23.4-42.6) |
| bigfence-code-20000 | 242.2 (227.9-272.8) | 51 (51-51) |
| bigfence-json-700 | 326.2 (256.5-414.8) | 35.6 (35.6-35.6) |

### domNodes

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 16326 (16326-16326) | 326 (326-326) |
| bigfence-code-20000 | 160326 (160326-160326) | 326 (326-326) |
| bigfence-json-700 | 245977 (245977-245977) | 330 (330-330) |

### coloured

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-2000 | 1 (1-1) | 0 (0-0) |
| bigfence-code-20000 | 1 (1-1) | 0 (0-0) |
| bigfence-json-700 | 1 (1-1) | 0 (0-0) |

### status per rung

| rung | old | new |
|---|---|---|
| bigfence-code-2000 | 3x slow | 3x slow |
| bigfence-code-20000 | 3x slow | 3x slow |
| bigfence-json-700 | 3x slow | 3x slow |
