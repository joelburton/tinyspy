import {
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { DefinitionPopover } from '../../common/components/DefinitionPopover'
import { colorVarFor } from '../../common/lib/memberColor'
import { cls } from '../../common/lib/cls'
import type { FoundWordRow, Player } from '../hooks/useGame'
import { buildDisplayRows } from '../lib/displayRows'
import { useRecentlyFound } from '../hooks/useRecentlyFound'
import styles from './WordList.module.css'

type Props = {
  foundWords: FoundWordRow[]
  players: Player[]
  /** The viewing player's user_id. Drives the post-terminal
   *  cat-A / cat-B split: a found word is cat A iff *I* found it. */
  selfUserId: string
  /** Count of all words the viewer/team has found (required + bonus).
   *  Driven by the parent so it matches the server's
   *  status.found_words_count. Can exceed requiredWordsCount when
   *  bonus words are found. */
  foundWordsCount: number
  requiredWordsCount: number
  /** Post-terminal reveal: when set, the list interleaves the
   *  unfound required words alphabetically with the found words.
   *  Its mere presence is also the signal that the game is over,
   *  which flips the list from the mid-game per-finder-color model
   *  to the cat-A / cat-B review model (see the component doc).
   *  Drawn from `games_state.required_words`, which materializes
   *  only when `common.games.is_terminal` flips. */
  revealWords?: Array<{ word: string; points: number; is_pangram: boolean }> | null
}

// The merged-row shape + the build/dedup logic live in
// `../lib/displayRows` so the dedup (mine-wins-over-opponent's for a
// word both found, post-terminal in compete) is unit-tested.

/**
 * Alphabetical list of every accepted submission.
 *
 * The list has **two visual models**, switched by whether the game
 * is over (signalled by `revealWords` being present):
 *
 *   - **Mid-game (per-finder attribution).** Each word renders in
 *     the finder's color via `colorVarFor(player.color)`. In coop
 *     you see your words plus your teammates' (each in their color);
 *     in compete RLS narrows the rows so you only see your own.
 *
 *   - **Post-terminal (cat-A / cat-B review).** Per-finder colors
 *     give way to a binary "how did *I* do" split:
 *       · **cat A** — words I found, kept in my own color.
 *       · **cat B** — everything else, undifferentiated and muted:
 *         words found by other players *plus* the required words
 *         nobody found (the reveal). Merging "someone else got it"
 *         and "nobody got it" into one bucket is deliberate — see
 *         the freebee.md game-over spec.
 *     The two buckets carry distinct classes (`catSelf` / `catOther`)
 *     so they can be styled independently.
 *
 * Three flags compose on top of either model:
 *
 *   - **Pangram** — emphasized via font-weight so a glance shows
 *     "someone got the pangram!" (or, in cat B, "the pangram we
 *     missed was…").
 *   - **Bonus** — appended dot indicates a bonus word (legal −
 *     required). The word still renders in its category/finder color;
 *     the trailing dot signals it's outside the required goal (it
 *     does still score the same).
 *   - **Recently found** — underline in the finder's color, fades
 *     after 5s (managed by useRecentlyFound). Suppressed post-terminal:
 *     the reveal refetch makes every peer row appear at once, which
 *     would otherwise flash the whole list.
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
  selfUserId,
  foundWordsCount,
  requiredWordsCount,
  revealWords,
}: Props) {
  // Presence of the reveal list is our "game is over" signal, which
  // flips the list from per-finder colors to the cat-A / cat-B model.
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
    () => buildDisplayRows(foundWords, revealWords, selfUserId),
    [foundWords, revealWords, selfUserId],
  )

  // Just the found words for the useRecentlyFound input — the
  // unfound reveal entries arrive in bulk when the game
  // terminalizes and would all flash at once if we fed them in.
  const foundWordsOnly = useMemo(
    () => foundWords.map((r) => r.word),
    [foundWords],
  )
  const recentlyFound = useRecentlyFound(foundWordsOnly)

  // Click-to-define: clicking any word row opens a definition popover
  // anchored to that row. The lookup is a common feature (see
  // common/components/DefinitionPopover) — freebee just wires its
  // rows to it.
  const [defining, setDefining] = useState<{
    word: string
    rect: DOMRect
  } | null>(null)

  function openDefine(word: string, el: HTMLElement) {
    setDefining({ word, rect: el.getBoundingClientRect() })
  }

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
      <div className={styles.header}>
        {revealWords
          ? `${foundWordsCount} / ${requiredWordsCount} words — reveal`
          : `${foundWordsCount} / ${requiredWordsCount} words`}
      </div>
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
              // Unfound reveal entries are always cat B (a required
              // word nobody got) and only ever render post-terminal.
              if (entry.kind === 'unfound') {
                return (
                  <li
                    key={entry.word}
                    className={cls(
                      styles.row,
                      styles.catOther,
                      entry.isPangram && styles.pangram,
                    )}
                    {...rowActivation(entry.word)}
                  >
                    {entry.word.toUpperCase()}
                  </li>
                )
              }
              const row = entry.row
              const isMine = entry.category === 'a'
              const color = colorByUser.get(row.user_id) ?? 'var(--color-text)'
              return (
                <li
                  key={row.word}
                  className={cls(
                    styles.row,
                    // Post-terminal: cat A (mine) keeps its inline
                    // color, cat B (others') goes muted via catOther.
                    // Mid-game: no category class, finder color wins.
                    reveal && (isMine ? styles.catSelf : styles.catOther),
                    row.is_pangram && styles.pangram,
                    // Recently-found flash is mid-game only — see the
                    // foundWordsOnly note + the component doc.
                    !reveal && recentlyFound.has(row.word) && styles.recent,
                  )}
                  // cat B drops the inline color so .catOther's muted
                  // gray wins; everything else keeps the finder color.
                  style={reveal && !isMine ? undefined : { color }}
                  {...rowActivation(row.word)}
                >
                  {row.word.toUpperCase()}
                  {/* Bonus words get a trailing bullet. Emitted as real
                      text (not a ::after) so it sits naturally inline +
                      centered with the word — no vertical-align fiddling. */}
                  {row.is_bonus && <span className={styles.bonusDot}>{' •'}</span>}
                </li>
              )
            })
          )}
      </ul>
      {defining && (
        <DefinitionPopover
          initialWord={defining.word}
          anchorRect={defining.rect}
          onClose={() => setDefining(null)}
        />
      )}
    </div>
  )
}
