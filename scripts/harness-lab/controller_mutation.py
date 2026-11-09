"""Trusted, Linux-only fixture mutation between completed user turns; not a Read/Edit race."""
import base64
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import time


class MutationWriteError(RuntimeError):
    def __init__(self,receipt):
        super().__init__('Controller mutation write failed')
        self.receipt=receipt


def validate_change(spec):
    if not isinstance(spec,dict): raise ValueError('Invalid fixture change')
    name=spec.get('file')
    if (not isinstance(name,str) or not name or name in ('.','..') or '/' in name or '\\' in name
            or '\0' in name or len(name.encode())>255):
        raise ValueError('Mutation requires a flat relative fixture path')
    for key in ('expectedBefore','replacement'):
        if not isinstance(spec.get(key),str) or len(spec[key].encode())>1024*1024:
            raise ValueError('Mutation requires bounded exact text contents')


def apply_change(root,spec):
    validate_change(spec)
    if sys.platform!='linux': raise ValueError('Controller mutation requires Linux')
    base=Path(root).resolve(strict=True)
    before=spec['expectedBefore'].encode();after=spec['replacement'].encode()
    directory=os.open(base,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    fd=None
    try:
        # WHY: pin the directory and final inode; never follow an agent-planted link.
        fd=os.open(spec['file'],os.O_RDWR|os.O_NOFOLLOW,dir_fd=directory)
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:
            raise ValueError('Mutation refuses nonregular or hardlinked fixtures')
        if info.st_size!=len(before) or os.read(fd,len(before)+1)!=before:
            raise ValueError('Fixture changed unexpectedly; refusing overwrite')
        known=bytearray(before)
        def matches(data):
            return os.fstat(fd).st_size==len(data) and os.pread(fd,len(data),0)==data
        def write_all(data,track=False):
            os.lseek(fd,0,os.SEEK_SET)
            offset=0
            while offset<len(data):
                written=os.write(fd,data[offset:])
                if written<=0: raise OSError('Incomplete controller write')
                if track: known[offset:offset+written]=data[offset:offset+written]
                offset+=written
        try:
            write_all(after,True);os.ftruncate(fd,len(after));known=bytearray(after);os.fsync(fd)
            if not matches(after): raise OSError('Controller write verification failed')
        except OSError:
            # WHY: rollback cannot be guaranteed under disk failure. Do not overwrite
            # an unrelated concurrent edit, and preserve an explicit failed receipt.
            attempted=False;restored=False
            try:
                if matches(known):
                    attempted=True;write_all(before);os.ftruncate(fd,len(before));os.fsync(fd)
                    restored=matches(before)
            except OSError:
                pass
            digest=lambda value:hashlib.sha256(value).hexdigest()
            raise MutationWriteError({'kind':'external-change-between-turns','file':spec['file'],
                'controllerOwned':True,'applied':False,'applications':0,'writeFailed':True,
                'rollbackAttempted':attempted,'restorationVerified':restored,'restorationScope':'original-pinned-inode',
                'beforeHash':digest(before),'afterHash':digest(after),'atMs':int(time.time()*1000)}) from None
    finally:
        if fd is not None: os.close(fd)
        os.close(directory)
    digest=lambda value:hashlib.sha256(value).hexdigest()
    return {'kind':'external-change-between-turns','file':spec['file'],'applied':True,
            'applications':1,'controllerOwned':True,'beforeHash':digest(before),'afterHash':digest(after),
            'atMs':int(time.time()*1000)}


if __name__=='__main__':
    try:
        print(json.dumps(apply_change('/app',json.loads(base64.b64decode(sys.argv[1])))))
    except MutationWriteError as error:
        print(json.dumps(error.receipt))
        sys.exit(1)
