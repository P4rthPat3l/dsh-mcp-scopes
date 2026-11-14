/**
 * Build both halves. Run with `node build.mjs`.
 *
 * `lib/host.js` is the Node half. Harness packages and the MCP SDK stay
 * external so the profile's linked node_modules serves them.
 * `lib/client.js` is the browser artifact: one closure factory that resolves
 * React from the shell module table.
 */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const ID = 'dsh-mcp-manager'
const externals = ['@modelcontextprotocol/client', '@modelcontextprotocol/client/*', '@deepseek-ai/*']

await mkdir('.build', { recursive: true })
await mkdir('lib', { recursive: true })

await build({
  entryPoints: ['src/host/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: externals,
  outfile: 'lib/host.js',
})

await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  outfile: '.build/client.cjs',
})

const body = await readFile('.build/client.cjs', 'utf8')
const artifact = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(ID)},
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
${body}
    return module.exports;
  },
});
`
await writeFile('lib/client.js', artifact)
console.log(`lib/host.js and lib/client.js written for ${ID}`)
