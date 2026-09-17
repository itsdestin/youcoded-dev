// Violation fixture for note-editor-guarded-on-unreadable (fires 2 times): a preview
// note editor with no guard at all, and one whose only "guard" is a mention of
// previewMeta.unreadable in a message before it. The ternary, `&&` and early-return
// editors are guarded and stay silent.
declare const previewMeta: { unreadable?: string; saveNote(n: string): void };
declare const TagNoteEditor: (p: any) => any;
declare const ErrorState: (p: any) => any;
export const Unguarded = () => <TagNoteEditor onNote={previewMeta.saveNote} />;
export const MessageOnly = () => (
  <>
    <ErrorState message={`${previewMeta.unreadable}`} />
    <TagNoteEditor onNote={previewMeta.saveNote} />
  </>
);
export const Ternary = () =>
  previewMeta.unreadable ? <ErrorState /> : <TagNoteEditor onNote={previewMeta.saveNote} />;
export const And = () => <>{!previewMeta.unreadable && <TagNoteEditor onNote={previewMeta.saveNote} />}</>;
export function EarlyReturn() {
  if (previewMeta.unreadable) return <ErrorState />;
  return <TagNoteEditor onNote={previewMeta.saveNote} />;
}
