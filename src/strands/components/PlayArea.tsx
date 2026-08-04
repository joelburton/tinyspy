import { useCallback, useEffect, useRef, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GamePageCtx, GamePlayer } from '../../common/lib/games'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { outOfRacePill, stickyPill, terminalPill } from '../../common/lib/game/localPills'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { NEW_GAME_CONFIRM, useConfirmDialog } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { consumedCells, coordKey, wordFromPath, type Coord } from '../lib/board'
import { clickTile, type Trace } from '../lib/trace'
import { useGame } from '../hooks/useGame'
import { db } from '../db'
import { db as commonDb } from '../../common/db'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import type { StrandsSetup } from '../lib/setup'
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
  terminal: boolean
}

/**
 * Own-move pill copy, in the **shared word-game format**: `WORD — body`, word
 * first and in caps. That is `useWordSubmit`'s `line()` convention, which
 * spellingbee / wordwheel / boggle all speak — strands can't use that hook
 * (its acceptance is server-side, not a local list lookup), so it matches the
 * OUTPUT instead of inventing a second dialect.
 *
 * Two bodies are word-for-word the shared ones, which is the point: a rejected
 * word says `too short` and `not a word` here exactly as it does in boggle, so
 * a player moving between the games isn't relearning the same three messages.
 *
 * Leading with the word also keeps the pill short on a phone — `MEDICINE —
 * theme` fits where `Theme word: MEDICINE` starts to run out of room.
 *
 * `valid word` is deliberately quiet: the BAR carries hint progress, and a pill
 * claiming "hint earned" on every find would be wrong most of the time. The
 * capped-bar case says nothing extra for the same reason — per Joel's ruling
 * the full bar IS the signal.
 */
function pillFor(r: SubmitResult) {
  const line = (body: string) => `${r.word.toUpperCase()} — ${body}`
  switch (r.result) {
    case 'spangram':
      return stickyPill('success', line('spangram'))
    case 'theme':
      return stickyPill('success', line('theme'))
    case 'hint_word':
      return stickyPill('success', line(r.hint_points >= r.hint_cost ? 'hint earned' : 'valid word'))
    case 'duplicate':
      return stickyPill('warning', line('already found'))
    case 'too_short':
      return stickyPill('warning', line('too short'))
    default:
      return stickyPill('error', line('not a word'))
  }
}

/** Terminal copy, in the shared `TerminalCopy` shape. The manual stop delegates
 *  to the shared `endedCopy` rather than writing its own neutral strings.
 *
 *  The loss line counts what was found and never says out of how many — the
 *  total is part of the answer, and a game that ended without a win hasn't
 *  earned it. */
function buildOver(
  playState: string,
  found: number,
  isCompete: boolean,
  players: GamePlayer[],
  selfId: string,
): TerminalCopy {
  // ── Coop ──
  if (playState === 'won') {
    return { verdict: 'Won: every word found', message: 'You found them all!', tone: 'won' }
  }
  if (playState === 'lost') {
    return { verdict: `Lost: out of time — ${found} found`, message: 'Out of time', tone: 'lost' }
  }

  // ── Compete ──
  // The winner is whoever solved on the fewest hints, so the verdict names the
  // COUNT rather than the finish order — "won by 1 hint" is the actual contest,
  // and saying "first to finish" would describe a race nobody ran.
  if (playState === 'won_compete') {
    const iWon = players.find((p) => p.user_id === selfId)?.result?.won === true
    const winners = players.filter((p) => p.result?.won === true)
    const names = winners.map((p) => p.username).join(' + ')
    return iWon
      ? { verdict: 'Won: fewest hints', message: 'You win!', tone: 'won' }
      : { verdict: `Lost: ${names} used fewer hints`, message: `${names} won`, tone: 'lost' }
  }
  if (playState === 'lost_compete') {
    return { verdict: 'Lost: nobody solved it', message: 'Nobody solved it', tone: 'lost' }
  }
  return endedCopy(isCompete ? 'compete' : 'coop')
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
  const {
    gameId, isTerminal, playState, solutionRevealed, players, session,
    setup, goToClub, clubHandle, goToGame, menu,
  } = ctx

  const selfId = session.user.id
  const { game, players: playerStates, me, guesses, found, loading } = useGame(gameId, selfId)
  // Mode comes off the loaded game row (denormalized from strands.games.mode),
  // which is how every sibling-pair game branches.
  const isCompete = game?.mode === 'compete'

  /**
   * Confetti at the MOMENT a win lands — coop clearing the board, or being the
   * compete player who took it. `useCelebration` only fires on the false→true
   * TRANSITION, so opening an already-won game stays quiet: it's a celebration,
   * not a status.
   *
   * The compete arm reads `game_players.result`, which `_maybe_finish_compete`
   * writes at the same moment it flips play_state — so by the time this is true
   * the verdict is settled, not inferred. That ordering matters: waffle's
   * loading-race taught the roster not to celebrate off data that isn't right
   * on the first render, and a per-player `won` flag that arrives WITH the
   * terminal state can't be half-there.
   *
   * A compete LOSER sees nothing, deliberately — a race has someone watching.
   */
  const iWonCompete =
    playState === 'won_compete'
    && players.find((p) => p.user_id === session.user.id)?.result?.won === true
  const celebration = useCelebration(playState === 'won' || iWonCompete)
  // `locked` at terminal, like every other game: the permanent verdict owns the
  // slot then, so a stale own-move pill must not be able to replace it.
  const { localFeedback, showLocalFeedback, clearLocalFeedback } =
    useLocalFeedback({ locked: isTerminal })
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()
  const infoSheet = useInfoSheet()

  const strandsSetup = setup as unknown as StrandsSetup

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
      showLocalFeedback(pillFor(data as SubmitResult))
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

  /**
   * The board's keyboard, such as it is. strands takes no typed WORDS — a board
   * repeats letters, so a typed string doesn't identify a path — but the three
   * keys that act on a trace rather than compose one are worth having:
   *
   *   - **Backspace** drops the last tile, so a misclick costs one key instead
   *     of restarting the word;
   *   - **Enter** submits, the keyboard twin of re-clicking the last tile;
   *   - **Tab** is swallowed. The tiles already left the tab order
   *     (`tabIndex={-1}`), so this is belt and braces: nothing on the board
   *     should shift focus mid-trace.
   *
   * Registered globally rather than on the board element because the board
   * holds no focus — there is no text input to type into, so there would be
   * nothing for a local handler to hang off.
   */
  useGlobalKeyHandler(
    useCallback(
      (e: KeyboardEvent) => {
        // ANY key dismisses the last verdict, matching every other game: the
        // own-move pill is `sticky`, which by convention means "stays until the
        // next move dismisses it — a keystroke or a tile click routed through
        // clearLocalFeedback" (common/lib/game/localPills). Done first, and
        // outside the terminal/busy gate, so the pill clears even for keys that
        // then do nothing.
        clearLocalFeedback()
        if (e.key === 'Tab') {
          e.preventDefault()
          return
        }
        if (isTerminal || busy) return
        if (e.key === 'Backspace') {
          e.preventDefault()
          setTrace((t) => t.slice(0, -1))
          return
        }
        if (e.key === 'Enter' && trace.length) {
          e.preventDefault()
          void submit(trace)
        }
      },
      [isTerminal, busy, trace, submit, clearLocalFeedback],
    ),
  )

  const spendHint = useCallback(async () => {
    const { error } = await db.rpc('spend_hint', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', error.message))
  }, [gameId, showLocalFeedback])

  // End / Concede / Replay from the shared hook, so their confirm copy and
  // error handling match the other games'.
  const { endGame: handleEndGame, concede: handleConcede, restart: handleRestart } =
    useStandardGameActions({
    // The hook's client type also lists `concede`, which strands has no RPC
    // for (coop-only). Cast rather than widen the shared type: the hook never
    // CALLS concede in coop, and every other coop-only game would need the
    // same widening for nothing.
    db: db as unknown as Parameters<typeof useStandardGameActions>[0]['db'],
    gameId,
    isTerminal,
    myConceded: players.find((p) => p.user_id === session.user.id)?.conceded ?? false,
    confirm: confirmAction,
    showError: (m) => showLocalFeedback(stickyPill('error', m)),
  })

  const handleReveal = useCallback(async () => {
    const { error } = await commonDb.rpc('reveal_solution', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', error.message))
  }, [gameId, showLocalFeedback])

  /**
   * New game = **the NEXT DAY'S puzzle**, not another run at this one.
   *
   * Replaying the same board is what Restart is for; a "New game" that handed
   * back the puzzle you just solved would leave the club with no way to move
   * through the archive without going back to the setup dialog every time. So
   * this looks up the earliest puzzle dated after the current one and starts
   * that, carrying the club's knobs (band / hint cost / word length / timer /
   * pacing) forward unchanged — the setup they already chose.
   *
   * At the end of the archive there is nothing to advance to, and this says so
   * as a one-button NOTICE rather than a question with no meaningful answer
   * (the `cancelLabel: null` shape connections uses for the same situation).
   *
   * New game stays a per-game handler everywhere — useStandardGameActions
   * deliberately doesn't own it, because exactly this kind of per-game choice
   * lives in it.
   */
  const [startNewGame, startingNewGame] = useSingleFlight(async () => {
    if (!game) return

    const { data: next, error: lookupError } = await db
      .from('puzzles')
      .select('id, puzzle_date')
      .gt('puzzle_date', game.puzzle_date ?? '')
      .order('puzzle_date', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (lookupError) {
      showLocalFeedback(stickyPill('error', lookupError.message))
      return
    }
    if (!next) {
      await confirmAction({
        title: 'No newer puzzle',
        message:
          'This is the most recent puzzle we have. Run `gmake g-strands-fetch` to pick up new '
          + 'ones, or start an older date from the club page.',
        confirmLabel: 'OK',
        cancelLabel: null,
      })
      return
    }

    if (
      !(await confirmAction({
        ...NEW_GAME_CONFIRM,
        // Name the date: "start a new game" is vague when the whole point is
        // WHICH puzzle you're about to get.
        title: `Play the ${next.puzzle_date} puzzle?`,
      }))
    ) return

    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: { ...strandsSetup, puzzleId: next.id },
        player_user_ids: players.map((p) => p.user_id),
        mode: 'coop',
      })
      .single()
    if (error || !data) {
      showLocalFeedback(stickyPill('error', error?.message ?? 'could not start a new game'))
      return
    }
    goToGame('strands_coop', data.id)
  })

  // The GamePage menu. Held in a ref so the effect needn't list the per-render
  // handlers in its deps (the crosswords `actionsRef` pattern).
  const actionsRef = useRef({ endGame: handleEndGame, concede: handleConcede })
  const modeRef = useRef<'coop' | 'compete'>('coop')
  const concededRef = useRef(false)
  useEffect(() => {
    actionsRef.current = { endGame: handleEndGame, concede: handleConcede }
    modeRef.current = isCompete ? 'compete' : 'coop'
    concededRef.current = players.find((p) => p.user_id === selfId)?.conceded ?? false
  })
  useEffect(() => {
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: modeRef.current,
        isTerminal,
        conceded: concededRef.current,
        onEndGame: () => actionsRef.current.endGame(),
        onConcede: () => actionsRef.current.concede(),
        extra: infoSheet.menuSections,
      }),
    )
  }, [menu, isTerminal, infoSheet.menuSections])

  if (loading || !game) return <div className={styles.loading}>Loading…</div>

  const over = isTerminal ? buildOver(playState, found.length, isCompete, players, selfId) : null

  // COMPETE: solving (or conceding) ends YOUR race while the others keep going.
  // The board freezes and the standard "you're out" look applies, but the game
  // is not over — the winner isn't known until nobody is still racing.
  const myConceded = players.find((p) => p.user_id === selfId)?.conceded ?? false
  const isLocallyDone = !isTerminal && isCompete && ((me?.solved ?? false) || myConceded)

  /**
   * What the below-board slot shows, in priority order: the permanent terminal
   * verdict, then your last move's result, then — on an untouched board — the
   * THEME, quoted.
   *
   * The clue also sits in the info column, but that column is off-canvas on a
   * phone: without this a mobile player would open the game with no idea what
   * they were looking for until they thought to open the sheet. Showing it here
   * puts the prompt where the eyes already are.
   *
   * DERIVED, not shown by an effect on mount. It simply is what an empty slot
   * displays while nothing has happened yet, so the first submission replaces
   * it and it never comes back — no timer, no "have I shown this?" flag, and no
   * setState-in-effect (which this repo bans outright).
   */
  const pill = over
    ? terminalPill(over.tone, over.verdict)
    : isLocallyDone
      ? outOfRacePill(myConceded)
      : localFeedback
        ?? (guesses.length === 0 && trace.length === 0
        // The quotes carry it: no "Theme:" prefix, which a phone has no room
        // for and which a quoted phrase under the board doesn't need.
          ? { tone: 'neutral' as const, text: `“${game.clue}”`, variant: 'outline' as const, dismiss: { kind: 'sticky' as const } }
          : null)

  // At the reveal, the words nobody found. `game.solution` is null until then,
  // so this is empty for the whole game by construction rather than by a flag
  // we have to remember to check.
  const foundPaths = found.map((f) => ({
    path: f.path,
    isSpangram: f.result === 'spangram',
  }))
  const foundWords = new Set(found.map((f) => f.word))
  const missed = game.solution
    ? [game.solution.spangram, ...game.solution.themeWords]
      .filter((w) => !foundWords.has(w.word))
      .map((w) => w.coords)
    : []

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        board={game.board}
        found={foundPaths}
        missed={missed}
        trace={trace}
        hintCoords={me?.active_hint_coords ?? null}
        onTileClick={onTileClick}
        disabled={isTerminal || isLocallyDone || busy}
        // The word being traced. Shares its slot with the verdict pill — you are
        // either building a word or reading what the last one did.
        echo={trace.length ? wordFromPath(game.board, trace) : ''}
        pill={pill}
        onDismissPill={clearLocalFeedback}
        hintPoints={me?.hint_points ?? 0}
        hintCost={game.hint_cost}
        hintShowing={(me?.active_hint_coords ?? null) !== null}
        onSpendHint={spendHint}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          isCompete={isCompete}
          isLocallyDone={isLocallyDone}
          iSolved={me?.solved ?? false}
          hintsByUser={new Map(playerStates.map((p) => [p.user_id, p.hints_spent]))}
          solvedIds={new Set(playerStates.filter((p) => p.solved).map((p) => p.user_id))}
          isTerminal={isTerminal}
          over={over}
          solutionRevealed={solutionRevealed}
          currentTurnUserId={ctx.currentTurnUserId ?? null}
          clue={game.clue}
          wordsFound={found.length}
          hintsSpent={me?.hints_spent ?? 0}
          guesses={guesses}
          players={players}
          selfId={session.user.id}
          setup={strandsSetup}
          onEndGame={handleEndGame}
          onConcede={handleConcede}
          onRestart={handleRestart}
          onNewGame={startNewGame}
          startingNewGame={startingNewGame}
          onReveal={handleReveal}
          onBackToClub={goToClub}
        />
      </InfoSheet>

      {confirmDialog}
      {celebration.show && (
        <CelebrationDialog
          title={isCompete ? 'You win!' : 'You found them all!'}
          body={
            isCompete
              ? `Solved on ${me?.hints_spent ?? 0} hint${(me?.hints_spent ?? 0) === 1 ? '' : 's'}.`
              : `Every word on the board — ${found.length} of them.`
          }
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
