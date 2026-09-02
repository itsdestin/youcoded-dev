---
date: 2026-09-01
status: active
type: investigation
topic: The secret-path hard-deny covers the file tools but not Bash — and there is no sandbox behind the permission engine
---

# `cat ~/.ssh/id_rsa` works through Bash while `Read` refuses it

**Symptom.** The assistant is told it may not open `~/.ssh`, `.env`, `.aws` and the like.
Asking it to read the same file with a shell command succeeds.

**Mechanism.** The sensitive-path hard-deny lives in `tools/guards.ts` (`isSensitivePath`
+ the `.ssh`/`.gnupg`/`.aws` root check) and runs only for path-subject tools. The Bash
tool imports one helper from `guards.ts` — the workspace-root miss hint — and nothing that
inspects the command's paths:
<!-- claim: {"path": "youcoded/desktop/src/main/harness/tools/bash.ts", "contains": "import \\{ workspaceRootMissHint \\} from './guards';"} -->
`guards.ts` describes itself as "honest friction on the file tools, not a sandbox", and
`net-guard.ts` says the same for the web tools. There is no OS boundary underneath:
`rg -i "bwrap|bubblewrap|landlock|seatbelt" desktop/src` → nothing (comments aside).

**Shape, in order.**
1. Extend the sensitive-path deny to shell commands — tokenize the command, resolve
   path-looking arguments against cwd/home, deny on `isSensitivePath`. Honest friction, same
   posture as the file tools; bypassable by construction (`base64`, `$HOME` tricks), so it
   must never be described as a boundary.
2. OS sandboxing behind the permission engine (Landlock on Linux, Seatbelt on macOS, free on
   Android, cosmetic on Windows) — **only after** the design pass in
   `docs/active/investigations/2026-08-09-native-skip-permissions.md` §3d is decided, which
   argues the narrow Bash-only, opt-in slice is the right scope, and that a "scratch
   workspace + diff" may be the better product answer.

History: filed 2026-08-26 (super-agent roadmap step 7).
