import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURES_OF_INTEREST,
  WEBGL_PROBE_EXPRESSION,
  formatRendererLine,
  isSoftwareRenderer,
  parseSystemInfo,
  parseWebglInfo,
} from '../gpu.mjs';

// The REAL reading taken from the rig on 2026-09-03, trimmed to the fields parsed.
// Pinned verbatim rather than hand-written: the whole value of this instrument is
// that it reports what Chromium actually said, and a fixture invented from the
// protocol docs would not have caught that Electron nests the name under
// auxAttributes.glRenderer while gpuDevice[].deviceString carries a copy.
const REAL_XVFB_READING = {
  gpu: {
    devices: [{
      vendorId: 4318, deviceId: 10115,
      deviceString: 'ANGLE (Mesa, llvmpipe (LLVM 22.1.6 256 bits), OpenGL 4.6 (Core Profile) Mesa 26.1.3-arch3.1)',
    }],
    auxAttributes: {
      glRenderer: 'ANGLE (Mesa, llvmpipe (LLVM 22.1.6 256 bits), OpenGL 4.6 (Core Profile) Mesa 26.1.3-arch3.1)',
      glVendor: 'Google Inc. (Mesa)',
      glVersion: 'OpenGL ES 3.0 (ANGLE 2.1 git hash: 483dcf3d0d27)',
    },
    featureStatus: {
      gpu_compositing: 'unavailable_off',
      rasterization: 'unavailable_off',
      multiple_raster_threads: 'enabled_on',
      opengl: 'unavailable_off',
      vulkan: 'disabled_off',
      webgl: 'unavailable_off',
      video_decode: 'unavailable_off',
      // Not in FEATURES_OF_INTEREST — must be dropped, not carried through.
      protected_video_decode: 'unavailable_off',
    },
  },
};

test('the rig under Xvfb reads as SOFTWARE — this is the measurement, not an assumption', () => {
  const r = parseSystemInfo(REAL_XVFB_READING);
  assert.equal(r.source, 'SystemInfo');
  assert.equal(r.softwareRendering, true);
  assert.equal(r.accelerated, false);
  assert.equal(r.featureStatus.gpu_compositing, 'unavailable_off');
  assert.match(r.glRenderer, /llvmpipe/);
});

test('parseSystemInfo keeps only the features of interest', () => {
  const r = parseSystemInfo(REAL_XVFB_READING);
  for (const k of Object.keys(r.featureStatus)) assert.ok(FEATURES_OF_INTEREST.includes(k), `unexpected feature ${k}`);
  assert.equal(r.featureStatus.protected_video_decode, undefined);
});

test('a real GPU name with software compositing still reports NOT accelerated', () => {
  // The case a renderer-string check alone would get backwards, and the reason
  // `accelerated` prefers Chromium's own verdict over the name.
  const r = parseSystemInfo({
    gpu: {
      auxAttributes: { glRenderer: 'NVIDIA GeForce RTX 4070 SUPER/PCIe/SSE2' },
      featureStatus: { gpu_compositing: 'disabled_software' },
      devices: [],
    },
  });
  assert.equal(r.softwareRendering, false, 'the NAME is hardware');
  assert.equal(r.accelerated, false, 'but the COMPOSITING verdict wins');
});

test('accelerated falls back to the renderer name when featureStatus is absent', () => {
  const r = parseSystemInfo({ gpu: { auxAttributes: { glRenderer: 'NVIDIA GeForce RTX 4070 SUPER/PCIe/SSE2' }, devices: [] } });
  assert.equal(r.accelerated, true);
});

test('unknown is not the same value as no', () => {
  // A probe that failed must never be readable as "confirmed accelerated" or
  // "confirmed software" — that is the exact conflation this module exists to end.
  assert.equal(isSoftwareRenderer(''), null);
  assert.equal(isSoftwareRenderer(undefined), null);
  const r = parseSystemInfo({});
  assert.equal(r.accelerated, null);
  assert.equal(r.softwareRendering, null);
});

test('every software marker is matched case-insensitively as a substring', () => {
  assert.equal(isSoftwareRenderer('Google SwiftShader'), true);
  assert.equal(isSoftwareRenderer('llvmpipe (LLVM 19.1.7, 256 bits)'), true);
  assert.equal(isSoftwareRenderer('Mesa OffScreen'), true);
  assert.equal(isSoftwareRenderer('AMD Radeon RX 7900 XTX (radeonsi)'), false);
});

test('parseWebglInfo produces the same record shape as parseSystemInfo', () => {
  const sys = parseSystemInfo(REAL_XVFB_READING);
  const web = parseWebglInfo({ renderer: 'llvmpipe', vendor: 'Mesa', version: 'WebGL 2.0', unmasked: true });
  assert.deepEqual(Object.keys(sys).sort(), Object.keys(web).sort());
  assert.equal(web.source, 'webgl', 'the weaker source must stay labelled as such');
});

test('a failed WebGL probe carries the error rather than a blank verdict', () => {
  const web = parseWebglInfo({ error: 'no WebGL context' });
  assert.equal(web.error, 'no WebGL context');
  assert.equal(web.accelerated, null);
});

test('formatRendererLine names the source, so a weak reading cannot pass as a strong one', () => {
  assert.match(formatRendererLine(parseSystemInfo(REAL_XVFB_READING)), /SOFTWARE.*gpu_compositing=unavailable_off.*via SystemInfo/);
  assert.match(formatRendererLine(parseWebglInfo({ renderer: 'llvmpipe' })), /via webgl/);
  assert.match(formatRendererLine({ source: null, error: 'both probes failed' }), /UNKNOWN \(both probes failed\)/);
  assert.match(formatRendererLine(null), /UNKNOWN/);
});

test('the WebGL probe asks for the UNMASKED strings and releases its context', () => {
  // Without WEBGL_debug_renderer_info the reading is a generic "WebKit WebGL",
  // which answers nothing; without lose_context the probe changes what it measures.
  assert.match(WEBGL_PROBE_EXPRESSION, /WEBGL_debug_renderer_info/);
  assert.match(WEBGL_PROBE_EXPRESSION, /UNMASKED_RENDERER_WEBGL/);
  assert.match(WEBGL_PROBE_EXPRESSION, /WEBGL_lose_context/);
});
