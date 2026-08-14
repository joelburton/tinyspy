import { useEffect, useState } from 'react'
import styles from './NextPuzzleField.module.css'
import form from './setupForm.module.css'

/** A row from either of a game's two puzzle-choosing RPCs — they share a
 *  shape on purpose, so this field renders whichever it asked without
 *  caring. `null` from the derive call means the archive is used up for
 *  these players; `null` from the by-date call means no puzzle that day. */
export type NextPuzzle = { id: string; puzzle_date: string; label: string } | null

type Props = {
  /** The gametype's user-facing brand, for the exhausted copy. */
  brand: string
  /** The selected players' user ids. The preview is scoped to exactly the
   *  people about to be seated, so unchecking someone can bring a puzzle
   *  back — which is why this re-fetches when the selection changes. */
  seenBy: string[]
  /** Calls the game's `next_puzzle_for_club`. Supplied by the game because
   *  each has its own schema-scoped, typed `db` handle. */
  load: (seenBy: string[]) => Promise<NextPuzzle>
  /** Calls the game's `puzzle_for_date` — the override. */
  loadByDate: (date: string) => Promise<NextPuzzle>
  /** Reports the override: a puzzle id to play THAT one, or undefined to go
   *  back to letting the server choose. Written into `setup.puzzleId`. */
  onPick: (puzzleId: string | undefined) => void
}

/**
 * The puzzle "choice" for connections and strands: a line saying what Start
 * will play, plus a date box for the rare case where you want a specific one.
 *
 * THE DEFAULT IS NO CHOICE. Both games' archives are QUEUES, not catalogues —
 * the date carries none of the meaning a crossword's does (a Monday crossword
 * and a Saturday one are different animals; connections #900 and #901 are
 * not), so the only question the old calendar was ever asked was "give us one
 * we haven't done". The server answers exactly that, excluding anything any
 * SELECTED PLAYER has played in ANY club, so it can't be a repeat for anyone
 * at the table. Leave the date box empty and that is what you get.
 *
 * THE DATE BOX IS THE OVERRIDE, and it filters nothing: a puzzle everyone has
 * already finished comes back like any other, and starting it makes a SECOND
 * game rather than reopening the first. That's deliberate — the whole point of
 * the default is to stop you stumbling into a repeat, so the escape hatch has
 * to be able to say "yes, I mean it". It's for "the one they were talking
 * about at work", and for replaying a good one together.
 *
 * The derived line is a PREVIEW, not an input: with the box empty, `setup`
 * carries no `puzzleId` at all and `create_game` derives the puzzle again at
 * Start from the same function and player list. So a peer starting that very
 * puzzle while the dialog sits open costs nothing — you get the genuinely-next
 * one. Pick a date and the id IS sent, because then you meant that one.
 *
 * The label slot keeps a fixed height across every state (loading, a puzzle,
 * exhausted, no-puzzle-that-day) so the sections below never jump.
 */
export function NextPuzzleField({ brand, seenBy, load, loadByDate, onPick }: Props) {
  // The derived answer STAMPED WITH the player set it was fetched for, rather
  // than a bare row plus a loading flag. Toggling a player has to blank the
  // line (the old answer may no longer be right), and clearing it by calling
  // setState at the top of the effect is exactly the sync-setState-in-an-effect
  // the lint rule forbids. Keeping the key alongside the value lets "we're
  // waiting" be DERIVED — stale stamp, no answer yet.
  const [fetched, setFetched] = useState<{ key: string; row: NextPuzzle } | null>(null)
  // The override: the raw date string (so the input stays controlled even for
  // a date with no puzzle) and what it resolved to.
  const [date, setDate] = useState('')
  const [picked, setPicked] = useState<NextPuzzle>(null)

  // `seenBy` is a fresh array on every parent render, so the effect keys on
  // its joined contents; keying on the array itself would re-fetch forever.
  const key = seenBy.join(',')
  useEffect(() => {
    let active = true
    void (async () => {
      const row = await load(key ? key.split(',') : [])
      if (active) setFetched({ key, row })
    })()
    return () => {
      active = false
    }
    // `load` is a fresh closure per render in every caller, so it can't be a
    // dependency; the player set is the real input and it is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const derived = fetched?.key === key ? fetched.row : undefined

  // Resolving the override happens in the CHANGE HANDLER, not an effect:
  // `onPick` writes to the parent's setup, and calling a prop callback from an
  // effect is the shape that loops at runtime (docs: no setState in effects).
  async function chooseDate(next: string) {
    setDate(next)
    if (!next) {
      setPicked(null)
      onPick(undefined) // back to "the server chooses"
      return
    }
    const row = await loadByDate(next)
    setPicked(row)
    onPick(row?.id)
  }

  // What the line says. A chosen date wins; otherwise the derived answer.
  const line = date
    ? picked
      ? picked.label
      : `No ${brand} puzzle for ${date}.`
    : derived === undefined
      ? ' '
      : derived === null
        ? `Everyone here has already played every ${brand} puzzle.`
        : derived.label

  return (
    <fieldset className={form.fieldset}>
      <legend>Puzzle</legend>
      <p className="muted">
        The next {brand} puzzle nobody playing has seen — including games any of you
        played in another club. Or pick a date to play that one instead, even if
        you&rsquo;ve played it before.
      </p>
      <p className={styles.next}>{line}</p>
      <input
        type="date"
        aria-label="Puzzle date"
        className={styles.date}
        value={date}
        onChange={(e) => void chooseDate(e.target.value)}
      />
    </fieldset>
  )
}
