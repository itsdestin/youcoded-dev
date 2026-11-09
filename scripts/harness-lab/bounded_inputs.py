"""POSIX descriptor-relative bounded input ingestion; no submitted code execution.

Metadata preflight completes before any content read. File opens never follow
links; directory descriptors pin traversal against path replacement races.
"""
import hashlib
import os
from pathlib import Path
import shutil
import stat
import time

MAX_BYTES=128*1024**2
MAX_FILE_BYTES=8*1024**2
MAX_ENTRIES=10000
MAX_DEPTH=64
CHUNK=65536

def need(ok,msg):
    if not ok:raise ValueError(msg)

def tick(deadline):need(time.monotonic()<deadline,'input ingestion deadline exceeded')
def end(deadline):return time.monotonic()+90 if deadline is None else deadline

def identity(s):return (s.st_dev,s.st_ino,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def flags(directory=False):
    need(hasattr(os,'O_NOFOLLOW') and os.open in os.supports_dir_fd,'safe descriptor ingestion unsupported')
    return os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|(os.O_DIRECTORY if directory else 0)

def root_open(root,deadline):
    # Open EVERY component without following symlinks, including ancestors.
    p=Path(os.path.abspath(root));need('..' not in Path(root).parts,'escaped input path')
    fd=os.open('/',flags(True))
    try:
        for part in p.parts[1:]:
            tick(deadline)
            child=os.open(part,flags(True),dir_fd=fd);os.close(fd);fd=child
        return fd
    except BaseException:os.close(fd);raise

def parent_open(rootfd,parts,inventory,deadline):
    fd=os.dup(rootfd)
    try:
        for i,part in enumerate(parts):
            tick(deadline);child=os.open(part,flags(True),dir_fd=fd)
            try:need(identity(os.fstat(child))==inventory['dirs']['/'.join(parts[:i+1])],'input directory changed')
            except BaseException:os.close(child);raise
            os.close(fd);fd=child
        return fd
    except BaseException:os.close(fd);raise

def scan(root,*,deadline=None,max_entries=MAX_ENTRIES,max_bytes=MAX_BYTES,max_file_bytes=MAX_FILE_BYTES):
    deadline=end(deadline);tick(deadline);fd=root_open(root,deadline)
    result={'root':None,'dirs':{},'files':{},'total':0,'entries':0}
    def walk(directory,prefix,depth):
        tick(deadline);need(depth<=MAX_DEPTH,'input depth limit')
        # Never materialize an unbounded scandir/list/sort result.
        with os.scandir(directory) as iterator:
            for entry in iterator:
                tick(deadline);result['entries']+=1;need(result['entries']<=max_entries,'input entry limit')
                name=entry.name;need(name not in ('','.','..') and '/' not in name and '\\' not in name,'escaped input entry')
                rel=prefix+name;s=os.stat(name,dir_fd=directory,follow_symlinks=False)
                need(not stat.S_ISLNK(s.st_mode),'symlink input refused')
                if stat.S_ISDIR(s.st_mode):
                    child=os.open(name,flags(True),dir_fd=directory)
                    try:
                        need(identity(os.fstat(child))==identity(s),'input directory changed');result['dirs'][rel]=identity(s)
                        walk(child,rel+'/',depth+1)
                    finally:os.close(child)
                else:
                    need(stat.S_ISREG(s.st_mode),'ordinary files required; special input refused')
                    need(s.st_nlink==1,'hardlinked input refused')
                    need(0<=s.st_size<=max_file_bytes,'input file size limit')
                    result['total']+=s.st_size;need(result['total']<=max_bytes,'input total size limit')
                    result['files'][rel]=identity(s)
        tick(deadline)
    try:
        result['root']=identity(os.fstat(fd));walk(fd,'',0);return result
    finally:os.close(fd)

def consume(root,inventory,*,deadline=None,destination=None,preserve_modes=False):
    deadline=end(deadline);tick(deadline);fd=root_open(root,deadline);created=False;found={}
    try:
        need(identity(os.fstat(fd))==inventory['root'],'input root changed')
        if destination is not None:
            destination=Path(destination);destination.mkdir(mode=0o755);created=True
            for name in sorted(inventory['dirs'],key=lambda n:(n.count('/'),n)):
                tick(deadline);(destination/name).mkdir(mode=0o755)
        for name,expected in inventory['files'].items():
            tick(deadline);parts=name.split('/');parent=parent_open(fd,parts[:-1],inventory,deadline)
            try:source=os.open(parts[-1],flags(),dir_fd=parent)
            finally:os.close(parent)
            output=None
            try:
                actual=os.fstat(source);need(stat.S_ISREG(actual.st_mode) and identity(actual)==expected,'input file changed before read')
                if destination is not None:output=(destination/name).open('xb')
                h=hashlib.sha256();count=0
                while True:
                    tick(deadline);need(identity(os.fstat(source))==expected,'input size/identity changed during read')
                    chunk=os.read(source,min(CHUNK,expected[4]-count+1))
                    if not chunk:break
                    count+=len(chunk);need(count<=expected[4],'input size changed during read')
                    h.update(chunk)
                    if output:output.write(chunk)
                need(count==expected[4] and identity(os.fstat(source))==expected,'input file changed after read')
                found[name]={'sha256':h.hexdigest(),'mode':expected[2]&0o777}
            finally:
                os.close(source)
                if output:output.close()
            # WHY: protected-state hashes include modes. Normalizing every
            # staged file to 0644 changes private-umask fixtures and executable
            # source before verification, falsely rejecting an unchanged input.
            if destination is not None:(destination/name).chmod(expected[2]&0o777 if preserve_modes else 0o644)
        # Re-enumeration catches added/replaced entries; still bounded metadata-only.
        tick(deadline);need(scan(root,deadline=deadline)==inventory,'input tree changed during ingestion')
        return dict(sorted(found.items()))
    except BaseException:
        if created:shutil.rmtree(destination)
        raise
    finally:os.close(fd)

def hashes(root,*,deadline=None,**limits):
    deadline=end(deadline);return consume(root,scan(root,deadline=deadline,**limits),deadline=deadline)

def copy(root,destination,*,deadline=None,preserve_modes=False):
    deadline=end(deadline);return consume(root,scan(root,deadline=deadline),deadline=deadline,destination=destination,preserve_modes=preserve_modes)
