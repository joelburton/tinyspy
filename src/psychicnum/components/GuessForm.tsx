import { useCallback } from 'react'
import { Play } from 'lucide-react'
import { EntryBox } from '../../common/components/EntryBox'
import { useGlobalKeyHandler } from '../../common/hooks/useGlobalKeyHandler'
import styles from './GuessForm.module.css'

type Props = {
  /** The pending guess word (lowercase; empty string when nothing typed).
   *  Lifted to PlayArea so clicking a board tile and typing here stay in sync. */
  value: string
  onChange: (value: string) => void
  /** Submit the current value — PlayArea owns validation + the RPC. */
  onSubmit: () => void
  submitting: boolean
  error: string | null
  /** True when the viewer can't guess (out of budget) — greys the controls. */
  disabled?: boolean
  /** A transient "Correct" / "Incorrect" flash for the player's own last
   *  guess, shown in the entry box (green/red border). Owned + cleared by
   *  PlayArea. Suppressed the moment the player types again (see below). */
  result?: { tone: 'good' | 'bad'; label: string } | null
}

/**
 * The word-entry row that sits **below the board** — a *capture-only* entry
 * (no `<input>`) + a Submit button.
 *
 * The shared <EntryBox> owns the display + the blinking caret (and keeps the
 * caret honest about keyboard ownership). This component owns the part that's
 * specific to psychicnum: **what may be typed** — letters only, forming a word
 * — plus Backspace / Enter, and Tab-suppression while the entry is live. Keys
 * are read off the window, so clicking a board tile never blurs a field and
 * stops your typing; typing and tile-clicks both feed PlayArea's one `pending`
 * value (a lowercase word).
 *
 * Fully controlled — `value` is lifted to PlayArea, which validates the word is
 * on the board and owns the `submit_guess` RPC (the source of truth).
 */
export function GuessForm({ value, onChange, onSubmit, submitting, error, disabled, result }: Props) {
  const locked = submitting || disabled === true
  // The result flash shows only while the entry is empty: the box clears to ''
  // on submit, so "Incorrect" fills the empty box for its ~1s — but the moment
  // the player starts typing the next guess, their letters take over.
  const shownResult = value === '' ? result : null

  // Capture letters / Backspace / Enter / Tab off the window. The form only
  // mounts when the viewer can guess (PlayArea gates on `canGuess`), so this
  // is only live when entry is actually allowed.
  useGlobalKeyHandler(
    useCallback(
      (e: KeyboardEvent) => {
        // Let the browser/OS keep any modified keystroke — Cmd-R refresh,
        // Ctrl-Tab, Cmd-L, etc. We only capture plain typing, so bail before
        // touching anything (including the Tab suppression) when a Cmd/Ctrl/Alt
        // modifier is held.
        if (e.metaKey || e.ctrlKey || e.altKey) return
        // Swallow Tab while the entry is live. The blinking caret claims the
        // keyboard for the guess; if Tab moved real focus onto some button
        // (the Submit, a header control) the caret would keep blinking while
        // focus is elsewhere — two cursors, confusing. These games are
        // navigated by clicks + typing, not by tabbing between controls, so
        // we just drop it. (useGlobalKeyHandler still lets a focused text
        // field — chat, a dialog — keep its own keys, so chat tabbing is
        // unaffected.)
        if (e.key === 'Tab') {
          e.preventDefault()
          return
        }
        if (locked) return
        // A single letter → append (stored lowercase; the board words are
        // lowercase, displayed uppercased via CSS).
        if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
          e.preventDefault()
          onChange(value + e.key.toLowerCase())
          return
        }
        if (e.key === 'Backspace') {
          e.preventDefault()
          onChange(value.slice(0, -1))
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          onSubmit()
        }
      },
      [value, locked, onChange, onSubmit],
    ),
  )

  return (
    <>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <EntryBox
          value={value}
          placeholder="type a word"
          className={styles.entry}
          result={shownResult}
        />
        <button type="submit" className={styles.submit} disabled={locked || value === ''}>
          <Play size={15} aria-hidden />
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </>
  )
}
