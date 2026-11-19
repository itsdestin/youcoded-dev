#!/usr/bin/env bash
# Lays each film's sound effects (film/cues/<film>.json) over its cut of the score and writes
# music/out/<film>-mix.wav, which the films play. WHY a script: the pairing of film to score cut
# lives in one place, so a retimed film is "edit the cue file, run this, render".
set -euo pipefail
cd "$(dirname "$0")/music"
mix() { .venv/bin/python mix.py --music "out/$2.wav" --cues "../film/cues/$1.json" --out "out/$1-mix.wav"; }
mix hero60 hero60; mix hero30 hero30
mix short-house short15a; mix short-yours short15b; mix short-rent short15c; mix short-founder short20
