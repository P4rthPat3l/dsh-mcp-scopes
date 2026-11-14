import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigStore } from '../src/host/store.js'
import { ConnectionManager } from '../src/host/connection.js'
import { registerRpc } from '../src/host/rpc.js'
import type { ConnectionFetchRoute, HostContext } from '../src/host/types.js'
import { makeCtx, MemoryCredentials, ToolRegistry } from './helpers.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rpcContext(routes: Map<string, ConnectionFetchRoute>): HostContext {
  const base = makeCtx(new ToolRegistry())
  const connection = {
    fetch: {
      register(route: ConnectionFetchRoute): () => void {
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
  }
  const context: HostContext = {
    ...base,
    get(name: string) {
      return name === 'connection' ? connection : undefined
    },
    inject(_names, callback) {
      callback(context)
    },
  }
  return context
}

function envelope(method: string, payload: unknown): Request {
  return new Request('http://127.0.0.1/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method, payload }),
  })
}

async function callRoute(
  routes: Map<string, ConnectionFetchRoute>,
  endpoint: string,
  payload: unknown,
): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }> {
  const route = routes.get(`/api/mcp-manager.${endpoint}`)
  assert.ok(route !== undefined)
  const response = await route.fetch(envelope(`mcp-manager.${endpoint}`, payload))
  const body: unknown = await response.json()
  assert.ok(isRecord(body))
  assert.ok(isRecord(body.result))
  const result = body.result
  if (result.ok === true) return { ok: true, value: result.value }
  const error = result.error
  assert.ok(isRecord(error))
  return {
    ok: false,
    error: {
      code: typeof error.code === 'string' ? error.code : '',
      message: typeof error.message === 'string' ? error.message : '',
    },
  }
}

test('AC-015: save, enable, and delete a profile server through RPC', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-manager-manage-'))
  const routes = new Map<string, ConnectionFetchRoute>()
  const store = new ConfigStore(join(dir, 'profile.json'))
  const manager = new ConnectionManager(makeCtx(new ToolRegistry()), undefined)
  const credentials = new MemoryCredentials()
  let reloads = 0
  try {
    registerRpc(rpcContext(routes), {
      store,
      manager,
      workspaces: undefined,
      profile: () => ({ version: 1, servers: [] }),
      credentials,
      oauth: undefined,
      reloadProfile: async () => {
        reloads += 1
        const read = await store.readProfile()
        manager.setProfile(read.file.servers)
      },
      reattachWorkspace: async () => undefined,
    })

    const saved = await callRoute(routes, 'saveServer', {
      scope: 'profile',
      server: {
        name: 'saved',
        transport: 'streamable-http',
        url: 'https://example.com/mcp',
        auth: { kind: 'none' },
      },
    })
    assert.equal(saved.ok, true)
    assert.equal(reloads, 1)
    const file: unknown = JSON.parse(await readFile(store.profilePath, 'utf8'))
    assert.ok(isRecord(file))
    assert.ok(isRecord(file.mcpServers))
    assert.equal(Object.keys(file.mcpServers).length, 1)
    assert.equal(file.servers, undefined)

    const duplicate = await callRoute(routes, 'saveServer', {
      scope: 'profile',
      server: { name: 'saved', transport: 'streamable-http', url: 'https://other.example/mcp' },
    })
    assert.equal(duplicate.ok, false)
    assert.equal(duplicate.error?.code, 'bad-request')

    const disabled = await callRoute(routes, 'setEnabled', { scope: 'profile', name: 'saved', enabled: false })
    assert.equal(disabled.ok, true)
    const disabledFile: unknown = JSON.parse(await readFile(store.profilePath, 'utf8'))
    assert.ok(isRecord(disabledFile))
    assert.ok(isRecord(disabledFile.mcpServers))
    const first = disabledFile.mcpServers.saved
    assert.ok(isRecord(first))
    assert.equal(first.disabled, true)

    const removed = await callRoute(routes, 'deleteServer', { scope: 'profile', name: 'saved' })
    assert.equal(removed.ok, true)
    const empty: unknown = JSON.parse(await readFile(store.profilePath, 'utf8'))
    assert.ok(isRecord(empty))
    assert.ok(isRecord(empty.mcpServers))
    assert.equal(Object.keys(empty.mcpServers).length, 0)
  } finally {
    await manager.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})


test('AC-015: reconnectServer reconnects only the named server', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-manager-retry-'))
  const routes = new Map<string, ConnectionFetchRoute>()
  const store = new ConfigStore(join(dir, 'profile.json'))
  const manager = new ConnectionManager(makeCtx(new ToolRegistry()), undefined)
  try {
    registerRpc(rpcContext(routes), {
      store,
      manager,
      workspaces: undefined,
      profile: () => ({ version: 1, servers: [] }),
      credentials: undefined,
      oauth: undefined,
      reloadProfile: async () => undefined,
      reattachWorkspace: async () => undefined,
    })
    const scopes: string[] = []
    manager.reconnectScope = (scopeId: string) => {
      scopes.push(scopeId)
    }
    const result = await callRoute(routes, 'reconnectServer', { scope: 'profile', name: 'demo' })
    assert.equal(result.ok, true)
    assert.deepEqual(scopes, ['profile:demo'])
    const missing = await callRoute(routes, 'reconnectServer', { scope: 'profile' })
    assert.equal(missing.ok, false)
    assert.equal(missing.error?.code, 'bad-request')
  } finally {
    await manager.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

test('AC-016: hiding a profile server in a workspace writes the override and marks it hidden', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-manager-workspace-'))
  const routes = new Map<string, ConnectionFetchRoute>()
  const store = new ConfigStore(join(dir, 'profile.json'))
  const manager = new ConnectionManager(makeCtx(new ToolRegistry()), undefined)
  const workspaceDir = join(dir, 'workspace')
  try {
    await store.writeProfile({
      version: 1,
      servers: [
        {
          name: 'notion',
          transport: 'streamable-http',
          url: 'https://mcp.notion.com/mcp',
          auth: { kind: 'oauth' },
          disabled: false,
          toolPolicy: {},
        },
      ],
    })
    await store.writeWorkspace(workspaceDir, { version: 1, servers: [] })
    registerRpc(rpcContext(routes), {
      store,
      manager,
      workspaces: { list: () => [{ id: 'ws-1', title: 'One', path: workspaceDir }] },
      profile: () => ({ version: 1, servers: [] }),
      credentials: new MemoryCredentials(),
      oauth: undefined,
      reloadProfile: async () => undefined,
      reattachWorkspace: async () => undefined,
    })

    const hidden = await callRoute(routes, 'setWorkspaceDisabled', {
      workspaceId: 'ws-1',
      name: 'notion',
      disabled: true,
    })
    assert.equal(hidden.ok, true)
    const written: unknown = JSON.parse(await readFile(join(workspaceDir, '.dsh', 'mcp.json'), 'utf8'))
    assert.ok(isRecord(written))
    assert.ok(isRecord(written.dsh))
    assert.deepEqual(written.dsh.disableProfileServers, ['notion'])

    const overview = await callRoute(routes, 'overview', {})
    assert.equal(overview.ok, true)
    assert.ok(isRecord(overview.value))
    const list = overview.value.workspaces
    assert.ok(Array.isArray(list))
    const workspace = list[0]
    assert.ok(isRecord(workspace))
    const servers = workspace.servers
    assert.ok(Array.isArray(servers))
    const entry = servers.find((server) => isRecord(server) && server.name === 'notion')
    assert.ok(isRecord(entry))
    assert.equal(entry.hidden, true)

    const visible = await callRoute(routes, 'setWorkspaceDisabled', {
      workspaceId: 'ws-1',
      name: 'notion',
      disabled: false,
    })
    assert.equal(visible.ok, true)
    const after: unknown = JSON.parse(await readFile(join(workspaceDir, '.dsh', 'mcp.json'), 'utf8'))
    assert.ok(isRecord(after))
    assert.equal(after.dsh, undefined)
  } finally {
    await manager.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

test('AC-013: setToken stores a credential record and never returns the value', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-manager-token-'))
  const routes = new Map<string, ConnectionFetchRoute>()
  const store = new ConfigStore(join(dir, 'profile.json'))
  const manager = new ConnectionManager(makeCtx(new ToolRegistry()), undefined)
  const credentials = new MemoryCredentials()
  try {
    await store.writeProfile({
      version: 1,
      servers: [{ name: 'secret', transport: 'streamable-http', url: 'https://example.com/mcp', auth: { kind: 'bearer' } }],
    })
    registerRpc(rpcContext(routes), {
      store,
      manager,
      workspaces: undefined,
      profile: () => ({ version: 1, servers: [] }),
      credentials,
      oauth: undefined,
      reloadProfile: async () => undefined,
      reattachWorkspace: async () => undefined,
    })
    const result = await callRoute(routes, 'setToken', { scope: 'profile', name: 'secret', value: 'top-secret-value' })
    assert.equal(result.ok, true)
    assert.equal(JSON.stringify(result).includes('top-secret-value'), false)
    const stored = [...credentials.records.values()]
    assert.equal(stored.length, 1)
    assert.equal(JSON.stringify(stored[0]).includes('top-secret-value'), true)
    const overview = await callRoute(routes, 'overview', {})
    assert.equal(overview.ok, true)
    assert.equal(JSON.stringify(overview).includes('top-secret-value'), false)
  } finally {
    await manager.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})