import {
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useDefinePopover } from '../../common/hooks/useDefinePopover'
import { colorVarFor } from '../../common/lib/memberColor'
import { cls } from '../../common/lib/cls'
import type { FoundWordRow, Player } from '../hooks/useGame'
import { buildDisplayRows } from '../lib/displayRows'
import { useRecentlyFound } from '../hooks/useRecentlyFound'
import styles from './WordList.module.css'

type Props = {
  foundWords: FoundWordRow[]
  players: Player[]
  /** Post-terminal reveal: when set, the list interleaves the
   *  unfound required words alphabetically with the found words (the
   *  unfound ones render grey). Its mere presence is also the "game
   *  over" signal — it suppresses the recently-found flash. Drawn from
   *  `games_state.required_words`, which materializes only when
   *  `common.games.is_terminal` flips. */
  revealWords?: Array<{ word: string; points: number; is_pangram: boolean }> | null
}

// The merged-row shape + the build/dedup logic live in
// `../lib/displayRows` (first-finder-wins dedup), unit-tested there.

/**
 * Alphabetical list of every accepted submission, plus — post-terminal —
 * the required words nobody found.
 *
 * Each row leads with a **circle marker** that carries the attribution;
 * the word text itself is plain body-black, so finder identity reads from
 * the dot, not the text:
 *
 *   - **Found words** lead with a filled ● in their **finder's** color
 *     (`colorVarFor(player.color)`), word in black. Each word appears
 *     once; a word more than one player found (compete, post-terminal)
 *     is attributed to the FIRST finder — buildDisplayRows dedups by
 *     earliest `found_at`. Mid-game compete shows only your own words
 *     (RLS); mid-game coop shows everyone's.
 *   - **Unfound required words** (the post-terminal reveal) lead with a
 *     hollow ○ in **medium grey**, word also grey — "here's what the
 *     team / field missed." The hollow ring (not the text color) is the
 *     "missed" signal. Bonus words are never revealed, so these are
 *     required-only.
 *
 * Three flags compose on top:
 *
 *   - **Pangram** — emphasized via font-weight (a found one, or a
 *     missed one in grey).
 *   - **Bonus** — a trailing '•' bullet (a bonus word: legal − required;
 *     scores the same, doesn't count toward the required goal).
 *   - **Recently found** — the word gets an underline in the finder's
 *     color (set inline, since CSS can't know it), fading after 5s
 *     (useRecentlyFound). Suppressed post-terminal: the reveal refetch
 *     makes every peer row appear at once, which would otherwise flash
 *     the whole list.
 *
 * Rows are interactive: clicking (or Enter/Space on) a word opens
 * the common `DefinitionPopover` anchored to that row, via the
 * shared dictionary-lookup feature (backed by the `define` edge
 * function). See `rowActivation` below for the click/keyboard wiring.
 *
 * Layout: an alphabetical grid filled **column-major** — down each
 * column, then the next to the right (APPLE/BERRY in column 1,
 * CHERRY/DURIAN in column 2, …). The box is a fixed height (derived from
 * the viewport), so each column is exactly that tall and three show at a
 * time; once words run past the third column the box scrolls
 * **horizontally**. See WordList.module.css for the grid mechanics.
 */
export function WordList({
  foundWords,
  players,
  revealWords,
}: Props) {
  // Presence of the reveal list is the "game is over" signal — it only
  // gates the recently-found flash now (coloring is phase-agnostic).
  const reveal = !!revealWords
  // Color lookup by user_id. Players list is small (<10 in
  // realistic clubs) so a Map+get rather than .find on each row.
  const colorByUser = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of players) m.set(p.user_id, colorVarFor(p.color))
    return m
  }, [players])

  // Merge the found rows with any reveal entries into one alphabetical
  // list (dedup rules in buildDisplayRows).
  const displayRows = useMemo(
    () => buildDisplayRows(foundWords, revealWords),
    [foundWords, revealWords],
  )

  // Just the found words for the useRecentlyFound input — the
  // unfound reveal entries arrive in bulk when the game
  // terminalizes and would all flash at once if we fed them in.
  const foundWordsOnly = useMemo(
    () => foundWords.map((r) => r.word),
    [foundWords],
  )
  const recentlyFound = useRecentlyFound(foundWordsOnly)

  // Click-to-define: clicking any word row opens a definition popover anchored
  // to that row. The open/anchor/close plumbing is the shared useDefinePopover
  // hook (a common feature — see common/hooks/useDefinePopover); spellingbee
  // just wires its rows to `openDefine`.
  const { define: openDefine, popover } = useDefinePopover()

  /** Mouse + keyboard activation for a word row. */
  function rowActivation(word: string) {
    return {
      onClick: (e: ReactMouseEvent<HTMLLIElement>) =>
        openDefine(word, e.currentTarget),
      onKeyDown: (e: ReactKeyboardEvent<HTMLLIElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openDefine(word, e.currentTarget)
        }
      },
      role: 'button' as const,
      tabIndex: 0,
      title: 'Click to define',
    }
  }

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>Words</h3>
      {/* The list in a card — the same bordered scroll-box chrome the shared
          TurnLog uses (a heading over an evident frame). */}
      <div className={styles.box}>
      <ul
        className={cls(
          styles.list,
          // Drop the column grid when there's nothing to lay out, so the
          // placeholder centers instead of sitting in a third-width cell.
          displayRows.length === 0 && styles.listEmpty,
        )}
      >
        {displayRows.length === 0
          ? (
            <li className={styles.empty}>No words yet</li>
          )
          : (
            displayRows.map((entry) => {
              // Unfound reveal entries — required words nobody found,
              // only ever post-terminal. Hollow grey ring + grey word.
              if (entry.kind === 'unfound') {
                return (
                  <li
                    key={entry.word}
                    className={cls(
                      styles.row,
                      styles.unfound,
                      entry.isPangram && styles.pangram,
                    )}
                    {...rowActivation(entry.word)}
                  >
                    <span className={cls(styles.dot, styles.dotUnfound)} aria-hidden="true">{'○'}</span>
                    <span className={styles.word}>{entry.word.toUpperCase()}</span>
                  </li>
                )
              }
              // A found word — a filled dot in its (first) finder's color,
              // word in black, mid-game and post-terminal alike.
              const row = entry.row
              const color = colorByUser.get(row.user_id) ?? 'var(--color-text)'
              // Recently-found flash is mid-game only — see the
              // foundWordsOnly note + the component doc.
              const isRecent = !reveal && recentlyFound.has(row.word)
              return (
                <li
                  key={row.word}
                  className={cls(
                    styles.row,
                    row.is_pangram && styles.pangram,
                    isRecent && styles.recent,
                  )}
                  {...rowActivation(row.word)}
                >
                  <span className={styles.dot} style={{ color }} aria-hidden="true">{'●'}</span>
                  {/* Word is plain black; only the dot carries finder color. The
                      recent-flash underline is set to the finder color inline
                      (CSS can't know it) — see `.recent .word`. */}
                  <span
                    className={styles.word}
                    style={isRecent ? { textDecorationColor: color } : undefined}
                  >
                    {row.word.toUpperCase()}
                  </span>
                  {/* Bonus words get a trailing bullet. Emitted as real
                      text (not a ::after) so it sits naturally inline. */}
                  {row.is_bonus && <span className={styles.bonusDot}>{' •'}</span>}
                </li>
              )
            })
          )}
      </ul>
      </div>
      {popover}
    </div>
  )
}
