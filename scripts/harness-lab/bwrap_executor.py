"""Restricted offline Linux Node executor; no oracle or host JS execution.

No kernel-escape claim. Output-tree bounds are actively checked, not disk quotas.
"""
import errno
import json
import math
import os
from pathlib import Path
import platform
import resource
import selectors
import signal
import struct
import subprocess
import tempfile
import time

from bounded_inputs import copy as safe_copy, hashes, end, tick

MAX_OUTPUT=262144
MAX_FILES=32
MAX_BYTES=2*1024*1024


def need(ok, message):
    if not ok: raise ValueError(message)


def process_filter():
    """x86-64 BPF: deny new processes, allow pthread clone, fail arch/x32 closed."""
    need(platform.machine()=='x86_64', 'bwrap seccomp requires Linux x86_64')
    # WHY: RLIMIT_NPROC is per host uid, not a private process budget. Prevent
    # fork/vfork/clone3 and non-thread clone instead of endangering other sessions.
    rows=[(0x20,0,0,4),(0x15,1,0,0xc000003e),(0x06,0,0,0x80000000),
          (0x20,0,0,0),(0x35,0,1,0x40000000),(0x06,0,0,0x80000000)]
    for nr in (57,58,435):
        rows.extend([(0x15,0,1,nr),(0x06,0,0,0x50000|errno.ENOSYS)])
    rows.extend([(0x15,0,3,56),(0x20,0,0,16),(0x45,1,0,0x10000),
                 (0x06,0,0,0x50000|errno.EPERM),(0x06,0,0,0x7fff0000)])
    return b''.join(struct.pack('HBBI',*r) for r in rows)


def limits(cpu):
    resource.setrlimit(resource.RLIMIT_CPU,(cpu,cpu))
    # WHY: Node 26's TypeScript parser needs Wasm and a large virtual code cage.
    # Bound writable data separately rather than disabling required TypeScript.
    resource.setrlimit(resource.RLIMIT_AS,(16*1024**3,16*1024**3))
    resource.setrlimit(resource.RLIMIT_DATA,(2*1024**3,2*1024**3))
    resource.setrlimit(resource.RLIMIT_FSIZE,(MAX_BYTES,MAX_BYTES))
    resource.setrlimit(resource.RLIMIT_NOFILE,(64,64))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))


def output_state(root):
    # WHY: active output is hostile; even metadata enumeration must open each
    # component descriptor-relative/no-follow, never follow a swapped directory.
    from bounded_inputs import scan
    state=scan(root,max_entries=MAX_FILES,max_bytes=MAX_BYTES,max_file_bytes=MAX_BYTES)
    return state['entries'],state['total']


class BwrapExecutor:
    """Safe API: paths are validated/staged; only Node argv inside namespaces.

    Each call owns its process group. No Docker, privilege escalation or fallback.
    """
    backend='bwrap'
    def __init__(self,timeout=8):
        need(os.name=='posix' and platform.system()=='Linux','bwrap requires Linux')
        need(Path('/usr/bin/bwrap').is_file() and Path('/usr/bin/node').is_file(),'bwrap/Node unavailable')
        self.timeout=timeout
        self.evidence=[]

    def run(self,root,*,argv=None,request=None,inputs=None,existing=None,deadline=None):
        deadline=min(end(deadline),time.monotonic()+self.timeout)
        with tempfile.TemporaryDirectory(prefix='yc-bwrap-') as tmp:
            private=Path(tmp)
            source=private/'source';safe_copy(Path(root),source,deadline=deadline)
            before=hashes(source,deadline=deadline)
            inp=private/'inputs';inp.mkdir()
            for name,data in (inputs or {}).items():
                need(isinstance(name,str) and not Path(name).is_absolute() and all(p not in ('','.','..') for p in name.split('/')) and '\\' not in name,'invalid input name')
                need(isinstance(data,bytes) and len(data)<=MAX_BYTES,'executor input bytes bound')
                (inp/name).parent.mkdir(parents=True,exist_ok=True)
                (inp/name).write_bytes(data)
            output_state(inp)
            out=private/'output';out.mkdir()
            for name,data in (existing or {}).items():
                need(Path(name).name==name and name not in ('.','..'),'invalid output name')
                (out/name).write_bytes(data)
            output_state(out)
            adapter=private/'adapter';adapter.mkdir()
            here=Path(__file__).resolve().parent
            for name in ('external-invocation.cjs','comparison-loader.cjs'):
                (adapter/name).write_bytes((here/name).read_bytes())
            with tempfile.TemporaryFile() as filt:
                filt.write(process_filter());filt.seek(0)
                cmd=['/usr/bin/bwrap','--unshare-all','--unshare-user','--die-with-parent','--new-session',
                     '--disable-userns','--cap-drop','ALL','--ro-bind','/usr','/usr',
                     '--symlink','usr/lib','/lib','--symlink','usr/lib','/lib64',
                     '--proc','/proc','--dev','/dev','--size',str(8*1024*1024),'--tmpfs','/tmp',
                     '--ro-bind',str(source),'/work','--ro-bind',str(inp),'/inputs',
                     '--ro-bind',str(adapter),'/adapter','--bind',str(out),'/output',
                     '--remount-ro','/dev','--remount-ro','/proc','--remount-ro','/',
                     '--chdir','/work','--clearenv','--setenv','PATH','/usr/bin',
                     '--setenv','HOME','/tmp','--setenv','NODE_NO_WARNINGS','1',
                     '--seccomp',str(filt.fileno()),'/usr/bin/node','--disable-wasm-trap-handler',
                     '--wasm-max-code-space-size-mb=32','--max-old-space-size=128',*(argv or ['/adapter/external-invocation.cjs'])]
                wire=json.dumps(request).encode() if request is not None else b''
                need(len(wire)<=MAX_OUTPUT,'executor request bound')
                wirefile=private/'stdin';wirefile.write_bytes(wire)
                # WHY: a child that never reads stdin must not block the trusted
                # controller in pipe.write before its deadline loop can run.
                with wirefile.open('rb') as stdin:
                    child=subprocess.Popen(cmd,stdin=stdin,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                        env={},pass_fds=(filt.fileno(),),start_new_session=True,
                        preexec_fn=lambda:limits(max(1,math.ceil(self.timeout))))
                data={child.stdout:bytearray(),child.stderr:bytearray()}
                try:
                    with selectors.DefaultSelector() as streams:
                        for pipe in data:streams.register(pipe,selectors.EVENT_READ)
                        while streams.get_map():
                            tick(deadline);output_state(out)
                            for key,_ in streams.select(min(.02,max(0,deadline-time.monotonic()))):
                                chunk=os.read(key.fileobj.fileno(),8192)
                                if not chunk:streams.unregister(key.fileobj);continue
                                data[key.fileobj].extend(chunk)
                                need(sum(map(len,data.values()))<=MAX_OUTPUT,'executor output bound')
                    try:child.wait(timeout=max(.001,deadline-time.monotonic()))
                    except subprocess.TimeoutExpired:raise ValueError('executor deadline exceeded') from None
                    output_state(out)
                    need(hashes(source,deadline=deadline)==before,'read-only source changed')
                    # No JS result may attest to these persisted files: read after exit.
                    hashes(out,deadline=deadline)
                    files={p.name:p.read_bytes() for p in out.iterdir() if p.is_file()}
                    result=dict(status=child.returncode,stdout=bytes(data[child.stdout]),stderr=bytes(data[child.stderr]),files=files)
                    self.evidence.append(dict(status=child.returncode,backend='bwrap',outputFiles=len(files)))
                    return result
                finally:
                    # Only this new invocation's owned process group is signalled.
                    if child.poll() is None:
                        os.killpg(child.pid,signal.SIGKILL);child.wait(timeout=3)
                    for pipe in (child.stdout,child.stderr):pipe.close()
