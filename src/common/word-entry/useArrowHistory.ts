// cs-audited-word-entry

import { useBoundAction } from '../actions/useBoundAction'

export type ArrowHistoryOptions = {
  // Whether this entry keeps a history at all. False says the game has no last
  // entry to bring back — letterboxed, where a submitted word joins the chain
  // rather than going away — and takes BOTH arrows off the key list. Both, and
  // `hidden` rather than `disabled`, because Help draws a disabled key exactly
  // like a live one (`actions/KeyList`), so a listed key that can never act
  // reads as one that works. Default true.
  hasHistory?: boolean
  // The last submitted value, restored by **ArrowUp** (add an 'S' to your last
  // word, fix a typo, re-guess). The game tracks it in its submit handler (so
  // it covers both Enter and the Submit button) and passes it here. '' until
  // the first submit of the game.
  recall?: string
  // Set the pending text — ArrowUp restores `recall` into it, ArrowDown clears it.
  onChange: (next: string) => void
  // When false the arrows do nothing (e.g. terminal / mid-submit). Default true.
  enabled?: boolean
}

/**
 * The **EntryBox history arrows** — the last-move affordance specific to the
 * single-word `<EntryBox>`: `ArrowUp` recalls your last entry, `ArrowDown` clears
 * the current one. Layered on top of the generic `useCaptureKeys` core by
 * `<EntryRow>`, so it applies to every game that renders an `<EntryRow>` and
 * ONLY them — a key-capture game that isn't an EntryBox (wordle)
 * uses the core alone and never wires this, so it gets no arrow behavior. Keeping
 * it separate is what makes that boundary obvious (docs/playarea.md → Text entry).
 *
 * Two bound actions, so the arrows appear in the game's key list beside its
 * commands, and so an arrow that has nothing to do says so: recall with no last
 * entry is disabled rather than silently inert. A game that keeps no history at
 * all passes `hasHistory: false` and gets neither arrow.
 */
export function useArrowHistory({
  recall,
  onChange,
  enabled = true,
  hasHistory = true,
}: ArrowHistoryOptions): void {
  useBoundAction('act-recall-last', {
    // Nothing submitted yet, nothing to bring back.
    describe: () => (!enabled || !hasHistory ? 'hidden' : recall ? 'active' : 'disabled'),
    run: () => {
      if (recall) onChange(recall)
    },
  })

  useBoundAction('act-clear-entry', {
    describe: () => (enabled && hasHistory ? 'active' : 'hidden'),
    run: () => onChange(''),
  })
}
