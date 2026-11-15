/** Bearer-token resolution and credential records. */

import type { CredentialsService, ServerDef } from './types.js'
import { isRecord } from './schema.js'
import { credentialId, credentialKey, credentialRef } from './paths.js'

const OWNER = 'mcp-manager'

export function grantKey(scopeId: string): string {
  return credentialKey(OWNER, `${credentialId(scopeId)}-grant`)
}

export function apiKeyKey(scopeId: string): string {
  return credentialKey(OWNER, `${credentialId(scopeId)}-api-key`)
}

/** Read a stored static token. Values never leave the Host unless a transport needs them. */
export async function readApiKey(credentials: CredentialsService | undefined, scopeId: string): Promise<string | undefined> {
  if (credentials === undefined) return undefined
  const record = await credentials.readRecord(apiKeyKey(scopeId))
  if (record === undefined) return undefined
  const payload = record.payload
  if (!isRecord(payload)) return undefined
  const value = payload.value
  return typeof value === 'string' && value !== '' ? value : undefined
}

export async function saveApiKey(credentials: CredentialsService, scopeId: string, value: string): Promise<void> {
  // The seam admits a static value only as an opaque grant payload. Its api-key
  // shape carries key and env, so a payload there fails the next boot's parse.
  await credentials.modifyRecord(apiKeyKey(scopeId), async () => ({ kind: 'grant', payload: { value } }))
}

export async function clearApiKey(credentials: CredentialsService, scopeId: string): Promise<void> {
  await credentials.deleteRecord(apiKeyKey(scopeId))
}

/** Whether a usable bearer value exists without reading it into the caller. */
export async function hasApiKey(credentials: CredentialsService | undefined, scopeId: string): Promise<boolean> {
  return (await readApiKey(credentials, scopeId)) !== undefined
}

/** Resolve the bearer value for a server: a stored record first, then its named reference. */
export async function resolveBearer(
  credentials: CredentialsService | undefined,
  server: ServerDef,
  scopeId: string,
): Promise<string | undefined> {
  if (credentials === undefined) return undefined
  if (server.auth.kind !== 'bearer') return undefined
  const stored = await readApiKey(credentials, scopeId)
  if (stored !== undefined) return stored
  if (server.auth.credential === undefined) return undefined
  const resolved = await credentials.resolve(credentialRef(server.auth.credential))
  return resolved?.value
}
