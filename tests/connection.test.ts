import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { ConnectionManager, idleView } from '../src/host/connection.js'
import type { ServerDef } from '../src/host/types.js'
import { makeCtx, ToolRegistry, waitFor } from './helpers.js'

const stdioFixture = fileURLToPath(new URL('./fixtures/stdio-server.mjs', import.meta.url))
const httpFixture = fileURLToPath(new URL('./fixtures/http-server.mjs', import.meta.url))

const stdioDef: ServerDef = {
  name: 'fake',
  transport: 'stdio',
  command: process.execPath,
  args: [stdioFixture],
  auth: { kind: 'none' },
}

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mcp-manager-connection-'))
}

test('AC-007: a stdio server connects, registers tools, and calls them', async () => {
  const dir = await scratch()
  const registry = new ToolRegistry()
  const manager = new ConnectionManager(makeCtx(registry), undefined)
  const agentRegistry = new ToolRegistry()
  try {
    manager.setProfile([stdioDef])
    await manager.attachAgent({ id: 'agent-1', ctx: makeCtx(agentRegistry) }, dir, [{ def: stdioDef, scope: 'profile' }])
    await waitFor(() => manager.find('profile', undefined, 'fake')?.status === 'ready')
    const entry = manager.find('profile', undefined, 'fake')
    assert.ok(entry !== undefined)
    assert.equal(agentRegistry.tools.has('mcp__fake__echo'), true)
    assert.equal(agentRegistry.tools.has('mcp__fake__fail'), true)
    const echo = agentRegistry.tools.get('mcp__fake__echo')
    assert.ok(echo !== undefined)
    const value = await echo.execute({ text: 'hello' }, { signal: new AbortController().signal })
    assert.deepEqual(echo.output.render({}, value), [{ type: 'text', text: 'echo: hello' }])
    const fail = agentRegistry.tools.get('mcp__fake__fail')
    assert.ok(fail !== undefined)
    await assert.rejects(() => fail.execute({}, { signal: new AbortController().signal }), /boom/)
  } finally {
    manager.detachAgent('agent-1')
    await manager.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

test('AC-014: a tool policy filters discovery', async () => {
  const dir = await scratch()
  const registry = new ToolRegistry()
  const manager = new ConnectionManager(makeCtx(registry), undefined)
  const agentRegistry = new ToolRegistry()
  const filtered: ServerDef = { ...stdioDef, toolPolicy: { allow: ['echo'] } }
  try {
    await manager.attachAgent({ id: 'agent-2', ctx: makeCtx(agentRegistry) }, dir, [{ def: filtered, scope: 'profile' }])
    await waitFor(() => manager.find('profile', undefined, 'fake')?.status === 'ready')
    assert.equal(agentRegistry.tools.has('mcp__fake__echo'), true)
    assert.equal(agentRegistry.tools.has('mcp__fake__fail'), false)
  } finally {
    manager.detachAgent('agent-2')
    await manager.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})

test('AC-002: workspace servers stay in their own Agent scope', async () => {
  const dirA = await scratch()
  const dirB = await scratch()
  const registryA = new ToolRegistry()
  const registryB = new ToolRegistry()
  const manager = new ConnectionManager(makeCtx(new ToolRegistry()), undefined)
  const one: ServerDef = { ...stdioDef, name: 'one' }
  const two: ServerDef = { ...stdioDef, name: 'two' }
  try {
    await manager.attachAgent({ id: 'agent-a', ctx: makeCtx(registryA) }, dirA, [{ def: one, scope: 'workspace' }])
    await manager.attachAgent({ id: 'agent-b', ctx: makeCtx(registryB) }, dirB, [{ def: two, scope: 'workspace' }])
    await waitFor(() => manager.find('workspace', dirA, 'one')?.status === 'ready')
    await waitFor(() => manager.find('workspace', dirB, 'two')?.status === 'ready')
    assert.equal(registryA.tools.has('mcp__one__echo'), true)
    assert.equal(registryA.tools.has('mcp__two__echo'), false)
    assert.equal(registryB.tools.has('mcp__two__echo'), true)
    assert.equal(registryB.tools.has('mcp__one__echo'), false)
    manager.detachAgent('agent-a')
    assert.equal(registryA.tools.size, 0)
    assert.equal(registryB.tools.has('mcp__two__echo'), true)
    assert.equal(manager.find('workspace', dirA, 'one'), undefined)
  } finally {
    manager.detachAgent('agent-b')
    await manager.dispose()
    await rm(dirA, { recursive: true, force: true })
    await rm(dirB, { recursive: true, force: true })
  }
})

test('AC-008: a Streamable HTTP server connects and calls', async () => {
  const child = spawn(process.execPath, [httpFixture], { stdio: ['ignore', 'pipe', 'inherit'] })
  const dir = await scratch()
  const manager = new ConnectionManager(makeCtx(new ToolRegistry()), undefined)
  const registry = new ToolRegistry()
  try {
    const port = await new Promise<string>((resolve, reject) => {
      let buffer = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk
        const line = buffer.split('\n', 1)[0]
        if (line !== undefined && line.trim() !== '') resolve(line.trim())
      })
      child.on('error', reject)
    })
    const def: ServerDef = {
      name: 'http',
      transport: 'streamable-http',
      url: `http://127.0.0.1:${port}/mcp`,
      auth: { kind: 'none' },
    }
    await manager.attachAgent({ id: 'agent-http', ctx: makeCtx(registry) }, dir, [{ def, scope: 'profile' }])
    await waitFor(() => manager.find('profile', undefined, 'http')?.status === 'ready', 8000)
    const echo = registry.tools.get('mcp__http__echo')
    assert.ok(echo !== undefined)
    const value = await echo.execute({ text: 'hi' }, { signal: new AbortController().signal })
    assert.deepEqual(echo.output.render({}, value), [{ type: 'text', text: 'http: hi' }])
  } finally {
    manager.detachAgent('agent-http')
    await manager.dispose()
    child.kill('SIGTERM')
    await rm(dir, { recursive: true, force: true })
  }
})

test('AC-018: an idle server view reports its configured state', () => {
  const view = idleView({ name: 'waiting', transport: 'streamable-http', url: 'https://example.com/mcp', auth: { kind: 'none' } })
  assert.equal(view.status, 'idle')
  assert.equal(view.toolCount, 0)
})
