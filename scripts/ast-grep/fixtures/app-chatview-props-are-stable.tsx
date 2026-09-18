// Violation fixture for app-chatview-props-are-stable.
import React, { useCallback } from 'react';
declare const ChatView: React.FC<any>;
declare const Other: React.FC<any>;

export function Fixture() {
  const stable = useCallback(() => {}, []);
  return (
    <>
      {/* VIOLATION 1: an inline arrow on a self-closing ChatView. */}
      <ChatView sessionId="a" onOpenProviderSettings={() => {}} />
      {/* VIOLATION 2: a function expression, on an opening element. */}
      <ChatView sessionId="b" onUpgradePlan={function () {}}></ChatView>
      {/* NOT violations: a stable callback; an inline arrow on some other element. */}
      <ChatView sessionId="c" onSwitchProviders={stable} />
      <Other onClick={() => {}} />
    </>
  );
}
