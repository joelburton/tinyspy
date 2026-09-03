// cs-unmet

import { test } from '@playwright/test'

/**
 * Close every browser context this file opened, after each of its tests —
 * call it once at the top of a spec that creates contexts.
 *
 * Playwright's `browser` fixture is WORKER-scoped, not test-scoped: a context
 * made with `browser.newContext()` stays open, with its pages live, until
 * something closes it or the worker exits. A page left open is not idle — it
 * holds a signed-in app, its Realtime subscriptions, and its auth token
 * refresh, all pointed at the one shared local stack.
 *
 * The convention this replaces — `await ctx.close()` as the last line of the
 * test — leaks on exactly the runs you care about, because a failed assertion
 * throws past it. So the specs that leak most are the ones that just broke.
 *
 * **What that costs, measured** (setgame-mobile, 2026-09-03): eleven specs
 * never closed their contexts, so by the time the suite reached setgame-mobile
 * there were 39 live apps. Vite's dev server then re-optimized a dependency and
 * broadcast a full reload to every connected client; all 40 pages rebooted
 * inside 11 seconds, and each boot calls `supabase.auth.getUser()`. The local
 * GoTrue served forty at once and took **6.5 seconds** to answer the one page
 * under test, which sat on `<Loading/>` — App.tsx's root gate — for 13.8s of a
 * 15s budget. The board came back 23ms after the deadline. Nothing was wrong
 * with the app or the assertion; the test lost to its own suite's litter.
 *
 * It closes ALL open contexts, not just the ones the calling file made. No test
 * here is meant to outlive itself (`workers: 1`, `fullyParallel: false`), so an
 * open context between tests is always garbage — including garbage some other
 * spec dropped.
 */
export function closeContextsAfterEach(): void {
  test.afterEach(async ({ browser }) => {
    await Promise.all(browser.contexts().map((ctx) => ctx.close()))
  })
}
