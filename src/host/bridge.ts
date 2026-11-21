/** The three model-facing bridge tools that reach catalog-exposed MCP servers. @module */

import type { CallToolResult, Client, Tool } from '@modelcontextprotocol/client'
import { catalogToolOf, formatHit, SEARCH_LIMIT, searchTools, type CatalogServer } from './catalog.js'
import { callResultOutput, callToolValue, extractText } from './naming.js'
import { DEFAULT_CALL_TIMEOUT_MS, isRecord, toolAllowed } from './schema.js'
import type { ContentBlock, JsonValue, ToolDefinition } from './types.js'
import type { Entry } from './connection.js'

const BRIDGE_SEARCH = 'mcp_search'
const BRIDGE_DESCRIBE = 'mcp_describe'
const BRIDGE_CALL = 'mcp_call'

/** Most tools one mcp_describe call returns. */
const DESCRIBE_LIMIT = 10

/** Live catalog entries attached to one agent, resolved again on every call. */
export interface BridgeScope {
  entries(): readonly Entry[]
}

interface Resolved {
  readonly entry: Entry
  readonly client: Client
  readonly raw: Tool
}

function resolve(scope: BridgeScope, server: string, tool: string): Resolved {
  const entries = scope.entries()
  const entry = entries.find((candidate) => candidate.def.name === server)
  if (entry === undefined) {
    const names = entries.map((candidate) => candidate.def.name).sort().join(', ')
    throw new Error(
      names === ''
        ? 'no MCP catalog server is attached to this agent'
        : `no catalog server named "${server}" is attached; attached: ${names}`,
    )
  }
  if (entry.status !== 'ready' || entry.client === undefined) {
    throw new Error(`server "${server}" is not connected (status: ${entry.status})`)
  }
  const raw = entry.rawTools.find((candidate) => candidate.name === tool)
  if (raw === undefined) throw new Error(`server "${server}" offers no tool named "${tool}"`)
  if (!toolAllowed(entry.def.toolPolicy, tool)) {
    throw new Error(`tool "${tool}" is denied by the "${server}" tool policy`)
  }
  return { entry, client: entry.client, raw }
}

function catalogServers(scope: BridgeScope): readonly CatalogServer[] {
  const servers: CatalogServer[] = []
  for (const entry of scope.entries()) {
    if (entry.status !== 'ready') continue
    const tools = entry.rawTools
      .filter((raw) => toolAllowed(entry.def.toolPolicy, raw.name))
      .map(catalogToolOf)
    if (tools.length > 0) servers.push({ name: entry.def.name, tools })
  }
  return servers
}

function textOutput(): ToolDefinition['output'] {
  return {
    schema: { type: 'string' },
    render(_args: unknown, value: JsonValue): ContentBlock[] {
      return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]
    },
  }
}

/** Build mcp_search, mcp_describe, and mcp_call bound to one agent's entries. */
export function buildBridgeTools(scope: BridgeScope): ToolDefinition[] {
  const search: ToolDefinition = {
    name: BRIDGE_SEARCH,
    description:
      'Find one tool across the connected MCP catalog servers by what it does. ' +
      'Returns up to ' + String(SEARCH_LIMIT) + ' lines "server/tool: description [required: ...]". ' +
      'Run a result with mcp_call(server, tool, arguments).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the tool should do, in plain words' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: textOutput(),
    async execute(args: unknown): Promise<JsonValue> {
      const query = isRecord(args) && typeof args.query === 'string' ? args.query.trim() : ''
      if (query === '') return 'mcp_search needs a non-empty "query". Describe what the tool should do in plain words.'
      const servers = catalogServers(scope)
      if (servers.length === 0) {
        return 'No MCP catalog server is connected right now; retry once the servers finish connecting.'
      }
      const hits = searchTools(servers, query)
      if (hits.length === 0) {
        return (
          'No tool matches "' + query + '". Try different words, or browse the full tool catalog ' +
          'in the "MCP tool bridge" prompt section.'
        )
      }
      return hits.map(formatHit).join('\n')
    },
  }

  const describe: ToolDefinition = {
    name: BRIDGE_DESCRIBE,
    description: 'Return the exact description and JSON input schema of up to 10 MCP tools, each named "server/tool".',
    parameters: {
      type: 'object',
      properties: {
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: '"server/tool" names from the catalog or mcp_search, at most 10',
        },
      },
      required: ['tools'],
      additionalProperties: false,
    },
    output: textOutput(),
    async execute(args: unknown): Promise<JsonValue> {
      const names = isRecord(args) && Array.isArray(args.tools) ? args.tools : []
      if (names.length === 0 || !names.every((name): name is string => typeof name === 'string')) {
        throw new Error('mcp_describe needs "tools": an array of "server/tool" strings')
      }
      if (names.length > DESCRIBE_LIMIT) {
        throw new Error('mcp_describe accepts at most ' + String(DESCRIBE_LIMIT) + ' tools per call')
      }
      const blocks = names.map((name) => {
        const slash = name.indexOf('/')
        if (slash <= 0) throw new Error('"' + name + '" is not a "server/tool" name')
        const resolved = resolve(scope, name.slice(0, slash), name.slice(slash + 1))
        const description = resolved.raw.description ?? ''
        return name + '\n' + description + '\n' + JSON.stringify(resolved.raw.inputSchema)
      })
      return blocks.join('\n\n')
    },
  }

  const call: ToolDefinition = {
    name: BRIDGE_CALL,
    description:
      'Run one tool from a connected MCP server. "server" and "tool" come from the "MCP tool bridge" catalog ' +
      'or mcp_search. "arguments" must follow the tool schema from mcp_describe; the server validates ' +
      'and reports argument errors.',
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'Server name as listed in the catalog' },
        tool: { type: 'string', description: 'Tool name as listed for that server' },
        arguments: { type: 'object', description: 'Arguments for the tool' },
      },
      required: ['server', 'tool', 'arguments'],
      additionalProperties: false,
    },
    output: callResultOutput(),
    async execute(args: unknown, exec): Promise<JsonValue> {
      if (!isRecord(args)) throw new Error('mcp_call needs an object with "server", "tool", and "arguments"')
      const server = typeof args.server === 'string' ? args.server : ''
      const tool = typeof args.tool === 'string' ? args.tool : ''
      if (server === '' || tool === '') {
        throw new Error('mcp_call needs non-empty string fields "server" and "tool"')
      }
      const callArguments = isRecord(args.arguments) ? args.arguments : {}
      const resolved = resolve(scope, server, tool)
      const timeoutMs = resolved.entry.def.timeouts?.callMs ?? DEFAULT_CALL_TIMEOUT_MS
      const result: CallToolResult = await resolved.client.callTool(
        { name: tool, arguments: callArguments },
        { signal: exec.signal, timeout: timeoutMs, toolDefinition: resolved.raw },
      )
      if (result.isError === true) throw new Error(extractText(result.content))
      return callToolValue(result)
    },
  }

  return [search, describe, call]
}
