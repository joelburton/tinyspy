// cs-unmet

import { cls } from '@/common/utils/cls'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import styles from './HintBar.module.css'

type Props = {
  /** Points on the bar (0..cost). */
  points: number
  /** Valid words per hint — the bar's denominator. */
  cost: number
  /** A hint is already on the board. */
  showing: boolean
  /** Cash a hint. It carries its own reason — "A hint is already showing",
   *  "Find N more valid words", "Reveal the tiles of one theme word" — because
   *  what this control can do depends on the economy, not on the bar. */
  actHint: BoundAction
}

/**
 * The hint economy, below the board: a bar that fills as valid non-theme words
 * are found, and the button that cashes it.
 *
 * **Below the board, not in the info column** — and that is a real placement
 * decision rather than a default. On a phone the info column moves off-canvas
 * into the InfoSheet, and the hint bar is core play, not a readout you check
 * occasionally: a player who can't see how close the next hint is has lost the
 * loop the game runs on.
 *
 * **The full bar is the only signal that further points are being lost.** Per
 * Joel's ruling the counter caps at `cost`, so words found while a hint sits
 * unspent earn nothing — and nothing warns about it, deliberately. That makes
 * the filled state load-bearing, which is why it gets its own styling rather
 * than just being "100% wide".
 *
 * **The button is clickable before the bar fills**, and the host answers that
 * click with the number of words still to go. The bar shows *progress* but
 * never states the remaining count, so an early click is a fair question — and
 * a disabled button is the one response that can't answer it.
 */
export function HintBar({ points, cost, showing, actHint }: Props) {
  const full = points >= cost
  const pct = Math.min(100, Math.round((points / Math.max(1, cost)) * 100))

  return (
    <div className={styles.row}>
      <div
        className={styles.track}
        role="meter"
        aria-valuenow={points}
        aria-valuemin={0}
        aria-valuemax={cost}
        aria-label="Progress to the next hint"
      >
        <div
          className={cls(styles.fill, full && styles.fillFull)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* `act-hint` — icon + label, in the roster's amber "help" tone (ui.md →
          Button iconography). NOT icon-only: this is the one control the whole
          hint economy exists to reach, so it says its name. */}
      <ActionButton
        action={actHint}
        show="both"
        className={cls(styles.hint, full && !showing && styles.hintReady)}
        // A hint already on the board blocks a second one, and an UNFILLED bar
        // deliberately does NOT: clicking early is a question — "how many
        // more?" — and a dead button refuses to answer, so the run says the
        // number in the feedback pill instead. Both are the action's to decide;
        // what stays here is `hintReady`, which fills the button amber only when
        // a hint is actually there to cash.
      />
    </div>
  )
}
