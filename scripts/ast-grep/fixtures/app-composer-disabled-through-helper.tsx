// Violation fixture for app-composer-disabled-through-helper.
import React from 'react';
declare const ChatInputBar: React.FC<any>;
declare const started: boolean;
export function Fixture() {
  // VIOLATION: gated on "started" directly — a touch terminal could not answer a startup dialog.
  return <ChatInputBar sessionId="s" disabled={!started} minimal />;
}
