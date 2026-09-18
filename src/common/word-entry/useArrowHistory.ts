// cs-audited-word-entry

import { useBoundAction, type ActionState } from '../actions/useBoundAction'

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
  // Hard-off: the entry is not here at all (loading / terminal). Both arrows
  // leave the key list. Default false.
  disabled?: boolean
  // Soft-busy: mid-submit. Both arrows stay listed and grayed rather than
  // leaving, since the freeze lasts one RPC. Default false.
  busy?: boolean
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
  disabled = false,
  busy = false,
  hasHistory = true,
}: ArrowHistoryOptions): void {
  // The same two gates the capture core reads, answered with the same two
  // words, so the four keys on one row never disagree about a freeze. GONE
  // (loading / terminal, or a game with no history at all) takes the arrows off
  // the list; FROZEN keeps them there and grays them — which for these two is
  // what stops a submit blinking two rows out of Help and back, and what keeps
  // the key from falling through to the browser mid-RPC.
  const editState: ActionState = !hasHistory || disabled ? 'hidden' : busy ? 'disabled' : 'active'

  useBoundAction('act-recall-last', {
    // Nothing submitted yet, nothing to bring back.
    describe: () => (editState === 'active' && !recall ? 'disabled' : editState),
    run: () => {
      if (recall) onChange(recall)
    },
  })

  useBoundAction('act-clear-entry', {
    describe: () => editState,
    run: () => onChange(''),
  })
}
