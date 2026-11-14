/** Polling store for the MCP overview. */

import type { OverviewData, RpcOutcome } from './harness.js'

export interface Snapshot {
  readonly loading: boolean
  readonly data?: OverviewData
  readonly error?: string
  readonly updatedAt?: number
}

export interface RpcCaller {
  call(route: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcOutcome>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry): entry is string => typeof entry === 'string')
}

function isServer(value: unknown): value is OverviewData['profile']['servers'][number] {
  if (!isRecord(value)) return false
  if (typeof value.name !== 'string') return false
  if (value.transport !== 'stdio' && value.transport !== 'streamable-http') return false
  if (typeof value.target !== 'string') return false
  if (value.authKind !== 'none' && value.authKind !== 'bearer' && value.authKind !== 'oauth') return false
  if (typeof value.disabled !== 'boolean') return false
  if (typeof value.toolCount !== 'number') return false
  if (!isStringArray(value.tools)) return false
  if (!Array.isArray(value.logs)) return false
  return (
    value.status === 'idle' ||
    value.status === 'connecting' ||
    value.status === 'ready' ||
    value.status === 'needs_auth' ||
    value.status === 'needs_token' ||
    value.status === 'error' ||
    value.status === 'disabled'
  )
}

function isOverview(value: unknown): value is OverviewData {
  if (!isRecord(value)) return false
  const profile = value.profile
  if (!isRecord(profile) || typeof profile.path !== 'string' || !Array.isArray(profile.servers)) return false
  if (!profile.servers.every(isServer)) return false
  if (!Array.isArray(value.workspaces)) return false
  for (const workspace of value.workspaces) {
    if (!isRecord(workspace)) return false
    if (
      typeof workspace.id !== 'string' ||
      typeof workspace.title !== 'string' ||
      typeof workspace.path !== 'string' ||
      typeof workspace.filePath !== 'string' ||
      !Array.isArray(workspace.servers) ||
      !workspace.servers.every(isServer)
    ) {
      return false
    }
  }
  return true
}

export class OverviewStore {
  private snapshot: Snapshot = { loading: true }
  private readonly listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | undefined
  private controller: AbortController | undefined

  constructor(private readonly rpc: RpcCaller) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = (): Snapshot => this.snapshot

  private publish(next: Snapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  start(): () => void {
    void this.refresh()
    this.timer = setInterval(() => {
      void this.refresh()
    }, 2000)
    return () => this.stop()
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.controller?.abort()
    this.controller = undefined
  }

  async reconnect(): Promise<void> {
    await this.call('reconnect', {})
    await this.refresh()
  }

  /** Run one management action and surface its failure. */
  async call(endpoint: string, payload: unknown): Promise<unknown> {
    const outcome = await this.rpc.call('/api', `mcp-manager.${endpoint}`, payload)
    if (!outcome.ok) throw new Error(outcome.error.message)
    return outcome.value
  }

  async refresh(): Promise<void> {
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const outcome = await this.rpc.call('/api', 'mcp-manager.overview', {}, controller.signal)
    if (controller.signal.aborted) return
    if (!outcome.ok) {
      this.publish({ loading: false, error: outcome.error.message, ...(this.snapshot.data === undefined ? {} : { data: this.snapshot.data }) })
      return
    }
    if (!isOverview(outcome.value)) {
      this.publish({ loading: false, error: 'overview response has an unexpected shape' })
      return
    }
    this.publish({ loading: false, data: outcome.value, updatedAt: Date.now() })
  }
}
