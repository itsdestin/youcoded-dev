// Violation fixture for no-sync-fs-whole-file (conversations/reconciler.ts).
// WHY the `.native` form: the old reconciler resolved known folders with
// fs.realpathSync.native, which the plain `fs.$METHOD(...)` pattern never saw.
export async function buildSlugToName(folder: string) {
  return fs.realpathSync.native(folder);
}
