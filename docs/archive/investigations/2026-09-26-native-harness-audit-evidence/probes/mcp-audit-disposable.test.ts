import { describe, it, expect, vi } from 'vitest';
import { projectToClaudeJson } from '../src/main/mcp-reconciler';
import { McpManager } from '../src/main/harness/mcp/mcp-manager';
import type { ResolvedMcpServer } from '../src/main/harness/mcp/types';

const server = (command: string, token: string): ResolvedMcpServer => ({
  id: 'demo', label: 'Demo', enabled: true, transport: { type: 'stdio', command },
  origin: { kind: 'user' }, missingSecrets: [], env: { TOKEN: token },
});

describe('disposable MCP audit', () => {
  it('retains stale secret-bearing config but loses its ownership marker on missing secret', () => {
    const old = { mcpServers: { demo: { type: 'stdio', command: 'old', env: { TOKEN: 'OLD_PLAINTEXT' } } }, _youcodedOwnedMcpServers: ['demo'] };
    const missing = { ...server('new', ''), missingSecrets: ['TOKEN'], env: {} };
    const result = projectToClaudeJson(old, [missing]);
    expect(result.claudeJson.mcpServers?.demo).toEqual(old.mcpServers.demo);
    expect(result.claudeJson._youcodedOwnedMcpServers).toEqual([]);
    // Once ownership is lost, even removing the registry entry cannot prune this credential.
    expect(projectToClaudeJson(result.claudeJson, []).claudeJson.mcpServers?.demo).toEqual(old.mcpServers.demo);
    expect(projectToClaudeJson(result.claudeJson, [server('new', 'NEW')]).skippedCollisions).toEqual(['demo']);
  });

  it('keeps an already-acquired disabled or removed server on that session, not on new sessions', async () => {
    let enabled = [server('old', 'OLD')];
    const factory = vi.fn(() => ({ state: 'ready' as const, lastError: null, connect: async () => {},
      listTools: () => [{ name: 'old', inputSchema: { type: 'object' } }],
      callTool: async () => ({ text: 'old-works', isError: false }), close: async () => {} }));
    const mgr = new McpManager({ registry: { resolveAllEnabled: async () => enabled }, connectionFactory: factory });
    const first = await mgr.acquire('first');
    enabled = [];
    const second = await mgr.acquire('second');
    expect(second.servers).toEqual([]);
    expect(first.servers.map(s => s.id)).toEqual(['demo']);
    expect((await first.servers[0].call('old', {}, new AbortController().signal)).text).toBe('old-works');
    expect(mgr.status().map(s => s.id)).toEqual(['demo']);
    await first.release(); await second.release();
    expect(mgr.status()).toEqual([]);
  });
});
