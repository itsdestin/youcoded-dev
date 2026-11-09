"""Independent rootless Python siblings; never nest bwrap or relax process filters."""
import json
import math
import os
from pathlib import Path
import selectors
import signal
import subprocess
import tempfile
import time

from bounded_inputs import copy as safe_copy, hashes, end, tick, need
from bwrap_executor import process_filter, limits, MAX_OUTPUT

HERE = Path(__file__).resolve().parent


class PythonExecutor:
    backend = 'bwrap-python'

    def __init__(self, timeout=8):
        self.timeout = timeout
        self.evidence = []

    def run(self, root, *, request=None, check=None, deadline=None):
        """check is trusted controller source only; never caller/submission supplied."""
        deadline = min(end(deadline), time.monotonic()+self.timeout)
        if check is None:
            need(isinstance(request,dict) and request.get('operation') in ('call','tests'), 'Unsupported Python operation')
            if request['operation']=='call':
                need((request.get('module'),request.get('function')) in {
                    ('average','average'),('core','display_name'),('service','greeting'),
                    ('profile','display_name'),('greeting','greeting'),('resolver','resolve_project')}, 'Unsupported Python API')
        with tempfile.TemporaryDirectory(prefix='yc-python-') as tmp:
            private = Path(tmp)
            source = private/'source'; safe_copy(Path(root), source, deadline=deadline)
            before = hashes(source, deadline=deadline)
            adapter = private/'adapter'; adapter.mkdir()
            trusted = check is not None
            name = 'check.py' if trusted else 'invoke.py'
            (adapter/name).write_text(check if trusted else (HERE/'python-invocation.py').read_text())
            wire = json.dumps(request, allow_nan=False).encode() if request is not None else b''
            need(len(wire) <= MAX_OUTPUT, 'Python request bound')
            stdin_path = private/'stdin'; stdin_path.write_bytes(wire)
            with tempfile.TemporaryFile() as filt:
                filt.write(process_filter()); filt.seek(0)
                # WHY: /proc is deliberately absent. No host home, provider keys,
                # oracle, reward, writable source, network or child processes.
                cmd = ['/usr/bin/bwrap','--unshare-all','--unshare-user','--die-with-parent','--new-session',
                       '--disable-userns','--cap-drop','ALL','--ro-bind','/usr','/usr',
                       '--symlink','usr/lib','/lib','--symlink','usr/lib','/lib64',
                       '--dev','/dev','--size',str(8*1024*1024),'--tmpfs','/tmp',
                       '--ro-bind',str(source),'/work','--ro-bind',str(adapter),'/adapter',
                       '--remount-ro','/dev','--remount-ro','/','--chdir','/tmp' if trusted else '/work',
                       '--clearenv','--setenv','PATH','/usr/bin','--setenv','HOME','/tmp',
                       '--seccomp',str(filt.fileno()),'/usr/bin/python3','-I','-S','-B','/adapter/'+name]
                with stdin_path.open('rb') as stdin:
                    child = subprocess.Popen(cmd, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        env={}, pass_fds=(filt.fileno(),), start_new_session=True,
                        preexec_fn=lambda: limits(max(1, math.ceil(self.timeout))))
                data = {child.stdout: bytearray(), child.stderr: bytearray()}
                try:
                    with selectors.DefaultSelector() as streams:
                        for pipe in data: streams.register(pipe, selectors.EVENT_READ)
                        while streams.get_map():
                            tick(deadline)
                            for key, _ in streams.select(min(.02, max(0, deadline-time.monotonic()))):
                                chunk = os.read(key.fileobj.fileno(), 8192)
                                if not chunk: streams.unregister(key.fileobj); continue
                                data[key.fileobj].extend(chunk)
                                need(sum(map(len, data.values())) <= MAX_OUTPUT, 'Python output bound')
                    child.wait(timeout=max(.001, deadline-time.monotonic()))
                    need(hashes(source, deadline=deadline) == before, 'Python snapshot changed')
                    result = dict(status=child.returncode, stdout=bytes(data[child.stdout]), stderr=bytes(data[child.stderr]))
                    self.evidence.append(dict(backend=self.backend, trusted=trusted, status=child.returncode))
                    return result
                finally:
                    if child.poll() is None:
                        os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=3)
                    for pipe in data: pipe.close()
