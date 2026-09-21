// cs-audited-word-list

import { useMemo } from 'react'
import { DefinableWord } from '../definitions/DefinableWord'
import { useRecentlyFound } from './useRecentlyFound'
import { useWordListFilter } from './useWordListFilter'
import { colorVarFor } from '../members/memberColor'
import { cls } from '../utils/cls'
import type { Member } from '../members/member'
import { Dot } from '../members/Dot'
import infoPanel from '../info-sheet/infoPanel.module.css'
import styles from './WordList.module.css'

/**
 * One row of the shared word list, normalized so every word game renders the same
 * shape. A game builds these from its own found-word + reveal data:
 *
 *   - **found** — a word someone found; `userId` colors its dot (the finder).
 *     `isBonus` adds a trailing '•'; `isPangram` bolds it (games without either
 *     concept just omit the flag).
 *   - **unfound** — a word nobody found, shown only post-terminal (a hollow gray
 *     ring + gray word). Carries `isBonus` too: the reveal covers **both** lists,
 *     required and bonus, so the post-game artifact includes the interesting
 *     vocabulary nobody reached.
 *
 * Rows arrive **pre-merged + alphabetized** — the builder dedups found words to
 * their first finder and shadows a found word over its reveal entry.
 */
export type WordListRow =
  | {
    kind: 'found'
    word: string
    // The attributed finder — earliest `found_at`. Colors the dot.
    userId: string
    // EVERY player who found this word, `userId` first, because the WHO filter
    // matches against the whole list rather than the attributed finder alone.
    // Only compete post-terminal can hold more than one. Optional: omitting it
    // means "just `userId`".
    finderIds?: string[]
    isBonus?: boolean
    isPangram?: boolean
    // The word's score, for the heading's filtered tally. Optional: a game
    // without per-word scoring omits it and the heading shows count only.
    points?: number
  }
  | { kind: 'unfound'; word: string; isBonus?: boolean; isPangram?: boolean; points?: number }

type Props = {
  // The merged, alphabetized rows — `shared/word-hunt/foundWordsDisplayRows.ts`
  // builds them for spellingbee and wordwheel, boggle's `lib/displayRows` for
  // boggle.
  rows: WordListRow[]
  // The game's players, for the finder-color lookup on each found row.
  players: Member[]
  // Post-terminal reveal is active, which suppresses the recently-found
  // underline: the reveal lands every peer row at once and the whole list would
  // otherwise mark itself. Default `false`.
  reveal?: boolean
  // The viewer, for the WHO filter's self-first ordering.
  selfId: string
  // Compete gates the per-player filter options until terminal (RLS).
  isCompete: boolean
  isTerminal: boolean
  // Does this board have a bonus list? False drops the KIND filter entirely.
  hasBonus: boolean
}

/**
 * The shared found-words list: a heading over a bordered card holding an
 * alphabetical, column-major grid of `rows`. Call it with the rows a game built
 * and the five facts the filter needs; it owns everything below that.
 *
 * What a row draws: a filled dot in its finder's color for a found word, a
 * hollow gray one for an unfound reveal entry, with the word itself plain — so
 * identity reads from the dot, never the text. Pangram bolds, bonus adds a
 * trailing '•', and a word that just arrived takes an underline in its finder's
 * color unless `reveal` is set. Every word is a `<DefinableWord>`.
 *
 * The heading tallies the FILTERED rows, and the two selects beside it are
 * `useWordListFilter`'s. See `common/word-list/doc.md` for why the filter lives
 * in here rather than in the game.
 */
export function WordList({
  rows,
  players,
  reveal = false,
  selfId,
  isCompete,
  isTerminal,
  hasBonus,
}: Props) {
  const wordFilter = useWordListFilter({ rows, players, selfId, isCompete, isTerminal, hasBonus })
  const shown = wordFilter.filter(rows)

  // The heading tallies THE FILTERED LIST — "Words: 7 · Score: 10" — so the
  // filters become a reading tool: flip WHO to a player to see their coop
  // contribution, or to Missed at terminal to see what the reveal cost.
  //
  // None of the three is memoized, and that is deliberate rather than an
  // oversight to fix: both `rows` (built fresh in each game's render) and
  // `shown` (a `.filter` result) are new arrays every render, so a `useMemo`
  // keyed on either can never hit — it would cost a comparison and buy nothing
  // while reading as though something expensive were being avoided. They are
  // three O(n) passes over a list that runs to a few hundred words at most.
  //
  // Score only when this game's rows carry points at all — and gated on ALL
  // rows (not `shown`) so the score doesn't blink away when a filter empties
  // the list ("Score: 0" is an answer; a vanishing label is a question).
  const hasPoints = rows.some((r) => r.points !== undefined)
  const shownScore = shown.reduce((sum, r) => sum + (r.points ?? 0), 0)
  // The longest word in the filtered list, in letters. Ungated, unlike Score:
  // every word list has lengths, so there's no "does this game have it" question
  // to ask — and like the other two it reads 0 rather than vanishing when a
  // filter empties the list.
  const shownLongest = shown.reduce((n, r) => Math.max(n, r.word.length), 0)

  // Color-NAME lookup by user_id (the shared <Dot> + colorVarFor resolve it).
  // A Map rather than `.find` per row because it is the ROWS that can run to a
  // few hundred; the player list itself is small enough that either would do.
  const colorByUser = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of players) m.set(p.user_id, p.color)
    return m
  }, [players])

  // Just the found words for the useRecentlyFound input — the unfound reveal
  // entries arrive in bulk when the game terminalizes and would all flash at once.
  //
  // THIS memo is load-bearing, unlike the tallies above: `useRecentlyFound`'s
  // effect depends on this array's identity, so a fresh one per render would
  // re-run it on every render.
  const foundWordsOnly = useMemo(
    () => rows.filter((r) => r.kind === 'found').map((r) => r.word),
    [rows],
  )
  const recentlyFound = useRecentlyFound(foundWordsOnly)

  return (
    <div className={styles.wrapper}>
      {/* Heading + the KIND/WHO selects on one line — the same header-row chrome
          the event log's picker wears (`infoPanel.headerRow`). */}
      <div className={infoPanel.headerRow}>
        <h3 className={infoPanel.heading}>
          {`Words: ${shown.length}`}
          {hasPoints && ` · Score: ${shownScore}`}
          {/* Third tally, DESKTOP ONLY — below the breakpoint this heading
              shares its line with both filter selects inside the info sheet,
              and the third clause is what doesn't fit. Hidden in CSS rather
              than dropped from the tree so there's one string to reason about
              (and the test can assert it at any viewport). */}
          <span className={styles.longest}>{` · Longest: ${shownLongest}`}</span>
        </h3>
        {wordFilter.picker}
      </div>
      {/* The list in a bordered card — the same scroll-box chrome the shared
          EventLog uses (a heading over an evident frame). */}
      <div className={cls(infoPanel.box, styles.box)}>
        <ul
          className={cls(
            styles.list,
            // Drop the column grid when there's nothing to lay out, so the
            // placeholder centers instead of sitting in a third-width cell.
            shown.length === 0 && styles.listEmpty,
          )}
        >
          {shown.length === 0 ? (
            // Names whichever axis emptied the list — "No words yet" is a lie when
            // you've picked Bonus and simply have none.
            <li className="emptyState">{wordFilter.emptyText}</li>
          ) : (
            shown.map((entry) => {
              // Unfound reveal entries — words nobody found, only ever
              // post-terminal. Hollow gray ring + gray word.
              if (entry.kind === 'unfound') {
                return (
                  <li
                    key={entry.word}
                    className={cls(styles.row, styles.unfound, entry.isPangram && styles.pangram)}
                  >
                    <Dot hollow className={cls(styles.dot, styles.dotUnfound)} />
                    <DefinableWord word={entry.word} className={styles.word} />
                    {/* The bonus '•' marks a missed word too, not just a found one:
                        the reveal now covers both lists, so without it a missed bonus
                        word is indistinguishable from a missed required one. */}
                    {entry.isBonus && <span className={styles.bonusDot}>{' •'}</span>}
                  </li>
                )
              }
              // A found word — a filled dot in its finder's color, word in black.
              const colorName = colorByUser.get(entry.userId)
              // Recently-found flash is mid-game only (suppressed under reveal).
              const isRecent = !reveal && recentlyFound.has(entry.word)
              return (
                <li
                  key={entry.word}
                  className={cls(styles.row, entry.isPangram && styles.pangram, isRecent && styles.recent)}
                >
                  <Dot color={colorName} className={styles.dot} />
                  {/* Word is plain black; only the dot carries finder color. The
                      recent-flash underline is set to the finder color inline (CSS
                      can't know it) — see `.recent .word`. */}
                  <DefinableWord
                    word={entry.word}
                    className={styles.word}
                    style={isRecent ? { textDecorationColor: colorVarFor(colorName) } : undefined}
                  />
                  {/* Bonus words get a trailing bullet. Emitted as real text (not a
                      ::after) so it sits naturally inline. */}
                  {entry.isBonus && <span className={styles.bonusDot}>{' •'}</span>}
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
