---
date: 2026-10-14
status: active
type: prototype
topic: A0 spike — bundled musl toolchain (Node, bash, git, rg, node-pty, Claude Code 2.1.300) running inside an Android app sandbox
---

# A0 spike — source

Results and what they mean: `docs/active/plans/2026-10-14-android-clean-rebuild-plan.md` → A0 results.
Binaries are not committed; rebuild them with the steps below (all ran on the z13 laptop).

- `resolve.py` — resolves Alpine `latest-stable` aarch64 package dependencies from APKINDEX
  (run with `main.idx`/`community.idx` in the cwd). Spike set: `nodejs bash git ripgrep strace`.
- `ycshim.c` — the compatibility shim (io_uring → ENOSYS; `#!` scripts exec their interpreter).
  Build: `clang --target=aarch64-alpine-linux-musl --sysroot=<alpine sysroot> -O2 -fPIC -shared -fuse-ld=lld -nostdlib ycshim.c -o libycshim.so -L<sysroot>/usr/lib -lc`,
  then `patchelf --add-needed libycshim.so` on each musl executable.
- node-pty (desktop's `node_modules/node-pty`, 1.2.0-beta.12): `clang++ --target=aarch64-alpine-linux-musl --sysroot=<sysroot> -nostdinc++ -isystem <sysroot>/usr/include/c++/15.2.0 -isystem …/aarch64-alpine-linux-musl -I<sysroot>/usr/include/node -I node-pty/node_modules/node-addon-api -DNAPI_CPP_EXCEPTIONS -fexceptions -O2 -fPIC -shared -std=c++20 -fuse-ld=lld -nostartfiles -nodefaultlibs src/unix/pty.cc -o pty.node -L<stub dir with empty libgcc.a> -L<sysroot>/usr/lib -lstdc++ -lgcc_s -lc`.
  Sysroot packages: `musl-dev libstdc++-dev libstdc++ libgcc gcc linux-headers nodejs-dev musl`.
- Executables: `patchelf --set-interpreter /data/data/<pkg>/files/ld --set-rpath /data/data/<pkg>/files/lib`;
  shipped as `jniLibs/arm64-v8a/lib<name>.so`; libraries as `lib_<sanitized>.so` with a name map
  (`libmap.txt`) that `test.sh` turns into `files/lib/<soname>` symlinks.
- Claude Code: `npm pack @anthropic-ai/claude-code-linux-arm64-musl@<ver>`, shipped as `libclaude.so`,
  run as `files/ld <native-lib-dir>/libclaude.so`.
- DNS in the spike used a test-only patch (`/etc/resolv.conf` → cwd-relative `etc/resolv.conf`
  in musl and libcares); production builds them with an absolute in-app path.
- `app/` — the throwaway app (`MainActivity.java` sits flat in `app/` because the workspace `.gitignore` ignores any `youcoded` path component; it belongs in `src/main/java/com/youcoded/a0spike/`) (Java, AGP 8.7.0, `useLegacyPackaging`); copies `test.sh` from assets
  and runs it, logging to logcat tag `A0`. `t.js` — node-pty test driver.
