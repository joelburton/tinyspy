// Import from `vitest/config`, not `vite` — its `defineConfig` extends
// Vite's UserConfig with a `test` block. With Vite's own defineConfig,
// the test block would be a type error.
//
// Docs: https://vite.dev/config/  https://vitest.dev/config/
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The build stamp: what a running tab compares against the deployed
// `version.json` to notice that a deploy has replaced it
// (src/common/boot/reloadOnStaleBuild.ts). `built` is the identity — two builds
// never share one, where two builds of one commit can; `sha` is for a report.
function buildStamp() {
  const git = (cmd: string) => {
    try {
      return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return null
    }
  }
  const sha = git('rev-parse --short HEAD') ?? 'unknown'
  const dirty = git('status --porcelain')
  return { built: new Date().toISOString(), sha: dirty ? `${sha}-dirty` : sha }
}

// Writes `version.json` into the same output as the hashed assets, from the
// same run — so no deploy step can ship a bundle without its matching stamp.
function writeVersionJson(stamp: ReturnType<typeof buildStamp>): Plugin {
  return {
    name: 'puzpuzpuz:version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(stamp) })
    },
  }
}

export default defineConfig(({ mode }) => {
  const stamp = buildStamp()
  return {
    plugins: [react(), writeVersionJson(stamp)],
    resolve: {
      // `@/` is the root of `src/` — the twin of the `paths` entry in
      // tsconfig.app.json / tsconfig.node.json. tsc's entry only teaches the
      // compiler and the editor; THIS is what resolves the specifier when vite
      // builds and when vitest runs (vitest reads this config), so the two must
      // always change together.
      //
      // An import that leaves its own top-level folder under `src/` spells it
      // `@/common/…`, `@/shared/…`, `@/<game>/…`; one that stays inside its
      // folder stays relative.
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // react-rnd's transitive dep `react-draggable` checks
    // `process.env.NODE_ENV` at runtime to gate dev-only warnings.
    // The browser has no `process` global, so without this shim the
    // bundle throws `Can't find variable: process` the moment a
    // <Draggable> tries to render. Vite replaces these at build
    // time — `mode` resolves to 'development' under `vite` /
    // 'production' under `vite build`, matching what Node would
    // have set NODE_ENV to in those contexts.
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      // This tab's own stamp, baked in; see `buildStamp` above.
      __BUILD_STAMP__: JSON.stringify(stamp),
    },
    test: {
      environment: 'jsdom',         // window/document for component tests
      globals: true,                // describe/it/expect without imports
      setupFiles: ['./src/test-setup.ts'],
      css: false,                   // skip CSS parsing; tests assert on classes
    },
  }
})
