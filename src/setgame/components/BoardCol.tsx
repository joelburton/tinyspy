import { cls } from '../../common/lib/util/cls'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { HintButton } from '../../common/components/buttons/HintButton'
import { MobileStatusBar } from '../../common/components/game/MobileStatusBar'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { Card as CardCode } from '../lib/cards'
import type { FlashKind } from '../lib/flash'
import { Board } from './Board'
import { Counts } from './Counts'
import { countsFor, hintLabel } from '../lib/readouts'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

type Props = {
  board: readonly CardCode[]
  selected: readonly CardCode[]
  hinted: readonly CardCode[]
  flashes: ReadonlyMap<CardCode, FlashKind>
  disabled: boolean
  /** Turn-by-turn coop, someone else's turn — fades the table. See `Board`. */
  waiting: boolean
  // ── The mobile status bar's contents ──
  isCompete: boolean
  teamFound: number
  deckLeft: number
  hintsUsed: number
  canHint: boolean
  onHint: () => void
  onCardClick: (card: CardCode) => void
  /** The own-move verdict, the terminal line, or the your-turn prompt. */
  pill: GenericFeedbackMsg | null
  onDismissPill: () => void
}

/**
 * setgame's board column: the table, and one fixed-height row beneath it.
 *
 * That row is the whole below-board apparatus, and it is much smaller than most
 * games' because setgame has **no text entry at all** — no typed word, no move
 * row, no on-screen keyboard. A claim is three cards; there is nothing to echo
 * back. What the row does carry is the pill: your own verdict, the terminal
 * result, or (in turn-by-turn coop) the prompt that it is your move.
 *
 * Fixed height, empty or not. The pill comes and goes constantly during play,
 * and a collapsing row would bounce the board on every claim.
 *
 * Above the board sits the shared `<MobileStatusBar>`, which is `display: none`
 * on desktop and costs nothing there. Below the breakpoint the whole info column
 * is off-canvas in the `<InfoSheet>`, so without it a player has to open a sheet
 * to read their own score — and, in this game, to ask for a hint. **The hint
 * button is duplicated there on purpose**: asking is a routine move here, not a
 * rescue, and routine moves belong on the play surface. Both copies are the same
 * component with the same `hintLabel`, so they cannot come to say different
 * things.
 */
export function BoardCol({
  board,
  selected,
  hinted,
  flashes,
  disabled,
  waiting,
  isCompete,
  teamFound,
  deckLeft,
  hintsUsed,
  canHint,
  onHint,
  onCardClick,
  pill,
  onDismissPill,
}: Props) {
  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <MobileStatusBar>
        <div className={styles.mobileStatus}>
          <Counts items={countsFor('mobile', { isCompete, teamFound, deckLeft, hintsUsed })} />
          {/* Rendered in compete too, disabled and saying why — the same call
              the info column's copy makes, for the same reason: a button that
              vanishes leaves a player hunting for a feature they know exists. */}
          <HintButton
            iconOnly
            className={shared.helperButton}
            onClick={onHint}
            disabled={isCompete || !canHint}
            label={hintLabel(isCompete)}
          />
        </div>
      </MobileStatusBar>

      <Board
        board={board}
        selected={selected}
        hinted={hinted}
        flashes={flashes}
        disabled={disabled}
        waiting={waiting}
        onCardClick={onCardClick}
      />
      <div className={styles.pillSlot}>
        {pill && <GenericFeedbackPill msg={pill} onClose={onDismissPill} />}
      </div>
    </div>
  )
}
