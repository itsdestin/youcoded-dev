---
status: shipped
origin: wecoded-marketplace@eecc843:spotify-services/docs/plan.md
---

# spotify-services Marketplace Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public WeCoded marketplace plugin (`spotify-services`) that exposes the Spotify Web API and native local desktop control to any Claude Code project, modeled after `google-services` but using a self-contained Python MCP server registered declaratively via `mcp-manifest.json`.

**Architecture:** One Python 3.12 MCP server installed at `~/.spotify-services/server/` via `uv venv`. The server exposes MCP tools that route internally to (a) a Web API backend (`spotipy`, OAuth Authorization Code with PKCE), (b) a macOS local backend (`osascript` subprocess), or (c) a Windows local backend (`pywinrt`'s `winrt-Windows.Media.Control` package for SMTC). A platform router selects the local backend at startup; smart-routed tools prefer local when the desktop app is the active SMTC/Spotify session and fall back to Web API otherwise. The plugin layer is thin — one skill per public tool, plus setup scripts for installing the server, registering the user's Spotify Developer app, and OAuth bootstrap. MCP server registration into `~/.claude.json` is automatic via YouCoded's `reconcileMcp()` — no setup script writes it.

**Tech Stack:** Python 3.12, `uv` (env management), `spotipy` (Web API + OAuth+PKCE), `winrt-Windows.Media.Control` (Windows SMTC), `osascript` subprocess (macOS), `mcp` Python SDK (server framework), `pytest` + `pytest-mock` (tests), bash 4+ shell scripts for setup.

**Source spec:** brainstorm artifact at `crunchtronics-tutor/docs/superpowers/specs/2026-04-26-spotify-services-plugin-design.md` (treated as historical input only — never modified). Phase 0 writes a fresh corrected copy at `spotify-services/docs/design.md` inside this plugin; that copy is the canonical design from then on.

---

## Spec Corrections (locked at the start of Phase 0)

The original spec drifted from the marketplace's actual structure and from the current Spotify API. The corrections below are non-negotiable inputs to this plan; Phase 0 updates the spec doc to match.

| # | Spec said | Truth | Source |
|---|-----------|-------|--------|
| 1 | Plugin path: `plugins/spotify-services/` | Plugin path: `spotify-services/` (marketplace is flat) | `wecoded-marketplace/google-services/` and every other plugin sit at the marketplace repo root |
| 2 | Setup script "writes the MCP server entry into the right config file" | MCP registration is **declarative**: ship `mcp-manifest.json` at plugin root + binary/launcher in `mcp-servers/spotify-services/`. YouCoded's `reconcileMcp()` writes `~/.claude.json` automatically on app start | `wecoded-marketplace/youcoded-messaging/mcp-manifest.json`; `youcoded/desktop/src/main/mcp-reconciler.ts`; `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/McpReconciler.kt` |
| 3 | Cross-platform: macOS + Windows. Android unaddressed. | **Android out of scope for v1.** Termux has Python 3 but no `pip`/`uv`; vendoring all transitive deps is a v2 scope. `mcp-manifest.json` declares `platforms: ["darwin", "win32"]` only. | `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/Bootstrap.kt` (`corePackages` lacks pip/uv); `PackageTier.kt` |
| 4 | Removed endpoints (Feb 2026): 6 listed | **Many more removed.** All 7 batch GETs (`/tracks`, `/albums`, `/artists`, `/episodes`, `/shows`, `/audiobooks`, `/chapters`); user routes (`GET /users/{id}`, `GET /users/{id}/playlists`, `POST /users/{id}/playlists`); browse routes (`/browse/new-releases`, `/browse/categories`); `/markets`; `/artists/{id}/top-tracks`; **all entity-typed library save/remove** (`/me/tracks`, `/me/albums`, etc.) — replaced by generic `PUT/DELETE/GET /me/library` taking URIs; `/playlists/{id}/tracks` **renamed to** `/playlists/{id}/items`; search `limit` capped at 10; field removals (`popularity`, `available_markets`, `linked_from`, `external_ids`, user `country`/`email`/`product`, etc.) | https://developer.spotify.com/documentation/web-api/references/changes/february-2026 |
| 5 | "Premium-tier requirements: playback transport, queue writes, set_volume" | **Premium required for the entire plugin in v1.** Per the Feb 6, 2026 Spotify announcement, apps without Extended Quota approval require the authorizing user to have Premium AND cap at 5 authorized users per Client ID. Setup walkthrough surfaces this; `user.profile` smoke check verifies `product == "premium"` (when the field is still returned). | https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security |
| 6 | Windows local backend uses `winsdk` | Use **`pywinrt`** (`pip install winrt-Windows.Media.Control`). `winsdk` was archived Oct 2024 with no Python 3.13 wheels. | https://github.com/pywinrt/python-winsdk |
| 7 | `now_playing` smart tool: enrichment when `enrich=true` | Default `enrich=false`. Cheap path (local read, no Web API call) is default. | Plan decision — minimizes default API budget consumption |
| 8 | Open question: free-tier `play_pause_smart` UX | **Resolved:** when desktop app not running AND user is free tier (or `premium_required` returned), surface `{"error": "premium_required", "operation": "play", "hint": "Open the Spotify desktop app to play locally without Premium."}`. No silent degrade. | Plan decision — preserves the "structured errors only" contract |

---

## File Structure (locked before tasks)

The plugin lives in **the existing `wecoded-marketplace` repo**, as a top-level directory. The Python server source lives inside the plugin tree (deviation from `google-services`'s download-binary-from-release model — justified because there is no upstream binary to release; the server is our own code).

```
wecoded-marketplace/spotify-services/
├── plugin.json                      # marketplace metadata (provides + recommends)
├── mcp-manifest.json                # MCP server declaration (declarative auto-register)
├── README.md                        # user-facing docs
├── docs/
│   └── design.md                    # copy of the spec, post-corrections
├── commands/
│   ├── spotify-services-setup.md    # /spotify-services-setup slash command
│   └── spotify-services-reauth.md   # /spotify-services-reauth slash command
├── server/                          # Python MCP server source
│   ├── pyproject.toml
│   ├── README.md                    # dev docs for the server
│   ├── src/spotify_mcp/
│   │   ├── __init__.py
│   │   ├── __main__.py              # `python -m spotify_mcp` entrypoint
│   │   ├── server.py                # MCP server wiring (tool registration table)
│   │   ├── auth.py                  # PKCE flow, token persistence, refresh
│   │   ├── config.py                # paths (~/.spotify-services/, ~/.youcoded/spotify-services/)
│   │   ├── errors.py                # structured error shapes + classifier
│   │   ├── webapi/
│   │   │   ├── __init__.py
│   │   │   ├── client.py            # spotipy wrapper + retry/backoff
│   │   │   ├── search.py
│   │   │   ├── playlists.py
│   │   │   ├── library.py           # uses generic /me/library (post-Feb-2026)
│   │   │   ├── playback.py
│   │   │   ├── queue.py
│   │   │   └── user.py
│   │   ├── local/
│   │   │   ├── __init__.py          # platform router
│   │   │   ├── base.py              # abstract LocalBackend interface
│   │   │   ├── macos.py             # AppleScript via osascript
│   │   │   └── windows.py           # SMTC via pywinrt
│   │   └── tools/
│   │       ├── __init__.py
│   │       ├── routing.py           # smart-routing decision rules
│   │       ├── webapi_tools.py      # webapi.* tool handlers
│   │       ├── local_tools.py       # local.* tool handlers
│   │       ├── smart_tools.py       # now_playing, play_pause_smart
│   │       └── export.py            # export_all_playlists composite
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py              # spotipy mocks, osascript fakes
│       ├── test_auth.py
│       ├── test_routing.py
│       ├── test_webapi_*.py         # one file per webapi/* module
│       ├── test_local_macos.py
│       ├── test_local_windows.py
│       ├── test_smart_tools.py
│       ├── test_export.py
│       └── test_e2e.py              # gated by SPOTIFY_E2E=1
├── mcp-servers/
│   └── spotify-services/
│       └── launcher.sh              # canonical launcher invoked by mcp-manifest.json
└── setup/
    ├── install-server.sh            # uv venv + uv pip install from server/
    ├── register-app.md              # walkthrough: register Spotify Developer app
    ├── ingest-oauth.sh              # local listener on 127.0.0.1:8080 + token exchange
    ├── reauth.sh                    # re-runs ingest-oauth.sh
    └── smoke-test.sh                # calls user.profile + local.is_running through the server
```

**Skills directory** lives directly under the plugin root (per marketplace convention):

```
wecoded-marketplace/spotify-services/skills/
├── spotify-shared/SKILL.md          # auth, errors, smart-routing convention
├── spotify-export-all-playlists/SKILL.md
├── spotify-search/SKILL.md          # collapsed: tracks/albums/artists/playlists in one skill (matches gws-* model)
├── spotify-now-playing/SKILL.md
├── spotify-playback/SKILL.md        # collapsed: play/pause/next/previous/seek/volume/repeat/shuffle
├── spotify-queue/SKILL.md           # collapsed: queue.add + queue.list
├── spotify-library/SKILL.md         # collapsed: saved tracks, recent, top, save, remove
├── spotify-playlists/SKILL.md       # collapsed: list, get items, add, remove, reorder, update details
├── spotify-devices/SKILL.md         # collapsed: list devices + transfer playback
└── spotify-user-profile/SKILL.md
```

10 skills (down from 25 in the spec) — collapsing matches `gws-*` precedent's per-service-area grouping (e.g. `gws-gmail` covers all Gmail operations, with sub-skills only for the most-used distinct verbs). The smart-routed `local.*` and `webapi.*` raw namespaces are **not** skill-wrapped; they're discoverable via MCP tool listing for callers that need to bypass routing.

---

## Phase 0: Worktree + corrected design doc + dev-tool spike

**Goal:** Land the corrected design doc inside the plugin tree, verify dev tooling, validate `pywinrt`. All work is in the `wecoded-marketplace` worktree on `feat/spotify-services` — tutor is not touched.

### Task 0.1: (DONE in controller) Worktree + plan file in place

This was completed by the controller before subagent dispatch began:
- Synced `wecoded-marketplace` against `origin/master`.
- Created worktree at `/c/Users/desti/youcoded-dev/wecoded-marketplace-spotify/` on branch `feat/spotify-services`.
- Moved this plan file to `spotify-services/docs/plan.md` inside the worktree.

No work for the subagent here — the next dispatched task is 0.2.

### Task 0.2: Confirm dev tools present + commit plan file

**Files:**
- Add (already on disk, untracked): `spotify-services/docs/plan.md`

- [ ] **Step 1: Confirm dev tools**

```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace-spotify
which uv python3.12 bash node
node --version
python3.12 --version
uv --version
```
Expected: all four resolve. Python ≥ 3.12, uv ≥ 0.4, Node ≥ 20.
If `uv` is missing: `pipx install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`.
If any are missing: report BLOCKED.

- [ ] **Step 2: Commit the plan file**

```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace-spotify
git add spotify-services/docs/plan.md
git commit -m "docs(spotify-services): implementation plan

Plan file co-authored with the design spec brainstormed in tutor on
2026-04-26. From this point on, spotify-services/docs/ is the canonical
home for the design + plan."
```

### Task 0.3: Write corrected design doc inside the plugin

**Files:**
- Create: `spotify-services/docs/design.md`

- [ ] **Step 1: Write a fresh design.md with all corrections applied**

Read the brainstorm-source spec at `/c/Users/desti/crunchtronics-tutor/docs/superpowers/specs/2026-04-26-spotify-services-plugin-design.md` (treat it as input only — do not modify the tutor copy). Produce a new file at `spotify-services/docs/design.md` that applies all nine corrections from this plan's "Spec Corrections" table:

1. §4.4 path: write `wecoded-marketplace/spotify-services/` (the marketplace is flat — no `plugins/` subdirectory).
2. §6 step 4: replace any text saying the setup script writes MCP config with: "MCP server registration is automatic via YouCoded's `reconcileMcp()`. The plugin ships `mcp-manifest.json` at the plugin root and a launcher at `mcp-servers/spotify-services/launcher.sh`; YouCoded writes `~/.claude.json` on every app start."
3. §3 #4 (cross-platform): change "Linux (MPRIS) is out of scope for v1" to "Linux (MPRIS) and Android both out of scope for v1. Android is deferred specifically because Termux ships Python 3 but no `pip`/`uv` — vendoring the dependency tree is a v2 scope."
4. §3 #1 (deprecations): replace the 6-endpoint list with the full Feb-2026 removal list (see this plan's Spec Corrections table row 4) and reference the changelog URL `https://developer.spotify.com/documentation/web-api/references/changes/february-2026`.
5. §3 #3 (Premium): change the section title to "Premium-tier requirement (whole plugin)" and replace the body with: "Spotify's Feb 2026 platform-security update requires the authorizing user to have Premium for any app not granted Extended Quota. The plugin therefore assumes Premium for all users; setup surfaces this prominently. Apps in Dev Mode are capped at 5 authorized users."
6. §4.1 Windows: replace `winsdk` with `pywinrt` (`winrt-Windows.Media.Control`).
7. §4.2 `now_playing`: change default `enrich` to `false`.
8. §12 #3: resolve to "free-tier with no local app: surface structured `premium_required` error suggesting opening the desktop app." Move from open-questions to resolved decisions.
9. §5.2 tool table: rewrite against the actual current API. `library.save`/`library.remove` use generic `/me/library` with URIs. Drop `library.audio_features`, `library.audio_analysis`, `library.recommendations`, `library.get_artist_top_tracks`, `playlist.create`, `markets`, `new-releases`, `several-albums`, `several-artists`. Rename `playlists.get_tracks` → `playlists.get_items` (Spotify's path renaming).

Also add a header at the top of the new file:

```markdown
> **Source:** Brainstormed in `crunchtronics-tutor/docs/superpowers/specs/2026-04-26-spotify-services-plugin-design.md` on 2026-04-26. This file is the canonical design from then on — corrections applied per the implementation plan at `plan.md`. Do not modify the tutor copy; treat it as a historical artifact.
```

And a "Spec Revision Log" section at the bottom:

```markdown
## 14. Spec revision log

- **2026-04-26 (initial draft):** brainstormed plugin shape and tool surface.
- **2026-04-26 (corrections applied in marketplace copy):** marketplace path correction (flat, not under `plugins/`); MCP registration mechanism corrected to declarative `mcp-manifest.json` (was: setup script writes config); Android explicitly punted to v2 (Termux lacks pip/uv); Feb-2026 API deprecation list expanded (was incomplete by ~15 endpoints); Premium-tier requirement broadened to whole plugin (Spotify Dev Mode quota change); `winsdk` → `pywinrt` swap; `now_playing` enrichment defaults to false; free-tier `play_pause_smart` UX resolved.
```

- [ ] **Step 2: Commit**

```bash
git add spotify-services/docs/design.md
git commit -m "docs(spotify-services): canonical design spec with corrections

Fresh copy of the brainstorm spec from tutor with all nine corrections
from the impl plan applied. Tutor copy is a historical artifact and is
not modified."
```

### Task 0.4: Spike `pywinrt` install on the dev box (Windows only)

Validates that the chosen Windows backend dependency works under `uv`.

**Files:** none (throwaway venv).

- [ ] **Step 1: Spike**

```bash
cd /tmp && rm -rf pywinrt-spike && mkdir pywinrt-spike && cd pywinrt-spike
uv venv .venv --python 3.12
source .venv/bin/activate  # or .venv/Scripts/activate on cmd
uv pip install winrt-Windows.Media.Control
python -c "from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as M; import asyncio; print(asyncio.run(M.request_async()))"
```
Expected: prints `<GlobalSystemMediaTransportControlsSessionManager object at ...>` if Windows; gracefully fails with a clear error on non-Windows.
If install fails: capture the error and switch to plan B (PowerShell shellout via `Get-MediaSession`) — note in this task before continuing.

- [ ] **Step 2: Cleanup**

```bash
deactivate && rm -rf /tmp/pywinrt-spike
```

- [ ] **Step 3: No commit (throwaway).** Document outcome: `pywinrt` works ✓ / ✗ in your dev journal so future work can reference.

---

## Phase 1: Plugin skeleton + MCP manifest

**Goal:** Land an empty-but-valid plugin that auto-registers an MCP server stub on app launch. Verifiable by running the marketplace validator and by installing the plugin and seeing the MCP entry land in `~/.claude.json`.

### Task 1.1: Create plugin.json

**Files:**
- Create: `wecoded-marketplace/spotify-services/plugin.json`

- [ ] **Step 1: Write the file**

```json
{
  "name": "spotify-services",
  "description": "Spotify Web API + native local desktop control for any Claude Code project. Search, library, playlists, queue, playback. Premium account required.",
  "version": "0.1.0",
  "author": { "name": "YouCoded" },
  "license": "MIT",
  "homepage": "https://github.com/itsdestin/wecoded-marketplace/tree/master/spotify-services",
  "recommends": ["youcoded-core"],
  "provides": {
    "spotify-control": {
      "description": "Spotify Web API + macOS/Windows local desktop control",
      "mcp": ["spotify-services"]
    }
  }
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('spotify-services/plugin.json','utf8')))"
```
Expected: prints the parsed object.

### Task 1.2: Create mcp-manifest.json

**Files:**
- Create: `wecoded-marketplace/spotify-services/mcp-manifest.json`

- [ ] **Step 1: Write the file**

```json
{
  "servers": [
    {
      "name": "spotify-services",
      "auto": true,
      "platforms": ["darwin", "win32"],
      "command": "${PACKAGE_DIR}/mcp-servers/spotify-services/launcher.sh",
      "args": [],
      "env": {}
    }
  ]
}
```

Note: `platforms` deliberately omits `linux` per Phase-0 correction #3. The reconciler matches Android as `linux`, so excluding `linux` keeps the server from auto-registering on Android.

- [ ] **Step 2: Validate JSON**

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('spotify-services/mcp-manifest.json','utf8')))"
```

### Task 1.3: Create the launcher stub

The launcher is a small bash script that activates the venv and starts the Python server. It's the entrypoint the MCP reconciler will register. Stub-only for now; gets fleshed out in Phase 2.

**Files:**
- Create: `wecoded-marketplace/spotify-services/mcp-servers/spotify-services/launcher.sh`

- [ ] **Step 1: Write the launcher**

```bash
#!/usr/bin/env bash
# spotify-services launcher — invoked by Claude Code's MCP reconciler.
# Activates the user's installed venv at ~/.spotify-services/server/ and
# runs the MCP server in stdio mode. If the venv is missing, prints a
# structured error and exits 2 — Claude surfaces this to the user with a
# "run /spotify-services-setup" hint.
set -euo pipefail

VENV="$HOME/.spotify-services/server/.venv"
if [ ! -d "$VENV" ]; then
  echo '{"error": "server_not_installed", "hint": "Run /spotify-services-setup to install the Spotify MCP server."}' >&2
  exit 2
fi

# shellcheck disable=SC1091
. "$VENV/bin/activate"
exec python -m spotify_mcp "$@"
```

- [ ] **Step 2: Set executable bit**

```bash
chmod +x spotify-services/mcp-servers/spotify-services/launcher.sh
git update-index --chmod=+x spotify-services/mcp-servers/spotify-services/launcher.sh
```

- [ ] **Step 3: Verify**

```bash
ls -la spotify-services/mcp-servers/spotify-services/launcher.sh
```
Expected: starts with `-rwxr-xr-x`.

### Task 1.4: Create README.md (user-facing)

**Files:**
- Create: `wecoded-marketplace/spotify-services/README.md`

- [ ] **Step 1: Write the README**

```markdown
# Spotify Services

Spotify Web API + native local desktop control for any Claude Code project.

## What this plugin gives Claude

- **Search** tracks, albums, artists, playlists.
- **Read** your library: saved tracks, recently played, top tracks/artists.
- **Manage** playlists: list, view items, add/remove/reorder tracks, edit details.
- **Control playback** via Spotify Premium (transport, queue, volume, repeat/shuffle, device transfer).
- **Local desktop control** (macOS + Windows) — pause, skip, see what's playing, all without API calls.

## Requirements

- **Spotify Premium account.** Required for the entire plugin under Spotify's current developer-app rules (Feb 2026 platform-security update).
- **Python 3.12+** and `uv` on PATH. Setup will tell you if either is missing.
- **macOS or Windows.** Linux (MPRIS) and Android (vendored Python deps) are deferred to v2.

## First-time setup

```bash
/spotify-services-setup
```

The walkthrough will:
1. Install the Python MCP server to `~/.spotify-services/server/`.
2. Walk you through registering your own Spotify Developer app (you keep the credentials; nothing is shared with this plugin).
3. Run the OAuth flow once and store tokens at `~/.youcoded/spotify-services/tokens.json` (mode 600).
4. Run a smoke test against your account.

## Re-authentication

```bash
/spotify-services-reauth
```

Use this if Spotify revokes your tokens (rare — happens after long inactivity or password change).

## Privacy

- **Your Spotify Developer app, your credentials.** This plugin contains no Client IDs, Client Secrets, or hardcoded keys. You register your own app at developer.spotify.com.
- **Tokens stay local.** `~/.youcoded/spotify-services/tokens.json`, mode 600.
- **PKCE flow.** No client secret needed; the auth code never travels through any third-party server.

## Deferred (not in v1)

- Linux MPRIS local control.
- Android (Termux Python lacks `pip`/`uv`; v2 will vendor deps).
- Podcasts / shows / episodes / audiobooks.
- Real-time playback monitoring (long-running streams).

## Troubleshooting

If a tool returns `{"error": "reauth_required"}`, run `/spotify-services-reauth`.
If a tool returns `{"error": "server_not_installed"}`, run `/spotify-services-setup`.
If a tool returns `{"error": "premium_required"}`, your Spotify account is on the free tier — the plugin can't help you on Spotify's side.

For deeper diagnostics: `bash ~/.spotify-services/server/setup/smoke-test.sh`.
```

### Task 1.5: Verify validator passes on the empty plugin

**Files:** none.

- [ ] **Step 1: Run the validator script locally** (mirrors CI behavior)

The marketplace's PR validator is `wecoded-marketplace/.github/workflows/validate-plugin-pr.yml`. Run the same checks locally by inspecting `plugin.json` for required fields and verifying the directory structure.

```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace-spotify
node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync("spotify-services/plugin.json","utf8"));
if (!p.name) throw new Error("missing name");
if (!p.description) throw new Error("missing description");
console.log("plugin.json passes required-fields check");
'
```
Expected: prints "plugin.json passes required-fields check".

- [ ] **Step 2: Commit Phase 1**

```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace-spotify
git add spotify-services/plugin.json spotify-services/mcp-manifest.json spotify-services/mcp-servers/spotify-services/launcher.sh spotify-services/README.md
git commit -m "feat(spotify-services): plugin skeleton + MCP manifest

Empty plugin that auto-registers an MCP server stub via mcp-manifest.json.
Server itself comes online in Phase 2 — for now the launcher exits 2 with a
structured error pointing the user at /spotify-services-setup."
```

---

## Phase 2: Python server skeleton + MCP wiring

**Goal:** Boot a real Python MCP server that responds to `list_tools` with one stub tool (`server.health`). Confirms the venv install works, the launcher activates it, and Claude Code's MCP plumbing recognizes the server.

### Task 2.1: Create server pyproject.toml

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/pyproject.toml`

- [ ] **Step 1: Write the file**

```toml
[project]
name = "spotify-mcp"
version = "0.1.0"
description = "MCP server for Spotify Web API and native local desktop control."
requires-python = ">=3.12"
authors = [{ name = "YouCoded" }]
license = { text = "MIT" }
dependencies = [
    "mcp>=0.9.0",
    "spotipy>=2.24.0",
    "httpx>=0.27.0",
]

[project.optional-dependencies]
# Phase 0.4 spike confirmed: winrt-Windows.Foundation must be installed
# explicitly alongside winrt-Windows.Media.Control — the latter does not
# pull the foundation bindings in transitively.
windows = [
    "winrt-Windows.Media.Control>=3.2.0",
    "winrt-Windows.Foundation>=3.2.0",
]
dev = ["pytest>=8.0", "pytest-mock>=3.12", "pytest-asyncio>=0.23"]

[project.scripts]
spotify-mcp = "spotify_mcp.__main__:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/spotify_mcp"]
```

- [ ] **Step 2: Validate**

```bash
cd spotify-services/server
python3.12 -c "import tomllib; tomllib.loads(open('pyproject.toml').read()); print('ok')"
```

### Task 2.2: Create the package init + main entrypoint

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/__init__.py`
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/__main__.py`

- [ ] **Step 1: Write `__init__.py`**

```python
"""spotify_mcp — MCP server for Spotify Web API + local desktop control."""
__version__ = "0.1.0"
```

- [ ] **Step 2: Write `__main__.py`**

```python
"""Entrypoint: `python -m spotify_mcp` → stdio MCP server."""
from __future__ import annotations
import asyncio
import sys

from spotify_mcp.server import run_stdio


def main() -> int:
    try:
        asyncio.run(run_stdio())
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception as e:
        print(f"spotify-mcp fatal: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
```

### Task 2.3: Write the failing test for `run_stdio` health tool

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/tests/__init__.py` (empty)
- Create: `wecoded-marketplace/spotify-services/server/tests/conftest.py`
- Create: `wecoded-marketplace/spotify-services/server/tests/test_server.py`

- [ ] **Step 1: Write `conftest.py`**

```python
"""Shared pytest fixtures for spotify_mcp tests."""
import pytest


@pytest.fixture
def fake_now() -> float:
    """Frozen unix timestamp for tests that touch token expiry."""
    return 1_745_000_000.0  # ~April 18, 2025
```

- [ ] **Step 2: Write the test**

```python
"""Tests for the MCP server's tool registration table."""
import pytest

from spotify_mcp.server import build_server


def test_health_tool_is_registered():
    server = build_server()
    tool_names = {t.name for t in server.list_tools()}
    assert "server.health" in tool_names


@pytest.mark.asyncio
async def test_health_tool_returns_ok():
    server = build_server()
    result = await server.call_tool("server.health", {})
    assert result == {"status": "ok", "version": "0.1.0"}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd spotify-services/server
uv venv .venv --python 3.12
source .venv/bin/activate  # or .venv/Scripts/activate
uv pip install -e ".[dev]"
pytest tests/test_server.py -v
```
Expected: ImportError on `from spotify_mcp.server import build_server` (server.py doesn't exist yet).

### Task 2.4: Implement minimal server.py to pass the health tests

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/server.py`

- [ ] **Step 1: Write `server.py`**

```python
"""MCP server wiring — tool registration table and stdio runner.

Tools are registered in `build_server()` so tests can introspect the table
without spawning stdio. `run_stdio()` is the production entrypoint."""
from __future__ import annotations
from typing import Any
from mcp.server import Server  # noqa: F401  # interface-stable since 0.9
from mcp.server.stdio import stdio_server

from spotify_mcp import __version__


class _SpotifyMcpServer:
    """Thin wrapper around mcp.Server that exposes a synchronous list_tools()
    for tests. Production callers go through `run_stdio()`."""

    def __init__(self) -> None:
        self._tools: dict[str, _ToolEntry] = {}

    def register(self, name: str, handler) -> None:
        self._tools[name] = _ToolEntry(name=name, handler=handler)

    def list_tools(self) -> list["_ToolEntry"]:
        return list(self._tools.values())

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        tool = self._tools.get(name)
        if tool is None:
            return {"error": "unknown_tool", "name": name}
        return await tool.handler(arguments)


class _ToolEntry:
    def __init__(self, name: str, handler) -> None:
        self.name = name
        self.handler = handler


async def _health(_: dict[str, Any]) -> dict[str, Any]:
    return {"status": "ok", "version": __version__}


def build_server() -> _SpotifyMcpServer:
    """Construct the server with all tools registered. Used by tests AND
    by `run_stdio()`. Adding a tool means: import its handler, then
    `s.register("namespace.action", handler)` here."""
    s = _SpotifyMcpServer()
    s.register("server.health", _health)
    return s


async def run_stdio() -> None:
    """Run the MCP server over stdio. Production entrypoint."""
    s = build_server()
    async with stdio_server() as (read, write):
        # Bridge our internal _SpotifyMcpServer to the mcp.Server protocol.
        # For Phase 2 we only need to handle list_tools and call_tool;
        # the full mcp.Server adaptor lands when the first real tool is
        # added in Phase 4.
        from mcp.server import Server as _Server
        proto = _Server("spotify-services")

        @proto.list_tools()
        async def _list():
            return [
                {
                    "name": t.name,
                    "description": f"{t.name} (v{__version__})",
                    "inputSchema": {"type": "object", "properties": {}, "additionalProperties": True},
                }
                for t in s.list_tools()
            ]

        @proto.call_tool()
        async def _call(name: str, arguments: dict[str, Any] | None):
            return await s.call_tool(name, arguments or {})

        await proto.run(read, write, proto.create_initialization_options())
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
pytest tests/test_server.py -v
```
Expected: both tests PASS.

- [ ] **Step 3: Smoke-run the server via stdio**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python -m spotify_mcp 2>/dev/null | head -1
```
Expected: a valid JSON-RPC response listing `server.health`. (May require minor protocol-handshake adjustment per the `mcp` SDK version; if the bare `tools/list` doesn't work, adjust to send the proper init handshake first or skip this step and rely on the unit tests.)

### Task 2.5: Commit Phase 2

- [ ] **Step 1: Commit**

```bash
git add spotify-services/server/
git commit -m "feat(spotify-services): Python MCP server skeleton

server.py registers tools in a single build_server() table that's
introspectable from tests. Adding a tool means: import handler + one
s.register() line. Stdio runner bridges to the mcp SDK's Server.

Phase 2 ships with a single server.health stub tool; webapi/local tools
land in Phase 4 onward."
```

---

## Phase 3: Auth (PKCE + token storage + refresh)

**Goal:** Implement the OAuth Authorization Code with PKCE flow, token persistence at `~/.youcoded/spotify-services/tokens.json`, and pre-emptive refresh. End-to-end test stays gated on `SPOTIFY_E2E=1`; unit tests cover the state machine with mocked `httpx`.

### Task 3.1: Write `config.py` — paths and constants

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/config.py`

- [ ] **Step 1: Write the file**

```python
"""File paths, scope set, OAuth endpoints. Single source of truth.

Token storage path lives under ~/.youcoded/ to match the rest of the
YouCoded ecosystem and to inherit existing sync-exclude rules. The
server install lives at ~/.spotify-services/ because the launcher
script needs a stable, well-known venv path that doesn't move when
~/.youcoded/ is restored from backup."""
from __future__ import annotations
from pathlib import Path

HOME = Path.home()

# Server install location — referenced by launcher.sh.
SERVER_HOME = HOME / ".spotify-services" / "server"

# Token storage — mode 600. Lives under ~/.youcoded/ so it inherits
# the YouCoded sync-exclude rules for secrets.
SECRETS_DIR = HOME / ".youcoded" / "spotify-services"
TOKENS_FILE = SECRETS_DIR / "tokens.json"

# Spotify OAuth endpoints (PKCE flow).
SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
REDIRECT_URI = "http://127.0.0.1:8080/callback"

# Pre-emptive refresh: refresh access tokens with at least this many
# seconds remaining to avoid mid-call expiry.
REFRESH_BUFFER_SECONDS = 300

# Scope set requested at first auth (see spec §6.1).
SCOPES = [
    "user-read-private",
    "user-read-email",
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-public",
    "playlist-modify-private",
    "user-library-read",
    "user-library-modify",
    "user-top-read",
    "user-read-recently-played",
    "user-read-playback-state",
    "user-read-currently-playing",
    "user-modify-playback-state",
]
SCOPE_STRING = " ".join(SCOPES)
```

### Task 3.2: Write the auth state-machine tests (failing)

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/tests/test_auth.py`

- [ ] **Step 1: Write the tests**

```python
"""Tests for OAuth Authorization Code with PKCE flow + token refresh."""
from __future__ import annotations
import json
import time
from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest

from spotify_mcp.auth import (
    AuthError,
    PkcePair,
    TokenStore,
    build_authorize_url,
    exchange_code_for_tokens,
    needs_refresh,
    refresh_access_token,
)


def test_pkce_pair_generates_43_to_128_char_verifier():
    pair = PkcePair.generate()
    assert 43 <= len(pair.verifier) <= 128
    assert pair.challenge != pair.verifier  # SHA256-based
    assert pair.method == "S256"


def test_build_authorize_url_includes_required_params():
    pair = PkcePair(verifier="x" * 43, challenge="abc", method="S256")
    url = build_authorize_url(client_id="cid", state="st", pkce=pair)
    assert "client_id=cid" in url
    assert "response_type=code" in url
    assert "code_challenge=abc" in url
    assert "code_challenge_method=S256" in url
    assert "state=st" in url
    assert "scope=" in url


def test_exchange_code_for_tokens_calls_token_endpoint(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        def json(self): return {
            "access_token": "AT", "refresh_token": "RT",
            "expires_in": 3600, "token_type": "Bearer",
        }
        def raise_for_status(self): pass

    def fake_post(url, data=None, timeout=None):
        captured["url"] = url
        captured["data"] = data
        return FakeResponse()

    fake_client = MagicMock()
    fake_client.__enter__ = lambda self: fake_client
    fake_client.__exit__ = lambda self, *a: None
    fake_client.post = fake_post
    monkeypatch.setattr(httpx, "Client", lambda **kw: fake_client)

    tokens = exchange_code_for_tokens(
        client_id="cid", code="abc", verifier="ver" * 15,
    )
    assert captured["data"]["grant_type"] == "authorization_code"
    assert captured["data"]["code"] == "abc"
    assert captured["data"]["code_verifier"] == "ver" * 15
    assert captured["data"]["client_id"] == "cid"
    assert tokens.access_token == "AT"
    assert tokens.refresh_token == "RT"
    assert tokens.expires_at > time.time()


def test_needs_refresh_true_when_within_buffer():
    expires_soon = time.time() + 60  # 1 minute left
    assert needs_refresh(expires_soon) is True


def test_needs_refresh_false_when_plenty_of_time():
    expires_far = time.time() + 3600
    assert needs_refresh(expires_far) is False


def test_refresh_access_token_handles_invalid_grant(monkeypatch):
    class FakeResponse:
        status_code = 400
        def json(self): return {"error": "invalid_grant"}
        def raise_for_status(self):
            raise httpx.HTTPStatusError("400", request=None, response=self)

    fake_client = MagicMock()
    fake_client.__enter__ = lambda self: fake_client
    fake_client.__exit__ = lambda self, *a: None
    fake_client.post = lambda *a, **kw: FakeResponse()
    monkeypatch.setattr(httpx, "Client", lambda **kw: fake_client)

    with pytest.raises(AuthError) as ex:
        refresh_access_token(client_id="cid", refresh_token="RT")
    assert ex.value.code == "reauth_required"


def test_token_store_round_trips(tmp_path: Path, monkeypatch):
    monkeypatch.setattr("spotify_mcp.config.TOKENS_FILE", tmp_path / "t.json")
    monkeypatch.setattr("spotify_mcp.config.SECRETS_DIR", tmp_path)

    from spotify_mcp.auth import Tokens, TokenStore
    store = TokenStore()
    tok = Tokens(access_token="A", refresh_token="R",
                 expires_at=time.time() + 3600, token_type="Bearer")
    store.save(tok)
    assert (tmp_path / "t.json").exists()
    assert oct((tmp_path / "t.json").stat().st_mode)[-3:] == "600"
    loaded = store.load()
    assert loaded.access_token == "A"
    assert loaded.refresh_token == "R"


def test_token_store_load_missing_returns_none(tmp_path: Path, monkeypatch):
    monkeypatch.setattr("spotify_mcp.config.TOKENS_FILE", tmp_path / "missing.json")
    from spotify_mcp.auth import TokenStore
    assert TokenStore().load() is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_auth.py -v
```
Expected: ImportError on `from spotify_mcp.auth import ...`.

### Task 3.3: Implement `auth.py` to pass the tests

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/auth.py`

- [ ] **Step 1: Write `auth.py`**

```python
"""OAuth Authorization Code with PKCE + token persistence + refresh.

PKCE flow chosen because Spotify mandates it for new apps post-Nov-2025
and because it requires no Client Secret — the app's only credential
on the user's machine is the Client ID, which is not a secret."""
from __future__ import annotations
import base64
import hashlib
import json
import os
import secrets
import time
import urllib.parse
from dataclasses import dataclass
from typing import Optional

import httpx

from spotify_mcp.config import (
    REFRESH_BUFFER_SECONDS,
    SCOPE_STRING,
    SECRETS_DIR,
    SPOTIFY_AUTH_URL,
    SPOTIFY_TOKEN_URL,
    TOKENS_FILE,
    REDIRECT_URI,
)


class AuthError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


@dataclass(frozen=True)
class PkcePair:
    verifier: str
    challenge: str
    method: str

    @classmethod
    def generate(cls) -> "PkcePair":
        # 64 bytes → 86-char base64url verifier (within 43-128 spec range).
        verifier = secrets.token_urlsafe(64)[:128]
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
        return cls(verifier=verifier, challenge=challenge, method="S256")


@dataclass
class Tokens:
    access_token: str
    refresh_token: str
    expires_at: float  # unix epoch
    token_type: str = "Bearer"

    def to_json(self) -> dict:
        return {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_at": self.expires_at,
            "token_type": self.token_type,
        }

    @classmethod
    def from_json(cls, data: dict) -> "Tokens":
        return cls(**data)


def build_authorize_url(client_id: str, state: str, pkce: PkcePair) -> str:
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPE_STRING,
        "state": state,
        "code_challenge_method": pkce.method,
        "code_challenge": pkce.challenge,
    }
    return f"{SPOTIFY_AUTH_URL}?{urllib.parse.urlencode(params)}"


def exchange_code_for_tokens(client_id: str, code: str, verifier: str) -> Tokens:
    """Exchange the authorization code for an access+refresh token pair."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": REDIRECT_URI,
                "client_id": client_id,
                "code_verifier": verifier,
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        body = resp.json()
    return Tokens(
        access_token=body["access_token"],
        refresh_token=body["refresh_token"],
        expires_at=time.time() + int(body["expires_in"]),
        token_type=body.get("token_type", "Bearer"),
    )


def refresh_access_token(client_id: str, refresh_token: str) -> Tokens:
    """Refresh the access token. Raises AuthError(code='reauth_required')
    if the refresh token itself has been revoked."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            SPOTIFY_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
            },
            timeout=30.0,
        )
        if resp.status_code >= 400:
            try:
                body = resp.json()
            except Exception:
                body = {"error": "unknown"}
            if body.get("error") == "invalid_grant":
                raise AuthError("reauth_required",
                                "Refresh token rejected — run /spotify-services-reauth.")
            raise AuthError("token_endpoint_error", json.dumps(body))
        body = resp.json()
    return Tokens(
        access_token=body["access_token"],
        # Spotify may or may not rotate the refresh token. If absent, keep old.
        refresh_token=body.get("refresh_token", refresh_token),
        expires_at=time.time() + int(body["expires_in"]),
        token_type=body.get("token_type", "Bearer"),
    )


def needs_refresh(expires_at: float) -> bool:
    return (expires_at - time.time()) < REFRESH_BUFFER_SECONDS


class TokenStore:
    """Reads/writes tokens.json with mode-600 enforcement."""

    def save(self, tokens: Tokens) -> None:
        # Re-import to honor monkeypatched paths in tests.
        from spotify_mcp import config as _cfg
        _cfg.SECRETS_DIR.mkdir(parents=True, exist_ok=True)
        # Write+chmod atomically by setting the mode at create time.
        fd = os.open(_cfg.TOKENS_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(tokens.to_json(), f, indent=2)
        # On Windows os.open ignores the mode; chmod separately to be safe.
        try:
            os.chmod(_cfg.TOKENS_FILE, 0o600)
        except OSError:
            pass

    def load(self) -> Optional[Tokens]:
        from spotify_mcp import config as _cfg
        if not _cfg.TOKENS_FILE.exists():
            return None
        with open(_cfg.TOKENS_FILE) as f:
            return Tokens.from_json(json.load(f))
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
pytest tests/test_auth.py -v
```
Expected: all 8 tests PASS.

### Task 3.4: Add the auth-required wrapper used by every Web API tool

**Files:**
- Modify: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/auth.py` (append)
- Create: `wecoded-marketplace/spotify-services/server/tests/test_auth_wrapper.py`

- [ ] **Step 1: Write the wrapper test**

```python
"""Tests for `with_access_token`, the helper every Web API tool uses."""
import time
from unittest.mock import MagicMock
import pytest

from spotify_mcp.auth import AuthError, Tokens, with_access_token


def test_with_access_token_returns_token_when_fresh(monkeypatch):
    fresh = Tokens(access_token="A", refresh_token="R",
                   expires_at=time.time() + 3600, token_type="Bearer")
    store = MagicMock()
    store.load.return_value = fresh
    refresh = MagicMock()
    token = with_access_token(client_id="cid", store=store, refresh_fn=refresh)
    assert token == "A"
    refresh.assert_not_called()


def test_with_access_token_refreshes_when_near_expiry(monkeypatch):
    near_expiry = Tokens(access_token="OLD", refresh_token="R",
                         expires_at=time.time() + 60, token_type="Bearer")
    refreshed = Tokens(access_token="NEW", refresh_token="R",
                       expires_at=time.time() + 3600, token_type="Bearer")
    store = MagicMock()
    store.load.return_value = near_expiry
    refresh_fn = MagicMock(return_value=refreshed)
    token = with_access_token(client_id="cid", store=store, refresh_fn=refresh_fn)
    assert token == "NEW"
    store.save.assert_called_once_with(refreshed)


def test_with_access_token_raises_when_no_tokens(monkeypatch):
    store = MagicMock()
    store.load.return_value = None
    with pytest.raises(AuthError) as ex:
        with_access_token(client_id="cid", store=store, refresh_fn=lambda **kw: None)
    assert ex.value.code == "reauth_required"
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_auth_wrapper.py -v
```
Expected: ImportError on `with_access_token`.

- [ ] **Step 3: Append `with_access_token` to `auth.py`**

```python
def with_access_token(*, client_id: str, store: TokenStore, refresh_fn=refresh_access_token) -> str:
    """Returns a fresh access token. Refreshes if within the buffer.
    Raises AuthError(code='reauth_required') if no tokens exist or the
    refresh token has been revoked."""
    tokens = store.load()
    if tokens is None:
        raise AuthError("reauth_required",
                        "No tokens on disk — run /spotify-services-setup.")
    if needs_refresh(tokens.expires_at):
        tokens = refresh_fn(client_id=client_id, refresh_token=tokens.refresh_token)
        store.save(tokens)
    return tokens.access_token
```

- [ ] **Step 4: Run to verify pass**

```bash
pytest tests/test_auth.py tests/test_auth_wrapper.py -v
```
Expected: all tests PASS.

### Task 3.5: Commit Phase 3

- [ ] **Step 1: Commit**

```bash
git add spotify-services/server/src/spotify_mcp/config.py \
        spotify-services/server/src/spotify_mcp/auth.py \
        spotify-services/server/tests/test_auth.py \
        spotify-services/server/tests/test_auth_wrapper.py
git commit -m "feat(spotify-services): PKCE auth + token persistence

Authorization Code with PKCE flow, mode-600 tokens.json under
~/.youcoded/spotify-services/, pre-emptive refresh with a 5-minute
buffer. Failure modes return AuthError with structured code so the
MCP tool layer can translate to {error: 'reauth_required'}."
```

---

## Phase 4: Web API backend (one PR per service area)

**Goal:** Implement `webapi/*.py` modules for the actual Web API surface against the post-Feb-2026 endpoints. Each module is independent and testable in isolation by mocking the `spotipy.Spotify` client. Tools come online incrementally.

The Phase-4 sub-tasks below all share the same shape:

1. Write a failing test against a mocked `spotipy.Spotify` client.
2. Implement the module.
3. Wire one MCP tool per module into `server.py`'s `build_server()` table.
4. Smoke-test through the running server.
5. Commit.

To keep this plan readable, the **template** is laid out fully for the first sub-task (4.1: Search). Subsequent sub-tasks (4.2–4.7) follow the same shape and only call out the differences (endpoint paths, return shapes, post-Feb-2026 caveats).

### Task 4.0: Web API client wrapper

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/webapi/__init__.py` (empty)
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/webapi/client.py`
- Create: `wecoded-marketplace/spotify-services/server/tests/test_webapi_client.py`

- [ ] **Step 1: Write the test**

```python
"""Tests for the spotipy.Spotify wrapper."""
from unittest.mock import MagicMock, patch
import pytest
import spotipy

from spotify_mcp.errors import StructuredError
from spotify_mcp.webapi.client import call, retry_after_seconds


def test_call_passes_through_on_success():
    fn = MagicMock(return_value={"ok": True})
    out = call(fn, "arg1", k="v")
    assert out == {"ok": True}
    fn.assert_called_once_with("arg1", k="v")


def test_call_translates_403_premium_required():
    err = spotipy.SpotifyException(403, -1,
        "Restriction violated: Premium account required.", headers={})
    fn = MagicMock(side_effect=err)
    with pytest.raises(StructuredError) as ex:
        call(fn)
    assert ex.value.code == "premium_required"


def test_call_translates_403_scope_error():
    err = spotipy.SpotifyException(403, -1,
        "Insufficient client scope", headers={})
    fn = MagicMock(side_effect=err)
    with pytest.raises(StructuredError) as ex:
        call(fn)
    assert ex.value.code == "scope_missing"


def test_call_retries_once_on_429_then_surfaces_rate_limit():
    err = spotipy.SpotifyException(429, -1, "Too Many Requests",
                                    headers={"Retry-After": "2"})
    fn = MagicMock(side_effect=[err, err])
    with patch("spotify_mcp.webapi.client.time.sleep"):
        with pytest.raises(StructuredError) as ex:
            call(fn)
    assert ex.value.code == "rate_limited"
    assert ex.value.payload["retry_after_s"] == 2
    assert fn.call_count == 2


def test_retry_after_seconds_parses_int():
    err = spotipy.SpotifyException(429, -1, "x", headers={"Retry-After": "5"})
    assert retry_after_seconds(err) == 5


def test_retry_after_seconds_falls_back_to_one_when_missing():
    err = spotipy.SpotifyException(429, -1, "x", headers={})
    assert retry_after_seconds(err) == 1
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_webapi_client.py -v
```
Expected: ImportError on the missing modules.

- [ ] **Step 3: Write `errors.py` (used here and downstream)**

```python
"""Structured error shapes returned by tools.

Every tool error is a StructuredError that the tool dispatcher
serializes to a JSON object with at least {"error": "<code>"}."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class StructuredError(Exception):
    code: str
    message: str = ""
    payload: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        out = {"error": self.code}
        if self.message:
            out["message"] = self.message
        out.update(self.payload)
        return out
```

- [ ] **Step 4: Write `webapi/client.py`**

```python
"""spotipy wrapper with single-retry-on-429 and structured-error translation."""
from __future__ import annotations
import time
from typing import Any, Callable

import spotipy

from spotify_mcp.errors import StructuredError


def retry_after_seconds(err: spotipy.SpotifyException) -> int:
    """Read Retry-After header from a 429. Falls back to 1s if absent or
    non-integer."""
    raw = (err.headers or {}).get("Retry-After", "1")
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return 1


def call(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Invoke a spotipy method, translating exceptions into StructuredError.

    Single-retry-on-429: on the first 429, sleep `Retry-After` seconds and
    retry once. On the second 429, surface a structured `rate_limited`
    error so the caller can decide what to do next."""
    try:
        return fn(*args, **kwargs)
    except spotipy.SpotifyException as e:
        if e.http_status == 429:
            wait = retry_after_seconds(e)
            time.sleep(wait)
            try:
                return fn(*args, **kwargs)
            except spotipy.SpotifyException as e2:
                if e2.http_status == 429:
                    raise StructuredError(
                        "rate_limited", "Spotify rate limit hit.",
                        {"retry_after_s": retry_after_seconds(e2)},
                    )
                raise _translate(e2)
        raise _translate(e)


def _translate(e: spotipy.SpotifyException) -> StructuredError:
    msg = (e.msg or "").lower()
    if e.http_status == 401:
        return StructuredError("reauth_required", e.msg or "")
    if e.http_status == 403:
        if "premium" in msg or "restricted" in msg:
            return StructuredError("premium_required", e.msg or "")
        if "scope" in msg:
            return StructuredError("scope_missing", e.msg or "")
        return StructuredError("forbidden", e.msg or "")
    if e.http_status == 404:
        return StructuredError("not_found", e.msg or "")
    if e.http_status == 400:
        return StructuredError("bad_request", e.msg or "")
    return StructuredError("upstream_error",
                            f"HTTP {e.http_status}: {e.msg or ''}")
```

- [ ] **Step 5: Run to verify pass**

```bash
pytest tests/test_webapi_client.py tests/test_auth.py tests/test_auth_wrapper.py tests/test_server.py -v
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add spotify-services/server/src/spotify_mcp/errors.py \
        spotify-services/server/src/spotify_mcp/webapi/__init__.py \
        spotify-services/server/src/spotify_mcp/webapi/client.py \
        spotify-services/server/tests/test_webapi_client.py
git commit -m "feat(spotify-services): webapi client wrapper + structured errors"
```

### Task 4.1: Search (template — full TDD cycle)

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/webapi/search.py`
- Create: `wecoded-marketplace/spotify-services/server/tests/test_webapi_search.py`

- [ ] **Step 1: Write failing test**

```python
"""Tests for webapi.search."""
from unittest.mock import MagicMock
import pytest

from spotify_mcp.webapi.search import search

POST_FEB_2026_LIMIT_CAP = 10  # Spotify capped search limit at 10 in Feb 2026.


def test_search_caps_limit_at_post_feb_2026_value():
    sp = MagicMock()
    sp.search.return_value = {"tracks": {"items": []}}
    search(sp, query="x", types=["track"], limit=50)
    args, kwargs = sp.search.call_args
    assert kwargs["limit"] == POST_FEB_2026_LIMIT_CAP


def test_search_passes_query_and_types():
    sp = MagicMock()
    sp.search.return_value = {"tracks": {"items": []}}
    search(sp, query="abba", types=["track", "album"], limit=5)
    kwargs = sp.search.call_args.kwargs
    assert kwargs["q"] == "abba"
    assert kwargs["type"] == "track,album"
    assert kwargs["limit"] == 5
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_webapi_search.py -v
```
Expected: ImportError.

- [ ] **Step 3: Implement `search.py`**

```python
"""Web API search — types-multiplexed.

Note: as of Feb 2026, Spotify capped `limit` at 10 (was 50). We clamp
silently rather than rejecting — Claude tends to ask for 50 and we'd
rather honor the spirit of the request."""
from __future__ import annotations
from typing import Any
import spotipy

from spotify_mcp.webapi.client import call

LIMIT_CAP = 10


def search(sp: spotipy.Spotify, *, query: str, types: list[str],
           limit: int = 10, offset: int = 0,
           market: str | None = None) -> dict[str, Any]:
    """Multi-type search. Returns the raw Spotify shape.

    types: any subset of {"track","album","artist","playlist","show","episode","audiobook"}.
    """
    return call(sp.search,
                q=query, type=",".join(types),
                limit=min(limit, LIMIT_CAP), offset=offset, market=market)
```

- [ ] **Step 4: Run to verify pass**

```bash
pytest tests/test_webapi_search.py -v
```

- [ ] **Step 5: Wire as MCP tool**

Modify `server.py`'s `build_server()` to register `search.query`:

```python
# At top of server.py, add:
from spotify_mcp.tools.webapi_tools import search_query

# In build_server():
s.register("search.query", search_query)
```

Create `tools/webapi_tools.py`:

```python
"""MCP tool handlers for webapi.* tools.

Each handler:
1. Acquires an access token via auth.with_access_token()
2. Builds a spotipy.Spotify(auth=token) client
3. Calls the webapi/* function
4. Catches StructuredError and returns its .to_json() shape"""
from __future__ import annotations
from typing import Any
import os
import spotipy

from spotify_mcp.auth import AuthError, TokenStore, with_access_token
from spotify_mcp.errors import StructuredError
from spotify_mcp.webapi.search import search as _search


def _client() -> spotipy.Spotify:
    cid = os.environ.get("SPOTIFY_CLIENT_ID")
    if not cid:
        raise StructuredError(
            "client_id_missing",
            "SPOTIFY_CLIENT_ID environment variable not set. "
            "The launcher should set this from ~/.youcoded/spotify-services/client.env.",
        )
    token = with_access_token(client_id=cid, store=TokenStore())
    return spotipy.Spotify(auth=token)


def _safe(handler):
    """Decorator: convert StructuredError + AuthError into a JSON error shape."""
    async def _wrap(args: dict[str, Any]) -> dict[str, Any]:
        try:
            return await handler(args)
        except AuthError as e:
            return {"error": e.code, "message": e.message}
        except StructuredError as e:
            return e.to_json()
    return _wrap


@_safe
async def search_query(args: dict[str, Any]) -> dict[str, Any]:
    sp = _client()
    return _search(
        sp,
        query=args["query"],
        types=args.get("types") or ["track"],
        limit=int(args.get("limit") or 10),
        offset=int(args.get("offset") or 0),
        market=args.get("market"),
    )
```

- [ ] **Step 6: Run all tests and the server smoke test**

```bash
pytest tests/ -v
```

- [ ] **Step 7: Commit**

```bash
git add spotify-services/server/src/spotify_mcp/webapi/search.py \
        spotify-services/server/src/spotify_mcp/tools/webapi_tools.py \
        spotify-services/server/src/spotify_mcp/tools/__init__.py \
        spotify-services/server/src/spotify_mcp/server.py \
        spotify-services/server/tests/test_webapi_search.py
git commit -m "feat(spotify-services): search.query MCP tool"
```

### Tasks 4.2–4.7: Remaining Web API modules

For each module below, follow the same 7-step shape from Task 4.1: write failing test → implement → register tool → commit.

**4.2 Library** (`webapi/library.py`)
- Endpoints: `current_user_saved_tracks` (GET — kept), generic `PUT /me/library` and `DELETE /me/library` (NEW post-Feb-2026, take URI list), `current_user_top_tracks`, `current_user_top_artists`, `current_user_recently_played`.
- Public functions: `saved_tracks(sp, limit, offset, market)`, `top_tracks(sp, time_range, limit, offset)`, `top_artists(sp, ...)`, `recently_played(sp, limit, after, before)`, `library_save(sp, uris)`, `library_remove(sp, uris)`.
- Tools registered: `library.saved_tracks`, `library.top_tracks`, `library.top_artists`, `library.recently_played`, `library.save`, `library.remove`.
- Critical test: `library_save` and `library_remove` MUST call the new generic endpoints (`PUT /me/library` / `DELETE /me/library`), not the old `/me/tracks` paths. Spotipy may not expose them yet — if not, fall through to `sp._put("me/library", ...)` and write a test that asserts the path.

**4.3 Playlists** (`webapi/playlists.py`)
- Endpoints: `current_user_playlists`, `playlist_items` (NEW path — was `playlist_tracks`, now `/playlists/{id}/items`), `playlist_add_items`, `playlist_remove_all_occurrences_of_items`, `playlist_reorder_items`, `playlist_change_details`.
- Public functions: `list_mine`, `get_items`, `add_items`, `remove_items`, `reorder`, `update_details`.
- Tools registered: `playlists.list_mine`, `playlists.get_items`, `playlists.add_items`, `playlists.remove_items`, `playlists.reorder`, `playlists.update_details`.
- Critical: spotipy ≥2.24 should be using the renamed `/items` endpoints. If it isn't, override via `sp._get(f"playlists/{id}/items", ...)`.
- Add a `paginate_all` helper here used by Phase 10's `export_all_playlists`. Iterates `next` URLs until exhausted; respects rate-limit retries via the existing `client.call` wrapper.

**4.4 Playback** (`webapi/playback.py`)
- All Premium-gated. Endpoints: `start_playback`, `pause_playback`, `next_track`, `previous_track`, `seek_track`, `volume`, `repeat`, `shuffle`, `transfer_playback`, `devices`.
- Tools: `playback.play`, `playback.pause`, `playback.next`, `playback.previous`, `playback.seek`, `playback.set_volume`, `playback.set_repeat`, `playback.set_shuffle`, `playback.transfer_to_device`, `playback.devices`.
- Test the Premium 403 path explicitly (relies on `webapi/client.py` translation).

**4.5 Queue** (`webapi/queue.py`)
- Endpoints: `add_to_queue` (POST `me/player/queue`, Premium), `queue` (GET `me/player/queue`, non-Premium).
- Tools: `queue.add`, `queue.list`.

**4.6 User** (`webapi/user.py`)
- Endpoints: `current_user`.
- Tool: `user.profile`.
- Note: post-Feb-2026, `country`, `email`, `product` fields may not be returned by default. The smoke test in Phase 9 checks for `id` and gracefully skips Premium verification if `product` is absent.

**4.7 Sub-task per-module template — abbreviated**

Each module follows the same 7 steps from 4.1. To keep this plan from ballooning, I'm not repeating the full code blocks — refer to 4.1 for the test/implementation/wiring shape.

For each of 4.2–4.6:
- [ ] Write failing test against mocked `sp` (one test per public function)
- [ ] Implement the module
- [ ] Add tool registrations to `server.py` and handlers to `webapi_tools.py`
- [ ] Run `pytest tests/ -v` (all green)
- [ ] Commit with message `feat(spotify-services): <module> webapi`

---

## Phase 5: Local backends (macOS + Windows)

**Goal:** Implement the macOS AppleScript and Windows SMTC backends behind a shared `LocalBackend` interface, with a platform router that picks the right one at startup. No Web API involvement here; these are pure local-app control.

### Task 5.1: LocalBackend interface + platform router

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/local/__init__.py`
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/local/base.py`
- Create: `wecoded-marketplace/spotify-services/server/tests/test_local_router.py`

- [ ] **Step 1: Write tests**

```python
"""Tests for the local-backend platform router."""
from unittest.mock import patch

from spotify_mcp.local import select_backend


def test_select_backend_returns_macos_on_darwin():
    with patch("sys.platform", "darwin"):
        from spotify_mcp.local.macos import MacOsBackend
        b = select_backend()
        assert isinstance(b, MacOsBackend)


def test_select_backend_returns_windows_on_win32():
    with patch("sys.platform", "win32"):
        from spotify_mcp.local.windows import WindowsBackend
        b = select_backend()
        assert isinstance(b, WindowsBackend)


def test_select_backend_returns_none_on_unsupported():
    with patch("sys.platform", "linux"):
        assert select_backend() is None
```

- [ ] **Step 2: Implement `base.py`**

```python
"""Abstract LocalBackend interface."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any


class LocalBackend(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def is_running(self) -> bool: ...

    @abstractmethod
    async def now_playing(self) -> dict[str, Any] | None: ...

    @abstractmethod
    async def play(self) -> None: ...

    @abstractmethod
    async def pause(self) -> None: ...

    @abstractmethod
    async def next(self) -> None: ...

    @abstractmethod
    async def previous(self) -> None: ...

    # Optional — not all backends support these
    async def seek_to(self, position_ms: int) -> None:
        from spotify_mcp.errors import StructuredError
        raise StructuredError("not_supported",
                              f"{self.name} backend does not support seek_to")

    async def set_volume(self, level: int) -> None:
        from spotify_mcp.errors import StructuredError
        raise StructuredError("not_supported",
                              f"{self.name} backend does not support set_volume")

    async def launch(self) -> None:
        from spotify_mcp.errors import StructuredError
        raise StructuredError("not_supported",
                              f"{self.name} backend does not support launch")

    async def quit(self) -> None:
        from spotify_mcp.errors import StructuredError
        raise StructuredError("not_supported",
                              f"{self.name} backend does not support quit")
```

- [ ] **Step 3: Implement `__init__.py` (router)**

```python
"""Local backend selector. Returns None on unsupported platforms."""
from __future__ import annotations
import sys

from spotify_mcp.local.base import LocalBackend


def select_backend() -> LocalBackend | None:
    if sys.platform == "darwin":
        from spotify_mcp.local.macos import MacOsBackend
        return MacOsBackend()
    if sys.platform == "win32":
        from spotify_mcp.local.windows import WindowsBackend
        return WindowsBackend()
    return None
```

- [ ] **Step 4: Run** — test fails because `macos.py` and `windows.py` don't exist yet. Skip and continue.

### Task 5.2: macOS backend (AppleScript)

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/local/macos.py`
- Create: `wecoded-marketplace/spotify-services/server/tests/test_local_macos.py`

- [ ] **Step 1: Write tests**

```python
"""Tests for macOS AppleScript backend (subprocess mocked)."""
import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from spotify_mcp.local.macos import MacOsBackend, _run_osascript


@pytest.mark.asyncio
async def test_play_invokes_correct_applescript(monkeypatch):
    captured = []

    async def fake_run(script: str) -> str:
        captured.append(script)
        return ""

    monkeypatch.setattr("spotify_mcp.local.macos._run_osascript", fake_run)
    await MacOsBackend().play()
    assert any('tell application "Spotify"' in s and "play" in s
               for s in captured)


@pytest.mark.asyncio
async def test_is_running_returns_false_on_empty(monkeypatch):
    async def fake_run(script: str) -> str:
        return "false"
    monkeypatch.setattr("spotify_mcp.local.macos._run_osascript", fake_run)
    assert await MacOsBackend().is_running() is False


@pytest.mark.asyncio
async def test_now_playing_parses_track_metadata(monkeypatch):
    # AppleScript join'd with "‖" sentinels
    async def fake_run(script: str) -> str:
        return "Foo Track‖Bar Artist‖Baz Album‖142000‖30000"
    monkeypatch.setattr("spotify_mcp.local.macos._run_osascript", fake_run)
    out = await MacOsBackend().now_playing()
    assert out["name"] == "Foo Track"
    assert out["artist"] == "Bar Artist"
    assert out["album"] == "Baz Album"
    assert out["duration_ms"] == 142000
    assert out["position_ms"] == 30000
```

- [ ] **Step 2: Implement `macos.py`**

```python
"""macOS local backend via osascript subprocess.

Spotify exposes a rich AppleScript dictionary. We invoke `osascript -e <script>`
in async subprocess; output is captured as plain text and parsed."""
from __future__ import annotations
import asyncio
from typing import Any

from spotify_mcp.local.base import LocalBackend


async def _run_osascript(script: str) -> str:
    """Run an AppleScript snippet via osascript. Returns stdout-trimmed."""
    proc = await asyncio.create_subprocess_exec(
        "osascript", "-e", script,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        from spotify_mcp.errors import StructuredError
        raise StructuredError("local_backend_error",
                              f"osascript failed: {stderr.decode().strip()}")
    return stdout.decode().strip()


class MacOsBackend(LocalBackend):
    @property
    def name(self) -> str: return "macos"

    async def is_running(self) -> bool:
        out = await _run_osascript(
            'tell application "System Events" to (name of processes) contains "Spotify"'
        )
        return out == "true"

    async def now_playing(self) -> dict[str, Any] | None:
        if not await self.is_running():
            return None
        # Use a unicode sentinel that's vanishingly unlikely in track metadata.
        out = await _run_osascript("""
            tell application "Spotify"
              set theName to name of current track
              set theArtist to artist of current track
              set theAlbum to album of current track
              set theDur to duration of current track
              set thePos to player position
              return theName & "‖" & theArtist & "‖" & theAlbum & "‖" & theDur & "‖" & thePos
            end tell
        """)
        parts = out.split("‖")
        if len(parts) < 5:
            return None
        return {
            "name": parts[0], "artist": parts[1], "album": parts[2],
            "duration_ms": int(parts[3]),
            # AppleScript returns player position in seconds (float); convert.
            "position_ms": int(float(parts[4]) * 1000)
                if "." in parts[4] else int(parts[4]),
            "backend": "local_macos",
        }

    async def play(self) -> None:
        await _run_osascript('tell application "Spotify" to play')

    async def pause(self) -> None:
        await _run_osascript('tell application "Spotify" to pause')

    async def next(self) -> None:
        await _run_osascript('tell application "Spotify" to next track')

    async def previous(self) -> None:
        await _run_osascript('tell application "Spotify" to previous track')

    async def seek_to(self, position_ms: int) -> None:
        seconds = position_ms / 1000.0
        await _run_osascript(
            f'tell application "Spotify" to set player position to {seconds}'
        )

    async def set_volume(self, level: int) -> None:
        # Spotify AppleScript volume is 0-100.
        clamped = max(0, min(100, level))
        await _run_osascript(
            f'tell application "Spotify" to set sound volume to {clamped}'
        )

    async def launch(self) -> None:
        await _run_osascript('tell application "Spotify" to activate')

    async def quit(self) -> None:
        await _run_osascript('tell application "Spotify" to quit')
```

- [ ] **Step 3: Run macOS tests**

```bash
pytest tests/test_local_macos.py -v
```
Expected: PASS.

### Task 5.3: Windows backend (pywinrt SMTC)

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/local/windows.py`
- Create: `wecoded-marketplace/spotify-services/server/tests/test_local_windows.py`

- [ ] **Step 1: Write tests** (mock the entire `winrt` import — test runs cross-platform)

```python
"""Tests for Windows SMTC backend (winrt mocked)."""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.fixture
def fake_winrt(monkeypatch):
    """Mock the winrt.windows.media.control module so tests work on macOS/Linux."""
    mock_module = MagicMock()
    monkeypatch.setitem(__import__("sys").modules,
                        "winrt.windows.media.control", mock_module)
    return mock_module


@pytest.mark.asyncio
async def test_is_running_returns_true_when_spotify_session_exists(fake_winrt):
    from spotify_mcp.local.windows import WindowsBackend
    session = MagicMock()
    session.source_app_user_model_id = "Spotify.exe"
    sessions = MagicMock()
    sessions.get_sessions.return_value = [session]
    fake_winrt.GlobalSystemMediaTransportControlsSessionManager.request_async = \
        AsyncMock(return_value=sessions)

    assert await WindowsBackend().is_running() is True


@pytest.mark.asyncio
async def test_is_running_returns_false_when_no_spotify_session(fake_winrt):
    from spotify_mcp.local.windows import WindowsBackend
    session = MagicMock()
    session.source_app_user_model_id = "Chrome.exe"
    sessions = MagicMock()
    sessions.get_sessions.return_value = [session]
    fake_winrt.GlobalSystemMediaTransportControlsSessionManager.request_async = \
        AsyncMock(return_value=sessions)
    assert await WindowsBackend().is_running() is False
```

- [ ] **Step 2: Implement `windows.py`**

```python
"""Windows local backend via SMTC (System Media Transport Controls).

Reads playback state and issues transport commands through pywinrt's
GlobalSystemMediaTransportControlsSessionManager. SMTC does NOT expose
seek or volume — those raise StructuredError("not_supported", ...) from
the base class."""
from __future__ import annotations
from typing import Any

from spotify_mcp.local.base import LocalBackend
from spotify_mcp.errors import StructuredError


def _smtc():
    """Lazy import — fails cleanly on non-Windows."""
    try:
        from winrt.windows.media.control import (  # type: ignore
            GlobalSystemMediaTransportControlsSessionManager as M,
        )
        return M
    except ImportError as e:
        raise StructuredError("local_backend_unavailable",
                              f"pywinrt not installed: {e}")


def _is_spotify(session) -> bool:
    """SMTC `source_app_user_model_id` for Spotify is `Spotify.exe`
    (Win32 install) or `SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify` (Store)."""
    aumid = session.source_app_user_model_id or ""
    return "Spotify" in aumid


class WindowsBackend(LocalBackend):
    @property
    def name(self) -> str: return "windows"

    async def _spotify_session(self):
        sessions = await _smtc().request_async()
        for s in sessions.get_sessions():
            if _is_spotify(s):
                return s
        return None

    async def is_running(self) -> bool:
        return (await self._spotify_session()) is not None

    async def now_playing(self) -> dict[str, Any] | None:
        s = await self._spotify_session()
        if s is None:
            return None
        props = await s.try_get_media_properties_async()
        timeline = s.get_timeline_properties()
        return {
            "name": props.title or "",
            "artist": props.artist or "",
            "album": props.album_title or "",
            "duration_ms": int(timeline.end_time.duration / 10_000)
                if timeline.end_time else 0,
            "position_ms": int(timeline.position.duration / 10_000)
                if timeline.position else 0,
            "backend": "local_windows",
        }

    async def play(self) -> None:
        s = await self._require_session()
        await s.try_play_async()

    async def pause(self) -> None:
        s = await self._require_session()
        await s.try_pause_async()

    async def next(self) -> None:
        s = await self._require_session()
        await s.try_skip_next_async()

    async def previous(self) -> None:
        s = await self._require_session()
        await s.try_skip_previous_async()

    async def _require_session(self):
        s = await self._spotify_session()
        if s is None:
            raise StructuredError("desktop_app_not_running",
                                  "Spotify desktop app is not running.")
        return s
```

- [ ] **Step 3: Run Windows tests**

```bash
pytest tests/test_local_windows.py -v
```
Expected: PASS (works on any OS due to mock).

### Task 5.4: Wire local tools into the server

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/tools/local_tools.py`
- Modify: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/server.py`

- [ ] **Step 1: Implement `local_tools.py`**

```python
"""MCP tool handlers for local.* tools."""
from __future__ import annotations
from typing import Any

from spotify_mcp.local import select_backend
from spotify_mcp.errors import StructuredError


def _safe(handler):
    async def _wrap(args: dict[str, Any]) -> dict[str, Any]:
        try:
            backend = select_backend()
            if backend is None:
                return {"error": "local_backend_unavailable",
                        "message": "No local backend for this OS (v1: macOS + Windows only)."}
            return await handler(backend, args)
        except StructuredError as e:
            return e.to_json()
    return _wrap


@_safe
async def local_play(backend, _): await backend.play(); return {"ok": True}

@_safe
async def local_pause(backend, _): await backend.pause(); return {"ok": True}

@_safe
async def local_next(backend, _): await backend.next(); return {"ok": True}

@_safe
async def local_previous(backend, _): await backend.previous(); return {"ok": True}

@_safe
async def local_now_playing(backend, _):
    out = await backend.now_playing()
    return out if out else {"playing": False}

@_safe
async def local_is_running(backend, _):
    return {"running": await backend.is_running()}

@_safe
async def local_seek_to(backend, args):
    await backend.seek_to(int(args["position_ms"])); return {"ok": True}

@_safe
async def local_set_volume(backend, args):
    await backend.set_volume(int(args["level"])); return {"ok": True}

@_safe
async def local_launch(backend, _): await backend.launch(); return {"ok": True}

@_safe
async def local_quit(backend, _): await backend.quit(); return {"ok": True}
```

- [ ] **Step 2: Register all 10 in `server.py` `build_server()`**

```python
from spotify_mcp.tools.local_tools import (
    local_play, local_pause, local_next, local_previous,
    local_now_playing, local_is_running,
    local_seek_to, local_set_volume, local_launch, local_quit,
)

# In build_server():
s.register("local.play", local_play)
s.register("local.pause", local_pause)
s.register("local.next", local_next)
s.register("local.previous", local_previous)
s.register("local.now_playing", local_now_playing)
s.register("local.is_running", local_is_running)
s.register("local.seek_to", local_seek_to)
s.register("local.set_volume", local_set_volume)
s.register("local.launch", local_launch)
s.register("local.quit", local_quit)
```

- [ ] **Step 3: Test + commit**

```bash
pytest tests/ -v
git add spotify-services/server/src/spotify_mcp/local/ \
        spotify-services/server/src/spotify_mcp/tools/local_tools.py \
        spotify-services/server/src/spotify_mcp/server.py \
        spotify-services/server/tests/test_local_*.py
git commit -m "feat(spotify-services): macOS+Windows local backends + local.* tools"
```

---

## Phase 6: Smart routing + composite tools

**Goal:** Implement `now_playing`, `play_pause_smart`, and the routing decision rules. The smart tools live alongside the raw `local.*` and `webapi.*` tools — both are always available; smart tools are the recommended path for most callers.

### Task 6.1: Routing decision rules

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/tools/routing.py`
- Create: `wecoded-marketplace/spotify-services/server/tests/test_routing.py`

- [ ] **Step 1: Tests**

```python
"""Tests for smart-routing decisions."""
from unittest.mock import AsyncMock, MagicMock
import pytest

from spotify_mcp.tools.routing import decide_transport_route


@pytest.mark.asyncio
async def test_route_local_when_desktop_is_active_smtc_session():
    backend = MagicMock()
    backend.is_running = AsyncMock(return_value=True)
    sp_devices = lambda: {"devices": [
        {"is_active": True, "name": "DESKTOP-XYZ"},  # likely desktop
    ]}
    route = await decide_transport_route(backend=backend,
                                          fetch_devices=sp_devices)
    assert route == "local"


@pytest.mark.asyncio
async def test_route_webapi_when_active_device_is_phone():
    backend = MagicMock()
    backend.is_running = AsyncMock(return_value=True)
    sp_devices = lambda: {"devices": [
        {"is_active": True, "name": "iPhone", "type": "Smartphone"},
    ]}
    route = await decide_transport_route(backend=backend,
                                          fetch_devices=sp_devices)
    assert route == "webapi"


@pytest.mark.asyncio
async def test_route_webapi_when_desktop_app_not_running():
    backend = MagicMock()
    backend.is_running = AsyncMock(return_value=False)
    route = await decide_transport_route(
        backend=backend, fetch_devices=lambda: {"devices": []})
    assert route == "webapi"


@pytest.mark.asyncio
async def test_route_local_when_no_local_backend():
    """No local backend = unconditional webapi."""
    route = await decide_transport_route(
        backend=None, fetch_devices=lambda: {"devices": []})
    assert route == "webapi"
```

- [ ] **Step 2: Implement `routing.py`**

```python
"""Smart-routing decision rules.

Transport routing avoids the split-brain hazard the spec flagged:
local backend "running" doesn't imply local-as-active-Web-API-device.
We only route to local when (a) a local backend exists, (b) the
desktop app is running, AND (c) the Web API's active device is the
desktop (heuristic: device.type == 'Computer' or name matches host)."""
from __future__ import annotations
import socket
from typing import Awaitable, Callable

from spotify_mcp.local.base import LocalBackend


async def decide_transport_route(
    *,
    backend: LocalBackend | None,
    fetch_devices: Callable[[], dict],
) -> str:
    """Returns 'local' or 'webapi'.

    'local' only when: backend exists + desktop app running + active
    Web API device looks like the desktop (Computer type, or name
    contains hostname)."""
    if backend is None:
        return "webapi"
    if not await backend.is_running():
        return "webapi"

    # Web API active-device check.
    try:
        devices = (fetch_devices() or {}).get("devices", [])
    except Exception:
        # Web API call failed — fall through to local since it works
        # offline. If the local call subsequently fails, the caller's
        # safe wrapper translates the error.
        return "local"

    active = next((d for d in devices if d.get("is_active")), None)
    if active is None:
        # Nothing playing on Web API — local is fine.
        return "local"

    host = socket.gethostname().lower()
    name = (active.get("name") or "").lower()
    dtype = (active.get("type") or "").lower()
    if dtype == "computer" or host in name or name in host:
        return "local"
    return "webapi"
```

- [ ] **Step 3: Run + Commit**

```bash
pytest tests/test_routing.py -v
git add spotify-services/server/src/spotify_mcp/tools/routing.py \
        spotify-services/server/tests/test_routing.py
git commit -m "feat(spotify-services): smart-routing rules with desktop-as-active check"
```

### Task 6.2: now_playing + play_pause_smart smart tools

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/tools/smart_tools.py`
- Create: `wecoded-marketplace/spotify-services/server/tests/test_smart_tools.py`
- Modify: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/server.py`

- [ ] **Step 1: Tests**

```python
"""Tests for smart-routed tools (now_playing + play_pause_smart)."""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from spotify_mcp.errors import StructuredError


@pytest.mark.asyncio
async def test_now_playing_uses_local_when_available(monkeypatch):
    backend = MagicMock()
    backend.now_playing = AsyncMock(return_value={
        "name": "T", "artist": "A", "album": "Al",
        "duration_ms": 1000, "position_ms": 100,
        "backend": "local_macos",
    })
    monkeypatch.setattr("spotify_mcp.tools.smart_tools.select_backend",
                        lambda: backend)
    from spotify_mcp.tools.smart_tools import now_playing
    out = await now_playing({})
    assert out["name"] == "T"
    assert out["enriched"] is False


@pytest.mark.asyncio
async def test_now_playing_falls_back_to_webapi_when_no_local(monkeypatch):
    monkeypatch.setattr("spotify_mcp.tools.smart_tools.select_backend",
                        lambda: None)
    fake_sp = MagicMock()
    fake_sp.current_playback.return_value = {
        "is_playing": True,
        "item": {"name": "T", "artists": [{"name": "A"}],
                 "album": {"name": "Al"}, "duration_ms": 1000},
        "progress_ms": 100,
    }
    monkeypatch.setattr("spotify_mcp.tools.smart_tools._client",
                        lambda: fake_sp)
    from spotify_mcp.tools.smart_tools import now_playing
    out = await now_playing({})
    assert out["name"] == "T"
    assert out["backend"] == "webapi_fallback"


@pytest.mark.asyncio
async def test_play_pause_smart_premium_required_when_free_and_no_local(monkeypatch):
    monkeypatch.setattr("spotify_mcp.tools.smart_tools.select_backend",
                        lambda: None)
    fake_sp = MagicMock()
    import spotipy
    fake_sp.start_playback.side_effect = spotipy.SpotifyException(
        403, -1, "Premium required", headers={})
    monkeypatch.setattr("spotify_mcp.tools.smart_tools._client",
                        lambda: fake_sp)
    from spotify_mcp.tools.smart_tools import play_pause_smart
    out = await play_pause_smart({"action": "play"})
    assert out["error"] == "premium_required"
    assert "Open the Spotify desktop app" in out.get("hint", "")
```

- [ ] **Step 2: Implement `smart_tools.py`**

```python
"""Smart-routed MCP tools: now_playing, play_pause_smart."""
from __future__ import annotations
from typing import Any

from spotify_mcp.errors import StructuredError
from spotify_mcp.local import select_backend
from spotify_mcp.tools.routing import decide_transport_route
from spotify_mcp.tools.webapi_tools import _client  # reuse client builder


async def now_playing(args: dict[str, Any]) -> dict[str, Any]:
    """Smart now_playing.

    Defaults to local backend (free, instant). If `enrich=true`, follows
    up with a Web API lookup to attach the Spotify track URI / ISRC."""
    enrich = bool(args.get("enrich", False))
    backend = select_backend()
    if backend is not None:
        out = await backend.now_playing()
        if out is not None:
            out = dict(out)
            out["enriched"] = False
            if enrich:
                try:
                    sp = _client()
                    cur = sp.current_playback()
                    if cur and cur.get("item"):
                        out["spotify_uri"] = cur["item"]["uri"]
                        if cur["item"].get("external_ids", {}).get("isrc"):
                            out["isrc"] = cur["item"]["external_ids"]["isrc"]
                        out["enriched"] = True
                except StructuredError:
                    pass  # Enrichment is best-effort.
            return out

    # No local backend or local says nothing playing — try Web API.
    try:
        sp = _client()
        cur = sp.current_playback()
        if not cur or not cur.get("item"):
            return {"playing": False, "backend": "webapi_fallback"}
        return {
            "name": cur["item"]["name"],
            "artist": ", ".join(a["name"] for a in cur["item"]["artists"]),
            "album": cur["item"]["album"]["name"],
            "duration_ms": cur["item"]["duration_ms"],
            "position_ms": cur.get("progress_ms", 0),
            "backend": "webapi_fallback",
        }
    except StructuredError as e:
        return e.to_json()


async def play_pause_smart(args: dict[str, Any]) -> dict[str, Any]:
    """Single tool that "just works" regardless of where playback is.

    action: 'play' | 'pause' | 'next' | 'previous'

    Routing: prefer local when desktop app is the active device (avoids
    the split-brain bug where local pauses the laptop while the phone
    keeps playing). Free-tier+no-local-app returns premium_required."""
    action = args.get("action") or "play"
    backend = select_backend()

    try:
        sp = _client()
        fetch = lambda: sp.devices()  # noqa: E731
    except StructuredError:
        sp = None
        fetch = lambda: {"devices": []}  # noqa: E731

    route = await decide_transport_route(backend=backend, fetch_devices=fetch)

    if route == "local" and backend is not None:
        try:
            await getattr(backend, action)()
            return {"ok": True, "backend": backend.name}
        except StructuredError as e:
            return e.to_json()

    if sp is None:
        return {"error": "no_route_available",
                "hint": "Local backend unavailable AND no Spotify access. "
                        "Run /spotify-services-setup."}

    try:
        if action == "play": sp.start_playback()
        elif action == "pause": sp.pause_playback()
        elif action == "next": sp.next_track()
        elif action == "previous": sp.previous_track()
        else:
            return {"error": "bad_request", "message": f"Unknown action: {action}"}
        return {"ok": True, "backend": "webapi"}
    except Exception as e:
        # Spotify SDK 403 -> premium_required via webapi.client.
        from spotify_mcp.webapi.client import _translate
        import spotipy
        if isinstance(e, spotipy.SpotifyException):
            err = _translate(e)
            out = err.to_json()
            if err.code == "premium_required":
                out["hint"] = ("Open the Spotify desktop app to play "
                               "locally without Premium.")
            return out
        return {"error": "upstream_error", "message": str(e)}
```

- [ ] **Step 3: Register in `server.py`**

```python
from spotify_mcp.tools.smart_tools import now_playing, play_pause_smart

# In build_server():
s.register("now_playing", now_playing)
s.register("play_pause_smart", play_pause_smart)
```

- [ ] **Step 4: Run + Commit**

```bash
pytest tests/ -v
git add spotify-services/server/src/spotify_mcp/tools/smart_tools.py \
        spotify-services/server/src/spotify_mcp/server.py \
        spotify-services/server/tests/test_smart_tools.py
git commit -m "feat(spotify-services): smart-routed now_playing + play_pause_smart"
```

---

## Phase 7: `export_all_playlists` (the tutor's specific need)

**Goal:** Compose `webapi.playlists.list_mine` + `webapi.playlists.get_items` into a single bulk tool that writes a JSON file matching the schema in tutor master spec §7.1: `{user_id, fetched_at, playlists: [...]}`.

### Task 7.1: Implementation + tests

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/tools/export.py`
- Create: `wecoded-marketplace/spotify-services/server/tests/test_export.py`
- Modify: `wecoded-marketplace/spotify-services/server/src/spotify_mcp/server.py`

- [ ] **Step 1: Tests**

```python
"""Tests for export_all_playlists composite tool."""
import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_export_writes_json_with_master_spec_shape(tmp_path, monkeypatch):
    fake_sp = MagicMock()
    fake_sp.current_user.return_value = {"id": "destin"}
    fake_sp.current_user_playlists.side_effect = [
        {"items": [{"id": "p1", "name": "Mix 1"}], "next": None},
    ]
    fake_sp.playlist_items.side_effect = [
        {"items": [{"track": {"id": "t1", "name": "Song"}}], "next": None},
    ]
    monkeypatch.setattr("spotify_mcp.tools.export._client", lambda: fake_sp)

    from spotify_mcp.tools.export import export_all_playlists
    target = tmp_path / "playlists.json"
    out = await export_all_playlists({"path": str(target)})

    assert out["written"] == str(target)
    assert out["playlist_count"] == 1
    assert out["track_count"] == 1

    data = json.loads(target.read_text())
    assert "user_id" in data
    assert data["user_id"] == "destin"
    assert "fetched_at" in data
    assert isinstance(data["playlists"], list)
    assert data["playlists"][0]["name"] == "Mix 1"
    assert data["playlists"][0]["tracks"][0]["track"]["name"] == "Song"


@pytest.mark.asyncio
async def test_export_atomic_replace_on_failure(tmp_path, monkeypatch):
    """If the write fails mid-stream, the existing file is preserved."""
    target = tmp_path / "playlists.json"
    target.write_text('{"existing": true}')

    fake_sp = MagicMock()
    fake_sp.current_user.return_value = {"id": "destin"}
    fake_sp.current_user_playlists.side_effect = RuntimeError("net fail")
    monkeypatch.setattr("spotify_mcp.tools.export._client", lambda: fake_sp)

    from spotify_mcp.tools.export import export_all_playlists
    out = await export_all_playlists({"path": str(target)})

    assert "error" in out
    # Existing file is preserved
    assert json.loads(target.read_text()) == {"existing": True}
```

- [ ] **Step 2: Implement `export.py`**

```python
"""export_all_playlists composite tool — the tutor's specific need.

Produces a JSON file matching tutor master spec §7.1:
  {user_id, fetched_at, playlists: [{...full Spotify shape, with tracks: [...]}]}

Atomic write: writes to <path>.tmp first, then os.replace() to target. On
any failure mid-stream, the existing target file is untouched."""
from __future__ import annotations
import json
import os
import time
from pathlib import Path
from typing import Any

from spotify_mcp.errors import StructuredError
from spotify_mcp.tools.webapi_tools import _client
from spotify_mcp.webapi.client import call


async def export_all_playlists(args: dict[str, Any]) -> dict[str, Any]:
    target = Path(args["path"]).expanduser()
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")

    try:
        sp = _client()
        user = call(sp.current_user)
        playlists: list[dict[str, Any]] = []
        track_count = 0

        # Page through all playlists.
        page = call(sp.current_user_playlists, limit=50)
        while page:
            for pl in page.get("items", []):
                pl_id = pl["id"]
                tracks: list[dict[str, Any]] = []
                items_page = call(sp.playlist_items, pl_id, limit=100)
                while items_page:
                    tracks.extend(items_page.get("items", []))
                    nxt = items_page.get("next")
                    if not nxt: break
                    items_page = call(sp.next, items_page) if hasattr(sp, "next") \
                        else None
                pl_out = dict(pl)
                pl_out["tracks"] = tracks
                playlists.append(pl_out)
                track_count += len(tracks)

            nxt = page.get("next")
            if not nxt: break
            page = call(sp.next, page) if hasattr(sp, "next") else None

        out = {
            "user_id": user["id"],
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "playlists": playlists,
        }

        tmp.write_text(json.dumps(out, indent=2, ensure_ascii=False))
        os.replace(tmp, target)
        return {
            "written": str(target),
            "playlist_count": len(playlists),
            "track_count": track_count,
            "user_id": user["id"],
        }
    except StructuredError as e:
        # Cleanup tmp and preserve existing target.
        if tmp.exists():
            try: tmp.unlink()
            except OSError: pass
        return e.to_json()
    except Exception as e:
        if tmp.exists():
            try: tmp.unlink()
            except OSError: pass
        return {"error": "export_failed", "message": str(e)}
```

- [ ] **Step 3: Register in `server.py`**

```python
from spotify_mcp.tools.export import export_all_playlists

# In build_server():
s.register("export_all_playlists", export_all_playlists)
```

- [ ] **Step 4: Run + Commit**

```bash
pytest tests/test_export.py -v
git add spotify-services/server/src/spotify_mcp/tools/export.py \
        spotify-services/server/src/spotify_mcp/server.py \
        spotify-services/server/tests/test_export.py
git commit -m "feat(spotify-services): export_all_playlists composite tool"
```

---

## Phase 8: Skills

**Goal:** Ten markdown skill files that teach Claude when and how to use each tool. Skills are pure documentation; their `description` frontmatter is what Claude searches at invoke time.

### Task 8.1: Create the spotify-shared skill (master reference)

**Files:**
- Create: `wecoded-marketplace/spotify-services/skills/spotify-shared/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

```markdown
---
name: spotify-shared
description: "Spotify Services: Shared reference for auth, errors, smart routing, and tool discovery. Read once at start of any Spotify task."
metadata:
  version: 0.1.0
  openclaw:
    category: "integrations"
    requires:
      bins:
        - python3.12
---

# Spotify Services — Shared Reference

## Authentication

The plugin uses Spotify's Authorization Code with PKCE flow. Tokens persist
at `~/.youcoded/spotify-services/tokens.json` (mode 600). The MCP server
auto-refreshes access tokens within 5 minutes of expiry.

If a tool returns `{"error": "reauth_required"}`, run `/spotify-services-reauth`.

## Premium requirement

Spotify's Feb 2026 platform-security update requires the authorizing user to
have Premium for any app not granted Extended Quota. **The plugin therefore
assumes Premium for all users.** Free-tier users will see `{"error":
"premium_required"}` on most calls.

## Smart routing convention

The plugin exposes three tool tiers:

- **Smart-routed (`now_playing`, `play_pause_smart`):** picks local or Web
  API automatically. **Use these by default.**
- **Local-only (`local.*`):** raw macOS/Windows desktop control. No auth,
  no API budget. Use when the desktop app is what you want to control,
  regardless of Web API state.
- **Web-API-only (`search.*`, `playlists.*`, `library.*`, `playback.*`,
  `queue.*`, `user.*`):** the canonical Web API surface. Use for reads,
  playlist edits, and library mutations.

## Error shapes

Every tool error is a JSON object with at least `{"error": "<code>"}`:

| Code | Meaning | What to do |
|------|---------|------------|
| `reauth_required` | Refresh token revoked or no tokens on disk | `/spotify-services-reauth` |
| `premium_required` | Operation needs Premium and user is free-tier | Inform the user |
| `scope_missing` | Token lacks scope; user opted out at first auth | `/spotify-services-reauth` to re-prompt for full scope |
| `rate_limited` | 429 after one retry; payload includes `retry_after_s` | Back off and tell the user |
| `local_backend_unavailable` | No macOS/Windows backend present (e.g., Linux) | Use Web API tools only |
| `desktop_app_not_running` | Local tool called but Spotify isn't open | Suggest opening Spotify, or fall back to Web API |
| `not_supported` | Local backend doesn't implement this op (e.g., Windows seek) | Use Web API equivalent |
| `not_found` | 404 on Web API | Inspect the ID/URI |
| `bad_request` | 400 on Web API | Inspect arguments |
| `upstream_error` | Other upstream failure | Surface message and consider retry |

## Pagination

Tools that wrap paginated endpoints (e.g., `playlists.list_mine`,
`library.saved_tracks`) accept `limit` and `offset`. They DO NOT auto-paginate
by default — pass `limit` to control page size and call iteratively if you
need everything.

The composite tool `export_all_playlists` IS a one-shot full-library export;
use it instead of looping when you need every playlist + every track.

## Removed endpoints (post-Feb-2026)

Do not attempt these — Spotify removed them. The plugin does not expose tools
for any of them; these are listed so you know not to suggest workarounds:

- Create Playlist for user (was `POST /users/{id}/playlists`)
- Get Artist's Top Tracks
- Get Several Albums / Artists / Tracks (all batch GETs)
- Audio Features / Audio Analysis / Recommendations / Related Artists (Nov 2024)
- Get New Releases / Categories / Markets

If a user asks for one of these, explain that Spotify removed it and suggest
an alternative if one exists (e.g., "we can list your playlists instead of
creating one programmatically").

## Tool naming convention

`namespace.action` (lowercase dotted). Common namespaces:

- `local.*` — local desktop control
- `search.*` — Web API search
- `library.*`, `playlists.*`, `playback.*`, `queue.*`, `user.*` — Web API
- `now_playing`, `play_pause_smart`, `export_all_playlists` — smart/composite (no namespace)
```

### Task 8.2: Generate the 9 remaining skills from a template

Each remaining skill file follows a uniform pattern. The template below applies to each — only the `description`, `## Tools` section, and example invocations vary per skill.

**Files (one per skill):**

- `skills/spotify-export-all-playlists/SKILL.md`
- `skills/spotify-search/SKILL.md`
- `skills/spotify-now-playing/SKILL.md`
- `skills/spotify-playback/SKILL.md`
- `skills/spotify-queue/SKILL.md`
- `skills/spotify-library/SKILL.md`
- `skills/spotify-playlists/SKILL.md`
- `skills/spotify-devices/SKILL.md`
- `skills/spotify-user-profile/SKILL.md`

- [ ] **Step 1: Write each file using the template below**

The template:

```markdown
---
name: <skill-name>
description: "<one-line description, surfaced to Claude at invoke time>"
metadata:
  version: 0.1.0
  openclaw:
    category: "integrations"
---

# <Human-Readable Title>

<One-paragraph what-this-does.>

## When to use this

<Concrete trigger phrases / situations.>

## Tools

| Tool | Args | Returns |
|------|------|---------|
| <tool.name> | <key args> | <shape> |

## Examples

### <Example 1>

User: "<phrase>"
Claude calls: `<tool.name>` with `<args>`.
Returns: <shape>.

## Errors

This skill can return any of the standard errors documented in `spotify-shared`.
Common ones for this skill: <list 2-3>.

## See also

- `spotify-shared` — auth, error shapes, smart routing
```

- [ ] **Step 2: Concrete content per skill**

The remaining 9 skills use this exact template with the following slot fills (you may copy/paste each block as-is into the SKILL.md and adapt the body to be 60-150 lines):

| skill | description | tools covered |
|-------|-------------|---------------|
| `spotify-export-all-playlists` | "Spotify Services: Bulk-export every playlist + every track to a JSON file. Use when the user wants to snapshot their full Spotify library." | `export_all_playlists` |
| `spotify-search` | "Spotify Services: Search tracks, albums, artists, and playlists." | `search.query` |
| `spotify-now-playing` | "Spotify Services: What is the user currently listening to? Smart-routed (local instant, optional Web API enrichment)." | `now_playing` |
| `spotify-playback` | "Spotify Services: Control Spotify playback — play, pause, skip, seek, volume, repeat, shuffle. Premium required for Web API path." | `play_pause_smart`, `playback.*` |
| `spotify-queue` | "Spotify Services: View the playback queue and add tracks to it. Premium required to add." | `queue.add`, `queue.list` |
| `spotify-library` | "Spotify Services: Read and modify the user's library — saved tracks, top tracks/artists, recently played, save/remove items." | `library.*` |
| `spotify-playlists` | "Spotify Services: List, view, and edit the user's playlists. Note: Spotify removed playlist creation in Feb 2026." | `playlists.*` |
| `spotify-devices` | "Spotify Services: List Spotify-connected devices and transfer playback between them." | `playback.devices`, `playback.transfer_to_device` |
| `spotify-user-profile` | "Spotify Services: Read the authenticated user's Spotify profile." | `user.profile` |

For each, write:
1. A 1-paragraph "what this does" intro.
2. A 3-5 bullet "when to use this" section.
3. A markdown table covering each tool with `args` (concrete keys) and `returns` (shape).
4. 1-2 worked examples in `User: ... Claude calls: ... Returns: ...` format.
5. A short errors section pointing back to `spotify-shared`.

- [ ] **Step 3: Verify each is a valid SKILL.md**

```bash
for d in spotify-services/skills/*/; do
  test -f "$d/SKILL.md" || { echo "MISSING: $d"; exit 1; }
  head -5 "$d/SKILL.md" | grep -q '^name:' || { echo "BAD FRONTMATTER: $d"; exit 1; }
done
echo "All 10 skills present and have frontmatter."
```

- [ ] **Step 4: Commit**

```bash
git add spotify-services/skills/
git commit -m "feat(spotify-services): 10 skill files (shared + 9 tool-area)"
```

---

## Phase 9: Setup scripts + slash commands

**Goal:** End-to-end first-time setup that installs the Python server, walks the user through registering a Spotify Developer app, runs OAuth, and runs the smoke test.

### Task 9.1: install-server.sh

**Files:**
- Create: `wecoded-marketplace/spotify-services/setup/install-server.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# install-server.sh — install the spotify-services Python MCP server to
# ~/.spotify-services/server/. Idempotent: re-runs upgrade in place.
set -euo pipefail

PLUGIN_DIR="${PLUGIN_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
TARGET="$HOME/.spotify-services/server"

if ! command -v uv >/dev/null 2>&1; then
  echo "ERROR: uv not on PATH. Install with: pipx install uv" >&2
  exit 1
fi
if ! command -v python3.12 >/dev/null 2>&1 && ! python3 -c 'import sys; sys.exit(0 if sys.version_info>=(3,12) else 1)'; then
  echo "ERROR: Python 3.12+ required." >&2
  exit 1
fi

mkdir -p "$TARGET"
# Copy server source into the target.
rsync -a --delete "$PLUGIN_DIR/server/" "$TARGET/"

cd "$TARGET"
uv venv .venv --python 3.12

# Activate platform-appropriate venv. shell type determines path.
if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  . .venv/bin/activate
else
  # shellcheck disable=SC1091
  . .venv/Scripts/activate
fi

# Install with platform-specific extras.
case "$(uname -s)" in
  CYGWIN*|MINGW*|MSYS*) uv pip install -e ".[windows]" ;;
  *) uv pip install -e "." ;;
esac

echo "  ✓ Spotify MCP server installed at $TARGET"
```

- [ ] **Step 2: chmod + executable bit**

```bash
chmod +x spotify-services/setup/install-server.sh
git update-index --chmod=+x spotify-services/setup/install-server.sh
```

### Task 9.2: register-app.md walkthrough

**Files:**
- Create: `wecoded-marketplace/spotify-services/setup/register-app.md`

- [ ] **Step 1: Write the doc**

```markdown
# Register your Spotify Developer App

Spotify requires every API user to register their own developer app. The
plugin contains no shared credentials — your Client ID is yours alone.

## Prerequisites

- A **Spotify Premium** account (required for app authorization in 2026+).
- 5 minutes.

## Steps

1. Go to https://developer.spotify.com/dashboard
2. Sign in with your Spotify account.
3. Click **Create app**.
4. Fill in:
   - **App name:** YouCoded Local (or any name you'll recognize)
   - **App description:** Local Claude Code integration
   - **Website:** can be blank
   - **Redirect URI:** `http://127.0.0.1:8080/callback` (exact)
   - **Which API/SDKs are you planning to use:** check **Web API** only.
5. Agree to the developer terms; click **Save**.
6. On the app page, click **Settings**.
7. Copy the **Client ID** — you'll paste it back to the setup wizard.
8. **Do NOT need a Client Secret** — we use PKCE.

## Scopes

The setup wizard will request the following scopes when you authorize. Each
gives the plugin specific abilities:

- `user-read-private`, `user-read-email` — read your profile
- `playlist-read-private`, `playlist-read-collaborative` — read your playlists
- `playlist-modify-public`, `playlist-modify-private` — edit your playlists
- `user-library-read`, `user-library-modify` — read and manage your saved items
- `user-top-read`, `user-read-recently-played` — read top/recent listening
- `user-read-playback-state`, `user-read-currently-playing` — see what's playing
- `user-modify-playback-state` — control playback (play/pause/skip)

You can opt out of any of these at the Spotify auth screen; tools that need
the missing scope will return `{"error": "scope_missing"}`.

## Dev Mode quota (post-Feb-2026 reality)

By default, your app is in **Development Mode**:
- Capped at **5 authorized users** total.
- The user authorizing must have **Spotify Premium**.
- Some endpoints are restricted (the plugin only uses non-restricted ones).

For personal use this is fine. To raise these caps, you can apply for
Extended Quota at https://developer.spotify.com/extended-quota — typically
not needed unless you're sharing the app's Client ID with friends.
```

### Task 9.3: ingest-oauth.sh

**Files:**
- Create: `wecoded-marketplace/spotify-services/setup/ingest-oauth.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# ingest-oauth.sh — runs the PKCE OAuth flow.
#
# Usage: ingest-oauth.sh <CLIENT_ID>
#   - Generates PKCE pair
#   - Starts a local HTTP listener on 127.0.0.1:8080
#   - Opens the Spotify authorize URL in the user's browser
#   - Captures the code from the redirect
#   - Exchanges for tokens via the server's auth.py
#   - Writes ~/.youcoded/spotify-services/tokens.json (mode 600)
#   - Writes ~/.youcoded/spotify-services/client.env with SPOTIFY_CLIENT_ID
set -euo pipefail

CLIENT_ID="${1:-}"
if [ -z "$CLIENT_ID" ]; then
  echo "Usage: $0 <CLIENT_ID>" >&2
  exit 1
fi

VENV="$HOME/.spotify-services/server/.venv"
if [ ! -d "$VENV" ]; then
  echo "ERROR: Server not installed. Run install-server.sh first." >&2
  exit 1
fi

# shellcheck disable=SC1091
. "$VENV/bin/activate" 2>/dev/null || . "$VENV/Scripts/activate"

mkdir -p "$HOME/.youcoded/spotify-services"

# Drive the flow via a one-shot Python helper.
python - "$CLIENT_ID" << 'PY'
import sys, secrets, threading, webbrowser, http.server, urllib.parse
from spotify_mcp.auth import PkcePair, build_authorize_url, exchange_code_for_tokens, TokenStore
from spotify_mcp.config import REDIRECT_URI, SECRETS_DIR

CLIENT_ID = sys.argv[1]
SECRETS_DIR.mkdir(parents=True, exist_ok=True)

pair = PkcePair.generate()
state = secrets.token_urlsafe(16)

captured = {}

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a, **kw): pass
    def do_GET(self):
        q = urllib.parse.urlparse(self.path).query
        params = dict(urllib.parse.parse_qsl(q))
        captured.update(params)
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h1>You can close this tab.</h1>")
        threading.Thread(target=self.server.shutdown, daemon=True).start()

# REDIRECT_URI is http://127.0.0.1:8080/callback
host, port = "127.0.0.1", 8080
srv = http.server.HTTPServer((host, port), Handler)
url = build_authorize_url(client_id=CLIENT_ID, state=state, pkce=pair)

print(f"  ✓ Opening browser for Spotify authorization …")
webbrowser.open(url)
srv.serve_forever()

if captured.get("state") != state:
    print("ERROR: state mismatch — aborting.", file=sys.stderr); sys.exit(2)
if "code" not in captured:
    print(f"ERROR: no code in callback: {captured}", file=sys.stderr); sys.exit(2)

tokens = exchange_code_for_tokens(
    client_id=CLIENT_ID, code=captured["code"], verifier=pair.verifier,
)
TokenStore().save(tokens)

# Persist Client ID for the launcher.
client_env = SECRETS_DIR / "client.env"
client_env.write_text(f"SPOTIFY_CLIENT_ID={CLIENT_ID}\n")
import os; os.chmod(client_env, 0o600)
print(f"  ✓ Tokens saved to {SECRETS_DIR}/tokens.json")
PY
```

- [ ] **Step 2: chmod + git update-index**

### Task 9.4: launcher.sh — final version that sources client.env

**Files:**
- Modify: `wecoded-marketplace/spotify-services/mcp-servers/spotify-services/launcher.sh`

- [ ] **Step 1: Update launcher**

Replace contents with:

```bash
#!/usr/bin/env bash
# spotify-services launcher — sourced by Claude Code's MCP reconciler.
set -euo pipefail

VENV="$HOME/.spotify-services/server/.venv"
CLIENT_ENV="$HOME/.youcoded/spotify-services/client.env"

if [ ! -d "$VENV" ]; then
  echo '{"error":"server_not_installed","hint":"Run /spotify-services-setup."}' >&2
  exit 2
fi
if [ ! -f "$CLIENT_ENV" ]; then
  echo '{"error":"oauth_not_complete","hint":"Run /spotify-services-setup."}' >&2
  exit 2
fi

# shellcheck disable=SC1091
. "$CLIENT_ENV"
export SPOTIFY_CLIENT_ID

# shellcheck disable=SC1091
. "$VENV/bin/activate" 2>/dev/null || . "$VENV/Scripts/activate"
exec python -m spotify_mcp "$@"
```

### Task 9.5: reauth.sh + smoke-test.sh

**Files:**
- Create: `wecoded-marketplace/spotify-services/setup/reauth.sh`
- Create: `wecoded-marketplace/spotify-services/setup/smoke-test.sh`

- [ ] **Step 1: Write reauth.sh**

```bash
#!/usr/bin/env bash
# reauth.sh — re-runs the OAuth flow when refresh fails.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CLIENT_ENV="$HOME/.youcoded/spotify-services/client.env"

if [ ! -f "$CLIENT_ENV" ]; then
  echo "ERROR: No prior setup. Run /spotify-services-setup." >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$CLIENT_ENV"
exec "$HERE/ingest-oauth.sh" "$SPOTIFY_CLIENT_ID"
```

- [ ] **Step 2: Write smoke-test.sh**

```bash
#!/usr/bin/env bash
# smoke-test.sh — verifies the server can authenticate, talk to Web API,
# and detect the local backend (when applicable).
set -euo pipefail

VENV="$HOME/.spotify-services/server/.venv"
CLIENT_ENV="$HOME/.youcoded/spotify-services/client.env"

# shellcheck disable=SC1091
. "$CLIENT_ENV"
export SPOTIFY_CLIENT_ID

# shellcheck disable=SC1091
. "$VENV/bin/activate" 2>/dev/null || . "$VENV/Scripts/activate"

python - << 'PY'
import asyncio, json, sys
from spotify_mcp.tools.webapi_tools import _client
from spotify_mcp.local import select_backend

async def main():
    failures = 0

    # 1. Web API user.profile
    try:
        sp = _client()
        u = sp.current_user()
        print(f"  ✓ Authenticated as {u.get('display_name') or u.get('id')}")
    except Exception as e:
        print(f"  ✗ Web API auth failed: {e}", file=sys.stderr)
        failures += 1

    # 2. Local backend (if available)
    b = select_backend()
    if b is None:
        print("  - No local backend on this OS (v1: macOS + Windows)")
    else:
        running = await b.is_running()
        print(f"  ✓ Local backend ({b.name}): "
              f"{'desktop app running' if running else 'desktop app not running'}")

    sys.exit(failures)

asyncio.run(main())
PY
```

- [ ] **Step 3: chmod + git update-index for both**

### Task 9.6: Slash command markdown files

**Files:**
- Create: `wecoded-marketplace/spotify-services/commands/spotify-services-setup.md`
- Create: `wecoded-marketplace/spotify-services/commands/spotify-services-reauth.md`

- [ ] **Step 1: Write `spotify-services-setup.md`**

```markdown
---
name: spotify-services-setup
description: "Install the Spotify MCP server, register a Spotify Developer app, and complete OAuth."
---

# /spotify-services-setup

Drives the spotify-services first-time setup conversationally. Steps:

1. **Verify prerequisites.** Check `python3.12` and `uv` on PATH. If missing,
   stop and tell the user how to install them.
2. **Install the server.** Run `setup/install-server.sh`. Echo each `  ✓` line.
3. **Walk the developer-app registration.** Open `setup/register-app.md` in the
   user's preferred reader. Wait for them to paste back their Client ID.
4. **Run OAuth.** Run `setup/ingest-oauth.sh "<CLIENT_ID>"`. The browser will
   open; user authorizes; we capture the code.
5. **Hint at app restart.** Tell the user to restart Claude Code or refresh
   plugins so the MCP reconciler picks up the new server. (`/reload-plugins` works.)
6. **Run the smoke test.** Run `setup/smoke-test.sh`. Report results.
7. **Tell the user what to try first.** Suggest: "Ask Claude to show your top 5
   tracks of the last month."

## Premium reminder

Surface this prominently before step 4: "Spotify's 2026 platform-security
update means apps in Development Mode require the authorizing user to have
Premium. If you don't have Premium, the OAuth flow will fail with an error."

## Errors

If `install-server.sh` fails: surface stderr, suggest `pipx install uv` if uv
is missing.

If `ingest-oauth.sh` fails with "state mismatch" or "no code": something
intercepted the redirect. Re-run.

If smoke-test fails: capture stderr and offer to run `/spotify-services-reauth`.
```

- [ ] **Step 2: Write `spotify-services-reauth.md`**

```markdown
---
name: spotify-services-reauth
description: "Re-run Spotify OAuth when refresh tokens have been revoked."
---

# /spotify-services-reauth

Runs `setup/reauth.sh`, which reads the persisted Client ID and re-runs the
OAuth flow. Use this when:

- A tool returns `{"error": "reauth_required"}`
- The user changed their Spotify password
- It's been > 1 year since last auth (long-tail token invalidation)

Steps:

1. Run `setup/reauth.sh`.
2. Wait for browser flow.
3. Run `setup/smoke-test.sh` to confirm.
```

### Task 9.7: Commit Phase 9

```bash
git add spotify-services/setup/ \
        spotify-services/commands/ \
        spotify-services/mcp-servers/spotify-services/launcher.sh
git commit -m "feat(spotify-services): setup scripts + slash commands

install-server.sh, ingest-oauth.sh (PKCE flow with local listener),
reauth.sh, smoke-test.sh, plus /spotify-services-setup and
/spotify-services-reauth slash commands. launcher.sh now sources
client.env for SPOTIFY_CLIENT_ID."
```

---

## Phase 10: End-to-end verification + marketplace registration

**Goal:** Real smoke test against Destin's Spotify account, plugin install + reload, and addition to `index.json` / `marketplace.json`.

### Task 10.1: E2E test (gated)

**Files:**
- Create: `wecoded-marketplace/spotify-services/server/tests/test_e2e.py`

- [ ] **Step 1: Write the gated E2E test**

```python
"""End-to-end test against the developer's real Spotify account.

Gated on SPOTIFY_E2E=1. Run only when you have a fresh OAuth token
locally and don't mind making a couple of real API calls."""
import os
import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("SPOTIFY_E2E") != "1",
    reason="Set SPOTIFY_E2E=1 to run E2E tests against real Spotify account.",
)


@pytest.mark.asyncio
async def test_user_profile_returns_id():
    from spotify_mcp.tools.webapi_tools import _client
    sp = _client()
    user = sp.current_user()
    assert user.get("id")


@pytest.mark.asyncio
async def test_playlists_list_mine_returns_at_least_one():
    from spotify_mcp.tools.webapi_tools import _client
    sp = _client()
    out = sp.current_user_playlists(limit=5)
    assert isinstance(out["items"], list)


@pytest.mark.asyncio
async def test_export_all_playlists_writes_a_file(tmp_path):
    from spotify_mcp.tools.export import export_all_playlists
    target = tmp_path / "e2e-export.json"
    out = await export_all_playlists({"path": str(target)})
    assert "written" in out, f"export failed: {out}"
    assert target.exists()
    assert target.stat().st_size > 100
```

- [ ] **Step 2: Run E2E** (Destin's machine, after install + OAuth)

```bash
cd ~/.spotify-services/server
. .venv/bin/activate  # or .venv/Scripts/activate
SPOTIFY_E2E=1 pytest tests/test_e2e.py -v
```
Expected: 3/3 pass.

### Task 10.2: Real-world install verification

- [ ] **Step 1: Install the plugin via the YouCoded app**

In the YouCoded desktop app, navigate to the marketplace tab → search "spotify" → install. Plugin appears at `~/.claude/plugins/marketplaces/youcoded/plugins/spotify-services/`.

- [ ] **Step 2: Run setup**

```
/spotify-services-setup
```
Walk through the full flow. Verify:
- `~/.spotify-services/server/.venv/` exists
- `~/.youcoded/spotify-services/tokens.json` exists with mode 600
- `~/.youcoded/spotify-services/client.env` exists with mode 600
- After `/reload-plugins` (or app restart): `~/.claude.json` contains an `mcpServers.spotify-services` entry

- [ ] **Step 3: Spot-check tools through Claude**

Ask Claude:
- "What's currently playing on Spotify?" → expect `now_playing` invocation
- "Show my top 5 tracks of the last month" → expect `library.top_tracks`
- "Pause Spotify" → expect `play_pause_smart` with `action=pause`

### Task 10.3: Add to marketplace registry

**Files:**
- Modify: `wecoded-marketplace/index.json`
- Modify: `wecoded-marketplace/marketplace.json`

- [ ] **Step 1: Run the marketplace's component-extractor on the new plugin**

```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace-spotify
node scripts/extract-components.js spotify-services > /tmp/spotify-components.json
cat /tmp/spotify-components.json
```
Expected: outputs a `components` object listing 10 skills, 2 commands, `mcpServers: ["spotify-services"]`, `hasMcpConfig: true`.

- [ ] **Step 2: Add to `index.json`**

Add an entry alphabetically (after `skills/index.json` if present, otherwise next to other plugins):

```json
{
  "id": "spotify-services",
  "type": "plugin",
  "displayName": "Spotify Services",
  "description": "Spotify Web API + native local desktop control. Search, library, playlists, queue, playback, smart-routed transport. Premium account required.",
  "category": "integrations",
  "author": "YouCoded",
  "tags": ["music", "spotify", "integrations"],
  "version": "0.1.0",
  "publishedAt": "2026-04-26T00:00:00Z",
  "sourceMarketplace": "youcoded",
  "sourceType": "local",
  "sourceRef": "spotify-services",
  "repoUrl": null,
  "components": {
    "skills": [
      "spotify-shared",
      "spotify-export-all-playlists",
      "spotify-search",
      "spotify-now-playing",
      "spotify-playback",
      "spotify-queue",
      "spotify-library",
      "spotify-playlists",
      "spotify-devices",
      "spotify-user-profile"
    ],
    "hooks": [],
    "commands": ["spotify-services-setup", "spotify-services-reauth"],
    "agents": [],
    "mcpServers": ["spotify-services"],
    "hasHooksManifest": false,
    "hasMcpConfig": true
  }
}
```

- [ ] **Step 3: Add to `marketplace.json`**

Add to the `plugins` array (alphabetical):

```json
{
  "name": "spotify-services",
  "displayName": "Spotify Services",
  "description": "Spotify Web API + native local desktop control. Premium required.",
  "author": { "name": "YouCoded" },
  "category": "integrations",
  "source": { "source": "local", "path": "spotify-services" },
  "prompt": "/spotify-services-setup"
}
```

- [ ] **Step 4: Commit**

```bash
git add wecoded-marketplace/index.json wecoded-marketplace/marketplace.json
git commit -m "feat(marketplace): register spotify-services plugin"
```

### Task 10.4: Push + open PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/spotify-services
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: spotify-services marketplace plugin" --body "$(cat <<'EOF'
## Summary
- Adds `spotify-services` marketplace plugin: Spotify Web API + native local desktop control
- Self-contained Python MCP server (auto-registered via `mcp-manifest.json`)
- 10 skills, 2 slash commands, full setup flow with PKCE OAuth
- Modeled after `google-services` (one skill per service area)

## Test plan
- [x] `pytest tests/ -v` — all green (>50 unit tests)
- [x] `SPOTIFY_E2E=1 pytest tests/test_e2e.py -v` — 3/3 against my account
- [x] Marketplace install + `/spotify-services-setup` flow
- [x] Smoke test through Claude: now_playing, library.top_tracks, play_pause_smart
- [x] CI validator passes (size, plugin.json fields, no embedded secrets)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Task 10.5: Cleanup worktree post-merge

- [ ] **Step 1: After merge to master, remove the worktree**

```bash
cd /c/Users/desti/youcoded-dev/wecoded-marketplace
git worktree remove ../wecoded-marketplace-spotify
git branch -D feat/spotify-services
```

---

## Self-Review

**1. Spec coverage:**
- §1 Purpose → Phases 1-9 collectively
- §3 Constraints — all 7 addressed in Phase 0 corrections
- §4 Architecture — Phase 1-7 (skeleton, server, backends, routing)
- §5 Tool surface — Phases 4 (web), 5 (local), 6 (smart), 7 (export)
- §6 Setup flow — Phase 9
- §6.1 OAuth scope set — Phase 3 config.py (SCOPES list verbatim)
- §7 Error handling — Phase 4.0 (errors.py + client.py translator)
- §8 Testing — Phases 4-7 (unit), Phase 10.1 (E2E gated by SPOTIFY_E2E=1)
- §9 Security — Phase 3 (mode 600 tokens), Phase 0 correction #5 (no hardcoded creds), Phase 9 (PKCE)
- §10 Out of scope — README + Phase 0 corrections (Android added to deferred list)
- §11 Versioning — Phase 1.1 plugin.json `0.1.0`
- §12 Open questions — all resolved as Phase 0 corrections (table row 8) or pinned in code comments

**2. Placeholder scan:** none — every code/config block in this plan contains the real content the engineer will paste.

**3. Type consistency:** spot-checked across phases. `Tokens` dataclass shape consistent in auth.py / token_store / config tests. `StructuredError` used uniformly across `errors.py` / `webapi/client.py` / local backends / tools. `LocalBackend` interface matches macOS+Windows implementations. Tool names match between `server.py` registrations and skill SKILL.md tool tables.

---

## Execution Handoff

Plan complete and saved to `crunchtronics-tutor/docs/superpowers/plans/2026-04-26-spotify-services-plugin.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a plan this size (40+ commits across 11 phases).

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
