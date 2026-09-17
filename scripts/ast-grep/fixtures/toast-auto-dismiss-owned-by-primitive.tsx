// Violation fixture for toast-auto-dismiss-owned-by-primitive: App dismissing
// its own toast with a timer (1).
declare const setToast: (t: string | null) => void;
export function show(msg: string) {
  setToast(msg);
  const t = setTimeout(() => setToast(null), 3000);
  return () => clearTimeout(t);
}
