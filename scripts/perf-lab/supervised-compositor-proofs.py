"""Trusted fixed read-only proofs for the inferred (unreadable) KWin role.

Two fixed questions only, no shell, no caller path except the private socket:
  capability              -> hex of security.capability on /usr/bin/kwin_wayland (or null)
  peer <private socket>   -> SO_PEERCRED {pid,uid,gid} of the socket's listener

Node has neither getxattr nor SO_PEERCRED, so this tiny helper supplies them.
Offline tests inject getxattr/connect; importing never touches a socket or file.
"""
import errno
import json
import os
import re
import socket
import stat as stat_module
import struct
import sys

KWIN = '/usr/bin/kwin_wayland'
SOCKET_PATTERN = re.compile(r'/tmp/perf-lab-[A-Za-z0-9-]+/reservation/runtime/perf-[0-9a-f]{16}')


def read_capability(path=KWIN, getxattr=os.getxattr):
    # WHY: a fixed path keeps this from becoming a general xattr reader.
    if path != KWIN:
        raise RuntimeError('Capability proof is fixed to the approved KWin path')
    try:
        data = getxattr(path, 'security.capability', follow_symlinks=False)
    except OSError as error:
        if error.errno in (errno.ENODATA, getattr(errno, 'ENOATTR', errno.ENODATA)):
            return None  # no file capability at all
        raise
    if not isinstance(data, bytes) or len(data) > 64:
        raise RuntimeError('Unexpected security.capability size')
    return data.hex()


def peer_credentials(path, uid=None, lstat=os.lstat, connect=None):
    uid = os.getuid() if uid is None else uid
    if not isinstance(path, str) or not SOCKET_PATTERN.fullmatch(path):
        raise RuntimeError('Peer proof requires the private per-run Wayland socket path')
    info = lstat(path)
    if not stat_module.S_ISSOCK(info.st_mode) or info.st_uid != uid:
        raise RuntimeError('Peer proof socket is not an owned Unix socket')
    if connect is None:
        def connect(target):
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.settimeout(1.0)
            client.connect(target)
            return client
    client = connect(path)
    try:
        raw = client.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize('3i'))
        pid, peer_uid, peer_gid = struct.unpack('3i', raw)
    finally:
        # Close without writing a single Wayland byte; the compositor sees a
        # client that connected and left.
        client.close()
    return dict(pid=pid, uid=peer_uid, gid=peer_gid)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv == ['capability']:
        result = dict(capability=read_capability())
    elif len(argv) == 2 and argv[0] == 'peer':
        result = peer_credentials(argv[1])
    else:
        raise SystemExit(64)
    sys.stdout.write(json.dumps(result, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
