import { test, expect } from '@playwright/test'
import { createSoloClub, createSpellingbeeGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * spellingbee's COOP win condition — the team picks a rank to reach, and the
 * game ends the moment they cross it.
 *
 * Coop used to have no win at all: it only ever reached 'ended', via the clock
 * or the End button. `setup.target_rank` (optional in coop, required in compete)
 * changes that, and this is the browser half of the proof — the pgTAP suite
 * covers the state transition, but only a real render shows that the celebration
 * fires once, that the below-board pill carries the new verdict vocabulary, and
 * that a game opened AFTER the win stays quiet.
 *
 * The fixture board is 50 required points, so rank 2 (Solid) needs ≥ 12. The
 * synthetic 17-point pangram 'abcdefg' crosses it in one word.
 */
test('coop: crossing the target rank wins, celebrates once, and shows the verdict', async ({
  browser,
}) => {
  const club = await createSoloClub('sbwin')
  const game = await createSpellingbeeGame(club, 'coop', undefined, 2) // target: Solid
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await boardReady(page, page.locator('[class*="boardCol"]').first())

  // Below the target: an ordinary word, no celebration, still playing.
  await page.keyboard.type('bead')
  await page.keyboard.press('Enter')
  await expect(page.getByText('BEAD — +1')).toBeVisible()
  await expect(page.getByRole('dialog', { name: /you win/i })).toHaveCount(0)

  // The word that crosses it: 1 + 17 = 18 ≥ 12 (Solid).
  await page.keyboard.type('abcdefg')
  await page.keyboard.press('Enter')

  // The celebration pops at the moment of the win…
  const celebration = page.getByRole('dialog', { name: /you win/i })
  await expect(celebration).toBeVisible({ timeout: 8000 })
  await expect(celebration).toContainText('Reached "Solid"')
  await page.getByRole('button', { name: 'Nice!' }).click()
  await expect(celebration).toHaveCount(0)

  // …and the result stays on the page in the new verdict vocabulary.
  await expect(page.getByText(/^Won: "Solid" \d+\/50 points$/)).toBeVisible()

  // Re-opening an already-won game is REVIEW, not a re-run of the moment: the
  // verdict is there, the confetti is not (useCelebration never fires on mount).
  const page2 = await ctx.newPage()
  await page2.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page2.getByText(/^Won: "Solid" \d+\/50 points$/)).toBeVisible({ timeout: 20000 })
  await expect(page2.getByRole('dialog', { name: /you win/i })).toHaveCount(0)

  await ctx.close()
})

/**
 * The other coop shape: NO target rank (the open-ended hunt). Ending it is
 * neutral — "Ended: {rank} {score}/{total} points" — and nothing celebrates.
 */
test('coop: with no target, ending is neutral and nothing celebrates', async ({ browser }) => {
  const club = await createSoloClub('sbnotgt')
  const game = await createSpellingbeeGame(club) // no target rank
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await boardReady(page, page.locator('[class*="boardCol"]').first())

  await page.keyboard.type('abcdefg')
  await page.keyboard.press('Enter')
  await expect(page.getByText('ABCDEFG — pangram +17')).toBeVisible()
  // 17 points would be past Solid — but with no target there's nothing to cross.
  await expect(page.getByRole('dialog', { name: /you win/i })).toHaveCount(0)
  await expect(page.getByText(/^Won:/)).toHaveCount(0)

  await page.getByRole('button', { name: 'End game' }).first().click()
  await page.locator('[data-floating-panel]').getByRole('button', { name: 'End game' }).click()

  await expect(page.getByText(/^Ended: \w+ \d+\/50 points$/)).toBeVisible({ timeout: 8000 })
  await expect(page.getByRole('dialog', { name: /you win/i })).toHaveCount(0)

  await ctx.close()
})
