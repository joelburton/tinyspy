import { test, expect } from '@playwright/test'
import { createClubWithMembers, createCrosswordsGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The common scratchpad feature, exercised through crosswords (its first
 * consumer). Two coop players share one pad: one types, the other sees the
 * text sync live AND sees the pad go read-only (the takeover lock).
 */
test.describe('scratchpad', () => {
  test('shared coop notes sync live + the editor holds the lock', async ({ browser }) => {
    const club = await createClubWithMembers(['alice', 'bob'])
    const [alice, bob] = club.members
    const game = await createCrosswordsGame(club, 'coop')

    const aliceCtx = await browser.newContext()
    await signIn(aliceCtx, alice.session)
    const a = await aliceCtx.newPage()
    await a.goto(`/g/${game.gametype}/${game.id}`)

    const bobCtx = await browser.newContext()
    await signIn(bobCtx, bob.session)
    const b = await bobCtx.newPage()
    await b.goto(`/g/${game.gametype}/${game.id}`)

    // Both open the scratchpad.
    await a.getByRole('button', { name: 'Open scratchpad' }).click()
    await b.getByRole('button', { name: 'Open scratchpad' }).click()

    const aPad = a.getByRole('textbox', { name: 'Scratchpad' })
    const bPad = b.getByRole('textbox', { name: 'Scratchpad' })
    await expect(aPad).toBeVisible({ timeout: 15000 })
    await expect(bPad).toBeVisible({ timeout: 15000 })

    // Alice types → it flushes to the DB and syncs to Bob via CDC.
    await aPad.fill('theme: animals')
    await expect(bPad).toHaveValue('theme: animals', { timeout: 10000 })

    // Bob sees Alice holds the edit lock → his pad is read-only.
    await expect(bPad).not.toBeEditable()
    await expect(b.getByText(/is editing/i)).toBeVisible()
  })
})
