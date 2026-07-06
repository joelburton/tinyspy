import { test, expect } from '@playwright/test'
import { createClubWithMembers } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * A club chat message appears in the GLOBAL feedback area (the header pill) for
 * every OTHER member — "HANDLE: text" — and NOT for the sender. Two contexts:
 * bea sends a message from the club page; alice (also on the club page) sees the
 * pill, bea does not.
 */
test('chat message pops a global-feedback pill for other members, not the sender', async ({
  browser,
}) => {
  const club = await createClubWithMembers(['alice', 'bea'])
  const [alice, bea] = club.members

  const aliceCtx = await browser.newContext()
  await signIn(aliceCtx, alice.session)
  const alicePage = await aliceCtx.newPage()
  await alicePage.goto(`/c/${club.handle}`)
  await expect(alicePage.getByRole('heading', { name: /Club:/ })).toBeVisible({ timeout: 20000 })

  const beaCtx = await browser.newContext()
  await signIn(beaCtx, bea.session)
  const beaPage = await beaCtx.newPage()
  await beaPage.goto(`/c/${club.handle}`)
  await expect(beaPage.getByRole('heading', { name: /Club:/ })).toBeVisible({ timeout: 20000 })

  // bea opens chat and sends a message.
  await beaPage.getByRole('button', { name: /Open chat/ }).click()
  const input = beaPage.getByPlaceholder('Type a message and press Enter…')
  await input.fill('hello everyone')
  await input.press('Enter')

  // alice sees the global-feedback pill "bea: hello everyone".
  await expect(alicePage.getByText('bea', { exact: false })).toBeVisible({ timeout: 10000 })
  await expect(alicePage.getByText('hello everyone')).toBeVisible()

  // bea (the sender) does NOT get her own message as a pill. Her chat panel shows
  // the message, but the header feedback slot should not carry it — assert the
  // pill text isn't present outside the chat panel. Give realtime a moment first.
  await alicePage.waitForTimeout(500)
  const beaPillCount = await beaPage.locator('header').getByText('hello everyone').count()
  expect(beaPillCount).toBe(0)
})
