import {
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useDefinePopover } from '../../../hooks/definitions/useDefinePopover'
import { useRecentlyFound } from '../../../hooks/game/useRecentlyFound'
import { useWordListFilter } from '../../../hooks/game/useWordListFilter'
import { colorVarFor } from '../../../lib/color/memberColor'
import { cls } from '../../../lib/util/cls'
import type { Member } from '../../../lib/games'
import { Dot } from '../../text/Dot'
import infoPanel from '../infoPanel.module.css'
import styles from './WordList.module.css'

/**
 * One row of the shared word list, normalized so every word game renders the same
 * shape. A game builds these from its own found-word + reveal data (see each
 * game's `lib/displayRows`):
 *
 *   - **found** — a word someone found; `userId` colors its dot (the finder).
 *     `isBonus` adds a trailing '•'; `isPangram` bolds it (games without either
 *     concept just omit the flag).
 *   - **unfound** — a word nobody found, shown only post-terminal (a hollow grey
 *     ring + grey word). Carries `isBonus` too: the reveal covers **both** lists,
 *     required and bonus, so the post-game artifact includes the interesting
 *     vocabulary nobody reached.
 *
 * Rows arrive **pre-merged + alphabetized** (the game's builder dedups found words
 * to their first finder and shadows a found word over its reveal entry). The only
 * state this component owns is the two-axis filter in its header — see
 * `useWordListFilter`.
 */
export type WordListRow =
  | {
    kind: 'found'
    word: string
    /** The **attributed** finder — earliest `found_at`. Colors the dot. */
    userId: string
    /**
     * EVERY player who found this word, `userId` first. Only compete can have
     * more than one (coop's `submit_word` rejects a word anyone already found),
     * and only post-terminal, when RLS opens peers' rows and the builder merges
     * duplicates into a single row.
     *
     * The dot can only carry one color, so attribution stays first-finder — but
     * the WHO filter matches against this whole list. Without it, filtering to
     * yourself would HIDE a word you found because someone else got there first.
     * Optional: a builder that omits it means "just `userId`".
     */
    finderIds?: string[]
    isBonus?: boolean
    isPangram?: boolean
    /** The word's score, for the heading's filtered tally. Optional: a game
     *  without per-word scoring omits it and the heading shows count only. */
    points?: number
  }
  | { kind: 'unfound'; word: string; isBonus?: boolean; isPangram?: boolean; points?: number }

type Props = {
  /** The merged, alphabetized rows (built by the game's `buildDisplayRows`). */
  rows: WordListRow[]
  /** Club members, for the finder-color lookup on each found row. */
  players: Member[]
  /**
   * Post-terminal reveal is active. Suppresses the recently-found flash — the
   * reveal refetch makes every peer row appear at once, which would otherwise
   * flash the whole list. Default `false`.
   */
  reveal?: boolean
  /** The card heading. Default "Words". */
  heading?: string
  /** The viewer, for the WHO filter's self-first ordering. */
  selfId: string
  /** Compete gates the per-player filter options until terminal (RLS). */
  isCompete: boolean
  isTerminal: boolean
  /** Does this board have a bonus list? False drops the KIND filter entirely. */
  hasBonus: boolean
}

/**
 * The shared found-words list — one component for every word-hunt game
 * (spellingbee, boggle) so the list looks + behaves identically across games
 * (docs/ui.md → "Consistency across games"). A heading over a bordered scroll-box
 * card holding an alphabetical, **column-major** grid (down each column, then the
 * next to the right); the box is a fixed height, so three columns show and the
 * rest scroll horizontally.
 *
 * Each row leads with a **circle marker** carrying the attribution; the word text
 * itself is plain body-black, so finder identity reads from the dot, not the text:
 *
 *   - **Found words** lead with a filled disc in their finder's color, word in black.
 *   - **Unfound required words** (the post-terminal reveal) lead with a hollow ring in
 *     grey, word also grey — "here's what the team / field missed."
 *
 * Three flags compose on top: **pangram** (bold), **bonus** (a trailing '•'), and
 * **recently found** (a finder-color underline that fades after 5s — mid-game
 * only, suppressed when `reveal` is set). Every word is click-to-define via the
 * shared `DefinitionPopover` — the word text itself is the target, not the whole
 * cell.
 *
 * **The two-axis filter** (`useWordListFilter`) lives in the heading row: a KIND
 * select (Legal / Required / Bonus) and a WHO select (All / Found / Missed / each
 * player). Unlike the turn log — whose picker is a hook the GAME calls, because
 * the selection also gates its `#N` history handle — this one is called *inside*
 * the component. Nothing outside the list consumes the selection (a word list
 * isn't chronological, so there's no history viewer to misaddress), and keeping it
 * in here means the **PDF prints the full list** no matter what's filtered on
 * screen: the printers build their own rows from the same `buildDisplayRows` and
 * never see this state.
 */
export function WordList({
  rows,
  players,
  reveal = false,
  heading = 'Words',
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
  // Score only when this game's rows carry points at all — and gated on ALL
  // rows (not `shown`) so the score doesn't blink away when a filter empties
  // the list ("Score: 0" is an answer; a vanishing label is a question).
  const hasPoints = useMemo(() => rows.some((r) => r.points !== undefined), [rows])
  const shownScore = shown.reduce((sum, r) => sum + (r.points ?? 0), 0)
  // The longest word in the filtered list, in letters. Ungated, unlike Score:
  // every word list has lengths, so there's no "does this game have it" question
  // to ask — and like the other two it reads 0 rather than vanishing when a
  // filter empties the list.
  const shownLongest = shown.reduce((n, r) => Math.max(n, r.word.length), 0)

  // Color-NAME lookup by user_id (the shared <Dot> + colorVarFor resolve it).
  // Players list is small (<10 in realistic clubs) so a Map+get rather than
  // .find on each row.
  const colorByUser = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of players) m.set(p.user_id, p.color)
    return m
  }, [players])

  // Just the found words for the useRecentlyFound input — the unfound reveal
  // entries arrive in bulk when the game terminalizes and would all flash at once.
  const foundWordsOnly = useMemo(
    () => rows.filter((r) => r.kind === 'found').map((r) => r.word),
    [rows],
  )
  const recentlyFound = useRecentlyFound(foundWordsOnly)

  // Click-to-define: clicking any word row opens a definition popover anchored to
  // that row. The open/anchor/close plumbing is the shared useDefinePopover hook.
  const { define: openDefine, popover } = useDefinePopover()

  /** Pointer activation for a clickable word. Spread onto the word <span> itself
   *  (not the row) so only the word text — not the leading dot or the empty rest
   *  of the cell — opens the definition.
   *
   *  Pointer-only, deliberately: NOT focusable, no `role="button"`. See
   *  common/theme.css → `.definable`. This list is the worst case for the
   *  alternative — a found-words grid can hold a hundred words, so making each
   *  one a tab stop buried every real control behind a hundred presses. */
  function wordActivation(word: string) {
    return {
      onClick: (e: ReactMouseEvent<HTMLSpanElement>) => openDefine(word, e.currentTarget),
      title: 'Click to define',
      // The e2e handle (the repo's `[data-board]` / `[data-cell]` convention).
      // Specs used to find a listed word by `getByRole('button', {name})`, which
      // quietly depended on these spans faking button semantics; the word is the
      // stable thing to select on, so name it. Lowercase = as stored, not as
      // displayed.
      'data-word': word,
    }
  }

  return (
    <div className={styles.wrapper}>
      {/* Heading + the KIND/WHO selects on one line — the same header-row chrome
          the turn log's picker wears (`infoPanel.headerRow`). */}
      <div className={infoPanel.headerRow}>
        <h3 className={infoPanel.heading}>
          {`${heading}: ${shown.length}`}
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
          TurnLog uses (a heading over an evident frame). */}
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
            <li className={styles.empty}>{wordFilter.emptyText}</li>
          ) : (
            shown.map((entry) => {
              // Unfound reveal entries — words nobody found, only ever
              // post-terminal. Hollow grey ring + grey word.
              if (entry.kind === 'unfound') {
                return (
                  <li
                    key={entry.word}
                    className={cls(styles.row, styles.unfound, entry.isPangram && styles.pangram)}
                  >
                    <Dot hollow className={cls(styles.dot, styles.dotUnfound)} />
                    <span className={styles.word} {...wordActivation(entry.word)}>{entry.word.toUpperCase()}</span>
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
                  <span
                    className={styles.word}
                    style={isRecent ? { textDecorationColor: colorVarFor(colorName) } : undefined}
                    {...wordActivation(entry.word)}
                  >
                    {entry.word.toUpperCase()}
                  </span>
                  {/* Bonus words get a trailing bullet. Emitted as real text (not a
                      ::after) so it sits naturally inline. */}
                  {entry.isBonus && <span className={styles.bonusDot}>{' •'}</span>}
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
