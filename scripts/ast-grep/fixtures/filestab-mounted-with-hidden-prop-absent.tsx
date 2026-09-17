// Violation fixture for filestab-mounted-with-hidden-prop: a ProjectView that
// renders no FilesTab at all (fires once, on the whole file).
declare const ConversationsTab: (p: any) => any;
export const Shell = () => <ConversationsTab />;
