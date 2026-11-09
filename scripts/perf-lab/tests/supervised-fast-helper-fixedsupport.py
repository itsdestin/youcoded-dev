"""TEST ONLY: fixed true policy substitution, real production gate mechanics.

Import is inert. This does NOT demonstrate production helper allowlist acceptance.
Only validate_helper_proof is replaced in the imported module, in memory.
"""
import importlib.util
import os
from pathlib import Path
import re
import sys

GATE = Path(__file__).resolve().parents[1] / 'supervised-exec-gate.py'
ROOT = Path(__file__).resolve().parents[3]


def validate_fixed_true(plan, uid, home):
    prefix = str(ROOT / 'scratch' / 'perf-lab')
    if not isinstance(home, str) or not re.fullmatch(
            re.escape(prefix) + r'/synthetic-fast-[A-Za-z0-9]+/home', home):
        raise RuntimeError('Synthetic requires fresh workspace HOME')
    if set(plan) != {'binary', 'identity', 'argv', 'env', 'helperProof'}:
        raise RuntimeError('Synthetic plan keys rejected')
    if plan['binary'] != '/usr/bin/true' or plan['argv'] != ['/usr/bin/true']:
        raise RuntimeError('Synthetic only permits fixed true without arguments')
    if plan['env'] != dict(HOME=home, PATH='/usr/bin:/bin', LANG='C.UTF-8'):
        raise RuntimeError('Synthetic environment rejected')
    if plan['helperProof'] != dict(purpose='synthetic-fast-true', uid=uid, home=home):
        raise RuntimeError('Synthetic helper proof rejected')
    identity = plan['identity']
    if set(identity) != {'dev', 'ino', 'uid', 'mode'} or identity['uid'] not in (0, uid):
        raise RuntimeError('Synthetic executable identity/owner rejected')
    if not all(isinstance(identity[key], int) and not isinstance(identity[key], bool)
               and identity[key] >= 0 for key in identity):
        raise RuntimeError('Synthetic identity values rejected')
    # Actual regular-file, mode, ELF and exact identity checks remain in the gate.


def main():
    if os.environ.get('PERF_LAB_SYNTHETIC_FAST_HELPER') != '1' or len(sys.argv) != 2:
        raise SystemExit(64)
    home = os.environ.get('HOME', '')
    expected_plan = Path(home).parent / 'exec-plan.json'
    if sys.argv[1] != str(expected_plan) or expected_plan.resolve() != expected_plan:
        raise RuntimeError('Synthetic plan outside fixed private reservation')
    spec = importlib.util.spec_from_file_location('synthetic_real_gate', GATE)
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    gate.validate_helper_proof = validate_fixed_true
    # Do not replace main, await_release, exec_verified, execve, receipt writes,
    # CLOEXEC or exception handling. No production module/file is modified.
    gate.main()


if __name__ == '__main__':
    main()
