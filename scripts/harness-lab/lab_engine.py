"""Narrow trusted-controller Engine capability. No CLI, socket discovery or pulls.

This is executable transport, NOT runtime qualification or execution authority.
Only a controller-issued private policy can create a trial; submissions cannot
choose socket, identity, image, mounts, network, entrypoint or engine options.
"""
import asyncio
import base64
from dataclasses import dataclass
import io
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tarfile
import tempfile
import time
from urllib.parse import quote

from bounded_inputs import CHUNK, MAX_BYTES, MAX_FILE_BYTES, need

API = '1.47'
# WHY: server max API is not the wire API. Admit only reviewed releases whose
# advertised range contains our fixed protocol; this is not runtime qualification.
ENGINE_VERSIONS = ('27.5.1', '29.8.2')
MAX_JSON = 2*1024*1024
ROOTS = ('/app', '/logs/agent', '/logs/artifacts')
PRIVATE_OPTIONS = {'com.docker.network.bridge.gateway_mode_ipv4':'isolated',
                   'com.docker.network.bridge.gateway_mode_ipv6':'isolated'}
ID = re.compile(r'[a-f0-9]{64}')
IMAGE = re.compile(r'sha256:[a-f0-9]{64}')


@dataclass(frozen=True)
class Policy:
    socket: str
    session: str
    nonce: str
    image: str
    network: str
    network_id: str
    gateway_id: str
    gateway_image: str
    gateway_spec: str | None = None
    gateway_outbound: str | None = None
    registry_path: str | None = None
    image_labels: dict | None = None
    gateway_image_labels: dict | None = None

    def __post_init__(self):
        need(Path(self.socket).is_absolute() and '://' not in self.socket, 'absolute Unix socket required')
        need(re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',self.session) and re.fullmatch(r'[a-f0-9]{32}',self.nonce), 'invalid session identity')
        need(IMAGE.fullmatch(self.image) and IMAGE.fullmatch(self.gateway_image) and ID.fullmatch(self.gateway_id), 'exact image/container identity required')
        need(re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',self.network) and re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',self.network_id), 'private network identity required')
        need(self.gateway_spec is None or ID.fullmatch(self.gateway_spec),'invalid gateway registry digest')
        need(self.gateway_outbound is None or ID.fullmatch(self.gateway_outbound),'invalid outbound network identity')

    def labels(self, role='trial'):
        inherited=self.gateway_image_labels if role=='gateway' else self.image_labels
        return expected_labels(inherited,{'io.youcoded.session':self.session, 'io.youcoded.nonce':self.nonce, 'io.youcoded.role':role})


def expected_labels(inherited,owned):
    # WHY: Engine merges immutable image labels into Config.Labels. Bind that
    # exact inspected map, then explicitly override ownership collisions. Never
    # accept a subset check that would allow unknown extras or foreign nonces.
    need(inherited is None or isinstance(inherited,dict) and all(isinstance(k,str) and isinstance(v,str) for k,v in inherited.items()),'invalid image labels')
    return {**(inherited or {}),**owned}


class Body:
    """Incremental HTTP framing; bounded reads, absolute deadline, close on cancel."""
    def __init__(self, reader, writer, headers, deadline, limit, allow_eof=False):
        self.reader=reader; self.writer=writer; self.deadline=deadline; self.limit=limit; self.total=0
        self.chunked=headers.get('transfer-encoding') == 'chunked'; self.chunk=0; self.done=False
        length=headers.get('content-length')
        self.eof=allow_eof and not self.chunked and length is None
        need(self.eof or self.chunked != (length is not None), 'ambiguous HTTP framing')
        need(not self.chunked or 'content-length' not in headers, 'conflicting framing')
        need(length is None or re.fullmatch(r'[0-9]{1,12}',length), 'invalid HTTP length')
        self.remaining=int(length) if length is not None else None
        need(self.remaining is None or self.remaining <= limit, 'HTTP byte limit')

    async def wait(self, awaitable):
        try:
            return await asyncio.wait_for(awaitable, max(0,self.deadline-time.monotonic()))
        except BaseException:
            await self.close(); raise

    async def read(self,n):
        need(0 < n <= CHUNK, 'bounded read required')
        if self.done: return b''
        try:
            if self.eof:
                data=await self.wait(self.reader.read(min(n,self.limit-self.total+1)))
                self.total+=len(data); need(self.total<=self.limit,'HTTP byte limit')
                self.done=not data
                return data
            if self.chunked and self.chunk == 0:
                line=await self.wait(self.reader.readuntil(b'\r\n'))
                need(len(line)<=18 and re.fullmatch(b'[0-9a-fA-F]+\r\n',line), 'HTTP chunk extension/size refused')
                self.chunk=int(line[:-2],16)
                need(self.total+self.chunk<=self.limit, 'HTTP byte limit')
                if not self.chunk:
                    need(await self.wait(self.reader.readexactly(2))==b'\r\n', 'HTTP trailers refused')
                    self.done=True; return b''
            count=min(n,self.chunk if self.chunked else self.remaining)
            if not count: self.done=True; return b''
            data=await self.wait(self.reader.readexactly(count)); self.total+=len(data)
            need(self.total<=self.limit, 'HTTP byte limit')
            if self.chunked:
                self.chunk-=len(data)
                if not self.chunk: need(await self.wait(self.reader.readexactly(2))==b'\r\n','HTTP chunk framing')
            else: self.remaining-=len(data)
            return data
        except BaseException:
            await self.close(); raise

    async def close(self):
        self.writer.close()
        try: await asyncio.wait_for(self.writer.wait_closed(),1)
        except (OSError,TimeoutError): pass


class Engine:
    def __init__(self,socket,timeout=30):
        need(Path(socket).is_absolute() and '://' not in socket, 'absolute Unix socket required')
        self.socket=socket; self.timeout=timeout

    async def request(self,method,path,payload=None,limit=MAX_JSON,raw=False,versioned=True,timeout=None,allow_eof=False):
        deadline=time.monotonic()+(timeout or self.timeout)
        reader,writer=await asyncio.wait_for(asyncio.open_unix_connection(self.socket,limit=16384),self.timeout)
        try:
            data=payload if isinstance(payload,bytes) else json.dumps(payload).encode() if payload is not None else b''
            target=('/v'+API if versioned else '')+path
            need(method in ('GET','POST','PUT','DELETE') and target.startswith('/') and not any(c in target for c in '\r\n '), 'invalid Engine request')
            writer.write((method+' '+target+' HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: '+('application/x-tar' if isinstance(payload,bytes) else 'application/json')+'\r\nContent-Length: '+str(len(data))+'\r\n\r\n').encode()+data)
            await asyncio.wait_for(writer.drain(),max(0,deadline-time.monotonic()))
            header=await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'),max(0,deadline-time.monotonic()))
            need(len(header)<=16384,'HTTP header limit')
            lines=header.decode('ascii').split('\r\n'); status=lines.pop(0).split(' ')
            need(len(status)>=2 and status[0]=='HTTP/1.1' and status[1] in ('200','201','204'), 'Engine status refused: '+str(status[:2]))
            headers={}
            for line in lines:
                if not line: continue
                key,value=line.split(':',1); key=key.lower()
                need(key not in headers,'duplicate HTTP header'); headers[key]=value.strip()
            # Engine's successful 204 has no body or Content-Length.
            if status[1]=='204' and 'content-length' not in headers: headers['content-length']='0'
            need(headers.get('transfer-encoding') in (None,'chunked'),'unsupported transfer encoding')
            body=Body(reader,writer,headers,deadline,limit,allow_eof)
            if raw: return headers,body
            output=bytearray()
            try:
                while chunk:=await body.read(CHUNK): output.extend(chunk)
            finally: await body.close()
            return json.loads(output) if output else None
        except BaseException:
            writer.close(); await writer.wait_closed(); raise

    async def preflight(self):
        result=await self.request('GET','/version',versioned=False)
        need(isinstance(result,dict) and result.get('Version') in ENGINE_VERSIONS and
             (result.get('Os'),result.get('Arch')) == ('linux','amd64'), 'unsupported Engine version/architecture')
        def protocol(value):
            # Missing, non-string or malformed bounds refuse; never infer a minimum.
            need(isinstance(value,str) and re.fullmatch(r'(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})',value),
                 'unsupported Engine API range')
            return tuple(map(int,value.split('.')))
        need(protocol(result.get('MinAPIVersion')) <= protocol(API) <= protocol(result.get('ApiVersion')),
             'unsupported Engine API range')
        return result


def gateway_signature(record):
    # Config, host authority and mounts are fixed at trusted acquisition. Runtime
    # State and endpoint IPs may change, so they are inspected separately.
    encode=lambda value: json.dumps(value,sort_keys=True,separators=(',',':'))
    host=dict(record.get('HostConfig') or {})
    # Actual Engine 29.8.2 receipts show ONLY false -> null at start here;
    # both leave OOM killing enabled. Never accept true, numeric 0 or strings.
    need(host.get('OomKillDisable') is None or host.get('OomKillDisable') is False,'gateway OOM killing must remain enabled')
    host['OomKillDisable']=False
    # Engine's resolved Mounts list can reorder independent destinations at start.
    # Keep every field and duplicate, canonicalizing order only (not a set).
    if isinstance(host.get('Mounts'),list):
        need(len({m.get('Target') for m in host['Mounts']})==len(host['Mounts']),'duplicate gateway mount target')
        host['Mounts']=sorted(host['Mounts'],key=encode)
    mounts=record.get('Mounts')
    if isinstance(mounts,list):
        need(len({m.get('Destination') for m in mounts})==len(mounts),'duplicate gateway mount destination')
        mounts=sorted(mounts,key=encode)
    return hashlib.sha256(encode(dict(Config=record.get('Config'),HostConfig=host,Mounts=mounts)).encode()).hexdigest()


class DockerCapability:
    def __init__(self,policy,engine=None,container_id=None):
        self.policy=policy; self.engine=engine or Engine(policy.socket); self.cid=container_id
        need(container_id is None or ID.fullmatch(container_id),'exact owned container ID required')
        self.registry={} if container_id is None else {container_id:(policy.image,policy.labels())}
        self.sealed=False; self.poisoned=False; self._writers=asyncio.Lock()

    async def inspect(self,cid=None,pending=False,cleanup=False):
        cid=cid or self.cid; need(cid in self.registry,'container absent from trusted registry')
        record=await self.engine.request('GET','/containers/'+cid+'/json')
        image,labels=self.registry[cid]
        need(record.get('Id')==cid and record.get('Image')==image and record.get('Config',{}).get('Labels')==labels, 'foreign container identity')
        need(not record.get('Mounts') and not record.get('Config',{}).get('Volumes'), 'external/shared/oracle mounts refused')
        host=record.get('HostConfig',{})
        need(not any(host.get(k) for k in ('Privileged','Binds','VolumesFrom','Mounts','Devices','DeviceRequests','PortBindings','PublishAllPorts','Links','ExtraHosts')) and
             host.get('UsernsMode','') != 'host' and host.get('CgroupnsMode','') != 'host' and host.get('NetworkMode')==self.policy.network and
             host.get('PidMode','')=='' and host.get('IpcMode')=='private' and
             host.get('CapDrop')==['ALL'] and host.get('SecurityOpt')==['no-new-privileges'] and host.get('Dns')==['127.0.0.1'], 'unsafe container host policy')
        networks=record.get('NetworkSettings',{}).get('Networks',{})
        if cleanup:
            # A known owned create may fail before allocating any live endpoint.
            # Identity/mount/host policy remains mandatory; no foreign attachment
            # is accepted, but an absent pending endpoint does not orphan it.
            need(set(networks)<= {self.policy.network} and all(v.get('NetworkID') in ('',self.policy.network_id) for v in networks.values()),'cleanup foreign network attachment')
        else:
            need(set(networks)=={self.policy.network} and networks[self.policy.network].get('NetworkID') in (('',self.policy.network_id) if pending else (self.policy.network_id,)),'trial network mismatch')
        return record

    async def network(self,include_trial=True):
        p=self.policy
        network=await self.engine.request('GET','/networks/'+quote(p.network_id,safe=''))
        need(network.get('Id')==p.network_id and network.get('Name')==p.network and network.get('Internal') is True and network.get('Driver')=='bridge' and
             network.get('Labels')=={'io.youcoded.session':p.session,'io.youcoded.nonce':p.nonce},'private internal network mismatch')
        # Internal alone can still leave a host bridge address reachable. The
        # isolated gateway modes omit that address; localhost-only DNS prevents
        # external resolver forwarding while embedded owned-alias lookup remains.
        need(network.get('EnableIPv6') is False and all(network.get('Options',{}).get(k)==v for k,v in PRIVATE_OPTIONS.items()),'private bridge host/DNS isolation unqualified')
        need(set(network.get('Containers',{}))==({p.gateway_id,self.cid} if include_trial else {p.gateway_id}), 'network peer mismatch')
        gateway=await self.engine.request('GET','/containers/'+p.gateway_id+'/json')
        need(gateway.get('Id')==p.gateway_id and gateway.get('Image')==p.gateway_image and gateway.get('Config',{}).get('Labels')==p.labels('gateway'),'gateway identity mismatch')
        need(p.gateway_spec is None or gateway_signature(gateway)==p.gateway_spec,'gateway config/mount registry mismatch')
        attachments=gateway.get('NetworkSettings',{}).get('Networks',{})
        if p.gateway_outbound:
            need(len(attachments)==2 and {v.get('NetworkID') for v in attachments.values()}=={p.network_id,p.gateway_outbound},'gateway external attachment mismatch')
            outbound=await self.engine.request('GET','/networks/'+p.gateway_outbound)
            need(outbound.get('Id')==p.gateway_outbound and outbound.get('Driver')=='bridge' and outbound.get('Internal') is False and
                 outbound.get('Labels')=={'io.youcoded.session':p.session,'io.youcoded.nonce':p.nonce} and
                 set(outbound.get('Containers',{}))=={p.gateway_id},'gateway outbound network ownership mismatch')
        else: need(set(attachments)=={p.network},'unregistered gateway outside connection')
        attachment=attachments.get(p.network,{})
        need(attachment.get('NetworkID')==p.network_id and 'yc-router-gateway' in attachment.get('Aliases',[]),'gateway alias mismatch')
        # Gateway alone may also use its controller-owned outbound bridge. It is
        # NOT an archive writer and is never mounted into the trial.
        return network

    async def start(self,force_build=False):
        need(not force_build,'build/pull unavailable in capability runtime')
        await self.engine.preflight()
        image=await self.engine.request('GET','/images/'+self.policy.image+'/json')
        need(image.get('Id')==self.policy.image and image.get('Architecture')=='amd64' and image.get('Os')=='linux' and not image.get('Config',{}).get('Volumes'),'image identity/architecture/declared volumes mismatch')
        need(expected_labels(image.get('Config',{}).get('Labels'),{})==expected_labels(self.policy.image_labels,{}),'immutable image labels differ from controller policy')
        need(self.cid is None,'cannot start preexisting container')
        await self.network(False)
        body=dict(Image=self.policy.image, Labels=self.policy.labels(), WorkingDir='/app',
                  Cmd=['sleep','infinity'],
                  Entrypoint=[], Env=['PATH=/usr/local/bin:/usr/bin:/bin:/opt/venv/bin:/root/.local/bin','HOME=/root'],
                  HostConfig=dict(NetworkMode=self.policy.network, CapDrop=['ALL'],SecurityOpt=['no-new-privileges'],
                                  IpcMode='private', Dns=['127.0.0.1'], PidsLimit=256,Memory=4294967296,NanoCpus=2000000000,
                                  LogConfig={'Type':'none','Config':{}}),
                  NetworkingConfig={'EndpointsConfig':{self.policy.network:{}}})
        from lab_engine_registry import create
        created=await create(self.engine,self.policy.registry_path,'container',body)
        self.cid=created['Id']; self.registry[self.cid]=(self.policy.image,self.policy.labels())
        need(not created.get('Warnings'),'container creation warning refused')
        await self.inspect(pending=True)
        # Docker allocates the live endpoint at start, not necessarily create.
        # Ownership/mount/host policy is checked before start; positive endpoint
        # and exact peer checks are mandatory immediately afterward.
        await self.engine.request('POST','/containers/'+self.cid+'/start')
        await self.inspect(); await self.network()
        # Positive readiness, not a race with PID 1's startup shell.
        initialized=await self.exec('mkdir -p /logs/agent /logs/artifacts',timeout_sec=10)
        need(initialized.return_code==0,'trial log initialization failed')
        if getattr(self,'fixtures',None) is not None:
            await self.upload_dir(self.fixtures,'/app')

    async def seal_all(self):
        # Engine archive uploads are host-side writers, unaffected by cgroup
        # pause. Drain them under the same lock before freezing container tasks.
        async with self._writers:
            need(not self.poisoned,'writer transport poisoned')
            self.sealed=True
            try: return await self._seal_all()
            except BaseException:
                self.poisoned=True
                raise

    async def _seal_all(self):
        await self.inspect(); await self.network()
        # No volumes, mounts or sidecars can write the container's private root.
        # A 204 is not proof: every pause is followed by positive State inspection.
        response=await self.engine.request('POST','/containers/'+self.cid+'/pause')
        need(response is None,'pause warning/body refused')
        self.sealed=True
        need(await self.confirm_sealed(self.cid),'container not positively paused')
        return self.cid

    async def confirm_sealed(self,receipt):
        need(not self.poisoned,'writer transport poisoned')
        need(receipt==self.cid and self.sealed,'invalid seal receipt')
        record=await self.inspect(); await self.network()
        need(record.get('State',{}).get('Paused') is True and record['State'].get('Running') is True,'container not positively paused')
        return True

    async def archive(self,source):
        need(source in ROOTS,'archive root refused'); need(self.sealed,'archive requires sealed writers')
        await self.confirm_sealed(self.cid)
        from lab_harbor_transport import MAX_ARCHIVE
        headers,body=await self.engine.request('GET','/containers/'+self.cid+'/archive?path='+quote(source,safe=''),limit=MAX_ARCHIVE,raw=True)
        try:
            need(headers.get('content-type')=='application/x-tar','archive content type mismatch')
            encoded=headers.get('x-docker-container-path-stat',''); need(len(encoded)<=8192,'archive stat limit')
            info=json.loads(base64.b64decode(encoded,validate=True))
            need(info.get('name')==source.rsplit('/',1)[1] and type(info.get('mode')) is int and info['mode'] & (1<<31) and
                 not info['mode'] & ((1<<27)|(1<<26)|(1<<25)|(1<<24)|(1<<19)) and
                 type(info.get('size')) is int and 0<=info['size']<=MAX_FILE_BYTES and info.get('linkTarget','')=='', 'archive stat context mismatch')
            return body
        except BaseException: await body.close(); raise

    def archive_prefix(self,source): return source.rsplit('/',1)[1]

    async def exec(self,*args,**kwargs):
        async with self._writers:
            need(not self.poisoned,'writer transport poisoned')
            try: return await self._exec(*args,**kwargs)
            except BaseException:
                self.poisoned=True
                raise

    async def _exec(self,command,cwd=None,env=None,timeout_sec=None,user=None):
        need(not self.sealed,'agent writers sealed'); await self.inspect(); await self.network()
        need(isinstance(command,str) and len(command)<=MAX_FILE_BYTES,'command size limit')
        need(cwd is None or cwd.startswith('/') and '\x00' not in cwd,'invalid cwd')
        request=dict(AttachStdout=True,AttachStderr=True,Tty=False,Cmd=['/bin/bash','-c',command],
                     WorkingDir=cwd or '/app', Env=[str(k)+'='+str(v) for k,v in (env or {}).items()])
        if user is not None: request['User']=str(user)
        created=await self.engine.request('POST','/containers/'+self.cid+'/exec',request)
        eid=created.get('Id',''); need(ID.fullmatch(eid),'invalid exec identity')
        async def run():
            _,body=await self.engine.request('POST','/exec/'+eid+'/start',{'Detach':False,'Tty':False},limit=MAX_BYTES,raw=True,timeout=timeout_sec or 180,allow_eof=True)
            output=bytearray()
            try:
                while chunk:=await body.read(CHUNK): output.extend(chunk)
            finally: await body.close()
            streams=[bytearray(),bytearray()]; offset=0
            while offset<len(output):
                frame=output[offset:offset+8]; need(len(frame)==8 and frame[0] in (1,2) and frame[1:4]==b'\0'*3,'exec stream framing')
                size=int.from_bytes(frame[4:],'big'); offset+=8
                need(size<=len(output)-offset,'truncated exec stream'); streams[frame[0]-1].extend(output[offset:offset+size]); offset+=size
            state=await self.engine.request('GET','/exec/'+eid+'/json')
            need(state.get('Running') is False and type(state.get('ExitCode')) is int,'unfinished exec')
            from harbor.environments.base import ExecResult
            return ExecResult(return_code=state['ExitCode'],stdout=streams[0].decode(errors='replace'),stderr=streams[1].decode(errors='replace'))
        return await asyncio.wait_for(run(),timeout_sec or 180)

    async def upload_file(self,source_path,target_path):
        return await self._upload(Path(source_path),target_path,False)
    async def upload_dir(self,source_dir,target_dir):
        return await self._upload(Path(source_dir),target_dir,True)
    async def _upload(self,*args):
        async with self._writers:
            need(not self.poisoned,'writer transport poisoned')
            try: return await self._upload_locked(*args)
            except BaseException:
                self.poisoned=True
                raise

    async def _upload_locked(self,source,target,directory):
        # Upload only controller-held regular files. No reward/oracle locations,
        # links, sockets, special files, absolute TAR names or recursive tar.add.
        parts=str(target).split('/')[1:]
        need(str(target).startswith('/') and len(str(target).encode())<=4096 and len(parts)<=64 and parts and
             all(x not in ('','.','..') and '\\' not in x and not any(ord(c)<32 for c in x) for x in parts),'unsafe upload path')
        need(any(str(target)==p or str(target).startswith(p+'/') for p in ('/app','/tmp','/root','/installed-agent','/opt/youcoded-lab','/logs/agent','/logs/artifacts')),'oracle/reward upload refused')
        need(not self.sealed,'agent writers sealed'); await self.inspect()
        from bounded_inputs import copy, root_open, flags, tick, identity
        deadline=time.monotonic()+30
        out=io.BytesIO()
        with tempfile.TemporaryDirectory(prefix='yc-upload-') as tmp:
            private=Path(tmp)/'input'
            if directory:
                # Descriptor-relative ingestion detects replacement races and
                # freezes a bounded private copy BEFORE encoding any TAR bytes.
                records=copy(source,private,deadline=deadline)
            else:
                parent=root_open(source.parent,deadline)
                try: fd=os.open(source.name,flags(),dir_fd=parent)
                finally: os.close(parent)
                with os.fdopen(fd,'rb') as stream:
                    before=os.fstat(stream.fileno())
                    need(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_size<=MAX_FILE_BYTES,'regular bounded upload required')
                    data=stream.read(MAX_FILE_BYTES+1)
                    need(len(data)==before.st_size and identity(os.fstat(stream.fileno()))==identity(before),'upload changed during read')
                private.write_bytes(data)
            with tarfile.open(fileobj=out,mode='w',format=tarfile.USTAR_FORMAT) as tar:
                if directory:
                    root=tarfile.TarInfo('/'.join(parts)); root.type=tarfile.DIRTYPE; root.mode=0o755; tar.addfile(root)
                paths=sorted(private.rglob('*')) if directory else [private]
                for path in paths:
                    tick(deadline); info=path.lstat()
                    name='/'.join(parts)+('/'+path.relative_to(private).as_posix() if directory else '')
                    entry=tarfile.TarInfo(name); entry.mode=info.st_mode & 0o777
                    if stat.S_ISDIR(info.st_mode): entry.type=tarfile.DIRTYPE; tar.addfile(entry); continue
                    entry.mode=records[path.relative_to(private).as_posix()]['mode'] if directory else before.st_mode & 0o777
                    entry.size=info.st_size
                    with path.open('rb') as stream: tar.addfile(entry,stream)
        await self.engine.request('PUT','/containers/'+self.cid+'/archive?path=%2F',out.getvalue())

    async def stop(self,delete=True):
        # Never resume a sealed trial. Delete only after full positive identity
        # inspection; foreign replacement is left untouched for operator review.
        if self.cid is None: return
        from lab_engine_registry import event
        try:
            await self.inspect(cleanup=True)
            if delete:
                await self.engine.request('DELETE','/containers/'+self.cid+'?force=1&v=0')
                event(self.policy.registry_path,action='deleted',kind='container',id=self.cid)
                del self.registry[self.cid]; self.cid=None
        except BaseException as error:
            event(self.policy.registry_path,action='cleanup-error',kind='container',id=self.cid,error=str(error)[:300])
            raise


def controller_backend(environment):
    """Read policy only from a trusted launcher channel, not plugin/agent kwargs."""
    from importlib.metadata import version
    need(version('harbor')=='0.24.0','unsupported Harbor version')
    path=os.environ.get('YC_HARBOR_CONTROLLER_POLICY')
    need(path, 'trusted controller policy required; backend not runtime-qualified')
    file=Path(path); need(file.is_absolute(),'absolute controller policy required')
    from bounded_inputs import root_open, flags
    parent=root_open(file.parent,time.monotonic()+5)
    try: fd=os.open(file.name,flags(),dir_fd=parent)
    finally: os.close(parent)
    try:
        info=os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_uid==os.getuid() and stat.S_IMODE(info.st_mode)==0o600 and info.st_size<=MAX_JSON,'private controller policy required')
        data=json.loads(os.read(fd,MAX_JSON+1))
    finally: os.close(fd)
    job=getattr(environment,'controller_job_id',None)
    need(job is None or re.fullmatch(r'[a-zA-Z0-9_-]{1,150}',job),'invalid controller job identity')
    if 'jobs' in data:
        need(job in data['jobs'],'unregistered controller job')
        data=data['jobs'][job]
    need(data['environmentDir']==str(environment.environment_dir.resolve()),'controller policy task mismatch')
    if 'sessionId' in data:
        need(data['sessionId']==environment.session_id,'controller policy session mismatch')
    else:
        trial=environment.trial_paths.trial_dir.resolve()
        need(job and trial.parent==Path(data['jobDir']) and trial.parent.name==job,'controller policy job/session mismatch')
        # One policy owns exactly one Harbor environment; a retry or second
        # verifier-side environment cannot silently acquire another writer.
        claim=file.with_name(file.name+'.'+job+'.claimed')
        fd=os.open(claim,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        os.close(fd)
    policy=Policy(**data['engine'])
    need(policy.registry_path and Path(policy.registry_path).is_absolute(),'durable controller ownership registry required')
    backend=DockerCapability(policy)
    backend.fixtures=environment.environment_dir/'fixtures'
    need(backend.fixtures.is_dir(),'trusted task fixtures absent')
    return backend
