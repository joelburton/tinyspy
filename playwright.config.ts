import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright is scoped DELIBERATELY NARROW here: it exists only to
 * smoke-test the realtime / presence / pause / multi-client surface
 * that unit + pgTAP tests structurally can't reach (those mock the
 * Supabase client, so the realtime layer — the thing that breaks —
 * is exactly what they don't exercise). It is NOT for routine game
 * logic; that stays in Vitest + pgTAP.
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
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
