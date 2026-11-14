import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveEffective } from '../src/host/scope.js'
import type { ProfileFile, WorkspaceFile } from '../src/host/types.js'

const profile: ProfileFile = {
  version: 1,
  servers: [
    { name: 'crm', transport: 'streamable-http', url: 'https://crm.example/mcp', auth: { kind: 'none' } },
    { name: 'postman', transport: 'streamable-http', url: 'https://postman.example/mcp', auth: { kind: 'none' } },
  ],
}

test('AC-001: profile servers reach every workspace', () => {
  const effective = resolveEffective(profile, undefined)
  assert.deepEqual(
    effective.map((item) => item.def.name),
    ['crm', 'postman'],
  )
  assert.ok(effective.every((item) => item.scope === 'profile'))
})

test('AC-003: a workspace entry shadows a same-named profile entry', () => {
  const workspace: WorkspaceFile = {
    version: 1,
    servers: [{ name: 'postman', transport: 'streamable-http', url: 'https://other.example/mcp', auth: { kind: 'none' } }],
  }
  const effective = resolveEffective(profile, workspace)
  assert.deepEqual(
    effective.map((item) => item.def.name),
    ['crm', 'postman'],
  )
  const postman = effective.find((item) => item.def.name === 'postman')
  assert.equal(postman?.scope, 'workspace')
  assert.equal(postman?.def.url, 'https://other.example/mcp')
})

test('AC-003: disableProfileServers removes only that workspace copy', () => {
  const workspace: WorkspaceFile = { version: 1, servers: [], disableProfileServers: ['crm'] }
  assert.deepEqual(
    resolveEffective(profile, workspace).map((item) => item.def.name),
    ['postman'],
  )
  assert.deepEqual(
    resolveEffective(profile, undefined).map((item) => item.def.name),
    ['crm', 'postman'],
  )
})

test('AC-002: workspace-only servers are appended', () => {
  const workspace: WorkspaceFile = {
    version: 1,
    servers: [{ name: 'local', transport: 'stdio', command: 'node', auth: { kind: 'none' } }],
  }
  const effective = resolveEffective(profile, workspace)
  assert.equal(effective.at(-1)?.def.name, 'local')
  assert.equal(effective.at(-1)?.scope, 'workspace')
})
