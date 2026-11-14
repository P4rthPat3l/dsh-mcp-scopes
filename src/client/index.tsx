/** Client half: one Settings section and its styles. */

import type { ReactElement } from 'react'
import { McpManagerPage, type PageProps } from './page.js'
import { OverviewStore } from './store.js'
import { CSS } from './styles.js'
import { NS, en, zh } from './locale.js'
import type { ClientContext, ConnectionService, LocaleService } from './harness.js'

export const inject = ['slots']

function isConnection(value: unknown): value is ConnectionService {
  if (typeof value !== 'object' || value === null) return false
  const rpc = (value as { rpc?: unknown }).rpc
  if (typeof rpc !== 'object' || rpc === null) return false
  return typeof (rpc as { call?: unknown }).call === 'function'
}

function SectionIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="9.5" width="11" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5" cy="4.5" r="0.8" fill="currentColor" />
      <circle cx="5" cy="11.5" r="0.8" fill="currentColor" />
      <path d="M10 4.5h1.6M10 11.5h1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function isLocale(value: unknown): value is LocaleService {
  if (typeof value !== 'object' || value === null) return false
  if (!('register' in value) || !('bind' in value)) return false
  return typeof value.register === 'function' && typeof value.bind === 'function'
}

export function apply(ctx: ClientContext): void {
  const locale = ctx.get('locale')
  if (isLocale(locale)) {
    ctx.effect(() => locale.register(NS, { en, zh }), 'dsh-mcp-manager: copy')
  }
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-mcp-manager'
    style.textContent = CSS
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, 'dsh-mcp-manager: styles')

  const connection = ctx.get('connection')
  if (!isConnection(connection)) return
  const store = new OverviewStore(connection.rpc)
  const t = isLocale(locale) ? locale.bind(NS) : (key: string): string => key
  const surface = (): PageProps => ({ store, t })

  ctx.effect(() => store.start(), 'dsh-mcp-manager: overview polling')

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'mcp-manager',
        order: 16,
        label: () => t('title'),
        inject: surface,
      },
      McpManagerPage,
    ),
  )
  ctx.slots.inject('settings.section.icon', () =>
    ctx.slots.register({ name: 'settings.section.icon', id: 'mcp-manager' }, SectionIcon),
  )
}
