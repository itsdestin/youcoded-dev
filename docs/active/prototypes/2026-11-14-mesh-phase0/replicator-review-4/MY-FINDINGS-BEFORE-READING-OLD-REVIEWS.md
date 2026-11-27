(written before reading docs/active/reviews/*review-1..3)
F1 quiet loss: selfForkNow copy loop appends V's newer lines on top of whatever V2 already holds (V2 id is the same for the same p), no check that V2's first lines equal V's -> second rollback to same backup: 3 acked lines unfindable, V2 = mixture. s2.test.ts
F2 hostile roster device freezes writer: claim of more lines + replay of any genuine old batch each <10 min resets claimSince -> writer refuses for hours (control without replay recovers at 10 min). h1.test.ts
F3 hostile device sends any frame but no heads -> restarted writer refuses forever (waiting-for-peers). h1 H2
F4 unbounded announcements: roster device mints any number of new root versions: 1500 -> 7.5k store files, 3k replicator files. h3.test.ts
F5 stale sticky fault: peer told second history; writer never had/loses it; peer frozen forever on a chat whose writer agrees with it (named diverged). s3.test.ts, fuzz seeds 2068,3056
F6 deadlock after repeated restores: writer retired-recopy forever, peer diverged (fuzz seed 2061)
