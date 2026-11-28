#!/bin/bash
# Engine speed tests against a SEPARATE engine copy on port 9990 — never the live app's engine (9920).
# WHY this exists: three sessions (2026-09-05, 11-08, 11-13) each rebuilt these from memory in a temp
# folder that the next reboot wiped; the 11-13 rebuild cost a 35-minute wasted run (prompt length varied
# with the label, and a reused HTTP socket hung up after a long read). Both are fixed in these copies.
#
#   run.sh pileup <models-dir> <model-name> <label>=<engine-dir>[,ENV=VAL…] …
#       e.g. run.sh pileup ~/.cache/llama.cpp Qwen3.8-27B-UD-Q8_K_XL vulkan=$V rocm=$R lt1=$L,ROCBLAS_USE_HIPBLASLT=1
#   run.sh slot-save <engine-dir> <model.gguf> <words> <slot-dir-on-a-real-disk>
#       (4000 words ≈ 27k tokens; the slot file is 2-3 GB at that length and is deleted afterwards)
# Results go to stdout; engine logs to $OUT (default: the current directory).
set -u
HERE=$(cd "$(dirname "$0")" && pwd); OUT=${OUT:-$PWD}; PORT=${PORT:-9990}
stop() { for c in $(pgrep -P "$1"); do kill "$c" 2>/dev/null; done; kill "$1" 2>/dev/null; wait "$1" 2>/dev/null; sleep 3; }
case ${1:-} in
  pileup)
    DIR=$2; M=$3; shift 3
    printf '[*]\nctx-size = 65536\n' > "$OUT/preset.ini"
    for spec in "$@"; do
      label=${spec%%=*}; rest=${spec#*=}; E=${rest%%,*}; extra=$( [ "$rest" = "$E" ] || echo "${rest#*,}" | tr ',' ' ')
      # The app's own command line (router mode, 4 slots, no idle-slot cache).
      env LD_LIBRARY_PATH="$E" $extra "$E/llama-server" --host 127.0.0.1 --port "$PORT" --no-webui --jinja --no-cache-idle-slots --spec-default \
        --models-dir "$DIR" --models-preset "$OUT/preset.ini" --models-max 1 > "$OUT/pileup-$M-$label.log" 2>&1 &
      P=$!; echo "== $M $label (load $(cut -d' ' -f1 /proc/loadavg))"
      timeout 2400 node "$HERE/pileup.mjs" "$PORT" "$label" "$M"; stop $P
    done;;
  slot-save)
    E=$2; M=$3; N=$4; D=$5/slot-save-test; mkdir -p "$D"
    for phase in save restore; do
      LD_LIBRARY_PATH="$E" "$E/llama-server" --host 127.0.0.1 --port "$PORT" --no-webui --jinja --no-cache-idle-slots -m "$M" -c 65536 -np 4 --kv-unified \
        --slot-save-path "$D" > "$OUT/slot-save-$phase.log" 2>&1 &
      P=$!; echo "== $phase (load $(cut -d' ' -f1 /proc/loadavg))"
      node "$HERE/slot-save.mjs" "$PORT" "$phase" "$N" "$D"; stop $P
    done
    rm -f "$D/chat.bin"; rmdir "$D";;
  *) sed -n 2,13p "$0";;
esac
