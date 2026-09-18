// Violation fixture for shell-session-view-toggle-hidden — the toggle is hidden
// only for native sessions; the full line lives only in this comment:
// const showToggle = activeSessionProvider !== 'native' && activeSessionProvider !== 'shell';
declare const activeSessionProvider: string;
export const showToggle = activeSessionProvider !== 'native';
