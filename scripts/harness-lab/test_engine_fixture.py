"""Minimal owned Unix HTTP Engine fixture. Never executes container commands.

Controller uploads are decoded into its own temp tree, with explicit TAR bounds;
submitted JS is executed only by the production BwrapExecutor in host verification.
"""
import base64
import io
import json
from pathlib import Path
import re
import socketserver
import tarfile
import tempfile
import threading
from urllib.parse import unquote,urlsplit,parse_qs

IMAGE='sha256:'+'c'*64
PIN='fixture@'+IMAGE


class FakeEngine:
    def __init__(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='yc-fake-engine-'); self.root=Path(self.tmp.name)
        self.socket=str(self.root/'engine.sock'); self.containers={}; self.networks={}; self.execs={}; self.calls=[]
        self.counter=0; self.native_calls=0; self.bad_adapter=None; self.fail_start=False; self.fail_delete=set(); self.warn_network=False; self.warn_gateway=False
    def identity(self): self.counter+=1; return f'{self.counter:064x}'
    def __enter__(self):
        outer=self
        class Handler(socketserver.StreamRequestHandler):
            def handle(self):
                method,target,_=self.rfile.readline().decode().strip().split(' '); headers={}
                while (line:=self.rfile.readline())!=b'\r\n':
                    k,v=line.decode().split(':',1); headers[k.lower()]=v.strip()
                length=int(headers.get('content-length','0')); assert length<=128*1024*1024
                raw=self.rfile.read(length)
                try: status,result,extra=outer.route(method,target,raw)
                except Exception as error: status,result,extra=500,{'error':str(error)},{}
                data=result if isinstance(result,bytes) else json.dumps(result).encode() if result is not None else b''
                self.wfile.write((f'HTTP/1.1 {status} Result\r\nContent-Length: {len(data)}\r\n'+''.join(f'{k}: {v}\r\n' for k,v in extra.items())+'\r\n').encode()+data)
        self.server=socketserver.ThreadingUnixStreamServer(self.socket,Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start(); return self
    def __exit__(self,*args):
        self.server.shutdown(); self.server.server_close(); self.thread.join(); self.tmp.cleanup()
    def route(self,method,target,raw):
        self.calls.append((method,target))
        parsed=urlsplit(target); path=parsed.path.removeprefix('/v1.47'); parts=path.strip('/').split('/')
        data=json.loads(raw) if raw and '/archive' not in path else None
        if path=='/version': return 200,dict(ApiVersion='1.47',MinAPIVersion='1.24',Version='27.5.1',Os='linux',Arch='amd64'),{}
        if parts[0]=='images': return 200,dict(Id=IMAGE,RepoDigests=[PIN],Os='linux',Architecture='amd64',Config={}),{}
        if path=='/networks/create':
            nid=self.identity(); self.networks[nid]={**data,'Id':nid,'Containers':{}}
            return 201,dict(Id=nid,Warning='warning' if self.warn_network else ''),{}
        if parts[0]=='networks':
            nid=parts[1]; network=self.networks[nid]
            if method=='GET': return 200,network,{}
            if method=='DELETE':
                if nid in self.fail_delete: return 500,{'error':'injected network deletion failure'},{}
                assert not network['Containers']; del self.networks[nid]; return 204,None,{}
            if parts[2]=='connect':
                c=self.containers[data['Container']]
                c['NetworkSettings']['Networks'][network['Name']]={'NetworkID':nid,**data.get('EndpointConfig',{})}
                return 200,None,{}
        if path=='/containers/create':
            cid=self.identity(); directory=self.root/cid; directory.mkdir(); (directory/'app').mkdir()
            mode=data['HostConfig']['NetworkMode']; network=next(n for n in self.networks.values() if n['Name']==mode)
            endpoints=data.get('NetworkingConfig',{}).get('EndpointsConfig',{})
            config={k:v for k,v in data.items() if k not in ('HostConfig','NetworkingConfig')}
            self.containers[cid]=dict(Id=cid,Image=IMAGE,Config=config,HostConfig=data['HostConfig'],
                Mounts=[dict(Type=m['Type'],Source=m['Source'],Destination=m['Target'],RW=not m['ReadOnly']) for m in data['HostConfig'].get('Mounts',[])],
                State=dict(Running=False,Paused=False),NetworkSettings={'Networks':{mode:{'NetworkID':'',**endpoints.get(mode,{})}}})
            warning=self.warn_gateway and config['Labels']['io.youcoded.role']=='gateway'
            return 201,dict(Id=cid,Warnings=['warning'] if warning else []),{}
        if parts[0]=='containers':
            cid=parts[1]; c=self.containers[cid]; directory=self.root/cid
            if method=='DELETE':
                if cid in self.fail_delete: return 500,{'error':'injected deletion failure'},{}
                for n in self.networks.values(): n['Containers'].pop(cid,None)
                del self.containers[cid]; return 204,None,{}
            operation=parts[2]
            if operation=='json': return 200,c,{}
            if operation=='start':
                if self.fail_start and c['Config']['Labels']['io.youcoded.role']=='trial': return 500,{'error':'injected start failure'},{}
                c['State']['Running']=True
                for name,v in c['NetworkSettings']['Networks'].items():
                    n=next(n for n in self.networks.values() if n['Name']==name)
                    v.update(NetworkID=n['Id'],IPAddress='172.25.0.2'); n['Containers'][cid]={}
                return 204,None,{}
            if operation=='pause': c['State']['Paused']=True; return 204,None,{}
            if operation=='exec':
                eid=self.identity(); self.execs[eid]=(cid,data,0); return 201,dict(Id=eid),{}
            if operation=='archive' and method=='PUT':
                assert not c['State']['Paused']
                with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as tar:
                    for count,entry in enumerate(tar):
                        assert count<10002 and entry.size<=8*1024*1024 and entry.type in (tarfile.REGTYPE,tarfile.DIRTYPE)
                        names=entry.name.rstrip('/').split('/'); assert all(x not in ('','.','..') for x in names)
                        dest=directory.joinpath(*names)
                        if entry.isdir(): dest.mkdir(parents=True,exist_ok=True)
                        else:
                            dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(tar.extractfile(entry).read(entry.size)); dest.chmod(entry.mode & 0o777)
                return 200,None,{}
            if operation=='archive':
                assert c['State']['Paused'] is True
                source=parse_qs(parsed.query)['path'][0]; folder=directory/source.lstrip('/'); assert folder.is_dir()
                out=io.BytesIO()
                with tarfile.open(fileobj=out,mode='w',format=tarfile.USTAR_FORMAT) as tar:
                    tar.add(folder,arcname=folder.name,recursive=False)
                    for file in sorted(folder.rglob('*')): tar.add(file,arcname=folder.name+'/'+file.relative_to(folder).as_posix(),recursive=False)
                header=base64.b64encode(json.dumps(dict(name=folder.name,size=0,mode=(1<<31)|0o755,linkTarget='')).encode()).decode()
                return 200,out.getvalue(),{'Content-Type':'application/x-tar','X-Docker-Container-Path-Stat':header}
        if parts[0]=='exec':
            eid=parts[1]; cid,spec,exitcode=self.execs[eid]
            if parts[2]=='json': return 200,dict(Running=False,ExitCode=exitcode),{}
            command=spec['Cmd'][-1]; stdout=b''; stderr=b''; directory=self.root/cid
            if 'mkdir -p /logs/agent' in command:
                (directory/'logs/agent').mkdir(parents=True,exist_ok=True); (directory/'logs/artifacts').mkdir(parents=True,exist_ok=True)
            elif 'owned-gateway-only' in command: stdout=b'owned-gateway-only\n'
            elif 'printf 1 > /logs/verifier/reward.txt' in command:
                (directory/'logs/verifier').mkdir(parents=True,exist_ok=True); (directory/'logs/verifier/reward.txt').write_text('1')
            elif re.search(r'(claude|pi|opencode|hermes)\s+(?:--version|version)',command):
                adapter=re.search(r'(claude|pi|opencode|hermes)\s+(?:--version|version)',command).group(1); version={'claude':'2.1.302','pi':'1.3.0','opencode':'1.19.3','hermes':'0.22.2'}[adapter]
                if self.bad_adapter==adapter: version='0.0.0'
                stdout=version.encode()
            elif 'runtimeExport' in command:
                self.native_calls+=1
                lock=re.search(r'lock:"([a-f0-9]{64})"',command).group(1)
                stdout=json.dumps(dict(lock=lock,dependencies=1,runtimeExport='createRuntime',node='v26.0.0')).encode()
                if self.bad_adapter=='native' or self.bad_adapter=='second-native' and self.native_calls==2: exitcode=1; stdout=b''; stderr=b'dependency version mismatch'
            self.execs[eid]=(cid,spec,exitcode)
            if data.get('Detach'): return 200,None,{}
            frame=lambda kind,b:bytes([kind,0,0,0])+len(b).to_bytes(4,'big')+b
            return 200,frame(1,stdout)+frame(2,stderr),{'Content-Type':'application/vnd.docker.raw-stream'}
        raise ValueError('unexpected fake Engine API operation '+method+' '+target)
