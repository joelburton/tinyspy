// cs-blessed-keyboard

import { useBoundAction, type ActionState, type BoundAction } from '../actions/useBoundAction'

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

/** The two entry keys that also have a button — handed back so `<WordEntryRow>` can
 *  place the very bindings the keys fire. Typing and dismissal have no button,
 *  so they are offered and not returned. */
export type CaptureKeysActions = {
  actDeleteLast: BoundAction
  actSubmitEntry: BoundAction
}

export type CaptureKeysOptions = {
  // The current pending text. The helper computes the next value from it
  // (append / delete), so it must be the live value each render.
  value: string
  // Set the pending text — called for an appended character and for Backspace.
  onChange: (next: string) => void
  // Submit the current value (Enter, when non-empty).
  onSubmit: () => void
  // Hard-off. When true the entry is not here at all — no typing, no submit,
  // and in particular NO feedback dismissal, so a terminal sticky pill isn't
  // cleared by a stray key. Use for loading / terminal. Default false.
  disabled?: boolean
  // Soft-busy. When true, a key still dismisses feedback, but no character is
  // appended/deleted and Enter doesn't submit —
  // for the brief in-flight-submit window, so a second keystroke can't append
  // to (or re-submit) a value that's mid-RPC. Default false.
  busy?: boolean
  // Dismiss sticky local feedback. Called on ANY key the game sees — the
  // player's next keystroke is their next move (docs/ui.md → Feedback pill).
  // Optional; tile/letter clicks dismiss via their own handlers, not this.
  onAnyKey?: () => void
  // Map a pressed key to the character to append, or null to ignore it.
  // Defaults to `asciiLetters('lower')` (single A–Z, lowercased). This is the
  // one genuinely per-game piece — WHAT may be entered (letters vs digits, the
  // stored case). The rest of the flow is uniform.
  charFor?: (key: string) => string | null
  // Max entry length. Default 16 — no real word is longer, and it keeps the
  // typed text from overrunning its box.
  maxLength?: number
  // The current value can't be submitted, but editing stays live: Enter is a
  // no-op and the Submit button is gray, while typing and Backspace keep
  // working so the player can fix it. Distinct from `disabled` / `busy`, which
  // freeze the whole entry — this is a per-value veto (wordwheel's word that
  // can't be spelled from the wheel's tiles).
  submitDisabled?: boolean
}

/**
 * The shared **capture-entry keys** — typing, deleting and submitting, for every
 * game whose entry has no `<input>` to focus (the keyboard half of the capture
 * model; the display half is `<WordEntryInput>`, when there is one).
 *
 * It binds four actions rather than reading the keyboard itself, so a game's
 * entry keys are in the same list as its commands: `act-type-letter`,
 * `act-delete-last`, `act-submit-entry`, and the any-key `act-dismiss-feedback`
 * that clears the last verdict without claiming the keystroke. That is what puts
 * "A–Z types into the entry" in the help list beside "⌥⌫ ends the game", and it
 * is why no game writes an entry key branch.
 *
 * What it owns is the universal plumbing — the bits docs/playarea.md → "Text
 * entry" mandate for *every* such game, so they stay identical and can't
 * drift: the length cap, Backspace deleting the last character, Enter
 * submitting only a non-empty value, and the two gates (`disabled` for a done
 * entry, `busy` for one mid-submit).
 *
 * What stays per-game is *what may be entered* (`charFor` — letters vs digits,
 * the stored case).
 *
 * **Layering** (docs/playarea.md → Text entry): the history arrows — `ArrowUp`
 * recalls the last entry, `ArrowDown` clears it — are NOT here. They are the
 * separate `word-entry/useArrowHistory`, a different question (the whole entry
 * coming back, rather than the characters going in) that a game may want without
 * this core or with it; `<WordEntryArea>` composes the two.
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
  submitDisabled = false,
}: CaptureKeysOptions): CaptureKeysActions {
  // Both gates mean "can't act", and both answer `disabled` rather than
  // `hidden`, because Help's key list TEACHES a game's keys rather than
  // mirroring what is pressable this instant (Joel, 2026-09-18): typing, ⌫ and
  // ↵ are keys this game has, and a player reading Help after it ends should
  // still learn them. `hidden` is for a key a game does not have at all.
  const editState: ActionState = disabled || busy ? 'disabled' : 'active'

  useBoundAction('act-type-letter', {
    describe: () => editState,
    run: (key) => {
      const ch = key === undefined ? null : charFor(key)
      if (ch === null || value.length >= maxLength) return
      onChange(value + ch)
    },
  })

  // Nothing to take back on an empty entry.
  const actDeleteLast = useBoundAction('act-delete-last', {
    describe: () => (value === '' && editState === 'active' ? 'disabled' : editState),
    run: () => {
      // A press of the button is a move too, so it dismisses the last verdict
      // the way a keystroke does — the any-key watcher above covers the KEY, and
      // this covers the click. Clearing twice on a keypress costs nothing.
      onAnyKey?.()
      onChange(value.slice(0, -1))
    },
  })

  // An empty Enter is a no-op rather than a submit — it would flash a validation
  // error for a word nobody typed.
  const actSubmitEntry = useBoundAction('act-submit-entry', {
    describe: () =>
      (value === '' || submitDisabled) && editState === 'active' ? 'disabled' : editState,
    run: onSubmit,
  })

  // Any key is the player's next move, so it clears the last verdict — but it
  // does NOT claim the keystroke, which is how the letter that dismissed a pill
  // still types. Off entirely when the entry is done, so a terminal pill isn't
  // wiped by a stray key.
  useBoundAction('act-dismiss-feedback', {
    describe: () => (disabled || onAnyKey === undefined ? 'hidden' : 'active'),
    run: () => onAnyKey?.(),
  })

  return { actDeleteLast, actSubmitEntry }
}
