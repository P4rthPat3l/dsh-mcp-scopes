/** Client half: one Settings section and its styles. */

import type { ReactElement } from 'react'
import { IconApiOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { McpManagerPage, type PageProps } from './page.js'
import { OverviewStore } from './store.js'
import { CSS } from './styles.js'
import { NS, en, zh } from './locale.js'
import type { ClientContext, ConnectionService, LocaleService } from './harness.js'

export const inject = ['slots', 'locale']

function isConnection(value: unknown): value is ConnectionService {
  if (typeof value !== 'object' || value === null) return false
  const rpc = (value as { rpc?: unknown }).rpc
  if (typeof rpc !== 'object' || rpc === null) return false
  return typeof (rpc as { call?: unknown }).call === 'function'
}

function SectionIcon(): ReactElement {
  return <IconApiOutlineRegular size={16} />
}

function isLocale(value: unknown): value is LocaleService {
  if (typeof value !== 'object' || value === null) return false
  if (!('register' in value) || !('bind' in value)) return false
  return typeof value.register === 'function' && typeof value.bind === 'function'
}

export function apply(ctx: ClientContext): void {
  const localeValue = ctx.get('locale')
  const locale = isLocale(localeValue) ? localeValue : undefined
  if (locale !== undefined) {
    try {
      locale.register(NS, { en, zh })
    } catch (error) {
      console.error('dsh-mcp-scopes: locale registration failed', error)
    }
  }
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-mcp-scopes'
    style.textContent = CSS
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, 'dsh-mcp-scopes: styles')

  const connection = ctx.get('connection')
  if (!isConnection(connection)) return
  const store = new OverviewStore(connection.rpc)
  const t = locale === undefined ? (key: string): string => key : locale.bind(NS)
  const surface = (): PageProps => ({ store, t })

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
