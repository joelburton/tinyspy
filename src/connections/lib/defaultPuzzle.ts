/**
 * Pure resolution of the connections setup dialog's DEFAULT puzzle pick —
 * extracted from `SetupForm` so the (fiddly) rules are unit-testable without
 * standing up the DB-fetching component.
 *
 * The friends play connections as an ongoing series: they want the dialog to
 * open on "the next puzzle we're up to," not on whatever today's date is. So
 * the default is anchored on the club's **saved default** — the puzzle they
 * last started, which `SetupGameDialog` pre-fills as `savedPuzzleId`:
 *
 *   1. **Base** = the saved-default puzzle if we still have it in the list;
 *      otherwise the most-recent imported puzzle (a club that's never played,
 *      or whose saved puzzle has since aged out of the import). Never today.
 *   2. **Step forward once** if the club has already FINISHED (won or lost)
 *      the base puzzle: default to the next day's puzzle instead, so they land
 *      on something fresh. Just one step — if that next one's also been played
 *      we still stop there (deliberately not walking forward hunting for an
 *      unplayed day). A base puzzle that's only in-progress is left as the
 *      pick so the friends can resume it.
 *
 * Dates are `YYYY-MM-DD`, so lexical `>` is chronological. `puzzles` is the
 * date-DESCENDING list the form already holds (index 0 = most recent).
 *
 * @param puzzles        date-descending {id, nyt_date} rows (non-NULL dates)
 * @param finishedDates  dates whose club game is terminal (won/lost)
 * @param savedPuzzleId  the club's saved-default puzzle id, or '' if none
 * @returns the puzzle id to default to, or null if there are no puzzles
 */
export function resolveDefaultPuzzle(
  puzzles: ReadonlyArray<{ id: string; nyt_date: string }>,
  finishedDates: ReadonlySet<string>,
  savedPuzzleId: string,
): string | null {
  if (puzzles.length === 0) return null

  const savedDate = puzzles.find((p) => p.id === savedPuzzleId)?.nyt_date
  const baseDate = savedDate ?? puzzles[0].nyt_date

  let pickDate = baseDate
  if (finishedDates.has(baseDate)) {
    // The closest date strictly after baseDate. Since `puzzles` is descending,
    // the later-dated entries sit at the front and the LAST of those is the
    // nearest — "the next day" for a contiguous daily archive. Undefined when
    // the base is already the most recent, in which case we keep it.
    const later = puzzles.filter((p) => p.nyt_date > baseDate)
    const nextDay = later[later.length - 1]
    if (nextDay) pickDate = nextDay.nyt_date
  }

  return puzzles.find((p) => p.nyt_date === pickDate)?.id ?? null
}
