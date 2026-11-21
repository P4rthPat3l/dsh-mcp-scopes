# Repository notes

Feature documentation lives in docs/features/. Read the relevant feature document before changing a feature.

This plugin registers MCP server tools on the DSH host `tools` service. Tool names use the `mcp__<server>__<tool>` public naming from `src/host/naming.ts`. Configuration files are `$DSH_HOME/plugins/mcp-manager/<profile>.json` (profile scope) and `<workspace>/.dsh/mcp.json` (workspace scope); both are parsed and serialized only through `src/host/schema.ts`.
