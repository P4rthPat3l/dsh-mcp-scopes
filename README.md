# MCP servers for DeepSeek Harness

Connect external MCP servers from the Host, scope them to a profile or a workspace, and manage them from Settings.

## What it does

- Discovers tools over stdio and Streamable HTTP and registers them as `mcp__<server>__<tool>`.
- Two scopes. Profile servers come from `$DSH_HOME/plugins/mcp-manager/<profile>.json`; workspace servers come from `<workspace>/.dsh/mcp.json`.
- A workspace entry shadows a profile entry with the same name, and `disableProfileServers` hides inherited servers for that workspace only.
- Tools register in each Agent's scope, so a workspace's servers never appear in another workspace's sessions.
- Bearer tokens come from the credentials store: an environment-style reference in the `Authorization` header, or a stored record.
- A Settings section lists every server with a status pill, type and auth chips, search, a labeled Details control that opens its tools and credential actions, and a row actions menu. Servers are added, edited, enabled, disabled, and deleted in either scope.
- The add and edit form asks for Local command or Remote URL, takes one argument per line, and edits headers or environment variables as key and value rows.
- OAuth sign-in opens a browser tab, uses PKCE and dynamic client registration, refreshes tokens, and falls back to a pasted redirect URL when the browser cannot reach the loopback callback.
- Bearer tokens can be pasted in the page after saving a server; the value is stored in the credentials store and never returned to the page.
- Per-server `toolPolicy` allows and denies tools by wildcard (`get*`).

## Screenshots

These screenshots come from the plugin's visual harness, which renders the page with sample server data.

### Server list

![MCP server list with connection statuses and workspace selector](https://raw.githubusercontent.com/P4rthPat3l/dsh-mcp-scopes/main/docs/screenshots/list-desktop.png)

### Add a server

![Form for adding a remote MCP server](https://raw.githubusercontent.com/P4rthPat3l/dsh-mcp-scopes/main/docs/screenshots/editor-desktop.png)

### Mobile view

![MCP server list on a mobile screen](https://raw.githubusercontent.com/P4rthPat3l/dsh-mcp-scopes/main/docs/screenshots/list-mobile.png)

### Dark empty state

![Empty MCP server list in dark mode](https://raw.githubusercontent.com/P4rthPat3l/dsh-mcp-scopes/main/docs/screenshots/empty-dark.png)

## Install

1. Open **Plugins** in DeepSeek Harness and select **Add plugin**.
2. Enter `dsh-mcp-scopes` as the package name and install it.
3. Open **Settings > MCP servers**. Restart DSH if the plugin manager asks you to do so.

This package is a DeepSeek Harness plugin. Installing it in an unrelated Node.js project does not add it to your DSH profile.

### Add a server

1. In **Settings > MCP servers**, select **All workspaces** for a profile-wide server, or choose a registered workspace for a workspace-only server.
2. Select **Add server**, choose a local command or remote URL, and fill in the connection details.
3. Save the server. If it needs authentication, open **Details** and save a bearer token or start OAuth sign-in.
4. Check the server status and available tools in **Details**. Tools are named `mcp__<server>__<tool>`.

### Install from a local checkout

```bash
npm install
npm run bundle
```

In DSH, open **Plugins > Add plugin** and choose the checkout directory. The profile links that directory, so keep its `node_modules/` in place. Restart DSH after rebuilding the Host code.

## Configuration

Files are written in the `mcpServers` shape used by Claude, Cursor, and Claude Desktop, so a server entry can be copied in either direction. Plugin-only settings live under a top-level `dsh` key that other clients ignore.

Profile file: `$DSH_HOME/plugins/mcp-manager/<profile>.json`. It is created with mode 0600 on the first save.

```json
{
  "mcpServers": {
    "example-crm": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": { "Authorization": "Bearer ${EXAMPLE_MCP_TOKEN}" }
    },
    "local-files": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/parth/Projects"]
    },
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    }
  },
  "dsh": {
    "toolPolicy": { "example-crm": { "allow": ["crm_*"], "deny": ["crm_delete_*"] } },
    "timeouts": { "example-crm": { "connectMs": 15000 } }
  }
}
```

Workspace file: `<workspace>/.dsh/mcp.json`. You can commit it with the repository, but do not put secrets in the file.

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp", "--tools=all"]
    }
  },
  "dsh": {
    "disableProfileServers": ["notion"]
  }
}
```

A workspace stdio entry runs in the workspace directory, so a relative `cwd`, command path, or argument path resolves against the project it is configured for rather than the Harness process directories. A profile entry keeps the process working directory, so a path there must be absolute.

Local entries use `command` plus `args`. A command array such as `["npx", "-y", "pkg"]` and `environment` are accepted too. Remote entries use `type: "http"` or a bare `url`. `sse` is not supported and reports the server name.

Other shapes are read and normalized:

- `mcpServers` (Claude, Cursor, Claude Desktop)
- `mcp.servers` with `type: local|remote` (OpenCode V2)
- a flat `mcp` map (OpenCode V1)
- `servers` with `type: stdio|http` (VS Code)

Writes always use the `mcpServers` shape.

`disabled: true` or `enabled: false` keeps a server configured without connecting it. `dsh.auth` holds `none` and `oauth` details that the standard shape cannot express; a bearer token is carried by the `Authorization` header reference.

Environment references use `${NAME}`, `${NAME:-default}`, or `{env:NAME}`. The credential store is checked first, then the process environment. The page writes the reference, never the token.

`toolPolicy.allow` and `toolPolicy.deny` accept exact names or wildcards. Deny wins; an empty allow list means all tools.

## Status

`Connected`, `Connecting`, `Configured`, `Sign-in required`, `Token missing`, `Error`, and `Disabled` are visible in the page. The page polls every two seconds while mounted. Failed connections retry with bounded backoff and never block Host startup or a session.

## Security

- Tokens saved through the token field live in the credentials store and are not returned in RPC responses. Do not paste secrets into configuration headers or environment values.
- Stdio children receive the scrubbed parent environment plus the entry's `env`.
- OAuth uses a loopback callback on `127.0.0.1`, PKCE S256, and a single-use state that expires after three minutes. A pasted redirect URL is validated against the same state.
- Signing out deletes the grant. A rejected refresh moves the row back to `Sign-in required` and removes its tools.
- Headers and environment values are configuration, not credentials; use the token field for secrets.

## Development and publishing

Build and check the package before publishing. The build output must exist before running `npm publish`.

```bash
npm install
npm test
npm pack --dry-run
npm publish
```

Publishing requires an npm account with permission to publish `dsh-mcp-scopes`. Push the README and screenshots to the repository before publishing so the screenshot URLs work on npm.

Other development commands:

```bash
npm run bundle     # write lib/host.js and lib/client.js
npm run typecheck  # tsc --noEmit
npm test           # bundle, typecheck, node --test
```

## Test manually

1. Install and open Settings, section MCP servers.
2. Add a streamable HTTP server with a URL and a token. Confirm the row reaches `Connected`.
3. Expand the row, save a token, and confirm the tools appear.
4. Add an OAuth server, click Sign in, finish in the browser, and confirm the row reaches `Connected`.
5. Start a session and call one tool.
6. Add a workspace server in another repository and confirm it appears only there.
7. Restart DSH and confirm connection state and OAuth grants survive.