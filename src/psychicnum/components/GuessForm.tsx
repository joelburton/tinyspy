import { useCallback } from 'react'
import { IconSubmit } from '../../common/components/icons'
import { cls } from '../../common/lib/cls'
import { EntryBox } from '../../common/components/EntryBox'
import { ResultFlash, type ResultTone } from '../../common/components/ResultFlash'
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
  /** A transient flash that **replaces the whole entry bar** (the shared
   *  <ResultFlash>): a guess result ("Correct"/"Incorrect") or a validation
   *  error ("Not on the board"). Owned + cleared by PlayArea; the `.inputRow`
   *  reserves the bar height so the swap never reflows the board. Suppressed the
   *  moment the player types again (see below) — same bar connections swaps in
   *  for its commit row, so the two games' local feedback is identical.
   *  (psychicnum only ever flashes `good`/`bad`; the tone is the full
   *  `ResultTone` since it forwards straight to `<ResultFlash>`.) */
  result?: { tone: ResultTone; label: string } | null
}

/**
 * The word-entry row that sits **below the board** — a *capture-only* entry
 * (no `<input>`) + a Submit button. When a result flash is active, the **whole
 * row** is replaced by the shared <ResultFlash> bar (matching how connections
 * swaps its commit row); the `<form>` stays mounted throughout, so its key
 * handler keeps capturing — the first keystroke of the next guess clears the
 * flash and brings the entry + Submit back.
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
export function GuessForm({ value, onChange, onSubmit, submitting, result }: Props) {
  // The result flash shows only while the entry is empty: the entry clears to ''
  // on submit, so "Incorrect" fills the bar for its ~1s — but the moment the
  // player starts typing the next guess, their letters take over and the entry
  // returns.
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
        if (submitting) return
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
      [value, submitting, onChange, onSubmit],
    ),
  )

  return (
    <form
      className={styles.inputRow}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {shownResult ? (
        // The flash takes over the WHOLE bar (entry + Submit), not just the
        // entry box — the form stays mounted so typing still dismisses it.
        <ResultFlash tone={shownResult.tone} label={shownResult.label} />
      ) : (
        <>
          <EntryBox value={value} placeholder="type a word" className={styles.entry} />
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
