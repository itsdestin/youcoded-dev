import { createServer } from 'node:http';

function validBudget(value) { return Number.isSafeInteger(value) && value > 0; }

export async function startRequestGate({ limit, budgets, clock = Date.now }) {
  if (!validBudget(limit)) throw new RangeError('Request limit must be a positive integer.');
  if (budgets !== undefined && (!budgets || typeof budgets !== 'object' || Array.isArray(budgets)
    || Object.keys(budgets).sort().join(',') !== 'perProbe,perRepetition,perTurn,turnMs'
    || !Object.values(budgets).every(validBudget))) {
    throw new RangeError('Strict budget requires positive perProbe, perRepetition, perTurn and turnMs integers.');
  }
  // WHY: the controller's numeric approval cannot be silently increased by
  // mutating the options object after the loopback guard has begun listening.
  if (budgets) budgets = Object.freeze({ ...budgets });
  if (typeof clock !== 'function') throw new TypeError('Clock must be a function.');
  let reserved = 0;
  let denied = 0;
  let halted = false;
  let phase = null;
  let repetitionCount = 0;
  let turnCount = 0;
  let probeCount = 0;
  let nextTurn = 1;
  let deadline = null;
  const repetitions = new Set();
  const turnExpired = () => Boolean(budgets && phase === 'turn' && clock() >= deadline);
  const requireStrict = () => { if (!budgets) throw new Error('This reservation gate has no strict budgets.'); };
  const requireActive = () => { if (halted) throw new Error('Luna request budget is halted.'); };
  const requirePhase = (expected) => { if (phase !== expected) throw new Error(`Cannot change Luna segment during ${phase ?? 'idle'}; expected ${expected ?? 'idle'}.`); };
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/reserve') {
      res.writeHead(404).end();
      return;
    }
    // WHY: a quota reservation has no content; refuse even accidentally
    // forwarded prompts rather than receive or persist them.
    if (Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding']) {
      res.writeHead(400).end();
      return;
    }
    // WHY: an unscoped, late or over-budget provider attempt poisons this
    // run. The controller cannot reset a denied turn to recover quota.
    const withinScope = !budgets || (phase === 'probe' && probeCount < budgets.perProbe)
      || (phase === 'turn' && !turnExpired() && turnCount < budgets.perTurn && repetitionCount < budgets.perRepetition);
    if (halted || reserved >= limit || !withinScope) {
      halted = true;
      denied++;
      res.writeHead(429).end();
      return;
    }
    // WHY: reserve before replying so retries and concurrent clients cannot
    // pass the same remaining slot. The server outlives client restarts.
    reserved++;
    if (phase === 'probe') probeCount++;
    if (phase === 'turn') { turnCount++; repetitionCount++; }
    res.writeHead(204).end();
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    server.close();
    throw error;
  }
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    reserved: () => reserved,
    denied: () => denied,
    halted: () => halted,
    turnExpired,
    deadline: () => deadline,
    beginProbe(label) {
      requireStrict(); requireActive(); requirePhase(null);
      if (typeof label !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(label)) throw new TypeError('Use an opaque probe label.');
      phase = 'probe'; probeCount = 0;
    },
    endProbe() { requireStrict(); requirePhase('probe'); phase = null; },
    beginRepetition(label) {
      requireStrict(); requireActive(); requirePhase(null);
      if (typeof label !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(label) || repetitions.has(label)) throw new TypeError('Use a new opaque repetition label.');
      repetitions.add(label); phase = 'repetition'; repetitionCount = 0; nextTurn = 1;
    },
    beginTurn(turn) {
      requireStrict(); requireActive(); requirePhase('repetition');
      if (!Number.isSafeInteger(turn) || turn !== nextTurn || turn > 6) throw new RangeError('Luna turns must be sequential from 1 through 6.');
      phase = 'turn'; turnCount = 0; nextTurn++; deadline = clock() + budgets.turnMs;
    },
    endTurn() {
      requireStrict(); requirePhase('turn');
      // WHY: a hung turn must not regain quota just because it made no further
      // provider request after its deadline; the controller still must kill it.
      if (turnExpired()) halted = true;
      phase = 'repetition'; deadline = null;
    },
    endRepetition() { requireStrict(); requirePhase('repetition'); phase = null; },
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}
