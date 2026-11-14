/** Local equivalents of the two small Harness helpers this plugin needs. */

import { homedir } from 'node:os'
import { basename, join } from 'node:path'

/** The active profile name: `$DSH_PROFILE`, the host's profile directory argument, else `default`. */
export function profileName(): string {
  if (process.env.DSH_PROFILE !== undefined && process.env.DSH_PROFILE !== '') return process.env.DSH_PROFILE
  for (const arg of process.argv) {
    if (arg.includes('/profiles/') || arg.includes('\\profiles\\')) {
      const name = basename(arg)
      if (name !== '' && name !== 'profiles') return name
    }
  }
  return 'default'
}

/** The Harness home: `$DSH_HOME`, else `~/.dsh`. */
export function dshHomePath(...parts: string[]): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, ...parts)
}

const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const KEY_SEGMENT_PATTERN = /^[a-z][a-z0-9-]*$/

/** Brand an environment-style credential reference. */
export function credentialRef(value: string): string {
  if (!REF_PATTERN.test(value)) throw new TypeError(`credential ref "${value}" must match ${String(REF_PATTERN)}`)
  return value
}

/** Brand a `<scope>/<id>` credential record key. */
export function credentialKey(scope: string, id: string): string {
  for (const segment of [scope, id]) {
    if (!KEY_SEGMENT_PATTERN.test(segment)) {
      throw new TypeError(`credential key segment "${segment}" must match ${String(KEY_SEGMENT_PATTERN)}`)
    }
  }
  return `${scope}/${id}`
}

/** Turn any stable scope id into a valid credential key segment. */
export function credentialId(scopeId: string): string {
  const normalized = scopeId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const slug = /^[a-z]/.test(normalized) ? normalized : `s-${normalized}`
  return slug.slice(0, 48)
}
