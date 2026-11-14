#!/usr/bin/env node
/** Fake MCP server with a minimal OAuth authorization server for tests. */

import { createServer } from 'node:http'

let port = 0
const base = () => `http://127.0.0.1:${port}`
const tokens = new Set(['test-token', 'test-token-2'])

function json(response, status, body, headers = {}) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
    ...headers,
  })
  response.end(text)
}

function mcpReply(id, result) {
  return { jsonrpc: '2.0', id, result }
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', base())

  if (url.pathname.includes('oauth-protected-resource')) {
    json(response, 200, {
      resource: `${base()}/mcp`,
      authorization_servers: [base()],
      scopes_supported: ['read'],
      bearer_methods_supported: ['header'],
    })
    return
  }
  if (url.pathname.includes('oauth-authorization-server')) {
    json(response, 200, {
      issuer: base(),
      authorization_endpoint: `${base()}/authorize`,
      token_endpoint: `${base()}/token`,
      registration_endpoint: `${base()}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['read'],
    })
    return
  }
  if (url.pathname === '/register' && request.method === 'POST') {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      let body = {}
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        body = {}
      }
      json(response, 201, {
        client_id: 'test-client',
        client_id_issued_at: Math.floor(Date.now() / 1000),
        redirect_uris: body.redirect_uris ?? [],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      })
    })
    return
  }
  if (url.pathname === '/token' && request.method === 'POST') {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
      const grantType = form.get('grant_type')
      if (grantType === 'authorization_code') {
        if (form.get('code') !== 'test-code') {
          json(response, 400, { error: 'invalid_grant' })
          return
        }
        json(response, 200, {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'test-refresh',
          scope: 'read',
        })
        return
      }
      if (grantType === 'refresh_token') {
        json(response, 200, {
          access_token: 'test-token-2',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'test-refresh-2',
          scope: 'read',
        })
        return
      }
      json(response, 400, { error: 'unsupported_grant_type' })
    })
    return
  }
  if (url.pathname === '/authorize') {
    json(response, 400, { error: 'the test opens the callback directly' })
    return
  }

  if (url.pathname === '/mcp' && request.method === 'POST') {
    const authorization = request.headers.authorization
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!tokens.has(token)) {
      response.writeHead(401, {
        'www-authenticate': `Bearer resource_metadata="${base()}/.well-known/oauth-protected-resource"`,
        'content-type': 'application/json',
      })
      response.end(JSON.stringify({ error: 'unauthorized' }))
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
        response.writeHead(202, { 'mcp-session-id': 'oauth-session' }).end()
        return
      }
      let payload
      if (message.method === 'initialize') {
        payload = mcpReply(message.id, {
          protocolVersion: message.params?.protocolVersion ?? '2026-07-28',
          capabilities: { tools: {} },
          serverInfo: { name: 'oauth-fixture', version: '1.0.0' },
        })
      } else if (message.method === 'tools/list') {
        payload = mcpReply(message.id, {
          tools: [
            {
              name: 'whoami',
              description: 'Return the authorized identity',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        })
      } else if (message.method === 'tools/call') {
        payload = mcpReply(message.id, {
          content: [{ type: 'text', text: 'authorized with ' + token }],
        })
      } else {
        payload = mcpReply(message.id, {})
      }
      const text = JSON.stringify(payload)
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(text),
        'mcp-session-id': 'oauth-session',
      })
      response.end(text)
    })
    return
  }

  response.writeHead(404).end()
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  if (address !== null && typeof address === 'object') {
    port = address.port
    process.stdout.write(`${port}\n`)
  }
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
