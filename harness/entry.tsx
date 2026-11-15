import { createRoot } from 'react-dom/client'
import { McpManagerPage } from '../src/client/page.js'
import { CSS } from '../src/client/styles.js'
import { en } from '../src/client/locale.js'
import type { OverviewData } from '../src/client/harness.js'
import type { OverviewStore } from '../src/client/store.js'

const data: OverviewData = {
  profile: {
    path: '/home/parth/.dsh/plugins/mcp-manager/web.json',
    servers: [
      { name: 'example-crm', origin: 'profile', transport: 'streamable-http', target: 'https://api.example.com/mcp', authKind: 'bearer', authConfigured: true, disabled: false, status: 'ready', toolCount: 34, tools: ['mcp__example-crm__whoAmI', 'mcp__example-crm__listTickets', 'mcp__example-crm__getContact', 'mcp__example-crm__searchContacts'], logs: [{ time: new Date().toISOString(), level: 'info', message: 'connected with 34 tools' }] },
      { name: 'notion', origin: 'profile', transport: 'streamable-http', target: 'https://mcp.notion.com/mcp', authKind: 'oauth', authConfigured: false, disabled: false, status: 'needs_auth', oauthUrl: 'https://mcp.notion.com/authorize?client_id=demo', oauthAttemptId: 'attempt-demo', toolCount: 0, tools: [], logs: [{ time: new Date().toISOString(), level: 'warn', message: 'status needs_auth: Sign in to authorize this server.' }] },
      { name: 'local-files', origin: 'profile', transport: 'stdio', target: 'npx -y @modelcontextprotocol/server-filesystem', authKind: 'none', authConfigured: true, disabled: false, status: 'error', toolCount: 0, tools: [], error: 'spawn npx ENOENT', logs: [{ time: new Date().toISOString(), level: 'error', message: 'spawn npx ENOENT' }] },
      { name: 'old-postman', origin: 'profile', transport: 'streamable-http', target: 'https://mcp.postman.com/minimal', authKind: 'none', authConfigured: true, disabled: true, status: 'disabled', toolCount: 0, tools: [], logs: [] },
    ],
  },
  workspaces: [
    { id: 'ws-1', title: 'bookings-tool', path: '/home/parth/Production/bookings-tool', filePath: '/home/parth/Production/bookings-tool/.dsh/mcp.json', servers: [
      { name: 'posthog', origin: 'workspace', transport: 'streamable-http', target: 'https://mcp.posthog.com/mcp', authKind: 'oauth', authConfigured: true, disabled: false, status: 'ready', toolCount: 12, tools: ['mcp__posthog__query', 'mcp__posthog__insight'], logs: [] },
      { name: 'example-crm', origin: 'profile', transport: 'streamable-http', target: 'https://api.example.com/mcp', authKind: 'bearer', authConfigured: true, disabled: false, status: 'ready', toolCount: 34, tools: [], logs: [] },
    ] },
    { id: 'ws-2', title: 'dsh-openui', path: '/home/parth/Production/dsh-openui', filePath: '/home/parth/Production/dsh-openui/.dsh/mcp.json', servers: [] },
  ],
  oauthAvailable: true,
}

const snapshot = { loading: false, data, updatedAt: Date.now() }
const dict: Record<string, string> = en
const store: OverviewStore = {
  subscribe: () => () => undefined,
  getSnapshot: () => snapshot,
  start: () => () => undefined,
  stop: () => undefined,
  refresh: async () => undefined,
  reconnect: async () => undefined,
  call: async () => ({ ok: true }),
}

const style = document.createElement('style')
style.textContent = CSS
document.head.appendChild(style)

createRoot(document.getElementById('root')!).render(
  <McpManagerPage store={store} t={(key) => dict[key] ?? key} />,
)
