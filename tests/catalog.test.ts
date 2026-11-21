import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCatalog, firstSentence, formatHit, searchTools, CATALOG_BUDGET_TOKENS, type CatalogServer } from '../src/host/catalog.js'

function server(name: string, count: number, description: (index: number) => string): CatalogServer {
  return {
    name,
    tools: Array.from({ length: count }, (_unused, index) => ({
      name: `tool_${String(index).padStart(3, '0')}`,
      description: description(index),
      required: index === 0 ? ['ID'] : [],
    })),
  }
}

test('EXP-011: the catalog lists every tool sorted with one-line descriptions', () => {
  const catalog = buildCatalog([
    {
      name: 'zoho-cliq',
      tools: [
        { name: 'b_tool', description: 'Second alphabetically. More detail never shown.', required: [] },
        { name: 'a_tool', description: 'First alphabetically.', required: [] },
      ],
    },
  ])
  assert.match(catalog, /zoho-cliq \(2 tools\)/)
  assert.match(catalog, /- a_tool: First alphabetically\./)
  assert.match(catalog, /- b_tool: Second alphabetically\./)
  assert.doesNotMatch(catalog, /never shown/)
})

test('EXP-011: the catalog is a deterministic function of its input', () => {
  const input = [server('b-srv', 3, (index) => `Does thing ${index}. Plus more.`), server('a-srv', 2, (index) => `Other ${index}.`)]
  assert.equal(buildCatalog(input), buildCatalog([...input].reverse()))
})

test('EXP-011: an oversized server degrades to names-only within the budget', () => {
  const catalog = buildCatalog([server('big', 300, (index) => `Verbose description of tool ${index} that goes on.`)])
  assert.match(catalog, /big \(300 tools, names only\)/)
  assert.match(catalog, /- tool_000/)
  assert.match(catalog, /- tool_299/)
  assert.ok(catalog.length <= CATALOG_BUDGET_TOKENS * 4)
})

test('EXP-011: a server whose names alone exceed the budget collapses to a group stub', () => {
  const huge: CatalogServer = {
    name: 'giant',
    tools: Array.from({ length: 1_000 }, (_unused, index) => ({
      name: `a_very_long_tool_name_number_${String(index).padStart(4, '0')}`,
      description: 'Description.',
      required: [],
    })),
  }
  const catalog = buildCatalog([huge])
  assert.match(catalog, /giant: 1000 tools; call mcp_search to list them/)
  assert.doesNotMatch(catalog, /a_very_long_tool_name_number_0000/)
  assert.ok(catalog.length <= CATALOG_BUDGET_TOKENS * 4)
})

test('EXP-008: search ranks the matching tool above weak matches and carries required parameters', () => {
  const servers: CatalogServer[] = [
    {
      name: 'zoho-cliq',
      tools: [
        { name: 'send_message_to_chat', description: 'Send a message to a chat.', required: [] },
        { name: 'add_reaction', description: 'Add an emoji reaction to a message in a chat.', required: ['CHAT_ID', 'MESSAGE_ID'] },
      ],
    },
    { name: 'crmai', tools: [{ name: 'createTask', description: 'Create a new task in a project.', required: ['projectId'] }] },
  ]
  const hits = searchTools(servers, 'send message chat')
  assert.ok(hits.length > 0)
  assert.equal(hits[0]?.tool.name, 'send_message_to_chat')
  const hitLine = formatHit(hits.find((hit) => hit.tool.name === 'add_reaction') as { server: string; tool: { name: string; description: string; required: string[] } })
  assert.match(hitLine, /zoho-cliq\/add_reaction: Add an emoji reaction.*\[required: CHAT_ID, MESSAGE_ID\]/)
})

test('EXP-008: a query with no matching terms returns no hits', () => {
  const servers: CatalogServer[] = [{ name: 'srv', tools: [{ name: 'echo', description: 'Echo text back.', required: [] }] }]
  assert.deepEqual(searchTools(servers, 'kubernetes cluster'), [])
  assert.deepEqual(searchTools(servers, '   '), [])
})

test('EXP-008: firstSentence clips at the first sentence and the character limit', () => {
  assert.equal(firstSentence('Add a reaction. Second sentence.', 120), 'Add a reaction.')
  const clipped = firstSentence('A description without terminal punctuation that is much longer than any line should ever be', 40)
  assert.ok(clipped.length <= 40)
  assert.ok(clipped.endsWith('…'))
})
