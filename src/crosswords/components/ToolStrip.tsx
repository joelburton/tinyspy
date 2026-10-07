// cs-unmet

import { ActionButton } from '@/common/actions/ActionButton'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import type { EndingMessage } from '@/common/ending/endingMessage'
import type { GActions } from '../reactTypes'
import type { GGameData } from '../types'
import { Controls } from './Controls'
import styles from './ToolStrip.module.css'

type Props = {
  gd: GGameData
  actions: GActions
  pencil: boolean
  // Mine while I have conceded and the others race on; null otherwise.
  playerEndingMessage: EndingMessage | null
}

/**
 * The strip under the clue lists — three states, one slot:
 *
 *   - playing: the tool bar (pen / pencil, the check and reveal ladders, the
 *     exits);
 *   - conceded mid-race: my ending's line, the reveal (inert: the solution
 *     waits for the end of the GAME), and Stop in Concede's place;
 *   - ended: the tools are gone — penciling a finished grid is meaningless —
 *     and the row is what is left to do. No outcome line here, unlike every
 *     other game's action row: the verdict is a standing pill in the
 *     active-clue bar just above.
 *
 * Its height changing between the three is no reflow: the board column spans
 * every row of the layout, so only the clue lists above absorb it.
 */
export function ToolStrip({ gd, actions, pencil, playerEndingMessage }: Props) {
  return (
    <div className={styles.strip}>
      {gd.ended ? (
        <div className={styles.actions}>
          {/* Icon-only, so the reveal's two faces occupy one fixed box. */}
          <ActionButton action={actions.actReveal} show="icon" />
          <ActionButton action={actions.actRestart} show="icon" />
          <ActionButton action={actions.actNewGame} show="icon" />
          <ActionButton action={actions.actBackToClub} show="icon" weight="primary" />
        </div>
      ) : playerEndingMessage !== null ? (
        <InfoActionsRow
          message={{ text: playerEndingMessage.infoColText, outcome: playerEndingMessage.outcome }}>
          <ActionButton action={actions.actReveal} show="icon" />
          {/* Out of the race, Concede hides and Stop comes out in its place. */}
          <ActionButton action={actions.actConcede} show="icon" />
          <ActionButton action={actions.actStopGame} show="icon" />
        </InfoActionsRow>
      ) : (
        <div className={styles.toolRow}>
          {/* The exits ride inside the bar, in their own group; each hides
              itself in the mode that isn't its own. */}
          <Controls pencil={pencil} actPencil={actions.actPencil} check={actions.check} reveal={actions.reveal}>
            <ActionButton action={actions.actConcede} show="icon" />
            <ActionButton action={actions.actStopGame} show="icon" />
          </Controls>
        </div>
      )}
    </div>
  )
}
