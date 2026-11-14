/** Runtime type guards for optional Host services. */

import type {
  AgentRef,
  ConnectionService,
  CredentialsService,
  SystemPromptService,
  WorkingDirectoryService,
  WorkspaceRegistryService,
} from './types.js'
import { isRecord } from './schema.js'

function hasMethod(value: unknown, name: string): boolean {
  return isRecord(value) && typeof value[name] === 'function'
}

export function isCredentialsService(value: unknown): value is CredentialsService {
  return (
    hasMethod(value, 'resolve') &&
    hasMethod(value, 'readRecord') &&
    hasMethod(value, 'modifyRecord') &&
    hasMethod(value, 'deleteRecord')
  )
}

export function isSystemPrompt(value: unknown): value is SystemPromptService {
  return hasMethod(value, 'section')
}

export function isWorkingDirectory(value: unknown): value is WorkingDirectoryService {
  return hasMethod(value, 'ensure')
}

export function isWorkspaceRegistry(value: unknown): value is WorkspaceRegistryService {
  return hasMethod(value, 'list')
}

export function isConnectionService(value: unknown): value is ConnectionService {
  if (!isRecord(value)) return false
  const fetch = value.fetch
  return isRecord(fetch) && typeof fetch.register === 'function'
}

export function isAgent(value: unknown): value is AgentRef {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string') return false
  const ctx = value.ctx
  return isRecord(ctx) && isRecord(ctx.tools) && typeof ctx.tools.register === 'function'
}

export function isAgentPayload(value: unknown): value is { agent: AgentRef; signal?: AbortSignal } {
  return isRecord(value) && isAgent(value.agent)
}
