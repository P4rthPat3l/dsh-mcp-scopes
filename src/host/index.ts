/** MCP manager Host half: configuration, connections, OAuth, tools, and RPC. */

import { ConfigStore } from './store.js'
import { ConnectionManager } from './connection.js'
import { OAuthEngine } from './oauth.js'
import { dshHomePath, profileName } from './paths.js'
import { resolveEffective } from './scope.js'
import { registerRpc } from './rpc.js'
import { isAgentPayload, isCredentialsService, isWorkspaceRegistry, isWorkingDirectory } from './guards.js'
import { isRecord } from './schema.js'
import type {
  AgentRef,
  CredentialsService,
  HostContext,
  ProfileFile,
  SystemPromptService,
} from './types.js'

export const name = 'dsh-mcp-scopes'

export const inject = ['tools', 'credentials', 'workspaceRegistry']

interface AgentCreatedPayload {
  readonly agent: AgentRef
  readonly signal?: AbortSignal
}

interface LiveAgent {
  readonly agent: AgentRef
  readonly directory: string
}

export function apply(ctx: HostContext): void {
  const profile = profileName()
  const store = new ConfigStore(dshHomePath('plugins', 'mcp-manager', `${profile}.json`))
  const credentialsValue = ctx.get('credentials')
  const credentials: CredentialsService | undefined = isCredentialsService(credentialsValue) ? credentialsValue : undefined
  const agents = new Map<string, LiveAgent>()
  let profileCache: ProfileFile = { version: 1, servers: [] }

  let manager: ConnectionManager
  const oauth =
    credentials === undefined
      ? undefined
      : new OAuthEngine(credentials, ctx.logger, (scopeId) => manager.reconnectScope(scopeId))
  manager = new ConnectionManager(ctx, credentials, oauth)

  const loadProfile = async (): Promise<void> => {
    const read = await store.readProfile()
    if (read.error !== undefined) {
      ctx.logger.warn(`dsh-mcp-scopes: profile file ignored: ${read.error}`)
      return
    }
    profileCache = read.file
    manager.setProfile(read.file.servers)
  }

  const attach = async (entry: LiveAgent): Promise<void> => {
    const workspace = await store.readWorkspace(entry.directory)
    if (workspace.error !== undefined) {
      ctx.logger.warn(`dsh-mcp-scopes: workspace file ignored in ${entry.directory}: ${workspace.error}`)
    }
    const effective = resolveEffective(profileCache, workspace.missing ? undefined : workspace.file)
    await manager.attachAgent(entry.agent, entry.directory, effective)
  }

  const reattachAll = async (): Promise<void> => {
    for (const [id, entry] of [...agents.entries()]) {
      manager.detachAgent(id)
      await attach(entry)
    }
  }

  const reattachWorkspace = async (directory: string): Promise<void> => {
    for (const [id, entry] of [...agents.entries()]) {
      if (entry.directory !== directory) continue
      manager.detachAgent(id)
      await attach(entry)
    }
  }

  const reloadProfile = async (): Promise<void> => {
    await loadProfile()
    await reattachAll()
  }

  ctx.effect(
    () => {
      void loadProfile()
      return () => {
        void manager.dispose()
        oauth?.dispose()
      }
    },
    'dsh-mcp-scopes: connections',
  )

  ctx.effect(
    () =>
      ctx.on<AgentCreatedPayload>('agent/created', async (payload) => {
        if (!isAgentPayload(payload)) return
        const workingDirectory = ctx.get('workingDirectory')
        if (!isWorkingDirectory(workingDirectory)) return
        const agent = payload.agent
        let directory: string
        try {
          directory = await workingDirectory.ensure(agent, payload.signal)
        } catch (error) {
          ctx.logger.warn(`dsh-mcp-scopes: cannot resolve workspace: ${String(error)}`)
          return
        }
        const entry: LiveAgent = { agent, directory }
        agents.set(agent.id, entry)
        const prompts: SystemPromptService | undefined = agent.ctx.systemPrompt
        if (prompts !== undefined) {
          agent.ctx.effect(
            () =>
              prompts.section({
                name: 'mcp-manager.instructions',
                order: 40,
                text: () => manager.instructionsFor(agent.id),
              }),
            'dsh-mcp-scopes: instructions',
          )
        }
        await attach(entry)
      }),
    'dsh-mcp-scopes: agent hook',
  )

  ctx.effect(
    () =>
      ctx.on<unknown>('agent/disposed', (payload) => {
        if (!isRecord(payload) || !isRecord(payload.agent) || typeof payload.agent.id !== 'string') return
        agents.delete(payload.agent.id)
        manager.detachAgent(payload.agent.id)
      }),
    'dsh-mcp-scopes: agent disposal',
  )

  const workspaceRegistry = ctx.get('workspaceRegistry')
  registerRpc(ctx, {
    store,
    manager,
    workspaces: isWorkspaceRegistry(workspaceRegistry) ? workspaceRegistry : undefined,
    profile: () => profileCache,
    credentials,
    oauth,
    reloadProfile,
    reattachWorkspace,
  })

  ctx.logger.info(`dsh-mcp-scopes: profile ${profile}, config ${store.profilePath}`)
}
