// cs-unmet

import { useEffect, useMemo, useRef, useState } from 'react'
import { runRpc } from '../../../common/lib/supabase/dbResult'
import { BlockingModal } from '../../../common/components/floating-panels/BlockingModal'
import { CancelButton } from '../../../common/components/buttons/CancelButton'
import { SelectionList } from '../../../common/components/lists/SelectionList'
import { cls } from '../../../common/lib/util/cls'
import { db } from '../../db'
import styles from './pickers.module.css'
import '../../theme.css'
import { reportUnhandled } from '../../../common/lib/supabase/dbEnvelope'

/**
 * Whether the club opening this picker has played a given puzzle, as
 * `crosswords.library_for_club` tags it. Not per-player and not per-mode —
 * "have WE done this one" is a question about the club, so a puzzle solved
 * cooperatively reads `solved` in the compete dialog too.
 */
type PuzzleStatus = 'solved' | 'playing' | 'lost' | 'unplayed'

/** A library puzzle as the picker sees it — id + the non-spoiler meta. */
export type LibraryPuzzle = {
  id: string
  title: string
  author: string
  status: PuzzleStatus
}

/**
 * The club-history stripe down each row's leading edge. Same outcome-color
 * vocabulary the club page uses for a game's own state, so green/yellow/red
 * mean here what they mean there.
 */
const STATUS_CLASS: Record<PuzzleStatus, string> = {
  solved: styles.statusSolved!,
  playing: styles.statusPlaying!,
  lost: styles.statusLost!,
  unplayed: styles.statusUnplayed!,
}

/** The RPC types `status` as plain `text`. Anything the FE doesn't recognize
 *  (a status added server-side first) falls back to the neutral bar rather
 *  than rendering an unstyled row. */
function statusClass(status: string): string {
  return STATUS_CLASS[status as PuzzleStatus] ?? STATUS_CLASS.unplayed
}

type Props = {
  clubHandle: string
  /** Chosen — the picker's whole output, and it closes on the way out. */
  onPick: (puzzle: LibraryPuzzle) => void
  onClose: () => void
}

/**
 * **Pick a puzzle from the curated library** (plans/areas/forms.md →
 * `puzzle-source-picks-in-a-dialog`).
 *
 * **Choosing CLOSES it**, which is the rule the whole design rests on: with the
 * pick and the Start button in different boxes, a footer "Use this one" would
 * make the common path two presses where the tabs it replaces took one. So the
 * list is on `SelectionList`'s `onActivate` arm — click or Enter both mean
 * "play this" — where the same list was on `selected`/`onSelect` while it lived
 * inside the setup form and Enter had to not submit the form around it.
 *
 * Cancel is the only other way out, and it is a real one now: leaving a source
 * used to be a side effect of pressing a different tab.
 */
/** What `library_for_club` answers: one `ok`, and an EMPTY list is part of it. */
type LibraryAnswer = {
  result: 'library'
  puzzles: { id: string; title: string; author: string; status: string }[]
}

export function LibraryPickerBlockingModal({ clubHandle, onPick, onClose }: Props) {
  const [puzzles, setPuzzles] = useState<LibraryPuzzle[] | null>(null)
  const [query, setQuery] = useState('')

  // One RPC rather than "list the puzzles, then color them": the join to
  // play_state crosses schemas (crosswords.games → common.games), which
  // PostgREST embeds can't express, and doing it in two reads would paint
  // the rows and then recolor them a beat later. It's also ~200× less over
  // the wire than the `select id, meta` this replaced — `meta` is the whole
  // template (every cell, number, block, circle) and the row shows four
  // scalars off it. Ordering + the source='library' filter live in the RPC.
  useEffect(() => {
    let active = true
    void (async () => {
      const res = await runRpc<LibraryAnswer>(
        db.rpc('library_for_club', { target_club: clubHandle }),
      )
      // The cancel guard first, before the branch: a modal closed mid-flight
      // cancels its own request, and `runRpc` hands that back as a not-ok like
      // any other (docs/envelopes.md → The cancel guard comes FIRST).
      if (!active) return
      if (res.type === 'not-ok') {
        // The list stays `null`, which is the LOADING state — a failed load must
        // not read as "this club has no puzzles", the one sentence a viewer
        // would act on by importing some. `runRpc` has raised the modal.
        return
      } else if (res.type === 'ok' && res.data.result === 'library') {
        // An EMPTY library is an ordinary answer here, not a refusal: nothing is
        // blocked and there is no input to fix, so the list renders its own
        // "No puzzles found." rather than a message from the server.
        setPuzzles(
          res.data.puzzles.map((row) => ({
            id: row.id,
            title: row.title,
            author: row.author,
            status: row.status as PuzzleStatus,
          })),
        )
        return
      } else {
        reportUnhandled('library_for_club', res)
        return
      }
    })()
    return () => {
      active = false
    }
  }, [clubHandle])

  // TAKE FOCUS, explicitly rather than through `SelectionList`'s `autoFocus`.
  //
  // That flag yields to anything already focused, which is right for a list on a
  // page and wrong here: you arrived by CLICKING a source button, so that button
  // holds focus — and it lives in the setup dialog, not in this modal. Escape is
  // answered by "the panel focus is in, else the topmost"
  // (`usePanelEscape`), so leaving focus behind means one Escape closes the
  // SETUP dialog, and this picker disappears with it because a field inside that
  // dialog is what renders it. Both gone, from one key.
  //
  // The list rather than Cancel, so the arrows work the moment it opens.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.focus({ preventScroll: true })
  }, [])

  const filtered = useMemo(() => {
    if (!puzzles) return null
    const q = query.trim().toLowerCase()
    if (!q) return puzzles
    return puzzles.filter(
      (p) => p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q),
    )
  }, [puzzles, query])

  return (
    <BlockingModal title="Library" onClose={onClose} actions={<CancelButton onClick={onClose} />}>
      <div className={styles.body}>
        <input
          className={styles.search}
          type="text"
          placeholder="Filter by title or author…"
          aria-label="Filter puzzles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.listBox}>
          <SelectionList
            items={filtered ?? []}
            rowKey={(p) => p.id}
            label="Puzzle library"
            fills
            ref={listRef}
            onActivate={onPick}
            empty={
              filtered === null
                ? 'Loading puzzles…'
                : // The empty library reads as a plain fact, NOT as the
                  // import command that fills it: this is a player-facing
                  // surface and the fix is Joel's to run, not theirs. A shell
                  // command here tells a friend on production to do
                  // something they can't.
                  puzzles && puzzles.length === 0
                  ? 'No puzzles found.'
                  : 'No puzzles match that filter.'
            }
            renderRow={(p) => (
              <>
                {/* "Has THIS club played it?" — see .stripe. */}
                <span className={cls(styles.stripe, statusClass(p.status))} aria-hidden="true" />
                {/* Title + author only. The grid size used to sit at the
                    right, but it isn't something you pick a puzzle BY, and
                    as the row's second column it fought the title for the
                    width — which is what made the dialog too wide. */}
                <span className={styles.itemTitle}>
                  {p.title}
                  {p.author ? ` · ${p.author}` : ''}
                </span>
              </>
            )}
          />
        </div>
      </div>
    </BlockingModal>
  )
}
