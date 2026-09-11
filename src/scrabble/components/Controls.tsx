// cs-unmet

import type { GenericFeedbackMsg } from '@/common/feedback/genericFeedback'
import { GenericFeedbackPill } from '@/common/feedback/GenericFeedbackPill'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import { SubmitWithScore } from '@/common/buttons/SubmitWithScore'
import { cls } from '@/common/utils/cls'
import styles from './PlayArea.module.css'
import shared from '@/common/game-page/PlayArea.module.css'

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
 *   - **Swap** (`act-exchange`, icon-only) — return rack tiles. Its bubble
 *     carries its own reason when it can't act ("Need ≥ 7 tiles in the bag",
 *     "Select rack tiles first"), so this row places it and explains nothing.
 *   - **Pass** (`act-pass`, which HIDES itself in coop; the end-turn octagon
 *     de-emphasized to icon-only + secondary, in caution amber — forgoing a
 *     move is uncommon here, unlike codenamesduet's every-turn `act-end-turn`).
 *   - **Submit** (`act-submit`, drawn by `SubmitWithScore`) — the primary
 *     action, doubling as the live score preview ("+score", or an em-dash on an
 *     empty board). Enabled for any placed tiles (an illegal shape is explained
 *     by a pill on submit, not by disabling) — and **Enter** is the same
 *     binding, so the key and the button are gray at the same moments.
 *
 * The **Share** button sits beside Recall on the LEFT — not in the commit slot —
 * so it stays visible when a pill takes the slot over. It broadcasts the staged
 * tiles for teammates to preview (see useSharedMove), and hides itself where
 * there is nobody to show them to (a race, or a solo game).
 *
 * Every one of them is a BOUND ACTION: what it does, what it is called, whether
 * it can be pressed and which key also does it come from the binding, which the
 * board column makes. This row decides placement and nothing else.
 */
export function Controls({
  submitScore,
  actSubmit,
  actRecallTiles,
  actSharePreview,
  actExchange,
  actPass,
  pill,
  onDismissPill,
}: {
  /** The staged play's score for the Submit preview; `null` (empty board) shows
   *  an em-dash. Its own prop, not the action's: the score is what this control
   *  DRAWS, where the action says whether it can be pressed. */
  submitScore: number | null
  /** Play the staged word. Also Enter, from the board cursor. */
  actSubmit: BoundAction
  /** Take every staged tile back to the rack at once. */
  actRecallTiles: BoundAction
  /** Show the staged play to teammates, read-only. Hides itself where there is
   *  nobody to show it to. */
  actSharePreview: BoundAction
  /** Swap rack tiles for fresh ones — it carries its own reason when it can't. */
  actExchange: BoundAction
  /** Pass the turn. Hides itself in coop. */
  actPass: BoundAction
  /** An own-move / terminal pill to show IN the commit slot (replacing the commit
   *  buttons + filling its width), or null to show the buttons. */
  pill: GenericFeedbackMsg | null
  /** Clear the pill — tapping a transient one dismisses it, the same way the
   *  next keystroke does (docs/ui.md → Feedback pill). */
  onDismissPill: () => void
}) {
  return (
    <div className={styles.controls}>
      <ActionButton action={actRecallTiles} show="icon" />
      {/* Show a move to teammates (coop, ≥2 players). On the left with Recall so a
          pill in the commit slot never hides it; enabled only with tiles staged.
          It hides itself where there is nobody to show it to. */}
      <ActionButton action={actSharePreview} show="icon" />

      <div
        className={cls(styles.moveAreaOrLocalFeedback, pill && styles.moveAreaOrLocalFeedbackPill)}
      >
        {pill ? (
          // Sticky local feedback — no × (the next move dismisses it). onClose is
          <div className={shared.localFeedback}>
            <GenericFeedbackPill msg={pill} onClose={onDismissPill} />
          </div>
        ) : (
          <div className={styles.commitButtons}>
            {/* Swap's bubble carries its OWN reason when it can't act ("Need ≥
                7 tiles in the bag", "Select rack tiles first"), which is
                `describe()`'s doing rather than a `title` worked out here. */}
            <ActionButton action={actExchange} show="icon" />
            {/* Pass — the end-turn octagon in the registry's caution tone
                (icon-only), since it isn't the main move here. It hides itself
                in coop. */}
            <ActionButton action={actPass} show="icon" />
            <SubmitWithScore score={submitScore} action={actSubmit} />
          </div>
        )}
      </div>
    </div>
  )
}
