---
status: active
work_item: 167
---
# Linux launcher icons implementation plan

> **For agentic workers:** Use superpowers:executing-plans to execute this single scoped change.

**Goal:** Ship discoverable, standard-sized Linux launcher icons without changing other platforms or user overrides.

**Architecture:** Save Linux PNGs from the existing approved brand drawing and point only `linux.icon` at that directory. Keep `icon.png` and all Windows, macOS, Android and runtime theme consumers unchanged. No installer migration, cache-clearing hooks, or user-directory edits.

**Tech stack:** Existing Node icon generator, ImageMagick, headless Chrome, electron-builder and Vitest.

## Scope and evidence

The installed 1.3.1 package carries only `hicolor/1024x1024/apps/youcoded.png`; the machine's hicolor index does not list that directory. Removing the obsolete personal icon caused both KDE and Qt lookup to fail. A personal link to the packaged PNG restored lookup (user confirmed). The personal override and the package issue are distinct; this change addresses the latter only.

The installed electron-builder's `convertIcon` returns a single PNG unchanged for Linux `set` output. An explicit directory returns its provided sizes. `LinuxTargetHelper` serves all four configured Linux targets. The freedesktop icon-theme standard prescribes hicolor, and electron-builder documents a size-named PNG directory.

## Task 1: Linux icon set and regression coverage

Files:
- Modify `youcoded/scripts/build-icons.mjs`: save Linux sizes 16, 24, 32, 48, 64, 96, 128, 256, 512 from existing `sizes('app', 'default', ...)`; offer `--linux-only` to regenerate these without touching other platform outputs.
- Modify `youcoded/desktop/electron-builder.yml`: set only `linux.icon: icons` (relative to existing build resources `assets`). Add a WHY comment about hicolor indexing and not changing the shared window PNG.
- Create generated `youcoded/desktop/assets/icons/<size>x<size>.png` for the nine indexed sizes plus 1024. Retain the old 1024px installation path so existing absolute launcher links survive upgrades.
- Modify `youcoded/desktop/tests/app-icons.test.ts`: assert Linux config points to the set, each PNG has the named dimensions, and the actual public `LinuxPackager.resolveIcon` returns all ten expected source paths without fallback. Existing icon tests continue protecting other platforms.
- Modify workspace `docs/build-and-release.md`: document Linux set and Linux-only generation.

Steps:
- [x] Add tests first and run `npx vitest run tests/app-icons.test.ts`; observe the missing Linux setting/set failure.
- [x] Implement config and generator changes with WHY comments. Generate only Linux outputs using `node scripts/build-icons.mjs --linux-only` from the component root.
- [x] Re-run icon tests, including existing runtime icon tests; confirm actual packager output sizes. Check a contact sheet of the generated art.
- [x] Run `bash scripts/verify.sh <absolute component worktree>`. Build isolated Linux package outputs when practical and inspect archive paths without installing or launching them. Verify non-Linux assets/configuration remain unchanged in the diff.
- [x] Obtain fresh code review; resolve findings and repeat affected checks. Final independent review found no blocking defects, including Windows/macOS test portability.
- [ ] Commit explicit paths, push, open app PR, wait for required CI, merge and push (authorized by user). Archive this plan, land workspace docs, close #167 with the app PR reference, and run close-out/cleanup.

## Acceptance

Ten actual PNGs and resolver output agree (nine indexed sizes plus the legacy 1024px path); KDE/Qt can load an isolated hicolor installation; Linux targets use shared standard packaging; other platform icon files and configuration remain unchanged. No claim of having installed on every distro or tested Windows/macOS/Android natively on this Linux host. No release tag or production install is authorized by this merge request.
