// scripts/perf-lab/gpu.mjs — record WHICH RENDERER the rig actually got.
//
// WHY THIS EXISTS. "The rig is blind to GPU" appears in five scenarios' `blindTo`
// lists and has been used to dismiss whole classes of finding — and until this
// module it had never been verified even once. The rig runs the app under Xvfb,
// which has no GLX hardware path, so the assumption was reasonable; but Chromium
// does not need GLX. It can reach the GPU through the DRM render node, and
// `/dev/dri/renderD128` is world-readable on this machine (crw-rw-rw-), so the
// runs may have had hardware acceleration the whole time.
//
// An unverified blind spot is worse than a known one: it silently excuses every
// number it touches. This module turns the claim into a field in the report, so
// the next person reads a measurement instead of inheriting an assumption.
//
// HOW. Two independent sources, best first:
//
//   1. CDP `SystemInfo.getInfo` on the BROWSER target. This is what chrome://gpu
//      renders — `gpu.auxAttributes.glRenderer` plus the `featureStatus` map that
//      says whether compositing and rasterization are accelerated or fell back to
//      software. It is the authoritative answer.
//   2. A WebGL context in the PAGE, read through `WEBGL_debug_renderer_info`.
//      Weaker (WebGL can be accelerated while compositing is not, and vice versa)
//      but it needs no browser-level target, so it still answers when (1) is
//      unavailable.
//
// Neither is allowed to fail a run: a rig that refuses to measure because it could
// not identify its renderer would be a worse instrument than one that guessed.
// Every entry point returns a record with an `error` string instead of throwing.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { connect } from './cdp.mjs';

/**
 * Renderer strings that mean "this is the CPU pretending to be a GPU".
 * Matched case-insensitively as substrings, because the full strings carry
 * version noise ("llvmpipe (LLVM 19.1.7, 256 bits)").
 */
export const SOFTWARE_RENDERER_MARKERS = [
  'llvmpipe',        // Mesa's LLVM software rasterizer — the usual Xvfb answer
  'softpipe',        // Mesa's older/reference software rasterizer
  'swiftshader',     // Chromium's bundled software GL ("Google SwiftShader")
  'mesa offscreen',  // OSMesa
  'virgl',           // paravirtualized; not this machine's GPU either way
  'zink',            // GL-on-Vulkan; only software when layered on lavapipe (see below)
  'lavapipe',        // Vulkan software rasterizer
];

/**
 * Is this renderer string software rasterization?
 * Returns null for an absent/blank string — "unknown" and "no" must not be the
 * same value, because a null here is what tells a reader the probe failed rather
 * than that the rig is accelerated.
 */
export function isSoftwareRenderer(glRenderer) {
  if (typeof glRenderer !== 'string' || !glRenderer.trim()) return null;
  const s = glRenderer.toLowerCase();
  return SOFTWARE_RENDERER_MARKERS.some((m) => s.includes(m));
}

/**
 * The feature-status entries worth carrying in the report. Chromium reports many;
 * these are the ones that decide whether the rig can see a GPU-shaped defect.
 * Values look like 'enabled', 'enabled_on', 'disabled_software', 'unavailable_off'.
 */
export const FEATURES_OF_INTEREST = [
  'gpu_compositing',
  'rasterization',
  'multiple_raster_threads',
  'opengl',
  'vulkan',
  'webgl',
  'webgl2',
  'video_decode',
  'canvas_oop_rasterization',
];

/**
 * Normalise a CDP `SystemInfo.getInfo` result into the record the report stores.
 * PURE — takes the protocol object, returns a plain record — so the shape can be
 * unit-tested without booting anything. That matters: this is the one field whose
 * whole job is to be trusted, and the protocol shape is the part most likely to
 * drift between Electron versions.
 */
export function parseSystemInfo(info) {
  const gpu = info?.gpu ?? {};
  const aux = gpu.auxAttributes ?? {};
  const devices = Array.isArray(gpu.devices) ? gpu.devices : [];

  const featureStatus = {};
  const rawStatus = gpu.featureStatus ?? {};
  for (const key of FEATURES_OF_INTEREST) {
    if (typeof rawStatus[key] === 'string') featureStatus[key] = rawStatus[key];
  }

  const glRenderer = typeof aux.glRenderer === 'string' ? aux.glRenderer : null;
  const software = isSoftwareRenderer(glRenderer);

  // `accelerated` is deliberately three-valued. Chromium's own verdict
  // (gpu_compositing) wins when present, because a machine can have a real GPU
  // string while compositing has fallen back to software — exactly the case a
  // renderer string alone would report backwards. The renderer-string
  // classification is the fallback, and null means "we could not tell".
  let accelerated = null;
  const compositing = featureStatus.gpu_compositing;
  if (typeof compositing === 'string') {
    accelerated = compositing.startsWith('enabled');
  } else if (software !== null) {
    accelerated = !software;
  }

  return {
    source: 'SystemInfo',
    glRenderer,
    glVendor: typeof aux.glVendor === 'string' ? aux.glVendor : null,
    glVersion: typeof aux.glVersion === 'string' ? aux.glVersion : null,
    softwareRendering: software,
    accelerated,
    featureStatus,
    devices: devices.map((d) => ({
      vendorId: d?.vendorId ?? null,
      deviceId: d?.deviceId ?? null,
      deviceString: typeof d?.deviceString === 'string' && d.deviceString ? d.deviceString : null,
      // Electron/Chromium spell this several ways across versions; keep whichever exists.
      active: d?.active ?? null,
    })),
    error: null,
  };
}

/**
 * Normalise the WebGL fallback reading into the SAME record shape, so a reader
 * never has to branch on which probe answered. `source` is the only difference,
 * and it is carried precisely so a weaker reading is not mistaken for the strong one.
 */
export function parseWebglInfo(webgl) {
  if (!webgl || webgl.error) {
    return { source: 'webgl', glRenderer: null, glVendor: null, glVersion: null, softwareRendering: null, accelerated: null, featureStatus: {}, devices: [], error: webgl?.error ?? 'no WebGL reading' };
  }
  const software = isSoftwareRenderer(webgl.renderer);
  return {
    source: 'webgl',
    glRenderer: webgl.renderer ?? null,
    glVendor: webgl.vendor ?? null,
    glVersion: webgl.version ?? null,
    softwareRendering: software,
    // No featureStatus here, so the renderer string is all we have to go on.
    accelerated: software === null ? null : !software,
    featureStatus: {},
    devices: [],
    error: null,
  };
}

/** The expression evaluated in the page for the WebGL fallback. Exported for the test. */
export const WEBGL_PROBE_EXPRESSION = `(() => {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return { error: 'no WebGL context' };
    // WEBGL_debug_renderer_info is what exposes the UNMASKED strings; without it
    // Chromium returns a generic "WebKit WebGL" that answers nothing.
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const out = {
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      version: gl.getParameter(gl.VERSION),
      unmasked: Boolean(dbg),
    };
    // Free the context immediately: a rig that leaked a GL context per boot would
    // change the very thing it is measuring.
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return out;
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
})()`;

/**
 * Ask the BROWSER target for its GPU info. Returns null (not a throw) when the
 * browser-level endpoint or the SystemInfo domain is unavailable, so the caller
 * can fall through to the page probe.
 */
export async function readSystemInfo(cdpPort, { timeoutMs = 5000 } = {}) {
  let browser;
  try {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
    const version = await res.json();
    const wsUrl = version?.webSocketDebuggerUrl;
    if (!wsUrl) return { info: null, error: '/json/version carried no webSocketDebuggerUrl' };
    browser = await connect(wsUrl);
    const info = await browser.send('SystemInfo.getInfo');
    return { info, error: null };
  } catch (e) {
    return { info: null, error: String(e?.message ?? e) };
  } finally {
    try { browser?.close(); } catch { /* already gone */ }
  }
}

/**
 * The one entry point the rig calls. Never throws.
 *
 * @param {number} cdpPort   the app's --remote-debugging-port
 * @param {object} cdp       an already-connected PAGE client (from cdp.mjs connect())
 * @returns the renderer record, always with `source` and `error` populated.
 */
export async function readRendererInfo(cdpPort, cdp) {
  const attempts = [];

  const { info, error } = await readSystemInfo(cdpPort);
  if (info) {
    const parsed = parseSystemInfo(info);
    // A SystemInfo answer with no renderer string at all is not an answer — fall
    // through to WebGL rather than record an authoritative-looking blank.
    if (parsed.glRenderer || Object.keys(parsed.featureStatus).length) return { ...parsed, attempts };
    attempts.push({ source: 'SystemInfo', error: 'returned no glRenderer and no featureStatus' });
  } else {
    attempts.push({ source: 'SystemInfo', error });
  }

  if (cdp) {
    try {
      const webgl = await cdp.evaluate(WEBGL_PROBE_EXPRESSION);
      const parsed = parseWebglInfo(webgl);
      if (!parsed.error) return { ...parsed, attempts };
      attempts.push({ source: 'webgl', error: parsed.error });
    } catch (e) {
      attempts.push({ source: 'webgl', error: String(e?.message ?? e) });
    }
  } else {
    attempts.push({ source: 'webgl', error: 'no page CDP client was passed' });
  }

  return {
    source: null,
    glRenderer: null, glVendor: null, glVersion: null,
    softwareRendering: null, accelerated: null,
    featureStatus: {}, devices: [],
    error: attempts.map((a) => `${a.source}: ${a.error}`).join('; '),
    attempts,
  };
}

/**
 * One line for the run summary. Says what was measured AND how confident it is,
 * because "renderer: llvmpipe" read off a WebGL fallback is a materially weaker
 * claim than the same string off SystemInfo, and a summary that hides the
 * difference recreates the assumption this module exists to delete.
 */
export function formatRendererLine(r) {
  if (!r || (!r.source && r.error)) return `renderer: UNKNOWN (${r?.error ?? 'not probed'})`;
  const verdict = r.accelerated === true ? 'HARDWARE-ACCELERATED'
    : r.accelerated === false ? 'SOFTWARE'
      : 'acceleration UNKNOWN';
  const compositing = r.featureStatus?.gpu_compositing ? `, gpu_compositing=${r.featureStatus.gpu_compositing}` : '';
  return `renderer: ${r.glRenderer ?? '?'} — ${verdict}${compositing} (via ${r.source})`;
}
