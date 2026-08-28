// cs-unmet

import type { CrosswordsValues } from './setup'
import { GUARDIAN_SERIES } from './setup'
import { DEFAULT_WEEKDAY, weekdayName } from './nytDays'

/**
 * The caption: what pressing Start will actually play.
 *
 * Every line names the SOURCE and the thing chosen from it, because after a
 * picker closes this is the only account of either. The NYT lines carry the
 * resolved date for that reason — "NYT Monday" alone would drop the fact the
 * player opened the picker to learn.
 *
 * `undefined` from `resolved` means the lookup has not answered yet, and it
 * reads as a wait rather than as an absence: "none left" is a different
 * statement and must not be shown while the answer is still coming.
 */
export function summarize(
  s: CrosswordsValues,
  resolved: string | null | undefined,
  libraryTitle: string | null,
): string {
  switch (s.source) {
    case 'nyt':
      // An explicit date beats the weekday, and says so by not naming one.
      if (s.date) return `Puzzle: NYT ${s.date}`
      {
        const day = weekdayName(s.weekday ?? DEFAULT_WEEKDAY)
        if (resolved === undefined) return `Puzzle: NYT ${day} · looking…`
        return `Puzzle: NYT ${day} · ${resolved ?? 'none left'}`
      }
    case 'guardian': {
      const series = GUARDIAN_SERIES.find((g) => g.slug === s.series)
      return series ? `Puzzle: Guardian ${series.label}` : 'Puzzle: choose one'
    }
    case 'upload':
      if (!s.filename) return 'Puzzle: choose one'
      // Both halves earn their place: the title is what the puzzle IS, and the
      // filename is what you would check to know you grabbed the right one — a
      // .puz title is often absent or machine-written ("NY Times, Mon, Aug 24,
      // 2026") while the filename is the thing you recognize.
      return s.board?.meta.title
        ? `Puzzle: ${s.board.meta.title} · ${s.filename}`
        : `Puzzle: ${s.filename}`
    case 'library':
      return libraryTitle ? `Puzzle: ${libraryTitle}` : 'Puzzle: choose one'
    default:
      return 'Puzzle: choose one'
  }
}
