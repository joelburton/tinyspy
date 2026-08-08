import { test, expect, type Page } from '@playwright/test'
import { createSoloClub, createWordwheelGame } from './helpers/fixtures'
import { signIn } from './helpers/session'
import { boardReady } from './helpers/ready'

/**
 * Type a word and submit it — with the entry box's echo VERIFIED first.
 *
 * Typing straight after the board becomes visible can lose the leading
 * keystroke: `useCaptureKeys` attaches its window listener in an effect,
 * which runs a beat after the paint that satisfied the visibility wait.
 * Seen live (2026-08-07): `type('bead')` arrived as `EAD — too short` and
 * the spec starved waiting for a pill that could never come. So: clear,
 * type, check the entry box heard the WHOLE word (EntryBox's
 * `data-testid="entry-value"`), retry if not, and only then press Enter.
 */
async function submitWord(page: Page, word: string): Promise<void> {
  await expect(async () => {
    for (let i = 0; i < word.length + 2; i++) await page.keyboard.press('Backspace')
    await page.keyboard.type(word)
    await expect(page.getByTestId('entry-value')).toHaveText(word.toUpperCase(), { timeout: 500 })
  }).toPass({ timeout: 10_000 })
  await page.keyboard.press('Enter')
}

/**
 * wordwheel's COOP win condition — the team picks a rank to reach, and the
 * game ends the moment they cross it.
 *
 * Coop used to have no win at all: it only ever reached 'ended', via the clock
 * or the End button. `setup.target_rank` (optional in coop, required in compete)
 * changes that, and this is the browser half of the proof — the pgTAP suite
 * covers the state transition, but only a real render shows that the celebration
 * fires once, that the below-board pill carries the new verdict vocabulary, and
 * that a game opened AFTER the win stays quiet.
 *
 * The fixture board is 59 required points, so rank 2 (Solid) needs ≥ 14. The
 * synthetic 24-point nine-letter pangram 'abcdefghi' crosses it in one word.
 */
test('coop: crossing the target rank wins, celebrates once, and shows the verdict', async ({
  browser,
}) => {
  const club = await createSoloClub('wwwin')
  const game = await createWordwheelGame(club, 'coop', undefined, 2) // target: Solid
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await boardReady(page, page.locator('[class*="boardCol"]').first())

  // Below the target: an ordinary word, no celebration, still playing.
  await submitWord(page, 'bead')
  await expect(page.getByText('BEAD — +1')).toBeVisible()
  await expect(page.getByRole('dialog', { name: /you win/i })).toHaveCount(0)

  // The word that crosses it: 1 + 24 = 25 ≥ 14 (Solid).
  await submitWord(page, 'abcdefghi')

  // The celebration pops at the moment of the win…
  const celebration = page.getByRole('dialog', { name: /you win/i })
  await expect(celebration).toBeVisible({ timeout: 8000 })
  await expect(celebration).toContainText('Reached "Solid"')
  await page.getByRole('button', { name: 'Nice!' }).click()
  await expect(celebration).toHaveCount(0)

  // …and the result stays on the page in the new verdict vocabulary.
  await expect(page.getByText(/^Won: "Solid" \d+\/59 points$/)).toBeVisible()

  // Re-opening an already-won game is REVIEW, not a re-run of the moment: the
  // verdict is there, the confetti is not (useCelebration never fires on mount).
  const page2 = await ctx.newPage()
  await page2.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page2.getByText(/^Won: "Solid" \d+\/59 points$/)).toBeVisible({ timeout: 20000 })
  await expect(page2.getByRole('dialog', { name: /you win/i })).toHaveCount(0)

  await ctx.close()
})

/**
 * The other coop shape: NO target rank (the open-ended hunt). Ending it is
 * neutral — "Ended: {rank} {score}/{total} points" — and nothing celebrates.
 */
test('coop: with no target, ending is neutral and nothing celebrates', async ({ browser }) => {
  const club = await createSoloClub('wwnotgt')
  const game = await createWordwheelGame(club) // no target rank
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await boardReady(page, page.locator('[class*="boardCol"]').first())

  await submitWord(page, 'abcdefghi')
  await expect(page.getByText('ABCDEFGHI — pangram +24')).toBeVisible()
  // 24 points would be past Solid — but with no target there's nothing to cross.
  await expect(page.getByRole('dialog', { name: /you win/i })).toHaveCount(0)
  await expect(page.getByText(/^Won:/)).toHaveCount(0)

  await page.getByRole('button', { name: 'End game' }).first().click()
  await page.locator('[data-floating-panel]').getByRole('button', { name: 'End game' }).click()

  await expect(page.getByText(/^Ended: \w+ \d+\/59 points$/)).toBeVisible({ timeout: 8000 })
  await expect(page.getByRole('dialog', { name: /you win/i })).toHaveCount(0)

  await ctx.close()
})
