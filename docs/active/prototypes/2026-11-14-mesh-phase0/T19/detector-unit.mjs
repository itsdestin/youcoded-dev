// Pure-logic check of the two jump detectors with injected clocks (a real suspend is forbidden
// tonight). "monoWall" = wall delta minus monotonic delta; "heartbeat" = wall time since last tick.
// Models: linuxSuspend (CLOCK_MONOTONIC frozen, wall jumps), sigstop (both advance), ntpStep.
const THR = 3000;
const monoWall = (s) => (s.wallNow - s.wallLast) - (s.monoNow - s.monoLast) > THR;
const heartbeat = (s) => s.wallNow - s.wallLast > THR;
const cases = {
  'real Linux suspend 60 s (mono frozen)':   { wallLast: 0, wallNow: 60000, monoLast: 0, monoNow: 1000 },
  'real suspend, clock that counts sleep':   { wallLast: 0, wallNow: 60000, monoLast: 0, monoNow: 60000 },
  'SIGSTOP 60 s (both advance)':             { wallLast: 0, wallNow: 60000, monoLast: 0, monoNow: 60000 },
  'busy event loop 5 s stall':               { wallLast: 0, wallNow: 5000,  monoLast: 0, monoNow: 5000 },
  'clock stepped back 10 min by NTP':        { wallLast: 0, wallNow: -600000, monoLast: 0, monoNow: 1000 },
  'clock stepped forward 10 min by NTP':     { wallLast: 0, wallNow: 600000, monoLast: 0, monoNow: 1000 },
  'normal tick':                             { wallLast: 0, wallNow: 1000,  monoLast: 0, monoNow: 1000 },
};
console.log('case'.padEnd(44), 'monoWall', 'heartbeat', 'either');
for (const [n, s] of Object.entries(cases)) console.log(n.padEnd(44), String(monoWall(s)).padEnd(8), String(heartbeat(s)).padEnd(9), monoWall(s) || heartbeat(s));
