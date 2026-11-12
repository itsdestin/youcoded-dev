---
status: draft
card: 252
---
# Seeing and comparing other AI apps directly — how far we got (2026-11-10 to 2026-11-12)

Parked by Destin on 2026-11-12 to return to later. Nothing here is a saved tool yet: the working
commands below were run by hand from a temporary folder.

## What Destin asked for

A way to install apps like Claude desktop / Cowork, GPT / Codex desktop and the Hermes desktop
app, click through their menus, take pictures, and compare features and menus with YouCoded's.
Before this, every comparison in the workspace was done by reading websites and docs, never by
using the apps (see `docs/archive/investigations/2026-10-23-architecture-comparison-cowork-codex.md`).

## Where it stands

| Step | State |
|---|---|
| Claude desktop installed on this computer (z13, CachyOS) | Done, version 4.23118.1 |
| Signed in | Done by Destin (Ultra plan) |
| Driven on a hidden screen, clicks landing, pictures taken | Proven: three pictures |
| Full tour of Claude's menus, settings and tabs | Not started |
| Side-by-side feature list against YouCoded | Not started |
| Saved, reusable tool | Not started |
| Codex, Hermes, other apps | Not started |

Pictures: `~/Documents/rival-app-shots/claude-desktop/` (home screen, top-left menu, side panel).
Built package kept at `~/Downloads/claude-desktop/claude-desktop-4.23118.1-1-x86_64.pkg.tar.zst`.

## Facts established

**Claude desktop has an official Linux version** (beta, Ubuntu and Debian only; Chat, Cowork and
Claude Code included; Computer Use and dictation not). Source: `https://claude.com/download` and
`https://code.claude.com/docs/en/desktop-linux`.

**The community Arch package `claude-desktop` (AUR) is Anthropic's own app, unmodified.** Checked on
2026-11-10:

- Anthropic's signing key fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE` matches their
  install guide, and their release list (`InRelease`) carries a good signature from it.
- The recipe downloads the `.deb` from `downloads.claude.ai`; its required SHA-256 for 4.23118.1
  (`b09ccdd7…d287a`) equals the one in Anthropic's signed list and the file downloaded by hand.
- The recipe's only changes: a 37-line launcher that picks the Wayland display, pointers so Cowork
  finds its virtual machine parts on Arch, the licence copied, Debian-only setup steps skipped.
- Avoid `cachyos/claude-desktop` (a month and many versions behind) and `claude-desktop-extra`
  (modifies the app).

**Each update needs the same check.** One volunteer maintains the recipe. Do not use the app's own
"Update available" button; rebuild from the recipe after re-checking the SHA-256 against
Anthropic's signed list.

**YouCoded's own screenshot method cannot be used.** The app lists `remote-debugging-port` and
`remote-debugging-pipe` among switches it refuses, and its integrity fuses are on (`010011011`:
no run-as-node, no inspect arguments, asar integrity enforced). Do not work around this.

**What works: a hidden screen, pictures, and a pretend mouse.** `Xvfb` gives a memory-only screen,
`import` (ImageMagick) takes the picture, `xdotool` clicks and types. Destin's real screen, mouse
and keyboard are untouched. The same method should work for any app.

**The sign-in carries over** from Destin's normal launch to the hidden screen (same profile
folder, `~/.config/Claude`).

**Only one copy of Claude can run.** Destin must quit his own before a hidden one starts. Check
first, and never close his copy for him.

**Claude reads the conversation folder YouCoded shares.** Its home screen offers "Import 793
Claude Code CLI sessions". What importing does to YouCoded's copy is unknown. `~/.claude/settings.json`
was not modified by the install or first launch.

## Do not click without asking Destin

- "Import … Claude Code CLI sessions" (unknown effect on shared history).
- "Update available" (skips the fingerprint check).
- Sending a message or starting a Cowork task (uses his plan).

Also told to Destin: Anthropic's consumer terms restrict automated use; slow, person-like clicking
through menus on his own account is low risk, not zero.

## The working commands

```bash
# WHY: a memory-only screen (:99) so the app never shows on, or takes input from, the real desktop.
RIG=<a working folder>; mkdir -p "$RIG/shots"; cd "$RIG"
nohup Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp > xvfb.log 2>&1 &
echo $! > xvfb.pid; sleep 2

# WHY: the package's launcher sends the window to the real Wayland screen unless these hints are cleared.
nohup env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 DISPLAY=:99 \
  claude-desktop --ozone-platform=x11 > app.log 2>&1 &
echo $! > app.pid; sleep 25

export DISPLAY=:99
# WHY: there is no window manager on the hidden screen, so size and place the window by hand.
W=$(xdotool search --onlyvisible --name Claude | head -1)
xdotool windowmove "$W" 0 0 windowsize "$W" 1600 1000; sleep 2

import -window root shots/home.png                 # take a picture
xdotool mousemove 26 18 click 1; sleep 2           # top-left menu (File, Edit, View, Go, Help)
xdotool key Escape
xdotool mousemove 58 18 click 1; sleep 2           # side panel

# Stop: the app first, then the screen (run under bash; zsh does not split unquoted variables).
bash -c 'kill "$(cat app.pid)"; sleep 6; kill "$(cat xvfb.pid)"'
```

Rebuilding the package after an update (no administrator rights needed until the install):

```bash
git clone https://aur.archlinux.org/claude-desktop.git && cd claude-desktop
# Read PKGBUILD and claude-desktop.sh, compare sha256sums_x86_64 with Anthropic's signed Packages list, then:
makepkg -f
# Destin installs it himself:  sudo pacman -U claude-desktop-<version>-x86_64.pkg.tar.zst
```

## Open questions for the next session

1. Full tour of Claude first, or build the saved tool first? (Destin had not chosen.)
2. Where the tool lives: beside `scripts/shoot/`, as a separate driver for apps that are not ours.
3. Whether Cowork works on this computer at all (needs its own virtual machine; untested).
4. Codex and Hermes: Linux availability, sign-in needs and whether each allows the YouCoded-style
   method were not checked.
5. Reading small text from pictures is the weak point; the screen-reader interface (AT-SPI) may
   give exact menu text and was not tried.
