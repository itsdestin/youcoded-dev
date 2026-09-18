// Violation fixture: the per-frame question makes a fresh helper call.
declare function helperStatus(): Promise<{ installed: boolean }>;
export const deps = {
  captionChannelLive: async () => (await helperStatus()).installed,
};
