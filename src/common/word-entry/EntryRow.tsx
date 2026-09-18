// cs-audited-word-entry

import type { ReactNode } from 'react'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import { useTopFeedbackMessage } from '../feedback/useFeedbackSlot'
import { FeedbackPill } from '../feedback/FeedbackPill'
import { useCaptureKeys } from '../keyboard/useCaptureKeys'
import { useArrowHistory } from './useArrowHistory'
import { EntryBox } from './EntryBox'
import { MoveRow } from './MoveRow'
import shared from '../game-page/playArea.module.css'

type Props = {
  // The pending entry text.
  value: string
  // Set the pending text (the capture hook + Delete button both call this).
  onChange: (next: string) => void
  // Commit the current value (Enter, or the Submit button).
  onSubmit: () => void
  // Faint hint shown when empty.
  placeholder?: ReactNode
  // Custom per-character rendering of the value inside the EntryBox
  // (spellingbee's `<TypedWord>` dims out-of-puzzle letters). Plain if omitted.
  children?: ReactNode
  // The game's below-board slot. While it holds a message, the pill
  // **replaces** the input controls in the same slot — an own-move result,
  // the whose-turn note, the terminal verdict, a not-ok, whatever is on top.
  // A message leaves the way its KIND says and no other way: a ×-only
  // message stays over the controls however much is typed, and only a
  // gesture-cleared result yields to typing — because the keystroke
  // dismisses it, not because the row hides it. Keeping the row mounted
  // through the swap is what lets that keystroke reach the slot: the
  // capture hook below stays live and `onAnyKey` is its `dismiss`.
  localFeedbackSlot: FeedbackSlot
  // Hard-off, for loading / terminal: capture is a no-op, and the buttons gray.
  // It also stops the any-key feedback dismissal, so a terminal pill isn't
  // wiped by a stray key — which `busy` does not.
  disabled?: boolean
  // Mid-submit: capture blocks edits and submits and the buttons gray, but a
  // key still dismisses feedback, since the freeze lasts one RPC.
  busy?: boolean
  // The current value can't be submitted, but editing stays live — Enter is a
  // no-op and the Submit button is gray, while typing/Delete keep working so
  // the player can fix it. Distinct from `disabled`/`busy` (which freeze the
  // whole row): this is a per-value veto. wordwheel uses it so a word that
  // can't be spelled from the wheel's tiles never submits + reads as "not a
  // word".
  submitDisabled?: boolean
  // The player's next action, on any keystroke and on a Delete click — pass
  // the slot's `dismiss`, so a gesture-cleared message leaves the same way
  // from the keyboard and the button.
  onAnyKey?: () => void
  // What may be entered (default lowercase A–Z). spellingbee/boggle pass upper.
  charFor?: (key: string) => string | null
  // Last submitted value, restored by ArrowUp (see `./useArrowHistory`).
  recall?: string
  // False where a submitted word doesn't come back at all (letterboxed: it
  // joins the chain), which takes both arrows off the key list — this game
  // hasn't got them. Default true; a game that offers recall leaves this alone
  // and passes `recall`.
  hasHistory?: boolean
  // Extra class on the row — e.g. a per-game `--entryBox-font-size` override.
  className?: string
}

/**
 * The shared **capture-entry row** — the whole below-board control for a game
 * where the player types a word, so the entry looks and behaves identically
 * everywhere and a new word game gets it for free. It bundles three things:
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
 * **This is the TYPING half.** Reach for it when a keystroke means "append this
 * character"; when it doesn't, reach for `<MoveRow>` directly and bring your own
 * keyboard (stackdown enters TILES, strands enters a PATH).
 *
 * What stays with the host: the below-board *slot* (its board-matched width +
 * reserved height), the capture *values* (`value`/`onSubmit`/`charFor`/…), and
 * which messages go into the slot. See docs/playarea.md → "Text entry".
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
  hasHistory = true,
  className,
}: Props) {
  // Always called (never behind the early return below), so the keyboard stays
  // live while a message is shown — the next keystroke dismisses it. The
  // capture core and the history arrows are two layers: useCaptureKeys handles
  // the characters going in (letters/Backspace/Enter), useArrowHistory the
  // whole entry coming back. Both read the same two gates and answer them the
  // same way, so the four keys on this row never disagree about a freeze.
  //
  // `submitDisabled` vetoes only the submit, not editing — and it goes to the
  // hook rather than being applied here, so the key and the button read the one
  // answer instead of each working it out.
  const { actDeleteLast, actSubmitEntry } = useCaptureKeys({
    value, onChange, onSubmit, disabled, busy, submitDisabled, onAnyKey, charFor,
  })
  useArrowHistory({ recall, onChange, disabled, busy, hasHistory })
  const top = useTopFeedbackMessage(localFeedbackSlot)

  // Whatever is on top takes the controls' place. No second gate on the
  // value: a gesture-cleared result gives way to typing because the
  // keystroke dismisses it (`onAnyKey`), and a result shown while text is
  // still in the box — letterboxed keeps a rejected draft for fixing — must
  // show all the same. Every other kind holds the slot: it leaves by its ×,
  // its timer or its owner, never by a letter.
  if (top !== null) {
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
