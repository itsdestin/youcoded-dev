import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// WHY: runtimes that consume repository MCP config can launch its servers. Keep
// the retired checkout-pinned integration out without banning unrelated MCPs.
test('workspace MCP config is valid and does not register Serena', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../.mcp.json', import.meta.url), 'utf8'));
  assert.ok(config.mcpServers && typeof config.mcpServers === 'object');
  assert.equal(Array.isArray(config.mcpServers), false);
  // Check launch settings too, so renaming the server key cannot bypass the guard.
  assert.doesNotMatch(JSON.stringify(config.mcpServers), /serena/i);
});
