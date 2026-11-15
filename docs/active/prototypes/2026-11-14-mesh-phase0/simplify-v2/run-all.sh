#!/usr/bin/env bash
# Reproduces every number in simplify-study-v2.md section C. 4 worker processes at most. Total about 15 minutes.
# Results land in results/*.json (merged over 4 workers). Nothing here touches the app or /opt/YouCoded.
cd "$(dirname "$0")"; mkdir -p results
H=1000000
# ---- chats, simulator #1 (reviewer's, adapted to v2 rules): honest relay
./par.sh check 500000 $((H+0))       hostile  honest > results/chk-hostile-honest-500k.json
./par.sh check 100000 $((H+600000))  poison   honest > results/chk-poison-honest-100k.json
./par.sh check 100000 $((H+800000))  wipe     honest > results/chk-wipe-honest-100k.json
./par.sh check 100000 $((H+1000000)) restore  honest > results/chk-restore-honest-100k.json
./par.sh check 150000 $((H+1200000)) removal  honest > results/chk-removal-honest-150k.json
./par.sh check 50000  $((H+1400000)) calm     honest > results/chk-calm-honest-50k.json
# ---- lying relay (30% and 80%), with poison, wipe, restore, removal mixed in
./par.sh check 100000 $((H+1500000)) hostile  ly30 > results/chk-hostile-ly30-100k.json
./par.sh check 100000 $((H+1700000)) hostile  ly80 > results/chk-hostile-ly80-100k.json
./par.sh check 50000  $((H+1900000)) poison   ly30 > results/chk-poison-ly30-50k.json
./par.sh check 50000  $((H+2000000)) wipe     ly80 > results/chk-wipe-ly80-50k.json
./par.sh check 50000  $((H+2100000)) restore  ly80 > results/chk-restore-ly80-50k.json
./par.sh check 50000  $((H+2200000)) removal  ly30 > results/chk-removal-ly30-50k.json
# ---- mutants: each breaks one rule and the oracle must notice (proves the oracle bites)
NOCOPY=1     ./par.sh check 20000 $((H+3000000)) hostile honest > results/mut-nocopy.json
NOCUT=1      ./par.sh check 20000 $((H+3100000)) removal honest > results/mut-nocut.json
NOOVERRIDE=1 ./par.sh check 20000 $((H+3200000)) poison  honest > results/mut-nooverride.json
NOVACATE=1   ./par.sh check 20000 $((H+3300000)) removal honest > results/mut-novacate.json
NOGAP=1      ./par.sh check 40000 $((H+3400000)) restore ly80   > results/mut-nogap.json
# ---- availability-only rules (safety does not depend on them: the oracle stays green, copies and stale writes change)
NOINORDER=1  ./par.sh check 40000 $((H+3500000)) wipe honest > results/var-noinorder.json
NOCHK=1      ./par.sh check 40000 $((H+3600000)) hostile honest > results/var-nochk.json
NOCACHE=1    ./par.sh check 40000 $((H+3700000)) wipe honest > results/var-nocache.json
OLDTIE=1     ./par.sh check 100000 $((H+0)) hostile honest > results/var-oldtie-100k.json        # old tie-break, first 100k seeds of chk-hostile
./par.sh check 100000 $((H+0)) hostile honest > results/var-newtie-100k.json   # v2 tie-break, the same 100k seeds (fair comparison)
TWOREF=1     ./par.sh check 40000 $((H+3800000)) hostile honest > results/var-tworeferees.json
# ---- chats, simulator #2 (fork of the study's own-sim.mjs, v2 rules)
./par.sh own 500000 $((H+0))       --mode AB --v2 --mix hostile > results/own-hostile-honest-500k.json
./par.sh own 100000 $((H+600000))  --mode AB --v2 --mix poison > results/own-poison-honest-100k.json
./par.sh own 100000 $((H+800000))  --mode AB --v2 --mix wipe > results/own-wipe-honest-100k.json
./par.sh own 100000 $((H+1000000)) --mode AB --v2 --mix restore > results/own-restore-honest-100k.json
./par.sh own 100000 $((H+1200000)) --mode AB --v2 --mix removal > results/own-removal-honest-100k.json
./par.sh own 100000 $((H+1500000)) --mode AB --v2 --mix hostile --lie 0.3 > results/own-hostile-ly30-100k.json
./par.sh own 100000 $((H+1700000)) --mode AB --v2 --mix hostile --lie 0.8 > results/own-hostile-ly80-100k.json
./par.sh own 40000  $((H+1900000)) --mode AB --v2 --mix poison --lie 0.3 > results/own-poison-ly30-40k.json
./par.sh own 40000  $((H+2000000)) --mode AB --v2 --mix wipe --lie 0.8 > results/own-wipe-ly80-40k.json
./par.sh own 40000  $((H+2100000)) --mode AB --v2 --mix restore --lie 0.8 > results/own-restore-ly80-40k.json
./par.sh own 20000  $((H+3000000)) --mode AB --v2 --mix hostile --mutate nofork > results/own-mut-nofork.json
./par.sh own 20000  $((H+3100000)) --mode AB --v2 --mix poison --nooverride > results/own-mut-nooverride.json
./par.sh own 100000 $((H+0))       --mode AB --mix hostile > results/own-oldrules-hostile-100k.json   # the study's own rules, same events, no v2 additions (baseline)
# ---- the reviewer's ORIGINAL simulator, untouched (v1 rules) as a baseline on the same kind of schedules
for m in "hostile honest" "hostile ly80"; do set -- $m; node ../simplify-review/sim.mjs $((H+0)) 50000 $1 $2 > results/orig-reviewer-$1-$2-50k.json; done
POISON=1 node ../simplify-review/sim.mjs $((H+0)) 50000 hostile honest > results/orig-reviewer-poison-50k.json
# ---- removal: 500,000 runs per rule variant and relay behaviour (single process each; fast)
for v in built first study recv; do for r in honest none withhold block collude; do
  node roster-v2.mjs 1 500000 $v $r > results/roster-$v-$r-500k.json
done; done
# ---- cross-check of the removal rule against the REAL roster code (reads the app source, writes nothing there)
HERE=$(pwd); SC=$(mktemp -d)/scen.json
DUMP=$SC DUMPN=3000 node roster-v2.mjs 1 6000 built honest > /dev/null
( cd ../../../../../youcoded/desktop && SCEN=$SC CROSSCHECK_TEST="$HERE/crosscheck/crosscheck.test.ts" npx vitest run --config "$HERE/crosscheck/vitest.config.ts" 2>&1 | grep CROSSCHECK > "$HERE/results/crosscheck-real-roster.txt" )
echo done
python3 build_doc.py   # writes docs/active/investigations/2026-11-14-mesh-phase0/simplify-study-v2.md from results/ + template.md
