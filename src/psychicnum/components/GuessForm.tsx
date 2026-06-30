import { IconSubmit } from '../../common/components/icons'
import { cls } from '../../common/lib/cls'
import { EntryBox } from '../../common/components/EntryBox'
import { FeedbackPill } from '../../common/components/FeedbackPill'
import { type ResultTone } from '../../common/components/ResultFlash'
import { useCaptureKeys } from '../../common/hooks/useCaptureKeys'
import styles from './GuessForm.module.css'

/** Local feedback pills are never closeable, so the × is never rendered and
 *  this is never called — but `<FeedbackPill>` requires the prop. */
const noop = () => {}

type Props = {
  /** The pending guess word (lowercase; empty string when nothing typed).
   *  Lifted to PlayArea so clicking a board tile and typing here stay in sync. */
  value: string
  onChange: (value: string) => void
  /** Submit the current value — PlayArea owns validation + the RPC. */
  onSubmit: () => void
  submitting: boolean
  /** A transient own-move result that **replaces the whole entry bar** with a
   *  centered <FeedbackPill> (the local feedback area, v3 — the same pill as the
   *  header's global feedback): a guess result ("Correct"/"Incorrect") or a
   *  validation error ("Not on the board"). Owned + cleared by PlayArea; the
   *  `.inputRow` reserves the bar height so the swap never reflows the board.
   *  Suppressed the moment the player types again (see below).
   *  (psychicnum only ever flashes `good`/`bad`; `good → success`, `bad → error`
   *  when mapped to the pill's tone.) */
  result?: { tone: ResultTone; label: string } | null
  /** Dismiss the current local result (PlayArea's `clearFlash`). Called on ANY
   *  key the game sees, so Space / Enter / arrows clear a sticky result too —
   *  not just the alpha keys that append (docs/design-decisions.md → Dismissal
   *  modes). Tile clicks dismiss via the `onChange` path instead. */
  onDismissResult: () => void
}

/**
 * The word-entry row that sits **below the board** — a *capture-only* entry
 * (no `<input>`) + a Submit button. When a result is active, the **whole row** is
 * replaced by the centered <FeedbackPill> (the local feedback area); the `<form>`
 * stays mounted throughout, so its key handler keeps capturing — the player's
 * next move (a keystroke, or a board-tile click) clears the sticky flash via
 * PlayArea's `handleEntryChange` and brings the entry + Submit back.
 *
 * The shared <EntryBox> owns the entry display + the blinking caret (and keeps
 * the caret honest about keyboard ownership). This component owns the part
 * that's specific to psychicnum: **what may be typed** — letters only, forming a
 * word — plus Backspace / Enter, and Tab-suppression while the entry is live.
 * Keys are read off the window, so clicking a board tile never blurs a field and
 * stops your typing; typing and tile-clicks both feed PlayArea's one `pending`
 * value (a lowercase word).
 *
 * Fully controlled — `value` is lifted to PlayArea, which validates the word is
 * on the board and owns the `submit_guess` RPC (the source of truth).
 */
export function GuessForm({ value, onChange, onSubmit, submitting, result, onDismissResult }: Props) {
  // The result pill shows only while the entry is empty: the entry clears to ''
  // on submit, so the result fills the bar — STICKY, no timer — until the
  // player's next move. The moment they type (or click a tile), PlayArea's
  // handleEntryChange clears the flash and their letters take over.
  const shownResult = value === '' ? result : null

  // Capture letters / Backspace / Enter / Tab off the window via the shared
  // capture-key helper (it owns the modifier bail, Tab swallow, next-move
  // dismissal, Backspace / Enter, and the 16-char cap). psychicnum stores letters
  // lowercase (board words are lowercase, shown uppercase via CSS) — the helper's
  // default — so the only per-game wiring is `busy` (block edits mid-submit) and
  // `onAnyKey` (clear the sticky result). The form only mounts when the viewer can
  // guess (PlayArea gates on `canGuess`), so capture is only live when allowed.
  useCaptureKeys({
    value,
    onChange,
    onSubmit,
    busy: submitting,
    onAnyKey: onDismissResult,
  })

  return (
    <form
      className={styles.inputRow}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {shownResult ? (
        // The pill takes over the WHOLE bar (entry + Submit), not just the entry
        // box — the form stays mounted so typing still dismisses it. It's the
        // shared <FeedbackPill>, transient (outline → white bg + tone border), so
        // local own-move feedback reads identically to the header's global pill.
        <FeedbackPill
          msg={{
            tone: shownResult.tone === 'good' ? 'success' : 'error',
            text: shownResult.label,
            variant: 'outline',
            dismiss: { kind: 'sticky' },
          }}
          onClose={noop}
        />
      ) : (
        <>
          <EntryBox value={value} placeholder="Click on a tile or type" className={styles.entry} />
          <button
            type="submit"
            className={cls('icon-button', styles.inputButton)}
            disabled={submitting || value === ''}
          >
            <IconSubmit size={15} aria-hidden />
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </>
      )}
    </form>
  )
}
