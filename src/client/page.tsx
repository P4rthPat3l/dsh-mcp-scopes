/** The MCP servers settings page. */

import { useState, useSyncExternalStore, type ReactElement } from 'react'
import type { OverviewData, OverviewServer, ServerDetail } from './harness.js'
import type { OverviewStore, Snapshot } from './store.js'
import { EMPTY_DRAFT, Editor, draftFromDetail, draftToServer, validateDraft, type Draft } from './editor.js'

export interface PageProps extends Record<string, unknown> {
  readonly store: OverviewStore
  readonly t: (key: string) => string
}

const STATUS_KEY: Record<OverviewServer['status'], string> = {
  idle: 'statusIdle',
  connecting: 'statusConnecting',
  ready: 'statusReady',
  needs_auth: 'statusNeedsAuth',
  needs_token: 'statusNeedsToken',
  error: 'statusError',
  disabled: 'statusDisabled',
}

const AUTH_KEY: Record<OverviewServer['authKind'], string> = {
  none: 'authNone',
  bearer: 'authBearer',
  oauth: 'authOAuth',
}

interface EditorState {
  mode: 'add' | 'edit'
  previousName?: string
  draft: Draft
  error?: string
}

interface TargetPayload {
  scope: 'profile' | 'workspace'
  workspaceId?: string
}

interface OAuthAttempt {
  attemptId: string
  url: string
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

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

function StatusChip({ server, t }: { server: OverviewServer; t: (key: string) => string }): ReactElement {
  return (
    <span className={`mcp-manager-status mcp-manager-status-${server.status}`}>
      <span className={`mcp-manager-dot mcp-manager-dot-${server.status}`} aria-hidden="true" />
      {t(STATUS_KEY[server.status])}
    </span>
  )
}

function TokenPanel({
  server,
  value,
  busy,
  onValue,
  onSave,
  onClear,
  t,
}: {
  server: OverviewServer
  value: string
  busy: boolean
  onValue: (next: string) => void
  onSave: () => void
  onClear: () => void
  t: (key: string) => string
}): ReactElement {
  return (
    <section className="mcp-manager-auth-panel">
      <p className="mcp-manager-auth-state">
        {t('token')}: <strong>{server.authConfigured === true ? t('tokenConfigured') : t('tokenNotSet')}</strong>
      </p>
      <div className="mcp-manager-auth-row">
        <input
          type="password"
          className="mcp-manager-input mcp-manager-mono"
          placeholder={t('tokenPlaceholder')}
          aria-label={t('tokenPlaceholder')}
          autoComplete="off"
          value={value}
          onChange={(event) => onValue(event.target.value)}
        />
        <button
          type="button"
          className="mcp-manager-button mcp-manager-primary"
          disabled={busy || value.trim() === ''}
          onClick={onSave}
        >
          {t('saveToken')}
        </button>
        {server.authConfigured === true ? (
          <button type="button" className="mcp-manager-button" disabled={busy} onClick={onClear}>
            {t('clearToken')}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function OAuthPanel({
  server,
  attempt,
  busy,
  redirect,
  onRedirect,
  onSignIn,
  onComplete,
  onCancel,
  onSignOut,
  onReopen,
  t,
}: {
  server: OverviewServer
  attempt?: OAuthAttempt
  busy: boolean
  redirect: string
  onRedirect: (next: string) => void
  onSignIn: () => void
  onComplete: () => void
  onCancel: () => void
  onSignOut: () => void
  onReopen: () => void
  t: (key: string) => string
}): ReactElement {
  const pending = attempt !== undefined || server.oauthAttemptId !== undefined
  if (pending) {
    return (
      <section className="mcp-manager-auth-panel">
        <p className="mcp-manager-auth-state">{t('waitingSignIn')}</p>
        <div className="mcp-manager-auth-row">
          <button type="button" className="mcp-manager-button" onClick={onReopen}>
            {t('reopenSignIn')}
          </button>
          <button type="button" className="mcp-manager-button" onClick={onCancel}>
            {t('cancelSignIn')}
          </button>
        </div>
        <label className="mcp-manager-field-label" htmlFor={`mcp-manager-redirect-${server.name}`}>
          {t('pasteRedirect')}
        </label>
        <div className="mcp-manager-auth-row">
          <input
            id={`mcp-manager-redirect-${server.name}`}
            className="mcp-manager-input mcp-manager-mono"
            placeholder="http://127.0.0.1:.../callback?code=..."
            autoComplete="off"
            spellCheck={false}
            value={redirect}
            onChange={(event) => onRedirect(event.target.value)}
          />
          <button
            type="button"
            className="mcp-manager-button mcp-manager-primary"
            disabled={busy || redirect.trim() === ''}
            onClick={onComplete}
          >
            {t('completeSignIn')}
          </button>
        </div>
        <p className="mcp-manager-field-hint">{t('pasteHint')}</p>
      </section>
    )
  }
  return (
    <section className="mcp-manager-auth-panel">
      <p className="mcp-manager-auth-state">
        {t('authOAuth')}: <strong>{server.authConfigured === true ? t('tokenConfigured') : t('tokenNotSet')}</strong>
      </p>
      <div className="mcp-manager-auth-row">
        <button type="button" className="mcp-manager-button mcp-manager-primary" disabled={busy} onClick={onSignIn}>
          {t('signIn')}
        </button>
        {server.authConfigured === true ? (
          <button type="button" className="mcp-manager-button" disabled={busy} onClick={onSignOut}>
            {t('signOut')}
          </button>
        ) : null}
      </div>
      <p className="mcp-manager-field-hint">{t('oauthNote')}</p>
    </section>
  )
}

interface RowActions {
  readonly onEdit: () => void
  readonly onDelete: () => void
  readonly onToggleEnabled: () => void
  readonly onAttempt: (attempt: OAuthAttempt | undefined) => void
  readonly onRedirect: (next: string) => void
}

function Details({
  server,
  target,
  attempt,
  redirect,
  busy,
  actions,
  t,
  store,
  tokenValue,
  onTokenValue,
  run,
}: {
  server: OverviewServer
  target: TargetPayload
  attempt?: OAuthAttempt
  redirect: string
  busy: boolean
  actions: RowActions
  t: (key: string) => string
  store: OverviewStore
  tokenValue: string
  onTokenValue: (next: string) => void
  run: (action: () => Promise<void>) => Promise<void>
}): ReactElement {
  const attemptId = (): string | undefined => attempt?.attemptId ?? server.oauthAttemptId

  return (
    <div className="mcp-manager-details">
      {server.error === undefined ? null : (
        <p className="mcp-manager-error" role="alert">
          {server.error}
        </p>
      )}
      {server.authKind === 'bearer' ? (
        <TokenPanel
          server={server}
          value={tokenValue}
          busy={busy}
          onValue={onTokenValue}
          onSave={() =>
            void run(async () => {
              await store.call('setToken', { ...target, name: server.name, value: tokenValue })
              onTokenValue('')
            })
          }
          onClear={() => void run(async () => { await store.call('clearToken', { ...target, name: server.name }) })}
          t={t}
        />
      ) : null}
      {server.authKind === 'oauth' ? (
        <OAuthPanel
          server={server}
          attempt={attempt}
          busy={busy}
          redirect={redirect}
          onRedirect={actions.onRedirect}
          onSignIn={() => {
            const popup = window.open('about:blank', '_blank')
            if (popup !== null) popup.opener = null
            void run(async () => {
              try {
                const result = await store.call('startOAuth', { ...target, name: server.name })
                if (isRecord(result) && typeof result.authorizationUrl === 'string' && typeof result.attemptId === 'string') {
                  if (popup !== null) popup.location.replace(result.authorizationUrl)
                  actions.onAttempt({ attemptId: result.attemptId, url: result.authorizationUrl })
                } else {
                  popup?.close()
                }
              } catch (error) {
                popup?.close()
                throw error
              }
            })
          }}
          onComplete={() =>
            void run(async () => {
              const id = attemptId()
              if (id === undefined) throw new Error('no sign-in attempt is pending')
              await store.call('submitOAuthRedirect', {
                ...target,
                name: server.name,
                attemptId: id,
                redirectUrl: redirect.trim(),
              })
              actions.onAttempt(undefined)
              actions.onRedirect('')
            })
          }
          onCancel={() =>
            void run(async () => {
              const id = attemptId()
              if (id !== undefined) await store.call('cancelOAuth', { attemptId: id })
              actions.onAttempt(undefined)
              actions.onRedirect('')
            })
          }
          onSignOut={() => void run(async () => { await store.call('logout', { ...target, name: server.name }) })}
          onReopen={() => {
            const url = attempt?.url ?? server.oauthUrl
            if (url !== undefined) window.open(url, '_blank', 'noopener,noreferrer')
          }}
          t={t}
        />
      ) : null}
      <p className="mcp-manager-label">{t('toolsLabel')}</p>
      {server.tools.length === 0 ? (
        <p className="mcp-manager-muted">{t('noTools')}</p>
      ) : (
        <ul className="mcp-manager-tools">
          {server.tools.map((tool) => (
            <li key={tool}>{tool}</li>
          ))}
        </ul>
      )}
      <p className="mcp-manager-label">{t('logsLabel')}</p>
      {server.logs.length === 0 ? (
        <p className="mcp-manager-muted">{t('noLogs')}</p>
      ) : (
        <ul className="mcp-manager-logs">
          {server.logs.slice(-8).map((line, index) => (
            <li key={`${line.time}-${index}`} className={`mcp-manager-log-${line.level}`}>
              <time dateTime={line.time}>{new Date(line.time).toLocaleTimeString()}</time> {line.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ServerRow({
  server,
  target,
  expanded,
  onToggle,
  actions,
  t,
  store,
  run,
  busy,
  tokenValue,
  onTokenValue,
  attempt,
  redirect,
}: {
  server: OverviewServer
  target: TargetPayload
  expanded: boolean
  onToggle: () => void
  actions: RowActions
  t: (key: string) => string
  store: OverviewStore
  run: (action: () => Promise<void>) => Promise<void>
  busy: boolean
  tokenValue: string
  onTokenValue: (next: string) => void
  attempt?: OAuthAttempt
  redirect: string
}): ReactElement {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="mcp-manager-row">
      <div className="mcp-manager-row-main">
        <div className="mcp-manager-identity">
          <span className="mcp-manager-name">{server.name}</span>
          <span className="mcp-manager-target" title={server.target}>
            {truncate(server.target, 64)}
          </span>
        </div>
        <div className="mcp-manager-badges">
          <span className="mcp-manager-badge">{server.transport === 'stdio' ? t('transportStdio') : t('transportHttp')}</span>
          <span className="mcp-manager-badge">{t(AUTH_KEY[server.authKind])}</span>
        </div>
        <StatusChip server={server} t={t} />
        <span className="mcp-manager-count">
          {server.toolCount} {t('toolCount')}
        </span>
        <div className="mcp-manager-row-actions">
          <button type="button" className="mcp-manager-link" onClick={actions.onEdit} disabled={busy}>
            {t('edit')}
          </button>
          <button type="button" className="mcp-manager-link" onClick={actions.onToggleEnabled} disabled={busy}>
            {server.disabled ? t('enable') : t('disable')}
          </button>
          {confirming ? (
            <>
              <button type="button" className="mcp-manager-link mcp-manager-danger" onClick={actions.onDelete} disabled={busy}>
                {t('confirmDelete')}
              </button>
              <button type="button" className="mcp-manager-link" onClick={() => setConfirming(false)}>
                {t('cancelDelete')}
              </button>
            </>
          ) : (
            <button type="button" className="mcp-manager-link" onClick={() => setConfirming(true)}>
              {t('delete')}
            </button>
          )}
          <button type="button" className="mcp-manager-link" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? t('hideDetails') : t('details')}
          </button>
        </div>
      </div>
      {expanded ? (
        <Details
          server={server}
          target={target}
          attempt={attempt}
          redirect={redirect}
          busy={busy}
          actions={actions}
          t={t}
          store={store}
          tokenValue={tokenValue}
          onTokenValue={onTokenValue}
          run={run}
        />
      ) : null}
    </li>
  )
}

function EmptyState({ path, t, onAdd }: { path: string; t: (key: string) => string; onAdd: () => void }): ReactElement {
  return (
    <div className="mcp-manager-empty">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" className="mcp-manager-empty-icon">
        <rect x="7" y="8" width="26" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <rect x="7" y="22" width="26" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="13" cy="13" r="1.5" fill="currentColor" />
        <circle cx="13" cy="27" r="1.5" fill="currentColor" />
        <path d="M21 13h6M21 27h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <p className="mcp-manager-empty-title">{t('noServersTitle')}</p>
      <p className="mcp-manager-muted">{t('noServersBody')}</p>
      <button type="button" className="mcp-manager-button mcp-manager-primary" onClick={onAdd}>
        {t('addFirst')}
      </button>
      <p className="mcp-manager-field-hint">
        {t('filePath')}: <code>{path}</code>
      </p>
    </div>
  )
}

export function McpManagerPage(props: PageProps): ReactElement {
  const snapshot: Snapshot = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot, props.store.getSnapshot)
  const data = snapshot.data
  const workspaces = data?.workspaces ?? []
  const [requestedScope, setRequestedScope] = useState('profile')
  const scope = requestedScope === 'profile' || workspaces.some((entry) => entry.id === requestedScope) ? requestedScope : 'profile'
  const workspace = workspaces.find((entry) => entry.id === scope)
  const target: TargetPayload = scope === 'profile' ? { scope: 'profile' } : { scope: 'workspace', workspaceId: workspace?.id ?? '' }
  const servers = scope === 'profile' ? (data?.profile.servers ?? []) : (workspace?.servers ?? [])
  const path = scope === 'profile' ? (data?.profile.path ?? '') : (workspace?.filePath ?? '')
  const fileError = scope === 'profile' ? data?.profile.error : workspace?.error

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({})
  const [attempts, setAttempts] = useState<Record<string, OAuthAttempt>>({})
  const [redirects, setRedirects] = useState<Record<string, string>>({})

  const keyOf = (server: OverviewServer): string => `${server.origin ?? 'profile'}:${server.name}`
  const refresh = async (): Promise<void> => {
    await props.store.refresh()
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

  const openAdd = (): void => {
    setActionError(null)
    setEditor({ mode: 'add', draft: { ...EMPTY_DRAFT } })
  }

  const openEdit = (server: OverviewServer): void => {
    setActionError(null)
    void run(`${keyOf(server)}:detail`, async () => {
      const result = await props.store.call('detail', { ...target, name: server.name })
      if (!isServerDetail(result)) throw new Error('server detail has an unexpected shape')
      setEditor({ mode: 'edit', previousName: server.name, draft: draftFromDetail(result) })
    })
  }

  const save = (): void => {
    if (editor === null) return
    const invalid = validateDraft(editor.draft)
    if (invalid !== undefined) {
      setEditor({ ...editor, error: invalid === 'name' ? props.t('requiredName') : props.t('requiredConnection') })
      return
    }
    void run('save', async () => {
      await props.store.call('saveServer', {
        ...target,
        server: draftToServer(editor.draft),
        ...(editor.previousName === undefined ? {} : { previousName: editor.previousName }),
      })
      setEditor(null)
    })
  }

  const remove = (server: OverviewServer): void => {
    void run(`${keyOf(server)}:delete`, async () => {
      await props.store.call('deleteServer', { ...target, name: server.name })
    })
  }

  const toggleEnabled = (server: OverviewServer): void => {
    void run(`${keyOf(server)}:enable`, async () => {
      await props.store.call('setEnabled', { ...target, name: server.name, enabled: server.disabled })
    })
  }

  const error = actionError ?? snapshot.error ?? fileError
  const scopeHint = scope === 'profile' ? props.t('scopeHintProfile') : props.t('scopeHintWorkspace')

  const actionsFor = (server: OverviewServer): RowActions => ({
    onEdit: () => openEdit(server),
    onDelete: () => remove(server),
    onToggleEnabled: () => toggleEnabled(server),
    onAttempt: (attempt) =>
      setAttempts((current) => {
        const next = { ...current }
        if (attempt === undefined) delete next[keyOf(server)]
        else next[keyOf(server)] = attempt
        return next
      }),
    onRedirect: (next) => setRedirects((current) => ({ ...current, [keyOf(server)]: next })),
  })

  return (
    <div className="mcp-manager">
      <header className="mcp-manager-head">
        <div className="mcp-manager-head-copy">
          <h2 className="mcp-manager-heading">{props.t('title')}</h2>
          <p className="mcp-manager-muted">{props.t('description')}</p>
        </div>
        <div className="mcp-manager-actions">
          <button type="button" className="mcp-manager-button" onClick={() => void refresh()}>
            {props.t('refresh')}
          </button>
          <button type="button" className="mcp-manager-button" onClick={() => void props.store.reconnect()}>
            {props.t('retry')}
          </button>
          <button type="button" className="mcp-manager-button mcp-manager-primary" onClick={openAdd}>
            {props.t('addServer')}
          </button>
        </div>
      </header>

      <div className="mcp-manager-tabrow">
        <nav className="mcp-manager-tabs" role="tablist" aria-label={props.t('title')}>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'profile'}
            className={`mcp-manager-tab${scope === 'profile' ? ' mcp-manager-tab-active' : ''}`}
            onClick={() => {
              setRequestedScope('profile')
              setEditor(null)
              setActionError(null)
            }}
          >
            {props.t('profile')}
            <span className="mcp-manager-tab-count">{data?.profile.servers.length ?? 0}</span>
          </button>
          {workspaces.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={scope === entry.id}
              className={`mcp-manager-tab${scope === entry.id ? ' mcp-manager-tab-active' : ''}`}
              onClick={() => {
                setRequestedScope(entry.id)
                setEditor(null)
                setActionError(null)
              }}
            >
              {entry.title}
              <span className="mcp-manager-tab-count">{entry.servers.length}</span>
            </button>
          ))}
        </nav>
        <p className="mcp-manager-scope-hint">{scopeHint}</p>
      </div>

      <div className="mcp-manager-body" aria-live="polite">
        {error === undefined || error === null ? null : (
          <p className="mcp-manager-error mcp-manager-banner" role="alert">
            {error}
          </p>
        )}
        {snapshot.loading && data === undefined ? <p className="mcp-manager-muted">{props.t('loadError')}</p> : null}

        {editor === null ? null : (
          <Editor
            mode={editor.mode}
            initialName={editor.previousName}
            draft={editor.draft}
            error={editor.error}
            busy={busyKey === 'save'}
            onChange={(draft) => setEditor({ ...editor, draft, error: undefined })}
            onSave={save}
            onCancel={() => setEditor(null)}
            t={props.t}
          />
        )}

        {servers.length === 0 ? (
          <EmptyState path={path} t={props.t} onAdd={openAdd} />
        ) : (
          <div className="mcp-manager-table">
            <div className="mcp-manager-table-head" aria-hidden="true">
              <span>{props.t('name')}</span>
              <span>{props.t('type')}</span>
              <span>{props.t('status')}</span>
              <span>{props.t('tools')}</span>
              <span>{props.t('actions')}</span>
            </div>
            <ul className="mcp-manager-list">
              {servers.map((server) => (
                <ServerRow
                  key={`${scope}:${server.name}`}
                  server={server}
                  target={target}
                  expanded={expanded[keyOf(server)] === true}
                  onToggle={() =>
                    setExpanded((current) => ({ ...current, [keyOf(server)]: current[keyOf(server)] !== true }))
                  }
                  actions={actionsFor(server)}
                  t={props.t}
                  store={props.store}
                  run={(action) => run(`${keyOf(server)}:action`, action)}
                  busy={busyKey !== null && busyKey.startsWith(`${keyOf(server)}:`)}
                  tokenValue={tokenValues[keyOf(server)] ?? ''}
                  onTokenValue={(next) => setTokenValues((current) => ({ ...current, [keyOf(server)]: next }))}
                  attempt={attempts[keyOf(server)]}
                  redirect={redirects[keyOf(server)] ?? ''}
                />
              ))}
            </ul>
          </div>
        )}

        <footer className="mcp-manager-footer">
          {servers.length === 0 ? null : (
            <span>
              {props.t('filePath')}: <code>{path}</code>
            </span>
          )}
          {snapshot.updatedAt === undefined ? null : (
            <span>
              {props.t('updated')} {new Date(snapshot.updatedAt).toLocaleTimeString()}
            </span>
          )}
        </footer>
      </div>
    </div>
  )
}
