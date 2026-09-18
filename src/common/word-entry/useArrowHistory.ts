// cs-audited-word-entry

import { useBoundAction } from '../actions/useBoundAction'

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
 * `<EntryRow>`, so it applies to every game that renders an `<EntryRow>` and
 * ONLY them — a key-capture game that isn't an EntryBox (wordle)
 * uses the core alone and never wires this, so it gets no arrow behavior. Keeping
 * it separate is what makes that boundary obvious (docs/ui.md → Text entry).
 *
 * Two bound actions, so the arrows appear in the game's key list beside its
 * commands, and so an arrow that has nothing to do says so: recall with no last
 * entry is disabled rather than silently inert.
 */
export function useArrowHistory({ recall, onChange, enabled = true }: ArrowHistoryOptions): void {
  useBoundAction('act-recall-last', {
    // Nothing submitted yet, nothing to bring back.
    describe: () => (!enabled ? 'hidden' : recall ? 'active' : 'disabled'),
    run: () => {
      if (recall) onChange(recall)
    },
  })

  useBoundAction('act-clear-entry', {
    describe: () => (enabled ? 'active' : 'hidden'),
    run: () => onChange(''),
  })
}
