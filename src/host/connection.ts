/** Connection lifecycle: transports, discovery, status, tools, and owners. */

import { createHash } from 'node:crypto'
import manifest from '../../package.json' with { type: 'json' }
import { Client, UnauthorizedError } from '@modelcontextprotocol/client'
import type { CallToolResult, OAuthClientProvider, Prompt, Resource, Tool, Transport } from '@modelcontextprotocol/client'
import { resolveBearer } from './credentials.js'
import { buildToolDefinition } from './naming.js'
import { buildBridgeTools, type BridgeScope } from './bridge.js'
import { buildCatalog, catalogToolOf, type CatalogServer } from './catalog.js'
import { createTransport } from './transport.js'
import {
  DEFAULT_CALL_TIMEOUT_MS,
  DEFAULT_CONNECT_TIMEOUT_MS,
  FIRST_STEP_BUDGET_MS,
  LOG_LIMIT,
  MAX_INSTRUCTION_BYTES,
  toolAllowed,
} from './schema.js'
import type {
  ConnectionStatus,
  CredentialsService,
  HostContext,
  LogLine,
  ScopeKind,
  ServerDef,
  ServerView,
  ToolDefinition,
} from './types.js'
import type { EffectiveServer } from './scope.js'
import type { OAuthEngine } from './oauth.js'

interface Owner {
  readonly label: string
  readonly ctx: HostContext
  disposers: (() => void)[]
}

export interface Entry {
  readonly key: string
  readonly scope: ScopeKind
  readonly workspaceDir?: string
  readonly scopeId: string
  def: ServerDef
  status: ConnectionStatus
  error?: string
  rawTools: Tool[]
  rawResources: Resource[]
  rawPrompts: Prompt[]
  definitions: ToolDefinition[]
  instructions: string
  logs: LogLine[]
  client?: Client
  transport?: Transport
  readonly owners: Map<string, Owner>
  retries: number
  timer?: ReturnType<typeof setTimeout>
  connecting?: Promise<void>
  oauthUrl?: string
  oauthAttemptId?: string
}

function hashPath(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 12)
}

async function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout()
          reject(new Error(`timed out after ${ms} ms`))
        }, ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export class ConnectionManager {
  private readonly entries = new Map<string, Entry>()
  private readonly agentEntries = new Map<string, Entry[]>()
  private readonly bridges = new Map<string, () => void>()

  constructor(
    private readonly ctx: HostContext,
    private readonly credentials: CredentialsService | undefined,
    private readonly oauth?: OAuthEngine,
  ) {}

  private key(scope: ScopeKind, workspaceDir: string | undefined, name: string): string {
    return `${scope}|${workspaceDir ?? ''}|${name}`
  }

  scopeIdFor(scope: ScopeKind, workspaceDir: string | undefined, name: string): string {
    return scope === 'profile' ? `profile:${name}` : `workspace:${hashPath(workspaceDir ?? '')}:${name}`
  }

  private ensureEntry(scope: ScopeKind, workspaceDir: string | undefined, def: ServerDef): Entry {
    const key = this.key(scope, workspaceDir, def.name)
    const existing = this.entries.get(key)
    if (existing !== undefined) {
      if (JSON.stringify(existing.def) !== JSON.stringify(def)) this.reconfigure(existing, def)
      return existing
    }
    const entry: Entry = {
      key,
      scope,
      ...(workspaceDir === undefined ? {} : { workspaceDir }),
      scopeId: this.scopeIdFor(scope, workspaceDir, def.name),
      def,
      status: def.disabled === true ? 'disabled' : 'idle',
      rawTools: [],
      rawResources: [],
      rawPrompts: [],
      definitions: [],
      instructions: '',
      logs: [],
      owners: new Map(),
      retries: 0,
    }
    this.entries.set(key, entry)
    return entry
  }

  private reconfigure(entry: Entry, def: ServerDef): void {
    this.closeEntry(entry)
    entry.def = def
    entry.status = def.disabled === true ? 'disabled' : 'idle'
    entry.error = undefined
    entry.retries = 0
    if (def.disabled !== true) void this.connect(entry)
  }

  /** Create or refresh profile entries and warm their connections. */
  setProfile(defs: readonly ServerDef[]): void {
    const names = new Set(defs.map((def) => def.name))
    for (const entry of [...this.entries.values()]) {
      if (entry.scope === 'profile' && !names.has(entry.def.name)) this.remove(entry)
    }
    for (const def of defs) {
      const entry = this.ensureEntry('profile', undefined, def)
      if (def.disabled === true) {
        this.setStatus(entry, 'disabled')
        continue
      }
      void this.connect(entry)
    }
  }

  /** Attach one Agent to every effective server, bounded by the first-step budget. */
  async attachAgent(
    agent: { readonly id: string; readonly ctx: HostContext },
    workspaceDir: string,
    servers: readonly EffectiveServer[],
  ): Promise<void> {
    const deadline = Date.now() + FIRST_STEP_BUDGET_MS
    const work: Promise<void>[] = []
    const attached: Entry[] = []
    for (const item of servers) {
      const entry = this.ensureEntry(item.scope, item.scope === 'workspace' ? workspaceDir : undefined, item.def)
      attached.push(entry)
      this.addOwner(entry, `agent:${agent.id}`, agent.ctx)
      if (item.def.disabled !== true) work.push(this.connect(entry))
    }
    this.agentEntries.set(agent.id, attached)
    this.registerBridge(agent.id, agent.ctx)
    await Promise.race([Promise.all(work), delay(Math.max(0, deadline - Date.now()))])
  }

  detachAgent(agentId: string): void {
    this.disposeBridge(agentId)
    this.agentEntries.delete(agentId)
    const label = `agent:${agentId}`
    for (const entry of [...this.entries.values()]) {
      if (!entry.owners.has(label)) continue
      this.removeOwner(entry, label)
      if (entry.scope === 'workspace' && entry.owners.size === 0) this.remove(entry)
    }
  }

  private addOwner(entry: Entry, label: string, ctx: HostContext): void {
    if (entry.owners.has(label)) return
    const owner: Owner = { label, ctx, disposers: [] }
    entry.owners.set(label, owner)
    if (entry.status === 'ready') this.registerForOwner(entry, owner)
  }

  private removeOwner(entry: Entry, label: string): void {
    const owner = entry.owners.get(label)
    if (owner === undefined) return
    for (const dispose of owner.disposers) dispose()
    owner.disposers = []
    entry.owners.delete(label)
  }

  /** Register the search, describe, and call bridge when the Agent attached any catalog server. */
  private registerBridge(agentId: string, ctx: HostContext): void {
    this.disposeBridge(agentId)
    const attached = this.agentEntries.get(agentId) ?? []
    if (!attached.some((entry) => entry.def.exposure !== 'direct')) return
    const scope: BridgeScope = {
      entries: () => (this.agentEntries.get(agentId) ?? []).filter((entry) => entry.def.exposure !== 'direct'),
    }
    const disposers: (() => void)[] = []
    try {
      for (const definition of buildBridgeTools(scope)) disposers.push(ctx.tools.register(definition))
    } catch (error) {
      for (const dispose of disposers) dispose()
      ctx.logger.error(`mcp-manager: bridge tool registration failed: ${String(error)}`)
      return
    }
    this.bridges.set(agentId, () => {
      for (const dispose of disposers) dispose()
    })
  }

  private disposeBridge(agentId: string): void {
    const dispose = this.bridges.get(agentId)
    if (dispose === undefined) return
    dispose()
    this.bridges.delete(agentId)
  }

  private remove(entry: Entry): void {
    for (const owner of entry.owners.values()) {
      for (const dispose of owner.disposers) dispose()
      owner.disposers = []
    }
    entry.owners.clear()
    this.closeEntry(entry)
    this.entries.delete(entry.key)
  }

  private closeEntry(entry: Entry): void {
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer)
      entry.timer = undefined
    }
    const client = entry.client
    entry.client = undefined
    entry.transport = undefined
    if (client !== undefined) {
      void client.close().catch(() => undefined)
    }
    entry.rawTools = []
    entry.rawResources = []
    entry.rawPrompts = []
    entry.definitions = []
    entry.instructions = ''
  }

  private setStatus(entry: Entry, status: ConnectionStatus, error?: string): void {
    const changed = entry.status !== status || entry.error !== error
    entry.status = status
    entry.error = error
    if (changed) {
      const level = status === 'error' ? 'error' : status === 'needs_auth' || status === 'needs_token' ? 'warn' : 'info'
      this.log(entry, level, error === undefined ? `status ${status}` : `status ${status}: ${error}`)
    }
  }

  private log(entry: Entry, level: LogLine['level'], message: string): void {
    const line: LogLine = { time: new Date().toISOString(), level, message }
    entry.logs.push(line)
    if (entry.logs.length > LOG_LIMIT) entry.logs.splice(0, entry.logs.length - LOG_LIMIT)
    const tag = `mcp-manager(${entry.scope}:${entry.workspaceDir ?? 'profile'}:${entry.def.name})`
    if (level === 'error') this.ctx.logger.error(`${tag}: ${message}`)
    else if (level === 'warn') this.ctx.logger.warn(`${tag}: ${message}`)
    else this.ctx.logger.info(`${tag}: ${message}`)
  }

  private connect(entry: Entry): Promise<void> {
    if (entry.status === 'ready') return Promise.resolve()
    if (entry.connecting !== undefined) return entry.connecting
    entry.connecting = this.doConnect(entry).finally(() => {
      entry.connecting = undefined
    })
    return entry.connecting
  }

  private async doConnect(entry: Entry): Promise<void> {
    this.setStatus(entry, 'connecting')
    const def = entry.def
    let authProvider: OAuthClientProvider | undefined
    if (def.auth.kind === 'oauth') {
      if (this.oauth === undefined || !this.oauth.hasCredentials()) {
        this.setStatus(entry, 'needs_auth', 'The credentials service is unavailable, so OAuth cannot start.')
        return
      }
      try {
        const started = await this.oauth.start(def, entry.scopeId)
        if ('authorized' in started) {
          authProvider = started.provider
          entry.oauthUrl = undefined
          entry.oauthAttemptId = undefined
        } else {
          entry.oauthUrl = started.url
          entry.oauthAttemptId = started.attemptId
          this.setStatus(entry, 'needs_auth', 'Sign in to authorize this server.')
          return
        }
      } catch (error) {
        this.setStatus(entry, 'error', error instanceof Error ? error.message : String(error))
        return
      }
    }
    let bearer: string | undefined
    if (def.auth.kind === 'bearer') {
      bearer = await resolveBearer(this.credentials, def, entry.scopeId)
      if (bearer === undefined) {
        this.setStatus(entry, 'needs_token', 'No bearer token stored for this server.')
        return
      }
    }
    const headers: Record<string, string> = { ...def.headers }
    if (bearer !== undefined) headers.Authorization = `Bearer ${bearer}`

    let transport: Transport | undefined
    let client: Client | undefined
    try {
      transport = createTransport(def, headers, authProvider, entry.workspaceDir)
      client = new Client({ name: 'dsh-mcp-scopes', version: manifest.version })
      entry.client = client
      entry.transport = transport
      const connectMs = def.timeouts?.connectMs ?? DEFAULT_CONNECT_TIMEOUT_MS
      await withTimeout(client.connect(transport), connectMs, () => {
        void client?.close().catch(() => undefined)
      })

      const instructions = client.getInstructions() ?? ''
      // Catalog servers never put their instructions in the prompt, so only a
      // direct server can overflow the model context with them.
      if (def.exposure === 'direct' && Buffer.byteLength(instructions, 'utf8') > MAX_INSTRUCTION_BYTES) {
        throw new Error(`server instructions exceed ${MAX_INSTRUCTION_BYTES} bytes`)
      }

      const capabilities = client.getServerCapabilities()
      const rawTools: Tool[] =
        capabilities?.tools === undefined
          ? []
          : (await client.listTools(undefined, { cacheMode: 'refresh' })).tools
      let rawResources: Resource[] = []
      if (capabilities?.resources !== undefined) {
        try {
          rawResources = (await client.listResources()).resources
        } catch (error) {
          this.log(entry, 'warn', `resource discovery failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      let rawPrompts: Prompt[] = []
      if (capabilities?.prompts !== undefined) {
        try {
          rawPrompts = (await client.listPrompts()).prompts
        } catch (error) {
          this.log(entry, 'warn', `prompt discovery failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const timeoutMs = def.timeouts?.callMs ?? DEFAULT_CALL_TIMEOUT_MS
      const definitions: ToolDefinition[] = []
      const seen = new Set<string>()
      for (const raw of rawTools) {
        if (!toolAllowed(def.toolPolicy, raw.name)) continue
        const definition = this.definitionFor(entry, raw, timeoutMs)
        if (seen.has(definition.name)) throw new Error(`server listed tool ${raw.name} more than once`)
        seen.add(definition.name)
        definitions.push(definition)
      }

      for (const owner of entry.owners.values()) {
        for (const dispose of owner.disposers) dispose()
        owner.disposers = []
      }
      entry.rawTools = rawTools
      entry.rawResources = rawResources
      entry.rawPrompts = rawPrompts
      entry.definitions = definitions
      entry.instructions = instructions
      entry.retries = 0
      for (const owner of entry.owners.values()) this.registerForOwner(entry, owner)
      this.setStatus(entry, 'ready')
      this.log(entry, 'info', `connected with ${definitions.length} tool${definitions.length === 1 ? '' : 's'}`)
    } catch (error) {
      if (entry.client === client) {
        entry.client = undefined
        entry.transport = undefined
        if (client !== undefined) void client.close().catch(() => undefined)
      }
      entry.rawTools = []
      entry.rawResources = []
      entry.rawPrompts = []
      entry.definitions = []
      for (const owner of entry.owners.values()) {
        for (const dispose of owner.disposers) dispose()
        owner.disposers = []
      }
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof UnauthorizedError) {
        if (this.oauth !== undefined) {
          entry.oauthUrl = this.oauth.pendingUrl(entry.scopeId)
          entry.oauthAttemptId = undefined
        }
        this.setStatus(
          entry,
          def.auth.kind === 'bearer' ? 'needs_token' : 'needs_auth',
          'The server rejected the credential.',
        )
        return
      }
      this.setStatus(entry, 'error', message)
      this.scheduleRetry(entry)
    }
  }

  private definitionFor(entry: Entry, raw: Tool, timeoutMs: number): ToolDefinition {
    return buildToolDefinition(
      entry.def.name,
      raw,
      async (args, signal, callTimeout) => {
        const client = entry.client
        if (client === undefined) throw new Error(`server ${entry.def.name} is not connected`)
        const result: CallToolResult = await client.callTool(
          { name: raw.name, arguments: args },
          { signal, timeout: callTimeout, toolDefinition: raw },
        )
        return result
      },
      timeoutMs,
    )
  }

  private registerForOwner(entry: Entry, owner: Owner): void {
    if (entry.def.exposure !== 'direct') return
    const disposers: (() => void)[] = []
    try {
      for (const definition of entry.definitions) disposers.push(owner.ctx.tools.register(definition))
    } catch (error) {
      for (const dispose of disposers) dispose()
      owner.ctx.logger.error(`mcp-manager: tool registration failed for ${entry.def.name}: ${String(error)}`)
      return
    }
    owner.disposers = disposers
  }

  private scheduleRetry(entry: Entry): void {
    if (entry.def.disabled === true || entry.retries >= 10) return
    const backoff = Math.min(30_000, 500 * 2 ** entry.retries)
    entry.retries += 1
    if (entry.timer !== undefined) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = undefined
      void this.connect(entry)
    }, backoff)
  }

  reconnectScope(scopeId: string): void {
    for (const entry of this.entries.values()) {
      if (entry.scopeId !== scopeId) continue
      void this.connect(entry)
    }
  }

  disconnectScope(scopeId: string): void {
    for (const entry of this.entries.values()) {
      if (entry.scopeId !== scopeId) continue
      this.closeEntry(entry)
      this.setStatus(entry, entry.def.auth.kind === 'oauth' ? 'needs_auth' : 'idle')
    }
  }

  serverFor(scope: ScopeKind, workspaceDir: string | undefined, name: string): ServerDef | undefined {
    return this.find(scope, workspaceDir, name)?.def
  }

  reconnectAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.def.disabled === true) continue
      void this.connect(entry)
    }
  }

  view(entry: Entry): ServerView {
    return {
      name: entry.def.name,
      transport: entry.def.transport,
      target: entry.def.transport === 'stdio' ? (entry.def.command ?? '') : (entry.def.url ?? ''),
      authKind: entry.def.auth.kind,
      exposure: entry.def.exposure ?? 'catalog',
      disabled: entry.def.disabled === true,
      status: entry.status,
      ...(entry.oauthUrl === undefined ? {} : { oauthUrl: entry.oauthUrl }),
      ...(entry.oauthAttemptId === undefined ? {} : { oauthAttemptId: entry.oauthAttemptId }),
      toolCount: entry.definitions.length,
      tools: entry.definitions.map((definition) => definition.name),
      toolDetails: entry.rawTools
        .filter((tool) => toolAllowed(entry.def.toolPolicy, tool.name))
        .map((tool) => ({ name: tool.name, description: tool.description ?? '' })),
      resources: entry.rawResources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        ...(resource.mimeType === undefined ? {} : { mimeType: resource.mimeType }),
      })),
      prompts: entry.rawPrompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description ?? '',
        arguments: (prompt.arguments ?? []).map((argument) => argument.name),
      })),
      instructions: entry.instructions,
      ...(entry.error === undefined ? {} : { error: entry.error }),
      logs: [...entry.logs],
    }
  }

  find(scope: ScopeKind, workspaceDir: string | undefined, name: string): Entry | undefined {
    return this.entries.get(this.key(scope, workspaceDir, name))
  }

  /** Instructions for the servers one Agent actually attached to. */
  instructionsFor(agentId: string): string {
    const entries = this.agentEntries.get(agentId) ?? []
    const sections: string[] = []
    const catalogServers: CatalogServer[] = []
    for (const entry of entries) {
      if (entry.def.exposure !== 'direct') {
        if (entry.status !== 'ready') continue
        const tools = entry.rawTools
          .filter((raw) => toolAllowed(entry.def.toolPolicy, raw.name))
          .map(catalogToolOf)
        if (tools.length > 0) catalogServers.push({ name: entry.def.name, tools })
        continue
      }
      if (entry.status !== 'ready' || entry.instructions.trim() === '') continue
      sections.push(`<server name="${entry.def.name}">\n${entry.instructions.trim()}\n</server>`)
    }
    if (catalogServers.length > 0) {
      sections.push(
        [
          'MCP tool bridge',
          'Tools from the servers below are reached through the mcp_call tool (fields: server, tool, arguments) instead of individual tool definitions.',
          'Every tool is listed here. Use mcp_search to find one by what it does, and mcp_describe for its exact parameters.',
          '',
          buildCatalog(catalogServers),
        ].join('\n'),
      )
    }
    return sections.join('\n')
  }

  /** Instructions for a profile server, used by overview copy only. */
  async dispose(): Promise<void> {
    for (const agentId of [...this.bridges.keys()]) this.disposeBridge(agentId)
    for (const entry of [...this.entries.values()]) this.remove(entry)
    this.agentEntries.clear()
  }
}

export function idleView(def: ServerDef): ServerView {
  return {
    name: def.name,
    transport: def.transport,
    target: def.transport === 'stdio' ? (def.command ?? '') : (def.url ?? ''),
    authKind: def.auth.kind,
    exposure: def.exposure ?? 'catalog',
    disabled: def.disabled === true,
    status: def.disabled === true ? 'disabled' : 'idle',
    toolCount: 0,
    tools: [],
    toolDetails: [],
    resources: [],
    prompts: [],
    instructions: '',
    logs: [],
  }
}
