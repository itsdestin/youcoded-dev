# Prompt for the other Linux device

Run this as the FIRST message of a brand-new session, with the working directory set to the YouCoded workspace (`youcoded-dev`).

---

Sync the workspace first: `cd <workspace>/youcoded-dev && bash setup.sh`. Then execute the plan at `docs/active/plans/2026-08-23-perf-lab-and-optimization-loop.md` using **superpowers:subagent-driven-development**. Do a pre-flight plan read, create the progress ledger, and run tasks continuously — do not check in with me between tasks.

**Before dispatching Task 1, verify these five host prerequisites and report any that are missing instead of improvising around them:**

1. `which Xvfb xvfb-run` — install with the system's package manager if absent. The plan's Task 0 Step 1 says `sudo pacman -S xorg-server-xvfb`; if this device is not Arch, use its equivalent and tell me the command to run (you cannot sudo).
2. `which google-chrome-stable` — the screenshot pixel-diff engine (Task 11) needs it. No fallback is planned; if it's missing, say so before Task 11.
3. `node -v` — the rig requires **Node 26+** (built-in `WebSocket`, `node:test`).
4. `ls /home/destin/.cache/huggingface/hub/models--ggml-org--models/snapshots/*/tinyllamas/stories260K.gguf` — the toy model the native-session workload uses. **This was downloaded on my other machine and probably does not exist here.** If missing, it is a 1 MB file from the `ggml-org/models` HuggingFace repo — fetch it and place it at that path, or tell me and I'll copy it over.
5. `ls /home/destin/.config/youcoded-dev/engine/b9992-cpu/.complete` — the pre-downloaded CPU llama-server build the fixture hardlinks so the rig never downloads an engine. **Also likely absent here.** If missing, either let a dev instance download it once (`bash scripts/run-dev.sh`, Settings → local engine) or tell me and I'll copy the directory over.

**Also check paths:** the plan hardcodes `/home/destin/youcoded-dev` and `/home/destin/.config/...` throughout. If this device's home or workspace path differs, adapt every hardcoded path consistently and note the substitution in the progress ledger — do not leave a half-substituted script.

**Two places the plan STOPS and waits for me — honor both, do not push past them:**
- **Task 15 Step 4** (Round-0 human gate): after the baseline and ranked findings, present the findings doc and the proposed experiment card list and wait for my approve/veto/reorder. No product code changes before I answer.
- Any `ux-bugfix` screenshot diff during the loop: report the before/after PNG pair and stop.

Phases 0–3 (Tasks 0–16) build the rig and produce the baseline; the loop itself starts only after my Round-0 approval. Product code goes on the `youcoded` branch `perf/optimization-pass` in `worktrees/perf-lab/`; the rig and reports go in the workspace repo `youcoded-dev`. Push both as you go.
