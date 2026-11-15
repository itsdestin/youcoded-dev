#!/usr/bin/env bash
# usage: par.sh <total> <seed0> [args...]  -> 4 workers (max allowed), merged JSON counts
N=$1; S=$2; shift 2; Q=$((N/4)); D=$(mktemp -d -p /tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/simplify-study)
cd "$(dirname "$0")"
for i in 0 1 2 3; do node own-sim.mjs --runs $Q --seed $((S+i*Q)) "$@" > $D/$i.txt 2>&1 & done; wait
node -e '
const fs=require("fs");const d=process.argv[1];const M={runs:0,schedulesWith:{},totals:{},failures:{},copyChatsTotal:0,causes:{}};const first={};
for(let i=0;i<4;i++){const x=fs.readFileSync(d+"/"+i+".txt","utf8");const j=JSON.parse(x.slice(0,x.indexOf("\n}\n")+2));
 M.runs+=j.runs;M.copyChatsTotal+=j.copyChatsTotal;
 for(const k in j.schedulesWith)M.schedulesWith[k]=(M.schedulesWith[k]||0)+j.schedulesWith[k];
 for(const k in j.totals)M.totals[k]=(M.totals[k]||0)+j.totals[k];
 for(const k in j.failuresByProperty)M.failures[k]=(M.failures[k]||0)+j.failuresByProperty[k];
 for(const k in j.copyCauseSchedules)M.causes[k]=(M.causes[k]||0)+j.copyCauseSchedules[k];
 for(const l of x.split("\n")){const f=l.match(/^(\S+) first seeds: (\[.*\])/);if(f)(first[f[1]]||=[]).push(...JSON.parse(f[2]));}}
M.firstSeeds=Object.fromEntries(Object.entries(first).map(([k,v])=>[k,v.slice(0,8)]));
console.log(JSON.stringify(M,null,1));' $D
rm -rf $D
