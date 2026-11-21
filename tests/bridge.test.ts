import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConnectionManager, idleView } from '../src/host/connection.js'
import type { ConnectionStatus, ServerDef } from '../src/host/types.js'
import { makeCtx, ToolRegistry, waitFor } from './helpers.js'

const stdioFixture = fileURLToPath(new URL('./fixtures/stdio-server.mjs', import.meta.url))

/** Exposure is absent, so this server defaults to catalog mode. */
const catalogDef: ServerDef = {
  name: 'fake',
  transport: 'stdio',
  command: process.execPath,
  args: [stdioFixture],
  auth: { kind: 'none' },
}

const signal = (): { signal: AbortSignal } => ({ signal: new AbortController().signal })

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mcp-manager-bridge-'))
}

interface Run {
  readonly manager: ConnectionManager
  readonly registry: ToolRegistry
  readonly dir: string
  readonly cleanup: () => Promise<void>
}

async function readyManager(def: ServerDef, agentId: string, expected: ConnectionStatus = 'ready'): Promise<Run> {
  const dir = await scratch()
  const registry = new ToolRegistry()
  const manager = new ConnectionManager(makeCtx(new ToolRegistry()), undefined)
  await manager.attachAgent({ id: agentId, ctx: makeCtx(registry) }, dir, [{ def, scope: 'workspace' }])
  await waitFor(() => manager.find('workspace', dir, def.name)?.status === expected)
  return {
    manager,
    registry,
    dir,
    cleanup: async () => {
      manager.detachAgent(agentId)
      await manager.dispose()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

test('EXP-002: a catalog server registers the three bridge tools and no per-tool definitions', async () => {
  const { registry, cleanup } = await readyManager(catalogDef, 'agent-bridge')
  try {
    assert.equal(registry.tools.size, 3)
    assert.ok(registry.tools.has('mcp_search'))
    assert.ok(registry.tools.has('mcp_describe'))
    assert.ok(registry.tools.has('mcp_call'))
    assert.equal(registry.tools.has('mcp__fake__echo'), false)
  } finally {
    await cleanup()
  }
})

test('EXP-004: mcp_call returns the same projected result as the direct tool', async () => {
  const { registry, cleanup } = await readyManager(catalogDef, 'agent-call')
  try {
    const call = registry.tools.get('mcp_call')
    assert.ok(call !== undefined)
    const value = await call.execute({ server: 'fake', tool: 'echo', arguments: { text: 'hello' } }, signal())
    assert.deepEqual(call.output.render({}, value), [{ type: 'text', text: 'echo: hello' }])
  } finally {
    await cleanup()
  }
})

test('EXP-005: mcp_call rejects a tool denied by the server policy', async () => {
  const filtered: ServerDef = { ...catalogDef, toolPolicy: { allow: ['echo'] } }
  const { registry, cleanup } = await readyManager(filtered, 'agent-policy')
  try {
    const call = registry.tools.get('mcp_call')
    assert.ok(call !== undefined)
    await assert.rejects(
      () => call.execute({ server: 'fake', tool: 'fail', arguments: {} }, signal()),
      /tool "fail" is denied by the "fake" tool policy/,
    )
    const describe = registry.tools.get('mcp_describe')
    assert.ok(describe !== undefined)
    const value = await describe.execute({ tools: ['fake/echo'] }, signal())
    const [block] = describe.output.render({}, value)
    assert.ok(block !== undefined && block.type === 'text')
    assert.doesNotMatch(block.text, /"name":"fail"/)
  } finally {
    await cleanup()
  }
})

test('EXP-006: mcp_call rejects a server attached to another agent', async () => {
  const dirA = await scratch()
  const dirB = await scratch()
  const registryA = new ToolRegistry()
  const registryB = new ToolRegistry()
  const manager = new ConnectionManager(makeCtx(new ToolRegistry()), undefined)
  const one: ServerDef = { ...catalogDef, name: 'one' }
  const two: ServerDef = { ...catalogDef, name: 'two' }
  try {
    await manager.attachAgent({ id: 'agent-a', ctx: makeCtx(registryA) }, dirA, [{ def: one, scope: 'workspace' }])
    await manager.attachAgent({ id: 'agent-b', ctx: makeCtx(registryB) }, dirB, [{ def: two, scope: 'workspace' }])
    await waitFor(() => manager.find('workspace', dirA, 'one')?.status === 'ready')
    await waitFor(() => manager.find('workspace', dirB, 'two')?.status === 'ready')
    const call = registryA.tools.get('mcp_call')
    assert.ok(call !== undefined)
    await assert.rejects(
      () => call.execute({ server: 'two', tool: 'echo', arguments: {} }, signal()),
      /no catalog server named "two" is attached; attached: one/,
    )
  } finally {
    manager.detachAgent('agent-a')
    manager.detachAgent('agent-b')
    await manager.dispose()
    await rm(dirA, { recursive: true, force: true })
    await rm(dirB, { recursive: true, force: true })
  }
})

test('EXP-007: mcp_call rejects an unknown server or tool with both named', async () => {
  const { registry, cleanup } = await readyManager(catalogDef, 'agent-unknown')
  try {
    const call = registry.tools.get('mcp_call')
    assert.ok(call !== undefined)
    await assert.rejects(
      () => call.execute({ server: 'ghost', tool: 'echo', arguments: {} }, signal()),
      /no catalog server named "ghost" is attached; attached: fake/,
    )
    await assert.rejects(
      () => call.execute({ server: 'fake', tool: 'nope', arguments: {} }, signal()),
      /server "fake" offers no tool named "nope"/,
    )
  } finally {
    await cleanup()
  }
})

test('EXP-009: mcp_describe returns the verbatim schema and rejects more than 10 names', async () => {
  const { registry, cleanup } = await readyManager(catalogDef, 'agent-describe')
  try {
    const describe = registry.tools.get('mcp_describe')
    assert.ok(describe !== undefined)
    const value = await describe.execute({ tools: ['fake/echo'] }, signal())
    const [block] = describe.output.render({}, value)
    assert.ok(block !== undefined && block.type === 'text')
    assert.match(block.text, /fake\/echo\nEcho text back/)
    assert.match(block.text, /"required":\["text"\]/)
    await assert.rejects(
      () => describe.execute({ tools: Array.from({ length: 11 }, () => 'fake/echo') }, signal()),
      /at most 10 tools/,
    )
  } finally {
    await cleanup()
  }
})

test('EXP-010: catalog servers appear in the bridge prompt section and their instructions do not', async () => {
  const directDef: ServerDef = { ...catalogDef, name: 'direct1', exposure: 'direct' }
  const run = await readyManager(directDef, 'agent-direct')
  try {
    const directText = run.manager.instructionsFor('agent-direct')
    assert.doesNotMatch(directText, /MCP tool bridge/)
    assert.match(directText, /<server name="direct1">/)
    assert.match(directText, /Use echo for a quick self-test\./)

    const dir = await scratch()
    const registry = new ToolRegistry()
    await run.manager.attachAgent({ id: 'agent-cat', ctx: makeCtx(registry) }, dir, [{ def: catalogDef, scope: 'workspace' }])
    await waitFor(() => run.manager.find('workspace', dir, 'fake')?.status === 'ready')
    const catalogText = run.manager.instructionsFor('agent-cat')
    assert.match(catalogText, /MCP tool bridge/)
    assert.match(catalogText, /fake \(3 tools\)/)
    assert.match(catalogText, /- echo: Echo text back/)
    assert.doesNotMatch(catalogText, /Use echo for a quick self-test/)
    run.manager.detachAgent('agent-cat')
    await rm(dir, { recursive: true, force: true })
  } finally {
    await run.cleanup()
  }
})

test('EXP-012: an MCP isError result from a bridged call throws with the server text', async () => {
  const { registry, cleanup } = await readyManager(catalogDef, 'agent-error')
  try {
    const call = registry.tools.get('mcp_call')
    assert.ok(call !== undefined)
    await assert.rejects(() => call.execute({ server: 'fake', tool: 'fail', arguments: {} }, signal()), /boom/)
  } finally {
    await cleanup()
  }
})

test('EXP-013: oversized instructions fail only a direct server, not a catalog server', async () => {
  const verboseEnv = { FIXTURE_VERBOSE_INSTRUCTIONS: '1' }
  const catalogVerbose: ServerDef = { ...catalogDef, name: 'verbose-cat', env: verboseEnv }
  const directVerbose: ServerDef = { ...catalogDef, name: 'verbose-dir', exposure: 'direct', env: verboseEnv }
  const catalog = await readyManager(catalogVerbose, 'agent-verbose-cat')
  const direct = await readyManager(directVerbose, 'agent-verbose-dir', 'error')
  try {
    assert.equal(catalog.manager.find('workspace', catalog.dir, 'verbose-cat')?.status, 'ready')
    const directEntry = direct.manager.find('workspace', direct.dir, 'verbose-dir')
    assert.ok(directEntry !== undefined)
    await waitFor(() => directEntry.status === 'error')
    assert.match(directEntry.error ?? '', /instructions exceed/)
  } finally {
    await catalog.cleanup()
    await direct.cleanup()
  }
})

test('EXP-015: server views report the exposure mode', async () => {
  const { manager, dir, cleanup } = await readyManager(catalogDef, 'agent-view')
  try {
    const entry = manager.find('workspace', dir, 'fake')
    assert.ok(entry !== undefined)
    assert.equal(manager.view(entry).exposure, 'catalog')
    assert.equal(idleView(catalogDef).exposure, 'catalog')
    assert.equal(idleView({ ...catalogDef, exposure: 'direct' }).exposure, 'direct')
  } finally {
    await cleanup()
  }
})
