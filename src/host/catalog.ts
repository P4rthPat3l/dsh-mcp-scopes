/** Prompt catalog and BM25 search over MCP tools hidden behind the bridge. @module */

import type { Tool } from '@modelcontextprotocol/client'
import { isRecord } from './schema.js'

/** Token budget for the whole catalog block, estimated at 4 characters per token. */
export const CATALOG_BUDGET_TOKENS = 2_000

/** Characters per token used for every catalog estimate. */
const CHARACTERS_PER_TOKEN = 4

/** Longest description excerpt on one catalog line. */
const LINE_EXCERPT_CHARS = 120

/** Longest description excerpt in one search hit. */
const HIT_EXCERPT_CHARS = 300

/** Most search hits returned for one query. */
export const SEARCH_LIMIT = 10

/** BM25 constants, the values OpenCode validated over an 11k-tool catalog. */
const BM25_K1 = 1.2
const BM25_B = 0.75

/** Field weights: tool name, server name, description. */
const WEIGHT_NAME = 3
const WEIGHT_SERVER = 2
const WEIGHT_DESCRIPTION = 1

/** One tool as the catalog and search see it. */
export interface CatalogTool {
  readonly name: string
  readonly description: string
  readonly required: readonly string[]
}

/** One server's contribution to the catalog. */
export interface CatalogServer {
  readonly name: string
  readonly tools: readonly CatalogTool[]
}

/** Extract the model-relevant facts of one raw MCP tool. */
export function catalogToolOf(raw: Tool): CatalogTool {
  const schema = raw.inputSchema
  const required =
    isRecord(schema) && Array.isArray(schema.required)
      ? schema.required.filter((entry): entry is string => typeof entry === 'string')
      : []
  return { name: raw.name, description: raw.description ?? '', required }
}

/** The first sentence of a description, clipped to one line. */
export function firstSentence(text: string, limit: number): string {
  const flat = text.trim().replace(/\s+/g, ' ')
  if (flat === '') return ''
  const end = flat.search(/[.!?](\s|$)/)
  const sentence = end === -1 ? flat : flat.slice(0, end + 1)
  if (sentence.length <= limit) return sentence
  return sentence.slice(0, limit - 1).trimEnd() + '…'
}

type SectionForm = 'full' | 'names' | 'group'

function sortedTools(server: CatalogServer): readonly CatalogTool[] {
  return [...server.tools].sort((one, two) => (one.name < two.name ? -1 : one.name > two.name ? 1 : 0))
}

function sectionFor(server: CatalogServer, form: SectionForm): string {
  const tools = sortedTools(server)
  if (form === 'group') return `${server.name}: ${tools.length} tools; call mcp_search to list them`
  const lines = tools.map((tool) => {
    if (form === 'names') return `- ${tool.name}`
    const sentence = firstSentence(tool.description, LINE_EXCERPT_CHARS)
    return sentence === '' ? `- ${tool.name}` : `- ${tool.name}: ${sentence}`
  })
  return `${server.name} (${tools.length} tool${tools.length === 1 ? '' : 's'}${form === 'names' ? ', names only' : ''})
${lines.join('\n')}`
}

/**
 * Render the catalog block: every server, every tool name, under one token
 * budget. Oversized servers degrade one step at a time, largest first, from
 * full lines to names-only to a one-line group stub, so the block is a
 * deterministic function of the tool lists and stays prompt-cacheable.
 */
export function buildCatalog(servers: readonly CatalogServer[]): string {
  const ready = servers
    .filter((server) => server.tools.length > 0)
    .sort((one, two) => (one.name < two.name ? -1 : one.name > two.name ? 1 : 0))
  if (ready.length === 0) return ''
  const forms: SectionForm[] = ready.map(() => 'full')
  const render = (): string =>
    ready.map((server, index) => sectionFor(server, forms[index])).join('\n\n')
  while (Math.ceil(render().length / CHARACTERS_PER_TOKEN) > CATALOG_BUDGET_TOKENS) {
    let degrade = -1
    for (let index = 0; index < ready.length; index += 1) {
      if (forms[index] === 'group') continue
      if (degrade === -1 || ready[index].tools.length > ready[degrade].tools.length) {
        degrade = index
      }
    }
    if (degrade === -1) break
    forms[degrade] = forms[degrade] === 'full' ? 'names' : 'group'
  }
  return render()
}

interface SearchDocument {
  readonly server: string
  readonly tool: CatalogTool
  readonly weighted: ReadonlyMap<string, number>
  readonly length: number
}

function tokenize(text: string): readonly string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term !== '')
}

function weightedTerms(server: string, tool: CatalogTool): ReadonlyMap<string, number> {
  const weighted = new Map<string, number>()
  const add = (text: string, weight: number): void => {
    for (const term of tokenize(text)) weighted.set(term, (weighted.get(term) ?? 0) + weight)
  }
  add(tool.name, WEIGHT_NAME)
  add(server, WEIGHT_SERVER)
  add(tool.description, WEIGHT_DESCRIPTION)
  return weighted
}

/** One ranked search result. */
export interface SearchHit {
  readonly server: string
  readonly tool: CatalogTool
}

function buildDocuments(servers: readonly CatalogServer[]): readonly SearchDocument[] {
  const documents: SearchDocument[] = []
  for (const server of servers) {
    for (const tool of sortedTools(server)) {
      const weighted = weightedTerms(server.name, tool)
      documents.push({ server: server.name, tool, weighted, length: [...weighted.values()].reduce((sum, value) => sum + value, 0) })
    }
  }
  return documents
}

/** Rank tools against one query with BM25 over name, server, and description. */
export function searchTools(servers: readonly CatalogServer[], query: string, limit = SEARCH_LIMIT): readonly SearchHit[] {
  const terms = [...new Set(tokenize(query))]
  if (terms.length === 0) return []
  const documents = buildDocuments(servers)
  if (documents.length === 0) return []
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / documents.length
  const scores: { document: SearchDocument; score: number }[] = []
  for (const document of documents) {
    let score = 0
    for (const term of terms) {
      const tf = document.weighted.get(term) ?? 0
      if (tf === 0) continue
      const matching = documents.filter((other) => (other.weighted.get(term) ?? 0) > 0).length
      const idf = Math.log(1 + (documents.length - matching + 0.5) / (matching + 0.5))
      score += idf * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + (BM25_B * document.length) / averageLength)))
    }
    if (score > 0) scores.push({ document, score })
  }
  scores.sort((one, two) => two.score - one.score || (one.document.tool.name < two.document.tool.name ? -1 : 1))
  return scores.slice(0, limit).map((hit) => ({ server: hit.document.server, tool: hit.document.tool }))
}

/** One search hit as a model-readable line. */
export function formatHit(hit: SearchHit): string {
  const required = hit.tool.required.length === 0 ? '' : ` [required: ${hit.tool.required.join(', ')}]`
  return `${hit.server}/${hit.tool.name}: ${firstSentence(hit.tool.description, HIT_EXCERPT_CHARS)}${required}`
}
