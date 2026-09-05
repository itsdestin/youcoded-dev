#!/usr/bin/env python3
"""Review deck v2 — the page Destin approves UI changes on, one point per step.

  python3 scripts/ui-review/review-cards.py build <spec.json>     cut the crops, resolve every highlight box, write the HTML next to the spec
  python3 scripts/ui-review/review-cards.py serve <spec.json> [--no-build] [--port N] [--timeout MIN]
        build it, serve it, print the address for the session to put in chat, save answers to <spec>.answers.json, exit when Destin submits
  python3 scripts/ui-review/review-cards.py wait  <spec.json> [--timeout MIN]
        block until the answers file says submitted (for a session that no longer holds the `serve` process)
  python3 scripts/ui-review/review-cards.py contract-check <feature>.contract.json
        every row's source resolves to an answered step in a submitted deck and every mechanical guard exists on disk or on
        the contract's branch (exit 1 lists what doesn't); then reports, as ok:/todo: lines, whether the contract was signed
        (its own answers file) and whether the acceptance deck was submitted
  python3 scripts/ui-review/review-cards.py acceptance <feature>.contract.json
        merge <feature>.contract.verdicts.json into <feature>.contract.acceptance.json — the contract graded, plus a yes/no per human row

Five step kinds, each named by its own fields: APPROVE (`changed`+`notice`, yes/no),
CHOICE (`variants` — a picture per option, pick one), DECIDE (`options` — one picture of
today plus written options, pick one), CLIP (`clip` — a RECORDING per run instead of a still,
for animations, hovers, transitions and bugs that only show in motion; files from
`scripts/ui-review/record-pair.sh`, Before | After play side by side with a shared replay),
and LIVE (`live` — panes of the RUNNING app he can hover, click and drag, one authored
candidate each out of youcoded's compare/registry.tsx; `variants` makes it a pick-one, their
absence a yes/no, and `serve` boots the worktree's workbench for it).

A step may instead be WORDS-ONLY ("words": true — no picture, no images folder needed): that
is the questions deck asked before anything is drawn. A QUESTION says what exists, what goes
wrong and what would change in three fields of its own (`today`, `problem`, `proposal`), and
offers 1–3 written options carrying their own `pros`/`cons` (one may be `"recommended": true`)
— or none, and is answered Yes / No / Don't know. Writing any of that as "Today: … Pro: …"
inside a summary is refused, by field name. A STATEMENT to approve (`changed` + `notice`,
`yes`/`no` relabels, no `today`) is the other words step, and is exempt from all of it.

A CONTRACT step ("rows") is the definition of done signed off as one step; see
docs/active/specs/2026-09-01-feature-flow-design.md.

Run `serve` in the background: its exit is the "review finished" signal and it prints the
feedback summary. There is deliberately no separate crop step — a stale intermediate file drew
wrong rings with no error in v1. Spec format + writing rules:
docs/archive/specs/2026-08-27-review-deck-v2-design.md (§4–5). History of the
three rejected formats before this one: docs/archive/handoffs/2026-08-27-review-deck-tooling-handoff.md."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deck.build import build_page                       # noqa: E402
from deck.contract import AcceptanceError, acceptance_spec, acceptance_status, check_contract, contract_steps, signoff   # noqa: E402
from deck.crops import crop_images                      # noqa: E402
from deck.serve import already_served, serve, wait_for_submit   # noqa: E402
from deck.spec import SpecError, load_spec, validate    # noqa: E402


def build(spec):
    """Crop + resolve boxes + write the page. Returns 0, or 1 with the reasons on stderr and NO page written."""
    errors, warnings = validate(spec)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    r = crop_images(spec, log=lambda m: print(m, file=sys.stderr))
    for w in warnings + r['warnings']:
        print('warning: ' + w, file=sys.stderr)
    # A live-only deck cuts nothing and names no images folder — spec['images'] would KeyError.
    if 'images' in spec:
        print(f'{r["count"]} crops → {os.path.join(spec["_base"], spec["images"])}')
    if r['missing']:
        return 1
    page, _ = build_page(spec, r['boxes'])
    out = os.path.join(spec['_base'], spec['out'])
    with open(out, 'w') as f:
        f.write(page)
    print('wrote', out)
    return 0


def main(argv):
    # WHY: `serve` runs in the background with stdout redirected to a file; block-buffered, its
    # "[deck] http://…" line only appeared at exit — so the session quoted the bare port instead.
    if hasattr(sys.stdout, "reconfigure"):   # tests swap in a StringIO
        sys.stdout.reconfigure(line_buffering=True)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    for c in ('build', 'serve', 'wait', 'contract-check', 'acceptance'):
        sub.add_parser(c).add_argument('spec')
    for c in ('serve', 'wait'):
        sub.choices[c].add_argument('--timeout', type=float, default=240, help='minutes to wait for a submit (exit 2 after)')
    sv = sub.choices['serve']
    sv.add_argument('--no-live', action='store_true',
                    help="don't start or stop the app server for live panes (it's already running)")
    sv.add_argument('--no-build', action='store_true', help='serve the page as it is on disk')
    sv.add_argument('--port', type=int, default=0)
    a = ap.parse_args(argv)
    try:
        spec = load_spec(a.spec)
        if a.cmd == 'build':
            return build(spec)
        if a.cmd == 'wait':
            return wait_for_submit(spec, timeout_min=a.timeout)
        if a.cmd == 'contract-check':
            # Fix: check_contract() assumes a well-formed spec (a row with no `id` raised
            # KeyError, which close-out.sh then printed under "contract does not hold" — a
            # misleading error. Validate first, same as build(), so a malformed contract
            # gets the real writing-rules message instead of a traceback.
            errors, _ = validate(spec)
            if errors:
                print('\n'.join(errors), file=sys.stderr)
                return 1
            if not contract_steps(spec):
                print('no contract step in this spec (a step with "rows")', file=sys.stderr)
                return 1
            problems = check_contract(spec)
            if problems:
                print('\n'.join(problems), file=sys.stderr)
                return 1
            n = sum(len(st['rows']) for st in contract_steps(spec))
            # Three facts, three lines, `ok:`/`todo:` prefixed so close-out.sh can relay them
            # without parsing anything. Only the first is an exit code (see contract.py).
            print(f'ok: contract holds: {n} rows, every source answered and submitted, every guard found')
            for ok, line in (signoff(spec), acceptance_status(spec)):
                print(('ok: ' if ok else 'todo: ') + line)
            return 0
        if a.cmd == 'acceptance':
            # Fix: same as contract-check — a malformed contract must fail here with the
            # writing-rules message, not a KeyError from acceptance_spec() later.
            errors, _ = validate(spec)
            if errors:
                print('\n'.join(errors), file=sys.stderr)
                return 1
            vpath = os.path.join(spec['_base'], spec['_stem'] + '.verdicts.json')
            try:
                with open(vpath) as f:
                    verdicts = json.load(f)
            # Fix: OSError alone misses invalid JSON (a truncated/malformed verdicts file) —
            # catch both and show the real cause instead of the generic "no file" guess.
            except (OSError, ValueError) as e:
                print(f'cannot read verdicts file at {vpath}: {e} — the grader writes {{rowId: {{verdict, evidence}}}} there first', file=sys.stderr)
                return 1
            try:
                acc = acceptance_spec(spec, verdicts)
            except AcceptanceError as e:
                print(str(e), file=sys.stderr)
                return 1
            out = os.path.join(spec['_base'], spec['_stem'] + '.acceptance.json')
            with open(out, 'w') as f:
                json.dump(acc, f, indent=1)
            print('wrote', out, '— now: review-cards.py serve', out)
            return 0
        # WHY the lock is checked before build(): a second `serve` of the same spec used to
        # rebuild the page and re-cut the crops out from under the running server, THEN exit 3.
        other = already_served(spec)
        if other is not None:
            print(f'REFUSING: {spec["_stem"]} is already served by pid {other["pid"]} at {other["url"]}', file=sys.stderr)
            return 3
        if not a.no_build and build(spec) != 0:
            return 1
        return serve(spec, port=a.port, timeout_min=a.timeout, live=not a.no_live)
    except SpecError as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
