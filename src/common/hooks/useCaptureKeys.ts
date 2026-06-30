import { useGlobalKeyHandler } from './useGlobalKeyHandler'

/**
 * A `charFor` (see below) for ASCII letters, stored in the given case. This is
 * the common filter for word games: a single A–Z keystroke becomes the character
 * to append; everything else is ignored. Most games store **lowercase** (board
 * words are lowercase); spellingbee displays **uppercase**, so it passes
 * `asciiLetters('upper')`.
 */
export function asciiLetters(store: 'lower' | 'upper' = 'lower') {
  return (key: string): string | null => {
    if (key.length !== 1 || !/^[a-zA-Z]$/.test(key)) return null
    return store === 'upper' ? key.toUpperCase() : key.toLowerCase()
  }
}

export type CaptureKeysOptions = {
  /** The current pending text. The helper computes the next value from it
   *  (append / delete), so it must be the live value each render. */
  value: string
  /** Set the pending text — called for an appended character and for Backspace. */
  onChange: (next: string) => void
  /** Submit the current value (Enter, when non-empty). */
  onSubmit: () => void
  /**
   * Hard-off. When true the handler is a complete no-op — no dispatch, and in
   * particular **no feedback dismissal**, so a terminal sticky pill isn't cleared
   * by a stray key. Use for loading / terminal, where capture shouldn't run at
   * all. Default false.
   */
  disabled?: boolean
  /**
   * Soft-busy. When true, a key still dismisses feedback and Tab is still
   * swallowed, but no character is appended/deleted and Enter doesn't submit —
   * for the brief in-flight-submit window, so a second keystroke can't append to
   * (or re-submit) a value that's mid-RPC. Default false.
   */
  busy?: boolean
  /**
   * Dismiss sticky local feedback. Called on ANY key the game sees (after the
   * modifier bail, before dispatch) — the player's next keystroke is their next
   * move (docs/design-decisions.md → Dismissal modes). Optional; tile/letter
   * clicks dismiss via their own handlers, not this.
   */
  onAnyKey?: () => void
  /**
   * Map a pressed key to the character to append, or null to ignore it. Defaults
   * to `asciiLetters('lower')` (single A–Z, lowercased). This is the one
   * genuinely per-game piece — *what may be entered* (letters vs digits, the
   * stored case). The rest of the flow is uniform.
   */
  charFor?: (key: string) => string | null
  /** Max entry length. Default 16 — no real word is longer, and it keeps the
   *  typed text from overrunning its box. */
  maxLength?: number
  /**
   * Game-specific keys beyond the universal set (spellingbee: Space = shuffle).
   * Runs after `onAnyKey` + the Tab swallow, before the universal dispatch; the
   * callback does its own `preventDefault` and returns true to **claim** the key
   * (the helper then stops). Optional.
   *
   * Note: ArrowUp (recall) and ArrowDown (clear) are now BUILT IN below — a game
   * no longer wires them here; pass `recall` for ArrowUp to restore. `onExtraKey`
   * still gets first refusal, so a game *could* claim an arrow if it ever needs to.
   */
  onExtraKey?: (e: KeyboardEvent) => boolean
  /**
   * The last submitted value, for **ArrowUp = "recall last entry"** — the
   * universal last-move-history affordance every capture game shares (add an 'S'
   * to your last word, fix a typo, re-guess). The game tracks it (set in its
   * submit handler, so it covers both Enter and the Submit button) and passes it
   * here; ArrowUp restores it into the entry. Omit (or pass '') to make ArrowUp a
   * no-op. **ArrowDown always clears** the entry — no option, it's universal.
   */
  recall?: string
}

/**
 * The shared **capture-entry key handler** for board-first word/number games —
 * the keyboard half of the capture model (the display half is `<EntryBox>`). It
 * reads keystrokes off the window (via `useGlobalKeyHandler`, which already drops
 * keys aimed at a focused text field like chat) and turns them into edits on a
 * pending value, so there's no `<input>` to lose focus when the player clicks a
 * board tile.
 *
 * It owns the **universal** capture plumbing — the bits docs/design-decisions.md
 * → "Move entry: EntryBox" / "Text entry" mandate for *every* such game, so they
 * stay identical and can't drift:
 *
 *   1. **Modifier bail** — leave `Cmd-R`, `Ctrl-Tab`, etc. to the browser.
 *   2. **Tab swallow** — Tab can't move focus off the board while the caret
 *      claims the keyboard (two cursors would be confusing).
 *   3. **Feedback dismissal** — any key is the player's next move (`onAnyKey`).
 *   4. **Backspace** deletes the last character; **Enter** submits when non-empty.
 *   5. **Length cap** (`maxLength`, default 16).
 *   6. **ArrowUp recalls** the last submitted value (`recall`); **ArrowDown clears**
 *      the entry. The shared last-move-history affordance, identical everywhere.
 *
 * What stays per-game is *what may be entered* (`charFor` — letters vs digits, the
 * stored case) and any extra keys (`onExtraKey` — spellingbee's Space-shuffle).
 *
 * Replaces the near-identical hand-rolled key handlers that lived in psychicnum's
 * GuessForm and spellingbee's PlayArea (the lift tracked since the first EntryBox
 * adopter).
 */
export function useCaptureKeys({
  value,
  onChange,
  onSubmit,
  disabled = false,
  busy = false,
  onAnyKey,
  charFor = asciiLetters('lower'),
  maxLength = 16,
  onExtraKey,
  recall,
}: CaptureKeysOptions): void {
  useGlobalKeyHandler((e: KeyboardEvent) => {
    // 1. Let the browser/OS keep any modified keystroke — Cmd-R, Ctrl-Tab, Cmd-L,
    //    … — so bail before touching anything (including the Tab swallow below).
    if (e.metaKey || e.ctrlKey || e.altKey) return

    // Hard-off (loading / terminal): do nothing at all. Crucially this is BEFORE
    // onAnyKey, so a terminal sticky pill isn't dismissed by a stray key.
    if (disabled) return

    // 3. Any key the game sees is the player's next move → dismiss sticky local
    //    feedback. (Runs even while `busy`, since the dismissal is harmless and
    //    the result it clears is from the previous move.)
    onAnyKey?.()

    // 2. Swallow Tab while the entry is live — the caret owns the keyboard, so
    //    moving real focus onto a button would read as a second cursor. (Chat /
    //    dialog fields keep their own Tab — useGlobalKeyHandler never dispatches
    //    their keys here.)
    if (e.key === 'Tab') {
      e.preventDefault()
      return
    }

    // Game-specific keys get first refusal (they preventDefault + return true to
    // claim the key). Before the busy gate so a view-only key like Space-shuffle
    // still works mid-submit.
    if (onExtraKey?.(e)) return

    // Soft-busy (mid-submit): dismissal + Tab already handled; block edits + submit.
    if (busy) return

    // 6. Last-move history — the universal arrow affordance, identical across every
    //    capture game. ArrowUp restores the last submitted value (`recall`);
    //    ArrowDown clears the entry. Both are edits (past the busy gate);
    //    preventDefault either way so the arrows never scroll the page while the
    //    entry owns the keyboard.
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (recall) onChange(recall)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      onChange('')
      return
    }

    // 4/5. A character to append (per the game's `charFor`), capped at maxLength.
    const ch = charFor(e.key)
    if (ch !== null) {
      e.preventDefault()
      if (value.length >= maxLength) return
      onChange(value + ch)
      return
    }
    if (e.key === 'Backspace') {
      e.preventDefault()
      onChange(value.slice(0, -1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // Empty Enter just dismisses (above) — don't submit '' (which would flash a
      // validation error); the Submit button is disabled when empty too.
      if (value !== '') onSubmit()
    }
  })
}
