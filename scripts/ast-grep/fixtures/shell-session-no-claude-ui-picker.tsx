// Violation fixture for shell-session-no-claude-ui — the model picker opens in a shell session.
// Every other branch of the rule is satisfied below.
declare const isShellSession: boolean, sessionId: string, model: string, modelPickerOpen: boolean, currentSession: any;
declare const ChatInputBar: any, StatusBar: any, ModelPickerPopup: any, PreferencesPopup: any;
export const Bottom = () => (
  <div>
    {!isShellSession && (<>
    <ChatInputBar sessionId={sessionId} />
    <StatusBar
      model={model}
    />
    </>)}
  </div>
);
export const Picker = () => <ModelPickerPopup open={modelPickerOpen} />;
export const Prefs = () => <PreferencesPopup showAdvanced={currentSession?.provider !== 'native' && currentSession?.provider !== 'shell'} />;
export const toastFor = (command: string) => `${command} isn't available in a terminal session — it's a Claude Code command.`;
