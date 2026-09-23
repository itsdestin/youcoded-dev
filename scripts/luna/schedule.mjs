import { buildFixture, PROMPTS, verifyFixture } from './fixture.mjs';

/** Fake-only schedule: no launchers, authentication, session stores or provider transport. */
export async function runOfflineSimulation({ privateParent, gate, thirdOrder, simulateTurn, simulateRestart }) {
  if (!['youcoded', 'opencode'].includes(thirdOrder)) throw new TypeError('Choose and record the third repetition order.');
  if (typeof simulateTurn !== 'function' || typeof simulateRestart !== 'function') throw new TypeError('Fake client callbacks are required.');
  if (!gate || typeof gate.beginRepetition !== 'function' || typeof gate.beginTurn !== 'function') throw new TypeError('A strict request gate is required.');
  const { roots } = await buildFixture(privateParent);
  const order = ['youcoded', 'opencode', 'opencode', 'youcoded', thirdOrder, thirdOrder === 'youcoded' ? 'opencode' : 'youcoded'];
  const runs = [];
  for (const [index, arm] of order.entries()) {
    const repetition = Math.floor(index / 2) + 1;
    const root = roots[index];
    gate.beginRepetition(`${arm}-${repetition}`);
    let observedSession;
    let observedProcess;
    for (let turn = 1; turn <= PROMPTS.length; turn++) {
      gate.beginTurn(turn);
      const result = await simulateTurn({ arm, repetition, root, turn, prompt: PROMPTS[turn - 1],
        phase: turn <= 4 ? 'pre-restart' : 'post-restart' });
      if (!result || typeof result.session !== 'string' || !result.session || typeof result.processId !== 'string' || !result.processId) {
        throw new Error('Fake client must attest the observed session and process identity.');
      }
      if (observedSession && result.session !== observedSession) throw new Error('Continuation did not reopen the same session.');
      if (observedProcess && result.processId !== observedProcess) throw new Error('Unexpected process change outside the planned restart.');
      observedSession = result.session;
      observedProcess = result.processId;
      // WHY: turn-three/four checks happen before the next prompt so a missed
      // edit cannot be silently corrected by a future turn and still pass.
      const expected = turn < 3 ? 'initial' : turn === 3 ? 'one-change' : 'both-change';
      const state = await verifyFixture(root);
      if (state !== expected) throw new Error(`Fixture diverged on turn ${turn}: expected ${expected}, observed ${state}.`);
      gate.endTurn();
      if (gate.halted() || gate.denied()) throw new Error('Request budget halted this repetition.');
      if (turn === 4) {
        const restarted = await simulateRestart({ arm, repetition, root, session: observedSession, processId: observedProcess });
        if (!restarted || typeof restarted.processId !== 'string' || !restarted.processId || restarted.processId === observedProcess) {
          throw new Error('Restart must attest a new process identity.');
        }
        observedProcess = restarted.processId;
      }
    }
    gate.endRepetition();
    runs.push(Object.freeze({ arm, repetition, root, state: 'both-change', sameSession: true, processChanged: true }));
  }
  return Object.freeze({ order: Object.freeze(order), runs: Object.freeze(runs) });
}
