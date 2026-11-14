import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const stub = pathToFileURL(join(here, 'primitives-stub.mjs')).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      return { url: stub, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
