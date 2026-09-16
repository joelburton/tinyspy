// cs-unmet

/**
 * Vitest setup file — runs once before any test.
 *
 * Wires `@testing-library/jest-dom` matchers into Vitest's `expect`
 * so we can write `.toBeInTheDocument()`, `.toBeDisabled()`, etc.
 *
 * It also holds the suite to being stack-free: every request is mocked, and a
 * test that reaches the network fails, naming what it asked for.
 */

import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

/**
 * The real `fetch`, for the handful of tests that mean to reach the local
 * stack — `schemaExposure.e2e.test.ts` is why this export exists, since the
 * HTTP layer is the thing it is testing.
 *
 * Reaching for this is a claim that the test needs a running stack, so it says
 * so at the call site rather than being waved through by a filename. Everything
 * else gets the global, replaced below.
 */
export const fetchTheRealStack = globalThis.fetch

/**
 * What this test asked the network for, cleared as each test ends.
 *
 * The guard RECORDS as well as refusing, because refusing alone does not fail
 * anything: app code handles its own transport failures by design — `runEdgeFn`
 * turns one into an envelope, and a popover that renders an error still renders
 * — so a leaking test absorbs the refusal and passes. This list is the half
 * nothing can absorb.
 */
const askedTheNetworkFor: string[] = []

globalThis.fetch = function recordAndRefuse(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const asked = `${init?.method ?? 'GET'} ${url}`
  askedTheNetworkFor.push(asked)
  // REJECTS rather than throwing, because that is what a real fetch does when
  // it can't reach anything — a caller written for an offline stack behaves the
  // same here, instead of taking a synchronous throw it never guards against.
  return Promise.reject(new Error(`Test reached the network: ${asked}`))
} as typeof fetch

afterEach(function noTestReachesTheNetwork() {
  if (askedTheNetworkFor.length === 0) return
  const asked = askedTheNetworkFor.join('\n  ')
  // Cleared BEFORE the throw, or the next test inherits this one's list and
  // fails for a request it never made.
  askedTheNetworkFor.length = 0
  throw new Error(
    'This test reached the network. The suite is stack-free — mock the seam the '
      + 'call goes through (`runEdgeFn`, `db.rpc`, `readRows`), or the hook above '
      + `it. Unmocked, it hits whatever stack happens to be running locally:\n  ${asked}`,
  )
})
