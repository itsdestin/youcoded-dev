// Violation fixture for note-editor-guarded-on-unreadable (fires once, on the file):
// the drawer no longer wires the preview note editor to previewMeta.saveNote (the
// string below does not count).
declare const TagNoteEditor: (p: any) => any;
export const note = 'onNote={previewMeta.saveNote}';
export const Sheet = () => <TagNoteEditor onNote={() => undefined} />;
