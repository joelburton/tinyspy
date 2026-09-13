// cs-audited-simple-page

import styles from './Loading.module.css'

/**
 * The word shown while a WHOLE page is still pending — the app before its
 * session resolves, a club or game before its read answers, a play surface
 * behind Suspense. Takes no props.
 *
 * Not for a slot held open inside a page that is already on screen; see
 * `doc.md`.
 */
export function Loading() {
  return <p className={styles.loading}>Loading…</p>
}
