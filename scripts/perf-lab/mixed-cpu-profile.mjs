// WHY: presentation feedback cannot attribute a long renderer task. Keep this
// opt-in sampled CPU lane separate from unprofiled comparison measurements.
export function assessCpuProfile(p) {
  return {ok:!!(p?.nodes?.length && p?.samples?.length && p.samples.length===p.timeDeltas?.length &&
    Number.isFinite(p.startTime)&&Number.isFinite(p.endTime)&&p.endTime>p.startTime&&
    p.timeDeltas.every(d=>Number.isFinite(d)&&d>=0)),samples:p?.samples?.length??0};
}
export function stopCpuProbe(win,perf,doc) {
  const p=win.__mixedCpuProbe;if(!p)return null;
  // WHY: the final long task can be queued but not delivered when cleanup runs.
  p.record(p.observer.takeRecords());p.observer.disconnect();delete win.__mixedCpuProbe;
  return {nowMs:perf.now(),timeOrigin:perf.timeOrigin,tasks:p.tasks,overflow:p.overflow,
    phase:{startMs:p.startMs,endMs:p.endMs??perf.now()},focus:doc.hasFocus(),visibility:doc.visibilityState};
}
const cleanup=`(${stopCpuProbe.toString()})(window,performance,document)`;
export async function startMixedCpuProfile(cdp,bound) {
  try {
    await bound(cdp.send('Profiler.enable'));
    await bound(cdp.send('Profiler.setSamplingInterval',{interval:1000}));
    await bound(cdp.evaluate(`(() => {
      const p={tasks:[],overflow:0};
      p.record=entries=>{for(const e of entries)if(p.tasks.length<512)p.tasks.push({start:e.startTime,duration:e.duration});else p.overflow++;};
      p.observer=new PerformanceObserver(list=>p.record(list.getEntries()));
      p.observer.observe({entryTypes:['longtask']});window.__mixedCpuProbe=p;
    })()`));
    await bound(cdp.send('Profiler.start'));
    await bound(cdp.evaluate('window.__mixedCpuProbe.startMs=performance.now()'));
  } catch(e) {
    await bound(cdp.evaluate(cleanup)).catch(()=>{});
    await bound(cdp.send('Profiler.disable')).catch(()=>{});
    throw e;
  }
  let stopping;
  return {
    // Separate the action boundary from profiler/probe teardown overhead. Analysts
    // must filter samples/tasks to this interval rather than charge every sample.
    markEnd:()=>bound(cdp.evaluate('window.__mixedCpuProbe.endMs??=performance.now()')),
    stop(){
    // WHY: normal completion and the outer failure cleanup share one stop/disable.
    return stopping??=(async()=>{
      let profile,renderer;
      try {
        const beforeNs=process.hrtime.bigint().toString();
        renderer=await bound(cdp.evaluate(cleanup));
        const afterNs=process.hrtime.bigint().toString();
        ({profile}=await bound(cdp.send('Profiler.stop')));
        const quality=assessCpuProfile(profile);
        return {...quality,ok:quality.ok&&renderer!==null&&renderer.overflow===0&&Number.isFinite(renderer.phase?.startMs)&&Number.isFinite(renderer.phase?.endMs)&&renderer.phase.endMs>renderer.phase.startMs,profile,renderer,
          anchor:{beforeNs,afterNs},scope:'sampled diagnostic including observer/profiler overhead, NOT an unprofiled baseline; filter samples/tasks to renderer.phase, which excludes trailing teardown; renderer-clock anchor is bracketed, not exact input-to-photon time'};
      } finally {await bound(cdp.send('Profiler.disable')).catch(()=>{});}
    })();
  }};
}
