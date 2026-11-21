/** Tool naming and result projection shared by discovery and execution. */

import { createHash } from 'node:crypto'
import type { CallToolResult, Tool } from '@modelcontextprotocol/client'
import type { ContentBlock, JsonValue, ToolDefinition } from './types.js'
import { isRecord } from './schema.js'

const MAX_NAME_LENGTH = 64
const INVALID_CHARS = /[^A-Za-z0-9_-]/g
const HASH_LENGTH = 12

/** Stable, model-facing name for one server tool. Mirrors the official bridge. */
export function publicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_NAME_LENGTH) return joined
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}

/** Convert an arbitrary MCP JSON value into the canonical JSON vocabulary. */
function toJson(value: unknown, depth = 0): JsonValue {
  if (depth > 12) return null
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map((entry) => toJson(entry, depth + 1))
  if (isRecord(value)) {
    const out: Record<string, JsonValue> = {}
    for (const [key, entry] of Object.entries(value)) out[key] = toJson(entry, depth + 1)
    return out
  }
  return null
}

/** Convert arbitrary MCP content into bounded visible text. */
export function extractText(content: readonly unknown[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (!isRecord(block)) {
      parts.push(JSON.stringify(block))
      continue
    }
    const type = block.type
    if (type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    } else if (type === 'image') {
      const mime = typeof block.mimeType === 'string' ? block.mimeType : 'unknown'
      parts.push(`[image omitted: ${mime}]`)
    } else if (type === 'audio') {
      parts.push('[audio omitted]')
    } else if (type === 'resource_link' && typeof block.uri === 'string') {
      const name = typeof block.name === 'string' ? block.name : 'resource'
      parts.push(`[${name}: ${block.uri}]`)
    } else {
      parts.push(`[${String(type ?? 'content')} omitted]`)
    }
  }
  return parts.join('\n')
}

function toParameters(schema: unknown): Record<string, unknown> {
  return isRecord(schema) ? { ...schema } : { type: 'object', properties: {} }
}

/** Project one raw MCP call result into the canonical bridge and direct-tool value. */
export function callToolValue(result: CallToolResult): JsonValue {
  const value: Record<string, JsonValue> = { content: toJson(result.content) }
  if (result.structuredContent !== undefined) value.structuredContent = toJson(result.structuredContent)
  return value
}

/** The output contract shared by direct tools and mcp_call. */
export function callResultOutput(): ToolDefinition['output'] {
  return {
    schema: {
      type: 'object',
      properties: {
        content: { type: 'array', items: {} },
        structuredContent: {},
      },
      required: ['content'],
      additionalProperties: false,
    },
    render(_args: unknown, value: JsonValue): ContentBlock[] {
      if (!isRecord(value) || !Array.isArray(value.content)) return [{ type: 'text', text: '' }]
      return [{ type: 'text', text: extractText(value.content) }]
    },
  }
}

/** Build one DSH tool definition bound to a connected MCP client. */
export function buildToolDefinition(
  serverName: string,
  raw: Tool,
  call: (args: Record<string, unknown>, signal: AbortSignal, timeoutMs: number) => Promise<CallToolResult>,
  timeoutMs: number,
): ToolDefinition {
  return {
    name: publicToolName(serverName, raw.name),
    description: raw.description ?? '',
    parameters: toParameters(raw.inputSchema),
    output: callResultOutput(),
    timeoutMs,
    async execute(args: unknown, exec): Promise<JsonValue> {
      const payload = isRecord(args) ? args : {}
      const result = await call(payload, exec.signal, timeoutMs)
      if (result.isError === true) throw new Error(extractText(result.content))
      return callToolValue(result)
    },
  }
}
