// cs-unmet

import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, createWaffleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * **The header clock keeps real time.**
 *
 * Every viewer polls `common.tick_timer` about once a second, and the server
 * decides how far the count moves (`common._clock_due`). The trap this guards:
 * a rule that counts at most one second per poll drops a second whenever a
 * poll lands a little under a second after the last tick, so the clock runs
 * slow — measured on prod at 7 counted seconds in 11 real ones, which cost a
 * coop FlipWord team a bonus their own screen said they had earned.
 *
 * Locally there is almost no network, so the polls land too evenly to show
 * it. The spec puts prod's unevenness back: each `tick_timer` request is held
 * for a random 0–200 ms, which is what makes the old rule fail here.
 *
 * **Slow, so opt-in:** it watches the clock for 20 real seconds. Run it with
 * `SLOW=1 npx playwright test timer-accuracy`; a plain run skips it.
 */

/** How long the clock is watched, in real seconds. */
const WATCH_SECONDS = 20

/** The clock's M:SS, as seconds. */
async function readClock(page: Page): Promise<number> {
  const [m, s] = (await page.getByTestId('clock').innerText()).split(':').map(Number)
  return m! * 60 + s!
}

/** The moment the clock next changes: its new value and the real time it
 *  appeared, so neither reading is up to a second stale. */
async function nextTick(page: Page): Promise<{ seconds: number; at: number }> {
  const before = await readClock(page)
  await expect.poll(() => readClock(page), { intervals: [20] }).not.toBe(before)
  return { seconds: await readClock(page), at: Date.now() }
}

test('the header clock counts real seconds through uneven polls', async ({ browser }) => {
  test.skip(process.env.SLOW !== '1', 'slow: set SLOW=1 to run it')
  test.setTimeout(90_000)

  const club = await createSoloClub('tmac')
  const game = await createWaffleGame(club, 'coop', undefined, { kind: 'countup' })
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.route('**/rest/v1/rpc/tick_timer', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 200))
    await route.continue()
  })
  await page.goto(`/g/${game.gametype}/${game.id}`)

  const start = await nextTick(page)
  await page.waitForTimeout(WATCH_SECONDS * 1000)
  const end = await nextTick(page)

  const counted = end.seconds - start.seconds
  const real = (end.at - start.at) / 1000
  expect(Math.abs(counted - real), `counted ${counted} s in ${real.toFixed(1)} real s`)
    .toBeLessThanOrEqual(1.5)

  await ctx.close()
})
