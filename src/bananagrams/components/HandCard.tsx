import type { PointerEvent as ReactPointerEvent } from 'react'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { IconExchange } from '../../common/components/icons'
import type { DragState } from '../../common/hooks/useDragGesture'
import { DUMP_COUNT, blurActiveField, type DragSource } from '../hooks/usePlayerBoard'
import styles from './PlayerBoard.module.css'

/**
 * bananagrams' info-column VIEW — the HAND card. A plain heading over a bordered box
 * (matching the shared WordList / TurnLog chrome): the dump zone at the top (you dump
 * one of a few tiles often, so keep the target close), the ⟲ rotate floating over the
 * tiles' corner, and the scrolling hand tiles below.
 *
 * Purely presentational: `usePlayerBoard` owns the state; this renders `displayedHand`
 * and forwards the pointer-downs. It is NOT an `InfoCol` (it owns no input — the hand
 * tiles are drag SOURCES into the board, and the dump zone is a drop TARGET, both
 * driven by the shared engine; see usePlayerBoard).
 *
 * DOM contract (load-bearing for the drag `elementFromPoint` + the e2e): the tiles
 * container carries `data-zone="hand"`, each tile `data-hand-tile`, and the dump slot
 * `data-zone="dump"` — keep those exact.
 */
export function HandCard({
  displayedHand,
  drag,
  dumpHot,
  errFlash,
  errNonce,
  onHandPointerDown,
  onShuffle,
  hasDump,
  isTerminal,
  isConceded,
  bunchCount,
  boxCount,
}: {
  /** The hand to render (held tiles minus what's on the board, in shuffle order). */
  displayedHand: string
  /** The live drag state (for the "lifting this hand tile" dim + arming the dump),
   *  or null. */
  drag: DragState<DragSource> | null
  /** A dragged tile is hovering the dump slot (greens it). */
  dumpHot: boolean
  /** The "you don't hold that tile" red flash, and a nonce so a repeat miss replays. */
  errFlash: boolean
  errNonce: number
  onHandPointerDown: (index: number, letter: string, e: ReactPointerEvent) => void
  onShuffle: () => void
  /** Is dumping wired (PlayArea passed `onDump`)? Gates the dump zone. */
  hasDump: boolean
  isTerminal: boolean
  isConceded: boolean
  /** Bunch + box counts — the dump can draw from both; too low ⇒ the slot disables. */
  bunchCount?: number
  boxCount?: number
}) {
  const showDump = hasDump && !isTerminal && !isConceded
  const showControls = !isTerminal && !isConceded // rotate is hidden once out of the race
  // A dump draws from the bunch + box together (see usePlayerBoard's finishDrag).
  const drawable = bunchCount === undefined ? undefined : bunchCount + (boxCount ?? 0)
  const dumpTooLow = drawable !== undefined && drawable < DUMP_COUNT

  return (
    <div className={styles.handSection}>
      <h3 className={styles.handHeading}>Hand</h3>
      <div className={styles.handBox}>
        {/* Dump zone — drop a tile here (from the hand OR the board) to swap it for
            DUMP_COUNT. Info-blue dashed target; brightens while a tile is dragged,
            greens when one hovers it. Hidden once terminal or conceded. */}
        {showDump && (
          <div
            data-zone="dump"
            className={
              styles.dump +
              (drag && !dumpTooLow ? ' ' + styles.dumpArmed : '') +
              (dumpHot ? ' ' + styles.dumpHot : '') +
              (dumpTooLow ? ' ' + styles.dumpDisabled : '')
            }
          >
            {dumpTooLow ? (
              'Bunch too low to dump'
            ) : (
              <>
                <IconExchange size={16} aria-hidden /> Drag tile here to dump
              </>
            )}
          </div>
        )}

        <div className={styles.handTilesWrap}>
          {showControls && (
            <ShuffleButton
              className={styles.floatingRotate}
              onShuffle={onShuffle}
              disabled={displayedHand.length === 0}
              label="Shuffle hand"
            />
          )}
          <div className={styles.hand} data-zone="hand" onPointerDown={blurActiveField}>
            {/* Red box flash: "you don't hold that tile" (a keyboard miss). Keyed by the
                nonce so a repeated miss replays the animation; pointer-events:none so it
                never blocks tile drags. */}
            {errFlash && <div key={errNonce} className={styles.handError} aria-hidden />}
            {displayedHand.split('').map((letter, i) => (
              <div
                key={i}
                data-hand-tile
                className={
                  styles.handTile +
                  (drag && drag.source.kind === 'hand' && drag.source.index === i
                    ? ' ' + styles.lifted
                    : '')
                }
                onPointerDown={(e) => onHandPointerDown(i, letter, e)}
              >
                {letter}
              </div>
            ))}
            {displayedHand.length === 0 && <span className={styles.handEmpty}>all tiles placed!</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
