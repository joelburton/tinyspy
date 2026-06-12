/**
 * Vitest setup file — runs once before any test.
 *
 * Wires `@testing-library/jest-dom` matchers into Vitest's `expect`
 * so we can write `.toBeInTheDocument()`, `.toBeDisabled()`, etc.
 */

import '@testing-library/jest-dom/vitest'
