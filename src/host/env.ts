/** Stdio environment scrubbing for child MCP servers. */

const SECRET_NAME = /KEY|PASSWORD|SECRET|TOKEN/i

/** Parent environment with credential-shaped and Harness-private names dropped. */
export function scrubbedParentEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (SECRET_NAME.test(name)) continue
    if (name.startsWith('DSH_')) continue
    out[name] = value
  }
  return out
}
