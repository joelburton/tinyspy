// cs-unmet

import styles from './Loading.module.css'

/**
 * "We're fetching this; the page will be here in a moment."
 *
 * ONE component and ONE word, because there was never more than one idea here:
 * the app, the club page and the game page each said it in their own sentence
 * ("Loading…", "Loading club…", "Loading game…") and each wrapped it in a
 * `.card`.
 *
 * NO BOX, deliberately (Joel, 2026-08-23: *"they're not a card and don't need
 * or want a border"*). A bordered box that exists for 200ms and is then
 * replaced by a differently shaped one is a flash, which is the thing
 * docs/ui.md → Layout stability exists to prevent. A word on the page costs
 * nothing when it goes.
 *
 * Not to be confused with a slot held open while data arrives — HomePage keeps
 * a blank line where its club list will be, because the rest of that page is
 * already on screen. This is for when the WHOLE page is still pending.
 */
export function Loading() {
  return <p className={styles.loading}>Loading…</p>
}
