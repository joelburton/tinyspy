// cs-unmet

import type { ReactNode } from 'react'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import { useTopFeedbackMessage } from '../feedback/useFeedbackSlot'
import { FeedbackPill } from '../feedback/FeedbackPill'
import { useCaptureKeys } from '../keyboard/useCaptureKeys'
import { useArrowHistory } from './useArrowHistory'
import { EntryBox } from './EntryBox'
import { MoveRow } from './MoveRow'
import shared from '../game-page/PlayArea.module.css'

type Props = {
  /** The pending entry text. */
  value: string
  /** Set the pending text (the capture hook + Delete button both call this). */
  onChange: (next: string) => void
  /** Commit the current value (Enter, or the Submit button). */
  onSubmit: () => void
  /** Faint hint shown when empty. */
  placeholder?: ReactNode
  /** Custom per-character rendering of the value inside the EntryBox
   *  (spellingbee's `<TypedWord>` dims out-of-puzzle letters). Plain text if omitted. */
  children?: ReactNode
  /**
   * The game's below-board slot. While it holds a message, the pill
   * **replaces** the input controls in the same slot — an own-move result,
   * the whose-turn note, the terminal verdict, a not-ok, whatever is on top.
   * A message leaves the way its KIND says and no other way: a ×-only
   * message stays over the controls however much is typed, and only a
   * gesture-cleared result yields to typing (the keystroke is what dismisses
   * it). Keeping the row mounted through the swap is what lets that
   * keystroke reach the slot: the capture hook below stays live and
   * `onAnyKey` is its `dismiss`.
   */
  localFeedbackSlot: FeedbackSlot
  /** Loading / terminal: capture is a hard no-op and the buttons are disabled. */
  disabled?: boolean
  /** Mid-submit: capture blocks edits/submit and the Submit button is disabled. */
  busy?: boolean
  /**
   * The current value can't be submitted, but editing stays live — Enter is a
   * no-op and the Submit button is disabled, while typing/Delete keep working so
   * the player can fix it. Distinct from `disabled`/`busy` (which freeze the
   * whole row): this is a per-value veto. wordwheel uses it so a word that can't
   * be spelled from the wheel's tiles never submits + reads as "not a word".
   */
  submitDisabled?: boolean
  /** The player's next action, on any keystroke and on a Delete click — pass
   *  the slot's `dismiss`, so a gesture-cleared message leaves the same way
   *  from the keyboard and the button. */
  onAnyKey?: () => void
  /** What may be entered (default lowercase A–Z). spellingbee/boggle pass upper. */
  charFor?: (key: string) => string | null
  /** Last submitted value, for ArrowUp recall (the universal last-move history). */
  recall?: string
  /** Extra class on the row — e.g. a per-game `--entryBox-font-size` override. */
  className?: string
}

/**
 * The shared **capture-entry row** — the one word-entry control every EntryBox
 * game uses, so the entry looks + behaves identically across games (and any future
 * word game gets it for free). It bundles the three things that were being
 * duplicated:
 *
 *   1. the **capture keyboard** (`useCaptureKeys` — letters/Backspace/Enter;
 *      `useArrowHistory` — the ArrowUp-recall / ArrowDown-clear history);
 *   2. the **controls** — the shared `<MoveRow>` (⌫ | display | Submit) around a
 *      chrome-less `<EntryBox>`;
 *   3. the **pill swap** — while the slot has a message, a centered
 *      `<FeedbackPill>` replaces the controls in the same slot, without
 *      unmounting (so the capture stays live and a keystroke dismisses a
 *      gesture-cleared message — the one kind that yields to typing).
 *
 * **This is the TYPING half.** The row itself is `<MoveRow>`, split out because
 * two games need the same control without this keyboard: stackdown enters TILES
 * (no text buffer at all), and strands enters a PATH (its string is derived from
 * the trace, so `value`/`onChange` run backwards). Reach for MoveRow directly
 * when a keystroke doesn't mean "append this character"; reach for EntryRow when
 * it does.
 *
 * What stays with the host: the below-board *slot* (its board-matched width +
 * reserved height), the capture *values* (`value`/`onSubmit`/`charFor`/…), and
 * which messages go into the slot. See docs/ui.md → "Text entry".
 */
export function EntryRow({
  value,
  onChange,
  onSubmit,
  placeholder,
  children,
  localFeedbackSlot,
  disabled = false,
  busy = false,
  submitDisabled = false,
  onAnyKey,
  charFor,
  recall,
  className,
}: Props) {
  // Always called (never behind the early return below), so the keyboard stays
  // live while a message is shown — the next keystroke dismisses it. The
  // generic capture core + the EntryBox-only history arrows are two layers:
  // useCaptureKeys handles letters/Backspace/Enter; useArrowHistory adds the
  // ArrowUp-recall / ArrowDown-clear that's specific to the EntryBox (an
  // EntryRow IS the EntryBox). They gate together: no arrows while disabled/busy.
  //
  // `submitDisabled` vetoes only the submit, not editing — and it goes to the
  // hook rather than being applied here, so the key and the button read the one
  // answer instead of each working it out.
  const { actDeleteLast, actSubmitEntry } = useCaptureKeys({
    value, onChange, onSubmit, disabled, busy, submitDisabled, onAnyKey, charFor,
  })
  useArrowHistory({ recall, onChange, enabled: !disabled && !busy })
  const top = useTopFeedbackMessage(localFeedbackSlot)

  // A gesture-cleared result gives way to typing, since the keystroke has
  // already dismissed it (and a result pushed while text was already typed
  // waits until the entry empties). Every other kind holds the slot: it
  // leaves by its ×, its timer or its owner, never by a letter.
  const showing = top !== null && (top.leavesBy !== 'gesture' || value === '')
  if (showing) {
    return (
      <div className={shared.localFeedback}>
        <FeedbackPill slot={localFeedbackSlot} />
      </div>
    )
  }

  return (
    <MoveRow className={className} actDelete={actDeleteLast} actSubmit={actSubmitEntry}>
      <EntryBox value={value} placeholder={placeholder}>
        {children}
      </EntryBox>
    </MoveRow>
  )
}
