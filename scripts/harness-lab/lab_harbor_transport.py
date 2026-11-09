"""Harbor environment interposition; no production backend is qualified yet.

Backend methods are controller capabilities, never submission paths/receipts. A
backend must seal ALL writers, independently confirm that seal, and supply an
async bounded-read uncompressed USTAR stream. No Harbor download/tar fallback.
"""
import asyncio
import os
import stat
from pathlib import Path
import tempfile
import time

from harbor.environments.base import BaseEnvironment
from harbor.environments.capabilities import EnvironmentCapabilities
from bounded_inputs import (CHUNK, MAX_BYTES, MAX_DEPTH, MAX_ENTRIES,
                            MAX_FILE_BYTES, flags, need, root_open, tick)

MAX_ARCHIVE = MAX_BYTES + MAX_ENTRIES * 1024 + 10240


async def bounded_spool(reader, output, deadline, limit=MAX_ARCHIVE):
    total = 0
    while True:
        tick(deadline)
        data = await asyncio.wait_for(reader.read(CHUNK), deadline-time.monotonic())
        need(isinstance(data, bytes) and len(data) <= CHUNK, 'invalid bounded stream')
        if not data:
            break
        total += len(data)
        need(total <= limit, 'archive byte limit')
        output.write(data)
    output.seek(0)
    return total


def inventory(archive, deadline, root_prefix=None):
    """Parse fixed headers ourselves: PAX/GNU/sparse extensions cannot allocate."""
    entries = []; seen = {}; total = 0; headers = 0; root_seen = False
    def number(raw):
        raw = raw.rstrip(b'\0 ').lstrip(b' ')
        need(bool(raw) and all(48 <= b <= 55 for b in raw), 'non-octal archive metadata')
        return int(raw, 8)
    def text(raw):
        value, _, tail = raw.partition(b'\0')
        need(not tail.strip(b'\0'), 'archive text padding')
        return value.decode('utf-8', 'strict')
    while True:
        tick(deadline); header = archive.read(512)
        need(len(header) == 512, 'truncated archive')
        if header == bytes(512):
            need(archive.read(512) == bytes(512), 'archive end framing')
            while chunk := archive.read(CHUNK):
                tick(deadline); need(not chunk.strip(b'\0'), 'archive trailing data')
            break
        headers += 1
        need(headers <= MAX_ENTRIES, 'archive entry limit')
        need(number(header[148:156]) == sum(header[:148])+8*32+sum(header[156:]), 'archive checksum')
        need(header[257:263] == b'ustar\0' and header[263:265] == b'00', 'only plain USTAR supported')
        kind = header[156:157]
        need(kind in (b'0', b'\0', b'5'), 'archive links/sparse/special/extensions refused')
        need(not text(header[157:257]), 'archive link refused')
        name = text(header[:100]); prefix = text(header[345:500])
        name = (prefix+'/' if prefix else '')+name
        if kind == b'5': name = name.removesuffix('/')
        parts = name.split('/')
        need(all(p not in ('', '.', '..') and '\\' not in p and not any(ord(c)<32 for c in p) for p in parts), 'archive unsafe path')
        need(len(parts) <= MAX_DEPTH and len(name.encode()) <= 4096, 'archive depth/path limit')
        size = number(header[124:136])
        need(0 <= size <= MAX_FILE_BYTES, 'archive file size limit')
        need(kind != b'5' or size == 0, 'directory payload refused')
        total += size; need(total <= MAX_BYTES, 'archive total size limit')
        if root_prefix is not None:
            # WHY: Engine archives include the requested directory itself. Strip
            # exactly that component, never a common-prefix or traversal rewrite.
            need(parts[0] == root_prefix, 'archive top directory mismatch')
            if len(parts) == 1:
                need(kind == b'5' and not root_seen, 'archive root type/duplicate')
                root_seen = True
                continue
            parts = parts[1:]; name = '/'.join(parts)
        need(name not in seen, 'archive duplicate path')
        seen[name] = kind
        entries.append((parts, kind, size, archive.tell()))
        archive.seek((size+511)//512*512, 1)
    # WHY: file-as-parent conflicts must fail before the first extracted write,
    # even when the malicious parent appears later in the stream.
    implicit = set()
    for parts, _, _, _ in entries:
        tick(deadline)
        for i in range(1, len(parts)):
            name = '/'.join(parts[:i])
            need(seen.get(name, b'5') == b'5', 'archive file parent conflict')
            if name not in seen: implicit.add(name)
            # Count implicit directories too: 10k depth-64 names must not create
            # 640k host directories after passing a header-only entry limit.
            need(len(seen)+len(implicit) <= MAX_ENTRIES, 'archive implicit entry limit')
    entries.extend((name.split('/'), b'5', 0, 0) for name in sorted(implicit))
    return entries, total


def materialize(archive, entries, destination, deadline):
    destination.mkdir(mode=0o700)
    root = root_open(destination, deadline)
    try:
        for parts, kind, size, offset in entries:
            tick(deadline); parent = os.dup(root)
            try:
                for component in parts[:-1] + (parts[-1:] if kind == b'5' else []):
                    try: os.mkdir(component, 0o700, dir_fd=parent)
                    except FileExistsError: pass
                    child = os.open(component, flags(True), dir_fd=parent)
                    os.close(parent); parent = child
                if kind == b'5': continue
                fd = os.open(parts[-1], os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o400, dir_fd=parent)
                with os.fdopen(fd, 'wb') as out:
                    archive.seek(offset); remaining = size
                    while remaining:
                        tick(deadline); data = archive.read(min(CHUNK, remaining))
                        need(bool(data), 'truncated file payload'); out.write(data); remaining -= len(data)
            finally: os.close(parent)
    finally: os.close(root)
    for directory, _, _ in os.walk(destination, topdown=False):
        tick(deadline); os.chmod(directory, 0o500)


class BoundedEnvironment(BaseEnvironment):
    """No mounts, no oracle execution, and no direct backend download methods.

    Production uses the repository's pinned Engine capability through a private
    controller policy channel. Missing policy refuses, never Docker cp/tar or a
    submission-selected socket. Offline tests may inject a trusted backend.
    """
    def __init__(self, *args, **kwargs):
        # WHY: Harbor eagerly mounts reward/log roots before verifier selection.
        # Drop ALL binds, including user ones; none are needed by this capability.
        self.stripped_mount_count = len(kwargs.pop('mounts', None) or [])
        need(not kwargs.get('extra_docker_compose'), 'bounded environment refuses compose overlays')
        self.controller_job_id = kwargs.pop('controller_job_id', None)
        self._backend = None; self._sealed = False; self._poisoned = False
        self._lock = asyncio.Lock(); self._snapshots = {}; self._snapshot_modes = {}; self._download_bytes = 0
        self._entry_count = 0; self._payload_bytes = 0
        self._private = tempfile.TemporaryDirectory(prefix='yc-harbor-private-')
        os.chmod(self._private.name, 0o700)
        super().__init__(*args, mounts=[], **kwargs)

    @staticmethod
    def type(): return 'lab-bounded-host'
    @property
    def capabilities(self): return EnvironmentCapabilities(disable_internet=True)
    def _validate_definition(self): pass
    def create_backend(self):
        from lab_engine import controller_backend
        return controller_backend(self)
    async def start(self, force_build=False):
        self._backend = self.create_backend()
        await self._backend.start(force_build)
    async def stop(self, delete=True):
        try:
            if self._backend is not None: await self._backend.stop(delete)
        finally: self._private.cleanup()
    async def exec(self, command, cwd=None, env=None, timeout_sec=None, user=None):
        need(self._backend is not None and not self._sealed and not self._poisoned, 'agent writers sealed/unavailable')
        # Preserve Harbor's existing host-agent user and scoped-env semantics;
        # only the transport changes, not the five installed/native adapters.
        return await self._backend.exec(command,cwd=cwd,env=self._merge_env(env),
                                        timeout_sec=timeout_sec,user=self._resolve_user(user))
    async def upload_file(self, source_path, target_path):
        need(not self._sealed and not self._poisoned, 'agent writers sealed')
        need(not str(target_path).startswith(('/tests', '/logs/verifier')), 'oracle/reward upload refused')
        return await self._backend.upload_file(source_path, target_path)
    async def upload_dir(self, source_dir, target_dir):
        # Harbor uploads its host-generated logs after _sync_agent_output has
        # sealed the writer. These are diagnostics, not acceptance inputs; do
        # not reopen an agent writer to mirror them back into the environment.
        if self._sealed and str(target_dir) == '/logs/agent': return
        need(not self._sealed and not self._poisoned, 'agent writers sealed')
        need(not str(target_dir).startswith(('/tests', '/logs/verifier')), 'oracle/reward upload refused')
        return await self._backend.upload_dir(source_dir, target_dir)

    async def snapshot(self, source='/app'):
        need(source in ('/app', '/logs/agent', '/logs/artifacts'), 'unsupported snapshot root')
        async with self._lock:
            need(not self._poisoned, 'transport capability poisoned')
            if source in self._snapshots: return self._snapshots[source]
            deadline = time.monotonic()+90
            try:
                if not self._sealed:
                    receipt = await asyncio.wait_for(self._backend.seal_all(), 30)
                    need(receipt is not None, 'missing all-writer seal')
                    confirmed = await asyncio.wait_for(self._backend.confirm_sealed(receipt), 30)
                    need(confirmed is True, 'all-writer seal not confirmed')
                    self._sealed = True
                reader = await asyncio.wait_for(self._backend.archive(source), deadline-time.monotonic())
                try:
                    with tempfile.TemporaryFile(dir=self._private.name) as spool:
                        size = await bounded_spool(reader, spool, deadline, MAX_ARCHIVE-self._download_bytes)
                        self._download_bytes += size
                        prefix = getattr(self._backend, 'archive_prefix', lambda source: None)(source)
                        entries, payload = inventory(spool, deadline, prefix)
                        modes={}
                        for parts,kind,_,offset in entries:
                            if kind==b'5': continue
                            spool.seek(offset-512+100)
                            raw=spool.read(8).rstrip(b'\0 ').lstrip(b' ')
                            need(bool(raw) and all(48<=b<=55 for b in raw),'invalid archive file mode')
                            modes['/'.join(parts)]=int(raw,8)&0o777
                        self._snapshot_modes[source]=modes
                        self._entry_count += len(entries); self._payload_bytes += payload
                        need(self._entry_count <= MAX_ENTRIES, 'aggregate archive entry limit')
                        need(self._payload_bytes <= MAX_BYTES, 'aggregate archive payload limit')
                        target = Path(self._private.name)/str(len(self._snapshots))
                        materialize(spool, entries, target, deadline)
                finally: await asyncio.wait_for(reader.close(), 5)
                self._snapshots[source] = target
                return target
            except BaseException:
                self._poisoned = True
                raise

    async def download_dir(self, source_dir, target_dir):
        # Capture privately first, including Harbor's pre-verifier log download.
        # Never let an agent-selected artifact overwrite a controller config,
        # result, oracle or reward. Publication remains a diagnostic, not input
        # to acceptance; all writes are descriptor-relative and exclusive.
        private = await self.snapshot(str(source_dir))
        deadline = time.monotonic()+30
        trial = self.trial_paths.trial_dir.absolute()
        target = Path(target_dir).absolute()
        relative = target.relative_to(trial)
        need(relative.parts and relative.parts[0] in ('agent','artifacts') and
             all(p not in ('.','..','') for p in relative.parts), 'host download destination refused')
        root = root_open(trial, deadline)
        try:
            for part in relative.parts:
                try: os.mkdir(part, 0o700, dir_fd=root)
                except FileExistsError: pass
                child = os.open(part, flags(True), dir_fd=root); os.close(root); root = child
            for directory, dirs, files in os.walk(private):
                tick(deadline)
                parts = Path(directory).relative_to(private).parts
                parent = os.dup(root)
                try:
                    for part in parts:
                        child = os.open(part, flags(True), dir_fd=parent); os.close(parent); parent = child
                    for name in dirs:
                        try: os.mkdir(name, 0o700, dir_fd=parent)
                        except FileExistsError:
                            check = os.open(name, flags(True), dir_fd=parent); os.close(check)
                    for name in files:
                        try: fd = os.open(name, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600, dir_fd=parent)
                        except FileExistsError:
                            # WHY: native's final result download precedes Harbor's
                            # directory sync. An identical diagnostic may be seen
                            # twice, but an existing host file is NEVER replaced.
                            existing=os.open(name,flags(),dir_fd=parent)
                            with os.fdopen(existing,'rb') as host:
                                info=os.fstat(host.fileno()); submitted=Path(directory)/name
                                need(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_size==submitted.stat().st_size,
                                     'diagnostic publication conflict')
                                need(host.read(MAX_FILE_BYTES+1)==submitted.read_bytes(),'diagnostic publication conflict')
                            continue
                        with os.fdopen(fd,'wb') as output, (Path(directory)/name).open('rb') as source:
                            while data := source.read(CHUNK): tick(deadline); output.write(data)
                finally: os.close(parent)
        finally: os.close(root)
    async def download_file(self, source_path, target_path):
        # Existing host-agent adapters collect their final diagnostic this way.
        # Seal and snapshot its ENTIRE fixed log root first; never read a mutable
        # single file or fall back to Harbor's tar/exec/cp helpers.
        source=str(source_path); roots={'/logs/agent':'agent','/logs/artifacts':'artifacts'}
        root=next((r for r in roots if source.startswith(r+'/')),None)
        need(root is not None,'individual non-diagnostic downloads refused')
        parts=source[len(root)+1:].split('/')
        need(all(p not in ('','.','..') and '\\' not in p for p in parts),'unsafe diagnostic path')
        trial=self.trial_paths.trial_dir.absolute(); expected=trial/roots[root]/Path(*parts)
        need(Path(target_path).absolute()==expected,'diagnostic destination mismatch')
        private=await self.snapshot(root)
        if not private.joinpath(*parts).is_file(): raise FileNotFoundError(source)
        await self.download_dir(root,trial/roots[root])
    async def download_dir_filtered(self, *, source_dir, target_dir, **kwargs):
        if any(kwargs.values()):
            await self.snapshot(str(source_dir))
            raise ValueError('Filtered host publication unavailable; private snapshot retained')
        await self.download_dir(source_dir, target_dir)
    async def download_dir_with_exclusions(self, *, source_dir, target_dir, **kwargs):
        await self.download_dir_filtered(source_dir=source_dir, target_dir=target_dir, **kwargs)
