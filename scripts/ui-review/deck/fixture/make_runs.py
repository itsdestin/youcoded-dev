"""The synthetic screenshot run every deck fixture is built on: flat 1440x900 'shots' with a
known rectangle that changes between `before` and `after`, plus a manifest carrying two known
measurements. Lets a deck be built and rendered without Chrome, the workbench, or a real sweep.

WHY it lives here and not in tests/fixture.py, where it started: `review-cards.py selfie` needs
the SAME synthetic run to render the deck against its own past self, and two generators of the
"same" pictures would drift — at which point the selfie's before/after diff would be measuring
the fixture rather than the deck. One generator, two callers (tests/fixture.py imports it).

Everything here is deterministic on purpose. The selfie boxes what MOVED between two renders,
so any pixel that wobbles run to run becomes a box drawn around nothing."""
import json
import os
import subprocess

# The crop the fixture decks show: a window onto the middle of the shot, where the red block is.
GEO = '400x200+500+250'
# A second crop, elsewhere on the shot, so a choice step has two genuinely different pictures.
GEO_B = '300x160+100+100'


def make_runs(root, themes=('midnight', 'light'), runs=('before', 'after')):
    """One folder per run under `root`, each a `shots-main` plan with one `home` shot per theme
    and a manifest. `after` gains a red block (inside GEO) and a small blue square in the corner
    (outside it), so a crop-limited diff and a whole-shot diff give different answers.
    Returns {run name: its folder}."""
    for run in runs:
        for theme in themes:
            d = os.path.join(root, run, 'shots-main', theme)
            os.makedirs(d, exist_ok=True)
            cmd = ['magick', '-size', '1440x900', 'xc:#202020' if theme == 'midnight' else 'xc:#EEEEEE']
            if run == 'after':
                cmd += ['-fill', 'red', '-draw', 'rectangle 560,260 679,299', '-fill', 'blue', '-draw', 'rectangle 20,20 29,29']
            subprocess.run(cmd + [os.path.join(d, 'home.png')], check=True)
        mf = [{'name': 'home', 'theme': t, 'verified': True, 'run': '1', 'file': f'{t}/home.png',
               'measures': {'#send': {'x': 600, 'y': 300, 'w': 80, 'h': 30}, 'text:Send': {'x': 600, 'y': 300, 'w': 80, 'h': 30}}} for t in themes]
        with open(os.path.join(root, run, 'shots-main', 'manifest-main-x.json'), 'w') as f:
            json.dump(mf, f)
    return {r: os.path.join(root, r) for r in runs}


def make_clips(clips_dir, runs=('before', 'after'), colours=('gray', 'red')):
    """Two 1-second recordings plus their posters, where record-pair.sh would put them, so a
    CLIP step has real files on disk. Returns False (having made nothing usable) when this
    machine has no ffmpeg — CI has none, and a clip step is then simply left out.

    A FLAT colour per clip, not an animation: a moving picture would paint a different frame on
    every render, and the selfie would box the video on every page forever."""
    os.makedirs(clips_dir, exist_ok=True)
    try:
        for run, colour in zip(runs, colours):
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'color=c={colour}:s=320x200:d=1:r=12',
                            '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', os.path.join(clips_dir, f'blink--{run}.webm')], check=True)
            subprocess.run(['magick', '-size', '320x200', f'xc:{colour}', os.path.join(clips_dir, f'blink--{run}.webp')], check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False
    return True
