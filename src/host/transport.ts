/** Transport construction. Stdio children get the scrubbed parent environment. */

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { OAuthClientProvider, Transport } from '@modelcontextprotocol/client'
import type { ServerDef } from './types.js'
import { scrubbedParentEnv } from './env.js'

export function createTransport(server: ServerDef, headers: Record<string, string>, authProvider?: OAuthClientProvider): Transport {
  if (server.transport === 'stdio') {
    if (server.command === undefined) throw new Error('stdio server has no command')
    return new StdioClientTransport({
      command: server.command,
      args: server.args === undefined ? [] : [...server.args],
      env: { ...scrubbedParentEnv(), ...server.env },
      ...(server.cwd === undefined ? {} : { cwd: server.cwd }),
    })
  }
  if (server.url === undefined) throw new Error('streamable-http server has no URL')
  return new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers },
    ...(authProvider === undefined ? {} : { authProvider }),
  })
}
