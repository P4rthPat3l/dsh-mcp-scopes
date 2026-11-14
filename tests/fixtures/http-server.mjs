#!/usr/bin/env node
/** Minimal MCP Streamable HTTP server for tests. */

import { createServer } from 'node:http'

const TOOLS = [
  {
    name: 'echo',
    description: 'Echo text back',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
  },
]

function reply(id, result) {
  return { jsonrpc: '2.0', id, result }
}

const server = createServer((request, response) => {
  if (request.method !== 'POST') {
    response.writeHead(405).end()
    return
  }
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    let message
    try {
      message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      response.writeHead(400).end()
      return
    }
    if (message.id === undefined) {
      response.writeHead(202).end()
      return
    }
    let payload = {}
    if (message.method === 'initialize') {
      payload = reply(message.id, {
        protocolVersion: message.params?.protocolVersion ?? '2026-07-28',
        capabilities: { tools: {} },
        serverInfo: { name: 'fixture-http', version: '1.0.0' },
      })
    } else if (message.method === 'tools/list') {
      payload = reply(message.id, { tools: TOOLS })
    } else if (message.method === 'tools/call') {
      payload = reply(message.id, {
        content: [{ type: 'text', text: `http: ${String(message.params?.arguments?.text ?? '')}` }],
      })
    } else {
      payload = reply(message.id, {})
    }
    const body = JSON.stringify(payload)
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      'mcp-session-id': 'fixture-session',
    })
    response.end(body)
  })
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  if (address !== null && typeof address === 'object') {
    process.stdout.write(`${String(address.port)}\n`)
  }
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
