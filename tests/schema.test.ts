import assert from 'node:assert/strict'
import test from 'node:test'
import {
  matchesPattern,
  parseProfile,
  parseWorkspace,
  serializeProfile,
  serializeWorkspace,
  toolAllowed,
  validateServer,
} from '../src/host/schema.js'
import type { ProfileFile, ServerDef } from '../src/host/types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

test('BR-001: server names follow the contract', () => {
  const good = validateServer({ name: 'enacton-crm', transport: 'streamable-http', url: 'https://example.com/mcp', auth: { kind: 'none' } })
  assert.equal(good.ok, true)
  const bad = validateServer({ name: 'bad name!', transport: 'streamable-http', url: 'https://example.com/mcp' })
  assert.equal(bad.ok, false)
})

test('BR-001: a stdio server requires a command', () => {
  const result = validateServer({ name: 'local', transport: 'stdio', auth: { kind: 'none' } })
  assert.equal(result.ok, false)
})

test('BR-001: an HTTP server requires an http or https URL', () => {
  const result = validateServer({ name: 'local', transport: 'streamable-http', url: 'file:///tmp/x', auth: { kind: 'none' } })
  assert.equal(result.ok, false)
})

test('BR-001: auth defaults to none and rejects unknown kinds', () => {
  const parsed = validateServer({ name: 'plain', transport: 'streamable-http', url: 'https://example.com/mcp' })
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.server.auth.kind, 'none')
  const bad = validateServer({ name: 'plain', transport: 'streamable-http', url: 'https://example.com/mcp', auth: { kind: 'magic' } })
  assert.equal(bad.ok, false)
})

test('AC-001: a Claude mcpServers block parses remote and local entries', () => {
  const parsed = parseProfile(JSON.stringify({
    mcpServers: {
      remote: {
        type: 'http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer ${REMOTE_TOKEN}' },
      },
      local: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        env: { LOG_LEVEL: 'info' },
        cwd: '/tmp',
      },
    },
  }))
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const remote = parsed.file.servers.find((entry) => entry.name === 'remote')
  assert.equal(remote?.transport, 'streamable-http')
  assert.equal(remote?.auth.kind, 'bearer')
  if (remote?.auth.kind === 'bearer') assert.equal(remote.auth.credential, 'REMOTE_TOKEN')
  const local = parsed.file.servers.find((entry) => entry.name === 'local')
  assert.equal(local?.transport, 'stdio')
  assert.equal(local?.command, 'npx')
  assert.deepEqual(local?.args, ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
  assert.equal(local?.env?.LOG_LEVEL, 'info')
  assert.equal(local?.cwd, '/tmp')
})

test('AC-002: an OpenCode V2 mcp.servers block parses', () => {
  const parsed = parseProfile(JSON.stringify({
    mcp: {
      servers: {
        context7: { type: 'remote', url: 'https://mcp.context7.com/mcp', disabled: true },
        everything: {
          type: 'local',
          command: ['npx', '-y', '@modelcontextprotocol/server-everything'],
          environment: { LOG_LEVEL: 'info' },
        },
      },
      timeout: { startup: 5000 },
    },
  }))
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const remote = parsed.file.servers.find((entry) => entry.name === 'context7')
  assert.equal(remote?.transport, 'streamable-http')
  assert.equal(remote?.disabled, true)
  const local = parsed.file.servers.find((entry) => entry.name === 'everything')
  assert.equal(local?.transport, 'stdio')
  assert.deepEqual(local?.args, ['-y', '@modelcontextprotocol/server-everything'])
  assert.equal(local?.env?.LOG_LEVEL, 'info')
})

test('AC-002: an OpenCode flat mcp block parses and ignores reserved keys', () => {
  const parsed = parseProfile(JSON.stringify({
    mcp: {
      flatmap: { command: ['node', 'server.js'], enabled: false },
      timeout: { startup: 5000 },
    },
  }))
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.file.servers.length, 1)
  assert.equal(parsed.file.servers[0]?.name, 'flatmap')
  assert.equal(parsed.file.servers[0]?.disabled, true)
})

test('AC-002: a VS Code servers block parses', () => {
  const parsed = parseProfile(JSON.stringify({
    servers: {
      files: { type: 'stdio', command: 'npx', args: ['-y', 'pkg'] },
      api: { type: 'http', url: 'https://api.example.com/mcp' },
    },
    inputs: [{ id: 'token', type: 'promptString' }],
  }))
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const files = parsed.file.servers.find((entry) => entry.name === 'files')
  assert.equal(files?.transport, 'stdio')
  const api = parsed.file.servers.find((entry) => entry.name === 'api')
  assert.equal(api?.transport, 'streamable-http')
  assert.equal(api?.auth.kind, 'oauth')
})

test('AC-003: an array document is rejected with the expected shape', () => {
  const parsed = parseProfile(JSON.stringify({
    version: 1,
    servers: [{ name: 'same', command: 'node' }],
  }))
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.match(parsed.error, /keyed by server name/)
})

test('AC-004: serialization writes mcpServers and round-trips every field', () => {
  const file: ProfileFile = {
    version: 1,
    servers: [
      {
        name: 'remote',
        transport: 'streamable-http',
        url: 'https://example.com/mcp',
        auth: { kind: 'bearer', credential: 'REMOTE_TOKEN' },
        disabled: true,
        toolPolicy: { allow: ['get*'], deny: ['delete*'] },
        exposure: 'catalog',
        timeouts: { connectMs: 5000, callMs: 60000 },
      },
      { name: 'public', transport: 'streamable-http', url: 'https://public.example/mcp', auth: { kind: 'none' }, disabled: false, toolPolicy: {}, exposure: 'catalog' },
      {
        name: 'local',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'pkg'],
        env: { A: 'b' },
        cwd: '/tmp',
        auth: { kind: 'none' },
        disabled: false,
        toolPolicy: {},
        exposure: 'catalog',
      },
    ],
  }

  const document = serializeProfile(file)
  assert.ok(isRecord(document.mcpServers))
  assert.equal(document.servers, undefined)
  const dsh = document.dsh
  assert.ok(isRecord(dsh))
  assert.ok(isRecord(dsh.auth))
  assert.ok(isRecord(dsh.toolPolicy))
  assert.ok(isRecord(dsh.timeouts))

  const parsed = parseProfile(JSON.stringify(document))
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const original = new Map(file.servers.map((server) => [server.name, server]))
  for (const server of parsed.file.servers) {
    const expected = original.get(server.name)
    assert.ok(expected !== undefined)
    assert.deepEqual(server, expected)
  }
})

test('AC-004: a workspace write keeps disableProfileServers under dsh', () => {
  const document = serializeWorkspace({
    version: 1,
    servers: [{ name: 'stripe', transport: 'stdio', command: 'npx', auth: { kind: 'none' }, toolPolicy: {} }],
    disableProfileServers: ['notion'],
  })
  assert.ok(isRecord(document.dsh))
  assert.deepEqual(document.dsh.disableProfileServers, ['notion'])
  const parsed = parseWorkspace(JSON.stringify(document))
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.deepEqual(parsed.file.disableProfileServers, ['notion'])
})

test('AC-005: env references infer a bearer credential', () => {
  const cases = [
    ['Bearer ${TOKEN}', 'TOKEN'],
    ['Bearer ${TOKEN:-fallback}', 'TOKEN'],
    ['Bearer {env:TOKEN}', 'TOKEN'],
  ] as const
  for (const [header, expected] of cases) {
    const parsed = parseProfile(JSON.stringify({
      mcpServers: { remote: { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: header } } },
    }))
    assert.equal(parsed.ok, true)
    if (!parsed.ok) continue
    const server: ServerDef | undefined = parsed.file.servers[0]
    assert.equal(server?.auth.kind, 'bearer')
    if (server?.auth.kind === 'bearer') assert.equal(server.auth.credential, expected)
  }
})

test('AC-002: an OpenCode oauth:false entry stays unauthenticated', () => {
  const parsed = parseProfile(JSON.stringify({
    mcp: {
      servers: {
        keyed: {
          type: 'remote',
          url: 'https://api.example.com/mcp',
          oauth: false,
          headers: { 'X-API-Key': '{env:API_KEY}' },
        },
        oauthServer: {
          type: 'remote',
          url: 'https://oauth.example.com/mcp',
          oauth: { scopes: ['read'], client_id: 'client-1' },
        },
      },
    },
  }))
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const keyed = parsed.file.servers.find((entry) => entry.name === 'keyed')
  assert.equal(keyed?.auth.kind, 'none')
  const oauthServer = parsed.file.servers.find((entry) => entry.name === 'oauthServer')
  assert.equal(oauthServer?.auth.kind, 'oauth')
  if (oauthServer?.auth.kind === 'oauth') {
    assert.deepEqual(oauthServer.auth.scopes, ['read'])
    assert.equal(oauthServer.auth.clientId, 'client-1')
  }
})

test('AC-006: an sse entry is rejected with the server name', () => {
  const parsed = parseProfile(JSON.stringify({
    mcpServers: { old: { type: 'sse', url: 'https://example.com/sse' } },
  }))
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.match(parsed.error, /old/)
})

test('BR-003: a workspace disable list parses from dsh', () => {
  const parsed = parseWorkspace(JSON.stringify({ mcpServers: {}, dsh: { disableProfileServers: ['n8n'] } }))
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.deepEqual(parsed.file.disableProfileServers, ['n8n'])
})

test('EXP-001: exposure defaults to catalog, parses direct, and round-trips through serialization', () => {
  const plain = parseProfile(JSON.stringify({ mcpServers: { a: { type: 'http', url: 'https://example.com/mcp' } } }))
  assert.equal(plain.ok, true)
  if (plain.ok) assert.equal(plain.file.servers[0]?.exposure, 'catalog')

  const direct = parseProfile(
    JSON.stringify({ mcpServers: { a: { type: 'http', url: 'https://example.com/mcp' } }, dsh: { exposure: { a: 'direct' } } }),
  )
  assert.equal(direct.ok, true)
  if (direct.ok) {
    assert.equal(direct.file.servers[0]?.exposure, 'direct')
    const serialized = serializeProfile(direct.file)
    const dsh: Record<string, unknown> = isRecord(serialized.dsh) ? serialized.dsh : {}
    assert.deepEqual(dsh.exposure, { a: 'direct' })
    const reparsed = parseProfile(JSON.stringify(serialized))
    assert.equal(reparsed.ok, true)
    if (reparsed.ok) assert.equal(reparsed.file.servers[0]?.exposure, 'direct')
  }

  const catalogOnly = parseProfile(JSON.stringify({ mcpServers: { a: { type: 'http', url: 'https://example.com/mcp' } } }))
  assert.equal(catalogOnly.ok, true)
  if (catalogOnly.ok) {
    assert.equal(Object.hasOwn(serializeProfile(catalogOnly.file), 'dsh'), false)
  }

  const bad = parseProfile(
    JSON.stringify({ mcpServers: { a: { type: 'http', url: 'https://example.com/mcp' } }, dsh: { exposure: { a: 'lazy' } } }),
  )
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.error, /exposure/)

  const internal = validateServer({
    name: 'a',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    auth: { kind: 'none' },
    exposure: 'direct',
  })
  assert.equal(internal.ok, true)
  if (internal.ok) assert.equal(internal.server.exposure, 'direct')
  const badInternal = validateServer({
    name: 'a',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    auth: { kind: 'none' },
    exposure: 'lazy',
  })
  assert.equal(badInternal.ok, false)
})

test('BR-005: wildcard policy matches and deny wins', () => {
  assert.equal(matchesPattern('get*', 'getIssue'), true)
  assert.equal(matchesPattern('get*', 'createIssue'), false)
  assert.equal(matchesPattern('*', 'anything'), true)
  assert.equal(toolAllowed({ allow: ['get*'] }, 'getIssue'), true)
  assert.equal(toolAllowed({ allow: ['get*'] }, 'createIssue'), false)
  assert.equal(toolAllowed({ deny: ['delete*'] }, 'deleteIssue'), false)
  assert.equal(toolAllowed({ allow: ['*'], deny: ['delete*'] }, 'deleteIssue'), false)
  assert.equal(toolAllowed(undefined, 'anything'), true)
})
