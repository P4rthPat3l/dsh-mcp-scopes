import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { McpManagerPage } from '../src/client/page.js'
import { Editor, EMPTY_DRAFT, draftFromDetail, draftToServer, validateDraft } from '../src/client/editor.js'
import { OverviewStore } from '../src/client/store.js'
import type { OverviewData, RpcOutcome } from '../src/client/harness.js'

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
  return store.refresh().then(() =>
    renderToStaticMarkup(<McpManagerPage store={store} t={(key) => key} />),
  )
}

test('AC-015: the page renders a connected server, its status, and the scopes', async () => {
  const html = await renderPage(data)
  assert.match(html, /demo/)
  assert.match(html, /statusReady/)
  assert.match(html, /https:\/\/example.com\/mcp/)
  assert.match(html, /data-state="done"/)
  assert.match(html, /Project one/)
})

test('AC-015: the add form starts with the connection field only', () => {
  const html = renderToStaticMarkup(
    <Editor
      mode="add"
      draft={{ ...EMPTY_DRAFT }}
      scopeLabel="Profile"
      busy={false}
      onChange={() => undefined}
      onSave={() => undefined}
      onCancel={() => undefined}
      t={(key) => key}
    />,
  )
  assert.match(html, /addTitle/)
  assert.match(html, /addressOrCommand/)
  assert.match(html, /addressHint/)
  assert.doesNotMatch(html, /nameHint/)
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
      scopeLabel="Profile"
      busy={false}
      onChange={() => undefined}
      onSave={() => undefined}
      onCancel={() => undefined}
      t={(key) => key}
    />,
  )
  assert.match(html, /mcp-transport-auto/)
  assert.match(html, /mcp-auth-oauth/)
  assert.match(html, /nameHint/)
  assert.match(html, /policyHint/)
})

test('AC-015: draft validation catches a bad name, a missing connection, and a bad URL', () => {
  assert.equal(validateDraft({ ...EMPTY_DRAFT, connection: 'x', name: 'bad name!' }), 'name')
  assert.equal(validateDraft({ ...EMPTY_DRAFT, connection: '', name: 'ok' }), 'connection')
  assert.equal(validateDraft({ ...EMPTY_DRAFT, connection: 'ftp://example.com', name: 'ok' }), 'url')
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
