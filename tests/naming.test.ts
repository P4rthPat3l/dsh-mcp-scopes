import assert from 'node:assert/strict'
import test from 'node:test'
import { extractText, publicToolName } from '../src/host/naming.js'

test('BR-004: clean names keep the mcp__<server>__<tool> shape', () => {
  assert.equal(publicToolName('enacton-crm', 'getContact'), 'mcp__enacton-crm__getContact')
})

test('BR-004: invalid characters are replaced', () => {
  const name = publicToolName('server', 'list.contacts')
  assert.equal(name.startsWith('mcp__server__list_contacts'), true)
  assert.ok(name.length <= 64)
})

test('BR-004: overlong names end in a stable twelve-hex suffix', () => {
  const long = 'a'.repeat(80)
  const first = publicToolName('server', long)
  const second = publicToolName('server', long)
  assert.equal(first, second)
  assert.equal(first.length, 64)
  assert.match(first, /_[0-9a-f]{12}$/)
})

test('BR-004: distinct identities do not collapse after truncation', () => {
  const a = publicToolName('server', `${'a'.repeat(80)}1`)
  const b = publicToolName('server', `${'a'.repeat(80)}2`)
  assert.notEqual(a, b)
})

test('AC-009: text content is preserved and unsupported blocks become diagnostics', () => {
  const text = extractText([
    { type: 'text', text: 'hello' },
    { type: 'image', mimeType: 'image/png', data: 'x' },
    { type: 'resource_link', name: 'doc', uri: 'file:///doc' },
  ])
  assert.equal(text, 'hello\n[image omitted: image/png]\n[doc: file:///doc]')
})
