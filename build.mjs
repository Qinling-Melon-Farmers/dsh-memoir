/**
 * Client bundle build (esbuild) — replicates the dsh-web-ui client protocol:
 * a CJS closure-factory artifact that hands off through
 * window.__ModuleLoader__.load({ id, factory }), resolving platform modules
 * (react, react/jsx-runtime, react-dom, the @deepseek-ai client seed table)
 * through the loader's injected require. The output lands at lib/client.js,
 * served by the host as /plugins/dsh-memoir/client.js.
 */

import { build } from 'esbuild'

/** Platform modules answered by the shell's frozen module table (shared/web-platform.ts). */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
  // Documented store-engine exemption (runtime answers it natively).
  '@deepseek-ai/dsh-client-runtime/client',
]

const ID = 'dsh-memoir'

await build({
  entryPoints: ['src/client/index.jsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  sourcemap: true,
  minify: false,
  external: [...PLATFORM_MODULES],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  banner: {
    js: `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(ID)},\n\tfactory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports;\n} });',
  },
  logLevel: 'info',
})
