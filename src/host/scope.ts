/** Effective server list for one workspace. */

import type { ProfileFile, ScopeKind, ServerDef, WorkspaceFile } from './types.js'

export interface EffectiveServer {
  readonly def: ServerDef
  readonly scope: ScopeKind
}

/** Merge profile and workspace lists: workspace entries shadow by name, disabled names drop. */
export function resolveEffective(profile: ProfileFile, workspace: WorkspaceFile | undefined): EffectiveServer[] {
  const disabled = new Set(workspace?.disableProfileServers ?? [])
  const workspaceNames = new Set((workspace?.servers ?? []).map((def) => def.name))
  const out: EffectiveServer[] = []
  for (const def of profile.servers) {
    if (disabled.has(def.name)) continue
    if (workspaceNames.has(def.name)) continue
    out.push({ def, scope: 'profile' })
  }
  for (const def of workspace?.servers ?? []) out.push({ def, scope: 'workspace' })
  return out
}
