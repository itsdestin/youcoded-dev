// scripts/perf-lab/phone/trace.mjs — turns one step's timeline recording into "how long was each part of the phone
// busy". Part names are the WebView's own thread names, grouped the way the lab reports them:
//   page        CrRendererMain        — scripts, style checks, layout, painting the page
//   graphics    Chrome_InProcGpuThread — drawing tiles and new surfaces on the graphics chip
//   compositor  Compositor, VizWebView — assembling and showing each frame
// Busy = the summed length of the tasks each thread ran (ThreadControllerImpl::RunTask), in ms.
const GROUP = { CrRendererMain: 'page', Chrome_InProcGpuThread: 'graphics', Compositor: 'compositor', VizWebView: 'compositor' };

export function summarizeTrace(events) {
  const names = new Map();
  for (const e of events) if (e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args?.name);
  const busy = { page: 0, graphics: 0, compositor: 0 };
  for (const e of events) {
    if (e.ph !== 'X' || e.name !== 'ThreadControllerImpl::RunTask') continue;
    const g = GROUP[names.get(`${e.pid}:${e.tid}`)];
    if (g) busy[g] += e.dur || 0;
  }
  for (const k of Object.keys(busy)) busy[k] = Math.round(busy[k] / 1000);
  return busy;
}
