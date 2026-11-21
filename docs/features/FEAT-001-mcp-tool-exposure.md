# FEAT-001: MCP tool exposure (catalog bridge)

Status: implemented (verified against the working tree on 2026-11-21; not yet committed)
Last updated: 2026-11-21

## Problem

Every tool of every connected MCP server is registered on the agent's `ctx.tools` with its full description and verbatim JSON Schema the moment the server connects. DSH sends every admitted tool schema to the model on every step, so a profile with Zoho Cliq (102 tools) plus crmai (37 tools) costs about 55,300 tokens of tool definitions per request, measured with the `Tool.listTools` inspect query, before any conversation happens. Two Zoho Cliq tools alone (`messageCardButtons`, `textmessageformat`) serialize to 29.5KB. A second cost rides in the same system-prompt section: each server's own instructions text, accepted up to 32KB per server.

## User journey

1. A user connects an MCP server in Settings, as today.
2. The server defaults to catalog exposure. Its tools stop appearing as individual model tool definitions. The system prompt gains one compact catalog block (`- tool: first sentence of its description`) and the agent gains three bridge tools: `mcp_search`, `mcp_describe`, `mcp_call`.
3. The model finds a tool by reading the catalog or calling `mcp_search`, reads exact parameters with `mcp_describe` when needed, and runs it with `mcp_call(server, tool, arguments)`.
4. A user who wants the old behavior for one server opens the edit form and switches exposure to Direct. That server's tools register individually again with full schemas and its instructions text returns to the prompt.

## Architecture

Planned additions are marked `planned`; everything else exists today. As of 2026-11-21 every item below is implemented and the `planned` markers describe the shipped files.

- `src/host/schema.ts`: parses and serializes `dsh.exposure.<server>` (`catalog` or `direct`), default `catalog`.
- `src/host/types.ts`: `ServerDef.exposure` and `ServerView.exposure`.
- `src/host/catalog.ts` (planned): pure functions that build the prompt catalog from a server's allowed raw tools and rank search results with BM25.
- `src/host/bridge.ts` (planned): builds the three bridge tool definitions bound to one agent's attached entries; dispatch resolves the server entry, enforces `toolPolicy`, and calls the MCP client exactly as direct-mode registration does.
- `src/host/connection.ts`: `registerForOwner` skips per-tool registration for catalog entries; `attachAgent` registers the bridge once per agent when at least one attached server is catalog mode; `instructionsFor` emits the merged catalog and omits server instructions for catalog entries; the 32KB instructions cap applies only to direct entries.
- `src/client/editor.tsx`, `src/client/page.tsx`, `src/client/harness.ts`, `src/client/locale.ts`: exposure selector in the advanced form section, a chip on the server row, and copy.
- Live stopgap (already applied by the time this doc is synchronized): `~/.dsh/plugins/mcp-manager/web.json` gains `dsh.toolPolicy.zoho-cliq.allow` with the messaging tools the owner uses, because the running plugin version still registers eagerly.

### Decisions

- Default is `catalog`, not opt-in. The owner approved eliminating the 55K problem without per-user configuration. `direct` is the escape hatch, per server.
- The bridge is global (three tools total), not per server. Two attached servers cost three bridge tools, not six.
- Bridge names `mcp_search`, `mcp_describe`, `mcp_call` cannot collide with server tools because public server tool names always contain `__` after the `mcp__` prefix.
- `mcp_call` takes `server` and `tool` (the raw MCP tool name), matching the catalog and search output, not the `mcp__server__tool` public name.
- Catalog mode drops the server's own instructions text from the prompt (Settings still shows it). Its 32KB cap therefore applies only to direct servers; oversized instructions no longer fail a catalog connection.
- The catalog budget is a constant (2000 tokens, estimated at 4 characters per token) with deterministic degradation, not a config field. `direct` and `toolPolicy` already cover users who need different behavior.
- Arguments are validated by the MCP server, as in direct mode today. The bridge surfaces the server's error text so the model can correct the call; `mcp_describe` exists so it can pre-read the schema.
- No `deferLoading` in this change. DSH supports deferred declarations on some routes, but route behavior differs and the bridge already reaches the goal on every route. Revisit as a follow-up.

## Control flow

1. `agent/created` → `attachAgent` → per server: catalog entries are attached with owners but no per-tool registration; the bridge registers once on the agent context when any attached server is catalog mode.
2. A catalog server reaches `ready` → its allowed raw tools become searchable and its lines join the catalog block on the next prompt assembly.
3. Model calls `mcp_call` → resolve the entry among the calling agent's attached entries → status, policy, and existence checks → `client.callTool` with the server's call timeout → result projects through the same content extraction as direct tools.
4. `detachAgent` disposes the bridge with the agent's other registrations; reattach (profile or workspace reload) rebuilds it.

## Data flow

`ServerDef.exposure` (parsed from `dsh.exposure.<name>`) → `Entry.def.exposure` → registration decisions in `registerForOwner` and `attachAgent`; `Entry.rawTools` filtered by `toolAllowed` → catalog lines and BM25 documents; `instructionsFor(agentId)` reads live entries at each prompt assembly so reconnects refresh the catalog without re-registration.

## Contracts

- `dsh.exposure.<server>`: `"catalog"` (default) or `"direct"`. Serialized only when `direct`.
- `mcp_search(query: string)` → text lines `server/tool: clipped description [required: a, b]`, at most 10, or guidance text on zero hits.
- `mcp_describe(tools: string[])` → at most 10 `server/tool` strings → text blocks with description and verbatim input schema JSON.
- `mcp_call(server: string, tool: string, arguments: object)` → the direct-mode result shape `{ content, structuredContent }`.

## Cases

| ID | Criterion | Test |
|---|---|---|
| AC-001 | A server without `dsh.exposure` parses as catalog; `direct` parses and survives a serialize round trip; other values are rejected | `tests/schema.test.ts` |
| AC-002 | Attaching a catalog server registers exactly the three bridge tools and no per-tool definitions | `tests/bridge.test.ts` |
| AC-003 | A direct server registers every allowed tool as today | existing `tests/connection.test.ts` cases, updated to pin `exposure: 'direct'` |
| AC-004 | `mcp_call` returns the same projected result as the direct tool for the same call | `tests/bridge.test.ts` against the stdio fixture |
| AC-005 | `mcp_call` rejects a tool the server's `toolPolicy` denies | `tests/bridge.test.ts` |
| AC-006 | `mcp_call` rejects a server attached to another agent | `tests/bridge.test.ts` |
| AC-007 | `mcp_call` rejects an unknown server or tool with an error naming both | `tests/bridge.test.ts` |
| AC-008 | `mcp_search` ranks a matching tool above a non-matching one, includes required parameters, and returns guidance on zero hits | `tests/catalog.test.ts` |
| AC-009 | `mcp_describe` returns the verbatim input schema for a known tool and rejects more than 10 names | `tests/catalog.test.ts` |
| AC-010 | `instructionsFor` lists every allowed tool of a ready catalog server, byte-stable sorted, and omits that server's instructions; direct servers keep today's text | `tests/bridge.test.ts` |
| AC-011 | The catalog degrades under budget from full lines to names-only to a group stub, largest server first | `tests/catalog.test.ts` |
| AC-012 | An MCP `isError` result from a bridged call throws with the server's text | `tests/bridge.test.ts` (fixture `fail` tool) |
| AC-013 | A catalog server connects even when its instructions exceed 32KB; a direct server fails as today | `tests/bridge.test.ts` |
| AC-014 | The editor offers exposure Catalog/Direct, defaults catalog, and round-trips through save and load | `tests/ui.test.tsx` |
| AC-015 | `ServerView.exposure` reports the mode for the row chip | `tests/bridge.test.ts` |

## Edge and error states

- Catalog server not connected: search and describe skip it (its raw tool list is empty); `mcp_call` fails with `server X is not connected (status: needs_auth)`.
- All servers direct: no bridge tools and no catalog block; the prompt is byte-identical to today's.
- Empty query: search returns guidance text instead of an unranked dump.
- Duplicate `server/tool` in a describe batch: each name resolves once.
- Agent detached mid-search: the closure's entry map no longer contains the agent, so calls fail as unknown server.

## Risks

- Model friction: the model must search and describe before first use of a tool. Mitigations: the catalog is complete and always in the prompt, search hits carry `required`, and any server can be flipped to `direct`. Hermes measured this friction and kept the same mitigations.
- Prompt-cache churn: the catalog rewrites when a server reconnects with a changed tool list. The catalog is a deterministic function of the tool lists and is far smaller than the schemas it replaces.
- Existing users upgrade to a changed default. Mitigations: per-server `direct`, README migration note, and the catalog keeps every tool reachable, so nothing is lost.

## Testing and rollout

- `npm test` runs the bundle build, `tsc --noEmit`, and the node test suite.
- Measure the win after install with the `Tool.listTools` inspect query: MCP-attributable schema bytes should drop from about 221KB to the three bridge definitions (target under 3KB) plus the catalog text in the prompt section.
- Roll out as a plugin version bump with the README migration note. Rollback: reinstall the previous plugin version; config files remain compatible because absent `exposure` simply reverts to direct in the old parser.

## Changelog

- 2026-11-21: Mode A document written after the investigation report was approved.
- 2026-11-21: Implemented. Catalog exposure is the default; the bridge registers once per agent; the 32KB instruction cap now applies only to direct servers. The oversized-instructions test uses a `FIXTURE_VERBOSE_INSTRUCTIONS=1` env switch on the stdio fixture. AC-013's wait was corrected to expect the `error` status for the direct server instead of `ready`.
