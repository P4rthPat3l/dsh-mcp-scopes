/** Validation, wildcard matching, config parsing, and serialization. */

import type { AuthConfig, ProfileFile, ServerDef, ServerTimeouts, ToolPolicy, TransportKind, WorkspaceFile } from './types.js'

/** Server-name contract; also the namespace used in tool names. */
export const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** Cap on server instructions, in UTF-8 bytes including attribution. */
export const MAX_INSTRUCTION_BYTES = 32_768

/** Per-call timeout default. */
export const DEFAULT_CALL_TIMEOUT_MS = 60_000

/** Connect and discovery timeout default. */
export const DEFAULT_CONNECT_TIMEOUT_MS = 15_000

/** Workspace connect budget before the first step runs. */
export const FIRST_STEP_BUDGET_MS = 3_000

/** Activity lines kept per server. */
export const LOG_LIMIT = 50

export type ParseResult<T> =
  | { readonly ok: true; readonly file: T }
  | { readonly ok: false; readonly error: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined | false {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return false
  return value
}

function optionalNumber(value: unknown): number | undefined | false {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return false
  return value
}

function stringRecord(value: unknown): Record<string, string> | false {
  if (value === undefined) return {}
  if (!isRecord(value)) return false
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') return false
    out[key] = entry
  }
  return out
}

function stringArray(value: unknown): readonly string[] | false {
  if (value === undefined) return []
  if (!Array.isArray(value)) return false
  if (!value.every((entry): entry is string => typeof entry === 'string')) return false
  return value
}

function parseAuth(value: unknown): AuthConfig | { error: string } {
  if (!isRecord(value)) return { error: 'auth must be an object' }
  const kind = value.kind
  if (kind === 'none') return { kind: 'none' }
  if (kind === 'bearer') {
    const credential = optionalString(value.credential)
    if (credential === false) return { error: 'auth.credential must be a string' }
    if (credential !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(credential) && credential.length > 64) {
      return { error: 'auth.credential must be an environment-style name or a short record name' }
    }
    return credential === undefined ? { kind: 'bearer' } : { kind: 'bearer', credential }
  }
  if (kind === 'oauth') {
    const scopes = stringArray(value.scopes)
    if (scopes === false) return { error: 'auth.scopes must be a string array' }
    const clientId = optionalString(value.clientId)
    if (clientId === false) return { error: 'auth.clientId must be a string' }
    const clientSecret = optionalString(value.clientSecret)
    if (clientSecret === false) return { error: 'auth.clientSecret must be a string' }
    return {
      kind: 'oauth',
      ...(scopes.length > 0 ? { scopes } : {}),
      ...(clientId === undefined ? {} : { clientId }),
      ...(clientSecret === undefined ? {} : { clientSecret }),
    }
  }
  return { error: 'auth.kind must be none, bearer, or oauth' }
}

function parsePolicy(value: unknown): ToolPolicy | { error: string } {
  if (value === undefined) return {}
  if (!isRecord(value)) return { error: 'toolPolicy must be an object' }
  const allow = stringArray(value.allow)
  if (allow === false) return { error: 'toolPolicy.allow must be a string array' }
  const deny = stringArray(value.deny)
  if (deny === false) return { error: 'toolPolicy.deny must be a string array' }
  return {
    ...(allow.length > 0 ? { allow } : {}),
    ...(deny.length > 0 ? { deny } : {}),
  }
}

/** Validate one server entry in the internal shape. */
export function validateServer(value: unknown): { ok: true; server: ServerDef } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: 'server must be an object' }
  const name = value.name
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    return { ok: false, error: 'server.name must match [A-Za-z0-9_-]{1,32}' }
  }
  const transport = value.transport
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    return { ok: false, error: 'server.transport must be stdio or streamable-http' }
  }
  const auth = parseAuth(value.auth ?? { kind: 'none' })
  if ('error' in auth) return { ok: false, error: `server.auth: ${auth.error}` }
  let disabled: boolean | undefined
  if (value.disabled !== undefined) {
    if (typeof value.disabled !== 'boolean') return { ok: false, error: 'server.disabled must be a boolean' }
    disabled = value.disabled
  }
  const policy = parsePolicy(value.toolPolicy)
  if ('error' in policy) return { ok: false, error: `server.toolPolicy: ${policy.error}` }
  const timeouts = value.timeouts
  let connectMs: number | undefined
  let callMs: number | undefined
  if (timeouts !== undefined) {
    if (!isRecord(timeouts)) return { ok: false, error: 'server.timeouts must be an object' }
    const parsedConnect = optionalNumber(timeouts.connectMs)
    if (parsedConnect === false) return { ok: false, error: 'server.timeouts.connectMs must be a positive number' }
    const parsedCall = optionalNumber(timeouts.callMs)
    if (parsedCall === false) return { ok: false, error: 'server.timeouts.callMs must be a positive number' }
    connectMs = parsedConnect
    callMs = parsedCall
  }
  const common = {
    name,
    transport: transport as TransportKind,
    auth,
    disabled: disabled ?? false,
    toolPolicy: policy,
    ...(connectMs === undefined && callMs === undefined
      ? {}
      : {
          timeouts: {
            ...(connectMs === undefined ? {} : { connectMs }),
            ...(callMs === undefined ? {} : { callMs }),
          },
        }),
  }

  if (transport === 'stdio') {
    const command = value.command
    if (typeof command !== 'string' || command.trim() === '') {
      return { ok: false, error: 'server.command is required for stdio' }
    }
    const args = stringArray(value.args)
    if (args === false) return { ok: false, error: 'server.args must be a string array' }
    const env = stringRecord(value.env)
    if (env === false) return { ok: false, error: 'server.env must be a string record' }
    const cwd = optionalString(value.cwd)
    if (cwd === false) return { ok: false, error: 'server.cwd must be a string' }
    return {
      ok: true,
      server: {
        ...common,
        command,
        ...(args.length > 0 ? { args } : {}),
        ...(Object.keys(env).length > 0 ? { env } : {}),
        ...(cwd === undefined ? {} : { cwd }),
      },
    }
  }

  const url = value.url
  if (typeof url !== 'string' || url.trim() === '') {
    return { ok: false, error: 'server.url is required for streamable-http' }
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return { ok: false, error: 'server.url must be a valid URL' }
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, error: 'server.url must use http or https' }
  }
  const headers = stringRecord(value.headers)
  if (headers === false) return { ok: false, error: 'server.headers must be a string record' }
  return {
    ok: true,
    server: {
      ...common,
      url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    },
  }
}

/* ---------- Reading the config document ---------- */

const MCP_RESERVED = new Set(['servers', 'timeout', '$schema'])

interface DetectedDocument {
  readonly entries: readonly { readonly name: string; readonly entry: unknown }[]
}

function detectDocument(value: Record<string, unknown>): DetectedDocument | { readonly error: string } {
  if (isRecord(value.mcpServers)) {
    return { entries: Object.entries(value.mcpServers).map(([name, entry]) => ({ name, entry })) }
  }
  if (isRecord(value.mcp)) {
    const mcp = value.mcp
    if (isRecord(mcp.servers)) {
      return { entries: Object.entries(mcp.servers).map(([name, entry]) => ({ name, entry })) }
    }
    return {
      entries: Object.entries(mcp)
        .filter(([key]) => !MCP_RESERVED.has(key))
        .map(([name, entry]) => ({ name, entry })),
    }
  }
  if (Array.isArray(value.servers)) {
    return { error: 'servers must be an object keyed by server name' }
  }
  if (isRecord(value.servers)) {
    return { entries: Object.entries(value.servers).map(([name, entry]) => ({ name, entry })) }
  }
  return { error: 'expected an mcpServers, mcp.servers, mcp, or servers block' }
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value
  }
  return undefined
}

/** The environment name behind ${NAME}, ${NAME:-default}, or {env:NAME}. */
function envReference(value: string): string | undefined {
  const trimmed = value.trim()
  const bearer = /^Bearer\s+(.+)$/i.exec(trimmed)
  const token = bearer === null ? trimmed : (bearer[1] ?? '').trim()
  const patterns = [
    /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}$/,
    /^\{env:([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}$/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(token)
    if (match !== null) return match[1]
  }
  return undefined
}

function defaultTokenRef(name: string): string {
  const upper = name
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  return `DSH_MCP_${upper}_TOKEN`
}

function normalizeEntry(
  name: string,
  entry: unknown,
  dsh: Record<string, unknown>,
): { ok: true; server: ServerDef } | { ok: false; error: string } {
  if (!isRecord(entry)) return { ok: false, error: `server "${name}" must be an object` }

  const type = entry.type
  let transport: TransportKind | undefined
  if (typeof type === 'string') {
    const lower = type.toLowerCase()
    if (lower === 'local' || lower === 'stdio') transport = 'stdio'
    else if (lower === 'remote' || lower === 'http' || lower === 'streamable-http' || lower === 'streamable_http') {
      transport = 'streamable-http'
    } else if (lower === 'sse') {
      return { ok: false, error: `server "${name}" uses the sse transport, which this plugin does not support` }
    } else {
      return { ok: false, error: `server "${name}" has unknown type "${type}"` }
    }
  } else if (entry.command !== undefined) {
    transport = 'stdio'
  } else if (entry.url !== undefined) {
    transport = 'streamable-http'
  }
  if (transport === undefined) return { ok: false, error: `server "${name}" needs a command or a url` }

  const envRaw = entry.environment !== undefined ? entry.environment : entry.env
  const env = stringRecord(envRaw)
  if (env === false) return { ok: false, error: `server "${name}" has a non-string environment value` }
  const headers = stringRecord(entry.headers)
  if (headers === false) return { ok: false, error: `server "${name}" has a non-string header value` }
  const cwd = optionalString(entry.cwd)
  if (cwd === false) return { ok: false, error: `server "${name}".cwd must be a string` }

  let disabled = false
  if (entry.disabled !== undefined) {
    if (typeof entry.disabled !== 'boolean') return { ok: false, error: `server "${name}".disabled must be a boolean` }
    disabled = entry.disabled
  }
  if (entry.enabled !== undefined) {
    if (typeof entry.enabled !== 'boolean') return { ok: false, error: `server "${name}".enabled must be a boolean` }
    if (entry.enabled === false) disabled = true
  }

  const override = isRecord(dsh.auth) ? dsh.auth[name] : undefined
  let auth: AuthConfig
  if (override !== undefined) {
    const parsed = parseAuth(override)
    if ('error' in parsed) return { ok: false, error: `server "${name}".auth: ${parsed.error}` }
    auth = parsed
  } else {
    const authorization = headerValue(headers, 'authorization')
    if (authorization !== undefined && authorization.trim() !== '') {
      const reference = envReference(authorization)
      auth = reference === undefined ? { kind: 'bearer' } : { kind: 'bearer', credential: reference }
    } else if (entry.oauth === false) {
      auth = { kind: 'none' }
    } else if (isRecord(entry.oauth)) {
      const scopes = stringArray(entry.oauth.scopes)
      const clientId = optionalString(entry.oauth.client_id ?? entry.oauth.clientId)
      const clientSecret = optionalString(entry.oauth.client_secret ?? entry.oauth.clientSecret)
      auth = {
        kind: 'oauth',
        ...(scopes === false || scopes.length === 0 ? {} : { scopes }),
        ...(typeof clientId === 'string' && clientId !== '' ? { clientId } : {}),
        ...(typeof clientSecret === 'string' && clientSecret !== '' ? { clientSecret } : {}),
      }
    } else if (transport === 'streamable-http') {
      auth = { kind: 'oauth' }
    } else {
      auth = { kind: 'none' }
    }
  }

  // A bearer or OAuth reference is resolved at connect time, so an Authorization
  // header in the file would duplicate it. Drop it when auth is declared explicitly.
  if (auth.kind !== 'none' && override !== undefined) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'authorization') delete headers[key]
    }
  }

  const policy = parsePolicy(isRecord(dsh.toolPolicy) ? dsh.toolPolicy[name] : undefined)
  if ('error' in policy) return { ok: false, error: `server "${name}".toolPolicy: ${policy.error}` }

  const timeoutsRaw = isRecord(dsh.timeouts) ? dsh.timeouts[name] : undefined
  let timeouts: ServerTimeouts | undefined
  if (timeoutsRaw !== undefined) {
    if (!isRecord(timeoutsRaw)) return { ok: false, error: `server "${name}".timeouts must be an object` }
    const connectMs = optionalNumber(timeoutsRaw.connectMs)
    if (connectMs === false) return { ok: false, error: `server "${name}".timeouts.connectMs must be a positive number` }
    const callMs = optionalNumber(timeoutsRaw.callMs)
    if (callMs === false) return { ok: false, error: `server "${name}".timeouts.callMs must be a positive number` }
    timeouts = {
      ...(connectMs === undefined ? {} : { connectMs }),
      ...(callMs === undefined ? {} : { callMs }),
    }
  }

  const common = {
    name,
    transport,
    auth,
    disabled,
    toolPolicy: policy,
    ...(timeouts === undefined ? {} : { timeouts }),
  }

  if (transport === 'stdio') {
    let command: string | undefined
    let args: string[] = []
    if (Array.isArray(entry.command)) {
      if (entry.command.length === 0 || !entry.command.every((part): part is string => typeof part === 'string')) {
        return { ok: false, error: `server "${name}".command must be a non-empty string array` }
      }
      command = entry.command[0]
      args = entry.command.slice(1)
    } else if (typeof entry.command === 'string') {
      if (entry.command.trim() === '') return { ok: false, error: `server "${name}".command must not be empty` }
      command = entry.command
      const parsedArgs = stringArray(entry.args)
      if (parsedArgs === false) return { ok: false, error: `server "${name}".args must be a string array` }
      args = [...parsedArgs]
    }
    if (command === undefined) return { ok: false, error: `server "${name}" is a local server without a command` }
    return {
      ok: true,
      server: {
        ...common,
        command,
        ...(args.length > 0 ? { args } : {}),
        ...(Object.keys(env).length > 0 ? { env } : {}),
        ...(cwd === undefined ? {} : { cwd }),
      },
    }
  }

  const url = entry.url
  if (typeof url !== 'string' || url.trim() === '') {
    return { ok: false, error: `server "${name}" is a remote server without a url` }
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return { ok: false, error: `server "${name}".url must be a valid URL` }
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, error: `server "${name}".url must use http or https` }
  }
  return {
    ok: true,
    server: {
      ...common,
      url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    },
  }
}

interface ParsedServers {
  readonly servers: readonly ServerDef[]
}

function parseServers(value: Record<string, unknown>): ParsedServers | { readonly error: string } {
  const detected = detectDocument(value)
  if ('error' in detected) return { error: detected.error }
  const dsh = isRecord(value.dsh) ? value.dsh : {}
  const servers: ServerDef[] = []
  for (const item of detected.entries) {
    if (!NAME_PATTERN.test(item.name)) {
      return { error: `server name "${item.name}" must match [A-Za-z0-9_-]{1,32}` }
    }
    const normalized = normalizeEntry(item.name, item.entry, dsh)
    if (!normalized.ok) return { error: normalized.error }
    servers.push(normalized.server)
  }
  return { servers }
}

function parseJsonObject(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'file is not valid JSON' }
  }
  if (!isRecord(parsed)) return { ok: false, error: 'file must contain an object' }
  return { ok: true, value: parsed }
}

/** Parse one profile document in any supported shape. */
export function parseProfile(text: string): ParseResult<ProfileFile> {
  const value = parseJsonObject(text)
  if (!value.ok) return value
  const parsed = parseServers(value.value)
  if ('error' in parsed) return { ok: false, error: parsed.error }
  return { ok: true, file: { version: 1, servers: parsed.servers } }
}

/** Parse one workspace document in any supported shape. */
export function parseWorkspace(text: string): ParseResult<WorkspaceFile> {
  const value = parseJsonObject(text)
  if (!value.ok) return value
  const parsed = parseServers(value.value)
  if ('error' in parsed) return { ok: false, error: parsed.error }
  const dsh = isRecord(value.value.dsh) ? value.value.dsh : {}
  const disabledRaw = dsh.disableProfileServers !== undefined
    ? dsh.disableProfileServers
    : value.value.disableProfileServers
  const disabled = stringArray(disabledRaw)
  if (disabled === false) return { ok: false, error: 'disableProfileServers must be a string array' }
  return {
    ok: true,
    file: {
      version: 1,
      servers: parsed.servers,
      ...(disabled.length > 0 ? { disableProfileServers: disabled } : {}),
    },
  }
}

/* ---------- Writing the config document ---------- */

function serializeEntry(server: ServerDef): Record<string, unknown> {
  if (server.transport === 'stdio') {
    return {
      ...(server.command === undefined ? {} : { command: server.command }),
      ...(server.args === undefined || server.args.length === 0 ? {} : { args: [...server.args] }),
      ...(server.env === undefined || Object.keys(server.env).length === 0 ? {} : { env: { ...server.env } }),
      ...(server.cwd === undefined ? {} : { cwd: server.cwd }),
      ...(server.disabled === true ? { disabled: true } : {}),
    }
  }
  const headers: Record<string, string> = { ...server.headers }
  if (server.auth.kind === 'bearer' && headerValue(headers, 'authorization') === undefined) {
    headers.Authorization = `Bearer \${${server.auth.credential ?? defaultTokenRef(server.name)}}`
  }
  return {
    type: 'http',
    ...(server.url === undefined ? {} : { url: server.url }),
    ...(Object.keys(headers).length === 0 ? {} : { headers }),
    ...(server.disabled === true ? { disabled: true } : {}),
  }
}

function serializeAuthOverride(server: ServerDef): Record<string, unknown> | undefined {
  if (server.transport === 'stdio') return undefined
  if (server.auth.kind === 'none') return { kind: 'none' }
  if (server.auth.kind === 'bearer') {
    return server.auth.credential === undefined ? undefined : { kind: 'bearer', credential: server.auth.credential }
  }
  const scopes = server.auth.scopes ?? []
  const { clientId, clientSecret } = server.auth
  if (scopes.length === 0 && clientId === undefined && clientSecret === undefined) return undefined
  return {
    kind: 'oauth',
    ...(scopes.length === 0 ? {} : { scopes: [...scopes] }),
    ...(clientId === undefined ? {} : { clientId }),
    ...(clientSecret === undefined ? {} : { clientSecret }),
  }
}

function serializeDocument(file: ProfileFile | WorkspaceFile, workspace: boolean): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {}
  const auth: Record<string, unknown> = {}
  const toolPolicy: Record<string, unknown> = {}
  const timeouts: Record<string, unknown> = {}

  for (const server of file.servers) {
    mcpServers[server.name] = serializeEntry(server)
    const override = serializeAuthOverride(server)
    if (override !== undefined) auth[server.name] = override
    const allow = server.toolPolicy?.allow ?? []
    const deny = server.toolPolicy?.deny ?? []
    if (allow.length > 0 || deny.length > 0) {
      toolPolicy[server.name] = {
        ...(allow.length === 0 ? {} : { allow: [...allow] }),
        ...(deny.length === 0 ? {} : { deny: [...deny] }),
      }
    }
    const connectMs = server.timeouts?.connectMs
    const callMs = server.timeouts?.callMs
    if (connectMs !== undefined || callMs !== undefined) {
      timeouts[server.name] = {
        ...(connectMs === undefined ? {} : { connectMs }),
        ...(callMs === undefined ? {} : { callMs }),
      }
    }
  }

  const dsh: Record<string, unknown> = {}
  if (Object.keys(auth).length > 0) dsh.auth = auth
  if (Object.keys(toolPolicy).length > 0) dsh.toolPolicy = toolPolicy
  if (Object.keys(timeouts).length > 0) dsh.timeouts = timeouts
  if (workspace && 'disableProfileServers' in file) {
    const disabled = file.disableProfileServers ?? []
    if (disabled.length > 0) dsh.disableProfileServers = [...disabled]
  }

  return {
    mcpServers,
    ...(Object.keys(dsh).length === 0 ? {} : { dsh }),
  }
}

/** Serialize a profile file in the canonical mcpServers shape. */
export function serializeProfile(file: ProfileFile): Record<string, unknown> {
  return serializeDocument(file, false)
}

/** Serialize a workspace file in the canonical mcpServers shape. */
export function serializeWorkspace(file: WorkspaceFile): Record<string, unknown> {
  return serializeDocument(file, true)
}

/** Match a wildcard pattern such as `get*` against one tool name. */
export function matchesPattern(pattern: string, name: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return pattern === name
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}$`).test(name)
}

/** Whether a tool passes the server policy. */
export function toolAllowed(policy: ToolPolicy | undefined, name: string): boolean {
  if (policy === undefined) return true
  const allow = policy.allow ?? []
  const deny = policy.deny ?? []
  if (deny.some((pattern) => matchesPattern(pattern, name))) return false
  if (allow.length === 0) return true
  return allow.some((pattern) => matchesPattern(pattern, name))
}
