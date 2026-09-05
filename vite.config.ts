// Import from `vitest/config`, not `vite` — its `defineConfig` extends
// Vite's UserConfig with a `test` block. With Vite's own defineConfig,
// the test block would be a type error.
//
// Docs: https://vite.dev/config/  https://vitest.dev/config/
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
  },
  test: {
    environment: 'jsdom',         // window/document for component tests
    globals: true,                // describe/it/expect without imports
    setupFiles: ['./src/test-setup.ts'],
    css: false,                   // skip CSS parsing; tests assert on classes
  },
}))
