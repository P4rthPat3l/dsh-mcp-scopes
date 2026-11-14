/** Polling store for the MCP overview. */

import type { OverviewData, RpcOutcome } from './harness.js'

export interface Snapshot {
  readonly loading: boolean
  readonly data?: OverviewData
  readonly error?: string
}

export interface RpcCaller {
  call(route: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcOutcome>
}

const POLL_MS = 4000

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

  /** Poll while the settings section is mounted. The caller owns the returned disposer. */
  start(): () => void {
    if (this.timer !== undefined) return () => this.stop()
    void this.refresh()
    this.timer = setInterval(() => {
      if (!document.hidden) void this.refresh()
    }, POLL_MS)
    document.addEventListener('visibilitychange', this.onVisibility)
    return () => this.stop()
  }

  private readonly onVisibility = (): void => {
    if (!document.hidden) void this.refresh()
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    document.removeEventListener('visibilitychange', this.onVisibility)
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
    let outcome: RpcOutcome
    try {
      outcome = await this.rpc.call('/api', 'mcp-manager.overview', {}, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      this.publish({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        ...(this.snapshot.data === undefined ? {} : { data: this.snapshot.data }),
      })
      return
    }
    if (controller.signal.aborted) return
    if (!outcome.ok) {
      this.publish({
        loading: false,
        error: outcome.error.message,
        ...(this.snapshot.data === undefined ? {} : { data: this.snapshot.data }),
      })
      return
    }
    if (!isOverview(outcome.value)) {
      this.publish({ loading: false, error: 'overview response has an unexpected shape' })
      return
    }
    this.publish({ loading: false, data: outcome.value })
  }
}
