#!/usr/bin/env python3
"""Review deck v2 — the page Destin approves UI changes on, one point per step.

  python3 scripts/ui-review/review-cards.py build <spec.json>     cut the crops, resolve every highlight box, write the HTML next to the spec
  python3 scripts/ui-review/review-cards.py serve <spec.json> [--no-open] [--no-build] [--port N] [--timeout MIN]
        build it, serve it, open the browser, save answers to <spec>.answers.json, exit when Destin submits
  python3 scripts/ui-review/review-cards.py wait  <spec.json> [--timeout MIN]
        block until the answers file says submitted (for a session that no longer holds the `serve` process)

Run `serve` in the background: its exit is the "review finished" signal and it prints the
feedback summary. There is deliberately no separate crop step — a stale intermediate file drew
wrong rings with no error in v1. Spec format + writing rules:
docs/archive/specs/2026-08-27-review-deck-v2-design.md (§4–5). History of the
three rejected formats before this one: docs/active/handoffs/2026-08-27-review-deck-tooling-handoff.md."""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deck.build import build_page                       # noqa: E402
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
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    for c in ('build', 'serve', 'wait'):
        sub.add_parser(c).add_argument('spec')
    for c in ('serve', 'wait'):
        sub.choices[c].add_argument('--timeout', type=float, default=240, help='minutes to wait for a submit (exit 2 after)')
    sv = sub.choices['serve']
    sv.add_argument('--no-open', action='store_true')
    sv.add_argument('--no-build', action='store_true', help='serve the page as it is on disk')
    sv.add_argument('--port', type=int, default=0)
    a = ap.parse_args(argv)
    try:
        spec = load_spec(a.spec)
        if a.cmd == 'build':
            return build(spec)
        if a.cmd == 'wait':
            return wait_for_submit(spec, timeout_min=a.timeout)
        # WHY the lock is checked before build(): a second `serve` of the same spec used to
        # rebuild the page and re-cut the crops out from under the running server, THEN exit 3.
        other = already_served(spec)
        if other is not None:
            print(f'REFUSING: {spec["_stem"]} is already served by pid {other["pid"]} at {other["url"]}', file=sys.stderr)
            return 3
        if not a.no_build and build(spec) != 0:
            return 1
        return serve(spec, port=a.port, open_browser=not a.no_open, timeout_min=a.timeout)
    except SpecError as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
