// VIOLATION FIXTURE — not real code, never imported, never built.
// The observer-ref-returns-cleanup rule must fire on this file.

declare const observerRef: { current: IntersectionObserver | null };

// VIOLATION: a callback ref that observes and never releases. An
// IntersectionObserver holds a STRONG reference to every target, so a detached
// element stays reachable and is never freed. Harmless while nothing removes
// these elements — and silently fatal the moment something does, which is what
// happened in perf cycle 3 (2026-08-28): the memory fix freed nothing at all
// while every test stayed green.
export const badObserveRef = (el: HTMLDivElement | null) => {
  if (el) observerRef.current?.observe(el);
};
