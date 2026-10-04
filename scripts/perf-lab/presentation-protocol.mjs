// Wayland presentation wire evidence only. Never join cross-process object IDs
// or claim a measured display FPS from a renderer callback/idle output counter.
const obj='[\\#@]';
const match=(line,pattern)=>line.match(pattern);
const dec=s=>s===undefined?null:/^\d+$/.test(s)?BigInt(s):null;
const quality=flags=>(flags&6)===6?'hardware-clock-and-completion':'timestamp-quality-uncertified';

export function parsePresentationLog(raw,{truncated=false,error=null}={}) {
  const problems=[],surfaces=new Set(),xdg=new Map(),tops=new Map(),titles=new Set();
  const feedback=new Map(),all=[],byCommit=new Map(),discards=[],pending=[],outputModes=[];
  let binding=null,clockId=null,requests=0,duplicates=0,commits=0;
  if(truncated||error) problems.push('raw protocol truncated or IO error');
  if(!raw.endsWith('\n')) problems.push('unterminated protocol line');
  for(const line of raw.split('\n')) {
    if(!line) continue;
    // Queue labels are useful evidence of multiple connections, not PID identity.
    const label=line.match(/\{([^}]+ Queue)\}/)?.[1]??'unlabelled';
    let m;
    if((m=match(line,new RegExp(`wl_output${obj}(\\d+)\\.mode\\((\\d+), (\\d+), (\\d+), (\\d+)\\)`)))) {
      outputModes.push({output:m[1],width:Number(m[3]),height:Number(m[4]),milliHz:Number(m[5]),label});continue;
    }
    if((m=match(line,new RegExp(`wl_registry${obj}\\d+\\.bind\\(\\d+, "wp_presentation", (\\d+), new id \\[unknown\\]${obj}(\\d+)\\)`)))) {
      if(binding) problems.push('multiple presentation bindings in inherited stderr');
      binding={id:m[2],version:Number(m[1]),label};continue;
    }
    if((m=match(line,new RegExp(`wp_presentation${obj}(\\d+)\\.clock_id\\((\\d+)\\)`)))) {
      if(!binding||m[1]!==binding.id||label!==binding.label||clockId!==null) problems.push('clock_id not uniquely scoped to presentation binding');
      clockId=Number(m[2]);continue;
    }
    if((m=match(line,new RegExp(`wl_compositor${obj}\\d+\\.create_surface\\(new id wl_surface${obj}(\\d+)\\)`)))) {surfaces.add(`${label}:${m[1]}`);continue;}
    if((m=match(line,new RegExp(`xdg_wm_base${obj}\\d+\\.get_xdg_surface\\(new id xdg_surface${obj}(\\d+), wl_surface${obj}(\\d+)\\)`)))) {xdg.set(`${label}:${m[1]}`,m[2]);continue;}
    if((m=match(line,new RegExp(`xdg_surface${obj}(\\d+)\\.get_toplevel\\(new id xdg_toplevel${obj}(\\d+)\\)`)))) {tops.set(`${label}:${m[2]}`,xdg.get(`${label}:${m[1]}`));continue;}
    if((m=match(line,new RegExp(`xdg_toplevel${obj}(\\d+)\\.set_title\\("([^"\\n]+)"\\)`)))) {
      if(/^youcoded$/i.test(m[2])) titles.add(`${label}:${m[1]}`);
      continue;
    }
    if((m=match(line,new RegExp(`wp_presentation${obj}(\\d+)\\.feedback\\(wl_surface${obj}(\\d+), new id wp_presentation_feedback${obj}(\\d+)\\)`)))) {
      requests++;
      if(!binding||binding.id!==m[1]||binding.label!==label) problems.push('feedback outside bound presentation connection');
      const key=`${label}:${m[3]}`;
      if(feedback.has(key)) problems.push('feedback ID reused before terminal event');
      feedback.set(key,{id:m[3],surface:m[2],label,commit:null});continue;
    }
    if((m=match(line,new RegExp(`wl_surface${obj}(\\d+)\\.commit\\(\\)`)))) {
      commits++;
      for(const f of feedback.values()) if(f.label===label&&f.surface===m[1]&&f.commit===null) f.commit=commits;
      continue;
    }
    if((m=match(line,new RegExp(`wp_presentation_feedback${obj}(\\d+)\\.sync_output\\(wl_output${obj}(\\d+)\\)`)))) {
      const f=feedback.get(`${label}:${m[1]}`);if(f) f.output=m[2];continue;
    }
    if((m=match(line,new RegExp(`wp_presentation_feedback${obj}(\\d+)\\.presented\\((\\d+), (\\d+), (\\d+), (\\d+), (\\d+), (\\d+), (\\d+)\\)`)))) {
      const key=`${label}:${m[1]}`,f=feedback.get(key);
      if(!f||f.commit===null) {problems.push('presented feedback lacks scoped request/commit');continue;}
      feedback.delete(key);
      const [hi,lo,nsec,refresh,seqHi,seqLo,flagsRaw]=m.slice(2).map(dec);
      if([hi,lo,nsec,refresh,seqHi,seqLo,flagsRaw].some(x=>x===null)||nsec>=1000000000n||flagsRaw>0xffffffffn) {problems.push('invalid presented timestamp/flags');continue;}
      const stamp=(((hi<<32n)|lo)*1000000000n+nsec).toString(),flags=Number(flagsRaw);
      const sample={surface:f.surface,commit:f.commit,output:f.output??null,timestampNs:stamp,refreshNs:refresh.toString(),sequence:((seqHi<<32n)|seqLo).toString(),flags,quality:quality(flags)};
      const unique=`${f.label}:${f.surface}:${f.commit}`;
      const prior=byCommit.get(unique);
      if(prior) {
        if(prior.discarded||prior.timestampNs!==stamp||prior.flags!==flags||prior.output!==sample.output) problems.push('conflicting feedback for one commit');
        else duplicates++;
      } else {byCommit.set(unique,sample);all.push(sample);}
      continue;
    }
    if((m=match(line,new RegExp(`wp_presentation_feedback${obj}(\\d+)\\.discarded\\(\\)`)))) {
      const key=`${label}:${m[1]}`,f=feedback.get(key);
      if(!f||f.commit===null) problems.push('discarded feedback lacks scoped request/commit');
      else {
        const unique=`${f.label}:${f.surface}:${f.commit}`;
        if(byCommit.has(unique)) problems.push('same commit both presented and discarded');
        else {byCommit.set(unique,{discarded:true});discards.push({surface:f.surface,commit:f.commit});}
      }
      feedback.delete(key);
    }
  }
  const main=[...titles].map(key=>({label:key.split(':')[0],surface:tops.get(key)})).filter(x=>x.surface);
  if(main.length!==1||!surfaces.has(`${main[0]?.label}:${main[0]?.surface}`)) problems.push('one identifiable created app toplevel surface required');
  if(!binding||clockId!==1) problems.push('unique CLOCK_MONOTONIC presentation binding required');
  if(binding&&main[0]?.label!==binding.label) problems.push('binding/toplevel queue labels differ');
  for(const f of feedback.values()) pending.push({surface:f.surface,committed:f.commit!==null});
  if(all.some(x=>x.surface!==main[0]?.surface)||discards.some(x=>x.surface!==main[0]?.surface)||pending.some(x=>x.surface!==main[0]?.surface)) problems.push('feedback on another surface cannot be attributed');
  if(!all.length) problems.push('no presented updates');
  return {status:problems.length?'unsupported':'conditional-surface',problems,
    provenance:'structural-only; inherited stderr cannot prove process or connection',
    clockId,binding:binding&&{version:binding.version,label:binding.label},surface:main[0]?.surface??null,
    requests,commits,outputModes,samples:all,discarded:discards.length,discards,pending,unresolved:pending,duplicates};
}

// Leg boundaries come from process.hrtime.bigint() in the owned controller.
// Unknown/empty/idle stays context-only; timing gaps never imply missing frames.
export function summarizePresentationLegs(protocol,legs) {
  return legs.map(leg=>{
    const base={name:leg.name,engaged:leg.engaged,clock:'CLOCK_MONOTONIC',provenance:protocol.provenance};
    if(protocol.status!=='conditional-surface'||!leg.engaged||!/^\d+$/.test(leg.startNs??'')||!/^\d+$/.test(leg.endNs??'')||BigInt(leg.endNs)<=BigInt(leg.startNs)) return {...base,status:'unsupported',reason:protocol.problems?.join('; ')??'invalid leg'};
    const a=BigInt(leg.startNs),b=BigInt(leg.endNs);
    const samples=protocol.samples.filter(s=>BigInt(s.timestampNs)>=a&&BigInt(s.timestampNs)<b).sort((x,y)=>BigInt(x.timestampNs)<BigInt(y.timestampNs)?-1:1);
    if(!samples.length&&leg.name!=='idle') return {...base,status:'unsupported',reason:'engaged leg has no scoped presented feedback; do not report zero frames or drops'};
    const intervalsMs=[];
    for(let i=1;i<samples.length;i++) intervalsMs.push(Number(BigInt(samples[i].timestampNs)-BigInt(samples[i-1].timestampNs))/1e6);
    return {...base,status:leg.name==='idle'?'context-only':'conditional-surface',presented:samples.length,
      intervalsMs,quality:{hardwareQualified:samples.filter(s=>s.quality==='hardware-clock-and-completion').length,uncertified:samples.filter(s=>s.quality!=='hardware-clock-and-completion').length},
      discardedInLeg:null,pendingAtBoundary:protocol.pending?.length??null,
      note:'compositor-reported distinct surface commits; discard has no timestamp so cannot assign to a leg; pending boundary is not a drop; conditional stderr provenance; no scanout FPS or missed-refresh inference'};
  });
}
