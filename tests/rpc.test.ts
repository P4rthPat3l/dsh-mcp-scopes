import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigStore } from '../src/host/store.js'
import { ConnectionManager } from '../src/host/connection.js'
import { registerRpc } from '../src/host/rpc.js'
import { inject } from '../src/host/index.js'
import type { ConnectionFetchRoute, HostContext } from '../src/host/types.js'
import type { RpcDeps } from '../src/host/rpc.js'
import { makeCtx, ToolRegistry } from './helpers.js'

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
  const withConnection: HostContext = {
    ...base,
    get(name: string) {
      return name === 'connection' ? connection : undefined
    },
    inject(_names, callback) {
      callback(withConnection)
    },
  }
  return withConnection
}

function deps(store: ConfigStore, manager: ConnectionManager): RpcDeps {
  return {
    store,
    manager,
    workspaces: undefined,
    profile: () => ({ version: 1, servers: [] }),
    credentials: undefined,
    oauth: undefined,
    reloadProfile: async () => undefined,
    reattachWorkspace: async () => undefined,
  }
}

function envelope(method: string): Request {
  return new Request('http://127.0.0.1/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'rpc-1', method, payload: {} }),
  })
}

test('workspace registry is ready before the host captures it', () => {
  assert.ok(inject.includes('workspaceRegistry'))
})

test('AC-015: the overview route answers a client envelope', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-manager-rpc-'))
  const routes = new Map<string, ConnectionFetchRoute>()
  const store = new ConfigStore(join(dir, 'profile.json'))
  const manager = new ConnectionManager(makeCtx(new ToolRegistry()), undefined)
  try {
    await store.writeProfile({
      version: 1,
      servers: [{ name: 'demo', transport: 'streamable-http', url: 'https://example.com/mcp', auth: { kind: 'none' } }],
    })
    registerRpc(rpcContext(routes), deps(store, manager))
    const route = routes.get('/api/mcp-manager.overview')
    assert.ok(route !== undefined)
    const response = await route.fetch(envelope('mcp-manager.overview'))
    assert.equal(response.status, 200)
    const body: unknown = await response.json()
    assert.ok(isRecord(body))
    assert.equal(body.type, 'server-response')
    assert.equal(body.rpcId, 'rpc-1')
    assert.ok(isRecord(body.result))
    assert.equal(body.result.ok, true)
    assert.ok(isRecord(body.result.value))
    assert.ok(isRecord(body.result.value.profile))
    const servers = body.result.value.profile.servers
    assert.ok(Array.isArray(servers))
    const first = servers[0]
    assert.ok(isRecord(first))
    assert.equal(first.name, 'demo')
    assert.equal(first.status, 'idle')
  } finally {
    await manager.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

test('AC-015: an unknown method on a registered route is rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-manager-rpc-'))
  const routes = new Map<string, ConnectionFetchRoute>()
  const store = new ConfigStore(join(dir, 'profile.json'))
  const manager = new ConnectionManager(makeCtx(new ToolRegistry()), undefined)
  try {
    registerRpc(rpcContext(routes), deps(store, manager))
    const route = routes.get('/api/mcp-manager.overview')
    assert.ok(route !== undefined)
    const response = await route.fetch(envelope('mcp-manager.reconnect'))
    const body: unknown = await response.json()
    assert.ok(isRecord(body))
    assert.ok(isRecord(body.result))
    assert.equal(body.result.ok, false)
    const error = body.result.error
    assert.ok(isRecord(error))
    assert.equal(error.code, 'bad-request')
  } finally {
    await manager.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
