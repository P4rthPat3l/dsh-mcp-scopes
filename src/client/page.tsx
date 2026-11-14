/** The MCP servers settings page, composed from Harness primitives. */

import { useSyncExternalStore, useState, type ReactElement } from 'react'
import {
  Button,
  Input,
  Modal,
  PathLabel,
  Pill,
  SegmentedTabs,
  StateDot,
  Switch,
  Tag,
  TextShimmer,
  Toast,
  IconApiOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconEditOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconTrashOutlineRegular,
  IconWarningOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { OverviewServer, ServerDetail } from './harness.js'
import type { OverviewStore, Snapshot } from './store.js'
import {
  EMPTY_DRAFT,
  Editor,
  draftFromDetail,
  draftToServer,
  validateDraft,
  type Draft,
  type DraftProblem,
} from './editor.js'

export interface PageProps extends Record<string, unknown> {
  readonly store: OverviewStore
  readonly t: (key: string) => string
}

type DetailTab = 'tools' | 'resources' | 'prompts' | 'instructions' | 'activity'
type DotState = 'done' | 'warning' | 'ongoing' | 'error' | 'idle'

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
}

interface Notice {
  readonly seq: number
  readonly text: string
  readonly tone?: 'success'
}

const PROBLEM_KEY: Record<DraftProblem, string> = {
  name: 'requiredName',
  connection: 'requiredConnection',
  url: 'requiredUrl',
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

function statusOf(
  server: OverviewServer,
  own: boolean,
  t: (key: string) => string,
): { state: DotState; label: string } {
  if (!own && server.hidden === true) return { state: 'idle', label: t('hiddenHere') }
  if (server.disabled) return { state: 'idle', label: t('statusDisabled') }
  switch (server.status) {
    case 'connecting':
      return { state: 'ongoing', label: t('statusConnecting') }
    case 'ready':
      return { state: 'done', label: t('statusReady') }
    case 'needs_auth':
      return { state: 'warning', label: t('statusNeedsAuth') }
    case 'needs_token':
      return { state: 'warning', label: t('statusNeedsToken') }
    case 'error':
      return { state: 'error', label: t('statusError') }
    case 'disabled':
      return { state: 'idle', label: t('statusDisabled') }
    default:
      return { state: 'idle', label: t('statusIdle') }
  }
}

function transportLabel(server: OverviewServer, t: (key: string) => string): string {
  return server.transport === 'stdio' ? t('transportStdio') : t('transportHttp')
}

function authLabel(server: OverviewServer, t: (key: string) => string): string {
  if (server.authKind === 'bearer') return t('authBearer')
  if (server.authKind === 'oauth') return t('authOAuth')
  return t('authNone')
}

interface RowProps {
  readonly server: OverviewServer
  readonly own: boolean
  readonly target: TargetPayload
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
  readonly onSetToken: () => void
  readonly onTokenValue: (value: string) => void
  readonly onSaveToken: () => void
  readonly onClearToken: () => void
  readonly onSignIn: () => void
  readonly onCompleteSignIn: () => void
  readonly onCancelSignIn: () => void
  readonly onSignOut: () => void
  readonly onAuthReveal: (reveal: boolean) => void
  readonly onTab: (tab: DetailTab) => void
  readonly onRetry: () => void
}

function AuthPanel(props: RowProps): ReactElement | null {
  const { server, t } = props
  if (server.authKind === 'bearer') {
    if (server.status === 'ready' && !props.authReveal) {
      return (
        <div className="mcp-auth-line">
          <Tag tone="quiet">{t('token')}</Tag>
          <span className="mcp-muted">{t('tokenStored')}</span>
          <Button variant="ghost" size="sm" onClick={() => props.onAuthReveal(true)}>
            {t('replaceToken')}
          </Button>
          <Button variant="ghost" size="sm" onClick={props.onClearToken} disabled={props.busy}>
            {t('clearToken')}
          </Button>
        </div>
      )
    }
    return (
      <div className="mcp-auth">
        <span className="mcp-muted">
          {server.status === 'needs_token' ? t('tokenNeedsValue') : t('tokenReplaceHint')}
        </span>
        <div className="mcp-auth-row">
          <Input
            id={`mcp-token-${server.name}`}
            className="mcp-input"
            type="password"
            placeholder={t('tokenPlaceholder')}
            autoComplete="off"
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
          {server.status === 'ready' ? (
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
      if (props.attempt !== undefined || server.oauthAttemptId !== undefined) {
        return (
          <div className="mcp-auth">
            <span className="mcp-muted">{t('waitingSignIn')}</span>
            <div className="mcp-auth-row">
              <Input
                id={`mcp-redirect-${server.name}`}
                className="mcp-input"
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
            </div>
            <span className="mcp-hint">{t('pasteHint')}</span>
          </div>
        )
      }
      return (
        <div className="mcp-auth">
          <span className="mcp-muted">{t('oauthNeeded')}</span>
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
        <div className="mcp-auth-line">
          <Tag tone="quiet">{t('authOAuth')}</Tag>
          <span className="mcp-muted">{t('oauthSignedIn')}</span>
          <Button variant="ghost" size="sm" onClick={props.onSignOut} disabled={props.busy}>
            {t('signOut')}
          </Button>
        </div>
      )
    }
  }
  return null
}

function DetailBody(props: RowProps): ReactElement {
  const { server, tab, t } = props
  if (tab === 'tools') {
    const tools =
      server.toolDetails !== undefined && server.toolDetails.length > 0
        ? server.toolDetails
        : server.tools.map((name) => ({ name, description: '' }))
    if (tools.length === 0) return <p className="mcp-empty-line">{t('noTools')}</p>
    return (
      <ul className="mcp-items">
        {tools.map((tool) => (
          <li key={tool.name} className="mcp-item">
            <span className="mcp-mono mcp-item-name">{tool.name}</span>
            {tool.description === '' ? null : <span className="mcp-item-desc">{tool.description}</span>}
          </li>
        ))}
      </ul>
    )
  }
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
    return (
      <>
        <pre className="mcp-pre">{instructions}</pre>
        <p className="mcp-hint">{instructions.length + ' ' + t('bytes')}</p>
      </>
    )
  }
  if (server.logs.length === 0) return <p className="mcp-empty-line">{t('noLogs')}</p>
  return (
    <ul className="mcp-logs">
      {server.logs.slice(-8).map((line, index) => (
        <li key={`${line.time}-${index}`} className={`mcp-log-${line.level}`}>
          <time dateTime={line.time}>{new Date(line.time).toLocaleTimeString()}</time> {line.message}
        </li>
      ))}
    </ul>
  )
}

function ServerRow(props: RowProps): ReactElement {
  const { server, own, t } = props
  const status = statusOf(server, own, t)
  const checked = own ? !server.disabled : server.hidden !== true
  const locked = !own && server.disabled === true
  const attemptId = props.attempt?.attemptId ?? server.oauthAttemptId

  const cta =
    own && server.status === 'needs_token' ? (
      <Button variant="primary" size="sm" onClick={props.onSetToken}>
        {t('setToken')}
      </Button>
    ) : own && server.status === 'needs_auth' ? (
      <Button variant="primary" size="sm" onClick={props.onSignIn}>
        {t('signIn')}
      </Button>
    ) : null
  const showStatus =
    status.state === 'error' ||
    status.state === 'ongoing' ||
    (status.state === 'warning' && cta === null)

  const tabItems = [
    { value: 'tools' as const, label: t('tools') + (server.toolCount > 0 ? ` ${server.toolCount}` : '') },
    {
      value: 'resources' as const,
      label: t('resources') + ((server.resources?.length ?? 0) > 0 ? ` ${server.resources?.length}` : ''),
    },
    {
      value: 'prompts' as const,
      label: t('prompts') + ((server.prompts?.length ?? 0) > 0 ? ` ${server.prompts?.length}` : ''),
    },
    { value: 'instructions' as const, label: t('instructions') },
    { value: 'activity' as const, label: t('activity') },
  ]

  return (
    <article className="mcp-row" data-open={props.expanded || undefined}>
      <div className="mcp-row-main">
        <span className="mcp-dot" title={status.label} aria-label={status.label}>
          <StateDot state={status.state} />
        </span>
        <button type="button" className="mcp-ident" onClick={props.onToggle} aria-expanded={props.expanded}>
          <span className="mcp-name-line">
            <span className="mcp-name">{server.name}</span>
            <Tag tone="outline">{transportLabel(server, t)}</Tag>
            <Tag tone="quiet">{authLabel(server, t)}</Tag>
            {server.origin === 'workspace' ? <Tag tone="neutral">{t('workspace')}</Tag> : null}
            {!own && server.origin === 'profile' ? <Tag tone="neutral">{t('profile')}</Tag> : null}
            {!own && server.hidden === true ? <Tag tone="warning">{t('hiddenHere')}</Tag> : null}
          </span>
          <span className="mcp-target" title={server.target}>
            {server.target}
          </span>
        </button>
        <div className="mcp-row-end">
          {showStatus ? (
            <span className={`mcp-status mcp-status-${status.state}`}>
              {status.state === 'ongoing' ? <TextShimmer active>{status.label}</TextShimmer> : status.label}
            </span>
          ) : null}
          {cta}
          <Switch
            checked={checked}
            label={`${server.name} ${t('enabled')}`}
            disabled={locked || props.busy}
            title={locked ? t('lockedInProfile') : undefined}
            onChange={(next) => props.onEnabled(next)}
          />
          {own ? (
            <>
              <Button
                variant="toolbar"
                size="sm"
                aria-label={t('edit')}
                title={t('edit')}
                icon={<IconEditOutlineRegular size={14} />}
                disabled={props.busy}
                onClick={props.onEdit}
              />
              <Button
                variant="toolbar"
                size="sm"
                aria-label={t('delete')}
                title={t('delete')}
                icon={<IconTrashOutlineRegular size={14} />}
                disabled={props.busy}
                onClick={props.onDelete}
              />
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={props.onManageProfile}>
              {t('manageInProfile')}
            </Button>
          )}
          <Button
            variant="toolbar"
            size="sm"
            aria-label={t('details')}
            title={props.expanded ? t('hideDetails') : t('details')}
            icon={
              props.expanded ? (
                <IconChevronDownOutlineRegular size={14} />
              ) : (
                <IconChevronRightOutlineRegular size={14} />
              )
            }
            onClick={props.onToggle}
          />
        </div>
      </div>

      {props.expanded ? (
        <div className="mcp-details">
          {own ? <AuthPanel {...props} /> : null}
          {server.error === undefined ? null : (
            <div className="mcp-error-row" role="alert">
              <IconWarningOutlineRegular size={14} />
              <span>{server.error}</span>
              <Button variant="ghost" size="sm" onClick={props.onRetry} disabled={props.busy}>
                {t('retryServer')}
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
          <div className="mcp-detail-body">
            <DetailBody {...props} />
          </div>
          {attemptId === undefined ? null : <span className="mcp-hint">{t('signInPending')}</span>}
        </div>
      ) : null}
    </article>
  )
}

function EmptyState(props: {
  readonly hiddenCount: number
  readonly showHidden: boolean
  readonly t: (key: string) => string
  readonly onShowHidden: () => void
  readonly onAdd: () => void
}): ReactElement {
  const { t } = props
  return (
    <div className="mcp-empty">
      <span className="mcp-empty-icon">
        <IconApiOutlineRegular size={28} />
      </span>
      <h3>{props.hiddenCount > 0 ? t('noActiveServers') : t('noServersTitle')}</h3>
      <p>{props.hiddenCount > 0 ? t('noActiveServersBody') : t('noServersBody')}</p>
      <div className="mcp-empty-actions">
        {props.hiddenCount > 0 ? (
          <Button variant="ghost" onClick={props.onShowHidden}>
            {props.showHidden ? t('hideHidden') : t('showHidden')}
          </Button>
        ) : null}
        <Button variant="primary" icon={<IconPlusOutlineRegular size={14} />} onClick={props.onAdd}>
          {t('addFirst')}
        </Button>
      </div>
    </div>
  )
}

export function McpManagerPage(props: PageProps): ReactElement {
  const snapshot: Snapshot = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot, props.store.getSnapshot)
  const data = snapshot.data
  const workspaces = data?.workspaces ?? []
  const [requestedScope, setRequestedScope] = useState('profile')
  const scope = requestedScope === 'profile' || workspaces.some((entry) => entry.id === requestedScope)
    ? requestedScope
    : 'profile'
  const workspace = workspaces.find((entry) => entry.id === scope)
  const target: TargetPayload =
    scope === 'profile' ? { scope: 'profile' } : { scope: 'workspace', workspaceId: workspace?.id ?? '' }
  const servers = scope === 'profile' ? (data?.profile.servers ?? []) : (workspace?.servers ?? [])
  const visible = servers.filter((server) => server.hidden !== true)
  const hiddenCount = servers.length - visible.length
  const path = scope === 'profile' ? (data?.profile.path ?? '') : (workspace?.filePath ?? '')
  const fileError = scope === 'profile' ? data?.profile.error : workspace?.error

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [showHidden, setShowHidden] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [tabs, setTabs] = useState<Record<string, DetailTab>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({})
  const [authReveals, setAuthReveals] = useState<Record<string, boolean>>({})
  const [attempts, setAttempts] = useState<Record<string, OAuthAttempt>>({})
  const [redirects, setRedirects] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<{ server: OverviewServer; target: TargetPayload } | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const revealHidden = showHidden[scope] === true
  const rows = scope === 'profile' ? visible : revealHidden ? servers : visible
  const t = props.t

  const notify = (text: string, tone?: 'success'): void => {
    setNotice({ seq: Date.now(), text, ...(tone === undefined ? {} : { tone }) })
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
      setEditor({
        mode: 'edit',
        previousName: server.name,
        draft: draftFromDetail(result),
      })
    })
  }

  const save = (): void => {
    if (editor === null) return
    const problem = validateDraft(editor.draft)
    if (problem !== undefined) {
      setEditor({ ...editor, error: t(PROBLEM_KEY[problem]) })
      return
    }
    void run('save', async () => {
      await props.store.call('saveServer', {
        ...target,
        server: draftToServer(editor.draft),
        ...(editor.previousName === undefined ? {} : { previousName: editor.previousName }),
      })
      setEditor(null)
      notify(t('saved'), 'success')
    })
  }

  const remove = (): void => {
    if (deleteTarget === null) return
    const { server, target: deleteScope } = deleteTarget
    void run(`${keyOf(server)}:delete`, async () => {
      await props.store.call('deleteServer', { ...deleteScope, name: server.name })
      setDeleteTarget(null)
      notify(t('deleted'), 'success')
    })
  }

  const setEnabled = (server: OverviewServer, enabled: boolean): void => {
    void run(`${keyOf(server)}:enabled`, async () => {
      await props.store.call('setEnabled', { ...target, name: server.name, enabled })
      notify(enabled ? t('enabledNotice') : t('disabledNotice'))
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
      if (!enabled && !revealHidden) {
        setShowHidden((current) => ({ ...current, [scope]: true }))
      }
      notify(enabled ? t('availableHere') : t('hiddenNotice'))
    })
  }

  const saveToken = (server: OverviewServer): void => {
    const key = keyOf(server)
    void run(`${key}:token`, async () => {
      await props.store.call('setToken', { ...target, name: server.name, value: (tokenValues[key] ?? '').trim() })
      setTokenValues((current) => ({ ...current, [key]: '' }))
      setAuthReveals((current) => ({ ...current, [key]: false }))
      notify(t('tokenSaved'), 'success')
    })
  }

  const clearToken = (server: OverviewServer): void => {
    void run(`${keyOf(server)}:token`, async () => {
      await props.store.call('clearToken', { ...target, name: server.name })
      notify(t('tokenCleared'))
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
        } else {
          popup?.close()
        }
      } catch (error) {
        popup?.close()
        throw error
      }
    })
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
      notify(t('signedIn'), 'success')
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
      target,
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
      onDelete: () => setDeleteTarget({ server, target }),
      onManageProfile: () => {
        changeScope('profile')
        setExpanded((current) => ({ ...current, [key]: true }))
      },
      onEnabled: (enabled) => (own ? setEnabled(server, enabled) : setWorkspaceState(server, enabled)),
      onSetToken: () => {
        setExpanded((current) => ({ ...current, [key]: true }))
        setAuthReveals((current) => ({ ...current, [key]: true }))
        window.setTimeout(() => document.getElementById(`mcp-token-${server.name}`)?.focus(), 0)
      },
      onTokenValue: (value) => {
        if (server.authKind === 'oauth') setRedirects((current) => ({ ...current, [key]: value }))
        else setTokenValues((current) => ({ ...current, [key]: value }))
      },
      onSaveToken: () => saveToken(server),
      onClearToken: () => clearToken(server),
      onSignIn: () => signIn(server),
      onCompleteSignIn: () => completeSignIn(server),
      onCancelSignIn: () => cancelSignIn(server),
      onSignOut: () => signOut(server),
      onAuthReveal: (reveal) => setAuthReveals((current) => ({ ...current, [key]: reveal })),
      onTab: (tab) => setTabs((current) => ({ ...current, [key]: tab })),
      onRetry: () => void run(`${key}:retry`, async () => { await props.store.reconnect() }),
    }
  }

  const error = actionError ?? snapshot.error ?? fileError
  const scopeHint = scope === 'profile' ? t('scopeHintProfile') : t('scopeHintWorkspace')
  const busy = busyKey !== null

  return (
    <div className="mcp">
      <header className="mcp-head">
        <div className="mcp-head-copy">
          <h2 className="mcp-title">{t('title')}</h2>
          <p className="mcp-lede">{t('description')}</p>
        </div>
        <div className="mcp-actions">
          <Button
            variant="ghost"
            icon={<IconRefreshOutlineRegular size={14} />}
            onClick={() => void props.store.refresh()}
          >
            {t('refresh')}
          </Button>
          <Button variant="ghost" onClick={() => void props.store.reconnect()} disabled={busy}>
            {t('retry')}
          </Button>
          <Button variant="primary" icon={<IconPlusOutlineRegular size={14} />} onClick={openAdd}>
            {t('addServer')}
          </Button>
        </div>
      </header>

      <div className="mcp-scopebar">
        <div className="mcp-scopes" role="tablist" aria-label={t('title')}>
          <Pill active={scope === 'profile'} onClick={() => changeScope('profile')}>
            {t('profile')}
            <span className="mcp-scope-count">{data?.profile.servers.length ?? 0}</span>
          </Pill>
          {workspaces.map((entry) => (
            <Pill key={entry.id} active={scope === entry.id} onClick={() => changeScope(entry.id)}>
              {entry.title}
              <span className="mcp-scope-count">
                {entry.servers.filter((server) => server.hidden !== true).length}
              </span>
            </Pill>
          ))}
        </div>
        <span className="mcp-scope-note">{scopeHint}</span>
      </div>

      {error === undefined || error === null ? null : (
        <p className="mcp-banner" role="alert">
          {error}
        </p>
      )}

      {editor === null ? null : (
        <Editor
          mode={editor.mode}
          draft={editor.draft}
          scopeLabel={scope === 'profile' ? t('profile') : (workspace?.title ?? t('workspace'))}
          error={editor.error}
          busy={busyKey === 'save'}
          onChange={(draft) => setEditor({ ...editor, draft, error: undefined })}
          onSave={save}
          onCancel={() => setEditor(null)}
          t={t}
        />
      )}

      {snapshot.loading && data === undefined ? (
        <p className="mcp-muted">{t('loadError')}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          hiddenCount={hiddenCount}
          showHidden={revealHidden}
          t={t}
          onShowHidden={() => setShowHidden((current) => ({ ...current, [scope]: !revealHidden }))}
          onAdd={openAdd}
        />
      ) : (
        <div className="mcp-list">
          {rows.map((server) => (
            <ServerRow key={`${server.name}:${server.origin ?? 'profile'}`} {...rowProps(server)} />
          ))}
          {hiddenCount > 0 && visible.length > 0 ? (
            <div className="mcp-hidden-row">
              <span className="mcp-muted">
                {hiddenCount + ' ' + t('hiddenSummary')}
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
        </div>
      )}

      <footer className="mcp-foot">
        {path === '' ? null : <PathLabel path={path} className="mcp-path" />}
        {snapshot.updatedAt === undefined ? null : (
          <span className="mcp-updated">
            {t('updated')} {new Date(snapshot.updatedAt).toLocaleTimeString()}
          </span>
        )}
      </footer>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('deleteServerTitle')}
        closeLabel={t('close')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onClick={remove} disabled={busy}>
              {t('delete')}
            </Button>
          </>
        }
      >
        <p className="mcp-modal-body">
          {t('deleteBody')}
          {deleteTarget === null ? null : <strong> {deleteTarget.server.name}</strong>}
        </p>
      </Modal>

      {notice === null ? null : (
        <Toast
          key={notice.seq}
          text={notice.text}
          {...(notice.tone === undefined ? {} : { tone: notice.tone })}
          onDone={() => setNotice(null)}
        />
      )}
    </div>
  )
}
