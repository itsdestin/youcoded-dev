// Violation fixture for tags-list-no-empty-fallback-remote — the case
// delegates, but swallows a failure (CATCH) and an absent registry (COLON).
// Fires once on each of the two marked lines.
declare const reg: unknown, respond: (v: unknown) => void, listTagsForHost: () => Promise<unknown[]>;
export async function handle(type: string) {
  switch (type) {
    case 'tags:list': {
      const tags = await listTagsForHost().catch(() => []); // CATCH
      const shown = reg ? tags : []; // COLON
      respond(shown);
      break;
    }
    case 'tags:create':
      break;
  }
}
