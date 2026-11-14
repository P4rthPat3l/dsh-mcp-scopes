/** Shared Host types for the MCP manager. */

export type ScopeKind = 'profile' | 'workspace'

export type TransportKind = 'stdio' | 'streamable-http'

export interface AuthNone {
  readonly kind: 'none'
}

export interface AuthBearer {
  readonly kind: 'bearer'
  /** Credential reference name, or a record stored by the page when omitted. */
  readonly credential?: string
}

export interface AuthOAuth {
  readonly kind: 'oauth'
  readonly scopes?: readonly string[]
  readonly clientId?: string
  readonly clientSecret?: string
}

export type AuthConfig = AuthNone | AuthBearer | AuthOAuth

export interface ToolPolicy {
  readonly allow?: readonly string[]
  readonly deny?: readonly string[]
}

export interface ServerTimeouts {
  readonly connectMs?: number
  readonly callMs?: number
}

export interface ServerDef {
  readonly name: string
  readonly transport: TransportKind
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly url?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly auth: AuthConfig
  readonly disabled?: boolean
  readonly toolPolicy?: ToolPolicy
  readonly timeouts?: ServerTimeouts
}

export interface ProfileFile {
  readonly version: 1
  readonly servers: readonly ServerDef[]
}

export interface WorkspaceFile extends ProfileFile {
  readonly disableProfileServers?: readonly string[]
}

export type ConnectionStatus = 'idle' | 'connecting' | 'ready' | 'needs_auth' | 'needs_token' | 'error' | 'disabled'

export interface LogLine {
  readonly time: string
  readonly level: 'info' | 'warn' | 'error'
  readonly message: string
}

export interface ToolSummary {
  readonly name: string
  readonly description: string
}

export interface ResourceSummary {
  readonly uri: string
  readonly name: string
  readonly mimeType?: string
}

export interface PromptSummary {
  readonly name: string
  readonly description: string
  readonly arguments: readonly string[]
}

export interface ServerView {
  readonly name: string
  readonly origin?: ScopeKind
  readonly transport: TransportKind
  readonly target: string
  readonly authKind: AuthConfig['kind']
  readonly disabled: boolean
  readonly status: ConnectionStatus
  readonly authConfigured?: boolean
  readonly oauthUrl?: string
  readonly oauthAttemptId?: string
  readonly toolCount: number
  readonly tools: readonly string[]
  readonly toolDetails?: readonly ToolSummary[]
  readonly resources?: readonly ResourceSummary[]
  readonly prompts?: readonly PromptSummary[]
  readonly instructions?: string
  readonly hidden?: boolean
  readonly error?: string
  readonly logs: readonly LogLine[]
}

export interface OverviewResult {
  readonly profile: {
    readonly path: string
    readonly error?: string
    readonly servers: readonly ServerView[]
  }
  readonly workspaces: readonly {
    readonly id: string
    readonly title: string
    readonly path: string
    readonly filePath: string
    readonly error?: string
    readonly servers: readonly ServerView[]
  }[]
  readonly oauthAvailable: boolean
}

/* ---------- Host service shapes (only what this plugin calls) ---------- */

export interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue }

export interface ContentText {
  readonly type: 'text'
  readonly text: string
}

export type ContentBlock = ContentText

export interface ToolOutputDefinition {
  readonly schema: Record<string, unknown>
  render(args: unknown, value: JsonValue): ContentBlock[]
}

export interface ToolRunContext {
  readonly signal: AbortSignal
}

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: ToolOutputDefinition
  execute(args: unknown, exec: ToolRunContext): Promise<JsonValue>
  readonly timeoutMs?: number
}

export interface ToolsService {
  register(definition: ToolDefinition): () => void
}

export interface CredentialRecord {
  readonly kind: string
  readonly payload: unknown
}

export interface CredentialsService {
  resolve(ref: unknown): Promise<{ readonly value: string } | undefined>
  readRecord(key: unknown): Promise<CredentialRecord | undefined>
  modifyRecord(
    key: unknown,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined>
  deleteRecord(key: unknown): Promise<void>
}

export interface PromptSection {
  readonly name: string
  readonly order: number
  readonly text: string | (() => string)
}

export interface SystemPromptService {
  section(section: PromptSection): () => void
}

export interface AgentRef {
  readonly id: string
  readonly ctx: HostContext
}

export interface WorkingDirectoryService {
  ensure(agent: AgentRef, signal?: AbortSignal): Promise<string>
}

export interface WorkspaceInfo {
  readonly id: string
  readonly title: string
  readonly path: string
}

export interface WorkspaceRegistryService {
  list(): readonly WorkspaceInfo[]
}

export interface ConnectionFetchRoute {
  readonly path: string
  readonly methods: readonly ['POST']
  readonly requestBody: 'buffered'
  fetch(request: Request): Promise<Response>
}

export interface ConnectionService {
  readonly fetch: {
    register(route: ConnectionFetchRoute): () => void
  }
}

export interface HostContext {
  readonly logger: Logger
  effect(callback: () => void | (() => void), label?: string): void
  on<Payload>(event: string, listener: (payload: Payload) => unknown): () => void
  get(name: string): unknown
  inject(names: readonly string[], callback: (scope: HostContext) => void): void
  readonly tools: ToolsService
  readonly credentials?: CredentialsService
  readonly systemPrompt?: SystemPromptService
}
