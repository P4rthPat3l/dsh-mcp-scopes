/** Add or edit one server. */

import type { ReactElement, ReactNode } from 'react'
import type { ServerDetail } from './harness.js'

export interface Draft {
  name: string
  transport: 'stdio' | 'streamable-http'
  url: string
  command: string
  args: string
  cwd: string
  headers: string
  env: string
  authKind: 'none' | 'bearer' | 'oauth'
  credential: string
  scopes: string
  allow: string
  deny: string
  enabled: boolean
}

export const EMPTY_DRAFT: Draft = {
  name: '',
  transport: 'streamable-http',
  url: '',
  command: '',
  args: '',
  cwd: '',
  headers: '',
  env: '',
  authKind: 'none',
  credential: '',
  scopes: '',
  allow: '',
  deny: '',
  enabled: true,
}

function linesToRecord(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const colon = trimmed.indexOf(':')
    const equals = trimmed.indexOf('=')
    let split = -1
    if (colon >= 0 && (equals < 0 || colon < equals)) split = colon
    else if (equals >= 0) split = equals
    if (split <= 0) continue
    const key = trimmed.slice(0, split).trim()
    const value = trimmed.slice(split + 1).trim()
    if (key !== '') out[key] = value
  }
  return out
}

function recordToLines(record: Readonly<Record<string, string>> | undefined): string {
  if (record === undefined) return ''
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((part) => part !== '')
}

function splitList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

export function draftFromDetail(detail: ServerDetail): Draft {
  return {
    name: detail.name,
    transport: detail.transport,
    url: detail.url ?? '',
    command: detail.command ?? '',
    args: (detail.args ?? []).join(' '),
    cwd: detail.cwd ?? '',
    headers: recordToLines(detail.headers),
    env: recordToLines(detail.env),
    authKind: detail.auth.kind,
    credential: detail.auth.kind === 'bearer' ? (detail.auth.credential ?? '') : '',
    scopes: detail.auth.kind === 'oauth' ? (detail.auth.scopes ?? []).join(' ') : '',
    allow: (detail.toolPolicy?.allow ?? []).join(', '),
    deny: (detail.toolPolicy?.deny ?? []).join(', '),
    enabled: detail.disabled !== true,
  }
}

export function draftToServer(draft: Draft): Record<string, unknown> {
  const allow = splitList(draft.allow)
  const deny = splitList(draft.deny)
  const auth =
    draft.authKind === 'none'
      ? { kind: 'none' }
      : draft.authKind === 'bearer'
        ? { kind: 'bearer', ...(draft.credential.trim() === '' ? {} : { credential: draft.credential.trim() }) }
        : { kind: 'oauth', ...(splitList(draft.scopes).length === 0 ? {} : { scopes: splitList(draft.scopes) }) }
  return {
    name: draft.name.trim(),
    transport: draft.transport,
    ...(draft.transport === 'stdio'
      ? {
          command: draft.command.trim(),
          ...(splitWords(draft.args).length === 0 ? {} : { args: splitWords(draft.args) }),
          ...(draft.cwd.trim() === '' ? {} : { cwd: draft.cwd.trim() }),
          ...(Object.keys(linesToRecord(draft.env)).length === 0 ? {} : { env: linesToRecord(draft.env) }),
        }
      : {
          url: draft.url.trim(),
          ...(Object.keys(linesToRecord(draft.headers)).length === 0
            ? {}
            : { headers: linesToRecord(draft.headers) }),
        }),
    auth,
    disabled: !draft.enabled,
    ...(allow.length === 0 && deny.length === 0
      ? {}
      : { toolPolicy: { ...(allow.length === 0 ? {} : { allow }), ...(deny.length === 0 ? {} : { deny }) } }),
  }
}

export function validateDraft(draft: Draft): string | undefined {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(draft.name.trim())) return 'name'
  if (draft.transport === 'streamable-http' && draft.url.trim() === '') return 'connection'
  if (draft.transport === 'stdio' && draft.command.trim() === '') return 'connection'
  return undefined
}

interface FieldProps {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly children: ReactNode
}

function Field({ id, label, hint, children }: FieldProps): ReactElement {
  return (
    <div className="mcp-manager-field">
      <label className="mcp-manager-field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : <p className="mcp-manager-field-hint">{hint}</p>}
    </div>
  )
}

export interface EditorProps {
  readonly mode: 'add' | 'edit'
  readonly initialName?: string
  readonly draft: Draft
  readonly error?: string
  readonly busy: boolean
  readonly onChange: (next: Draft) => void
  readonly onSave: () => void
  readonly onCancel: () => void
  readonly t: (key: string) => string
}

export function Editor(props: EditorProps): ReactElement {
  const { draft, onChange, t } = props
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => onChange({ ...draft, [key]: value })
  const nameInvalid = draft.name.trim() !== '' && !/^[A-Za-z0-9_-]{1,32}$/.test(draft.name.trim())
  return (
    <form
      className="mcp-manager-editor"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSave()
      }}
    >
      <div className="mcp-manager-editor-head">
        <h3 className="mcp-manager-editor-title">
          {props.mode === 'add' ? t('addTitle') : `${t('editTitle')} · ${props.initialName ?? draft.name}`}
        </h3>
        <button type="button" className="mcp-manager-icon-button" onClick={props.onCancel} aria-label={t('cancel')}>
          ×
        </button>
      </div>

      {props.error === undefined ? null : (
        <p className="mcp-manager-error" role="alert">
          {props.error}
        </p>
      )}

      <div className="mcp-manager-form-grid">
        <Field id="mcp-manager-name" label={t('name')} hint={t('nameHint')}>
          <input
            id="mcp-manager-name"
            className="mcp-manager-input"
            value={draft.name}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={nameInvalid}
            onChange={(event) => set('name', event.target.value)}
          />
          {nameInvalid ? <p className="mcp-manager-field-error">{t('requiredName')}</p> : null}
        </Field>

        <Field id="mcp-manager-transport" label={t('transport')}>
          <div className="mcp-manager-segmented" role="group" aria-label={t('transport')}>
            <button
              type="button"
              className="mcp-manager-segment"
              aria-pressed={draft.transport === 'streamable-http'}
              onClick={() => set('transport', 'streamable-http')}
            >
              {t('transportHttp')}
            </button>
            <button
              type="button"
              className="mcp-manager-segment"
              aria-pressed={draft.transport === 'stdio'}
              onClick={() => set('transport', 'stdio')}
            >
              {t('transportStdio')}
            </button>
          </div>
        </Field>
      </div>

      {draft.transport === 'streamable-http' ? (
        <Field id="mcp-manager-url" label={t('url')}>
          <input
            id="mcp-manager-url"
            className="mcp-manager-input mcp-manager-mono"
            value={draft.url}
            placeholder="https://example.com/mcp"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => set('url', event.target.value)}
          />
        </Field>
      ) : (
        <div className="mcp-manager-form-grid">
          <Field id="mcp-manager-command" label={t('command')}>
            <input
              id="mcp-manager-command"
              className="mcp-manager-input mcp-manager-mono"
              value={draft.command}
              placeholder="npx"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => set('command', event.target.value)}
            />
          </Field>
          <Field id="mcp-manager-args" label={t('args')} hint={t('argsHint')}>
            <input
              id="mcp-manager-args"
              className="mcp-manager-input mcp-manager-mono"
              value={draft.args}
              placeholder="-y @modelcontextprotocol/server-filesystem"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => set('args', event.target.value)}
            />
          </Field>
        </div>
      )}

      <div className="mcp-manager-form-grid">
        <Field
          id="mcp-manager-headers"
          label={draft.transport === 'stdio' ? t('env') : t('headers')}
          hint={draft.transport === 'stdio' ? t('envHint') : t('headersHint')}
        >
          <textarea
            id="mcp-manager-headers"
            className="mcp-manager-textarea mcp-manager-mono"
            rows={3}
            spellCheck={false}
            value={draft.transport === 'stdio' ? draft.env : draft.headers}
            onChange={(event) =>
              set(draft.transport === 'stdio' ? 'env' : 'headers', event.target.value)
            }
          />
        </Field>
        <Field
          id="mcp-manager-auth"
          label={t('authentication')}
          hint={draft.authKind === 'bearer' ? t('credentialHint') : undefined}
        >
          <select
            id="mcp-manager-auth"
            className="mcp-manager-input"
            value={draft.authKind}
            onChange={(event) => set('authKind', event.target.value === 'oauth' ? 'oauth' : event.target.value === 'bearer' ? 'bearer' : 'none')}
          >
            <option value="none">{t('authNone')}</option>
            <option value="bearer">{t('authBearer')}</option>
            <option value="oauth">{t('authOAuth')}</option>
          </select>
          {draft.authKind === 'bearer' ? (
            <input
              className="mcp-manager-input mcp-manager-mono"
              aria-label={t('credentialRef')}
              placeholder={t('credentialRef')}
              value={draft.credential}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => set('credential', event.target.value)}
            />
          ) : null}
          {draft.authKind === 'oauth' ? (
            <input
              className="mcp-manager-input"
              aria-label={t('scopes')}
              placeholder={t('scopesHint')}
              value={draft.scopes}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => set('scopes', event.target.value)}
            />
          ) : null}
        </Field>
      </div>

      <div className="mcp-manager-form-grid">
        <Field id="mcp-manager-allow" label={t('allow')} hint={t('policyHint')}>
          <input
            id="mcp-manager-allow"
            className="mcp-manager-input mcp-manager-mono"
            value={draft.allow}
            placeholder="get*, list*"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => set('allow', event.target.value)}
          />
        </Field>
        <Field id="mcp-manager-deny" label={t('deny')}>
          <input
            id="mcp-manager-deny"
            className="mcp-manager-input mcp-manager-mono"
            value={draft.deny}
            placeholder="delete*, update*"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => set('deny', event.target.value)}
          />
        </Field>
      </div>

      <label className="mcp-manager-check">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => set('enabled', event.target.checked)}
        />
        <span>{t('enabled')}</span>
      </label>

      <div className="mcp-manager-editor-actions">
        <button type="button" className="mcp-manager-button" onClick={props.onCancel} disabled={props.busy}>
          {t('cancel')}
        </button>
        <button type="submit" className="mcp-manager-button mcp-manager-primary" disabled={props.busy}>
          {props.busy ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  )
}
