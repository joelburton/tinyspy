import { useCallback, useState } from 'react'

/**
 * `useState` for a small set of named choices, mirrored to `localStorage` so the
 * choice survives a reload — the segmented-control counterpart to
 * `useDraggablePanel`'s rect persistence.
 *
 * Three properties worth stating, because each is a decision rather than an
 * implementation detail:
 *
 *   - **Only an explicit choice is ever written.** Mounting persists nothing, so
 *     a user who never touches the control has no stored value and keeps getting
 *     `fallback` — including if `fallback` later changes.
 *   - **A stored value is VALIDATED against `options`.** Anything else (a renamed
 *     option, a hand-edited key, a value from an older build) falls back rather
 *     than wedging the UI into a state its control can't represent.
 *   - **`localStorage` failures are non-fatal.** Private mode throws on read and
 *     write; the choice then simply lives in memory for the session, which is
 *     exactly the old behavior.
 *
 * The key is read ONCE, in the lazy initializer — same contract as
 * `useDraggablePanel`. So a key that changes over the component's life won't
 * re-read; scope it to something stable for the mount (a user id from a prop is
 * fine, a value that arrives asynchronously is not — see
 * `docs/code-conventions.md` on frozen async defaults).
 */
export function useStickyChoice<T extends string>(
  /** Storage key. Convention: `puzpuzpuz:<area>:<name>`, plus whatever scope the
   *  preference belongs to (e.g. a trailing user id — see ClubPage). */
  key: string,
  /** Every legal value. Doubles as the validator for what's in storage. */
  options: readonly T[],
  /** Used when nothing valid is stored, and when storage is unavailable. */
  fallback: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored !== null && (options as readonly string[]).includes(stored)
        ? (stored as T)
        : fallback
    } catch {
      return fallback
    }
  })

  // The write lives in the CHOOSE handler, not an effect: an effect would fire
  // on mount too and persist a default nobody picked (and this repo forbids
  // setState-in-effect anyway — see docs/code-conventions.md).
  const choose = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, next)
      } catch {
        // Private mode / storage disabled — in-memory state still works.
      }
    },
    [key],
  )

  return [value, choose]
}
