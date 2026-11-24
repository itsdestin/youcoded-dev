Harness of review 7. Layout expected: old/ = `git show 22b666f71:<file>` for every non-test .ts in desktop/src/main/mesh/store, new/ = the same files at 49f21d81e, next to these files
(paths inside are absolute to the reviewer's scratch folder: edit BASE). Run: vitest run -c vitest.config.mjs fuzz7 (env R7_SRC=old|new, R7_FROM, R7_TO, R7_FAULTS), b2, probe1..4.
fuzz7 builds with the NEW code and checks with R7_SRC, so both read the same disk image. vfs.ts is reviewer 5's virtual disk (shim).
