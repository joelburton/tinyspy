// cs-audited-word-entry

import { useBoundAction, type ActionState } from '../actions/useBoundAction'

export type ArrowHistoryOptions = {
  // Whether this entry keeps a history at all. False says the game has no last
  // entry to bring back — letterboxed, where a submitted word joins the chain
  // rather than going away — and takes BOTH arrows off the key list, since a
  // key the game hasn't got is nothing for Help to teach. This is the one thing
  // `hidden` means here; every other reason the arrows are off is `disabled`.
  // Default true.
  hasHistory?: boolean
  // The last submitted value, restored by **ArrowUp** (add an 'S' to your last
  // word, fix a typo, re-guess). The game tracks it in its submit handler (so
  // it covers both Enter and the Submit button) and passes it here. '' until
  // the first submit of the game.
  recall?: string
  // Set the pending text — ArrowUp restores `recall` into it, ArrowDown clears it.
  onChange: (next: string) => void
  // Hard-off: the entry is not here at all (loading / terminal). Both arrows
  // stay listed and gray — they are still this game's keys. Default false.
  disabled?: boolean
  // Soft-busy: mid-submit. Same answer as `disabled` for these two; the props
  // stay separate because the row's other keys read them apart. Default false.
  busy?: boolean
}

/**
 * The **history arrows** — `ArrowUp` recalls your last entry, `ArrowDown` clears
 * the one you're typing. Reach for it when your game keeps a whole last entry
 * worth bringing back: the next guess is so often the last one plus a letter.
 *
 * `<WordEntryArea>` composes it over the `useCaptureKeys` core already, so a typing
 * game gets the arrows by rendering that; a game running its own capture loop
 * calls this directly. A game whose submitted entry doesn't come back at all
 * passes `hasHistory: false` and gets neither arrow.
 *
 * Separate from the core because it is a different question — the core is about
 * the characters going in, this is about the whole entry coming back — and a
 * game may want one without the other.
 *
 * Two bound actions, so the arrows appear in the game's key list beside its
 * commands, and so an arrow that has nothing to do says so: recall with no last
 * entry is disabled rather than silently inert.
 */
export function useArrowHistory({
  recall,
  onChange,
  disabled = false,
  busy = false,
  hasHistory = true,
}: ArrowHistoryOptions): void {
  // The same gates the capture core reads, answered the same way, so the four
  // keys on one row never disagree. `hidden` says this game does not have the
  // key — nothing for Help to teach; `disabled` says it does and can't act
  // right now, which is every other reason the arrows are off.
  const editState: ActionState = !hasHistory ? 'hidden' : disabled || busy ? 'disabled' : 'active'

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
