import errno
import importlib.util
import pathlib
import socket
import stat
import struct
import unittest

spec = importlib.util.spec_from_file_location('proofs', pathlib.Path(__file__).parents[1] / 'supervised-compositor-proofs.py')
proofs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proofs)  # import never opens a socket or reads an xattr

SOCKET = '/tmp/perf-lab-abc123/reservation/runtime/perf-0123456789abcdef'
EXACT = bytes.fromhex('0100000200008000000000000000000000000000')


class ProofTests(unittest.TestCase):
    def test_capability_is_fixed_path_hex_or_none(self):
        self.assertEqual(proofs.read_capability(getxattr=lambda p, n, follow_symlinks: EXACT), EXACT.hex())
        calls = []
        proofs.read_capability(getxattr=lambda p, n, follow_symlinks: calls.append((p, n, follow_symlinks)) or EXACT)
        self.assertEqual(calls, [('/usr/bin/kwin_wayland', 'security.capability', False)])
        def missing(*a, **k):
            raise OSError(errno.ENODATA, 'no data')
        self.assertIsNone(proofs.read_capability(getxattr=missing))
        def denied(*a, **k):
            raise OSError(errno.EACCES, 'denied')
        with self.assertRaises(OSError): proofs.read_capability(getxattr=denied)
        with self.assertRaises(RuntimeError): proofs.read_capability(path='/usr/bin/sh', getxattr=lambda *a, **k: EXACT)
        with self.assertRaises(RuntimeError): proofs.read_capability(getxattr=lambda *a, **k: b'x' * 65)

    def test_peer_credentials_reads_so_peercred_and_closes_without_writing(self):
        a, b = socket.socketpair()
        info = type('S', (), dict(st_mode=stat.S_IFSOCK | 0o600, st_uid=1000))()
        import os
        try:
            result = proofs.peer_credentials(SOCKET, uid=1000, lstat=lambda p: info, connect=lambda p: a)
            self.assertEqual(result, dict(pid=os.getpid(), uid=os.getuid(), gid=os.getgid()))
            self.assertEqual(b.recv(16), b'')  # peer closed having written nothing
            self.assertEqual(a.fileno(), -1)  # closed
        finally:
            b.close()

    def test_peer_credentials_refuses_foreign_paths_and_non_sockets(self):
        sock = type('S', (), dict(st_mode=stat.S_IFSOCK | 0o600, st_uid=1000))()
        regular = type('S', (), dict(st_mode=stat.S_IFREG | 0o600, st_uid=1000))()
        foreign = type('S', (), dict(st_mode=stat.S_IFSOCK | 0o600, st_uid=7))()
        for path in ['/run/user/1000/wayland-0', '/tmp/perf-lab-a/reservation/runtime/perf-0', SOCKET + '.lock', SOCKET.replace('perf-0123', '../perf-0123'), None]:
            with self.assertRaises(RuntimeError): proofs.peer_credentials(path, uid=1000, lstat=lambda p: sock, connect=lambda p: None)
        for info in (regular, foreign):
            with self.assertRaises(RuntimeError): proofs.peer_credentials(SOCKET, uid=1000, lstat=lambda p, i=info: i, connect=lambda p: None)

    def test_main_accepts_only_the_two_fixed_questions(self):
        for argv in ([], ['capability', 'x'], ['peer'], ['shell', 'id'], ['peer', SOCKET, 'extra']):
            with self.assertRaises(SystemExit): proofs.main(argv)


if __name__ == '__main__':
    unittest.main()
