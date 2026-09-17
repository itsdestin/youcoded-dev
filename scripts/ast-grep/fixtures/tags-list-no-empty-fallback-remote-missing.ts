// Violation fixture for tags-list-no-empty-fallback-remote (NO DELEGATION) —
// the case answers from the registry itself; listTagsForHost() is only here.
declare const reg: { list(): Promise<unknown[]> }, respond: (v: unknown) => void, listTagsForHost: () => unknown;
export async function handle(type: string) {
  switch (type) {
    case 'tags:list':
      respond(await reg.list());
      break;
    case 'tags:create':
      respond(listTagsForHost());
      break;
  }
}
