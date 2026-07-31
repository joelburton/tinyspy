/**
 * Pick the puzzle a "New game" should start: the NEXT one by date that this
 * club hasn't played yet.
 *
 * connections is the one game whose boards are a **dated archive** rather than
 * something generated per game — every other game's New game just re-rolls a
 * fresh board from the same setup. So "same again" here means "the next daily
 * puzzle", and it has to skip the ones the club already has a game for, or the
 * button would hand them a board they've seen.
 *
 * Pure + unit-tested, like its sibling `resolveDefaultPuzzle` (the setup form's
 * date-picker default) — the queries live in PlayArea, the rule lives here.
 *
 * @param puzzles     every dated puzzle, **ascending** by `nyt_date`.
 * @param playedDates the `nyt_date`s this club already has a game for, in this
 *                    MODE — a coop game doesn't use up the compete side, and
 *                    another club's play doesn't use up ours (clubs are
 *                    independent groups of friends; see CLAUDE.md → Audience).
 * @param afterDate   the current game's puzzle date, so we walk FORWARD from
 *                    where the group is. Null for a non-NYT puzzle (which has
 *                    no place in the archive), in which case we fall back to
 *                    the earliest unplayed puzzle of all.
 * @returns the puzzle to start, or **null** when there's nothing left — which
 *          the caller surfaces as a notice rather than starting anything.
 */
export function nextUnplayedPuzzle<T extends { id: string; nyt_date: string }>(
  puzzles: readonly T[],
  playedDates: ReadonlySet<string>,
  afterDate: string | null,
): T | null {
  // ISO `YYYY-MM-DD` strings compare correctly as strings, so no Date parsing.
  const candidates = afterDate === null ? puzzles : puzzles.filter((p) => p.nyt_date > afterDate)
  return candidates.find((p) => !playedDates.has(p.nyt_date)) ?? null
}
