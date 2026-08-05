import { test, expect, type Page } from '@playwright/test'
import {
  createSoloClub,
  createBoggleGame,
  createConnectionsGame,
  createSpellingbeeGame,
  createStrandsGame,
  createWordiplyGame,
  createWordleGame,
  createWordwheelGame,
} from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * Restart must hand back a board the player can play BLIND — the rule
 * `common.reset_game` states outright ("the same board, hunted blind again — a
 * replay whose answer is still on screen isn't a second try").
 *
 * Why this file exists: the DB half was well covered — every game has a pgTAP
 * replay test, and they all passed while crosswords shipped a Restart that
 * cleared the grid and then painted the entire solution into it (aae1f5c3).
 * Both defects were client-side, in state that outlived the reset because the
 * play surface never unmounts. pgTAP structurally cannot see that, and only a
 * handful of games had any FE restart coverage at all.
 *
 * So this is deliberately SHALLOW and WIDE: reach terminal, reveal the answer,
 * restart, and assert the two things that broke — no revealed answer left on
 * screen, and no terminal verdict left under it. It is not a replacement for a
 * game's own replay test; it's the one assertion none of them were making.
 */

/** End the game from the menu, through whatever confirm the game shows. */
async function endGame(page: Page) {
  await page.getByRole('button', { name: 'Game menu' }).click()
  await page.getByRole('menuitem', { name: /^End game/ }).click()
  const confirm = page.locator('[data-floating-panel]').getByRole('button', { name: /End game/ })
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
}

/** Restart from the menu (no confirm at terminal — see useStandardGameActions). */
async function restart(page: Page) {
  await page.getByRole('button', { name: 'Game menu' }).click()
  await page.getByRole('menuitem', { name: 'Restart' }).click()
}

/**
 * Reveal the answer if this game offers it, wherever it lives. Two homes across
 * the roster: strands + wordle carry a "Reveal answer" MENU item; the others put
 * a RevealButton in the terminal action row. `count()` first, always — a
 * zero-match locator makes `isEnabled()`/`click()` auto-wait to the timeout.
 */
async function revealIfOffered(page: Page) {
  const rowBtn = page.getByRole('button', { name: /^Reveal/ })
  if (await rowBtn.count()) {
    if (await rowBtn.first().isEnabled()) await rowBtn.first().click()
    return
  }
  await page.getByRole('button', { name: 'Game menu' }).click()
  const item = page.getByRole('menuitem', { name: /^Reveal/ })
  if ((await item.count()) === 1 && (await item.isEnabled())) await item.click()
  else await page.keyboard.press('Escape')
}

/** Every game's terminal verdict says one of these somewhere on the surface
 *  ("Ended: 0 words, 0 points", "Game ended", "Game over"). */
const VERDICT = /Ended:|Game ended|Game over/

const GAMES = [
  { name: 'boggle', make: createBoggleGame },
  { name: 'spellingbee', make: createSpellingbeeGame },
  { name: 'strands', make: createStrandsGame },
  { name: 'wordiply', make: createWordiplyGame },
  { name: 'wordle', make: createWordleGame },
  { name: 'wordwheel', make: createWordwheelGame },
] as const

for (const g of GAMES) {
  test(`${g.name}: Restart leaves no verdict and no revealed answer`, async ({ browser }) => {
    const club = await createSoloClub(`rs${g.name.slice(0, 4)}`)
    const game = await g.make(club)
    const ctx = await browser.newContext()
    await signIn(ctx, club.members[0].session)
    const page = await ctx.newPage()
    await page.goto(`/g/${game.gametype}/${game.id}`)
    await expect(page.getByRole('button', { name: 'Game menu' })).toBeVisible({ timeout: 25000 })

    await endGame(page)
    await expect(page.getByText(VERDICT).first()).toBeVisible({ timeout: 10000 })
    await revealIfOffered(page)
    await page.waitForTimeout(500)

    await restart(page)

    // Playable again: the verdict is gone from the surface…
    await expect(page.getByText(VERDICT)).toHaveCount(0, { timeout: 10000 })
    // …and so is every reveal affordance, which only exists at terminal. That's
    // the FE's own signal that it isn't still holding a revealed solution — the
    // shape of the crosswords bug, where the answers stayed painted on a board
    // the server had already cleared and un-revealed.
    await expect(page.getByRole('button', { name: /^Reveal/ })).toHaveCount(0)
  })
}

test('connections: Restart un-reveals a spent hint', async ({ browser }) => {
  // The second instance of the same class, found while auditing: <HintList>
  // held its revealed set locally, and a restart doesn't unmount the surface —
  // so a replay of the SAME sixteen tiles started with a category name already
  // given away.
  const club = await createSoloClub('rshint')
  const game = await createConnectionsGame(club, 'coop')
  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.getByRole('button', { name: /Hints/i }).first()).toBeVisible({ timeout: 25000 })

  await page.getByRole('button', { name: /Hints/i }).first().click()
  const before = await page.getByRole('button', { name: /Reveal/i }).count()
  expect(before).toBe(4)
  await page.getByRole('button', { name: /Reveal/i }).first().click()
  await expect(page.getByRole('button', { name: /Reveal/i })).toHaveCount(3)

  await page.getByRole('button', { name: 'Game menu' }).click()
  await page.getByRole('menuitem', { name: 'Restart' }).click()
  const confirm = page.locator('[data-floating-panel]').getByRole('button', { name: /Restart/ })
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await page.waitForTimeout(2000)

  // All four are hidden again — the second attempt is blind.
  await expect(page.getByRole('button', { name: /Reveal/i })).toHaveCount(4)
})
