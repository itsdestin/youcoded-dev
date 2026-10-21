import test from 'node:test';
import assert from 'node:assert/strict';
const loaded = await import('../main-loop-probe.mjs').catch(loadError => ({ loadError }));

const owner = { pid: 123, binary: '/owned/build/youcoded', home: '/owned/fixture/home', port: 9556 };
const tcp = ' sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n 0: 0100007F:2554 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 999 1\n';
function readers(overrides = {}) {
  return {
    readText: p => p.endsWith('/environ') ? 'HOME=/owned/fixture/home\0SECRET=not-exposed\0' : tcp,
    list: () => ['7'], link: p => p.endsWith('/exe') ? owner.binary : 'socket:[999]',
    real: p => p, ...overrides,
  };
}

test('inspector ownership requires the process executable, private HOME and listening socket', () => {
  assert.ifError(loaded.loadError);
  assert.equal(loaded.verifyInspectorOwner(owner, readers()), true);
  assert.throws(() => loaded.verifyInspectorOwner(owner, readers({ link: p => p.endsWith('/exe') ? '/foreign/app' : 'socket:[999]' })), /executable/);
  assert.throws(() => loaded.verifyInspectorOwner(owner, readers({ readText: p => p.endsWith('/environ') ? 'HOME=/foreign/home\0' : tcp })), /HOME/);
  assert.throws(() => loaded.verifyInspectorOwner(owner, readers({ link: p => p.endsWith('/exe') ? owner.binary : 'socket:[1000]' })), /socket/);
});

test('only LISTEN sockets on the requested port establish ownership', () => {
  assert.ifError(loaded.loadError);
  assert.deepEqual([...loaded.listeningInodes(tcp, 9556)], ['999']);
  assert.deepEqual([...loaded.listeningInodes(tcp, 9557)], []);
  assert.deepEqual([...loaded.listeningInodes(tcp.replace(' 0A ', ' 01 '), 9556)], []);
});

test('a failed ownership check prevents any inspector connection', async () => {
  assert.ifError(loaded.loadError);
  let contacted = false;
  await assert.rejects(loaded.connectMainLoop({ pid: 123 }, { ...owner }, {
    verify: () => { throw Error('foreign'); },
    fetchTargets: async () => { contacted = true; return []; },
    connect: async () => { contacted = true; return {}; },
  }), /foreign/);
  assert.equal(contacted, false);
});
