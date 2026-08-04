import { useCallback, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GamePageCtx } from '../../common/lib/games'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { stickyPill, terminalPill } from '../../common/lib/game/localPills'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { END_GAME_CONFIRM, useConfirmDialog } from '../../common/hooks/ui/useConfirmDialog'
import { consumedCells, coordKey, wordFromPath, type Coord } from '../lib/board'
import { clickTile, type Trace } from '../lib/trace'
import { useGame } from '../hooks/useGame'
import { db } from '../db'
import { Board } from './Board'
import { HintBar } from './HintBar'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

import '../theme.css'

/** Stable empty trace, so the derived-clear below doesn't hand React a new
 *  array identity on every render. */
const EMPTY_TRACE: Trace = []

/** What `submit_path` hands back. */
type SubmitResult = {
  result: 'theme' | 'spangram' | 'hint_word' | 'duplicate' | 'too_short' | 'invalid'
  word: string
  hint_points: number
  hint_cost: number
  words_found: number
  words_total: number
  terminal: boolean
}

/**
 * The pill copy for each submission outcome. Every branch names what happened;
 * none of them lie by omission.
 *
 * The case worth pointing at is `hint_word`, which says only "Valid word" —
 * because the BAR is what carries progress, and a pill claiming "Hint earned"
 * three-quarters of the time would be wrong three-quarters of the time. The
 * capped-bar case is deliberately silent for the same reason: the full bar is
 * already on screen saying it, and per Joel's ruling players read that rather
 * than being warned.
 */
function pillFor(r: SubmitResult) {
  switch (r.result) {
    case 'spangram':
      return stickyPill('success', `Spangram! ${r.word}`)
    case 'theme':
      return stickyPill('success', `Theme word: ${r.word}`)
    case 'hint_word':
      return r.hint_points >= r.hint_cost
        ? stickyPill('success', 'Hint earned')
        : stickyPill('info', `Valid word: ${r.word}`)
    case 'duplicate':
      return stickyPill('info', `${r.word} — already counted`)
    case 'too_short':
      return stickyPill('error', 'Too short')
    default:
      return stickyPill('error', `${r.word} isn't a word`)
  }
}

/** Terminal copy, in the shared `TerminalCopy` shape. The manual stop delegates
 *  to the shared `endedCopy` rather than writing its own neutral strings. */
function buildOver(playState: string, found: number, total: number): TerminalCopy {
  if (playState === 'won') {
    return { verdict: 'Won: every word found', message: 'You found them all!', tone: 'won' }
  }
  if (playState === 'lost') {
    return {
      verdict: `Lost: out of time — ${found}/${total}`,
      message: 'Out of time',
      tone: 'lost',
    }
  }
  return endedCopy('coop')
}

/**
 * strands' play surface.
 *
 * Coop-first (the compete sibling is not registered yet). The board column
 * holds the grid, a fixed-height echo/pill slot, and the hint bar; the info
 * column carries the clue and progress.
 *
 * **Acceptance is the server's**, so a trace round-trips through
 * `strands.submit_path` rather than being scored here. That is not a passing
 * choice: the FE has no solution (it is shielded by a column grant) and no
 * dictionary, so it *cannot* classify. See the migration header for why that
 * costs nothing — the dictionary lookup forces a round trip regardless.
 */
export function PlayArea(ctx: GamePageCtx) {
  const { gameId, isTerminal, playState, status, players, session, goToClub } = ctx
  const { game, found, loading } = useGame(gameId)
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback()
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  const [rawTrace, setTrace] = useState<Trace>([])
  const [busy, setBusy] = useState(false)

  const consumed = consumedCells(found.map((f) => ({ path: f.path })))

  // A peer finding a word can consume tiles I have selected, which would leave
  // my trace running through cells I no longer own. Derived during render
  // rather than reset in an effect — not just because setState-in-effect is
  // banned here, but because it is MORE correct: a peer's find that doesn't
  // touch my trace leaves it alone, where a blanket reset would snatch away a
  // perfectly good selection every time anyone else scored.
  const trace = rawTrace.some((c) => consumed.has(coordKey(c))) ? EMPTY_TRACE : rawTrace

  const submit = useCallback(
    async (path: readonly Coord[]) => {
      setBusy(true)
      const { data, error } = await db.rpc('submit_path', {
        target_game: gameId,
        path: path as Coord[],
      })
      setBusy(false)
      if (error) {
        showLocalFeedback(stickyPill('error', error.message))
        return
      }
      const r = data as SubmitResult
      showLocalFeedback(pillFor(r))
      // Only a found word keeps its tiles; everything else clears the trace,
      // which is what stops the board filling with non-theme paths.
      setTrace([])
    },
    [gameId, showLocalFeedback],
  )

  const onTileClick = useCallback(
    (at: Coord) => {
      if (busy) return
      clearLocalFeedback()
      const next = clickTile(trace, at, consumed)
      setTrace(next.trace)
      if (next.submit) void submit(next.trace)
    },
    // `consumed` is rebuilt each render from `found`; listing it would rerun
    // this on every render for no benefit, so the found LENGTH stands in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, trace, found.length, submit, clearLocalFeedback],
  )

  const spendHint = useCallback(async () => {
    const { error } = await db.rpc('spend_hint', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', error.message))
  }, [gameId, showLocalFeedback])

  const handleEndGame = useCallback(async () => {
    if (!(await confirmAction(END_GAME_CONFIRM))) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', error.message))
  }, [gameId, confirmAction, showLocalFeedback])

  if (loading || !game) return <div className={styles.loading}>Loading…</div>

  // From the STATUS blob, not the solution: the solution is shielded for the
  // whole game, so deriving the total from it would read 1 (spangram only)
  // until the reveal. create_game seeds words_total and submit_path maintains
  // it, precisely so the count is public without the answer being.
  const wordsTotal = (status?.words_total as number | undefined) ?? 0
  const foundCount = found.length
  const over = isTerminal ? buildOver(playState, foundCount, wordsTotal) : null

  // The word being traced, echoed as text. Shares its fixed-height slot with
  // the verdict pill: you are either building a word or reading what the last
  // one did, never both, and the slot never collapses (the no-reflow rule).
  const echo = trace.length ? wordFromPath(game.board, trace) : ''

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <div className={shared.boardCol}>
        <Board
          board={game.board}
          found={found.map((f) => ({ path: f.path, isSpangram: f.result === 'spangram' }))}
          trace={trace}
          hintCoords={game.active_hint_coords}
          onTileClick={onTileClick}
          disabled={isTerminal || busy}
        />

        {/* Fixed-height slot — echo, then verdict, then the terminal pill. */}
        <div className={styles.echoSlot}>
          {over ? (
            <GenericFeedbackPill msg={terminalPill(over.tone, over.verdict)} onClose={clearLocalFeedback} />
          ) : localFeedback ? (
            <GenericFeedbackPill msg={localFeedback} onClose={clearLocalFeedback} />
          ) : (
            <span className={styles.echo}>{echo}</span>
          )}
        </div>

        <HintBar
          points={game.hint_points}
          cost={game.hint_cost}
          showing={game.active_hint_coords !== null}
          disabled={isTerminal}
          onSpend={spendHint}
        />
      </div>

      <div className={shared.infoCol}>
        {/* The clue is the PROMPT, not the answer — on screen from the start. */}
        <p className={styles.clue}>{game.clue}</p>
        <p className={shared.infoState}>
          {foundCount} / {wordsTotal} words
        </p>

        <div className={shared.infoActions}>
          {!isTerminal && <EndGameButton iconOnly className={shared.helperButton} onClick={handleEndGame} />}
          <BackToClubButton iconOnly onClick={goToClub} />
        </div>

        {over && <p className={cls(shared.infoState, styles.outcome)}>{over.message}</p>}
      </div>

      {confirmDialog}
      {/* players/session are read by the turn log + opponent strip in phase 5 */}
      <span hidden>{players.length}{session.user.id}</span>
    </div>
  )
}
