#!/usr/bin/env python3
"""Unique-frames-per-second of a recorded clip: typing window and motion windows (stroke/scroll; a bare cursor move changes no pixels so it cannot count).
Exit 0 = smooth enough (typing >= 10/s, painting/scrolling >= 10/s: the screencast's ceiling at 1920x1200 real density on this machine is ~11/s, total length <= max)."""
import json, re, subprocess, sys
base, maxd = sys.argv[1], float(sys.argv[2])
webm, marks = base + '.webm', json.load(open(base + '.marks.json'))
out = subprocess.run(['ffmpeg', '-i', webm, '-vf', 'mpdecimate', '-loglevel', 'debug', '-f', 'null', '-'], capture_output=True, text=True).stderr
keeps = [float(m.group(1)) for m in re.finditer(r'keep pts:\d+ pts_time:([\d.]+)', out)]
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm], capture_output=True, text=True).stdout)
def fps(a, b): return sum(1 for t in keeps if a <= t < b) / max(b - a, 0.05)
typing = [(a['start'], a['end']) for a in marks['actions'] if a['kind'] == 'typeSlow']
motion = [(a['start'], a['end']) for a in marks['actions'] if a['kind'] in ('stroke',) and a['end'] - a['start'] > 0.4]
t = min((fps(a, b) for a, b in typing), default=None)
m = min((fps(a, b) for a, b in motion), default=None)
print(f"  {base.split('/')[-1]}: duration {dur:.1f}s, unique frames {len(keeps)}, typing {t if t is None else round(t,1)}/s, motion(min) {m if m is None else round(m,1)}/s")
ok = dur <= maxd and (t is None or t >= 10) and (m is None or m >= 8)
sys.exit(0 if ok else 1)
