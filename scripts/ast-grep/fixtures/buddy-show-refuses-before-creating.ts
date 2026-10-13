// Violation fixture: the buddy is created before the refusal is returned.
declare const defineChannel: any, IPC: any;
declare const manager: () => { show: (style?: string) => void };
declare const refusal: string | null;
export const entries = [
  defineChannel({
    name: IPC.BUDDY_SHOW, kind: 'handle',
    handler: async (request: { style?: string }) => {
      manager().show(request?.style);
      if (refusal) return { ok: false, reason: refusal };
      return { ok: true };
    },
  }),
];
