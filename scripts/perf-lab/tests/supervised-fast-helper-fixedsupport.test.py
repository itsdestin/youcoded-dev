"""Offline-only policy tests. Importing support does not call gate.main or exec."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace

PATH = Path(__file__).with_name('supervised-fast-helper-fixedsupport.py')
spec = importlib.util.spec_from_file_location('fixed_true_support', PATH)
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


class FixedSupportTests(unittest.TestCase):
    def plan(self):
        home = str(support.ROOT / 'scratch/perf-lab/synthetic-fast-ABC123/home')
        return dict(binary='/usr/bin/true', argv=['/usr/bin/true'],
                    env=dict(HOME=home, PATH='/usr/bin:/bin', LANG='C.UTF-8'),
                    identity=dict(dev=1, ino=2, uid=0, mode=0o100755),
                    helperProof=dict(purpose='synthetic-fast-true', uid=1000, home=home))

    def test_fixed_policy_rejects_binary_argv_environment_uid_and_home_changes(self):
        plan = self.plan()
        home = plan['env']['HOME']
        support.validate_fixed_true(plan, 1000, home)
        for patch_value in [dict(binary='/bin/true'), dict(argv=['/usr/bin/true', 'x']),
                            dict(env={**plan['env'], 'DISPLAY': ':0'}),
                            dict(helperProof={**plan['helperProof'], 'uid': 9}),
                            dict(identity={**plan['identity'], 'uid': 9})]:
            with self.assertRaises(RuntimeError):
                support.validate_fixed_true({**plan, **patch_value}, 1000, home)
        with self.assertRaises(RuntimeError):
            support.validate_fixed_true(plan, 1000, '/home/real')

    def test_wrapper_substitutes_only_policy_and_calls_original_main(self):
        plan = self.plan()
        original = dict(main=lambda: None, validate_helper_proof=lambda *a: None,
                        exec_verified=object(), await_release=object())
        fake_gate = SimpleNamespace(**original)
        calls = []
        def actual_main():
            calls.append('main')
            self.assertIs(fake_gate.validate_helper_proof, support.validate_fixed_true)
            self.assertIs(fake_gate.exec_verified, original['exec_verified'])
            self.assertIs(fake_gate.await_release, original['await_release'])
        fake_gate.main = actual_main
        fake_spec = SimpleNamespace(loader=SimpleNamespace(exec_module=lambda module: calls.append('load')))
        home = plan['env']['HOME']
        with patch.dict(support.os.environ, {**plan['env'], 'PERF_LAB_SYNTHETIC_FAST_HELPER': '1'}, clear=True), \
             patch.object(support.sys, 'argv', ['support', str(Path(home).parent / 'exec-plan.json')]), \
             patch.object(support.Path, 'resolve', lambda path: path), \
             patch.object(support.importlib.util, 'spec_from_file_location', return_value=fake_spec), \
             patch.object(support.importlib.util, 'module_from_spec', return_value=fake_gate):
            support.main()
        self.assertEqual(calls, ['load', 'main'])
        self.assertIs(fake_gate.main, actual_main)

    def test_entry_without_opt_in_or_with_extra_args_never_loads_gate(self):
        for env, argv in [({}, ['support', '/plan']),
                          ({'PERF_LAB_SYNTHETIC_FAST_HELPER': '1'}, ['support', '/plan', 'extra'])]:
            with patch.dict(support.os.environ, env, clear=True), \
                 patch.object(support.sys, 'argv', argv), \
                 patch.object(support.importlib.util, 'spec_from_file_location') as load:
                with self.assertRaises(SystemExit):
                    support.main()
                load.assert_not_called()


if __name__ == '__main__':
    unittest.main()
