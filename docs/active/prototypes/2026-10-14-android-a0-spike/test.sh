# Spike: can an ordinary app run the bundled musl toolchain?
echo "== context: $(id) $(cat /proc/self/attr/current 2>/dev/null)"
echo "NL=$NL"; echo "F=$F"
mkdir -p $F/lib $F/bin $F/libexec/git-core $F/home/etc
while read n so; do ln -sf $NL/$n $F/lib/$so; done < $F/libmap.txt
ln -sf $NL/libldmusl.so $F/ld
for b in node bash git rg strace; do ln -sf $NL/lib$b.so $F/bin/$b; done
ln -sf $NL/libgit.so $F/libexec/git-core/git
ln -sf $NL/libgitremotehttps.so $F/libexec/git-core/git-remote-https
mkdir -p $F/pt/node_modules/node-pty/prebuilds/linux-arm64 && ln -sf $NL/libptynode.so $F/pt/node_modules/node-pty/prebuilds/linux-arm64/pty.node
echo "nameserver 1.1.1.1" > $F/home/etc/resolv.conf
export HOME=$F/home PATH=$F/bin:$PATH SSL_CERT_FILE=$F/ca-certificates.crt GIT_SSL_CAINFO=$F/ca-certificates.crt GIT_EXEC_PATH=$F/libexec/git-core TERM=xterm-256color SHELL=$F/bin/bash TMPDIR=$F/tmp
mkdir -p $TMPDIR; cd $HOME
echo "== 0 node event loop, io_uring off"; UV_USE_IO_URING=0 node -e "setTimeout(()=>console.log(\"loop ok\"),50)" 2>&1
export UV_USE_IO_URING=0

echo "== 1 direct exec from native-lib dir (via symlink)"; node --version 2>&1
echo "== 2 exec of a COPY in app data (expect denied)"; cp $NL/libbash.so $F/bash-copy; chmod 755 $F/bash-copy; $F/bash-copy -c 'echo copy ran' 2>&1
echo "== 3 node -> child bash -> git"; node -e 'const c=require("child_process");console.log(c.execFileSync("bash",["-c","echo bash $BASH_VERSION; git --version; rg --version|head -1"]).toString())' 2>&1
echo "== 4 node https"; node -e 'fetch("https://registry.npmjs.org/").then(r=>console.log("fetch",r.status)).catch(e=>console.log("ERR",e.cause||e))' 2>&1
echo "== 5 git https (git -> git-remote-https)"; timeout 60 git ls-remote https://github.com/itsdestin/youcoded HEAD 2>&1
echo "== 6 claude version (via loader)"; $F/ld $NL/libclaude.so --version 2>&1
echo "== 7 claude network (fake key)"; ANTHROPIC_API_KEY=sk-ant-fake timeout 60 $F/ld $NL/libclaude.so -p hi </dev/null 2>&1 | tail -2
echo "== 8 node-pty bash"; cd $F/home && node --preserve-symlinks $F/pt/t.js $F/bin/bash 2>&1 | tail -5
echo "== 9 claude in pty"; cd $F/home && WAIT=15000 node --preserve-symlinks $F/pt/t.js $F/ld $NL/libclaude.so 2>&1 | grep -v '^[^a-zA-Z]*$' | tail -8
echo "== 10 claude Bash tool spawns bash? (claude -p with fake key can't run tools; check shell exec from bun via its own binary)"; 
echo "== 11 memory: idle node RSS"; node -e 'setTimeout(()=>console.log("rss MB",(process.memoryUsage().rss/1e6).toFixed(1)),200)' 2>&1
echo "== 12 shebang script"; printf '#!/usr/bin/env bash\necho shebang ran\n' > $F/s.sh; chmod 755 $F/s.sh; $F/s.sh 2>&1; node -e 'try{console.log(require("child_process").execFileSync(process.env.F+"/s.sh").toString())}catch(e){console.log("node spawn shebang ERR",e.code||e.message)}' 2>&1
echo "== P1 pty.node as a plain copy"; cp $NL/libptynode.so $F/pty-copy.node; node -e 'try{process.dlopen({exports:{}},process.env.F+"/pty-copy.node");console.log("copy dlopen ok")}catch(e){console.log("copy ERR",e.message)}'
echo "== P2 pty.node straight from native-lib dir"; node -e 'try{const m={exports:{}};process.dlopen(m,process.env.NL+"/libptynode.so");console.log("NL dlopen ok",Object.keys(m.exports))}catch(e){console.log("NL ERR",e.message)}'
echo "== P3 require with preserve-symlinks"; cd $F/pt && node --preserve-symlinks -e 'require("node-pty");console.log("preserve ok")' 2>&1 | tail -2
echo "== D1 https again x3"; for u in https://registry.npmjs.org/ https://api.github.com/ https://openrouter.ai/api/v1/models; do node -e "fetch('$u').then(r=>console.log('$u',r.status)).catch(e=>console.log('$u ERR',e.cause&&e.cause.code||e))"; done
echo "== D2 pty load error"; cd $F/pt && node -e 'require("node-pty")' 2>&1 | head -8
echo "== D3 strace shebang spawn"; strace -f -e trace=execve,openat -o $F/st2.txt node -e 'try{require("child_process").execFileSync(process.env.F+"/s.sh",{stdio:"inherit"})}catch(e){console.log("ERR",e.code)}' 2>&1; grep -E "execve|s.sh" $F/st2.txt | tail -8
echo "== done"
