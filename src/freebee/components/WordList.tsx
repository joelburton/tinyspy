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
import { useRecentlyFound } from '../hooks/useRecentlyFound'
import styles from './WordList.module.css'

type Props = {
  foundWords: FoundWordRow[]
  players: Player[]
  /** The viewing player's user_id. Drives the post-terminal
   *  cat-A / cat-B split: a found word is cat A iff *I* found it. */
  selfUserId: string
  /** Mid-game count of scoring (non-bonus) words found. Driven
   *  by the parent so it can match the value the server uses
   *  in status.words_found. */
  scoringFoundCount: number
  totalWords: number
  /** Post-terminal reveal: when set, the list interleaves the
   *  unfound scoring words alphabetically with the found words.
   *  Its mere presence is also the signal that the game is over,
   *  which flips the list from the mid-game per-finder-color model
   *  to the cat-A / cat-B review model (see the component doc).
   *  Drawn from `games_state.scoring_words`, which materializes
   *  only when `common.games.is_terminal` flips (Phase 1 migration). */
  revealWords?: Array<{ word: string; points: number; is_pangram: boolean }> | null
}

/** A merged-list row — either a found word (full FoundWordRow)
 *  or an unfound reveal entry. Distinct kinds so the render
 *  branch on `kind` cleanly without union-narrowing tricks.
 *
 *  `category` is the post-terminal stylable bucket:
 *    - 'a' — the viewing player found this word ("my words").
 *    - 'b' — everything else: words found by *other* players, and
 *            (for unfound rows) scoring words nobody found.
 *  Mid-game the category is computed but unused — the render keeps
 *  per-finder colors until `revealWords` arrives. */
type DisplayRow =
  | { kind: 'found'; row: FoundWordRow; category: 'a' | 'b' }
  | { kind: 'unfound'; word: string; isPangram: boolean } // always cat B

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
 *         words found by other players *plus* the scoring words
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
 *   - **Bonus** — appended dot indicates a legal-but-not-scoring
 *     word. The word still renders in its category/finder color, but
 *     the trailing punctuation signals "0 points."
 *   - **Recently found** — underline in the finder's color, fades
 *     after 5s (managed by useRecentlyFound). Suppressed post-terminal:
 *     the reveal refetch makes every peer row appear at once, which
 *     would otherwise flash the whole list.
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
  selfUserId,
  scoringFoundCount,
  totalWords,
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

  // Merge the found rows with any reveal entries (if provided)
  // into a single alphabetical list. Found rows shadow unfound
  // entries with the same word — we never want to render a
  // word both as "found in finder color" AND "missed in gray."
  const displayRows = useMemo<DisplayRow[]>(() => {
    const foundByWord = new Map<string, FoundWordRow>()
    for (const r of foundWords) foundByWord.set(r.word, r)

    const rows: DisplayRow[] = []
    for (const r of foundWords) {
      rows.push({
        kind: 'found',
        row: r,
        category: r.user_id === selfUserId ? 'a' : 'b',
      })
    }
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
  }, [foundWords, revealWords, selfUserId])

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
              // Unfound reveal entries are always cat B (a scoring
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
                    row.is_bonus && styles.bonus,
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
