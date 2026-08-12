import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright is scoped DELIBERATELY NARROW here: it exists only to
 * smoke-test the realtime / presence / pause / multi-client surface
 * that unit + pgTAP tests structurally can't reach (those mock the
 * Supabase client, so the realtime layer — the thing that breaks —
 * is exactly what they don't exercise). It is NOT for routine game
 * logic; that stays in Vitest + pgTAP.
 *
 * One deliberate exception to "not for UI": codenamesduet.e2e.ts is a layout
 * guard (the below-board clue slot must not reflow the board as it swaps
 * states). That invariant is unreachable in Vitest/jsdom (no layout engine —
 * getBoundingClientRect is all zeros), so a real browser is the only place it
 * can be checked.
 *
 * Requires the local Supabase stack running (`supabase start`) — the
 * fixtures create users/clubs/games through its admin API + RPCs, and
 * the app talks to it via `.env.local`.
 *
 * Tests are named `*.e2e.ts` so Vitest (which matches `.test`/`.spec`)
 * never picks them up.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // Realtime propagation + the club-page heal's grace window need
  // generous timeouts. The suite is small, so this is cheap.
  timeout: 45_000,
  expect: { timeout: 12_000 },
  // These hit one shared local Supabase; serialize to avoid cross-test
  // presence interference.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    // `retain-on-failure`, not `on-first-retry`: with retries at 0 a retry
    // never happens, so `on-first-retry` recorded nothing, ever. This records
    // every test and throws the recording away when it passes — so a failure
    // leaves a full trace (DOM per action, network, console) without a retry
    // masking the failure as a pass.
    //
    // Written for the rare failure you can't reproduce on demand: strands-typing
    // failed once in ~9 full runs (2026-08-11) and the artifact was lost to a
    // re-run before anyone read it, which left the cause unknown. Measured cost
    // of recording: none — a full suite ran 6.0m with this and 6.0m without.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
