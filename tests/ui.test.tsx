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

test('AC-015: the page renders a configured server and its tools', async () => {
  const store = new OverviewStore(caller(data))
  await store.refresh()
  const html = renderToStaticMarkup(<McpManagerPage store={store} t={(key) => key} />)
  assert.match(html, /demo/)
  assert.match(html, /statusReady/)
  assert.match(html, /Project one/)
})

test('AC-015: the add form renders every required field', () => {
  const html = renderToStaticMarkup(
    <Editor
      mode="add"
      draft={{ ...EMPTY_DRAFT }}
      busy={false}
      onChange={() => undefined}
      onSave={() => undefined}
      onCancel={() => undefined}
      t={(key) => key}
    />,
  )
  assert.match(html, /addTitle/)
  assert.match(html, /id="mcp-manager-name"/)
  assert.match(html, /id="mcp-manager-url"/)
  assert.match(html, /id="mcp-manager-auth"/)
  assert.match(html, /aria-pressed="true">transportHttp/)
})

test('AC-015: draft validation catches a bad name and a missing URL', () => {
  assert.equal(validateDraft({ ...EMPTY_DRAFT, name: 'bad name!' }), 'name')
  assert.equal(validateDraft({ ...EMPTY_DRAFT, name: 'ok' }), 'connection')
  const server = draftToServer({ ...EMPTY_DRAFT, name: 'ok', url: 'https://example.com/mcp', allow: 'get*', deny: 'delete*' })
  assert.equal(server.name, 'ok')
  const detail = draftFromDetail({
    name: 'ok',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    auth: { kind: 'oauth', scopes: ['read'] },
    toolPolicy: { allow: ['get*'] },
  })
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
  const store = new OverviewStore(caller(empty))
  await store.refresh()
  const html = renderToStaticMarkup(<McpManagerPage store={store} t={(key) => key} />)
  assert.match(html, /noServersTitle/)
  assert.match(html, /\/empty\/profile\.json/)
})
