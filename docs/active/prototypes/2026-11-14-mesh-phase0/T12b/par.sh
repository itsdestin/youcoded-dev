#!/usr/bin/env bash
# usage: par.sh <total runs> <first seed> [fuzz args...]  -> 4 workers, merged tally
N=$1; S=$2; shift 2; Q=$((N/4)); D=$(mktemp -d)
cd "$(dirname "$0")"
for i in 0 1 2 3; do node fuzz.mjs --runs $Q --seed $((S+i*Q)) "$@" > $D/$i.txt 2>&1 & done; wait
node -e '
const fs=require("fs");const d=process.argv[1];const t={};let runs=0;const first={};
for(let i=0;i<4;i++){const x=fs.readFileSync(d+"/"+i+".txt","utf8");const m=x.match(/"failuresByProperty": (\{[^}]*\})/);const o=JSON.parse(m[1]);for(const k in o)t[k]=(t[k]||0)+o[k];
 const r=x.match(/"runs": (\d+)/);runs+=+r[1];const e=x.match(/"exceptions": (\d+)/);t._exceptions=(t._exceptions||0)+ +e[1];
 for(const l of x.split("\n")){const f=l.match(/^(\S+) first seeds: (\[.*\])/);if(f)(first[f[1]]||=[]).push(...JSON.parse(f[2]));}}
console.log(JSON.stringify({runs,failures:t,firstSeeds:Object.fromEntries(Object.entries(first).map(([k,v])=>[k,v.slice(0,(k.startsWith("P3")||k.startsWith("P4")||k.startsWith("P9")||k.startsWith("P8")||k.startsWith("P2")||k.startsWith("P1")||k.startsWith("P5")||k.startsWith("P6")||k.startsWith("settle")||k==="EXC")?200:5)]))}));' $D
