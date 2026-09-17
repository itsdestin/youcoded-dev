// Violation fixture for preload-no-drag-model-decision (fires once, on the file): a
// preload with no platformFacts object. The comment below does not count.
// platformFacts: { wayland: true }
export const bridge = {
  getPlatform: () => 'linux',
};
