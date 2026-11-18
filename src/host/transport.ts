/** Transport construction. Stdio children get the scrubbed parent environment. */

import { isAbsolute, resolve } from 'node:path'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { OAuthClientProvider, Transport } from '@modelcontextprotocol/client'
import type { ServerDef } from './types.js'
import { scrubbedParentEnv } from './env.js'

/**
 * Working directory for a stdio child. A workspace server runs in its workspace,
 * so a relative command, argument path, or explicit cwd resolves against the
 * project the config lives in. Profile servers keep the Harness process cwd.
 */
export function stdioCwd(server: ServerDef, workspaceDir: string | undefined): string | undefined {
  if (workspaceDir === undefined) return server.cwd
  const base = resolve(workspaceDir)
  if (server.cwd === undefined) return base
  return isAbsolute(server.cwd) ? server.cwd : resolve(base, server.cwd)
}

export function createTransport(
  server: ServerDef,
  headers: Record<string, string>,
  authProvider?: OAuthClientProvider,
  workspaceDir?: string,
): Transport {
  if (server.transport === 'stdio') {
    if (server.command === undefined) throw new Error('stdio server has no command')
    const cwd = stdioCwd(server, workspaceDir)
    return new StdioClientTransport({
      command: server.command,
      args: server.args === undefined ? [] : [...server.args],
      env: { ...scrubbedParentEnv(), ...server.env },
      ...(cwd === undefined ? {} : { cwd }),
    })
  }
  if (server.url === undefined) throw new Error('streamable-http server has no URL')
  return new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers },
    ...(authProvider === undefined ? {} : { authProvider }),
  })
}
