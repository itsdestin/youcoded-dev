Harness of review 8 (head ede86e58c vs 49f21d81e). Layout expected: old/ = `git show 49f21d81e:<file>` and new/ = `git show ede86e58c:<file>` for every non-test .ts in desktop/src/main/mesh/store, next to these files
(paths inside are absolute to the reviewer's scratch folder: edit BASE). node_modules must resolve vitest (symlink to desktop/node_modules).
Run: vitest run -c vitest.config.mjs <name>. fuzz7 env: R7_SRC=old|new R7_FROM R7_TO R7_FAULTS=a,b R7_CRASHALL=1 (crashes inside appends) R7_DUMP=<dir> (write the failing disk image) R7_DBG=1 R7_OUT=<file>.
replay.test.ts: R8_DIR=<dump dir> R8_SRC=old|new replays a dumped image on real files. an.py summarises fuzz7 output. probe8 = F1, probe9 = F2, probe10 = F1 variants, probe6/7 = overlay restores.
The in-repo fuzz was run from a scratch copy of desktop/src/main/mesh/store (git archive of ede86e58c) with MESH_STORE_FUZZ=from-to MESH_STORE_FUZZ_OUT=<file>.
