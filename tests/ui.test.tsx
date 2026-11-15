import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuthPanel, McpManagerPage } from '../src/client/page.js'
import {
  Editor,
  EMPTY_DRAFT,
  commandLines,
  deriveName,
  draftFromDetail,
  draftToServer,
  parsePairBlock,
  splitCommandLine,
  uniqueName,
  validateDraft,
} from '../src/client/editor.js'
import { OverviewStore } from '../src/client/store.js'
import type { OverviewData, OverviewServer, RpcOutcome } from '../src/client/harness.js'
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

const tokenReady: OverviewServer = {
  name: 'token-ready',
  transport: 'streamable-http',
  target: 'https://token.example.com/mcp',
  authKind: 'bearer',
  authConfigured: true,
  disabled: false,
  status: 'ready',
  toolCount: 2,
  tools: ['mcp__token-ready__ping', 'mcp__token-ready__pong'],
  logs: [],
}

function authPanelProps(server: OverviewServer) {
  return {
    server,
    own: true,
    expanded: true,
    tab: 'tools' as const,
    busy: false,
    tokenValue: '',
    redirect: '',
    authReveal: false,
    t: (key: string) => key,
    onToggle: () => undefined,
    onEdit: () => undefined,
    onDelete: () => undefined,
    onManageProfile: () => undefined,
    onEnabled: () => undefined,
    onTokenValue: () => undefined,
    onSaveToken: () => undefined,
    onClearToken: () => undefined,
    onSignIn: () => undefined,
    onReopenSignIn: () => undefined,
    onCompleteSignIn: () => undefined,
    onCancelSignIn: () => undefined,
    onSignOut: () => undefined,
    onAuthReveal: () => undefined,
    onTab: () => undefined,
    onRetry: () => undefined,
  }
}

test('AC-019: a collapsed card shows a labeled details control', async () => {
  const html = await renderPage(data)
  assert.match(html, /mcp-expand-label/)
  assert.match(html, /aria-expanded="false"/)
  assert.doesNotMatch(html, /mcp-card-details/)
})

test('AC-020: a stored token shows explicit replace and clear actions', () => {
  const html = renderToStaticMarkup(<AuthPanel {...authPanelProps(tokenReady)} />)
  assert.match(html, /mcp-auth mcp-auth-ready/)
  assert.match(html, /tokenStored/)
  assert.match(html, /replaceToken/)
  assert.match(html, /clearToken/)
})

test('AC-015: the page renders a server card with its status pill, chips, and target', async () => {
  const html = await renderPage(data)
  assert.match(html, /demo/)
  assert.match(html, /statusReady/)
  assert.match(html, /https:\/\/example.com\/mcp/)
  assert.match(html, /mcp-status/)
  assert.match(html, /mcp-status-dot/)
  assert.match(html, /mcp-card-chips/)
  assert.match(html, /mcp-tile/)
  assert.match(html, /mcp-add-tile/)
  assert.match(html, /1 toolUnit/)
  assert.doesNotMatch(html, /mcp-title/)
})

test('AC-017: only the current scope is shown until the scope menu opens', async () => {
  const html = await renderPage(data)
  assert.match(html, /mcp-scope-trigger/)
  assert.match(html, /allWorkspaces/)
  assert.match(html, /mcp-search/)
  assert.doesNotMatch(html, /Project one/)
})

test('AC-015: a token server shows its status pill without a card action', async () => {
  const html = await renderPage(data)
  assert.match(html, /needs-token/)
  assert.match(html, /statusNeedsToken/)
  assert.match(html, /authBearer/)
  assert.doesNotMatch(html, /setToken/)
})

test('AC-015: the add form starts with the connection kind and a URL field', () => {
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
  assert.match(html, /id="mcp-kind-remote"/)
  assert.match(html, /id="mcp-kind-local"/)
  assert.match(html, /serverUrl/)
  assert.match(html, /urlHint/)
  assert.match(html, /for="mcp-connection"/)
  assert.match(html, /id="mcp-connection"/)
  assert.match(html, /nameHint/)
  assert.doesNotMatch(html, /mcp-form-advanced/)
})

test('AC-015: the local form takes a command with one argument per line', () => {
  const html = renderToStaticMarkup(
    <Editor
      mode="add"
      draft={{ ...EMPTY_DRAFT, kind: 'local', connection: 'npx\n-y\npkg' }}
      existingNames={[]}
      onChange={() => undefined}
      onSave={() => undefined}
      t={(key) => key}
    />,
  )
  assert.match(html, /<textarea[^>]*id="mcp-connection"/)
  assert.match(html, /commandHint/)
  assert.match(html, /3 argumentsWillSave/)
  assert.match(html, /advancedLocal/)
  assert.doesNotMatch(html, /serverUrl/)
})

test('AC-015: the edit form opens advanced with auth, pairs, and policy', () => {
  const draft = draftFromDetail({
    name: 'demo',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: { 'X-Trace': 'dsh' },
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
  assert.match(html, /mcp-kind-remote/)
  assert.match(html, /id="mcp-auth-oauth"/)
  assert.match(html, /headersPlainText/)
  assert.match(html, /mcp-pair-row/)
  assert.match(html, /policyHint/)
  assert.match(html, /advancedRemote/)
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
  assert.deepEqual(validateDraft({ ...EMPTY_DRAFT, kind: 'local', connection: '', name: 'ok' }), {
    connection: true,
  })
  assert.deepEqual(validateDraft({ ...EMPTY_DRAFT, kind: 'local', connection: 'npx -y pkg', name: 'ok' }), {})
})

test('AC-015: a name is derived from the address or command', () => {
  assert.equal(deriveName('https://mcp.notion.com/mcp'), 'notion')
  assert.equal(deriveName('https://crmai.enacton.com/api/mcp/mcp'), 'crmai')
  assert.equal(deriveName('npx -y @modelcontextprotocol/server-filesystem /tmp'), 'filesystem')
  assert.equal(deriveName('npx\n-y\n@modelcontextprotocol/server-filesystem\n/tmp'), 'filesystem')
  assert.equal(deriveName('node /srv/mcp/server.js'), 'server')
  assert.equal(deriveName('http://127.0.0.1:3000/mcp'), 'local-server')
  assert.equal(deriveName(''), '')
  assert.equal(uniqueName('notion', ['notion', 'notion-2']), 'notion-3')
})

test('AC-015: a pasted line splits into arguments and quoted words stay together', () => {
  assert.deepEqual(splitCommandLine('npx -y pkg /tmp'), ['npx', '-y', 'pkg', '/tmp'])
  assert.deepEqual(splitCommandLine('node "/srv/my server.js" --flag'), ['node', '/srv/my server.js', '--flag'])
  assert.deepEqual(splitCommandLine("  npx   -y\n pkg  "), ['npx', '-y', 'pkg'])
  assert.deepEqual(commandLines('npx\n\n-y\n /tmp '), ['npx', '-y', '/tmp'])
})

test('AC-015: a pasted pair block fills headers and environment rows', () => {
  assert.deepEqual(parsePairBlock('A=1\n# comment\nbad\nB = two ', '='), [
    { key: 'A', value: '1' },
    { key: 'B', value: 'two' },
  ])
  assert.deepEqual(parsePairBlock('X-Trace: dsh\nAuthorization: Bearer x', ':'), [
    { key: 'X-Trace', value: 'dsh' },
    { key: 'Authorization', value: 'Bearer x' },
  ])
})

test('AC-015: drafts convert to remote and local server definitions', () => {
  const remote = draftToServer({
    ...EMPTY_DRAFT,
    name: 'remote',
    connection: 'https://example.com/mcp',
    headers: [{ key: 'X-Trace', value: 'dsh' }],
    allow: 'get*',
    deny: 'delete*',
  })
  assert.equal(remote.transport, 'streamable-http')
  assert.equal(remote.url, 'https://example.com/mcp')
  assert.deepEqual(remote.headers, { 'X-Trace': 'dsh' })
  assert.deepEqual(remote.toolPolicy, { allow: ['get*'], deny: ['delete*'] })

  const local = draftToServer({
    ...EMPTY_DRAFT,
    kind: 'local',
    name: 'local',
    connection: 'npx\n-y\n@modelcontextprotocol/server-filesystem\n/tmp',
    env: [{ key: 'LOG_LEVEL', value: 'info' }],
  })
  assert.equal(local.transport, 'stdio')
  assert.equal(local.command, 'npx')
  assert.deepEqual(local.args, ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
  assert.deepEqual(local.env, { LOG_LEVEL: 'info' })
  assert.equal(local.headers, undefined)

  const detail = draftFromDetail({
    name: 'demo',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: { 'X-Trace': 'dsh' },
    auth: { kind: 'oauth', scopes: ['read'] },
    toolPolicy: { allow: ['get*'] },
  })
  assert.equal(detail.kind, 'remote')
  assert.equal(detail.connection, 'https://example.com/mcp')
  assert.deepEqual(detail.headers, [{ key: 'X-Trace', value: 'dsh' }])
  assert.equal(detail.authKind, 'oauth')
  assert.equal(detail.scopes, 'read')
  assert.equal(detail.allow, 'get*')

  const localDetail = draftFromDetail({
    name: 'local',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'pkg'],
    env: { LOG_LEVEL: 'info' },
    auth: { kind: 'none' },
  })
  assert.equal(localDetail.kind, 'local')
  assert.equal(localDetail.connection, 'npx\n-y\npkg')
  assert.deepEqual(localDetail.env, [{ key: 'LOG_LEVEL', value: 'info' }])
})

test('AC-018: editing keeps fields the form does not model', () => {
  const local: ServerDef = {
    name: 'local',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'pkg'],
    env: { LOG_LEVEL: 'info' },
    cwd: '/tmp/work',
    auth: { kind: 'none' },
    timeouts: { connectMs: 5000 },
  }
  const mergedLocal = draftToServer(draftFromDetail(local), local)
  assert.equal(mergedLocal.transport, 'stdio')
  assert.equal(mergedLocal.command, 'npx')
  assert.deepEqual(mergedLocal.env, { LOG_LEVEL: 'info' })
  assert.equal(mergedLocal.cwd, '/tmp/work')
  assert.deepEqual(mergedLocal.timeouts, { connectMs: 5000 })

  const remote: ServerDef = {
    name: 'remote',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: { 'X-Trace': 'dsh' },
    auth: { kind: 'oauth', scopes: ['read'], clientId: 'client', clientSecret: 'secret' },
    timeouts: { callMs: 2000 },
  }
  const mergedRemote = draftToServer(draftFromDetail(remote), remote)
  assert.equal(mergedRemote.url, 'https://example.com/mcp')
  assert.deepEqual(mergedRemote.headers, { 'X-Trace': 'dsh' })
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
  assert.match(html, /mcp-add-tile/)
})
