#!/usr/bin/env python3
"""Theme preview pictures, photographed from the real app.

WHY (Destin, 2026-09-24, theme-cards-review TC-1: "i want to improve our preview
renders ... preferably, screenshots of the theme in a preview window"): every theme's
preview.png used to be a mock HTML page drawn from the theme's tokens (wecoded-themes
scripts/generate-previews.js; the built-ins were made by it once). This takes the
real renderer in the UI Workbench — whole window, the landing page's sample
conversation — in each theme, and writes an 800x500 preview.png where the app and
the registry read it.

Usage (with a workbench serving — scripts/run-workbench.sh):
    python3 scripts/ui-review/theme-previews.py [--port 5233] [--workspace DIR]
        [--only slug,slug] [--dry-run]

Writes:
    <workspace>/youcoded/desktop/src/renderer/themes/builtin/previews/<slug>.png  (4 built-ins)
    <workspace>/wecoded-themes/themes/<slug>/preview.png                          (community)

Nothing here commits, pushes or opens a pull request.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image

BUILTINS = ["light", "dark", "midnight", "creme"]
# 1000x625 is the preview's own 16:10 shape. A smaller window than a laptop's keeps
# the short sample conversation filling the picture instead of a third of it; it is
# shrunk to 800x500 on the way out.
WIDTH, HEIGHT = 1000, 625
OUT_SIZE = (800, 500)


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=5233)
    ap.add_argument("--workspace", default=os.path.abspath(os.path.join(here, "..", "..")))
    ap.add_argument("--only", default="")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    community_dir = os.path.join(a.workspace, "wecoded-themes", "themes")
    builtin_dir = os.path.join(a.workspace, "youcoded", "desktop", "src", "renderer", "themes", "builtin", "previews")
    community = sorted(d for d in os.listdir(community_dir) if os.path.isfile(os.path.join(community_dir, d, "manifest.json")))
    targets = {s: os.path.join(builtin_dir, f"{s}.png") for s in BUILTINS}
    targets.update({s: os.path.join(community_dir, s, "preview.png") for s in community})
    if a.only:
        wanted = set(a.only.split(","))
        targets = {k: v for k, v in targets.items() if k in wanted}
    if not targets:
        print("no themes to shoot", file=sys.stderr)
        return 2

    plan = {
        "_why": "theme preview pictures (theme-previews.py)",
        "base": f"http://127.0.0.1:{a.port}/?mode=workbench&child=1&latency=0&scenario=site",
        "width": WIDTH, "height": HEIGHT, "boot": 3500,
        "shots": [{
            "name": "preview",
            # The picture IS the resting app, so it is expected to match the boot
            # frame; the actions only clear any Look override and let the reply
            # animations finish.
            "sameAsBaseline": True,
            "actions": [
                {"eval": "window.__workbenchAppearanceSync && window.__workbenchAppearanceSync({lookOverrides:{}})", "settle": 400},
                {"wait": 6000},
            ],
        }],
    }
    with tempfile.TemporaryDirectory() as tmp:
        plan_path = os.path.join(tmp, "theme-previews.json")
        with open(plan_path, "w") as f:
            json.dump(plan, f)
        out = os.path.join(tmp, "shots")
        r = subprocess.run(["node", os.path.join(here, "shot.mjs"), plan_path, out, ",".join(targets)], text=True, capture_output=True)
        print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr.strip())
        failed = []
        for slug, dest in targets.items():
            src = os.path.join(out, slug, "preview.png")
            if not os.path.isfile(src):
                failed.append(slug)
                continue
            img = Image.open(src).convert("RGB").resize(OUT_SIZE, Image.LANCZOS)
            if a.dry_run:
                print(f"would write {dest}")
                continue
            img.save(dest, optimize=True)
            print(f"wrote {dest}")
        if failed:
            print("NOT captured (check the workbench and shot.mjs output): " + ", ".join(failed), file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
