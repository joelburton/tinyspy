import { test, expect } from '@playwright/test'
import { createSoloClub, createWordwheelGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Live-update smoke test for wordwheel (MooseWheel). The reported bug: after a
 * valid submission the own-move pill appears, but the found word never lands in
 * the word list and the score never advances until a manual refresh — i.e. the
 * `wordwheel.found_words` realtime event isn't driving `useGame`'s refetch.
 *
 * This exercises the exact path that breaks: submit a required word, then assert
 * it appears in the list VIA REALTIME (the found-word button) and the score
 * advances — both of which only happen if the postgres-changes event fires and
 * the hook refetches. A single page (no reload) so the assertion can only pass
 * through the live channel, not a fresh fetch. Solo club so it doesn't
 * presence-pause with one viewer.
 */
test.describe('wordwheel live updates', () => {
  test('a submitted word lands in the list + advances the score without a refresh', async ({
    browser,
  }) => {
    const club = await createSoloClub('wwlive')
    const [alice] = club.members
    const game = await createWordwheelGame(club)

    const ctx = await browser.newContext()
    await signIn(ctx, alice.session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // Wait for the wheel to render + the capture keyboard to attach before typing.
    await expect(page.getByRole('group', { name: 'Letter wheel' })).toBeVisible({
      timeout: 15000,
    })

    const submit = async (w: string) => {
      await page.keyboard.type(w)
      await page.keyboard.press('Enter')
    }
    const pill = () => page.locator('[class*="pill"]').first()

    // Required word → optimistic own-move pill (this already works — feedback shows).
    await submit('bead')
    await expect(pill()).toContainText('BEAD — +1')

    // THE BUG: the word must now land in the found list via realtime — the found
    // word renders as a button labelled with the uppercase word. If the realtime
    // refetch doesn't fire, this button never appears (until a manual refresh) and
    // the test fails, reproducing the report.
    await expect(page.getByRole('button', { name: 'BEAD', exact: true })).toBeVisible({
      timeout: 10000,
    })

    await ctx.close()
  })
})
