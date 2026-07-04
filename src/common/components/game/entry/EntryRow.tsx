import type { ReactNode } from 'react'
import { cls } from '../../../lib/util/cls'
import type { GenericFeedbackMsg } from '../../../lib/games'
import { useCaptureKeys } from '../../../hooks/input/useCaptureKeys'
import { useArrowHistory } from '../../../hooks/input/useArrowHistory'
import { EntryBox } from './EntryBox'
import { GenericFeedbackPill } from '../../feedback/GenericFeedbackPill'
import { DeleteButton } from '../../buttons/DeleteButton'
import { SubmitButton } from '../../buttons/SubmitButton'
import shared from '../PlayArea.module.css'
import styles from './EntryRow.module.css'

/** Local feedback pills here are sticky (dismissed by the next move), so the × is
 *  never rendered and `onClose` is never called — but `<GenericFeedbackPill>` needs it. */
const noop = () => {}

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
   * When set, this local-feedback pill **replaces** the input controls in the same
   * slot — an own-move result or the terminal verdict. The host resolves the
   * precedence (terminal vs own-move) and the "only while the entry is empty" gate,
   * and passes the message (or `null` to show the controls). Keeping the entry row
   * mounted through the swap is what lets a keystroke dismiss a sticky pill: the
   * capture hook below stays live and the next key reclaims the slot.
   */
  pill?: GenericFeedbackMsg | null
  /** Loading / terminal: capture is a hard no-op and the buttons are disabled. */
  disabled?: boolean
  /** Mid-submit: capture blocks edits/submit and the Submit button is disabled. */
  busy?: boolean
  /** Dismiss sticky local feedback on any move — passed to the capture hook (any
   *  keystroke) and called on a Delete click too, so the two dismiss identically. */
  onAnyKey?: () => void
  /** What may be entered (default lowercase A–Z). spellingbee/boggle pass upper. */
  charFor?: (key: string) => string | null
  /** Extra keys beyond the universal set (spellingbee's Space = shuffle). */
  onExtraKey?: (e: KeyboardEvent) => boolean
  /** Last submitted value, for ArrowUp recall (the universal last-move history). */
  recall?: string
  /** Extra class on the row — e.g. a per-game `--entrybox-font-size` override. */
  className?: string
}

/**
 * The shared **capture-entry row** — the one word-entry control every EntryBox
 * game uses, so the entry looks + behaves identically across games (and any future
 * word game gets it for free). It bundles the three things that were being
 * duplicated:
 *
 *   1. the **capture keyboard** (`useCaptureKeys` — letters/Backspace/Enter, the
 *      ArrowUp-recall / ArrowDown-clear history, the modifier bail + Tab swallow);
 *   2. the **controls** — an icon-only `<DeleteButton>` and `<SubmitButton>`
 *      flanking the chrome-less `<EntryBox>` (which flex-fills the row between them);
 *   3. the **pill swap** — when `pill` is set it replaces the controls with a
 *      centered `<GenericFeedbackPill>` (the own-move result / terminal verdict), in the
 *      same slot, without unmounting (so the capture stays live and a keystroke
 *      dismisses the pill).
 *
 * What stays with the host: the below-board *slot* (its board-matched width +
 * reserved height), the capture *values* (`value`/`onSubmit`/`charFor`/…), and
 * resolving which `pill` (if any) to show. See docs/ui.md → "Text entry".
 */
export function EntryRow({
  value,
  onChange,
  onSubmit,
  placeholder,
  children,
  pill,
  disabled = false,
  busy = false,
  onAnyKey,
  charFor,
  onExtraKey,
  recall,
  className,
}: Props) {
  // Always called (never behind the early return below), so the keyboard stays
  // live while a sticky pill is shown — the next keystroke dismisses it. The
  // generic capture core + the EntryBox-only history arrows are two layers:
  // useCaptureKeys handles letters/Backspace/Enter; useArrowHistory adds the
  // ArrowUp-recall / ArrowDown-clear that's specific to the EntryBox (an
  // EntryRow IS the EntryBox). They gate together: no arrows while disabled/busy.
  useCaptureKeys({ value, onChange, onSubmit, disabled, busy, onAnyKey, charFor, onExtraKey })
  useArrowHistory({ recall, onChange, enabled: !disabled && !busy })

  if (pill) {
    return (
      <div className={shared.localFeedback}>
        <GenericFeedbackPill msg={pill} onClose={noop} />
      </div>
    )
  }

  const empty = value === ''
  const handleDelete = () => {
    onAnyKey?.() // a Delete click is a move too — dismiss sticky feedback like a key
    onChange(value.slice(0, -1))
  }

  return (
    <div className={cls(styles.moveArea, className)}>
      <DeleteButton iconOnly onClick={handleDelete} disabled={empty || disabled} />
      <EntryBox value={value} placeholder={placeholder}>
        {children}
      </EntryBox>
      <SubmitButton iconOnly onClick={onSubmit} disabled={empty || disabled || busy} />
    </div>
  )
}
