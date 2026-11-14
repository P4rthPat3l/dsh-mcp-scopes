/** OAuth engine: grants in the credentials store, a loopback callback, and a pasted-redirect fallback. */

import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { auth } from '@modelcontextprotocol/client'
import type {
  OAuthClientInformationContext,
  OAuthClientMetadata,
  OAuthClientProvider,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client'
import { credentialId } from './paths.js'
import { grantKey } from './credentials.js'
import { isRecord } from './schema.js'
import type { CredentialsService, Logger, ServerDef } from './types.js'

const ATTEMPT_MS = 180_000
const REDIRECT_PATH = '/callback'
const SUCCESS_PAGE = '<!doctype html><meta charset="utf-8"><title>Signed in</title><h1>Signed in</h1><p>You can close this tab and return to DeepSeek Harness.</p>'
const FAILURE_PAGE = '<!doctype html><meta charset="utf-8"><title>Sign-in failed</title><h1>Sign-in failed</h1><p>Return to DeepSeek Harness and try again.</p>'

interface Grant {
  readonly tokens?: StoredOAuthTokens
  readonly clientInformation?: StoredOAuthClientInformation
  readonly issuer?: string
}

function parseGrant(value: unknown): Grant {
  if (!isRecord(value)) return {}
  const text = value.json
  if (typeof text !== 'string') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }
  if (!isRecord(parsed)) return {}
  const tokens = parseTokens(parsed.tokens)
  const clientInformation = parseClientInformation(parsed.clientInformation)
  const issuer = typeof parsed.issuer === 'string' ? parsed.issuer : undefined
  return {
    ...(tokens === undefined ? {} : { tokens }),
    ...(clientInformation === undefined ? {} : { clientInformation }),
    ...(issuer === undefined ? {} : { issuer }),
  }
}

function parseTokens(value: unknown): StoredOAuthTokens | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.access_token !== 'string' || typeof value.token_type !== 'string') return undefined
  const tokens: StoredOAuthTokens = { access_token: value.access_token, token_type: value.token_type }
  if (typeof value.id_token === 'string') tokens.id_token = value.id_token
  if (typeof value.expires_in === 'number') tokens.expires_in = value.expires_in
  if (typeof value.scope === 'string') tokens.scope = value.scope
  if (typeof value.refresh_token === 'string') tokens.refresh_token = value.refresh_token
  if (typeof value.issuer === 'string') tokens.issuer = value.issuer
  return tokens
}

function parseClientInformation(value: unknown): StoredOAuthClientInformation | undefined {
  if (!isRecord(value) || typeof value.client_id !== 'string') return undefined
  const info: StoredOAuthClientInformation = { client_id: value.client_id }
  if (typeof value.client_secret === 'string') info.client_secret = value.client_secret
  if (typeof value.issuer === 'string') info.issuer = value.issuer
  return info
}

interface Attempt {
  readonly id: string
  readonly scopeId: string
  readonly serverName: string
  readonly serverUrl: string
  readonly state: string
  readonly provider: ManagerProvider
  readonly http: Server
  readonly port: number
  readonly timer: ReturnType<typeof setTimeout>
  settled: boolean
}

export interface PrepareResult {
  readonly ready: boolean
  readonly provider?: OAuthClientProvider
  readonly url?: string
  readonly message?: string
}

class ManagerProvider implements OAuthClientProvider {
  tokensValue?: StoredOAuthTokens
  clientValue?: StoredOAuthClientInformation
  verifier?: string
  authorizationUrl?: URL
  readonly metadata: OAuthClientMetadata

  constructor(
    private readonly redirect: string,
    private readonly stateValue: string,
    private readonly scopes: string | undefined,
    private readonly deps: {
      readonly read: () => Promise<Grant>
      readonly write: (grant: Grant) => Promise<void>
      readonly onRedirect: (url: URL) => void
    },
  ) {
    this.metadata = {
      client_name: 'DeepSeek Harness MCP Manager',
      redirect_uris: [redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(scopes === undefined ? {} : { scope: scopes }),
    }
  }

  get redirectUrl(): string {
    return this.redirect
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.metadata
  }

  state(): string {
    return this.stateValue
  }

  clientInformation(_ctx?: OAuthClientInformationContext): StoredOAuthClientInformation | undefined {
    return this.clientValue
  }

  async saveClientInformation(info: StoredOAuthClientInformation): Promise<void> {
    this.clientValue = info
    const current = await this.deps.read()
    await this.deps.write({ ...current, clientInformation: info })
  }

  tokens(_ctx?: OAuthClientInformationContext): StoredOAuthTokens | undefined {
    return this.tokensValue
  }

  async saveTokens(tokens: StoredOAuthTokens): Promise<void> {
    this.tokensValue = tokens
    const current = await this.deps.read()
    await this.deps.write({ ...current, tokens })
  }

  redirectToAuthorization(url: URL): void {
    this.authorizationUrl = url
    this.deps.onRedirect(url)
  }

  saveCodeVerifier(verifier: string): void {
    this.verifier = verifier
  }

  codeVerifier(): string {
    if (this.verifier === undefined) throw new Error('no PKCE verifier is stored for this attempt')
    return this.verifier
  }

  async invalidateCredentials(): Promise<void> {
    this.tokensValue = undefined
    const current = await this.deps.read()
    await this.deps.write({ clientInformation: current.clientInformation, ...(current.issuer === undefined ? {} : { issuer: current.issuer }) })
  }
}

export class OAuthEngine {
  private readonly attempts = new Map<string, Attempt>()
  private readonly pending = new Map<string, string>()
  private readonly lastError = new Map<string, string>()

  constructor(
    private readonly credentials: CredentialsService | undefined,
    private readonly logger: Logger,
    private readonly onAuthorized: (scopeId: string) => void,
  ) {}

  hasCredentials(): boolean {
    return this.credentials !== undefined
  }

  async hasGrant(scopeId: string): Promise<boolean> {
    const grant = await this.readGrant(scopeId)
    return grant.tokens !== undefined
  }

  pendingUrl(scopeId: string): string | undefined {
    const attemptId = this.pending.get(scopeId)
    return attemptId === undefined ? undefined : this.attempts.get(attemptId)?.provider.authorizationUrl?.toString()
  }

  errorFor(scopeId: string): string | undefined {
    return this.lastError.get(scopeId)
  }

  private async readGrant(scopeId: string): Promise<Grant> {
    if (this.credentials === undefined) return {}
    const record = await this.credentials.readRecord(grantKey(scopeId))
    return record === undefined ? {} : parseGrant(record.payload)
  }

  private async writeGrant(scopeId: string, grant: Grant): Promise<void> {
    if (this.credentials === undefined) throw new Error('the credentials service is unavailable')
    const json = JSON.stringify({
      ...(grant.tokens === undefined ? {} : { tokens: grant.tokens }),
      ...(grant.clientInformation === undefined ? {} : { clientInformation: grant.clientInformation }),
      ...(grant.issuer === undefined ? {} : { issuer: grant.issuer }),
    })
    await this.credentials.modifyRecord(grantKey(scopeId), async () => ({ kind: 'grant', payload: { json } }))
  }

  async logout(scopeId: string): Promise<void> {
    if (this.credentials !== undefined) await this.credentials.deleteRecord(grantKey(scopeId))
    const attemptId = this.pending.get(scopeId)
    if (attemptId !== undefined) this.cancel(attemptId)
    this.lastError.delete(scopeId)
  }

  private providerFor(scopeId: string, redirect: string, state: string, scopes: string | undefined): ManagerProvider {
    return new ManagerProvider(redirect, state, scopes, {
      read: () => this.readGrant(scopeId),
      write: (grant) => this.writeGrant(scopeId, grant),
      onRedirect: () => undefined,
    })
  }

  /** Open a callback listener and return the authorization URL when the server needs a login. */
  async start(server: ServerDef, scopeId: string): Promise<{ url: string; attemptId: string } | { authorized: true; provider: OAuthClientProvider }> {
    const existing = this.pending.get(scopeId)
    if (existing !== undefined) {
      const attempt = this.attempts.get(existing)
      const url = attempt?.provider.authorizationUrl?.toString()
      if (attempt !== undefined && url !== undefined) return { url, attemptId: attempt.id }
    }
    const serverUrl = server.url
    if (serverUrl === undefined) throw new Error('OAuth requires a streamable-http server URL')
    const state = randomBytes(32).toString('base64url')
    const attemptId = `attempt-${state}`
    let port = 0
    const handler = (request: IncomingMessage, response: ServerResponse): void => {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
      if (url.pathname !== REDIRECT_PATH) {
        response.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const iss = url.searchParams.get('iss') ?? undefined
      if (code === null || returnedState !== state) {
        response.writeHead(400, { 'content-type': 'text/html' }).end(FAILURE_PAGE)
        return
      }
      response.writeHead(200, { 'content-type': 'text/html' }).end(SUCCESS_PAGE)
      void this.completeAttempt(attemptId, code, iss).catch((error: unknown) => {
        this.logger.warn(`mcp-manager oauth: auto-complete failed: ${String(error)}`)
      })
    }
    const http = createServer((request, response) => handler(request, response))
    await new Promise<void>((resolve, reject) => {
      http.once('error', reject)
      http.listen(0, '127.0.0.1', () => resolve())
    })
    const address = http.address()
    if (address === null || typeof address === 'string') {
      http.close()
      throw new Error('OAuth callback listener has no port')
    }
    port = address.port
    const redirect = `http://127.0.0.1:${port}${REDIRECT_PATH}`
    const provider = this.providerFor(scopeId, redirect, state, server.auth.kind === 'oauth' ? server.auth.scopes?.join(' ') : undefined)
    const grant = await this.readGrant(scopeId)
    provider.tokensValue = grant.tokens
    provider.clientValue = grant.clientInformation
    const timer = setTimeout(() => {
      this.failAttempt(attemptId, 'sign-in timed out')
    }, ATTEMPT_MS)
    const attempt: Attempt = {
      id: attemptId,
      scopeId,
      serverName: server.name,
      serverUrl,
      state,
      provider,
      http,
      port,
      timer,
      settled: false,
    }
    this.attempts.set(attemptId, attempt)
    this.pending.set(scopeId, attemptId)
    try {
      const result = await auth(provider, { serverUrl })
      if (result === 'AUTHORIZED') {
        this.closeAttempt(attemptId)
        return { authorized: true, provider }
      }
      const url = provider.authorizationUrl?.toString()
      if (url === undefined) throw new Error('the authorization server did not return a URL')
      return { url, attemptId }
    } catch (error) {
      this.failAttempt(attemptId, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /** Complete one attempt from the browser callback or a pasted redirect URL. */
  async complete(attemptId: string, redirectUrl?: string): Promise<void> {
    const attempt = this.attempts.get(attemptId)
    if (attempt === undefined) throw new Error('sign-in attempt not found or already finished')
    if (redirectUrl === undefined) throw new Error('paste the redirect URL from the browser')
    const parsed = new URL(redirectUrl)
    const code = parsed.searchParams.get('code')
    const state = parsed.searchParams.get('state')
    const iss = parsed.searchParams.get('iss') ?? undefined
    if (code === null) throw new Error('the redirect URL has no code')
    if (state !== attempt.state) throw new Error('the redirect URL belongs to a different sign-in attempt')
    await this.completeAttempt(attemptId, code, iss)
  }

  private async completeAttempt(attemptId: string, code: string, iss: string | undefined): Promise<void> {
    const attempt = this.attempts.get(attemptId)
    if (attempt === undefined) return
    if (attempt.settled) return
    attempt.settled = true
    try {
      const result = await auth(attempt.provider, {
        serverUrl: attempt.serverUrl,
        authorizationCode: code,
        ...(iss === undefined ? {} : { iss }),
      })
      if (result !== 'AUTHORIZED') throw new Error('the server did not complete authorization')
      this.closeAttempt(attemptId)
      this.lastError.delete(attempt.scopeId)
      this.onAuthorized(attempt.scopeId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.lastError.set(attempt.scopeId, message)
      this.closeAttempt(attemptId)
      throw error
    }
  }

  cancel(attemptId: string): void {
    this.failAttempt(attemptId, 'sign-in cancelled')
  }

  private failAttempt(attemptId: string, message: string): void {
    const attempt = this.attempts.get(attemptId)
    if (attempt === undefined) return
    this.lastError.set(attempt.scopeId, message)
    this.closeAttempt(attemptId)
  }

  private closeAttempt(attemptId: string): void {
    const attempt = this.attempts.get(attemptId)
    if (attempt === undefined) return
    clearTimeout(attempt.timer)
    attempt.http.close()
    if (this.pending.get(attempt.scopeId) === attemptId) this.pending.delete(attempt.scopeId)
    this.attempts.delete(attemptId)
  }

  dispose(): void {
    for (const attemptId of [...this.attempts.keys()]) this.closeAttempt(attemptId)
    this.attempts.clear()
    this.pending.clear()
    this.lastError.clear()
  }
}
