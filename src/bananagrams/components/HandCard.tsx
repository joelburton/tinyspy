// cs-unmet

import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { IconExchange } from '@/common/icons/icons'
import { blurActiveField } from '@/common/keyboard/keyboardHandoff'
import { cls } from '@/common/utils/cls'
import type { GBoardEditor } from '../reactTypes'
import { Tile } from './Tile'
import infoPanel from '@/common/info-sheet/infoPanel.module.css'
import styles from './HandCard.module.css'

/**
 * bananagrams' info-column VIEW — the HAND card. A plain heading over a
 * bordered box (matching the shared WordList / EventLog chrome): the dump zone
 * at the top (you dump one of a few tiles often, so keep the target close),
 * the ⟲ shuffle floating over the tiles' corner, and the scrolling hand tiles
 * below. It owns no input: the board editor does, and this draws its hand and
 * forwards the pointer-downs.
 *
 * DOM contract (load-bearing for the drag's `elementFromPoint` and the e2e):
 * the tiles container carries `data-zone="hand"`, each slot `data-hand-tile`,
 * and the dump slot `data-zone="dump"` — keep those exact.
 */
export function HandCard({
  editor,
  showDumpZone,
}: {
  editor: GBoardEditor
  // Shuffle shows regardless, since reordering your own hand is not acting
  // on the game.
  showDumpZone: boolean
}) {
  const { displayedHand, drag, dumpHot, canDump, errFlash, errNonce } = editor

  return (
    <div className={styles.handSection}>
      <h3 className={infoPanel.heading}>Hand</h3>
      <div className={cls(infoPanel.box, styles.handBox)}>
        {/* Drop a tile here, from the hand OR the board, to swap it for
            DUMP_COUNT. Brightens while a tile is dragged, greens when one
            hovers it, and says so when the piles cannot cover the draw. */}
        {showDumpZone && (
          <div
            data-zone="dump"
            className={cls(
              styles.dump,
              drag !== null && canDump && styles.dumpArmed,
              dumpHot && styles.dumpHot,
              !canDump && styles.dumpDisabled,
            )}
          >
            {canDump ? (
              <>
                <IconExchange size={16} aria-hidden /> Drag tile here to dump
              </>
            ) : (
              'Bunch too low to dump'
            )}
          </div>
        )}

        <div className={styles.handTilesWrap}>
          <ShuffleButton
            className={styles.floatingRotate}
            action={editor.actShuffle}
            tooltip="Shuffle hand"
          />
          <div className={styles.hand} data-zone="hand" onPointerDown={blurActiveField}>
            {/* "You don't hold that tile": keyed by the nonce so a repeated
                miss replays the flash; pointer-events: none so it never blocks
                a tile drag. */}
            {errFlash && <div key={errNonce} className={styles.handError} aria-hidden />}
            {displayedHand.split('').map((letter, i) => {
              const isLifted =
                drag !== null && drag.source.kind === 'hand' && drag.source.index === i
              return (
                <div
                  key={i}
                  data-hand-tile
                  className={styles.handSlot}
                  onPointerDown={(e) => editor.onHandPointerDown(i, letter, e)}
                >
                  <Tile letter={letter} where="hand" marks={{ isLifted }} />
                </div>
              )
            })}
            {displayedHand.length === 0 && (
              <span className={styles.handEmpty}>all tiles placed!</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
