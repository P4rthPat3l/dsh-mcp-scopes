/** Draft conversion and the add/edit form, built from Harness primitives. */

import { useRef, useState, type ClipboardEvent, type ReactElement } from 'react'
import {
  Button,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconPlusOutlineRegular,
  IconTrashOutlineRegular,
  Input,
  SegmentedControl,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ServerDetail } from './harness.js'
import type { AuthConfig, ServerDef } from '../host/types.js'

export type DraftKind = 'local' | 'remote'
export type DraftAuth = 'none' | 'bearer' | 'oauth'
export type DraftExposure = 'catalog' | 'direct'

/** One key and value row in the headers or environment editor. */
export interface PairEntry {
  readonly key: string
  readonly value: string
}

export interface Draft {
  readonly kind: DraftKind
  readonly connection: string
  readonly name: string
  readonly headers: readonly PairEntry[]
  readonly env: readonly PairEntry[]
  readonly authKind: DraftAuth
  readonly credential: string
  readonly scopes: string
  readonly allow: string
  readonly deny: string
  readonly enabled: boolean
  readonly exposure: DraftExposure
}

export const EMPTY_DRAFT: Draft = {
  kind: 'remote',
  connection: '',
  name: '',
  headers: [],
  env: [],
  authKind: 'none',
  credential: '',
  scopes: '',
  allow: '',
  deny: '',
  enabled: true,
  exposure: 'catalog',
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

/** Split a command field into one argument per line. */
export function commandLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** Split a pasted shell line into arguments, keeping quoted words together. */
export function splitCommandLine(text: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (const char of text) {
    if (quote !== null) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      if (current !== '') {
        out.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current !== '') out.push(current)
  return out
}

/** Parse a pasted block of KEY=value or Name: value lines. */
export function parsePairBlock(text: string, separator: ':' | '='): PairEntry[] {
  const out: PairEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf(separator)
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    if (key !== '') out.push({ key, value })
  }
  return out
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
  const parts = value.split(/[\s\n]+/).filter((part) => part !== '' && !part.startsWith('-'))
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

function pairRecord(entries: readonly PairEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of entries) {
    const key = entry.key.trim()
    if (key !== '') out[key] = entry.value.trim()
  }
  return out
}

function entriesOf(record: Readonly<Record<string, string>> | undefined): PairEntry[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }))
}

function listOf(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function authFor(draft: Draft, existing?: AuthConfig): AuthConfig {
  if (draft.kind === 'local' || draft.authKind === 'none') return { kind: 'none' }
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
  else if (draft.kind === 'remote') {
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
  const kind = draft.kind
  const allow = listOf(draft.allow)
  const deny = listOf(draft.deny)
  const base = {
    name,
    transport: kind === 'local' ? ('stdio' as const) : ('streamable-http' as const),
    auth: authFor(draft, existing?.auth),
    disabled: !draft.enabled,
    exposure: draft.exposure,
    ...(allow.length === 0 && deny.length === 0
      ? {}
      : { toolPolicy: { ...(allow.length === 0 ? {} : { allow }), ...(deny.length === 0 ? {} : { deny }) } }),
    ...(existing?.timeouts === undefined ? {} : { timeouts: existing.timeouts }),
  }
  if (kind === 'local') {
    const argv = commandLines(draft.connection)
    const env = pairRecord(draft.env)
    return {
      ...base,
      command: argv[0] ?? '',
      ...(argv.length < 2 ? {} : { args: argv.slice(1) }),
      ...(Object.keys(env).length === 0 ? {} : { env }),
      ...(existing?.cwd === undefined ? {} : { cwd: existing.cwd }),
    }
  }
  const headers = pairRecord(draft.headers)
  return {
    ...base,
    url: draft.connection.trim(),
    ...(Object.keys(headers).length === 0 ? {} : { headers }),
  }
}

/** Build a draft from the stored detail of an existing server. */
export function draftFromDetail(detail: ServerDetail): Draft {
  const kind: DraftKind = detail.transport === 'stdio' ? 'local' : 'remote'
  const connection =
    kind === 'local' ? [detail.command ?? '', ...(detail.args ?? [])].join('\n').trim() : (detail.url ?? '')
  const auth = detail.auth
  return {
    kind,
    connection,
    name: detail.name,
    headers: entriesOf(detail.headers),
    env: entriesOf(detail.env),
    authKind: auth.kind,
    credential: auth.kind === 'bearer' ? (auth.credential ?? '') : '',
    scopes: auth.kind === 'oauth' ? (auth.scopes ?? []).join(' ') : '',
    allow: (detail.toolPolicy?.allow ?? []).join(', '),
    deny: (detail.toolPolicy?.deny ?? []).join(', '),
    enabled: detail.disabled !== true,
    exposure: detail.exposure === 'direct' ? 'direct' : 'catalog',
  }
}

interface PairEditorProps {
  readonly kind: 'headers' | 'env'
  readonly entries: readonly PairEntry[]
  readonly t: (key: string) => string
  readonly onChange: (entries: readonly PairEntry[]) => void
}

/** Key and value rows with add, remove, reveal, and block paste. */
function PairEditor(props: PairEditorProps): ReactElement {
  const { kind, entries, t } = props
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set())
  const [pasteFailed, setPasteFailed] = useState(false)
  const env = kind === 'env'

  const update = (index: number, field: 'key' | 'value', value: string): void => {
    const next = entries.map((entry, at) => (at === index ? { ...entry, [field]: value } : entry))
    props.onChange(next)
  }

  const add = (): void => {
    props.onChange([...entries, { key: '', value: '' }])
  }

  const remove = (index: number): void => {
    props.onChange(entries.filter((_, at) => at !== index))
    setRevealed((current) => {
      const next = new Set(current)
      next.delete(index)
      return next
    })
  }

  const toggle = (index: number): void => {
    setRevealed((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const paste = (): void => {
    setPasteFailed(false)
    const clipboard = navigator.clipboard
    if (clipboard === undefined || typeof clipboard.readText !== 'function') {
      setPasteFailed(true)
      return
    }
    void clipboard.readText().then(
      (text) => {
        const parsed = parsePairBlock(text, env ? '=' : ':').map((entry) => ({
          key: env ? entry.key.toUpperCase().replace(/[^A-Z0-9_]/g, '_') : entry.key.trimStart(),
          value: entry.value,
        }))
        if (parsed.length === 0) {
          setPasteFailed(true)
          return
        }
        const merged = [...entries]
        for (const pair of parsed) {
          const at = merged.findIndex((entry) => entry.key === pair.key)
          if (at === -1) merged.push(pair)
          else merged[at] = pair
        }
        props.onChange(merged)
      },
      () => setPasteFailed(true),
    )
  }

  const transform = (value: string): string =>
    env ? value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') : value.trimStart()

  return (
    <div className="mcp-pairs">
      <div className="mcp-pairs-head">
        <span className="mcp-pairs-title">
          <span className="mcp-field-label">{env ? t('environment') : t('headers')}</span>
          <span className="mcp-pairs-count">({entries.length})</span>
        </span>
        <Button variant="ghost" size="sm" type="button" onClick={paste}>
          {env ? t('pasteEnv') : t('pasteHeaders')}
        </Button>
      </div>
      {entries.map((entry, index) => (
        <div className="mcp-pair-row" key={index}>
          <Input
            className="mcp-pair-key"
            value={entry.key}
            placeholder={env ? t('envKey') : t('headerName')}
            aria-label={`${env ? t('envKey') : t('headerName')} ${index + 1}`}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => update(index, 'key', transform(event.target.value))}
          />
          <Input
            className="mcp-pair-value"
            type={revealed.has(index) ? 'text' : 'password'}
            value={entry.value}
            placeholder={env ? t('envValue') : t('headerValue')}
            aria-label={`${env ? t('envValue') : t('headerValue')} ${index + 1}`}
            autoComplete="new-password"
            spellCheck={false}
            onChange={(event) => update(index, 'value', event.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            type="button"
            aria-pressed={revealed.has(index)}
            aria-label={`${revealed.has(index) ? t('hideValue') : t('showValue')} ${entry.key || index + 1}`}
            onClick={() => toggle(index)}
          >
            {revealed.has(index) ? t('hideValue') : t('showValue')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            aria-label={`${t('removeRow')} ${entry.key || index + 1}`}
            icon={<IconTrashOutlineRegular size={13} />}
            onClick={() => remove(index)}
          />
        </div>
      ))}
      <div className="mcp-pairs-add">
        <Button
          variant="outline"
          size="sm"
          type="button"
          icon={<IconPlusOutlineRegular size={13} />}
          onClick={add}
        >
          {env ? t('addVariable') : t('addHeader')}
        </Button>
      </div>
      <span className="mcp-hint">{env ? t('envPlainText') : t('headersPlainText')}</span>
      {pasteFailed ? (
        <span className="mcp-hint mcp-hint-error" role="alert">
          {t('pasteFailed')}
        </span>
      ) : null}
    </div>
  )
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
  const commandRef = useRef<HTMLTextAreaElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const local = draft.kind === 'local'
  const args = commandLines(draft.connection)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    props.onChange({ ...draft, [key]: value })
    setProblems({})
  }

  const changeKind = (value: DraftKind): void => {
    if (value === draft.kind) return
    props.onChange({ ...draft, kind: value, connection: '', name: nameTouched ? draft.name : '' })
    setProblems({})
  }

  const changeConnection = (value: string): void => {
    const nextName = nameTouched ? draft.name : uniqueName(deriveName(value), props.existingNames)
    props.onChange({ ...draft, connection: value, name: nextName })
    setProblems({})
  }

  const pasteCommand = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const parts = splitCommandLine(event.clipboardData.getData('text'))
    if (parts.length < 2) return
    event.preventDefault()
    const field = event.currentTarget
    const start = field.selectionStart ?? draft.connection.length
    const end = field.selectionEnd ?? start
    const before = draft.connection.slice(0, start)
    const after = draft.connection.slice(end)
    const prefix = before === '' || before.endsWith('\n') ? '' : '\n'
    const suffix = after === '' || after.startsWith('\n') ? '' : '\n'
    changeConnection(before + prefix + parts.join('\n') + suffix + after)
  }

  const submit = (): void => {
    const next = validateDraft(draft, props.existingNames)
    setProblems(next)
    if (next.connection === true || next.url === true) {
      if (local) commandRef.current?.focus()
      else connectionRef.current?.focus()
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
  const connectionMessage = connectionBad
    ? local
      ? t('requiredCommand')
      : t('requiredUrl')
    : local
      ? t('commandHint')
      : t('urlHint')

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
        <span className="mcp-field-label">{t('connection')}</span>
        <SegmentedControl<DraftKind>
          id="mcp-kind"
          value={draft.kind}
          label={t('connection')}
          options={[
            { value: 'local', label: t('kindLocal') },
            { value: 'remote', label: t('kindRemote') },
          ]}
          onChange={changeKind}
        />
      </div>

      {local ? (
        <div className="mcp-field">
          <label className="mcp-field-label" htmlFor="mcp-connection">
            {t('command')}
          </label>
          <textarea
            id="mcp-connection"
            ref={commandRef}
            className="mcp-textarea mcp-command"
            data-modal-autofocus
            rows={4}
            value={draft.connection}
            placeholder={t('commandPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={connectionBad || undefined}
            aria-describedby="mcp-connection-hint"
            onChange={(event) => changeConnection(event.target.value)}
            onPaste={pasteCommand}
          />
          {args.length === 0 ? null : (
            <span className="mcp-args-count">
              {args.length} {args.length === 1 ? t('argumentWillSave') : t('argumentsWillSave')}
            </span>
          )}
          <span
            id="mcp-connection-hint"
            className={connectionBad ? 'mcp-hint mcp-hint-error' : 'mcp-hint'}
            {...(connectionBad ? { role: 'alert' } : {})}
          >
            {connectionMessage}
          </span>
        </div>
      ) : (
        <div className="mcp-field">
          <label className="mcp-field-label" htmlFor="mcp-connection">
            {t('serverUrl')}
          </label>
          <Input
            id="mcp-connection"
            ref={connectionRef}
            className="mcp-input"
            data-modal-autofocus
            type="url"
            value={draft.connection}
            placeholder={t('urlPlaceholder')}
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
            {connectionMessage}
          </span>
        </div>
      )}

      <div className="mcp-field">
        <label className="mcp-field-label" htmlFor="mcp-name">
          {t('name')}
        </label>
        <Input
          id="mcp-name"
          ref={nameRef}
          className="mcp-input"
          value={draft.name}
          placeholder={local ? t('namePlaceholderLocal') : t('namePlaceholderRemote')}
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

      <button
        type="button"
        className="mcp-advanced-toggle"
        aria-expanded={advanced}
        aria-controls="mcp-advanced"
        onClick={() => setAdvanced(!advanced)}
      >
        <span className="mcp-advanced-label">{t('advanced')}</span>
        <span className="mcp-advanced-summary">{local ? t('advancedLocal') : t('advancedRemote')}</span>
        {advanced ? (
          <IconChevronDownOutlineRegular size={14} />
        ) : (
          <IconChevronRightOutlineRegular size={14} />
        )}
      </button>

      {advanced ? (
        <div className="mcp-form-advanced" id="mcp-advanced">
          {local ? null : (
            <>
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
              <PairEditor
                kind="headers"
                entries={draft.headers}
                t={t}
                onChange={(entries) => set('headers', entries)}
              />
            </>
          )}

          {local ? (
            <PairEditor kind="env" entries={draft.env} t={t} onChange={(entries) => set('env', entries)} />
          ) : null}

          <div className="mcp-field">
            <span className="mcp-field-label">{t('exposure')}</span>
            <SegmentedControl<DraftExposure>
              id="mcp-exposure"
              value={draft.exposure}
              label={t('exposure')}
              options={[
                { value: 'catalog', label: t('exposureCatalog') },
                { value: 'direct', label: t('exposureDirect') },
              ]}
              onChange={(value) => set('exposure', value)}
            />
            <span className="mcp-hint">{t('exposureHint')}</span>
          </div>

          <div className="mcp-field">
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
          </div>

          <div className="mcp-enabled">
            <Switch checked={draft.enabled} label={t('enabled')} onChange={(next) => set('enabled', next)} />
            <div className="mcp-enabled-text">
              <span className="mcp-enabled-label">{t('enabled')}</span>
              <span className="mcp-hint">{t('enabledHint')}</span>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  )
}
