/** Authenticated browser RPC under `/api/mcp-manager.*`. */

import type { ConfigStore } from './store.js'
import type { ConnectionManager } from './connection.js'
import type { OAuthEngine } from './oauth.js'
import type {
  ConnectionFetchRoute,
  CredentialsService,
  HostContext,
  OverviewResult,
  ProfileFile,
  ScopeKind,
  ServerDef,
  ServerView,
  WorkspaceFile,
  WorkspaceRegistryService,
} from './types.js'
import { idleView } from './connection.js'
import { resolveEffective } from './scope.js'
import { isConnectionService } from './guards.js'
import { isRecord, toolAllowed, validateServer } from './schema.js'
import { clearApiKey, hasApiKey, saveApiKey } from './credentials.js'

export const RPC_PREFIX = 'mcp-manager'
export const ENDPOINTS = [
  'overview',
  'reconnect',
  'reconnectServer',
  'detail',
  'saveServer',
  'deleteServer',
  'setEnabled',
  'setWorkspaceDisabled',
  'setToken',
  'clearToken',
  'setToolPolicy',
  'startOAuth',
  'submitOAuthRedirect',
  'cancelOAuth',
  'logout',
] as const
export type RpcEndpoint = (typeof ENDPOINTS)[number]

export interface RpcDeps {
  readonly store: ConfigStore
  readonly manager: ConnectionManager
  readonly workspaces: WorkspaceRegistryService | undefined
  readonly profile: () => ProfileFile
  readonly credentials: CredentialsService | undefined
  readonly oauth: OAuthEngine | undefined
  readonly reloadProfile: () => Promise<void>
  readonly reattachWorkspace: (directory: string) => Promise<void>
}

class BadRequest extends Error {}

interface RequestEnvelope {
  readonly type: 'client-request'
  readonly rpcId: string
  readonly method: string
  readonly payload?: unknown
}

function readEnvelope(value: unknown): RequestEnvelope | undefined {
  if (!isRecord(value)) return undefined
  if (value.type !== 'client-request') return undefined
  if (typeof value.rpcId !== 'string' || typeof value.method !== 'string') return undefined
  return { type: 'client-request', rpcId: value.rpcId, method: value.method, payload: value.payload }
}

function serverResponse(rpcId: string, result: unknown): Response {
  return Response.json({ type: 'server-response', rpcId, result })
}

function succeed(rpcId: string, value: unknown): Response {
  return serverResponse(rpcId, { ok: true, value })
}

function fail(rpcId: string, code: string, message: string): Response {
  return serverResponse(rpcId, { ok: false, error: { code, message, details: {} } })
}

function requireRecord(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) throw new BadRequest('payload must be an object')
  return payload
}

function requireString(fields: Record<string, unknown>, name: string): string {
  const value = fields[name]
  if (typeof value !== 'string' || value.trim() === '') throw new BadRequest(`payload.${name} must be a non-empty string`)
  return value
}

function optionalString(fields: Record<string, unknown>, name: string): string | undefined {
  const value = fields[name]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') throw new BadRequest(`payload.${name} must be a non-empty string when present`)
  return value
}

function scopeOf(fields: Record<string, unknown>): ScopeKind {
  const value = fields.scope
  if (value !== 'profile' && value !== 'workspace') throw new BadRequest('payload.scope must be profile or workspace')
  return value
}

interface Target {
  readonly scope: ScopeKind
  readonly directory?: string
}

function targetOf(deps: RpcDeps, fields: Record<string, unknown>): Target {
  const scope = scopeOf(fields)
  if (scope === 'profile') return { scope }
  const workspaceId = requireString(fields, 'workspaceId')
  const workspace = deps.workspaces?.list().find((entry) => entry.id === workspaceId)
  if (workspace === undefined) throw new BadRequest('unknown workspace')
  return { scope, directory: workspace.path }
}

function readFile(deps: RpcDeps, target: Target): Promise<ProfileFile | WorkspaceFile> {
  if (target.scope === 'profile') return deps.store.readProfile().then((read) => read.file)
  if (target.directory === undefined) throw new BadRequest('a workspace scope needs a workspace')
  return deps.store.readWorkspace(target.directory).then((read) => read.file)
}

async function writeFile(deps: RpcDeps, target: Target, file: ProfileFile | WorkspaceFile): Promise<void> {
  if (target.scope === 'profile') {
    await deps.store.writeProfile(file)
    return
  }
  if (target.directory === undefined) throw new BadRequest('a workspace scope needs a workspace')
  const workspaceFile: WorkspaceFile = {
    version: 1,
    servers: file.servers,
    ...('disableProfileServers' in file && file.disableProfileServers !== undefined
      ? { disableProfileServers: file.disableProfileServers }
      : {}),
  }
  await deps.store.writeWorkspace(target.directory, workspaceFile)
}

async function reconcile(deps: RpcDeps, target: Target): Promise<void> {
  if (target.scope === 'profile') await deps.reloadProfile()
  else if (target.directory !== undefined) await deps.reattachWorkspace(target.directory)
}

function findServer(file: ProfileFile | WorkspaceFile, name: string): ServerDef | undefined {
  return file.servers.find((server) => server.name === name)
}

function withServer(file: ProfileFile | WorkspaceFile, server: ServerDef, previousName?: string): ProfileFile | WorkspaceFile {
  const servers = file.servers.filter((entry) => entry.name !== previousName && entry.name !== server.name)
  servers.push(server)
  return { ...file, servers }
}

function withoutServer(file: ProfileFile | WorkspaceFile, name: string): ProfileFile | WorkspaceFile {
  return { ...file, servers: file.servers.filter((entry) => entry.name !== name) }
}

async function configured(deps: RpcDeps, scope: ScopeKind, directory: string | undefined, def: ServerDef): Promise<boolean> {
  if (def.auth.kind === 'none') return true
  const scopeId = deps.manager.scopeIdFor(scope, directory, def.name)
  if (def.auth.kind === 'bearer') return hasApiKey(deps.credentials, scopeId)
  if (deps.oauth === undefined) return false
  return deps.oauth.hasGrant(scopeId)
}

async function viewFor(
  deps: RpcDeps,
  def: ServerDef,
  scope: ScopeKind,
  workspaceDir: string | undefined,
  hidden = false,
): Promise<ServerView> {
  const entry = deps.manager.find(scope, workspaceDir, def.name)
  const base = entry === undefined ? idleView(def) : deps.manager.view(entry)
  const oauthMessage =
    scope === 'workspace' || scope === 'profile'
      ? deps.oauth?.errorFor(deps.manager.scopeIdFor(scope, workspaceDir, def.name))
      : undefined
  return {
    ...base,
    origin: scope,
    ...(hidden ? { hidden: true } : {}),
    authConfigured: await configured(deps, scope, workspaceDir, def),
    ...(base.error === undefined && oauthMessage !== undefined ? { error: oauthMessage } : {}),
  }
}

async function overview(deps: RpcDeps): Promise<OverviewResult> {
  const read = await deps.store.readProfile()
  const profile = read.error === undefined ? read.file : deps.profile()
  const profileServers: ServerView[] = []
  for (const def of profile.servers) profileServers.push(await viewFor(deps, def, 'profile', undefined))
  const workspaces: Array<OverviewResult['workspaces'][number]> = []
  for (const workspace of deps.workspaces?.list() ?? []) {
    const file = await deps.store.readWorkspace(workspace.path)
    const effective = read.error === undefined ? resolveEffective(profile, file.missing ? undefined : file.file) : []
    const servers: ServerView[] = []
    for (const item of effective) {
      servers.push(await viewFor(deps, item.def, item.scope, item.scope === 'workspace' ? workspace.path : undefined))
    }
    if (read.error === undefined && file.missing === false) {
      const hidden = new Set(file.file.disableProfileServers ?? [])
      const shadowed = new Set(file.file.servers.map((def) => def.name))
      for (const def of profile.servers) {
        if (!hidden.has(def.name) || shadowed.has(def.name)) continue
        servers.push(await viewFor(deps, def, 'profile', undefined, true))
      }
    }
    workspaces.push({
      id: workspace.id,
      title: workspace.title,
      path: workspace.path,
      filePath: deps.store.workspacePath(workspace.path),
      ...(file.error === undefined ? {} : { error: file.error }),
      servers,
    })
  }
  return {
    profile: {
      path: deps.store.profilePath,
      ...(read.error === undefined ? {} : { error: read.error }),
      servers: profileServers,
    },
    workspaces,
    oauthAvailable: deps.oauth !== undefined && deps.credentials !== undefined,
  }
}

async function detail(deps: RpcDeps, payload: unknown): Promise<ServerDef> {
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const name = requireString(fields, 'name')
  const file = await readFile(deps, target)
  const server = findServer(file, name)
  if (server === undefined) throw new BadRequest(`no server named ${name} in this scope`)
  return server
}

async function saveServer(deps: RpcDeps, payload: unknown): Promise<{ ok: true }> {
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const parsed = validateServer(fields.server)
  if (!parsed.ok) throw new BadRequest(parsed.error)
  const previousName = optionalString(fields, 'previousName')
  const file = await readFile(deps, target)
  const existing = findServer(file, parsed.server.name)
  if (existing !== undefined && parsed.server.name !== previousName) {
    throw new BadRequest(`a server named ${parsed.server.name} already exists in this scope`)
  }
  await writeFile(deps, target, withServer(file, parsed.server, previousName))
  await reconcile(deps, target)
  return { ok: true }
}

async function deleteServer(deps: RpcDeps, payload: unknown): Promise<{ ok: true }> {
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const name = requireString(fields, 'name')
  const file = await readFile(deps, target)
  if (findServer(file, name) === undefined) throw new BadRequest(`no server named ${name} in this scope`)
  await writeFile(deps, target, withoutServer(file, name))
  await reconcile(deps, target)
  return { ok: true }
}

async function setEnabled(deps: RpcDeps, payload: unknown): Promise<{ ok: true }> {
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const name = requireString(fields, 'name')
  const enabled = fields.enabled
  if (typeof enabled !== 'boolean') throw new BadRequest('payload.enabled must be a boolean')
  const file = await readFile(deps, target)
  const server = findServer(file, name)
  if (server === undefined) throw new BadRequest(`no server named ${name} in this scope`)
  await writeFile(deps, target, withServer(file, { ...server, disabled: !enabled }))
  await reconcile(deps, target)
  return { ok: true }
}

async function setWorkspaceDisabled(deps: RpcDeps, payload: unknown): Promise<{ ok: true }> {
  const fields = requireRecord(payload)
  const workspaceId = requireString(fields, 'workspaceId')
  const name = requireString(fields, 'name')
  const disabled = fields.disabled
  if (typeof disabled !== 'boolean') throw new BadRequest('payload.disabled must be a boolean')
  const workspace = deps.workspaces?.list().find((entry) => entry.id === workspaceId)
  if (workspace === undefined) throw new BadRequest('unknown workspace')
  const read = await deps.store.readWorkspace(workspace.path)
  const current = new Set(read.file.disableProfileServers ?? [])
  if (disabled) current.add(name)
  else current.delete(name)
  await deps.store.writeWorkspace(workspace.path, {
    ...read.file,
    disableProfileServers: [...current],
  })
  await deps.reattachWorkspace(workspace.path)
  return { ok: true }
}

async function setToolPolicy(deps: RpcDeps, payload: unknown): Promise<{ ok: true }> {
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const name = requireString(fields, 'name')
  const allow = fields.allow
  const deny = fields.deny
  if (!Array.isArray(allow) || !allow.every((entry): entry is string => typeof entry === 'string')) {
    throw new BadRequest('payload.allow must be a string array')
  }
  if (!Array.isArray(deny) || !deny.every((entry): entry is string => typeof entry === 'string')) {
    throw new BadRequest('payload.deny must be a string array')
  }
  const file = await readFile(deps, target)
  const server = findServer(file, name)
  if (server === undefined) throw new BadRequest(`no server named ${name} in this scope`)
  const policy = { ...(allow.length === 0 ? {} : { allow }), ...(deny.length === 0 ? {} : { deny }) }
  await writeFile(deps, target, withServer(file, { ...server, toolPolicy: policy }))
  await reconcile(deps, target)
  return { ok: true }
}

function scopeIdOf(deps: RpcDeps, target: Target, name: string): string {
  return deps.manager.scopeIdFor(target.scope, target.directory, name)
}

async function setToken(deps: RpcDeps, payload: unknown): Promise<{ configured: true }> {
  if (deps.credentials === undefined) throw new BadRequest('the credentials service is unavailable')
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const name = requireString(fields, 'name')
  const value = requireString(fields, 'value')
  const file = await readFile(deps, target)
  const server = findServer(file, name)
  if (server === undefined) throw new BadRequest(`no server named ${name} in this scope`)
  if (server.auth.kind !== 'bearer') throw new BadRequest('tokens can only be stored for bearer servers')
  const scopeId = scopeIdOf(deps, target, name)
  await saveApiKey(deps.credentials, scopeId, value.trim())
  deps.manager.reconnectScope(scopeId)
  return { configured: true }
}

async function clearToken(deps: RpcDeps, payload: unknown): Promise<{ configured: false }> {
  if (deps.credentials === undefined) throw new BadRequest('the credentials service is unavailable')
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const name = requireString(fields, 'name')
  const scopeId = scopeIdOf(deps, target, name)
  await clearApiKey(deps.credentials, scopeId)
  deps.manager.reconnectScope(scopeId)
  return { configured: false }
}

async function startOAuth(deps: RpcDeps, payload: unknown): Promise<{ authorizationUrl?: string; attemptId?: string; authorized?: true }> {
  if (deps.oauth === undefined) throw new BadRequest('OAuth is unavailable in this profile')
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const name = requireString(fields, 'name')
  const file = await readFile(deps, target)
  const server = findServer(file, name)
  if (server === undefined) throw new BadRequest(`no server named ${name} in this scope`)
  if (server.auth.kind !== 'oauth') throw new BadRequest('this server does not use OAuth')
  const scopeId = scopeIdOf(deps, target, name)
  const started = await deps.oauth.start(server, scopeId)
  if ('authorized' in started) {
    deps.manager.reconnectScope(scopeId)
    return { authorized: true }
  }
  return { authorizationUrl: started.url, attemptId: started.attemptId }
}

async function submitOAuthRedirect(deps: RpcDeps, payload: unknown): Promise<{ ok: true }> {
  if (deps.oauth === undefined) throw new BadRequest('OAuth is unavailable in this profile')
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const name = requireString(fields, 'name')
  const attemptId = requireString(fields, 'attemptId')
  const redirectUrl = requireString(fields, 'redirectUrl')
  await deps.oauth.complete(attemptId, redirectUrl)
  deps.manager.reconnectScope(scopeIdOf(deps, target, name))
  return { ok: true }
}

async function cancelOAuth(deps: RpcDeps, payload: unknown): Promise<{ ok: true }> {
  if (deps.oauth === undefined) throw new BadRequest('OAuth is unavailable in this profile')
  const fields = requireRecord(payload)
  const attemptId = requireString(fields, 'attemptId')
  deps.oauth.cancel(attemptId)
  return { ok: true }
}

async function logout(deps: RpcDeps, payload: unknown): Promise<{ ok: true }> {
  if (deps.oauth === undefined) throw new BadRequest('OAuth is unavailable in this profile')
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const name = requireString(fields, 'name')
  const scopeId = scopeIdOf(deps, target, name)
  await deps.oauth.logout(scopeId)
  deps.manager.disconnectScope(scopeId)
  return { ok: true }
}

async function reconnectServer(deps: RpcDeps, payload: unknown): Promise<{ ok: true }> {
  const fields = requireRecord(payload)
  const target = targetOf(deps, fields)
  const name = requireString(fields, 'name')
  deps.manager.reconnectScope(scopeIdOf(deps, target, name))
  return { ok: true }
}

async function dispatch(deps: RpcDeps, endpoint: RpcEndpoint, payload: unknown): Promise<unknown> {
  switch (endpoint) {
    case 'overview':
      return overview(deps)
    case 'reconnect':
      deps.manager.reconnectAll()
      return { ok: true }
    case 'reconnectServer':
      return reconnectServer(deps, payload)
    case 'detail':
      return detail(deps, payload)
    case 'saveServer':
      return saveServer(deps, payload)
    case 'deleteServer':
      return deleteServer(deps, payload)
    case 'setEnabled':
      return setEnabled(deps, payload)
    case 'setWorkspaceDisabled':
      return setWorkspaceDisabled(deps, payload)
    case 'setToolPolicy':
      return setToolPolicy(deps, payload)
    case 'setToken':
      return setToken(deps, payload)
    case 'clearToken':
      return clearToken(deps, payload)
    case 'startOAuth':
      return startOAuth(deps, payload)
    case 'submitOAuthRedirect':
      return submitOAuthRedirect(deps, payload)
    case 'cancelOAuth':
      return cancelOAuth(deps, payload)
    case 'logout':
      return logout(deps, payload)
    default: {
      const unreachable: never = endpoint
      throw new Error(`unknown endpoint ${String(unreachable)}`)
    }
  }
}

function routeFor(
  method: string,
  endpoint: RpcEndpoint,
  handler: (endpoint: RpcEndpoint, payload: unknown) => Promise<unknown>,
): ConnectionFetchRoute {
  return {
    path: `/api/${method}`,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request: Request): Promise<Response> {
      const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
      if (contentType !== 'application/json') return new Response('content type must be application/json', { status: 415 })
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return new Response('body is not JSON', { status: 400 })
      }
      const envelope = readEnvelope(body)
      if (envelope === undefined) return fail('invalid-request', 'bad-request', 'invalid client-request envelope')
      if (envelope.method !== method) {
        return fail(envelope.rpcId, 'bad-request', `method does not match endpoint ${method}`)
      }
      try {
        return succeed(envelope.rpcId, await handler(endpoint, envelope.payload))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return fail(envelope.rpcId, error instanceof BadRequest ? 'bad-request' : 'internal', message)
      }
    },
  }
}

/** Register every endpoint under the shared authenticated `/api` channel. */
export function registerRpc(ctx: HostContext, deps: RpcDeps): void {
  ctx.inject(['connection'], (scope) => {
    const connection = scope.get('connection')
    if (!isConnectionService(connection)) return
    const handler = (endpoint: RpcEndpoint, payload: unknown): Promise<unknown> => dispatch(deps, endpoint, payload)
    for (const endpoint of ENDPOINTS) {
      const method = `${RPC_PREFIX}.${endpoint}`
      scope.effect(
        () => connection.fetch.register(routeFor(method, endpoint, handler)),
        `dsh-mcp-scopes: /api/${method}`,
      )
    }
  })
}

