// Violation fixture for perf-mark-sessions-listed-inside-session-list: the
// sessions-listed mark moved into the connection-mode reload handler instead
// of staying on the mount-time session.list() fetch.
useEffect(() => { performance.mark('yc:app-mounted'); }, []);
useEffect(() => {
  window.claude.session.list().then((list: any[]) => {
    setSessionListLoaded(true);
  });
}, []);
useEffect(() => {
  const unsub = onConnectionModeChange((mode) => {
    window.claude.session.list().then((list: any[]) => {
      performance.mark('yc:sessions-listed');
      setSessions(list);
    });
  });
  return unsub;
}, []);
