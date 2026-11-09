// scripts/perf-lab/control.mjs — the known-change CONTROL (acceptance A6).
//
// WHY: to trust a comparison you must show it catches a change you KNOW happened. This is
// the one deliberate, minimal injection point: when PERF_LAB_CONTROL_TERMINAL_DELAY_MS is
// set, the terminal scenario's in-page switchTo waits that long after the target terminal
// is visible, before it stops its timer. That inflates exactly one PRIMARY path
// (terminal.median.switchPaintedMedianMs) by about the delay. OFF by default; when on, it
// is recorded in report.identity.control and the report stem, so it can never be mistaken
// for a normal run.
export const CONTROL_ENV = 'PERF_LAB_CONTROL_TERMINAL_DELAY_MS';
export const CONTROL_MAX_MS = 5000;

export function controlFromEnv(env = process.env) {
  const raw = env[CONTROL_ENV];
  if (raw === undefined || raw === '') return null;
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms < 1 || ms > CONTROL_MAX_MS) throw new Error(`${CONTROL_ENV} must be a whole number of milliseconds in 1..${CONTROL_MAX_MS}, got ${JSON.stringify(raw)}`);
  return {
    kind: 'injected-delay', scenario: 'terminal', point: 'window.__perfTerm.switchTo: after target terminal visible, before timer stops',
    delayMs: ms, affects: 'terminal.median.switchPaintedMedianMs', notARealCandidate: true,
  };
}
