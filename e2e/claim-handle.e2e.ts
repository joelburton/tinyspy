import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { signIn } from './helpers/session'

const URL = 'http://127.0.0.1:54321'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

/**
 * The claim-handle screen (first sign-in). Reached by a signed-in user with NO
 * `common.profiles` row — which is why this file builds its own user instead of
 * using `createSoloClub`: the fixtures helper claims a username, the very step
 * under test here.
 *
 * The guard: **typing a username must not move the color selection.** The color
 * used to be derived (`picked ?? defaultColorFor(desired)`), so every keystroke
 * re-hashed the handle and the selected swatch hopped around the palette while
 * the player was typing in a different control. It's now seeded once and owned
 * by the player. Only a real render catches this — the derivation was correct in
 * isolation; what was wrong was that it re-ran.
 */
test('claim screen: typing a username leaves the color selection alone', async ({
  browser,
}) => {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
  const email = `claim${Date.now().toString(36)}@e2e.test`
  const password = 'e2e-password-1234'
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (made.error) throw new Error(made.error.message)
  const signed = await createClient(URL, ANON, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email, password })
  if (signed.error) throw new Error(signed.error.message)

  const ctx = await browser.newContext()
  await signIn(ctx, signed.data.session!)
  const page = await ctx.newPage()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /set you up/i })).toBeVisible({
    timeout: 20000,
  })

  // Index of the pressed swatch (ColorChoiceList renders aria-pressed buttons).
  const selectedColor = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('button[aria-pressed]')].findIndex(
        (b) => b.getAttribute('aria-pressed') === 'true',
      ),
    )

  const before = await selectedColor()
  expect(before).toBeGreaterThanOrEqual(0) // something IS pre-selected

  await page.locator('input[type=text]').first().fill('')
  await page.keyboard.type('zebra')
  expect(await selectedColor()).toBe(before) // …and it didn't budge

  // The player still owns it: clicking a different swatch selects that one.
  const other = (before + 3) % 8
  await page.locator('button[aria-pressed]').nth(other).click()
  expect(await selectedColor()).toBe(other)
  // …and it survives more typing.
  await page.keyboard.type('x')
  expect(await selectedColor()).toBe(other)

  await ctx.close()
})
