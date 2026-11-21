/** Client-side types for the slot and RPC surfaces this plugin uses. */

import type { ComponentType } from 'react'

export type RpcOutcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

export interface ConnectionService {
  readonly rpc: {
    call(route: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcOutcome>
  }
}

export interface LocaleService {
  register(namespace: string, dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>>): void
  bind(namespace: string): (key: string) => string
}

export interface SlotSpec {
  readonly name: string
  readonly id?: string
  readonly key?: string
  readonly order?: number
  readonly label?: string | (() => string)
  readonly inject?: () => Record<string, unknown>
}

export interface SlotsService {
  inject(name: string, register: () => (() => void) | void): void
  register<P>(spec: SlotSpec, component: ComponentType<P>): () => void
}

export interface ClientContext {
  effect(callback: () => void | (() => void), label?: string): void
  get(name: string): unknown
  readonly slots: SlotsService
}

export interface OverviewLogLine {
  readonly time: string
  readonly level: 'info' | 'warn' | 'error'
  readonly message: string
}

export interface OverviewServer {
  readonly name: string
  readonly origin?: 'profile' | 'workspace'
  readonly transport: 'stdio' | 'streamable-http'
  readonly target: string
  readonly authKind: 'none' | 'bearer' | 'oauth'
  /** Absent means catalog exposure. */
  readonly exposure?: 'catalog' | 'direct'
  readonly disabled: boolean
  readonly status: 'idle' | 'connecting' | 'ready' | 'needs_auth' | 'needs_token' | 'error' | 'disabled'
  readonly authConfigured?: boolean
  readonly oauthUrl?: string
  readonly oauthAttemptId?: string
  readonly toolCount: number
  readonly tools: readonly string[]
  readonly toolDetails?: readonly { readonly name: string; readonly description: string }[]
  readonly resources?: readonly {
    readonly uri: string
    readonly name: string
    readonly mimeType?: string
  }[]
  readonly prompts?: readonly {
    readonly name: string
    readonly description: string
    readonly arguments: readonly string[]
  }[]
  readonly instructions?: string
  readonly hidden?: boolean
  readonly error?: string
  readonly logs: readonly OverviewLogLine[]
}

export interface ServerDetail {
  readonly name: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly url?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly auth:
    | { readonly kind: 'none' }
    | { readonly kind: 'bearer'; readonly credential?: string }
    | { readonly kind: 'oauth'; readonly scopes?: readonly string[]; readonly clientId?: string; readonly clientSecret?: string }
  readonly disabled?: boolean
  readonly toolPolicy?: { readonly allow?: readonly string[]; readonly deny?: readonly string[] }
  /** Absent means catalog exposure. */
  readonly exposure?: 'catalog' | 'direct'
}

export interface OverviewData {
  readonly profile: {
    readonly path: string
    readonly error?: string
    readonly servers: readonly OverviewServer[]
  }
  readonly workspaces: readonly {
    readonly id: string
    readonly title: string
    readonly path: string
    readonly filePath: string
    readonly error?: string
    readonly servers: readonly OverviewServer[]
  }[]
  readonly oauthAvailable: boolean
}
