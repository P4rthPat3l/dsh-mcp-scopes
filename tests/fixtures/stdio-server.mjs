#!/usr/bin/env node
/** Minimal MCP stdio server for tests: initialize, tools/list, tools/call. */

import { createInterface } from 'node:readline'

const TOOLS = [
  {
    name: 'echo',
    description: 'Echo text back',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'fail',
    description: 'Always fails',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cwd',
    description: 'Report the working directory of this process',
    inputSchema: { type: 'object', properties: {} },
  },
]

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

const lines = createInterface({ input: process.stdin })
lines.on('line', (line) => {
  if (line.trim() === '') return
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.id === undefined) return
  if (message.method === 'initialize') {
    respond(message.id, {
      protocolVersion: message.params?.protocolVersion ?? '2026-07-28',
      capabilities: { tools: {} },
      serverInfo: { name: 'fixture-stdio', version: '1.0.0' },
      instructions:
        process.env.FIXTURE_VERBOSE_INSTRUCTIONS === '1'
          ? 'x'.repeat(40_000)
          : 'Use echo for a quick self-test.',
    })
    return
  }
  if (message.method === 'ping') {
    respond(message.id, {})
    return
  }
  if (message.method === 'tools/list') {
    respond(message.id, { tools: TOOLS })
    return
  }
  if (message.method === 'tools/call') {
    const name = message.params?.name
    if (name === 'echo') {
      respond(message.id, {
        content: [{ type: 'text', text: `echo: ${String(message.params?.arguments?.text ?? '')}` }],
      })
      return
    }
    if (name === 'fail') {
      respond(message.id, { content: [{ type: 'text', text: 'boom' }], isError: true })
      return
    }
    if (name === 'cwd') {
      respond(message.id, { content: [{ type: 'text', text: `cwd: ${process.cwd()}` }] })
      return
    }
    respond(message.id, { content: [{ type: 'text', text: 'unknown tool' }], isError: true })
    return
  }
  respond(message.id, {})
})
