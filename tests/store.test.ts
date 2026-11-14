import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigStore } from '../src/host/store.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mcp-manager-store-'))
}

test('BR-006: a missing profile file reads as empty', async () => {
  const dir = await scratch()
  try {
    const store = new ConfigStore(join(dir, 'profile.json'))
    const read = await store.readProfile()
    assert.equal(read.missing, true)
    assert.deepEqual(read.file.servers, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('BR-006: a profile write lands as mcpServers and is mode 0600', async () => {
  const dir = await scratch()
  try {
    const store = new ConfigStore(join(dir, 'profile.json'))
    await store.writeProfile({
      version: 1,
      servers: [{ name: 'fake', transport: 'streamable-http', url: 'https://example.com/mcp', auth: { kind: 'none' } }],
    })
    const read = await store.readProfile()
    assert.equal(read.error, undefined)
    assert.equal(read.file.servers[0]?.name, 'fake')
    const document: unknown = JSON.parse(await readFile(store.profilePath, 'utf8'))
    assert.ok(isRecord(document))
    assert.ok(isRecord(document.mcpServers))
    assert.equal(document.servers, undefined)
    assert.equal(isRecord(document.mcpServers.fake), true)
    const mode = (await stat(store.profilePath)).mode & 0o777
    assert.equal(mode, 0o600)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('BR-011: malformed workspace JSON reports an error and stays empty', async () => {
  const dir = await scratch()
  try {
    await mkdir(join(dir, '.dsh'), { recursive: true })
    await writeFile(join(dir, '.dsh', 'mcp.json'), '{not json')
    const store = new ConfigStore(join(dir, 'profile.json'))
    const read = await store.readWorkspace(dir)
    assert.notEqual(read.error, undefined)
    assert.deepEqual(read.file.servers, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('BR-006: a workspace write keeps disableProfileServers under dsh', async () => {
  const dir = await scratch()
  try {
    const store = new ConfigStore(join(dir, 'profile.json'))
    await store.writeWorkspace(dir, { version: 1, servers: [], disableProfileServers: ['n8n'] })
    const read = await store.readWorkspace(dir)
    assert.equal(read.error, undefined)
    assert.deepEqual(read.file.disableProfileServers, ['n8n'])
    const document: unknown = JSON.parse(await readFile(join(dir, '.dsh', 'mcp.json'), 'utf8'))
    assert.ok(isRecord(document))
    assert.ok(isRecord(document.mcpServers))
    assert.ok(isRecord(document.dsh))
    assert.deepEqual(document.dsh.disableProfileServers, ['n8n'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
