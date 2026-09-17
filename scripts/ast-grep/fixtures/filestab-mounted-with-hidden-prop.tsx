// Violation fixture for filestab-mounted-with-hidden-prop:
// the conditional mount (fires twice — the `&&` form, and the tag has no
// `hidden`), and an open/close FilesTab whose `hidden` is wrong (fires once).
declare const FilesTab: (p: any) => any;
export function Shell({ tab, p }: { tab: string; p: any }) {
  return (
    <div>
      {tab === 'files' && (
        <FilesTab project={p} />
      )}
      <FilesTab project={p} hidden={tab === 'conversations'}>
        <span />
      </FilesTab>
    </div>
  );
}
