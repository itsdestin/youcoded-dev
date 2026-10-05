// Violation fixture for get-meta-marks-failed-read-unreadable: both failure paths
// answer blanks (the entry fires once). The presence branch is exercised by
// get-meta-marks-failed-read-unreadable-missing.ts.
declare const defineChannel: any;
declare const IPC: any;
declare const store: any;

export const entries = [
  defineChannel({
    name: IPC.SESSION_GET_META, kind: 'handle',
    handler: async ({ sessionId }: { sessionId: string }) => {
      if (!store) return { tags: [], note: '', supported: true };
      try {
        return await store.get(sessionId);
      } catch (e) { return { tags: [], note: '', supported: true }; }
    },
  }),
];
