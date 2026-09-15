// cs-blessed-game-page

import type { ReactNode } from 'react'
import { ActionButton } from '../actions/ActionButton'
import type { BoundAction } from '../actions/useBoundAction'
import styles from './DeviceBlockNotice.module.css'

type Props = {
  // The headline — names the constraint ("Bananagrams needs a desktop").
  title: string
  // The explanation of *why* this device can't play, and what to do instead.
  children: ReactNode
  // Exit: leaving for the club page is the only thing to do from here. The
  // SHELL's `act-back-to-club` (`ctx.menu.actBackToClub`), not a callback — a
  // blocked player leaves a live game exactly the way anyone else does, which
  // means shelving it so the others are told rather than left waiting.
  actBackToClub: BoundAction
}

/**
 * The "you can't play this game on this device" screen (docs/mobile.md → "Where
 * each game plays"). Some games are drag-heavy or real-keyboard-required and
 * degrade to a broken experience on the wrong device; rather than let a friend
 * limp through overflow and page-scroll, the game's PlayArea renders THIS in
 * place of its board when the device can't support it.
 *
 * Purely presentational — it takes no view of *which* device or *why*. Both the
 * axis to gate on (`useIsCoarsePointer` for a drag-only game, `useIsPhone` for a
 * keyboard-required one) and the words are the game's own, decided in its
 * PlayArea, so each game states its own constraint. Which games gate, and on
 * what, is docs/mobile.md → "Where each game plays".
 *
 * It renders inside `<GamePage>`'s chrome, so the header menu (and its own
 * Back-to-club) stay reachable too; the in-card button is the obvious exit.
 */
export function DeviceBlockNotice({ title, children, actBackToClub }: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.reason}>{children}</p>
        <ActionButton action={actBackToClub} show="both" weight="primary" />
      </div>
    </div>
  )
}
