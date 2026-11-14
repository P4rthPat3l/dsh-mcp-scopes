/** Atomic JSON storage for the profile and workspace scopes. */

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseProfile, parseWorkspace, serializeProfile, serializeWorkspace } from './schema.js'
import type { ProfileFile, WorkspaceFile } from './types.js'

export interface ReadResult<T> {
  readonly file: T
  readonly error?: string
  readonly missing: boolean
}

const EMPTY_PROFILE: ProfileFile = { version: 1, servers: [] }

async function atomicWrite(path: string, text: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, text, { mode })
  await rename(temporary, path)
  await chmod(path, mode)
}

export class ConfigStore {
  constructor(readonly profilePath: string) {}

  workspacePath(workspaceDir: string): string {
    return join(workspaceDir, '.dsh', 'mcp.json')
  }

  async readProfile(): Promise<ReadResult<ProfileFile>> {
    return this.read(this.profilePath, parseProfile, EMPTY_PROFILE)
  }

  async readWorkspace(workspaceDir: string): Promise<ReadResult<WorkspaceFile>> {
    const empty: WorkspaceFile = { version: 1, servers: [] }
    return this.read(this.workspacePath(workspaceDir), parseWorkspace, empty)
  }

  async writeProfile(file: ProfileFile): Promise<void> {
    await atomicWrite(this.profilePath, `${JSON.stringify(serializeProfile(file), null, 2)}\n`, 0o600)
  }

  async writeWorkspace(workspaceDir: string, file: WorkspaceFile): Promise<void> {
    await atomicWrite(this.workspacePath(workspaceDir), `${JSON.stringify(serializeWorkspace(file), null, 2)}\n`, 0o644)
  }

  private async read<T>(
    path: string,
    parse: (text: string) => { ok: true; file: T } | { ok: false; error: string },
    empty: T,
  ): Promise<ReadResult<T>> {
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { file: empty, missing: true }
      return { file: empty, missing: false, error: `cannot read ${path}: ${String(error)}` }
    }
    const parsed = parse(text)
    if (!parsed.ok) return { file: empty, missing: false, error: parsed.error }
    return { file: parsed.file, missing: false }
  }
}
