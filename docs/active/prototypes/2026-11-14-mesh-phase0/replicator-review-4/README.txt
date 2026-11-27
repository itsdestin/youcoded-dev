Review 4 harness (independent, read-only). All tests drive the REAL replicator through the project's in-memory world (tests/mesh/replicator-world.ts) as transport only; the oracle (oracle.ts, fuzz.test.ts O1-O4) is independent of replicator-model.ts.
Imports use the absolute checkout path D=/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build/youcoded/desktop (edit if moved). Needs a node_modules next to these files (symlink to D/node_modules; never npm install).
Run:   ./run.sh <name-pattern> [--disableConsoleIntercept]       (uses vitest.r4.config.ts; run.sh has a 580 s timeout)
  s2  F1  second rollback onto an existing V2 -> acknowledged lines lost, V2 a mixture          (FAILS today)
  s4  F2  self-fork longer than the step ceiling -> lines acknowledged meanwhile are lost       (FAILS today)
  h1  F3/F4  H1 claim+replay keeps the writer refusing for 80 min (control: 10 min); H2 chatty device without heads freezes the restarted writer
  s3  F5  stale sticky fault: peer frozen on a chat whose writer agrees with it                  (FAILS today)
  h3  F7  announcement flood (NFLOOD=1500)
  h4  forged nak flips the writer's status to diverged
  fuzz   SEED0=<n> NSEEDS=<k> NDEV=2|3 STEPS=24 [DUMP=1] [VERBOSE=1] ./run.sh fuzz --disableConsoleIntercept ; seeds 2061 (F6 deadlock, NDEV=2), 2068 (F5, NDEV=2), 3056 (F5, NDEV=3)
  s1, s1b (product directory), closure : checks that pass (second rollback via the natural order; R3-1/5/7 closure)
Mutation: mut/ is a COPY of src/main/mesh + tests/mesh; mutants.json lists 41 textual mutants; MUTDIR=mut python3 mutate.py part1of2 (a second copy mut2 for part2of2). Results: mutation-results-*.json, mutlog*.txt.
To re-create the mutation copy:  mkdir -p mut/src/main mut/tests; cp -r $D/src/main/mesh mut/src/main/; cp $D/src/main/report-failure.ts $D/src/main/logger.ts mut/src/main/; cp -r $D/tests/mesh $D/tests/__mocks__ mut/tests/; ln -s $D/node_modules mut/node_modules; then add mut/vitest.config.ts (root=mut, include tests/mesh/**/*.test.ts and src/main/mesh/replicator/*.test.ts, alias electron -> tests/__mocks__/electron.ts).
TESTPAT='^(?!.*claiming far more lines schedules a request).*$' excludes the load-flaky test replicator-hostile.test.ts:86 that spuriously "killed" 8 mutants in the first pass (re-run results are the *-rerun.json files).
