import { expect, type Locator, type Page } from '@playwright/test'

/**
 * "The board is on screen" is a WEAKER claim than "the game is listening", and
 * the gap between them is a real, measurable window that keystrokes fall into.
 *
 * A play surface captures the keyboard from a window-level listener attached in
 * a passive effect (`useGlobalKeyHandler`). React puts the board's DOM nodes in
 * the document at COMMIT — before paint — and flushes that passive effect a few
 * milliseconds later. Playwright's visibility check is satisfied by the commit,
 * so a test that types the instant the board appears can type into a game that
 * hasn't started listening. Measured on this app: the listener attaches
 * **0.5–18ms after the board enters the DOM, on every single load**. Playwright
 * usually notices the board 47–417ms later and so types safely; roughly 1% of
 * the time its polling tick lands inside the window and the first keystroke is
 * silently dropped — a truncated word, a "not a word" pill, a baffling failure
 * a hundred lines downstream (spellingbee-coop-win, 2026-08-07).
 *
 * So this waits for the frame boundary after the board appears, by which React
 * has flushed the effect. Deliberately an OBSERVATION, not a probe: an earlier
 * draft pressed a letter and watched for it to register, which is a real move
 * committed into a live game — fine where entry is a buffer you can Backspace,
 * wrong in any game where a keystroke IS the move. A readiness check must not
 * be able to change the thing it's checking.
 *
 * Use this instead of a bare `toBeVisible` wherever a test types into a board.
 */
export async function boardReady(page: Page, board: Locator, timeout = 25_000): Promise<void> {
  await expect(board).toBeVisible({ timeout })
  await settled(page)
}

/**
 * Wait for the next painted frame — two `requestAnimationFrame`s, so we're past
 * the frame in which the caller's condition became true rather than merely
 * inside it. React's passive effects flush ahead of that boundary.
 *
 * Standalone because not every surface is reached through `boardReady`: a test
 * that types after something OTHER than the initial mount (a restart, a mode
 * switch, a remounted surface) needs the same settle without re-asserting
 * visibility.
 */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}
