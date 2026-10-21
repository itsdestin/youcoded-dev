"""Trusted fixed exec gate. Imported offline tests inject read/select/exec; never launch here."""
import json
import os
import select
import sys
import time
import stat as stat_module
import hashlib
import re


def await_release(fd=3, timeout=5.0, read=os.read, wait=select.select, now=time.monotonic):
    # A release is one R byte followed by EOF. Disconnect/EOF, extra input, or
    # deadline never authorizes exec. No shell, command dispatch or PID control.
    end = now() + timeout
    data = b''
    while now() < end:
        ready, _, _ = wait([fd], [], [], max(0, end - now()))
        if not ready:
            return False
        chunk = read(fd, 2)
        if not chunk:
            return data == b'R'
        data += chunk
        if data != b'R':
            return False
    return False


def validate_helper_proof(plan, uid, home):
    proof = plan.get('helperProof')
    if not isinstance(proof, dict) or set(proof) != {'purpose', 'uid', 'home'}:
        raise RuntimeError('Invalid helper proof policy')
    if proof['uid'] != uid or proof['home'] != home or plan['env'].get('HOME') != home:
        raise RuntimeError('Helper gate UID/HOME mismatch')
    if not re.fullmatch(r'/tmp/perf-lab-[A-Za-z0-9-]+/reservation/home', home):
        raise RuntimeError('Helper proof requires private HOME')
    root = home[:-len('/home')]
    expected_env = dict(PATH='/usr/bin:/bin', LANG='C.UTF-8', HOME=home,
                        XDG_CONFIG_HOME=root + '/config', XDG_DATA_HOME=root + '/data',
                        XDG_CACHE_HOME=root + '/cache', XDG_RUNTIME_DIR=root + '/runtime',
                        WAYLAND_DISPLAY='perf-0', QT_QPA_PLATFORM='wayland',
                        DBUS_SESSION_BUS_ADDRESS='unix:path=' + root + '/runtime/bus',
                        DBUS_SYSTEM_BUS_ADDRESS='unix:path=' + root + '/runtime/no-system-bus')
    if plan['env'] != expected_env or plan['identity'].get('uid') not in (0, uid):
        raise RuntimeError('Helper fixed environment/executable owner mismatch')
    purpose = proof['purpose']
    binary, argv = plan['binary'], plan['argv']
    if purpose in ('initial', 'final'):
        valid = binary == '/usr/bin/kscreen-doctor' and argv == [binary, '-j']
    elif purpose == 'wayland':
        valid = binary == '/usr/bin/wayland-info' and argv == [binary]
    elif purpose == 'apply':
        valid = (binary == '/usr/bin/kscreen-doctor' and len(argv) == 3 and argv[0] == binary
                 and re.fullmatch(r'output\.([1-9][0-9]{0,4})\.mode\.(0|[1-9][0-9]{0,5})', argv[1])
                 and int(argv[1].split('.')[1]) <= 65535
                 and argv[2] == 'output.' + argv[1].split('.')[1] + '.scale.1.5')
    else:
        valid = False
    if not valid:
        raise RuntimeError('Unsupported fixed helper proof command')


def exec_verified(plan, opener=os.open, stat=os.fstat, pread=os.pread, closer=os.close, execute=os.execve, authorize=None):
    # WHY: pathname checks alone leave a rename/symlink race before exec. Open
    # no-follow, compare the retained package inode, then exec THAT descriptor.
    fd = opener(plan['binary'], os.O_RDONLY | os.O_NOFOLLOW)
    try:
        current = stat(fd)
        actual = dict(dev=current.st_dev, ino=current.st_ino, uid=current.st_uid, mode=current.st_mode)
        if actual != plan['identity'] or not stat_module.S_ISREG(current.st_mode) or current.st_mode & 0o6022 or not current.st_mode & 0o100:
            raise RuntimeError('Gate executable identity/permissions changed')
        if pread(fd, 4, 0) != b'\x7fELF':
            raise RuntimeError('Gate requires approved ELF executable, not script/interpreter')
        if authorize is not None:
            authorize(actual)
        execute(fd, plan['argv'], plan['env'])
        if authorize is not None:
            # WHY: a helper receipt plus exit 0 is usable only if the gate cannot
            # return normally after authorization. Real execve never returns.
            raise RuntimeError('Verified helper exec unexpectedly returned')
    finally:
        closer(fd)


def main():
    if len(sys.argv) != 2:
        raise SystemExit(64)
    # Plan is supervisor-owned, exclusive, <=64 KiB, no caller-provided argv/env.
    with open(sys.argv[1], 'rb') as stream:
        raw = stream.read(65537)
    if len(raw) > 65536:
        raise SystemExit(65)
    plan = json.loads(raw.decode('utf-8', errors='strict'))
    helper = plan.get('helperProof') is not None
    if helper:
        if os.getuid() != os.geteuid() or os.getgid() != os.getegid():
            raise RuntimeError('Privileged helper gate rejected')
        validate_helper_proof(plan, uid=os.getuid(), home=os.environ.get('HOME'))
        # WHY: inherited proof bytes cannot be supplied by the executed helper.
        # EOF means descriptor closure, NOT by itself successful exec or exit.
        os.set_inheritable(4, False)
    os.write(4, b'G')
    if not helper:
        os.close(4)
    if not await_release():
        raise SystemExit(66)
    os.close(3)
    if os.execve not in os.supports_fd:
        raise SystemExit(67)
    if not helper:
        exec_verified(plan)
        return

    def authorize(actual):
        receipt = dict(revision=1, kind='authorized_fdexec', pid=os.getpid(),
                       uid=os.getuid(), home=os.environ.get('HOME'),
                       purpose=plan['helperProof']['purpose'], identity=actual,
                       planDigest=hashlib.sha256(raw).hexdigest())
        packet = (json.dumps(receipt, separators=(',', ':')) + '\n').encode('utf-8')
        if len(packet) > 4096 or os.write(4, packet) != len(packet):
            raise RuntimeError('Helper authorization receipt short/oversized write')

    try:
        exec_verified(plan, authorize=authorize)
    except BaseException:
        # After authorization EVERY exception, including SystemExit(0), must be
        # nonzero. No user exception hook or normal interpreter shutdown can
        # turn a failed FD exec into a successful short-helper completion.
        os._exit(68)


if __name__ == '__main__':
    main()
