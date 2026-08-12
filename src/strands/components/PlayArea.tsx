import { failureMessage, faultMessage } from '../../common/lib/game/serverError'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconPrint, IconRestart, IconReveal } from '../../common/components/icons'
import { cls } from '../../common/lib/util/cls'
import { setupRows } from '../lib/setupSummary'
import type { GamePageCtx, GamePlayer } from '../../common/lib/games'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useFlash } from '../../common/hooks/ui/useFlash'
import { outOfRacePill, stickyPill, terminalPill } from '../../common/lib/game/localPills'
import { waitingTurnPill } from '../../common/components/game/turnCopy'
import { memberById } from '../../common/lib/game/peers'
import { nextUnplayedPuzzle } from '../../common/lib/game/nextPuzzle'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { NEW_GAME_CONFIRM, useConfirmDialog } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
import { buildGameMenu, NEW_GAME_ID } from '../../common/lib/game/gameMenu'
import { buildPrintModel } from '../pdf/model'
import { printStrandsPdf } from '../pdf/printStrandsPdf'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { consumedCells, coordKey, wordFromPath, type Coord } from '../lib/board'
import { clickTile, typeLetter, type Trace } from '../lib/trace'
import { hintShortfallText } from '../lib/hintCopy'
import { snapshotAt } from '../lib/history'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
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
  playerStates: readonly { user_id: string; hints_spent: number; solved: boolean }[],
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
    if (iWon) return { verdict: 'Won: fewest hints', message: 'You win!', tone: 'won' }
    // Three ways to lose, and the verdict names the one that happened: the
    // winner beat you on hints; they MATCHED your hints and the earlier solve
    // broke the tie (saying "fewer hints" there would be flatly false); or you
    // never solved at all. Terminal-time RLS has opened every player row, so
    // the counts are readable here.
    const mine = playerStates.find((p) => p.user_id === selfId)
    const winnerHints = playerStates.find(
      (p) => p.user_id === winners[0]?.user_id,
    )?.hints_spent
    const verdict = !mine?.solved
      ? `Lost: ${names} solved it`
      : mine.hints_spent === winnerHints
        ? `Lost: ${names} solved it sooner`
        : `Lost: ${names} used fewer hints`
    return { verdict, message: `${names} won`, tone: 'lost' }
  }
  if (playState === 'lost_compete') {
    return { verdict: 'Lost: nobody solved it', message: 'Nobody solved it', tone: 'lost' }
  }
  return endedCopy(isCompete ? 'compete' : 'coop')
}

/**
 * strands' play surface, both modes: coop shares one board, compete races
 * per-player boards over the same letters. The board column holds the grid, a
 * fixed-height echo/pill slot, and the hint bar; the info column carries the
 * clue and progress.
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
    setup, goToClub, clubHandle, goToGame, menu, brand, title,
    isMyTurn, currentTurnUserId,
  } = ctx

  const selfId = session.user.id
  const { game, players: playerStates, me, events, found, loading } = useGame(gameId, selfId)
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

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (docs/pdf.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(strandsSetup, game?.mode ?? 'coop', players),
    [strandsSetup, game, players],
  )

  const [rawTrace, setTrace] = useState<Trace>([])
  const [busy, setBusy] = useState(false)

  // The ambiguous-letter flash: a typed letter matched several cells, so they
  // ring red for a beat and the player clicks the one they meant. Local input
  // feedback owned here (nothing else can trigger it) — the same shape
  // stackdown's ambiguous-tile flash uses. The set is only ever iterated, never
  // `.has()`-tested, so holding tuples in it is fine (identity would be, too).
  const [ambiguous, flashAmbiguous] = useFlash<Coord>(1000)

  /**
   * The turn-history viewer. Exit-on-click is built into the shared hook; the
   * key path is wired below (a bare keystroke returns to live and is consumed,
   * so it doesn't also start a trace).
   */
  const viewer = useHistoryViewer<number>()

  /**
   * The rows the viewer indexes into — and they must be the SAME sequence the
   * log is displaying, because a turn is addressed by POSITION.
   *
   * That holds because the handle is only offered when the log's filter is a
   * no-op (`boardIsShown`): coop's Team view, which is every row, or my own in
   * compete. Mid-game compete RLS already scopes the rows to me, but at
   * TERMINAL it opens up — so this filters explicitly rather than trusting the
   * policy, or the indices would shift under the viewer the moment the game
   * ended.
   */
  const historyRows = useMemo(
    () => (isCompete ? events.filter((g) => g.user_id === selfId) : events),
    [events, isCompete, selfId],
  )

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
        showLocalFeedback(failureMessage(error, 'word'))
        return
      }
      const r = data as SubmitResult
      showLocalFeedback(pillFor(r))
      // Only a found word keeps its tiles: they stay lit as the in-progress
      // thread until the events refetch lands and the derived clear above
      // hands them over to their found colors — no blank flash in between.
      // (The success pill outranks the echo in BoardCol's slot, so keeping the
      // trace doesn't delay the verdict.) Everything else clears at once,
      // which is what stops the board filling with non-theme paths.
      if (r.result !== 'theme' && r.result !== 'spangram') setTrace([])
    },
    [gameId, showLocalFeedback],
  )

  const onTileClick = useCallback(
    (at: Coord) => {
      if (busy) return
      // A click while replaying returns to live rather than starting a trace on
      // a board that isn't the current one.
      if (viewer.viewing) {
        viewer.exitViewing()
        return
      }
      clearLocalFeedback()
      // A click ANSWERS the ambiguous-letter question, so the red rings go now
      // rather than sitting there for the rest of their second, pointing at
      // cells the player has already chosen between.
      flashAmbiguous([])
      const next = clickTile(trace, at, consumed)
      setTrace(next.trace)
      if (next.submit) void submit(next.trace)
    },
    // `consumed` is rebuilt each render from `found`; listing it would rerun
    // this on every render for no benefit, so the found LENGTH stands in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, trace, found.length, submit, clearLocalFeedback, flashAmbiguous, viewer],
  )

  /** Take back the last traced cell — the ⌫ button and Backspace share it.
   *  Pops the DERIVED trace, not the raw state: after a peer's find consumes my
   *  selected tiles the visible trace is already empty, and popping the raw one
   *  would resurrect its stale prefix. */
  const deleteLast = useCallback(() => {
    clearLocalFeedback()
    setTrace(trace.slice(0, -1))
  }, [trace, clearLocalFeedback])

  /** Submit the trace — the Submit button, Enter, and re-clicking the last cell
   *  all land here. */
  const submitTrace = useCallback(() => {
    if (trace.length) void submit(trace)
  }, [trace, submit])

  /**
   * The board's keyboard. strands still takes no typed WORDS — a board repeats
   * letters, so a typed *string* doesn't identify a path — but a typed LETTER
   * can, when it's resolved against the cells that could actually come next:
   *
   *   - **A–Z** resolves through `typeLetter` (lib/trace.ts). Exactly one
   *     candidate extends the trace; several ring red for a beat and wait for a
   *     click; none says so in the pill, since that's almost always a mistake
   *     rather than an ambiguity. The first letter of a word competes with all
   *     48 cells and so is usually a click; every letter after it competes only
   *     with ≤8 neighbours and so usually just works.
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
        // Replaying a past turn? A bare keystroke returns to live and is
        // CONSUMED, so the same press doesn't also start a trace.
        if (viewer.exitOnKey(e)) return
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
        if (isTerminal || busy || !isMyTurn) return
        if (e.key === 'Backspace') {
          e.preventDefault()
          deleteLast()
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          submitTrace()
          return
        }
        if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key) && game) {
          e.preventDefault()
          const r = typeLetter(trace, e.key, game.board, consumed)
          if (r.kind === 'extend') {
            // Same as a click: this keystroke resolved things, so any rings from
            // a previous one stop pointing.
            flashAmbiguous([])
            setTrace([...trace, r.at])
          } else if (r.kind === 'ambiguous') {
            // No pill here on purpose: this row IS the entry area, so a pill
            // would hide the word being built to say something the board can
            // say better. The red rings ARE the message.
            flashAmbiguous(r.candidates)
          } else {
            // Nothing matched. Unlike the ambiguous case there is nothing on the
            // board to point at, and it's nearly always a player mistake rather
            // than a choice to make — so it gets words.
            showLocalFeedback(
              stickyPill(
                'error',
                trace.length
                  ? `No “${e.key.toUpperCase()}” next to that letter`
                  : `No “${e.key.toUpperCase()}” left on the board`,
              ),
            )
          }
        }
      },
      // `consumed` is rebuilt each render from `found`; the found LENGTH stands
      // in for it, exactly as in onTileClick above.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        isTerminal, busy, isMyTurn, trace, game, found.length, deleteLast, submitTrace,
        flashAmbiguous, showLocalFeedback, clearLocalFeedback, viewer,
      ],
    ),
  )

  const spendHint = useCallback(async () => {
    // Not enough points yet. The button stays CLICKABLE in this state on
    // purpose (see HintBar): a control that does nothing and won't say why is
    // the worst of the three options, and the bar beside it shows progress
    // without ever naming the number still to go. So the click answers the
    // question it was really asking — "how much further?".
    const short = (game?.hint_cost ?? 0) - (me?.hint_points ?? 0)
    if (short > 0) {
      showLocalFeedback(stickyPill('warning', hintShortfallText(short)))
      return
    }
    const { error } = await db.rpc('spend_hint', { target_game: gameId })
    if (error) showLocalFeedback(failureMessage(error, 'hint'))
  }, [gameId, showLocalFeedback, game?.hint_cost, me?.hint_points])

  // End / Concede / Replay from the shared hook, so their confirm copy and
  // error handling match the other games'.
  const { endGame: handleEndGame, concede: handleConcede, restart: handleRestart } =
    useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded: players.find((p) => p.user_id === session.user.id)?.conceded ?? false,
    confirm: confirmAction,
    showError: showLocalFeedback,
  })

  const handleReveal = useCallback(async () => {
    const { error } = await commonDb.rpc('reveal_solution', { target_game: gameId })
    if (error) showLocalFeedback(failureMessage(error, 'reveal'))
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

    // Two reads feed the pure rule (`nextUnplayedPuzzle`, unit-tested in
    // common — the connections shape): the dated archive, and which dates this
    // club already has a game for IN THIS MODE — a coop game doesn't use up
    // the compete side, and skipping played dates is the point: a "New game"
    // that re-dealt a board the club has seen isn't new.
    const [{ data: puzzleRows, error: lookupError }, { data: statusRows }] = await Promise.all([
      db.from('puzzles').select('id, puzzle_date').order('puzzle_date', { ascending: true }),
      db.from('club_game_status').select('puzzle_date')
        .eq('club_handle', clubHandle).eq('mode', game.mode),
    ])
    if (lookupError) {
      // New game is a FAULT SURFACE (serverError.ts → faultMessage): the
      // archive lookup failing is an outage or a bug, never gameplay — and a
      // dropped connection now reads `new game: Server; try refresh` instead
      // of raw browser prose in a pill.
      showLocalFeedback(faultMessage(lookupError, 'new game'))
      return
    }
    const played = new Set(
      ((statusRows ?? []) as { puzzle_date: string }[]).map((r) => r.puzzle_date),
    )
    const next = nextUnplayedPuzzle(
      (puzzleRows ?? []) as { id: string; puzzle_date: string }[],
      played,
      game.puzzle_date ?? null,
    )
    if (!next) {
      await confirmAction({
        title: 'No unplayed puzzle',
        message:
          "You've played every puzzle after this one that we have. Run `gmake g-strands-fetch` "
          + 'to pick up new ones, or start an older date from the club page.',
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

    // The current MODE rides along — a finished compete race's "New game" is
    // the next race, not a quiet switch to coop.
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: { ...strandsSetup, puzzleId: next.id },
        player_user_ids: players.map((p) => p.user_id),
        mode: game.mode,
      })
      .single()
    if (error || !data) {
      // New game is a FAULT SURFACE (serverError.ts → faultMessage): this setup
      // already built a game once, so any failure here is a bug or an outage
      // — never a pill. Copy supplies the words when it has them.
      showLocalFeedback(faultMessage(error, 'new game'))
      return
    }
    goToGame(`strands_${game.mode}`, data.id)
  })

  // The GamePage menu. Held in a ref so the effect needn't list the per-render
  // handlers in its deps (the crosswords `actionsRef` pattern).
  // Every action the terminal row offers is ALSO a menu item — the roster's
  // rule, and the reason the ref carries all five rather than just the two
  // buildGameMenu asks for. Held in a ref so the menu effect needn't list the
  // (identity-changing) handlers in its deps.
  const actionsRef = useRef({
    endGame: handleEndGame,
    concede: handleConcede,
    restart: handleRestart,
    newGame: startNewGame,
    reveal: handleReveal,
  })
  const modeRef = useRef<'coop' | 'compete'>('coop')
  const concededRef = useRef(false)
  useEffect(() => {
    actionsRef.current = {
      endGame: handleEndGame,
      concede: handleConcede,
      restart: handleRestart,
      newGame: startNewGame,
      reveal: handleReveal,
    }
    modeRef.current = isCompete ? 'compete' : 'coop'
    concededRef.current = players.find((p) => p.user_id === selfId)?.conceded ?? false
  })
  useEffect(() => {
    // "Print board (PDF)" — a snapshot at click time (docs/pdf.md). Nothing has
    // to be re-shielded here: `events` is already whatever RLS let through
    // (own only, in compete, until terminal) and `game.solution` is null until
    // the reveal, so the model simply has nothing early to leak.
    const printModel = game
      ? buildPrintModel({
        header: {
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          // The clue leads, then the count. The clue is in the title too, but
          // that truncates to clear the date — this line doesn't, so it's the
          // one that can be relied on to carry the theme.
          summary: `“${game.clue}” · ${found.length} word${found.length === 1 ? '' : 's'}`,
          mode: game?.mode ?? 'coop',
          setup: summaryRows,
        },
        board: game.board,
        mode: game.mode,
        isTerminal,
        events,
        players,
        playerStates,
        selfId,
        solution: game.solution,
      })
      : null

    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: modeRef.current,
        isTerminal,
        conceded: concededRef.current,
        onEndGame: () => actionsRef.current.endGame(),
        onConcede: () => actionsRef.current.concede(),
        extra: [
          // Mobile-only "Game info" (reaches the off-canvas info column); empty
          // on desktop, where that column is always visible.
          {
            items: [
              { id: 'restart', icon: IconRestart, label: 'Restart', onClick: () => actionsRef.current.restart() },
              // NEW_GAME_ID is a contract with the shell, not a name: the `+`
              // shortcut finds the item by that id and inherits its disabled
              // state. strands' New game is the NEXT DAY'S puzzle.
              {
                id: NEW_GAME_ID,
                label: 'New game',
                shortcut: '+',
                disabled: startingNewGame,
                onClick: () => actionsRef.current.newGame(),
              },
              {
                id: 'reveal',
            icon: IconReveal,
            label: 'Reveal answer',
                // Terminal-only, matching common.reveal_solution's own gate,
                // and gone once it's already shown.
                disabled: !isTerminal || solutionRevealed,
                onClick: () => actionsRef.current.reveal(),
              },
            ],
          },
          ...(printModel
            ? [{ items: [{ id: 'print', icon: IconPrint, label: 'Print board (PDF)', onClick: () => printStrandsPdf(printModel) }] }]
            : []),
        ],
      }),
    )
  }, [
    menu, isTerminal, solutionRevealed, startingNewGame,
    // The print model's inputs — rebuilt whenever the printable state moves, so
    // the snapshot is current at click time.
    brand, title, game, events, players, playerStates, selfId, strandsSetup, found.length,
    summaryRows,
  ])

  if (loading || !game) return <div className={styles.loading}>Loading…</div>

  const over = isTerminal
    ? buildOver(playState, found.length, isCompete, players, selfId, playerStates)
    : null

  // COMPETE: solving (or conceding) ends YOUR race while the others keep going.
  // The board freezes and the standard "you're out" look applies, but the game
  // is not over — the winner isn't known until nobody is still racing.
  const myConceded = players.find((p) => p.user_id === selfId)?.conceded ?? false
  const isLocallyDone = !isTerminal && isCompete && ((me?.solved ?? false) || myConceded)

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId`
  // is null in a free-for-all game, so this is false there — the pill's
  // presence is fixed for the game's life, no reflow. (wordle's shape.)
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal

  /**
   * What the below-board slot shows, in priority order: the permanent terminal
   * verdict, then the locally-done pill, then the waiting-for-turn pill, then
   * your last move's result, then — on an untouched board — the THEME, quoted.
   * Waiting out-ranks own-move because a waiting player has no fresh own-move
   * result to lose, and a stale one would bury the answer to "why can't I
   * trace?" — the shared precedence chain (see turnCopy).
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
      // `isLocallyDone` folds solved and conceded together, and solving is the
      // GOOD one — compete is won by fewest hints, decided when everyone
      // finishes, so a solver may well be winning. The default 'Lost — race
      // continues' would be flatly wrong for them (wordle/waffle's identical
      // branch makes the same call).
      ? outOfRacePill(myConceded, 'Solved — waiting on the rest')
      : waiting
        ? waitingTurnPill(memberById(players, currentTurnUserId))
        : localFeedback
        ?? (events.length === 0 && trace.length === 0
        // The quotes carry it: no "Theme:" prefix, which a phone has no room
        // for and which a quoted phrase under the board doesn't need.
          ? { tone: 'neutral' as const, text: `“${game.clue}”`, variant: 'outline' as const, mode: { kind: 'sticky' as const } }
          : null)

  // At the reveal, the words nobody found. `game.solution` is null until then,
  // so this is empty for the whole game by construction rather than by a flag
  // we have to remember to check.
  const foundPaths = found.map((f) => ({
    path: f.path,
    isSpangram: f.result === 'spangram',
  }))

  // The replayed board, or null when live. A one-liner because strands' board
  // only accumulates — see lib/history.
  const snap = viewer.viewingId !== null ? snapshotAt(historyRows, viewer.viewingId) : null
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
        found={snap?.found ?? foundPaths}
        // The missed-word reveal is a TERMINAL artifact — drawing it on a
        // historic snapshot would mix the endgame's grey lines into a board
        // that hadn't reached it.
        missed={viewer.viewing ? [] : missed}
        trace={viewer.viewing ? EMPTY_TRACE : trace}
        // While replaying, a HINT turn re-rings the cells it revealed (that's why
        // the coords are logged); every other turn shows no ring at all. Live,
        // it's my own unspent hint. Either way the board draws it as rings with
        // no connecting line — a hint never gave you the order.
        hintCoords={viewer.viewing ? snap?.hintCoords ?? null : me?.active_hint_coords ?? null}
        onTileClick={onTileClick}
        // `waiting` folds in turn-order (coop only): a waiting player's board
        // is inert, and the pill below says why.
        disabled={isTerminal || isLocallyDone || busy || waiting}
        // The hint bar keeps its own gate: spend_hint is deliberately NOT
        // turn-gated (a team decision, not a move), so waiting must not dim
        // it — but replaying history must, or a click meant to exit the viewer
        // would irreversibly spend a hint.
        hintDisabled={isTerminal || isLocallyDone || busy || viewer.viewing}
        viewing={viewer.viewing}
        highlight={snap?.highlight ?? []}
        viewingDescription={snap?.description ?? ''}
        onExitViewing={viewer.exitViewing}
        // The word being traced. Shares its slot with the verdict pill — you are
        // either building a word or reading what the last one did.
        echo={trace.length ? wordFromPath(game.board, trace) : ''}
        onDelete={deleteLast}
        onSubmit={submitTrace}
        // One gate for both controls: with nothing traced there is nothing to
        // take back OR submit, and a frozen board freezes them too. They stay
        // MOUNTED and merely disabled, so the slot never reflows.
        entryDisabled={
          trace.length === 0 || isTerminal || isLocallyDone || busy || waiting
        }
        ambiguous={[...ambiguous]}
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
          events={events}
          players={players}
          selfId={session.user.id}
          setup={strandsSetup}
          setupRows={summaryRows}
          onEndGame={handleEndGame}
          onConcede={handleConcede}
          onRestart={handleRestart}
          onNewGame={startNewGame}
          startingNewGame={startingNewGame}
          onReveal={handleReveal}
          onBackToClub={goToClub}
          viewingIndex={viewer.viewingId}
          onSelectTurn={viewer.select}
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
