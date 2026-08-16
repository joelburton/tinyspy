/**
 * What each of setgame's two readout surfaces shows, and how its hint control is
 * labelled.
 *
 * Plain functions rather than part of `components/Counts.tsx`, because a file
 * that exports both a component and a function breaks Fast Refresh for itself
 * (`react-refresh/only-export-components`) — the same split `common/…/turnCopy`
 * makes, for the same reason.
 */

/** One labelled number, as `<Counts>` wants it. */
export type CountItem = { label: string; value: number }

/**
 * The readouts, for the info column (desktop) or the status bar (mobile).
 *
 * There is deliberately **no count of the cards face-up**: they are right there
 * to be looked at, and a readout of something already on screen is noise. Hints
 * appear in coop only — compete has none to spend, so the label would name a
 * thing that does not exist there.
 */
export function countsFor(
  where: 'info' | 'mobile',
  { isCompete, teamFound, deckLeft, hintsUsed }: {
    isCompete: boolean
    teamFound: number
    deckLeft: number
    hintsUsed: number
  },
): CountItem[] {
  const items: CountItem[] = [{ label: 'Found', value: teamFound }]
  // The bar sits beside a button on a ~390px screen, and it must never wrap
  // (the shared bar clips rather than grows). "Deck remaining" is the longest
  // and the least urgent of the three — it changes slowly and answers "how much
  // game is left?", which is a question you can open the sheet for.
  if (where === 'info') items.push({ label: 'Deck remaining', value: deckLeft })
  if (!isCompete) items.push({ label: 'Hints', value: hintsUsed })
  return items
}

/** The hint control's label, shared by BOTH copies of the button (info column
 *  and mobile bar) so the disabled reason can't be worded two ways. */
export function hintLabel(isCompete: boolean): string {
  return isCompete ? 'No hints when competing' : 'Show hint'
}
