/** Fixture Host context and tool registry for tests. */

import type { CredentialRecord, CredentialsService, HostContext, Logger, ToolDefinition } from '../src/host/types.js'

export class MemoryCredentials implements CredentialsService {
  readonly records = new Map<string, CredentialRecord>()
  readonly refs = new Map<string, string>()

  async resolve(ref: unknown): Promise<{ value: string } | undefined> {
    const value = this.refs.get(String(ref))
    return value === undefined ? undefined : { value }
  }

  async readRecord(key: unknown): Promise<CredentialRecord | undefined> {
    return this.records.get(String(key))
  }

  async modifyRecord(
    key: unknown,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    const next = await mutate(this.records.get(String(key)))
    if (next === undefined) this.records.delete(String(key))
    else this.records.set(String(key), next)
    return next
  }

  async deleteRecord(key: unknown): Promise<void> {
    this.records.delete(String(key))
  }
}

export class ToolRegistry {
  readonly tools = new Map<string, ToolDefinition>()

  readonly register = (definition: ToolDefinition): (() => void) => {
    if (this.tools.has(definition.name)) throw new Error(`duplicate tool ${definition.name}`)
    this.tools.set(definition.name, definition)
    return () => {
      this.tools.delete(definition.name)
    }
  }
}

export function makeCtx(registry: ToolRegistry): HostContext {
  const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined }
  return {
    logger,
    effect(callback) {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => undefined
    },
    on() {
      return () => undefined
    },
    get() {
      return undefined
    },
    inject() {
      return undefined
    },
    tools: registry,
  }
}

export async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
