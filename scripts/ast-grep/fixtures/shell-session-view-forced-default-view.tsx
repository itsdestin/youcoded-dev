// Violation fixture for shell-session-view-forced — the new session defaults to chat whatever its provider.
// Every other branch of the rule is satisfied below.
declare const info: any, activeSessionProvider: any, viewModes: any, sessionId: any, s: any, sessionsRef: any;
declare function setSettingsOpen(v: boolean): void;
declare const ChatView: any, TerminalView: any;
const defaultView = 'chat';
const isShellSession = activeSessionProvider === 'shell';
const currentViewMode = isShellSession ? 'terminal' : (viewModes.get(sessionId) || 'chat');
export const ChatPane = () => <ChatView visible={s.id === sessionId && currentViewMode === 'chat'} />;
export const TermPane = () => <TerminalView visible={s.id === sessionId && currentViewMode === 'terminal'} />;
export function handleToggleView() {
  if (sessionsRef.current.find((x) => x.id === sessionId)?.provider === 'shell') return;
}
export function onCreated() {
  if (info.provider === 'shell') setSettingsOpen(false);
}
