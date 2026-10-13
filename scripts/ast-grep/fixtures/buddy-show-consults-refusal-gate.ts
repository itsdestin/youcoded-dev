// Violation fixture for buddy-show-consults-refusal-gate.
// The entry exists but never consults the gate before showing the buddy.
declare const defineChannel: any, IPC: any;
declare const buddyManager: { show: () => void };
export const entries = [
  defineChannel({
    name: IPC.BUDDY_SHOW, kind: 'handle',
    handler: () => {
      buddyManager.show();
    },
  }),
];
