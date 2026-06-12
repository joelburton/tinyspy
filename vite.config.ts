// Import from `vitest/config`, not `vite` — its `defineConfig` extends
// Vite's UserConfig with a `test` block. With Vite's own defineConfig,
// the test block would be a type error.
//
// Docs: https://vite.dev/config/  https://vitest.dev/config/
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',         // window/document for component tests
    globals: true,                // describe/it/expect without imports
    setupFiles: ['./src/test-setup.ts'],
    css: false,                   // skip CSS parsing; tests assert on classes
  },
})
