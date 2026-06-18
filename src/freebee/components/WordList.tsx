import { useMemo } from 'react'
import { colorVarFor } from '../../common/lib/memberColor'
import { cls } from '../../common/lib/cls'
import type { FoundWordRow, Player } from '../hooks/useGame'
import { useRecentlyFound } from '../hooks/useRecentlyFound'
import styles from './WordList.module.css'

type Props = {
  foundWords: FoundWordRow[]
  players: Player[]
  /** Mid-game count of scoring (non-bonus) words found. Driven
   *  by the parent so it can match the value the server uses
   *  in status.words_found. */
  scoringFoundCount: number
  totalWords: number
  /** Post-terminal reveal: when set, the list interleaves the
   *  unfound scoring words alphabetically with the found words,
   *  rendering the missed ones in muted gray. Drawn from
   *  `games_state.scoring_words`, which materializes only when
   *  `common.games.is_terminal` flips (see Phase 1 migration). */
  revealWords?: Array<{ word: string; points: number; is_pangram: boolean }> | null
}

/** A merged-list row — either a found word (full FoundWordRow)
 *  or an unfound reveal entry. Distinct kinds so the render
 *  branch on `kind` cleanly without union-narrowing tricks. */
type DisplayRow =
  | { kind: 'found'; row: FoundWordRow }
  | { kind: 'unfound'; word: string; isPangram: boolean }

/**
 * Alphabetical list of every accepted submission.
 *
 * Each word renders in the finder's color (per-finder visual
 * attribution) via `colorVarFor(player.color)`. Three flags
 * compose styles on top of the base row:
 *
 *   - **Pangram** — emphasized via font-weight so a glance shows
 *     "someone got the pangram!"
 *   - **Bonus** — appended dot indicates a legal-but-not-scoring
 *     word. The word still renders in finder color, but the
 *     trailing punctuation signals "0 points."
 *   - **Recently found** — underline in the finder's color,
 *     fades after 5s (managed by useRecentlyFound).
 *
 * No definition popover in Phase 4 — that's the common
 * dictionary-lookup feature, deferred (see
 * `~/.claude/projects/-Users-joel-src-codenames/memory/
 * project_common_dictionary_lookup.md`). When that lands the
 * row's onClick can wire up the popover; today rows are
 * non-interactive.
 *
 * No pagination either — for v1 we let the panel scroll
 * vertically. The freebee-ws version measures column layout
 * to derive a page size, which is appropriate for the fixed-
 * height side panel that game has. Pupgames keeps it simpler
 * until a real need shows up.
 */
export function WordList({
  foundWords,
  players,
  scoringFoundCount,
  totalWords,
  revealWords,
}: Props) {
  // Color lookup by user_id. Players list is small (<10 in
  // realistic clubs) so a Map+get rather than .find on each row.
  const colorByUser = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of players) m.set(p.user_id, colorVarFor(p.color))
    return m
  }, [players])

  // Merge the found rows with any reveal entries (if provided)
  // into a single alphabetical list. Found rows shadow unfound
  // entries with the same word — we never want to render a
  // word both as "found in finder color" AND "missed in gray."
  const displayRows = useMemo<DisplayRow[]>(() => {
    const foundByWord = new Map<string, FoundWordRow>()
    for (const r of foundWords) foundByWord.set(r.word, r)

    const rows: DisplayRow[] = []
    for (const r of foundWords) rows.push({ kind: 'found', row: r })
    if (revealWords) {
      for (const sw of revealWords) {
        if (foundByWord.has(sw.word)) continue   // shadowed
        rows.push({
          kind: 'unfound',
          word: sw.word,
          isPangram: sw.is_pangram,
        })
      }
    }
    rows.sort((a, b) => {
      const aw = a.kind === 'found' ? a.row.word : a.word
      const bw = b.kind === 'found' ? b.row.word : b.word
      return aw.localeCompare(bw)
    })
    return rows
  }, [foundWords, revealWords])

  // Just the found words for the useRecentlyFound input — the
  // unfound reveal entries arrive in bulk when the game
  // terminalizes and would all flash at once if we fed them in.
  const foundWordsOnly = useMemo(
    () => foundWords.map((r) => r.word),
    [foundWords],
  )
  const recentlyFound = useRecentlyFound(foundWordsOnly)

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        {revealWords
          ? `${scoringFoundCount} / ${totalWords} words — reveal`
          : `${scoringFoundCount} / ${totalWords} words`}
      </div>
      <ul className={styles.list}>
        {displayRows.length === 0
          ? (
            <li className={styles.empty}>No words yet</li>
          )
          : (
            displayRows.map((entry) => {
              if (entry.kind === 'unfound') {
                return (
                  <li
                    key={entry.word}
                    className={cls(styles.row, styles.unfound)}
                  >
                    {entry.word.toUpperCase()}
                  </li>
                )
              }
              const row = entry.row
              const color = colorByUser.get(row.user_id) ?? 'var(--color-text)'
              return (
                <li
                  key={row.word}
                  className={cls(
                    styles.row,
                    row.is_pangram && styles.pangram,
                    row.is_bonus && styles.bonus,
                    recentlyFound.has(row.word) && styles.recent,
                  )}
                  style={{ color }}
                >
                  {row.word.toUpperCase()}
                </li>
              )
            })
          )}
      </ul>
    </div>
  )
}
