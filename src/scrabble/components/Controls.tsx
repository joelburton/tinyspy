import type { GenericFeedbackMsg } from '../../common/lib/games'
import { GenericFeedbackPill } from '../../common/components/GenericFeedbackPill'
import { ClearButton } from '../../common/components/buttons/ClearButton'
import { SharePreviewButton } from '../../common/components/buttons/SharePreviewButton'
import { ExchangeButton } from '../../common/components/buttons/ExchangeButton'
import { SubmitWithScore } from '../../common/components/buttons/SubmitWithScore'
import { PassButton } from '../../common/components/buttons/PassButton'
import { cls } from '../../common/lib/cls'
import styles from './PlayArea.module.css'
import shared from '../../common/components/PlayArea.module.css'

/**
 * The action half of scrabble's below-board row (the rack — with its floating
 * Shuffle — is rendered beside it by PlayArea). Recall on the left; the **commit
 * slot** ([Swap] [Pass] [Submit]) pushed to the right edge. That slot doubles as
 * the **local feedback area**: when `pill` is set (an own-move result, or the
 * terminal verdict) it shows a `<GenericFeedbackPill>` in place of the buttons AND fills
 * the whole space (so a longer message reads before it clips). The rack (to the
 * left) stays interactive, so a keystroke / tile tap dismisses the pill.
 *
 * The commit buttons:
 *   - **Swap** (`ExchangeButton`, icon-only, info tone) — return rack tiles.
 *   - **Pass** (compete only; the `EndTurnButton` octagon, but de-emphasized to
 *     icon-only + secondary + warning tone — passing isn't the main move here, so
 *     it doesn't carry the primary weight codenamesduet's pass does).
 *   - **Submit** (`SubmitWithScore`) — the primary action, doubling as the live
 *     score preview ("+score", or an em-dash on an empty board). `canSubmit`
 *     enables it for any placed tiles (an illegal shape is explained by a pill on
 *     submit, not by disabling).
 *
 * The **Share** button (coop, ≥2 players only) sits beside Recall on the LEFT — not
 * in the commit slot — so it stays visible when a pill takes the slot over. It
 * broadcasts the staged tiles for teammates to preview (see useSharedMove).
 *
 * Disabled-state logic is computed in PlayArea and passed down.
 */
export function Controls({
  isCompete,
  canCommit,
  hasTentative,
  selectedCount,
  canExchange,
  submitting,
  submitScore,
  canSubmit,
  canShare,
  onShare,
  pill,
  onSubmit,
  onRecall,
  onExchange,
  onPass,
}: {
  isCompete: boolean
  /** May commit a turn-consuming move (Swap / Pass) — i.e. it's your turn. */
  canCommit: boolean
  hasTentative: boolean
  selectedCount: number
  canExchange: boolean
  submitting: boolean
  /** The staged play's score for the Submit preview; `null` (empty board) shows
   *  an em-dash. */
  submitScore: number | null
  /** Whether the staged play is submittable (tiles placed + the player can act). */
  canSubmit: boolean
  /** Coop with ≥2 players — render the Share button (a teammate can be shown). */
  canShare: boolean
  /** Broadcast the staged tiles to teammates for a read-only preview. */
  onShare: () => void
  /** An own-move / terminal pill to show IN the commit slot (replacing the commit
   *  buttons + filling its width), or null to show the buttons. */
  pill: GenericFeedbackMsg | null
  onSubmit: () => void
  onRecall: () => void
  onExchange: () => void
  onPass: () => void
}) {
  return (
    <div className={styles.controls}>
      <ClearButton iconOnly label="Recall" disabled={!hasTentative} onClick={onRecall} />
      {/* Show a move to teammates (coop, ≥2 players). On the left with Recall so a
          pill in the commit slot never hides it; enabled only with tiles staged. */}
      {canShare && (
        <SharePreviewButton label="Show move to team" disabled={!hasTentative} onClick={onShare} />
      )}

      <div
        className={cls(styles.moveAreaOrLocalFeedback, pill && styles.moveAreaOrLocalFeedbackPill)}
      >
        {pill ? (
          // Sticky local feedback — no × (the next move dismisses it). onClose is
          // unused for a sticky pill, but the prop is required.
          <div className={shared.localFeedback}>
            <GenericFeedbackPill msg={pill} onClose={() => {}} />
          </div>
        ) : (
          <div className={styles.commitButtons}>
            <ExchangeButton
              iconOnly
              disabled={!canCommit || hasTentative || selectedCount === 0 || !canExchange}
              onClick={onExchange}
              title={
                !canExchange
                  ? 'Swap — need ≥ 7 tiles in the bag'
                  : selectedCount > 0
                    ? `Swap ${selectedCount} selected tile${selectedCount === 1 ? '' : 's'}`
                    : 'Swap — select rack tiles first'
              }
            />
            {/* Pass — the de-emphasized end-turn octagon (icon-only, secondary +
                warning) since it isn't the main move here. Compete only. */}
            {isCompete && (
              <PassButton iconOnly disabled={!canCommit || hasTentative} onClick={onPass} />
            )}
            <SubmitWithScore score={submitScore} disabled={!canSubmit || submitting} onClick={onSubmit} />
          </div>
        )}
      </div>
    </div>
  )
}
