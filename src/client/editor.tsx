/** Draft conversion and the add/edit form, built from Harness primitives. */

import { useRef, useState, type ReactElement } from 'react'
import { Button, Checkbox, Input, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ServerDetail } from './harness.js'
import type { AuthConfig, ServerDef } from '../host/types.js'

export type DraftTransport = 'auto' | 'stdio' | 'streamable-http'
export type DraftAuth = 'none' | 'bearer' | 'oauth'

export interface Draft {
  readonly connection: string
  readonly name: string
  readonly transport: DraftTransport
  readonly headers: string
  readonly authKind: DraftAuth
  readonly credential: string
  readonly scopes: string
  readonly allow: string
  readonly deny: string
  readonly enabled: boolean
}

export const EMPTY_DRAFT: Draft = {
  connection: '',
  name: '',
  transport: 'auto',
  headers: '',
  authKind: 'none',
  credential: '',
  scopes: '',
  allow: '',
  deny: '',
  enabled: true,
}

/** Field-level validation results, keyed by the field that owns the message. */
export interface DraftProblems {
  readonly connection?: true
  readonly url?: true
  readonly name?: true
  readonly nameTaken?: true
}

const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i
const GENERIC_HOSTS = new Set(['mcp', 'www', 'api', 'server', 'app'])

export function looksLikeUrl(value: string): boolean {
  return URL_PATTERN.test(value.trim())
}

export function resolvedTransport(draft: Draft): 'stdio' | 'streamable-http' {
  if (draft.transport !== 'auto') return draft.transport
  return looksLikeUrl(draft.connection) ? 'streamable-http' : 'stdio'
}

/** Turn a URL or command into a usable server name. Returns '' when nothing sensible remains. */
export function deriveName(connection: string): string {
  const value = connection.trim()
  if (value === '') return ''
  if (looksLikeUrl(value)) {
    try {
      const host = new URL(value).hostname.toLowerCase()
      if (/^[0-9.]+$/.test(host) || host === 'localhost') return 'local-server'
      const labels = host.split('.').filter((label) => label !== '')
      const chosen = labels.find((label) => !GENERIC_HOSTS.has(label)) ?? labels[0] ?? ''
      return clean(chosen)
    } catch {
      return ''
    }
  }
  const parts = value.split(/\s+/).filter((part) => part !== '' && !part.startsWith('-'))
  const candidate =
    parts.find((part) => part.includes('/') || part.startsWith('@')) ?? parts[parts.length - 1] ?? ''
  const tail = candidate.split('/').filter((part) => part !== '').pop() ?? candidate
  return clean(tail.replace(/^server-/, '').replace(/\.[a-z0-9]+$/i, ''))
}

function clean(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

/** Keep a derived name unique inside one scope by appending a counter. */
export function uniqueName(base: string, taken: readonly string[]): string {
  if (base === '') return ''
  if (!taken.includes(base)) return base
  for (let index = 2; index < 100; index += 1) {
    const suffix = '-' + String(index)
    const candidate = base.slice(0, 32 - suffix.length) + suffix
    if (!taken.includes(candidate)) return candidate
  }
  return base
}

function splitCommand(value: string): { command: string; args: string[] } {
  const parts = value.trim().split(/\s+/).filter((part) => part !== '')
  return { command: parts[0] ?? '', args: parts.slice(1) }
}

function parsePairs(text: string, separator: ':' | '='): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const index = trimmed.indexOf(separator)
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    if (key !== '') out[key] = value
  }
  return out
}

function formatPairs(record: Readonly<Record<string, string>>, separator: ':' | '='): string {
  const joiner = separator === ':' ? ': ' : '='
  return Object.entries(record)
    .map(([key, value]) => key + joiner + value)
    .join('\n')
}

function listOf(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function authFor(draft: Draft, existing?: AuthConfig): AuthConfig {
  if (draft.authKind === 'none') return { kind: 'none' }
  if (draft.authKind === 'bearer') {
    const credential = draft.credential.trim()
    return credential === '' ? { kind: 'bearer' } : { kind: 'bearer', credential }
  }
  const scopes = listOf(draft.scopes)
  return {
    kind: 'oauth',
    ...(scopes.length === 0 ? {} : { scopes }),
    ...(existing?.kind === 'oauth' && existing.clientId !== undefined ? { clientId: existing.clientId } : {}),
    ...(existing?.kind === 'oauth' && existing.clientSecret !== undefined
      ? { clientSecret: existing.clientSecret }
      : {}),
  }
}

/** Validate every field before the draft becomes a server definition. */
export function validateDraft(draft: Draft, existingNames: readonly string[] = []): DraftProblems {
  const connection = draft.connection.trim()
  const name = draft.name.trim()
  const problems: { connection?: true; url?: true; name?: true; nameTaken?: true } = {}
  if (connection === '') problems.connection = true
  else if (resolvedTransport(draft) === 'streamable-http') {
    try {
      const url = new URL(connection)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') problems.url = true
    } catch {
      problems.url = true
    }
  }
  if (!NAME_PATTERN.test(name)) problems.name = true
  else if (existingNames.includes(name)) problems.nameTaken = true
  return problems
}

/** Build the internal server definition from a validated draft, keeping unmodeled fields. */
export function draftToServer(draft: Draft, existing?: ServerDef): ServerDef {
  const name = draft.name.trim()
  const transport = resolvedTransport(draft)
  const allow = listOf(draft.allow)
  const deny = listOf(draft.deny)
  const base = {
    name,
    transport,
    auth: authFor(draft, existing?.auth),
    disabled: !draft.enabled,
    ...(allow.length === 0 && deny.length === 0
      ? {}
      : { toolPolicy: { ...(allow.length === 0 ? {} : { allow }), ...(deny.length === 0 ? {} : { deny }) } }),
    ...(existing?.timeouts === undefined ? {} : { timeouts: existing.timeouts }),
  }
  if (transport === 'stdio') {
    const command = splitCommand(draft.connection)
    const env = parsePairs(draft.headers, '=')
    return {
      ...base,
      command: command.command,
      ...(command.args.length === 0 ? {} : { args: command.args }),
      ...(Object.keys(env).length === 0 ? {} : { env }),
      ...(existing?.cwd === undefined ? {} : { cwd: existing.cwd }),
    }
  }
  const headers = parsePairs(draft.headers, ':')
  return {
    ...base,
    url: draft.connection.trim(),
    ...(Object.keys(headers).length === 0 ? {} : { headers }),
  }
}

/** Build a draft from the stored detail of an existing server. */
export function draftFromDetail(detail: ServerDetail): Draft {
  const connection =
    detail.transport === 'stdio' ? [detail.command ?? '', ...(detail.args ?? [])].join(' ').trim() : (detail.url ?? '')
  const headers =
    detail.transport === 'stdio' ? formatPairs(detail.env ?? {}, '=') : formatPairs(detail.headers ?? {}, ':')
  const auth = detail.auth
  return {
    connection,
    name: detail.name,
    transport: detail.transport,
    headers,
    authKind: auth.kind,
    credential: auth.kind === 'bearer' ? (auth.credential ?? '') : '',
    scopes: auth.kind === 'oauth' ? (auth.scopes ?? []).join(' ') : '',
    allow: (detail.toolPolicy?.allow ?? []).join(', '),
    deny: (detail.toolPolicy?.deny ?? []).join(', '),
    enabled: detail.disabled !== true,
  }
}

export interface EditorProps extends Record<string, unknown> {
  readonly mode: 'add' | 'edit'
  readonly draft: Draft
  readonly existingNames: readonly string[]
  readonly error?: string
  readonly onChange: (draft: Draft) => void
  readonly onSave: () => void
  readonly t: (key: string) => string
}

/** The add or edit form. The modal footer submits it by id. */
export function Editor(props: EditorProps): ReactElement {
  const { draft, t } = props
  const [advanced, setAdvanced] = useState(props.mode === 'edit')
  const [nameTouched, setNameTouched] = useState(props.mode === 'edit')
  const [problems, setProblems] = useState<DraftProblems>({})
  const connectionRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const transport = resolvedTransport(draft)
  const detected = looksLikeUrl(draft.connection) ? t('remoteDetected') : t('localDetected')

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    props.onChange({ ...draft, [key]: value })
    setProblems({})
  }

  const changeTransport = (value: DraftTransport): void => {
    props.onChange(
      value === 'stdio'
        ? { ...draft, transport: value, authKind: 'none', credential: '', scopes: '' }
        : { ...draft, transport: value },
    )
    setProblems({})
  }

  const changeConnection = (value: string): void => {
    const nextName = nameTouched ? draft.name : uniqueName(deriveName(value), props.existingNames)
    props.onChange({ ...draft, connection: value, name: nextName })
    setProblems({})
  }

  const submit = (): void => {
    const next = validateDraft(draft, props.existingNames)
    setProblems(next)
    if (next.connection === true || next.url === true) {
      connectionRef.current?.focus()
      return
    }
    if (next.name === true || next.nameTaken === true) {
      nameRef.current?.focus()
      return
    }
    props.onSave()
  }

  const connectionBad = problems.connection === true || problems.url === true
  const nameBad = problems.name === true || problems.nameTaken === true

  return (
    <form
      id="mcp-server-form"
      className="mcp-form"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {props.error === undefined ? null : (
        <p className="mcp-form-error" role="alert">
          {props.error}
        </p>
      )}

      <div className="mcp-field">
        <label className="mcp-field-label" htmlFor="mcp-connection">
          {t('addressOrCommand')}
        </label>
        <Input
          id="mcp-connection"
          ref={connectionRef}
          className="mcp-input"
          data-modal-autofocus
          value={draft.connection}
          placeholder={t('addressPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={connectionBad || undefined}
          aria-describedby="mcp-connection-hint"
          onChange={(event) => changeConnection(event.target.value)}
        />
        <span
          id="mcp-connection-hint"
          className={connectionBad ? 'mcp-hint mcp-hint-error' : 'mcp-hint'}
          {...(connectionBad ? { role: 'alert' } : {})}
        >
          {problems.connection === true
            ? t('requiredConnection')
            : problems.url === true
              ? t('requiredUrl')
              : draft.connection.trim() === ''
                ? t('addressHint')
                : detected}
        </span>
      </div>

      <div className="mcp-field">
        <label className="mcp-field-label" htmlFor="mcp-name">
          {t('name')}
        </label>
        <Input
          id="mcp-name"
          ref={nameRef}
          className="mcp-input"
          value={draft.name}
          placeholder={t('namePlaceholder')}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={nameBad || undefined}
          aria-describedby="mcp-name-hint"
          onChange={(event) => {
            setNameTouched(true)
            set('name', event.target.value)
          }}
        />
        <span
          id="mcp-name-hint"
          className={nameBad ? 'mcp-hint mcp-hint-error' : 'mcp-hint'}
          {...(nameBad ? { role: 'alert' } : {})}
        >
          {problems.name === true ? t('invalidName') : problems.nameTaken === true ? t('nameTaken') : t('nameHint')}
        </span>
      </div>

      <div className="mcp-form-tools">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={advanced}
          aria-controls="mcp-advanced"
          onClick={() => setAdvanced(!advanced)}
        >
          {advanced ? t('hideAdvanced') : t('advanced')}
        </Button>
      </div>

      {advanced ? (
        <div className="mcp-form-advanced" id="mcp-advanced">
          <div className="mcp-grid2">
            <div className="mcp-field">
              <span className="mcp-field-label">{t('transport')}</span>
              <SegmentedControl<DraftTransport>
                id="mcp-transport"
                value={draft.transport}
                label={t('transport')}
                options={[
                  { value: 'auto', label: t('transportAuto') },
                  { value: 'stdio', label: t('transportLocal') },
                  { value: 'streamable-http', label: t('transportRemote') },
                ]}
                onChange={changeTransport}
              />
            </div>
            {transport === 'stdio' ? null : (
              <div className="mcp-field">
                <span className="mcp-field-label">{t('authentication')}</span>
                <SegmentedControl<DraftAuth>
                  id="mcp-auth"
                  value={draft.authKind}
                  label={t('authentication')}
                  options={[
                    { value: 'none', label: t('authNone') },
                    { value: 'bearer', label: t('authBearer') },
                    { value: 'oauth', label: t('authOAuth') },
                  ]}
                  onChange={(value) => set('authKind', value)}
                />
              </div>
            )}
          </div>

          {draft.authKind === 'bearer' ? (
            <div className="mcp-field">
              <label className="mcp-field-label" htmlFor="mcp-credential">
                {t('credentialRef')}
              </label>
              <Input
                id="mcp-credential"
                className="mcp-input"
                value={draft.credential}
                placeholder="ENACTON_MCP_TOKEN"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="mcp-credential-hint"
                onChange={(event) => set('credential', event.target.value)}
              />
              <span className="mcp-hint" id="mcp-credential-hint">
                {t('credentialHint')}
              </span>
            </div>
          ) : draft.authKind === 'oauth' ? (
            <div className="mcp-field">
              <label className="mcp-field-label" htmlFor="mcp-scopes">
                {t('scopes')}
              </label>
              <Input
                id="mcp-scopes"
                className="mcp-input"
                value={draft.scopes}
                placeholder="read write"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="mcp-scopes-hint"
                onChange={(event) => set('scopes', event.target.value)}
              />
              <span className="mcp-hint" id="mcp-scopes-hint">
                {t('scopesHint')}
              </span>
            </div>
          ) : null}

          <div className="mcp-field">
            <label className="mcp-field-label" htmlFor="mcp-headers">
              {transport === 'stdio' ? t('environment') : t('headers')}
            </label>
            <textarea
              id="mcp-headers"
              className="mcp-textarea"
              value={draft.headers}
              rows={3}
              spellCheck={false}
              placeholder={transport === 'stdio' ? 'API_KEY=value' : 'Authorization: Bearer ...'}
              aria-describedby="mcp-headers-hint"
              onChange={(event) => set('headers', event.target.value)}
            />
            <span className="mcp-hint" id="mcp-headers-hint">
              {transport === 'stdio' ? t('envHint') : t('headersHint')}
            </span>
          </div>

          <div className="mcp-grid2">
            <div className="mcp-field">
              <label className="mcp-field-label" htmlFor="mcp-allow">
                {t('allow')}
              </label>
              <Input
                id="mcp-allow"
                className="mcp-input"
                value={draft.allow}
                placeholder="get*, list*"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="mcp-policy-hint"
                onChange={(event) => set('allow', event.target.value)}
              />
            </div>
            <div className="mcp-field">
              <label className="mcp-field-label" htmlFor="mcp-deny">
                {t('deny')}
              </label>
              <Input
                id="mcp-deny"
                className="mcp-input"
                value={draft.deny}
                placeholder="delete*, update*"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="mcp-policy-hint"
                onChange={(event) => set('deny', event.target.value)}
              />
            </div>
          </div>
          <span className="mcp-hint" id="mcp-policy-hint">
            {t('policyHint')}
          </span>

          <Checkbox checked={draft.enabled} label={t('enabled')} onChange={(next) => set('enabled', next)} />
        </div>
      ) : null}

    </form>
  )
}
