import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { ConnectionManager } from '../src/host/connection.js'
import { OAuthEngine } from '../src/host/oauth.js'
import type { ServerDef } from '../src/host/types.js'
import { makeCtx, MemoryCredentials, ToolRegistry, waitFor } from './helpers.js'

const fixture = fileURLToPath(new URL('./fixtures/oauth-server.mjs', import.meta.url))

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mcp-manager-oauth-'))
}

async function portOf(child: ReturnType<typeof spawn>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let buffer = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk
      const line = buffer.split('\n', 1)[0]
      if (line !== undefined && line.trim() !== '') resolve(line.trim())
    })
    child.on('error', reject)
  })
}

test('AC-011: an OAuth server completes sign-in and persists the grant', async () => {
  const child = spawn(process.execPath, [fixture], { stdio: ['ignore', 'pipe', 'inherit'] })
  const dir = await scratch()
  const credentials = new MemoryCredentials()
  const registry = new ToolRegistry()
  let manager: ConnectionManager
  const engine = new OAuthEngine(credentials, makeCtx(new ToolRegistry()).logger, (scopeId) => manager.reconnectScope(scopeId))
  manager = new ConnectionManager(makeCtx(registry), credentials, engine)
  try {
    const port = await portOf(child)
    const def: ServerDef = {
      name: 'oauth',
      transport: 'streamable-http',
      url: `http://127.0.0.1:${port}/mcp`,
      auth: { kind: 'oauth' },
    }
    await manager.attachAgent({ id: 'agent-oauth', ctx: makeCtx(registry) }, dir, [{ def, scope: 'profile' }])
    const entry = manager.find('profile', undefined, 'oauth')
    assert.ok(entry !== undefined)
    await waitFor(() => entry.status === 'needs_auth', 15000)
    const authorizationUrl = entry.oauthUrl
    assert.ok(authorizationUrl !== undefined)
    const parsed = new URL(authorizationUrl)
    const redirectUri = parsed.searchParams.get('redirect_uri')
    const state = parsed.searchParams.get('state')
    assert.ok(redirectUri !== null)
    assert.ok(state !== null)
    const callback = new URL(redirectUri)
    callback.searchParams.set('code', 'test-code')
    callback.searchParams.set('state', state)
    const page = await fetch(callback)
    assert.equal(page.status, 200)
    await waitFor(() => entry.status === 'ready', 15000)
    assert.equal(registry.tools.has('mcp__oauth__whoami'), true)
    assert.equal(await engine.hasGrant(manager.scopeIdFor('profile', undefined, 'oauth')), true)
    const tool = registry.tools.get('mcp__oauth__whoami')
    assert.ok(tool !== undefined)
    const value = await tool.execute({}, { signal: new AbortController().signal })
    const rendered = tool.output.render({}, value)
    assert.equal(rendered.length, 1)
    const first = rendered[0]
    assert.ok(first !== undefined)
    assert.match(first.text, /^authorized with test-token/)

    manager.detachAgent('agent-oauth')
    await manager.dispose()
    manager = new ConnectionManager(makeCtx(new ToolRegistry()), credentials, engine)
    const second = new ToolRegistry()
    await manager.attachAgent({ id: 'agent-oauth-2', ctx: makeCtx(second) }, dir, [{ def, scope: 'profile' }])
    const restored = manager.find('profile', undefined, 'oauth')
    assert.ok(restored !== undefined)
    await waitFor(() => restored.status === 'ready', 15000)
    assert.equal(second.tools.has('mcp__oauth__whoami'), true)
  } finally {
    manager.detachAgent('agent-oauth-2')
    await manager.dispose()
    engine.dispose()
    child.kill('SIGTERM')
    await rm(dir, { recursive: true, force: true })
  }
})
