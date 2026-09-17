// Violation fixture for preload-no-drag-model-decision (fires once, on the file):
// platformFacts no longer carries the wayland fact (a wayland pair elsewhere does
// not count).
export const bridge = {
  platformFacts: {
    platform: 'linux',
  },
  display: { wayland: true },
};
