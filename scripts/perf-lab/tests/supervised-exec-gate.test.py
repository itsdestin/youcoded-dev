import importlib.util
import pathlib
import unittest
import io
import json
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('gate', pathlib.Path(__file__).parents[1] / 'supervised-exec-gate.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class GateTests(unittest.TestCase):
    def check(self, chunks, ready=True):
        iterator = iter(chunks)
        return gate.await_release(read=lambda fd, n: next(iterator), wait=lambda *a: ([3] if ready else [], [], []), now=lambda: 0)

    def test_release_requires_exact_token_then_eof(self):
        self.assertTrue(self.check([b'R', b'']))

    def test_controller_disconnect_eof_extra_bytes_and_timeout_do_not_release(self):
        for chunks in [[b''], [b'X'], [b'RR'], [b'R', b'X']]:
            self.assertFalse(self.check(chunks))
        self.assertFalse(self.check([], ready=False))

    def test_fd_exec_requires_exact_identity_and_elf_before_exec(self):
        identity = dict(dev=1, ino=2, uid=1000, mode=0o100755)
        plan = dict(binary='/isolated/youcoded', identity=identity, argv=['/isolated/youcoded'], env={'HOME': '/private/home'})
        calls = []
        def run(patch=None, header=b'\x7fELF'):
            values = dict(st_dev=1, st_ino=2, st_uid=1000, st_mode=0o100755)
            values.update(patch or {})
            return gate.exec_verified(plan, opener=lambda *a: 9, stat=lambda fd: SimpleNamespace(**values),
                pread=lambda *a: header, closer=lambda fd: calls.append(('close', fd)),
                execute=lambda fd, argv, env: calls.append(('exec', fd)))
        run()
        self.assertIn(('exec', 9), calls)
        calls.clear()
        for patch in [dict(st_ino=99), dict(st_dev=99), dict(st_uid=99), dict(st_mode=0o100777)]:
            with self.assertRaises(RuntimeError): run(patch)
        with self.assertRaises(RuntimeError): run(header=b'#!/b')
        self.assertNotIn(('exec', 9), calls)

    def test_helper_policy_requires_fixed_role_argv_uid_and_private_environment(self):
        home = '/tmp/perf-lab-test/reservation/home'
        plan = dict(binary='/usr/bin/kscreen-doctor', identity=dict(uid=0),
                    argv=['/usr/bin/kscreen-doctor', '-j'], env=dict(PATH='/usr/bin:/bin', LANG='C.UTF-8', HOME=home,
                        XDG_CONFIG_HOME=home[:-5] + '/config', XDG_DATA_HOME=home[:-5] + '/data',
                        XDG_CACHE_HOME=home[:-5] + '/cache', XDG_RUNTIME_DIR=home[:-5] + '/runtime',
                        WAYLAND_DISPLAY='perf-0123456789abcdef', QT_QPA_PLATFORM='wayland',
                        DBUS_SESSION_BUS_ADDRESS='unix:path=' + home[:-5] + '/runtime/bus',
                        DBUS_SYSTEM_BUS_ADDRESS='unix:path=' + home[:-5] + '/runtime/no-system-bus'),
                    helperProof=dict(purpose='initial', uid=1000, home=home))
        gate.validate_helper_proof(plan, uid=1000, home=home)
        for patch in [dict(binary='/usr/bin/true'), dict(argv=['/usr/bin/kscreen-doctor', '--bad']),
                      dict(env=dict(HOME='/real')), dict(helperProof=dict(purpose='initial', uid=9, home=home)),
                      dict(env={**plan['env'], 'LD_PRELOAD': '/foreign'}), dict(identity=dict(uid=9)),
                      # The fixed literal name and any non-token shape must be refused now that the name is per-run.
                      dict(env={**plan['env'], 'WAYLAND_DISPLAY': 'perf-0'}),
                      dict(env={**plan['env'], 'WAYLAND_DISPLAY': 'perf-0123456789ABCDEF'}),
                      dict(env={**plan['env'], 'WAYLAND_DISPLAY': '../perf-0123456789abcdef'})]:
            with self.assertRaises(RuntimeError):
                gate.validate_helper_proof({**plan, **patch}, uid=1000, home=home)

    def test_default_app_gate_keeps_readiness_only_channel_and_strict_release(self):
        plan = dict(binary='/private/app', argv=['/private/app'], identity={}, env={})
        writes, closes = [], []
        with patch('builtins.open', return_value=io.BytesIO(json.dumps(plan).encode())), \
             patch.object(gate.sys, 'argv', ['gate', 'private-plan']), \
             patch.object(gate, 'await_release', return_value=True), \
             patch.object(gate.os, 'write', side_effect=lambda fd, data: writes.append((fd, data))), \
             patch.object(gate.os, 'close', side_effect=lambda fd: closes.append(fd)), \
             patch.object(gate.os, 'supports_fd', {gate.os.execve}), \
             patch.object(gate, 'exec_verified') as execute:
            gate.main()
        self.assertEqual(writes, [(4, b'G')])
        self.assertEqual(closes, [4, 3])
        execute.assert_called_once_with(plan)

    def test_receipt_is_after_verified_open_and_exec_return_is_failure(self):
        identity = dict(dev=1, ino=2, uid=0, mode=0o100755)
        plan = dict(binary='/usr/bin/wayland-info', identity=identity,
                    argv=['/usr/bin/wayland-info'], env={}, helperProof=dict(purpose='wayland'))
        calls = []
        current = SimpleNamespace(st_dev=1, st_ino=2, st_uid=0, st_mode=0o100755)
        def execute(*args):
            calls.append('exec')
        with self.assertRaises(RuntimeError):
            gate.exec_verified(plan, opener=lambda *a: 9, stat=lambda fd: current,
                pread=lambda *a: b'\x7fELF', closer=lambda fd: calls.append('close'),
                execute=execute, authorize=lambda actual: calls.append(('authorized', actual)))
        self.assertEqual(calls[0], ('authorized', identity))
        self.assertEqual(calls[1:], ['exec', 'close'])
        calls.clear()
        with self.assertRaises(RuntimeError):
            gate.exec_verified(plan, opener=lambda *a: 9, stat=lambda fd: current,
                pread=lambda *a: b'#!sh', closer=lambda fd: None,
                execute=execute, authorize=lambda actual: calls.append('authorized'))
        self.assertEqual(calls, [])

    def test_helper_main_exec_exception_cannot_become_exit_zero(self):
        plan = dict(helperProof=dict(purpose='wayland'))
        writes, inheritable, exits = [], [], []
        def failed_exec(plan, authorize):
            authorize(dict(dev=1, ino=2, uid=0, mode=0o100755))
            raise SystemExit(0)
        def exit_nonzero(code):
            exits.append(code)
            raise RuntimeError('injected immediate exit')
        with patch('builtins.open', return_value=io.BytesIO(json.dumps(plan).encode())), \
             patch.object(gate.sys, 'argv', ['gate', 'private-plan']), \
             patch.object(gate, 'validate_helper_proof'), \
             patch.object(gate, 'await_release', return_value=True), \
             patch.object(gate.os, 'set_inheritable', side_effect=lambda fd, value: inheritable.append((fd, value))), \
             patch.object(gate.os, 'write', side_effect=lambda fd, data: (writes.append((fd, data)), len(data))[1]), \
             patch.object(gate.os, 'close'), \
             patch.object(gate.os, 'supports_fd', {gate.os.execve}), \
             patch.object(gate, 'exec_verified', side_effect=failed_exec), \
             patch.object(gate.os, '_exit', side_effect=exit_nonzero):
            with self.assertRaisesRegex(RuntimeError, 'injected immediate exit'):
                gate.main()
        self.assertEqual(inheritable, [(4, False)])
        self.assertEqual(writes[0], (4, b'G'))
        receipt = json.loads(writes[1][1])
        self.assertEqual(receipt['kind'], 'authorized_fdexec')
        self.assertEqual(receipt['purpose'], 'wayland')
        self.assertEqual(exits, [68])

    def test_expired_deadline_performs_no_read(self):
        times = iter([0, 6])
        self.assertFalse(gate.await_release(timeout=5, now=lambda: next(times), read=lambda *a: self.fail('expired read')))


if __name__ == '__main__':
    unittest.main()
