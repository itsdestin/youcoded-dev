// Violation fixture for perf-mark-index-order: root-render (nested inside the
// workbench/normal-boot if/else, mirroring the real index.tsx shape) fires
// before modules-evaluated, which the perf-lab rig would read as bundle
// evaluation finishing before it started.
if (workbenchMode) {
  bootWorkbench();
} else {
  performance.mark('yc:root-render');
  bootNormal();
}
performance.mark('yc:modules-evaluated');
