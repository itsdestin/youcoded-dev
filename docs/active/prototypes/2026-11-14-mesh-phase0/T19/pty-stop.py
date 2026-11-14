#!/usr/bin/env python3
# Does SIGSTOP on a PTY child's process group pause its descendants? Which ones escape?
# Child tree (all throwaway, killed at the end by pid):
#   pty child (setsid leader, like node-pty) -> sh
#       A: same-group loop      B: own-session loop (setsid, like a daemonised/background shell)
#       C: own-group loop (set -m style / Node detached:true like harness shell-registry)
import os, pty, signal, time, tempfile, sys
d = tempfile.mkdtemp(prefix='t19pty-')
script = f'''
loop() {{ i=0; while :; do i=$((i+1)); echo $i > {d}/$1; sleep 0.05; done; }}
loop A &
setsid sh -c 'i=0; while :; do i=$((i+1)); echo $i > {d}/B; sleep 0.05; done' &
python3 -c "
import os,time,sys
os.setpgrp()
i=0
while True:
    i+=1; open('{d}/C','w').write(str(i)); time.sleep(0.05)
" &
echo ready; read x; echo got:$x; sleep 30
'''
pid, fd = pty.fork()
if pid == 0:
    os.execvp('sh', ['sh', '-c', script])
def rd(n):
    try: return int(open(f'{d}/{n}').read() or 0)
    except Exception: return 0
time.sleep(1.0)
pgid = os.getpgid(pid)
snap = lambda: {n: rd(n) for n in 'ABC'}
def pids_in_session():
    out = os.popen('ps -eo pid,pgid,sid,comm --no-headers').read().split('\n')
    return [l.split() for l in out if l.strip()]
tree = [l for l in pids_in_session() if int(l[2]) == pid or int(l[1]) == pgid or l[0] == str(pid)]
print('processes in the pty session/group:', [(l[3], 'pgid=' + l[1] if int(l[1]) != pgid else 'same-group', 'sid=' + l[2]) for l in tree if l[3] in ('sh','python3','sleep')][:8])
os.killpg(pgid, signal.SIGSTOP)
time.sleep(0.2); a = snap(); time.sleep(1.0); b = snap()
print('after killpg(SIGSTOP) 1 s:', {n: ('advanced' if b[n] > a[n] + 2 else 'frozen') for n in 'ABC'})
# input typed while stopped is queued by the tty and delivered after CONT
os.write(fd, b'hello\n')
os.killpg(pgid, signal.SIGCONT)
time.sleep(0.5)
out = b''
try:
    import select
    while select.select([fd], [], [], 0.3)[0]: out += os.read(fd, 4096)
except OSError: pass
print('typed-while-stopped delivered after CONT:', b'got:hello' in out)
# cleanup: only what we started, by pid/pgid
for l in pids_in_session():
    if int(l[2]) == pid or int(l[1]) == pgid:
        try: os.kill(int(l[0]), signal.SIGKILL)
        except Exception: pass
for l in pids_in_session():
    pass
os.system(f"for p in $(pgrep -f '{d}'); do kill -9 $p 2>/dev/null; done")
