/** Draft conversion and the add/edit form, built from Harness primitives. */

import { useState, type ReactElement } from 'react'
import {
  Button,
  Checkbox,
  Input,
  SegmentedControl,
  Tag,
  IconCloseOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
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

export type DraftProblem = 'name' | 'connection' | 'url'
export type SaveProblem = DraftProblem | 'save'

const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export function resolvedTransport(draft: Draft): 'stdio' | 'streamable-http' {
  if (draft.transport !== 'auto') return draft.transport
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(draft.connection.trim()) ? 'streamable-http' : 'stdio'
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
  return Object.entries(record).map(([key, value]) => `${key}${joiner}${value}`).join('\n')
}

function listOf(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function authFor(draft: Draft): AuthConfig {
  if (draft.authKind === 'none') return { kind: 'none' }
  if (draft.authKind === 'bearer') {
    const credential = draft.credential.trim()
    return credential === '' ? { kind: 'bearer' } : { kind: 'bearer', credential }
  }
  const scopes = listOf(draft.scopes)
  return { kind: 'oauth', ...(scopes.length === 0 ? {} : { scopes }) }
}

/** Validate a draft before it becomes a server definition. */
export function validateDraft(draft: Draft): DraftProblem | undefined {
  if (!NAME_PATTERN.test(draft.name.trim())) return 'name'
  if (draft.connection.trim() === '') return 'connection'
  if (resolvedTransport(draft) === 'streamable-http') {
    try {
      const url = new URL(draft.connection.trim())
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'url'
    } catch {
      return 'url'
    }
  }
  return undefined
}

/** Build the internal server definition from a validated draft. */
export function draftToServer(draft: Draft): ServerDef {
  const name = draft.name.trim()
  const transport = resolvedTransport(draft)
  const allow = listOf(draft.allow)
  const deny = listOf(draft.deny)
  const base = {
    name,
    transport,
    auth: authFor(draft),
    disabled: !draft.enabled,
    ...(allow.length === 0 && deny.length === 0
      ? {}
      : { toolPolicy: { ...(allow.length === 0 ? {} : { allow }), ...(deny.length === 0 ? {} : { deny }) } }),
  }
  if (transport === 'stdio') {
    const command = splitCommand(draft.connection)
    const env = parsePairs(draft.headers, '=')
    return {
      ...base,
      command: command.command,
      ...(command.args.length === 0 ? {} : { args: command.args }),
      ...(Object.keys(env).length === 0 ? {} : { env }),
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
    detail.transport === 'stdio'
      ? [detail.command ?? '', ...(detail.args ?? [])].join(' ').trim()
      : (detail.url ?? '')
  const headers =
    detail.transport === 'stdio'
      ? formatPairs(detail.env ?? {}, '=')
      : formatPairs(detail.headers ?? {}, ':')
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
  readonly scopeLabel: string
  readonly error?: string
  readonly busy: boolean
  readonly onChange: (draft: Draft) => void
  readonly onSave: () => void
  readonly onCancel: () => void
  readonly t: (key: string) => string
}

/** Add or edit one server. The connection field is the only required one. */
export function Editor(props: EditorProps): ReactElement {
  const { draft, t } = props
  const [advanced, setAdvanced] = useState(props.mode === 'edit')
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    props.onChange({ ...draft, [key]: value })
  }
  const transport = resolvedTransport(draft)
  const detected = /^[a-z][a-z0-9+.-]*:\/\//i.test(draft.connection.trim()) ? t('remoteDetected') : t('localDetected')

  return (
    <form
      className="mcp-form"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSave()
      }}
    >
      <div className="mcp-form-head">
        <div className="mcp-form-title">
          <h3>{props.mode === 'add' ? t('addTitle') : t('editTitle')}</h3>
          <Tag tone="neutral">
            {props.mode === 'add' ? t('addingTo') + ' ' + props.scopeLabel : draft.name}
          </Tag>
        </div>
        <Button
          type="button"
          variant="toolbar"
          size="sm"
          aria-label={t('close')}
          title={t('close')}
          icon={<IconCloseOutlineRegular size={14} />}
          onClick={props.onCancel}
          disabled={props.busy}
        />
      </div>

      <label className="mcp-field">
        <span className="mcp-field-label">{t('addressOrCommand')}</span>
        <Input
          className="mcp-input"
          value={draft.connection}
          placeholder={t('addressPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => set('connection', event.target.value)}
        />
        <span className="mcp-hint">{draft.connection.trim() === '' ? t('addressHint') : detected}</span>
      </label>

      <div className="mcp-form-tools">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdvanced(!advanced)}>
          {advanced ? t('hideAdvanced') : t('advanced')}
        </Button>
      </div>

      {advanced ? (
        <div className="mcp-form-advanced">
          <div className="mcp-grid2">
            <label className="mcp-field">
              <span className="mcp-field-label">{t('name')}</span>
              <Input
                className="mcp-input"
                value={draft.name}
                placeholder={t('namePlaceholder')}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => set('name', event.target.value)}
              />
              <span className="mcp-hint">{t('nameHint')}</span>
            </label>
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
                onChange={(value) => set('transport', value)}
              />
            </div>
          </div>

          <label className="mcp-field">
            <span className="mcp-field-label">{transport === 'stdio' ? t('environment') : t('headers')}</span>
            <textarea
              className="mcp-textarea"
              value={draft.headers}
              rows={3}
              spellCheck={false}
              placeholder={transport === 'stdio' ? 'API_KEY=value' : 'Authorization: Bearer ...'}
              onChange={(event) => set('headers', event.target.value)}
            />
            <span className="mcp-hint">{transport === 'stdio' ? t('envHint') : t('headersHint')}</span>
          </label>

          <div className="mcp-grid2">
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
              <label className="mcp-field">
                <span className="mcp-field-label">{t('credentialRef')}</span>
                <Input
                  className="mcp-input"
                  value={draft.credential}
                  placeholder="ENACTON_MCP_TOKEN"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => set('credential', event.target.value)}
                />
                <span className="mcp-hint">{t('credentialHint')}</span>
              </label>
            ) : draft.authKind === 'oauth' ? (
              <label className="mcp-field">
                <span className="mcp-field-label">{t('scopes')}</span>
                <Input
                  className="mcp-input"
                  value={draft.scopes}
                  placeholder="read write"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => set('scopes', event.target.value)}
                />
                <span className="mcp-hint">{t('scopesHint')}</span>
              </label>
            ) : null}
          </div>

          <div className="mcp-grid2">
            <label className="mcp-field">
              <span className="mcp-field-label">{t('allow')}</span>
              <Input
                className="mcp-input"
                value={draft.allow}
                placeholder="get*, list*"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => set('allow', event.target.value)}
              />
            </label>
            <label className="mcp-field">
              <span className="mcp-field-label">{t('deny')}</span>
              <Input
                className="mcp-input"
                value={draft.deny}
                placeholder="delete*, update*"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => set('deny', event.target.value)}
              />
            </label>
          </div>
          <span className="mcp-hint">{t('policyHint')}</span>

          <Checkbox
            checked={draft.enabled}
            label={t('enabled')}
            onChange={(next) => set('enabled', next)}
          />
        </div>
      ) : null}

      {props.error === undefined ? null : (
        <p className="mcp-form-error" role="alert">
          {props.error}
        </p>
      )}

      <div className="mcp-form-foot">
        <Button type="button" variant="ghost" onClick={props.onCancel} disabled={props.busy}>
          {t('cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={props.busy}>
          {props.busy ? t('saving') : props.mode === 'add' ? t('addServer') : t('save')}
        </Button>
      </div>
    </form>
  )
}
