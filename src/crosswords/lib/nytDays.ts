// cs-unmet

/**
 * THE NYT WEEKDAYS — the picker's rows, and the two constants that go with them.
 *
 * Their own module rather than the picker's file, because they are data three
 * places read: the picker lists them, `PuzzleSourceField` names one in its
 * caption, and the default seeds a club that has never chosen. (A component
 * file exporting values also breaks fast refresh, which is the compiler telling
 * us the same thing.)
 */

/**
 * How far back the NYT date override reaches. NYT's own archive runs to 1993,
 * but a box you can page back thirty years in is a worse tool than a bounded
 * one, and the weekday walk stops here too. Joel's number.
 */
export const NYT_EARLIEST = '2015-01-01'

/**
 * 0..6 with Sunday = 0, matching Postgres `dow` and JS `getUTCDay`, because the
 * value goes straight to `crosswords.next_nyt_date_for_club(seen_by, dow)`.
 *
 * The difficulty notes are the whole reason the picker exists: an NYT
 * crossword's DAY is its difficulty — Monday easiest, ramping to Saturday, with
 * Sunday a 21×21 that plays around Thursday's level rather than being the
 * hardest. A solver picking "Tuesday" is picking a difficulty, and saying so out
 * loud saves them knowing the convention beforehand.
 */
export const WEEKDAYS: Array<{ dow: number; name: string; note: string }> = [
  { dow: 1, name: 'Monday', note: 'easiest' },
  { dow: 2, name: 'Tuesday', note: 'easy' },
  { dow: 3, name: 'Wednesday', note: 'medium' },
  { dow: 4, name: 'Thursday', note: 'medium, usually a twist' },
  { dow: 5, name: 'Friday', note: 'hard' },
  { dow: 6, name: 'Saturday', note: 'hardest' },
  { dow: 0, name: 'Sunday', note: 'big (21×21), medium' },
]

/** Monday when a club has never chosen — the easiest day to start on. */
export const DEFAULT_WEEKDAY = 1

/** The day's name, for the caption. Falls back rather than throwing: `weekday`
 *  is caller-supplied and a club's saved default outlives this list. */
export function weekdayName(dow: number): string {
  return WEEKDAYS.find((w) => w.dow === dow)?.name ?? 'puzzle'
}
