import { useGlobalKeyHandler } from './useGlobalKeyHandler'

export type ArrowHistoryOptions = {
  /**
   * The last submitted value, restored by **ArrowUp** (add an 'S' to your last
   * word, fix a typo, re-guess). The game tracks it in its submit handler (so it
   * covers both Enter and the Submit button) and passes it here. Omit / '' makes
   * ArrowUp a no-op.
   */
  recall?: string
  /** Set the pending text — ArrowUp restores `recall` into it, ArrowDown clears it. */
  onChange: (next: string) => void
  /** When false the arrows do nothing (e.g. terminal / mid-submit). Default true. */
  enabled?: boolean
}

/**
 * The **EntryBox history arrows** — the last-move affordance specific to the
 * single-word `<EntryBox>`: `ArrowUp` recalls your last entry, `ArrowDown` clears
 * the current one. Layered on top of the generic `useCaptureKeys` core by
 * `<EntryRow>`, so it applies to the EntryBox games (spellingbee / boggle /
 * psychicnum) and ONLY them — a key-capture game that isn't an EntryBox (wordle)
 * uses the core alone and never wires this, so it gets no arrow behavior. Keeping
 * it separate is what makes that boundary obvious (docs/ui.md → Text entry).
 *
 * Rides `useGlobalKeyHandler`, so it inherits the focused-input guard (arrows in
 * chat / a game input aren't hijacked) and the once-registered listener; it adds
 * the modifier bail and `preventDefault`s the arrows so they never scroll the
 * page while the entry owns the keyboard.
 */
export function useArrowHistory({ recall, onChange, enabled = true }: ArrowHistoryOptions): void {
  useGlobalKeyHandler((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (!enabled) return
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (recall) onChange(recall)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      onChange('')
    }
  })
}
