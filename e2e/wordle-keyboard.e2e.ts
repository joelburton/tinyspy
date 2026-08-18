import { execFileSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { createSoloClub, createWordleGame } from './helpers/fixtures'
import { signIn } from './helpers/session'

/**
 * The on-screen keyboard's colours, resting and hovered.
 *
 * Browser-only, and unusually worth the cost: every one of these values is a
 * COMPUTED style, so jsdom can't see any of it — and the three bugs this spec was
 * written after were all invisible to the unit suite. They were also all the same
 * bug wearing different hats: `.key:hover` is specificity (0,3,0) where a tone
 * class is (0,1,0), so a hover rule that sets `background` outright beats every
 * key that has a fill of its own. A green key turned white with its white ink
 * still on it; so did ENTER. The fix is the house discipline — the hover rule
 * reads `--kbd-key-hover-fill-color` OFF THE ELEMENT, and anything with its own
 * fill re-sets that token — and this spec is what keeps it fixed.
 *
 * It asserts against the TOKENS rather than against literal hexes, by resolving
 * each token in the page and comparing. So retuning the palette (which the colour
 * sweep did twice while this was being written) can't break the spec, and the
 * spec can't quietly pin a value nobody meant to freeze.
 *
 * It never prints the answer: the target is read as the superuser only to pick a
 * guess that yields all three colours, and only the guess is logged.
 */

const psql = (sql: string): string[] =>
  execFileSync(
    'psql',
    ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-tAX', '-c', sql],
    { encoding: 'utf8' },
  )
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * wordle's colouring, duplicate-aware: greens first, then each remaining letter
 * takes a yellow only if the target still has an unspent copy of it.
 *
 * The naive version (does the target CONTAIN this letter?) is wrong on repeats —
 * guess RIVER against a target with one R would paint both Rs — and the target is
 * random per game, so a spec that assumed distinct letters would pass most days
 * and fail on the rest. The server is still the authority: this only picks a
 * likely guess, and the assertions read the tones off the keyboard.
 */
function colour(target: string, guess: string): string[] {
  const out = Array(guess.length).fill('gray')
  const spare: Record<string, number> = {}
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === target[i]) out[i] = 'green'
    else spare[target[i]] = (spare[target[i]] ?? 0) + 1
  }
  for (let i = 0; i < guess.length; i++) {
    if (out[i] === 'green') continue
    if ((spare[guess[i]] ?? 0) > 0) {
      out[i] = 'yellow'
      spare[guess[i]]--
    }
  }
  return out
}

/** A legal guess that scores at least one of each colour against the hidden target. */
function pickTricolorGuess(gameId: string): string {
  const [target, band] = psql(
    `select target, legal_guess from wordle.games where id = '${gameId}';`,
  )[0].split('|')
  const words = psql(
    `select word from common.words where len = 5 and difficulty <= ${Number(band)} ` +
      `and word <> '${target}' limit 4000;`,
  )
  for (const w of words) {
    const tones = new Set(colour(target, w))
    if (tones.size === 3) return w
  }
  throw new Error('no legal word scores all three colours against this target')
}

test('the keyboard wears the right fill and ink, resting and hovered', async ({ browser }) => {
  const club = await createSoloClub('kbdcol')
  const game = await createWordleGame(club)
  const guess = pickTricolorGuess(game.id)

  const ctx = await browser.newContext()
  await signIn(ctx, club.members[0].session)
  const page = await ctx.newPage()
  await page.goto(`/g/${game.gametype}/${game.id}`)
  await expect(page.locator('[data-board]')).toBeVisible({ timeout: 20000 })

  // Play it through the real input path, so the keyboard tints the way it does
  // for a player rather than from seeded rows.
  for (const ch of guess) await page.keyboard.press(ch)
  await page.keyboard.press('Enter')
  // The reveal flip is staggered per tile; the keys tint when the row lands. Poll
  // on the tone CLASSES rather than on a colour, so this wait can't be the one
  // place in the spec that pins a literal value.
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('[aria-label="Keyboard"] button')].filter((b) =>
            /wordle(Green|Yellow|Gray)/.test(b.className),
          ).length,
      ),
    )
    .toBeGreaterThan(1)

  /** A token's value as the browser resolves it — the spec's source of truth. */
  const token = (name: string) =>
    page.evaluate((n) => {
      const probe = document.createElement('div')
      probe.style.color = `var(${n})`
      document.body.append(probe)
      const v = getComputedStyle(probe).color
      probe.remove()
      return v
    }, name)

  const key = (label: string) =>
    page.locator('[aria-label="Keyboard"]').getByRole('button', { name: label, exact: true })

  const look = async (label: string) => {
    const b = key(label)
    const resting = await b.evaluate((e) => ({
      fill: getComputedStyle(e).backgroundColor,
      ink: getComputedStyle(e).color,
    }))
    await b.hover()
    const hovered = await b.evaluate((e) => ({
      fill: getComputedStyle(e).backgroundColor,
      ink: getComputedStyle(e).color,
    }))
    return { resting, hovered }
  }

  // Which letter earned which colour, read off the KEYS themselves — the server's
  // answer, not a recomputation of it. (Not off the tiles: a freshly-revealed row
  // wears the flip animation's class rather than its colour class, since
  // `animation-fill-mode: both` freezes the final frame.)
  const byTone = await page.evaluate(() => {
    const out: Record<string, string> = {}
    for (const b of document.querySelectorAll('[aria-label="Keyboard"] button')) {
      const cls = b.className
      const tone = /wordleGreen/.test(cls)
        ? 'green'
        : /wordleYellow/.test(cls)
          ? 'yellow'
          : /wordleGray/.test(cls)
            ? 'gray'
            : ''
      const label = b.getAttribute('aria-label') ?? ''
      if (tone && !out[tone] && label.length === 1) out[tone] = label
    }
    return out
  })
  expect(Object.keys(byTone).sort()).toEqual(['gray', 'green', 'yellow'])

  const white = await token('--ink-on-dark-color')
  const darkInk = await token('--kbd-key-ink-color')

  // A JUDGED key wears its wordle colour, resting AND hovered — the hover must not
  // repaint a key that has a fill of its own.
  for (const [tone, letter] of Object.entries(byTone)) {
    const fill = await token(`--wordle-${tone}-fill-color`)
    const { resting, hovered } = await look(letter)
    expect(resting, `${tone} key at rest`).toEqual({ fill, ink: white })
    expect(hovered, `${tone} key hovered`).toEqual({ fill, ink: white })
  }

  // An UNTRIED key is the warm near-white cap with dark ink, and lightens to pure
  // white under the pointer — the one key that does change, because a near-white
  // cap gives a drop shadow almost nothing to read against.
  const untried = [...'abcdefghijklmnopqrstuvwxyz'].find((c) => !guess.includes(c))!
  const plain = await look(untried)
  expect(plain.resting).toEqual({ fill: await token('--kbd-key-fill-color'), ink: darkInk })
  expect(plain.hovered).toEqual({ fill: await token('--kbd-key-hover-fill-color'), ink: darkInk })

  // ENTER is a Submit, so it is the action blue with white ink, and DARKENS on
  // hover like every other filled action button.
  const enter = await look('Enter')
  expect(enter.resting).toEqual({ fill: await token('--chrome-action-color'), ink: white })
  expect(enter.hovered).toEqual({
    fill: await token('--chrome-action-primary-hover-color'),
    ink: white,
  })

  await ctx.close()
})
