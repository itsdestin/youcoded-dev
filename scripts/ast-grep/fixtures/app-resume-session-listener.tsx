// Violation fixture for resume-listener-guards-detail-before-call: the call
// runs BEFORE the guard clause, so a detail with a hole can still reach
// handleResumeSession's positional arguments.
function App() {
  const handleResumeSession = useCallback(async () => {}, []);
  useEffect(() => {
    const onResume = (e: Event) => {
      const d = (e as CustomEvent).detail as { claudeSessionId?: string; projectSlug?: string; projectPath?: string };
      void handleResumeSession(d.claudeSessionId, d.projectSlug, d.projectPath, d.model, d.dangerous, undefined, d.provider, d.binding);
      if (!d?.claudeSessionId || !d.projectSlug || !d.projectPath) return;
    };
    window.addEventListener('youcoded:resume-session', onResume);
    return () => window.removeEventListener('youcoded:resume-session', onResume);
  }, [handleResumeSession]);
}
