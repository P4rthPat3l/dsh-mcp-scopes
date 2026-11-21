/** The MCP servers settings page, composed from Harness primitives. */

import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react'
import {
  Button,
  Input,
  Menu,
  Modal,
  PathLabel,
  SegmentedTabs,
  Switch,
  Tag,
  TextShimmer,
  Toast,
  IconApiOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCodeOutlineRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconSearchOutlineRegular,
  IconTrashOutlineRegular,
  IconWarningOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { OverviewServer, ServerDetail } from './harness.js'
import type { OverviewStore, Snapshot } from './store.js'
import {
  EMPTY_DRAFT,
  Editor,
  draftFromDetail,
  draftToServer,
  type Draft,
} from './editor.js'

export interface PageProps extends Record<string, unknown> {
  readonly store: OverviewStore
  readonly t: (key: string) => string
}

type DetailTab = 'tools' | 'resources' | 'prompts' | 'instructions' | 'activity'
type DotState = 'done' | 'warning' | 'ongoing' | 'error' | 'idle'
type StatusTone = 'success' | 'warning' | 'error' | 'muted'

interface TargetPayload {
  readonly scope: 'profile' | 'workspace'
  readonly workspaceId?: string
}

interface OAuthAttempt {
  readonly attemptId: string
  readonly url: string
}

interface EditorState {
  readonly mode: 'add' | 'edit'
  readonly previousName?: string
  readonly draft: Draft
  readonly error?: string
  readonly detail?: ServerDetail
}

interface Notice {
  readonly seq: number
  readonly text: string
}

interface ConfirmState {
  readonly kind: 'delete' | 'clearToken'
  readonly server: OverviewServer
  readonly target: TargetPayload
}

interface StatusView {
  readonly state: DotState
  readonly label: string
  readonly tone: StatusTone
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isServerDetail(value: unknown): value is ServerDetail {
  if (!isRecord(value)) return false
  if (typeof value.name !== 'string') return false
  if (value.transport !== 'stdio' && value.transport !== 'streamable-http') return false
  if (!isRecord(value.auth)) return false
  const kind = value.auth.kind
  return kind === 'none' || kind === 'bearer' || kind === 'oauth'
}

function keyOf(server: OverviewServer): string {
  return `${server.origin ?? 'profile'}:${server.name}`
}

function statusOf(server: OverviewServer, own: boolean, t: (key: string) => string): StatusView {
  if (!own && server.hidden === true) return { state: 'idle', label: t('hiddenHere'), tone: 'muted' }
  if (server.disabled === true) return { state: 'idle', label: t('statusDisabled'), tone: 'muted' }
  switch (server.status) {
    case 'connecting':
      return { state: 'ongoing', label: t('statusConnecting'), tone: 'warning' }
    case 'ready':
      return { state: 'done', label: t('statusReady'), tone: 'success' }
    case 'needs_auth':
      return { state: 'warning', label: t('statusNeedsAuth'), tone: 'warning' }
    case 'needs_token':
      return { state: 'warning', label: t('statusNeedsToken'), tone: 'warning' }
    case 'error':
      return { state: 'error', label: t('statusError'), tone: 'error' }
    case 'disabled':
      return { state: 'idle', label: t('statusDisabled'), tone: 'muted' }
    default:
      return { state: 'idle', label: t('statusIdle'), tone: 'muted' }
  }
}

function exposureLabel(server: OverviewServer, t: (key: string) => string): string {
  return server.exposure === 'direct' ? t('exposureDirect') : t('exposureCatalog')
}

function transportLabel(server: OverviewServer, t: (key: string) => string): string {
  return server.transport === 'stdio' ? t('transportStdio') : t('transportHttp')
}

function authLabel(server: OverviewServer, t: (key: string) => string): string {
  if (server.authKind === 'bearer') return t('authBearer')
  if (server.authKind === 'oauth') return t('authOAuth')
  return t('authNone')
}

function countLabel(count: number, t: (key: string) => string): string {
  return count + ' ' + (count === 1 ? t('toolUnit') : t('toolsUnit'))
}

function serverMatches(server: OverviewServer, query: string): boolean {
  return (
    server.name.toLowerCase().includes(query) ||
    server.target.toLowerCase().includes(query) ||
    server.tools.some((tool) => tool.toLowerCase().includes(query))
  )
}

interface RowProps {
  readonly server: OverviewServer
  readonly own: boolean
  readonly expanded: boolean
  readonly tab: DetailTab
  readonly busy: boolean
  readonly tokenValue: string
  readonly redirect: string
  readonly authReveal: boolean
  readonly attempt?: OAuthAttempt
  readonly t: (key: string) => string
  readonly onToggle: () => void
  readonly onEdit: () => void
  readonly onDelete: () => void
  readonly onManageProfile: () => void
  readonly onEnabled: (enabled: boolean) => void
  readonly onTokenValue: (value: string) => void
  readonly onSaveToken: () => void
  readonly onClearToken: () => void
  readonly onSignIn: () => void
  readonly onReopenSignIn: () => void
  readonly onCompleteSignIn: () => void
  readonly onCancelSignIn: () => void
  readonly onSignOut: () => void
  readonly onAuthReveal: (reveal: boolean) => void
  readonly onTab: (tab: DetailTab) => void
  readonly onRetry: () => void
}

export function AuthPanel(props: RowProps): ReactElement | null {
  const { server, t } = props
  if (server.authKind === 'bearer') {
    if (server.status === 'ready' && !props.authReveal) {
      if (server.authConfigured === false) return null
      return (
        <div className="mcp-auth mcp-auth-ready">
          <div className="mcp-auth-state">
            <Tag tone="quiet">{t('token')}</Tag>
            <span className="mcp-auth-note">{t('tokenStored')}</span>
          </div>
          <div className="mcp-auth-actions">
            <Button variant="outline" size="sm" onClick={() => props.onAuthReveal(true)}>
              {t('replaceToken')}
            </Button>
            <Button variant="outline" size="sm" onClick={props.onClearToken} disabled={props.busy}>
              {t('clearToken')}
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="mcp-auth">
        <span className="mcp-auth-note" id={`mcp-token-note-${server.name}`}>
          {server.status === 'needs_token' ? t('tokenNeedsValue') : t('tokenReplaceHint')}
        </span>
        <div className="mcp-auth-row">
          <Input
            id={`mcp-token-${server.name}`}
            className="mcp-input"
            type="password"
            aria-label={t('token')}
            placeholder={t('tokenPlaceholder')}
            autoComplete="off"
            autoFocus={props.authReveal}
            aria-describedby={`mcp-token-note-${server.name}`}
            value={props.tokenValue}
            onChange={(event) => props.onTokenValue(event.target.value)}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={props.busy || props.tokenValue.trim() === ''}
            onClick={props.onSaveToken}
          >
            {t('saveToken')}
          </Button>
          {props.authReveal ? (
            <Button variant="ghost" size="sm" onClick={() => props.onAuthReveal(false)}>
              {t('cancel')}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }
  if (server.authKind === 'oauth') {
    if (server.status === 'needs_auth') {
      const waiting = props.attempt !== undefined || server.oauthAttemptId !== undefined
      if (waiting) {
        return (
          <div className="mcp-auth">
            <span className="mcp-auth-note">{t('waitingSignIn')}</span>
            <div className="mcp-auth-row">
              <Input
                id={`mcp-redirect-${server.name}`}
                className="mcp-input"
                aria-label={t('pasteRedirect')}
                aria-describedby={`mcp-redirect-hint-${server.name}`}
                placeholder={t('pasteRedirect')}
                autoComplete="off"
                spellCheck={false}
                value={props.redirect}
                onChange={(event) => props.onTokenValue(event.target.value)}
              />
              <Button
                variant="primary"
                size="sm"
                disabled={props.busy || props.redirect.trim() === ''}
                onClick={props.onCompleteSignIn}
              >
                {t('completeSignIn')}
              </Button>
              <Button variant="ghost" size="sm" disabled={props.busy} onClick={props.onCancelSignIn}>
                {t('cancelSignIn')}
              </Button>
              <Button variant="ghost" size="sm" onClick={props.onReopenSignIn}>
                {t('reopenSignIn')}
              </Button>
            </div>
            <span className="mcp-hint" id={`mcp-redirect-hint-${server.name}`}>
              {t('pasteHint')}
            </span>
          </div>
        )
      }
      return (
        <div className="mcp-auth">
          <span className="mcp-auth-note">{t('oauthNeeded')}</span>
          <div className="mcp-auth-row">
            <Button variant="primary" size="sm" disabled={props.busy} onClick={props.onSignIn}>
              {t('signIn')}
            </Button>
            <span className="mcp-hint">{t('oauthNote')}</span>
          </div>
        </div>
      )
    }
    if (server.status === 'ready') {
      return (
        <div className="mcp-auth mcp-auth-ready">
          <div className="mcp-auth-state">
            <Tag tone="quiet">{t('authOAuth')}</Tag>
            <span className="mcp-auth-note">{t('oauthSignedIn')}</span>
          </div>
          <div className="mcp-auth-actions">
            <Button variant="outline" size="sm" onClick={props.onSignOut} disabled={props.busy}>
              {t('signOut')}
            </Button>
          </div>
        </div>
      )
    }
  }
  return null
}

function ToolList(props: { readonly server: OverviewServer; readonly t: (key: string) => string }): ReactElement {
  const { server, t } = props
  const [filter, setFilter] = useState('')
  const tools =
    server.toolDetails !== undefined && server.toolDetails.length > 0
      ? server.toolDetails
      : server.tools.map((name) => ({ name, description: '' }))
  const query = filter.trim().toLowerCase()
  const shown =
    query === ''
      ? tools
      : tools.filter(
          (tool) => tool.name.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query),
        )
  if (tools.length === 0) return <p className="mcp-empty-line">{t('noTools')}</p>
  return (
    <>
      {tools.length > 6 ? (
        <Input
          className="mcp-filter"
          icon={<IconSearchOutlineRegular size={14} />}
          placeholder={t('filterTools')}
          aria-label={t('filterTools')}
          autoComplete="off"
          spellCheck={false}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      ) : null}
      {shown.length === 0 ? (
        <p className="mcp-empty-line">{t('filterEmpty')}</p>
      ) : (
        <ul className="mcp-items">
          {shown.map((tool) => (
            <li key={tool.name} className="mcp-item">
              <span className="mcp-mono mcp-item-name">{tool.name}</span>
              {tool.description === '' ? null : <span className="mcp-item-desc">{tool.description}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function DetailBody(props: RowProps): ReactElement {
  const { server, tab, t } = props
  if (tab === 'tools') return <ToolList server={server} t={t} />
  if (tab === 'resources') {
    const resources = server.resources ?? []
    if (resources.length === 0) return <p className="mcp-empty-line">{t('noResources')}</p>
    return (
      <ul className="mcp-items">
        {resources.map((resource) => (
          <li key={resource.uri} className="mcp-item">
            <span className="mcp-mono mcp-item-name">{resource.uri}</span>
            <span className="mcp-item-desc">{resource.name}</span>
            {resource.mimeType === undefined ? null : <span className="mcp-hint">{resource.mimeType}</span>}
          </li>
        ))}
      </ul>
    )
  }
  if (tab === 'prompts') {
    const prompts = server.prompts ?? []
    if (prompts.length === 0) return <p className="mcp-empty-line">{t('noPrompts')}</p>
    return (
      <ul className="mcp-items">
        {prompts.map((prompt) => (
          <li key={prompt.name} className="mcp-item">
            <span className="mcp-mono mcp-item-name">{prompt.name}</span>
            {prompt.description === '' ? null : <span className="mcp-item-desc">{prompt.description}</span>}
            {prompt.arguments.length === 0 ? null : (
              <span className="mcp-hint">{t('arguments') + ': ' + prompt.arguments.join(', ')}</span>
            )}
          </li>
        ))}
      </ul>
    )
  }
  if (tab === 'instructions') {
    const instructions = server.instructions ?? ''
    if (instructions.trim() === '') return <p className="mcp-empty-line">{t('noInstructions')}</p>
    return <pre className="mcp-pre">{instructions}</pre>
  }
  if (server.logs.length === 0) return <p className="mcp-empty-line">{t('noActivity')}</p>
  return (
    <ul className="mcp-logs">
      {server.logs.slice(-12).map((line, index) => (
        <li key={`${line.time}-${index}`} className={`mcp-log-${line.level}`}>
          <time dateTime={line.time}>{new Date(line.time).toLocaleTimeString()}</time> {line.message}
        </li>
      ))}
    </ul>
  )
}

function ServerCard(props: RowProps): ReactElement {
  const { server, own, t } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const status = statusOf(server, own, t)
  const checked = own ? !server.disabled : server.hidden !== true
  const locked = !own && server.disabled === true
  const muted = server.disabled === true
  const nameId = `mcp-name-${keyOf(server).replace(/[^A-Za-z0-9_-]/g, '-')}`
  const detailsId = `mcp-details-${keyOf(server).replace(/[^A-Za-z0-9_-]/g, '-')}`
  const panelId = `mcp-panel-${keyOf(server).replace(/[^A-Za-z0-9_-]/g, '-')}`
  const tabId = (tab: DetailTab): string => `mcp-tab-${keyOf(server).replace(/[^A-Za-z0-9_-]/g, '-')}-${tab}`
  const chips = [
    transportLabel(server, t),
    ...(server.authKind === 'none' ? [] : [authLabel(server, t)]),
    exposureLabel(server, t),
    ...(server.toolCount > 0 ? [countLabel(server.toolCount, t)] : []),
  ]
  const menuItems: MenuEntry[] = [
    { id: 'edit', label: t('edit'), icon: <IconEditOutlineRegular size={14} />, disabled: props.busy },
    { type: 'separator', id: 'separator' },
    {
      id: 'delete',
      label: t('delete'),
      icon: <IconTrashOutlineRegular size={14} />,
      danger: true,
      disabled: props.busy,
    },
  ]

  const tabItems = ([
    { value: 'tools' as const, label: t('tools') + (server.toolCount > 0 ? ' ' + server.toolCount : '') },
    {
      value: 'resources' as const,
      label: t('resources') + ((server.resources?.length ?? 0) > 0 ? ' ' + (server.resources?.length ?? 0) : ''),
    },
    {
      value: 'prompts' as const,
      label: t('prompts') + ((server.prompts?.length ?? 0) > 0 ? ' ' + (server.prompts?.length ?? 0) : ''),
    },
    { value: 'instructions' as const, label: t('instructions') },
    { value: 'activity' as const, label: t('activity') },
  ] as const).map((item) => ({ ...item, id: tabId(item.value), panelId }))

  return (
    <article
      className="mcp-card"
      data-open={props.expanded || undefined}
      data-muted={muted || undefined}
      aria-labelledby={nameId}
    >
      <div className="mcp-card-head">
        <button
          type="button"
          className="mcp-card-ident"
          onClick={props.onToggle}
          aria-expanded={props.expanded}
          {...(props.expanded ? { 'aria-controls': detailsId } : {})}
        >
          <span className="mcp-tile" aria-hidden="true">
            {server.transport === 'stdio' ? (
              <IconCodeOutlineRegular size={16} />
            ) : (
              <IconApiOutlineRegular size={16} />
            )}
          </span>
          <span className="mcp-card-text">
            <span className="mcp-card-title">
              <span className="mcp-card-name" id={nameId}>
                {server.name}
              </span>
              {own ? null : <Tag tone="quiet">{t('inherited')}</Tag>}
            </span>
            <span className="mcp-card-target" title={server.target}>
              {server.target}
            </span>
            <span className="mcp-card-chips">
              {chips.map((chip) => (
                <Tag key={chip} tone="quiet">
                  {chip}
                </Tag>
              ))}
            </span>
            {props.expanded || server.error === undefined ? null : (
              <span className="mcp-card-error">{server.error}</span>
            )}
          </span>
        </button>

        <span className="mcp-status" data-tone={status.tone}>
          <span className="mcp-status-dot" aria-hidden="true" />
          {status.state === 'ongoing' ? <TextShimmer active>{status.label}</TextShimmer> : status.label}
        </span>

        <div className="mcp-card-end">
          <Switch
            checked={checked}
            label={own ? `${server.name} ${t('enabled')}` : `${server.name} ${t('availableHere')}`}
            disabled={locked || props.busy}
            title={locked ? t('lockedInProfile') : own ? t('enabledHint') : t('inheritedSwitchHint')}
            onChange={(next) => props.onEnabled(next)}
          />
          {own ? (
            <Menu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              onSelect={(id) => {
                setMenuOpen(false)
                if (id === 'edit') props.onEdit()
                else if (id === 'delete') props.onDelete()
              }}
              items={menuItems}
              align="end"
              portal
              anchor={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${t('serverActions')} ${server.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  icon={<IconEllipsisOutlineRegular size={14} />}
                  onClick={() => setMenuOpen(!menuOpen)}
                />
              }
            />
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="mcp-expand"
            aria-label={`${props.expanded ? t('hideDetails') : t('details')} ${server.name}`}
            aria-expanded={props.expanded}
            {...(props.expanded ? { 'aria-controls': detailsId } : {})}
            onClick={props.onToggle}
          >
            <span className="mcp-expand-label">{t('details')}</span>
            {props.expanded ? (
              <IconChevronDownOutlineRegular size={14} />
            ) : (
              <IconChevronRightOutlineRegular size={14} />
            )}
          </Button>
        </div>
      </div>

      {props.expanded ? (
        <div className="mcp-card-details" id={detailsId}>
          {own ? <AuthPanel {...props} /> : null}
          {server.error === undefined ? null : (
            <div className="mcp-error-row" role="alert">
              <IconWarningOutlineRegular size={14} />
              <span>{server.error}</span>
              <Button variant="ghost" size="sm" onClick={props.onRetry} disabled={props.busy}>
                {t('retry')}
              </Button>
            </div>
          )}
          <SegmentedTabs<DetailTab>
            items={tabItems}
            value={props.tab}
            onChange={props.onTab}
            label={t('details')}
            size="sm"
          />
          <div
            className="mcp-detail-body"
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId(props.tab)}
            tabIndex={0}
          >
            <DetailBody {...props} />
          </div>
          {server.status === 'needs_auth' && props.attempt !== undefined ? (
            <span className="mcp-hint">{t('signInPending')}</span>
          ) : null}
          {own ? null : (
            <div className="mcp-card-foot">
              <span className="mcp-hint">{t('inheritedNote')}</span>
              <Button variant="ghost" size="sm" onClick={props.onManageProfile}>
                {t('manageInAllWorkspaces')}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </article>
  )
}

function AddTile(props: { readonly t: (key: string) => string; readonly onClick: () => void }): ReactElement {
  return (
    <button type="button" className="mcp-add-tile" onClick={props.onClick}>
      <IconPlusOutlineRegular size={16} />
      <span className="mcp-add-tile-label">{props.t('addServer')}</span>
      <span className="mcp-add-tile-hint">{props.t('addTileHint')}</span>
    </button>
  )
}

function Skeleton(): ReactElement {
  return (
    <div className="mcp-skeleton" aria-hidden="true">
      <span className="mcp-skeleton-bar" />
      <span className="mcp-skeleton-bar" />
      <span className="mcp-skeleton-bar" />
    </div>
  )
}

export function McpManagerPage(props: PageProps): ReactElement {
  const snapshot: Snapshot = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot, props.store.getSnapshot)
  const data = snapshot.data
  const workspaces = data?.workspaces ?? []
  const [requestedScope, setRequestedScope] = useState('profile')
  const scope =
    requestedScope === 'profile' || workspaces.some((entry) => entry.id === requestedScope) ? requestedScope : 'profile'
  const workspace = workspaces.find((entry) => entry.id === scope)
  const target: TargetPayload =
    scope === 'profile' ? { scope: 'profile' } : { scope: 'workspace', workspaceId: workspace?.id ?? '' }
  const servers = scope === 'profile' ? (data?.profile.servers ?? []) : (workspace?.servers ?? [])
  const visible = servers.filter((server) => server.hidden !== true)
  const hiddenCount = servers.length - visible.length
  const path = scope === 'profile' ? (data?.profile.path ?? '') : (workspace?.filePath ?? '')
  const fileError = scope === 'profile' ? data?.profile.error : workspace?.error

  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [showHidden, setShowHidden] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [tabs, setTabs] = useState<Record<string, DetailTab>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({})
  const [authReveals, setAuthReveals] = useState<Record<string, boolean>>({})
  const [attempts, setAttempts] = useState<Record<string, OAuthAttempt>>({})
  const [redirects, setRedirects] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => props.store.start(), [props.store])

  const revealHidden = showHidden[scope] === true
  const rows = scope === 'profile' ? visible : revealHidden ? servers : visible
  const query = search.trim().toLowerCase()
  const filtered = query === '' ? rows : rows.filter((server) => serverMatches(server, query))
  const t = props.t
  const busy = busyKey !== null

  const notify = (text: string): void => {
    setNotice({ seq: Date.now(), text })
  }

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusyKey(key)
    setActionError(null)
    try {
      await action()
      await props.store.refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyKey(null)
    }
  }

  const changeScope = (next: string): void => {
    setRequestedScope(next)
    setScopeOpen(false)
    setSearch('')
    setEditor(null)
    setActionError(null)
  }

  const openAdd = (): void => {
    setActionError(null)
    setEditor({ mode: 'add', draft: { ...EMPTY_DRAFT } })
  }

  const openEdit = (server: OverviewServer): void => {
    setActionError(null)
    void run(`${keyOf(server)}:detail`, async () => {
      const result = await props.store.call('detail', { ...target, name: server.name })
      if (!isServerDetail(result)) throw new Error('server detail has an unexpected shape')
      setEditor({ mode: 'edit', previousName: server.name, draft: draftFromDetail(result), detail: result })
    })
  }

  const save = (): void => {
    if (editor === null || busyKey !== null) return
    const draft = editor.draft
    const previousName = editor.previousName
    const existing = editor.detail
    setBusyKey('save')
    setActionError(null)
    void (async () => {
      try {
        await props.store.call('saveServer', {
          ...target,
          server: draftToServer(draft, existing),
          ...(previousName === undefined ? {} : { previousName }),
        })
        setEditor(null)
        await props.store.refresh()
        notify(t('saved'))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setEditor((current) => (current === null ? null : { ...current, error: message }))
      } finally {
        setBusyKey(null)
      }
    })()
  }

  const runConfirm = (key: string, action: () => Promise<void>, done: () => string): void => {
    setBusyKey(key)
    setConfirmError(null)
    void (async () => {
      try {
        await action()
        setConfirm(null)
        await props.store.refresh()
        notify(done())
      } catch (error) {
        setConfirmError(error instanceof Error ? error.message : String(error))
      } finally {
        setBusyKey(null)
      }
    })()
  }

  const remove = (): void => {
    if (confirm === null || confirm.kind !== 'delete') return
    const { server, target: deleteScope } = confirm
    runConfirm(
      `${keyOf(server)}:delete`,
      async () => {
        await props.store.call('deleteServer', { ...deleteScope, name: server.name })
      },
      () => t('deleted'),
    )
  }

  const clearToken = (): void => {
    if (confirm === null || confirm.kind !== 'clearToken') return
    const { server, target: deleteScope } = confirm
    runConfirm(
      `${keyOf(server)}:token`,
      async () => {
        await props.store.call('clearToken', { ...deleteScope, name: server.name })
      },
      () => t('tokenCleared'),
    )
  }

  const setEnabled = (server: OverviewServer, enabled: boolean): void => {
    void run(`${keyOf(server)}:enabled`, async () => {
      await props.store.call('setEnabled', { ...target, name: server.name, enabled })
    })
  }

  const setWorkspaceState = (server: OverviewServer, enabled: boolean): void => {
    if (workspace === undefined) return
    void run(`${keyOf(server)}:workspace`, async () => {
      await props.store.call('setWorkspaceDisabled', {
        workspaceId: workspace.id,
        name: server.name,
        disabled: !enabled,
      })
      if (!enabled && !revealHidden) setShowHidden((current) => ({ ...current, [scope]: true }))
    })
  }

  const saveToken = (server: OverviewServer): void => {
    const key = keyOf(server)
    void run(`${key}:token`, async () => {
      await props.store.call('setToken', { ...target, name: server.name, value: (tokenValues[key] ?? '').trim() })
      setTokenValues((current) => ({ ...current, [key]: '' }))
      setAuthReveals((current) => ({ ...current, [key]: false }))
      notify(t('tokenSaved'))
    })
  }

  const signIn = (server: OverviewServer): void => {
    const popup = window.open('about:blank', '_blank')
    if (popup !== null) popup.opener = null
    const key = keyOf(server)
    void run(`${key}:oauth`, async () => {
      try {
        const result = await props.store.call('startOAuth', { ...target, name: server.name })
        if (isRecord(result) && typeof result.authorizationUrl === 'string' && typeof result.attemptId === 'string') {
          if (popup !== null) popup.location.replace(result.authorizationUrl)
          setAttempts((current) => ({
            ...current,
            [key]: { attemptId: result.attemptId as string, url: result.authorizationUrl as string },
          }))
        } else if (isRecord(result) && result.authorized === true) {
          popup?.close()
          notify(t('signedIn'))
        } else {
          popup?.close()
        }
      } catch (error) {
        popup?.close()
        throw error
      }
    })
  }

  const reopenSignIn = (server: OverviewServer): void => {
    const key = keyOf(server)
    const url = attempts[key]?.url ?? server.oauthUrl
    if (url === undefined) return
    window.open(url, '_blank', 'noopener')
  }

  const completeSignIn = (server: OverviewServer): void => {
    const key = keyOf(server)
    const attemptId = attempts[key]?.attemptId ?? server.oauthAttemptId
    if (attemptId === undefined) return
    void run(`${key}:oauth`, async () => {
      await props.store.call('submitOAuthRedirect', {
        ...target,
        name: server.name,
        attemptId,
        redirectUrl: redirects[key] ?? '',
      })
      setAttempts((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      setRedirects((current) => ({ ...current, [key]: '' }))
      notify(t('signedIn'))
    })
  }

  const cancelSignIn = (server: OverviewServer): void => {
    const key = keyOf(server)
    const attemptId = attempts[key]?.attemptId ?? server.oauthAttemptId
    void run(`${key}:oauth`, async () => {
      if (attemptId !== undefined) await props.store.call('cancelOAuth', { attemptId })
      setAttempts((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      setRedirects((current) => ({ ...current, [key]: '' }))
    })
  }

  const signOut = (server: OverviewServer): void => {
    void run(`${keyOf(server)}:oauth`, async () => {
      await props.store.call('logout', { ...target, name: server.name })
      notify(t('signedOut'))
    })
  }

  const toggleExpanded = (server: OverviewServer): void => {
    const key = keyOf(server)
    setExpanded((current) => ({ ...current, [key]: current[key] !== true }))
  }

  const rowProps = (server: OverviewServer): RowProps => {
    const key = keyOf(server)
    const own = scope === 'profile' || server.origin === 'workspace'
    return {
      server,
      own,
      expanded: expanded[key] === true,
      tab: tabs[key] ?? 'tools',
      busy: busyKey !== null && busyKey.startsWith(`${key}:`),
      tokenValue: tokenValues[key] ?? '',
      redirect: redirects[key] ?? '',
      authReveal: authReveals[key] === true,
      ...(attempts[key] === undefined ? {} : { attempt: attempts[key] }),
      t,
      onToggle: () => toggleExpanded(server),
      onEdit: () => openEdit(server),
      onDelete: () => {
        setConfirmError(null)
        setConfirm({ kind: 'delete', server, target })
      },
      onManageProfile: () => {
        changeScope('profile')
        setExpanded((current) => ({ ...current, [key]: true }))
      },
      onEnabled: (enabled) => (own ? setEnabled(server, enabled) : setWorkspaceState(server, enabled)),
      onTokenValue: (value) => {
        if (server.authKind === 'oauth') setRedirects((current) => ({ ...current, [key]: value }))
        else setTokenValues((current) => ({ ...current, [key]: value }))
      },
      onSaveToken: () => saveToken(server),
      onClearToken: () => {
        setConfirmError(null)
        setConfirm({ kind: 'clearToken', server, target })
      },
      onSignIn: () => signIn(server),
      onReopenSignIn: () => reopenSignIn(server),
      onCompleteSignIn: () => completeSignIn(server),
      onCancelSignIn: () => cancelSignIn(server),
      onSignOut: () => signOut(server),
      onAuthReveal: (reveal) => {
        setAuthReveals((current) => ({ ...current, [key]: reveal }))
        if (!reveal) setTokenValues((current) => ({ ...current, [key]: '' }))
      },
      onTab: (tab) => setTabs((current) => ({ ...current, [key]: tab })),
      onRetry: () => {
        const retryTarget: TargetPayload = own ? target : { scope: 'profile' }
        void run(`${key}:retry`, async () => {
          await props.store.call('reconnectServer', { ...retryTarget, name: server.name })
        })
      },
    }
  }

  const error = actionError ?? snapshot.error
  const unavailable = data === undefined
  const showError = (error !== null && error !== undefined) || (unavailable && !snapshot.loading)
  const scopeNote = scope === 'profile' ? t('profileNote') : t('workspaceNote')
  const loading = snapshot.loading && data === undefined
  const profileCount = data?.profile.servers.filter((server) => server.hidden !== true).length ?? 0
  const currentScopeTitle = scope === 'profile' ? t('allWorkspaces') : (workspace?.title ?? t('allWorkspaces'))
  const currentScopeCount =
    scope === 'profile'
      ? profileCount
      : (workspace?.servers.filter((server) => server.hidden !== true).length ?? 0)
  const scopeItems: MenuEntry[] = [
    {
      id: 'profile',
      label: (
        <span className="mcp-menu-row">
          <span className="mcp-menu-name">{t('allWorkspaces')}</span>
          <span className="mcp-menu-count">{profileCount}</span>
        </span>
      ),
    },
    ...(workspaces.length === 0
      ? []
      : [{ type: 'label' as const, id: 'mcp-workspaces-label', text: t('workspaces') }]),
    ...workspaces.map((entry) => ({
      id: entry.id,
      label: (
        <span className="mcp-menu-row">
          <span className="mcp-menu-name">{entry.title}</span>
          <span className="mcp-menu-count">
            {entry.servers.filter((server) => server.hidden !== true).length}
          </span>
        </span>
      ),
    })),
  ]

  return (
    <section className="mcp" aria-label={t('title')}>
      <h2 className="mcp-visually-hidden">{t('title')}</h2>
      <header className="mcp-toolbar">
        <Input
          className="mcp-search"
          icon={<IconSearchOutlineRegular size={14} />}
          placeholder={t('searchServers')}
          aria-label={t('searchServers')}
          autoComplete="off"
          spellCheck={false}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Menu
          open={scopeOpen}
          onClose={() => setScopeOpen(false)}
          onSelect={(id) => changeScope(id)}
          selectedId={scope}
          items={scopeItems}
          autoFocus
          align="start"
          portal
          minWidthFromAnchor
          className="mcp-scope-menu"
          anchor={
            <Button
              variant="outline"
              className="mcp-scope-trigger"
              aria-haspopup="menu"
              aria-expanded={scopeOpen}
              aria-label={`${t('scope')}: ${currentScopeTitle}`}
              onClick={() => setScopeOpen(!scopeOpen)}
            >
              <span className="mcp-scope-label">{currentScopeTitle}</span>
              <span className="mcp-scope-count">{currentScopeCount}</span>
              <IconChevronDownOutlineRegular size={14} />
            </Button>
          }
        />
        <Button
          variant="outline"
          size="sm"
          className="mcp-refresh"
          aria-label={t('refresh')}
          title={t('refresh')}
          icon={<IconRefreshOutlineRegular size={15} />}
          onClick={() => void props.store.refresh()}
        />
      </header>

      <div className="mcp-subbar">
        <span className="mcp-scope-note">{scopeNote}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void run('reconnect', async () => {
              await props.store.call('reconnect', {})
            })
          }
          disabled={busy}
        >
          {t('reconnectAll')}
        </Button>
      </div>

      {showError ? (
        <div className="mcp-banner" role="alert">
          <span>{error ?? t('loadError')}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActionError(null)
              void props.store.refresh()
            }}
          >
            {t('retry')}
          </Button>
        </div>
      ) : null}
      {fileError === undefined || fileError === null ? null : (
        <div className="mcp-banner" role="alert">
          <span>{fileError}</span>
        </div>
      )}

      {loading ? (
        <div className="mcp-list" aria-busy="true">
          <span className="mcp-visually-hidden" role="status">
            {t('loading')}
          </span>
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : unavailable ? null : rows.length === 0 ? (
        <div className="mcp-empty">
          <h3>{hiddenCount > 0 ? t('noActiveServers') : t('noServersTitle')}</h3>
          <p>{hiddenCount > 0 ? t('noActiveServersBody') : t('noServersBody')}</p>
          {hiddenCount > 0 ? (
            <div className="mcp-empty-actions">
              <Button variant="ghost" onClick={() => setShowHidden((current) => ({ ...current, [scope]: true }))}>
                {t('showHidden')}
              </Button>
            </div>
          ) : null}
          <AddTile t={t} onClick={openAdd} />
        </div>
      ) : (
        <div className="mcp-list">
          {filtered.length === 0 ? (
            <div className="mcp-search-empty">
              <span>{t('noSearchResults')}</span>
              <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
                {t('clearSearch')}
              </Button>
            </div>
          ) : (
            filtered.map((server) => (
              <ServerCard key={`${server.name}:${server.origin ?? 'profile'}`} {...rowProps(server)} />
            ))
          )}
          {hiddenCount > 0 ? (
            <div className="mcp-hidden-row">
              <span className="mcp-muted">
                {hiddenCount} {t('hiddenSummary')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHidden((current) => ({ ...current, [scope]: !revealHidden }))}
              >
                {revealHidden ? t('hideHidden') : t('showHidden')}
              </Button>
            </div>
          ) : null}
          <AddTile t={t} onClick={openAdd} />
        </div>
      )}

      {path === '' ? null : (
        <footer className="mcp-foot">
          <span className="mcp-foot-label">{t('configFile')}</span>
          <PathLabel path={path} className="mcp-path" />
        </footer>
      )}

      <Modal
        open={editor !== null}
        onClose={() => {
          if (busyKey !== 'save') setEditor(null)
        }}
        title={editor?.mode === 'edit' ? t('editTitle') : t('addTitle')}
        description={
          editor === null
            ? undefined
            : (editor.mode === 'add' ? t('addingTo') : t('editingIn')) +
              ' ' +
              (scope === 'profile' ? t('allWorkspaces') : (workspace?.title ?? t('scope')))
        }
        closeLabel={t('close')}
        className="mcp-modal"
        contentClassName="mcp-modal-content"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)} disabled={busyKey === 'save'}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="mcp-server-form"
              disabled={busyKey === 'save'}
            >
              {busyKey === 'save' ? t('saving') : editor?.mode === 'edit' ? t('save') : t('addServer')}
            </Button>
          </>
        }
      >
        {editor === null ? null : (
          <Editor
            key={`${editor.mode}:${editor.previousName ?? ''}`}
            mode={editor.mode}
            draft={editor.draft}
            existingNames={servers
              .filter((server) => server.name !== editor.previousName)
              .map((server) => server.name)}
            {...(editor.error === undefined ? {} : { error: editor.error })}
            onChange={(draft) => setEditor({ ...editor, draft, error: undefined })}
            onSave={save}
            t={t}
          />
        )}
      </Modal>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'clearToken' ? t('clearTokenTitle') : t('deleteServerTitle')}
        closeLabel={t('close')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={confirm?.kind === 'clearToken' ? clearToken : remove}
              disabled={busy}
            >
              {confirm?.kind === 'clearToken' ? t('confirmClearToken') : t('delete')}
            </Button>
          </>
        }
      >
        <div className="mcp-confirm">
          <IconWarningOutlineRegular size={16} />
          <div>
            <p className="mcp-modal-name">{confirm?.server.name}</p>
            <p className="mcp-modal-body">
              {confirm?.kind === 'clearToken' ? t('clearTokenBody') : t('deleteBody')}
            </p>
            {confirmError === null ? null : (
              <p className="mcp-form-error" role="alert">
                {confirmError}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {notice === null ? null : (
        <Toast key={notice.seq} text={notice.text} tone="success" onDone={() => setNotice(null)} />
      )}
    </section>
  )
}
