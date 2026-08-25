// cs-unmet

import type { ReactNode } from 'react'
import { Link } from '../../lib/routing/Link'
import { cls } from '../../lib/util/cls'
import styles from './ErrorPage.module.css'

type Props = {
  /** The sentence a player reads — what went wrong, in words. */
  message: ReactNode
  /**
   * The `k=v` line, read ALOUD to whoever debugs. Required, not optional: a
   * page that says "something went wrong" and nothing else leaves nothing to
   * diagnose, and every caller either has a classified failure to hand
   * (`faultDiagnostics`) or can write the line itself, the way the homepage's
   * no-clubs fault does.
   */
  diagnostics: string
  /** An extra action beside "← Back home" — the error boundary's Reload. */
  action?: ReactNode
}

/**
 * A dead end: the route cannot render, and no amount of waiting will change
 * that. The club failed to load, the game does not exist, a render crashed.
 *
 * **The rule this component is one half of** (Joel, 2026-08-23;
 * plans/areas/homepage.md → F39 `loading-and-errors`): the fault MODAL when the
 * page behind it survives, a fault PAGE when it does not. A modal is
 * dismissable, and dismissing one of these would strand you on a blank page —
 * here the failure IS the whole route, so it takes the page's place instead of
 * covering it.
 *
 * It wears the modal's look on purpose — the red "Error", the message, the
 * small separate diagnostics line — so the two read as the same event in two
 * containers rather than as two different kinds of trouble. See
 * `FaultModal.module.css`, which this mirrors.
 *
 * Every one of these carries the SAME way out, because the five it replaced had
 * three different ones and one had none at all.
 *
 * The body is a `.card` — a bordered section of a page, which is what a card is
 * (F37 `card-only-page`), and what all five of these already were. So the page
 * still reads as white-on-gray like the modal does; only the content inside it
 * is now one shape instead of five.
 *
 * It is also a `.pageMain`, taking the app's default page width: an error is a
 * page like any other, and "the width when a page doesn't need a custom one" is
 * exactly what it wants (Joel, 2026-08-23).
 */
export function ErrorPage({ message, diagnostics, action }: Props) {
  return (
    <div className={cls('card', 'pageMain', styles.page)}>
      <h1 className={styles.heading}>Error</h1>
      <p className={styles.message}>{message}</p>
      <p className={styles.diagnostics}>{diagnostics}</p>
      <p className={styles.actions}>
        <Link to="/" className="link-button">
          ← Back home
        </Link>
        {action}
      </p>
    </div>
  )
}
