// Import from `vitest/config`, not `vite` — its `defineConfig` extends
// Vite's UserConfig with a `test` block. With Vite's own defineConfig,
// the test block would be a type error.
//
// Docs: https://vite.dev/config/  https://vitest.dev/config/
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
