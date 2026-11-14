import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { McpManagerPage } from '../src/client/page.js'
import {
  Editor,
  EMPTY_DRAFT,
  deriveName,
  draftFromDetail,
  draftToServer,
  uniqueName,
  validateDraft,
} from '../src/client/editor.js'
import { OverviewStore } from '../src/client/store.js'
import type { OverviewData, RpcOutcome } from '../src/client/harness.js'
import type { ServerDef } from '../src/host/types.js'

const data: OverviewData = {
  profile: {
    path: '/home/parth/.dsh/plugins/mcp-manager/web.json',
    servers: [
      {
        name: 'demo',
        transport: 'streamable-http',
        target: 'https://example.com/mcp',
        authKind: 'none',
        disabled: false,
        status: 'ready',
        toolCount: 1,
        tools: ['mcp__demo__echo'],
        toolDetails: [{ name: 'mcp__demo__echo', description: 'Echo the given text.' }],
        resources: [],
        prompts: [],
        instructions: 'Demo server instructions.',
        logs: [{ time: '2026-11-13T06:00:00.000Z', level: 'info', message: 'status ready' }],
      },
      {
        name: 'needs-token',
        transport: 'streamable-http',
        target: 'https://token.example.com/mcp',
        authKind: 'bearer',
        authConfigured: false,
        disabled: false,
        status: 'needs_token',
        toolCount: 0,
        tools: [],
        logs: [],
      },
    ],
  },
  workspaces: [
    {
      id: 'ws-1',
      title: 'Project one',
      path: '/home/parth/Projects/one',
      filePath: '/home/parth/Projects/one/.dsh/mcp.json',
      servers: [],
    },
  ],
  oauthAvailable: false,
}

function caller(value: OverviewData): { call(): Promise<RpcOutcome> } {
  return {
    async call(): Promise<RpcOutcome> {
      return { ok: true, value }
    },
  }
}

function renderPage(value: OverviewData): Promise<string> {
  const store = new OverviewStore(caller(value))
  return store.refresh().then(() => renderToStaticMarkup(<McpManagerPage store={store} t={(key) => key} />))
}

test('AC-015: the page renders a server card with its status and target', async () => {
  const html = await renderPage(data)
  assert.match(html, /demo/)
  assert.match(html, /statusReady/)
  assert.match(html, /https:\/\/example.com\/mcp/)
  assert.match(html, /data-state="done"/)
  assert.match(html, /mcp-card/)
  assert.match(html, /1 toolUnit/)
  assert.doesNotMatch(html, /mcp-title/)
})

test('AC-017: only the current scope is shown until the scope menu opens', async () => {
  const html = await renderPage(data)
  assert.match(html, /mcp-scope-trigger/)
  assert.match(html, /allWorkspaces/)
  assert.doesNotMatch(html, /Project one/)
})

test('AC-015: a token server offers its setup action on the card', async () => {
  const html = await renderPage(data)
  assert.match(html, /needs-token/)
  assert.match(html, /statusNeedsToken/)
  assert.match(html, /setToken/)
})

test('AC-015: the add form shows the address and the derived name together', () => {
  const html = renderToStaticMarkup(
    <Editor
      mode="add"
      draft={{ ...EMPTY_DRAFT }}
      existingNames={[]}
      onChange={() => undefined}
      onSave={() => undefined}
      t={(key) => key}
    />,
  )
  assert.match(html, /addressOrCommand/)
  assert.match(html, /nameHint/)
  assert.match(html, /addressHint/)
  assert.match(html, /for="mcp-connection"/)
  assert.match(html, /id="mcp-connection"/)
  assert.match(html, /aria-describedby="mcp-connection-hint"/)
  assert.doesNotMatch(html, /policyHint/)
  assert.doesNotMatch(html, /authentication/)
})

test('AC-015: the edit form exposes transport, auth, and policy controls', () => {
  const draft = draftFromDetail({
    name: 'demo',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    auth: { kind: 'oauth', scopes: ['read'] },
    toolPolicy: { allow: ['get*'] },
  })
  const html = renderToStaticMarkup(
    <Editor
      mode="edit"
      draft={draft}
      existingNames={[]}
      onChange={() => undefined}
      onSave={() => undefined}
      t={(key) => key}
    />,
  )
  assert.match(html, /mcp-transport-auto/)
  assert.match(html, /mcp-auth-oauth/)
  assert.match(html, /policyHint/)
  assert.match(html, /headersHint/)
})

test('AC-015: validation reports every invalid field', () => {
  assert.deepEqual(validateDraft({ ...EMPTY_DRAFT, connection: '', name: '' }), {
    connection: true,
    name: true,
  })
  assert.deepEqual(validateDraft({ ...EMPTY_DRAFT, connection: 'ftp://example.com', name: 'ok' }), {
    url: true,
  })
  assert.deepEqual(validateDraft({ ...EMPTY_DRAFT, connection: 'https://example.com/mcp', name: 'ok' }, ['ok']), {
    nameTaken: true,
  })
  assert.deepEqual(validateDraft({ ...EMPTY_DRAFT, connection: 'https://example.com/mcp', name: 'ok' }), {})
})

test('AC-015: a name is derived from the address or command', () => {
  assert.equal(deriveName('https://mcp.notion.com/mcp'), 'notion')
  assert.equal(deriveName('https://crmai.enacton.com/api/mcp/mcp'), 'crmai')
  assert.equal(deriveName('npx -y @modelcontextprotocol/server-filesystem /tmp'), 'filesystem')
  assert.equal(deriveName('node /srv/mcp/server.js'), 'server')
  assert.equal(deriveName('http://127.0.0.1:3000/mcp'), 'local-server')
  assert.equal(deriveName(''), '')
  assert.equal(uniqueName('notion', ['notion', 'notion-2']), 'notion-3')
})

test('AC-015: drafts convert to remote and local server definitions', () => {
  const remote = draftToServer({
    ...EMPTY_DRAFT,
    name: 'remote',
    connection: 'https://example.com/mcp',
    allow: 'get*',
    deny: 'delete*',
  })
  assert.equal(remote.transport, 'streamable-http')
  assert.equal(remote.url, 'https://example.com/mcp')
  assert.deepEqual(remote.toolPolicy, { allow: ['get*'], deny: ['delete*'] })

  const local = draftToServer({
    ...EMPTY_DRAFT,
    name: 'local',
    connection: 'npx -y @modelcontextprotocol/server-filesystem /tmp',
    headers: 'LOG_LEVEL=info',
  })
  assert.equal(local.transport, 'stdio')
  assert.equal(local.command, 'npx')
  assert.deepEqual(local.args, ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
  assert.deepEqual(local.env, { LOG_LEVEL: 'info' })

  const detail = draftFromDetail({
    name: 'demo',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    auth: { kind: 'oauth', scopes: ['read'] },
    toolPolicy: { allow: ['get*'] },
  })
  assert.equal(detail.connection, 'https://example.com/mcp')
  assert.equal(detail.authKind, 'oauth')
  assert.equal(detail.scopes, 'read')
  assert.equal(detail.allow, 'get*')
})

test('AC-018: editing keeps fields the form does not model', () => {
  const local: ServerDef = {
    name: 'local',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'pkg'],
    cwd: '/tmp/work',
    auth: { kind: 'none' },
    timeouts: { connectMs: 5000 },
  }
  const mergedLocal = draftToServer(draftFromDetail(local), local)
  assert.equal(mergedLocal.transport, 'stdio')
  assert.equal(mergedLocal.command, 'npx')
  assert.equal(mergedLocal.cwd, '/tmp/work')
  assert.deepEqual(mergedLocal.timeouts, { connectMs: 5000 })

  const remote: ServerDef = {
    name: 'remote',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    auth: { kind: 'oauth', scopes: ['read'], clientId: 'client', clientSecret: 'secret' },
    timeouts: { callMs: 2000 },
  }
  const mergedRemote = draftToServer(draftFromDetail(remote), remote)
  assert.equal(mergedRemote.url, 'https://example.com/mcp')
  assert.deepEqual(mergedRemote.auth, {
    kind: 'oauth',
    scopes: ['read'],
    clientId: 'client',
    clientSecret: 'secret',
  })
  assert.deepEqual(mergedRemote.timeouts, { callMs: 2000 })
})

test('AC-015: an empty scope shows the empty state with its file path', async () => {
  const empty: OverviewData = {
    profile: { path: '/empty/profile.json', servers: [] },
    workspaces: [],
    oauthAvailable: false,
  }
  const html = await renderPage(empty)
  assert.match(html, /noServersTitle/)
  assert.match(html, /\/empty\/profile.json/)
})
