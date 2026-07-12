import { test, expect } from '@playwright/test'
import { createSoloClub, createBananagramsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * bananagrams is DESKTOP-ONLY (docs/mobile.md → "Where each game plays"): a
 * drag-heavy 25×25 arena that's unpleasant even on a keyboard tablet, so it's
 * hard-blocked on *all* touch — the PlayArea renders the shared
 * `<DeviceBlockNotice>` in place of the board when `useCoarsePointer()` matches.
 *
 * Two checks. On a TOUCH context (coarse pointer): the block screen shows and the
 * drag board never mounts. On a mouse/desktop context at the same phone-ish
 * width: NO block — the gate keys off the pointer, not width, so a small desktop
 * window still plays. That desktop case is the reason scrabble/crossplay stay
 * un-gated too (a keyboard tablet is touch-but-playable — see the doc), and it
 * pins the axis so a future "gate on width" refactor can't slip in unnoticed.
 */
test.describe('bananagrams desktop-only block', () => {
  test('touch device is blocked, drag board never mounts', async ({ browser }) => {
    const club = await createSoloClub('bgblk')
    const game = await createBananagramsGame(club)
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true, // coarse pointer → the block fires
    })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The block screen, not the board (bananagrams' arena renders `data-cell`
    // grid cells — none should exist behind the block).
    await expect(page.getByText('Bananagrams needs a desktop')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-cell]')).toHaveCount(0)
    // The in-card exit is present.
    await expect(page.getByRole('button', { name: 'Back to club' })).toBeVisible()

    await ctx.close()
  })

  test('mouse device at the same width is NOT blocked (gate is pointer, not width)', async ({ browser }) => {
    const club = await createSoloClub('bgok')
    const game = await createBananagramsGame(club)
    // No hasTouch/isMobile → a fine (mouse) pointer, even at a phone-ish width.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)

    // The board mounts (grid cells present); no block screen.
    await expect(page.locator('[data-cell]').first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Bananagrams needs a desktop')).toHaveCount(0)

    await ctx.close()
  })
})
