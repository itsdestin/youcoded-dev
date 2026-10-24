# bigfence-stream (desk-fixed-big)

Exploratory, busy-machine. Cells: median (min-max) over rounds. old = candidate A, new = candidate B. `coloured` 1 = the block was drawn with syntax colour, 0 = drawn plain.

### streamLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 220.5 (217-224) | 68.5 (60-77) |
| bigfence-json-700 | 3907 (3907-3907) n=1/2 | 366.5 (364-369) |

### streamLongtaskTotalMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 913 (765-1061) | 119 (111-127) |
| bigfence-json-700 | 58679 (58679-58679) n=1/2 | 28661 (27790-29532) |

### settleLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 135476.5 (126665-144288) | 421.5 (420-423) |
| bigfence-json-700 | 5496 (5496-5496) n=1/2 | 110 (108-112) |

### scrollLongtaskMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 0 (0-0) | 0 (0-0) |
| bigfence-json-700 | 682 (682-682) n=1/2 | 36 (0-72) |

### scrollFrameGapMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 19.3 (18.3-20.2) | 22.5 (21.2-23.9) |
| bigfence-json-700 | 350.7 (350.7-350.7) n=1/2 | 57.5 (57.3-57.6) |

### typingStreamMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 167.4 (152.4-182.3) | 156.8 (88.7-224.9) |
| bigfence-json-700 | 3758 (3758-3758) n=1/2 | 235 (232.3-237.6) |

### typingSettleMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 135384 (126570.8-144197.1) | 51339.8 (51269-51410.6) |
| bigfence-json-700 | 15940.9 (15940.9-15940.9) n=1/2 | 12738.6 (12627-12850.1) |

### typingScrollMaxMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 10.5 (10.3-10.7) | 121.3 (83.2-159.4) |
| bigfence-json-700 | none of 2 | 31.2 (19.5-42.9) |

### endToPaintMs

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 135732 (126943.2-144520.7) | 51604.7 (51576.3-51633.1) |
| bigfence-json-700 | 37424 (37424-37424) n=1/2 | 13017.3 (12897.6-13137) |

### peakPssMb

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 2109.4 (2098.4-2120.3) | 1328.8 (1328.4-1329.1) |
| bigfence-json-700 | 3002.6 (2928.6-3076.5) | 1166 (1141.9-1190) |

### heapMb

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 229.4 (202.2-256.5) | 51 (51-51) |
| bigfence-json-700 | 560.8 (560.8-560.8) n=1/2 | 35.6 (35.6-35.6) |

### domNodes

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 160326 (160326-160326) | 326 (326-326) |
| bigfence-json-700 | 245977 (245977-245977) n=1/2 | 330 (330-330) |

### coloured

| rung | old median (min-max) | new median (min-max) |
|---|---|---|
| bigfence-code-20000 | 1 (1-1) | 0 (0-0) |
| bigfence-json-700 | 1 (1-1) n=1/2 | 0 (0-0) |

### status per rung

| rung | old | new |
|---|---|---|
| bigfence-code-20000 | 2x slow | 2x slow |
| bigfence-json-700 | 1x slow, 1x failed:memory-limit | 2x slow |
