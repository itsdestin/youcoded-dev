T21 prototype (read-only). Run order, from this folder, with <out> = any scratch dir:
1. git --git-dir=~/YouCoded/Personal/.youcoded/sync.git log --all --no-renames --raw -r --no-abbrev --diff-filter=AM --format='C %H %an %at' -- Conversations > gitlog.txt   (GIT_OPTIONAL_LOCKS=0)
2. node parse-gitlog.mjs gitlog.txt rows.json ; node sizes.mjs rows.json rows2.json ; node select.mjs rows2.json sel.json
3. node scan-fs.mjs <out>            (live files, mirror, conflict copies)
4. node scan-git.mjs sel.json <out>  (history versions)
5. node refine.mjs <out>/fs-results.jsonl <out>/git-results.jsonl sel.json <out>/refine.json
6. node lastran.mjs <out>/fs-copies.jsonl ; node chat-level.mjs ... ; node byteshape.mjs sel.json ; node nobk-residue.mjs / nativediff.mjs
results/ holds the outputs with chat ids cut to 8 characters and no line contents.
