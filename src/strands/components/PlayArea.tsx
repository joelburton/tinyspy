// cs-unmet

import { runRpc } from '@/common/supabase/dbResult'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconHideSolution } from '@/common/icons/icons'
import { cls } from '@/common/utils/cls'
import { setupRows } from '../lib/setupSummary'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useFlash } from '@/common/board-marks/useFlash'
import { AMBIGUOUS_PICK_FLASH_MS } from '@/common/board-marks/feedbackTiming'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { useAcknowledge } from '@/common/floating-panels/useAcknowledge'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { solvedByMe, useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { buildPrintModel } from '../pdf/model'
import { printStrandsPdf } from '../pdf/printStrandsPdf'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { consumedCells, coordKey, wordFromPath, type Coord } from '../lib/board'
import { clickTile, typeLetter, type Trace } from '../lib/trace'
import { hintShortfallText } from '../lib/hintCopy'
import { historySnapshot } from '../lib/history'
import { useHistoryViewer } from '@/common/turn-log/useHistoryViewer'
import { useGame } from '../hooks/useGame'
import { db } from '../db'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import type { PuzzleAnswer, StrandsSetup } from '../lib/setup'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import styles from './PlayArea.module.css'

import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** Stable empty trace, so the derived-clear below doesn't hand React a new
 *  array identity on every render. */
const EMPTY_TRACE: Trace = []

/** What `submit_path` hands back. */
/** What `spend_hint` answers: one `ok`, the coords of the word now ringed. */
type HintAnswer = {
  result: 'hinted'
  coords: [number, number][]
  hint_points: number
}

type SubmitResult = {
  result: 'theme' | 'spangram' | 'hint_word' | 'duplicate' | 'too_short' | 'invalid'
  word: string
  hint_points: number
  hint_cost: number
  words_found: number
  terminal: boolean
}

/**
 * A move's result, in the **shared word-game format**: `WORD — body`, word
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
 * `valid word` is deliberately quiet: the BAR carries hint progress, and a
 * result claiming "hint earned" on every find would be wrong most of the
 * time. The capped-bar case says nothing extra for the same reason — per
 * Joel's ruling the full bar IS the signal.
 */
function resultFor(r: SubmitResult): FeedbackMessage {
  const line = (body: string) => `${r.word.toUpperCase()} — ${body}`
  switch (r.result) {
    case 'spangram':
      return FeedbackMessage.result('won', line('spangram'))
    case 'theme':
      return FeedbackMessage.result('won', line('theme'))
    case 'hint_word':
      return FeedbackMessage.result('won', line(r.hint_points >= r.hint_cost ? 'hint earned' : 'valid word'))
    case 'duplicate':
      return FeedbackMessage.result('warning', line('already found'))
    case 'too_short':
      return FeedbackMessage.result('warning', line('too short'))
    default:
      return FeedbackMessage.result('lost', line('not a word'))
  }
}

/** The terminal message, in the shared `TerminalMessage` shape. The manual
 *  stop delegates to the shared `gameEndedTerminalMessage` rather than
 *  writing its own neutral strings.
 *
 *  The loss line counts what was found and never says out of how many — the
 *  total is part of the answer, and a game that ended without a win hasn't
 *  earned it. */
function buildOver({
  playState,
  found,
  isCompete,
  iWon,
  winnerNames,
  iSolved,
  myHints,
  winnerHints,
}: {
  playState: string
  found: number
  isCompete: boolean
  /** My own `result.won` flag — the server's verdict, not an inference. */
  iWon: boolean
  /** Every winner's name, joined with " + ". */
  winnerNames: string
  iSolved: boolean
  myHints: number
  /** The first winner's hints, or null when there is none. */
  winnerHints: number | null
}): TerminalMessage {
  // ── Coop ──
  if (playState === 'won') {
    return { pillText: 'Won: every word found', infoColText: 'You found them all!', outcome: 'won' }
  }
  if (playState === 'lost') {
    return { pillText: `Lost: out of time — ${found} found`, infoColText: 'Out of time', outcome: 'lost' }
  }

  // ── Compete ──
  // The winner is whoever solved on the fewest hints, so the verdict names the
  // COUNT rather than the finish order — "won by 1 hint" is the actual contest,
  // and saying "first to finish" would describe a race nobody ran.
  if (playState === 'won_compete') {
    if (iWon) return { pillText: 'Won: fewest hints', infoColText: 'You win!', outcome: 'won' }
    // Three ways to lose, and the verdict names the one that happened: the
    // winner beat you on hints; they MATCHED your hints and the earlier solve
    // broke the tie (saying "fewer hints" there would be flatly false); or you
    // never solved at all. Terminal-time RLS has opened every player row, so
    // the counts are readable here.
    const pillText = !iSolved
      ? `Lost: ${winnerNames} solved it`
      : myHints === winnerHints
        ? `Lost: ${winnerNames} solved it sooner`
        : `Lost: ${winnerNames} used fewer hints`
    return { pillText, infoColText: `${winnerNames} won`, outcome: 'lost' }
  }
  if (playState === 'lost_compete') {
    return { pillText: 'Lost: nobody solved it', infoColText: 'Nobody solved it', outcome: 'lost' }
  }
  return gameEndedTerminalMessage(isCompete ? 'compete' : 'coop')
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
    gameId, isTerminal, playState, players, session,
    setup, clubHandle, goToGame, menu, brand, title,
    isMyTurn, currentTurnUserId,
  } = ctx

  const selfId = session.user.id
  const { game, players: playerStates, me, events, found, loading, failure } = useGame(gameId, selfId)
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
  // The below-board slot: a move's result, the hint bar's answers, End /
  // Concede's not-oks, and the standing conditions further down (the theme
  // clue among them).
  const localFeedbackSlot = useFeedbackSlot('local')
  const { acknowledge, acknowledgeModal } = useAcknowledge()
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
  const [ambiguous, flashAmbiguous] = useFlash<Coord>(AMBIGUOUS_PICK_FLASH_MS)

  /**
   * The turn-history viewer. Exit-on-click is built into the shared hook; the
   * key path is wired below (a bare keystroke returns to live and is consumed,
   * so it doesn't also start a trace).
   */
  const historyViewer = useHistoryViewer<number>()

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
      const res = await runRpc<SubmitResult>(db.rpc('submit_path', {
        target_game: gameId,
        path: path as Coord[],
      }))
      setBusy(false)
      // A refusal here is NOT a verdict on the word — the six verdicts are all
      // `ok`. It is a trace this board could not have produced (a fault), or a
      // move somebody else overtook: `Crosses a found word` when a teammate's
      // find lands on cells you were drawing through, `Game over`, `Not your
      // turn`. Either way the trace goes, because it no longer describes
      // anything on the board.
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        setTrace([])
        return
      } else if (res.type === 'ok') {
        // ONE branch over the six, uniquely here: `resultFor` is a total
        // switch over `result` and the outcome travels in the envelope, so
        // splitting this into six identical bodies would say less, not more.
        // What the six DO differ on is the trace, and that is the line below.
        const r = res.data
        localFeedbackSlot.show(resultFor(r))
        // Only a found word keeps its tiles: they stay lit as the in-progress
        // thread until the events refetch lands and the derived clear above
        // hands them over to their found colors — no blank flash in between.
        // (The result takes the echo's place in BoardCol's slot, so keeping
        // the trace doesn't delay the verdict.) Everything else clears at
        // once, which is what stops the board filling with non-theme paths.
        if (r.result !== 'theme' && r.result !== 'spangram') setTrace([])
        return
      } else {
        reportUnhandled('submit_path', res)
        setTrace([])
        return
      }
    },
    [gameId, localFeedbackSlot],
  )

  const onTileClick = useCallback(
    (at: Coord) => {
      if (busy) return
      // A click while replaying returns to live rather than starting a trace on
      // a board that isn't the current one.
      if (historyViewer.isViewingHistory) {
        historyViewer.exitHistory()
        return
      }
      localFeedbackSlot.dismiss() // a click is the next move, like a keystroke
      // A click ANSWERS the ambiguous-letter question, so the red rings go now
      // rather than sitting there for the rest of their second, pointing at
      // cells the player has already chosen between.
      flashAmbiguous([])
      // A click only ever changes the trace — it can no longer submit
      // (2026-08-14). Re-clicking the last tile takes it back like any other
      // selected tile; Enter and the Submit button are the two deliberate
      // ways to send a word.
      setTrace(clickTile(trace, at, consumed).trace)
    },
    // `consumed` is rebuilt each render from `found`; listing it would rerun
    // this on every render for no benefit, so the found LENGTH stands in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, trace, found.length, submit, localFeedbackSlot, flashAmbiguous, historyViewer],
  )

  /** Take back the last traced cell — the ⌫ button and Backspace share it.
   *  Pops the DERIVED trace, not the raw state: after a peer's find consumes my
   *  selected tiles the visible trace is already empty, and popping the raw one
   *  would resurrect its stale prefix. */
  const deleteLast = useCallback(() => {
    localFeedbackSlot.dismiss()
    setTrace(trace.slice(0, -1))
  }, [trace, localFeedbackSlot])

  /** Submit the trace — the Submit button and Enter both land here, and since
   *  2026-08-14 they are the only two routes: a click never submits. */
  const submitTrace = useCallback(() => {
    if (trace.length) void submit(trace)
  }, [trace, submit])

  // COMPETE: solving (or conceding) ends YOUR race while the others keep going.
  // The board freezes and the standard "you're out" look applies, but the game
  // is not over — the winner isn't known until nobody is still racing.
  const myConceded = players.find((p) => p.user_id === selfId)?.conceded ?? false
  const isLocallyDone = !isTerminal && isCompete && ((me?.solved ?? false) || myConceded)

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId`
  // is null in a free-for-all game, so this is false there — the pill's
  // presence is fixed for the game's life, no reflow. (wordle's shape.)
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal

  // ⌫ and Enter, as the two bindings the move row places. ONE gate for both:
  // with nothing traced there is nothing to take back OR submit, and a frozen
  // board freezes them too. They go DISABLED rather than hidden, so the row
  // keeps its slot and never reflows — and a disabled action leaves its key for
  // whoever else wants it, which is how the history viewer gets Backspace.
  //
  // `describe` can be read on ANY render — the key list asks every binding when
  // Help opens — so everything it names is derived above the loading guards.
  const entryOff = () => trace.length === 0 || isTerminal || isLocallyDone || busy || waiting
  const actDropLastCell = useBoundAction('act-drop-last-cell', {
    describe: () => (entryOff() ? 'disabled' : 'active'),
    run: deleteLast,
  })
  const actSubmitEntry = useBoundAction('act-submit-entry', {
    describe: () => (entryOff() ? 'disabled' : 'active'),
    run: submitTrace,
  })

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
   *     with ≤8 neighbors and so usually just works.
   *   - **Backspace** drops the last tile, so a misclick costs one key instead
   *     of restarting the word;
   *   - **Enter** submits — one of only two ways, with the Submit button;
   *   - **Tab** has nowhere to go — the board is traced with clicks and keys,
   *     so this page's ring is empty and Tab is caught rather than leaked.
   *
   * Registered globally rather than on the board element because the board
   * holds no focus — there is no text input to type into, so there would be
   * nothing for a local handler to hang off.
   */
  // Any key dismisses the last result, matching every other game — a
  // gesture-cleared message stays until the next move. A watcher that claims
  // nothing, so the same press still traces its letter.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)
  useTabRing([])

  // A letter EXTENDS the trace, if exactly one neighboring tile bears it. A
  // pattern action, so it is handed whichever letter fired it. Inert while the
  // board is not the player's to touch — and while a past turn is open, which is
  // the viewer's key rather than the board's.
  useBoundAction('act-extend-trace', {
    describe: () => (isTerminal || busy || !isMyTurn || historyViewer.isViewingHistory ? 'disabled' : 'active'),
    run: (key) => {
      if (!game || !key) return
      const r = typeLetter(trace, key, game.board, consumed)
      if (r.kind === 'extend') {
        // Same as a click: this keystroke resolved things, so any rings from a
        // previous one stop pointing.
        flashAmbiguous([])
        setTrace([...trace, r.at])
      } else if (r.kind === 'ambiguous') {
        // No message here on purpose: that row IS the entry area, so a pill
        // would hide the word being built to say something the board can say
        // better. The red rings ARE the message.
        flashAmbiguous(r.candidates)
      } else {
        // Nothing matched. Unlike the ambiguous case there is nothing on the
        // board to point at, and it's nearly always a player mistake rather than
        // a choice to make — so it gets words.
        localFeedbackSlot.show(
          FeedbackMessage.result(
            'lost',
            trace.length
              ? `No “${key.toUpperCase()}” next to that letter`
              : `No “${key.toUpperCase()}” left on the board`,
          ),
        )
      }
    },
  })

  const spendHint = useCallback(async () => {
    // Not enough points yet. The button stays CLICKABLE in this state on
    // purpose (see HintBar): a control that does nothing and won't say why is
    // the worst of the three options, and the bar beside it shows progress
    // without ever naming the number still to go. So the click answers the
    // question it was really asking — "how much further?".
    const short = (game?.hint_cost ?? 0) - (me?.hint_points ?? 0)
    if (short > 0) {
      localFeedbackSlot.show(FeedbackMessage.result('warning', hintShortfallText(short)))
      return
    }
    const res = await runRpc<HintAnswer>(db.rpc('spend_hint', { target_game: gameId }))
    // Three of its refusals are the SHARED POOL moving between the check above
    // and this call — a teammate filled the bar, spent it, or ringed a word.
    // They read orange, which is what a race looks like.
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'hinted') {
      // Nothing to say: the ringed coords land on every coop player's row and
      // the board draws them. A message would describe what is already on screen.
      return
    } else {
      reportUnhandled('spend_hint', res)
      return
    }
  }, [gameId, localFeedbackSlot, game?.hint_cost, me?.hint_points])

  // Cash a hint — the hint bar's button, and nothing else (strands' hints are
  // EARNED, so there is no key to press for one).
  //
  // Live on an UNFILLED bar on purpose. Clicking early is a question — "how many
  // more?" — and a dead button refuses to answer, so `spendHint` says the number
  // in the slot instead. A hint already on the board is the one state that does
  // gray it: the board can only ring one word legibly, and the server refuses a
  // second anyway.
  //
  // The button always reads "Hint"; what varies is the bubble, which says where
  // the economy stands. Varying the words would resize the one control the bar
  // exists to reach.
  const actHint = useBoundAction('act-hint', {
    describe: () => {
      const showing = (me?.active_hint_coords ?? null) !== null
      const points = me?.hint_points ?? 0
      const cost = game?.hint_cost ?? 0
      if (isTerminal || isLocallyDone || busy || historyViewer.isViewingHistory || showing) {
        return { state: 'disabled', tooltip: showing ? 'A hint is already showing' : undefined }
      }
      return points >= cost
        ? { state: 'active', tooltip: 'Reveal the tiles of one theme word' }
        : {
            state: 'active',
            tooltip: `Find ${cost - points} more valid word${cost - points === 1 ? '' : 's'}`,
          }
    },
    run: spendHint,
  })

  // ─── The answer shows only when I ask for it ──────────
  // Never automatically, a win included (where the board you just consumed IS
  // the answer). LOCAL and reversible (useSolutionReveal): a rival who is still
  // tracing keeps their board untouched while I look, and Hide takes the
  // unfound words back off mine. The solution reaches this client once the game
  // is terminal (strands._solution_for), so this is purely what's drawn.
  //
  // `impliedBy` is the exception: strands' theme words TILE the board exactly,
  // so solving it consumes every cell — there are no unfound words left to draw
  // and the player has traced each one. What the reveal still adds is the
  // `Words:` line, which names them as click-to-define text (a board draws
  // paths, never spellings). MY solve, not the game's verdict: strands compete
  // deliberately doesn't end on first solve, and a rival still tracing hasn't
  // earned it.
  const {
    revealed: solutionShown,
    toggle: toggleSolution,
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: solvedByMe({
      isCompete: game?.mode === 'compete',
      playState,
      mine: me?.solved ?? false,
    }),
  })

  // End / Concede / Replay from the shared hook, so their confirm copy and
  // error handling match the other games'.
  // Reveal the words — a LOCAL display toggle: it shows them to me alone, writes
  // nothing, and affects no peer. Terminal-only, since `_solution_for` withholds
  // them until the game is over for everyone, so a rival who solved early or
  // conceded can't pull them while the others are still tracing.
  const actReveal = useBoundAction('act-reveal', {
    describe: () => {
      if (impliedBySolve) return { state: 'disabled', label: 'Solution already shown' }
      if (solutionShown) return { state: 'active', label: 'Hide answer', icon: IconHideSolution }
      // Named in the inert case too: the registry's bare "Reveal" would make the
      // row change its words as the game ended, which is not what it says.
      return { state: isTerminal ? 'active' : 'disabled', label: 'Reveal answer' }
    },
    run: toggleSolution,
  })

  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: isCompete ? 'compete' : 'coop',
    myConceded: players.find((p) => p.user_id === session.user.id)?.conceded ?? false,
    // Solved and waiting for the others: conceding would forfeit a win already
    // banked, so it goes gray and you leave via Back to club.
    selfSolved: me?.solved ?? false,
    localFeedbackSlot,
    // The same board, traced again — so forget my choice about the answer.
    // `reset`, not `hide`: hiding would record an explicit "no" that outranks
    // the solve-implied default, so solving the replayed board wouldn't show
    // the words.
  })

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
   * with `useAcknowledge` rather than a question with no meaningful answer —
   * the same dead end connections has.
   *
   * New game stays a per-game handler everywhere — useStandardGameActions
   * deliberately doesn't own it, because exactly this kind of per-game choice
   * lives in it.
   */
  const startNewGame = async () => {
    if (!game) return

    // WHICH puzzle is the server's call (`strands.next_puzzle_for_club`,
    // reached below by omitting `puzzle_id`) — the same rule, in the same
    // place, that the setup dialog previews. The server's rule is per-PLAYER
    // and spans clubs, so a puzzle you played alone can't resurface in a
    // game with friends.
    //
    // The read is here for ONE thing: the dead end below. Which puzzle you get
    // is the server's call and needs no announcing — "the next one nobody here
    // has played" is the whole rule, and the registry's New-game question says
    // the part that matters (this game is shelved, not lost). The answer can go
    // stale in the same harmless way the setup dialog's line can (a peer
    // starting that very puzzle in the gap), and for the same reason nothing
    // downstream depends on it: the authority is the create below.
    const preview = await runRpc<PuzzleAnswer>(
      db.rpc('next_puzzle_for_club', { seen_by: players.map((p) => p.user_id) }),
    )
    if (preview.type === 'not-ok' && preview.dbcode === 'PN416') {
      // THE ARCHIVE IS SPENT, and this surface says it better than the server
      // can. PN416's own sentence points at the date field on the setup form —
      // right there, useless here, since this path has no form. What this
      // surface knows instead is how to get more puzzles, so it substitutes
      // rather than repeats (docs/envelopes.md → a server message may not say
      // LESS than the sentence it replaces; read the other way, the same test
      // permits a caller that says MORE). Connections' New Game does the same
      // with PN302, which is this condition in the other dated-archive game.
      await acknowledge({
        title: 'No unplayed puzzle',
        message:
          'Everyone playing has already done every puzzle we have. Run '
          + '`gmake g-strands-fetch` to pick up new ones.',
      })
      return
    } else if (preview.type === 'not-ok') {
      // Anything else: the slot carries the words, because the fault modal that
      // just fired is dismissable and this is what remains once it is gone. It
      // also has to be said HERE — the new game never happens, and a player who
      // pressed a button and saw nothing change is owed a reason.
      localFeedbackSlot.show(FeedbackMessage.notOk(preview))
      return
    } else if (preview.type === 'ok' && preview.data.result === 'found') {
      // A puzzle is waiting — carry on and create.
    } else {
      reportUnhandled('next_puzzle_for_club', preview)
      return
    }
    // The current MODE rides along — a finished compete race's "New game" is
    // the next race, not a quiet switch to coop.
    //
    // `puzzle_id` is deliberately ABSENT rather than set to the previewed id:
    // absence is how create_game is told to choose, so the puzzle we actually
    // start is decided at create time, after any peer's game has landed.
    // Carrying THIS game's setup forward with its id would re-start the very
    // puzzle we just finished.
    const carried = { ...strandsSetup }
    delete carried.puzzle_id
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup: carried,
        player_user_ids: players.map((p) => p.user_id),
        mode: game.mode,
      }),
    )
    if (res.type === 'not-ok') {
      // THE SAME ENVELOPE, READ DIFFERENTLY. On the setup form a validation is
      // an answer — fix the field and press Start again. Here there is no field
      // and no form, so whatever came back goes in the slot as it reads, over
      // the verdict, until its × is pressed. Shown even for a fault whose
      // modal has already fired centrally — the modal escalates, it does not
      // replace (docs/envelopes.md), so dismissing it must not leave the board
      // silent about why the game didn't start.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`strands_${game.mode}`, res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }
  // New game — its `+`, its menu row and its terminal button, from one binding.
  // strands' New game is the NEXT PUZZLE nobody at the table has played, which
  // the server picks; the registry's question is the right one for it, since
  // what matters to the player is that this game is shelved rather than lost.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: startNewGame,
  })

  // Print the board — a snapshot at CLICK time (docs/pdf.md). Nothing has to be
  // re-shielded here: `events` is already whatever RLS let through (own only, in
  // compete, until terminal) and `game.solution` is null until the reveal, so
  // the model simply has nothing early to leak.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      if (!game) return
      printStrandsPdf(
        buildPrintModel({
          header: {
            brand,
            gameTitle: title,
            date: new Date().toLocaleDateString(),
            // The clue leads, then the count. The clue is in the title too, but
            // that truncates to clear the date — this line doesn't, so it's the
            // one that can be relied on to carry the theme.
            summary: `“${game.clue}” · ${found.length} word${found.length === 1 ? '' : 's'}`,
            mode: game.mode,
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
        }),
      )
    },
  })

  // The FULL strands menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time. Every action the
  // terminal row offers is ALSO a row here, which is the roster's rule.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          { items: [actRestart, actNewGame, actReveal] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actRestart, actNewGame, actReveal, actPrintBoard])

  // ─── The four standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome. The compete arm reads the winners off the roster
  // and the hint counts off the now-open player rows, reduced here to the
  // few values the text needs.
  const iWon = players.find((p) => p.user_id === selfId)?.result?.won === true
  const winners = players.filter((p) => p.result?.won === true)
  const winnerNames = winners.map((p) => p.username).join(' + ')
  const iSolved = me?.solved ?? false
  const myHints = me?.hints_spent ?? 0
  const winnerHints =
    playerStates.find((p) => p.user_id === winners[0]?.user_id)?.hints_spent ?? null
  const foundCount = found.length
  const over = useMemo(
    () =>
      isTerminal
        ? buildOver({ playState, found: foundCount, isCompete, iWon, winnerNames, iSolved, myHints, winnerHints })
        : null,
    [isTerminal, playState, foundCount, isCompete, iWon, winnerNames, iSolved, myHints, winnerHints],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Out of the race while the others play on. `isLocallyDone` folds solved
  // and conceded together, and solving is the GOOD one — compete is won by
  // fewest hints, decided when everyone finishes, so a solver may well be
  // winning. The default 'Lost — race continues' would be flatly wrong for
  // them (wordle/waffle's identical branch makes the same call).
  useEffect(function showOutOfRace() {
    if (!isLocallyDone) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.outOfRace(myConceded, 'Solved — waiting on the rest'),
    )
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isLocallyDone, myConceded])

  // Whose turn it is, under turn order. On a phone the InfoCol's TurnStatusLine
  // is off-canvas, so this is the only whose-turn indicator beside the frozen
  // board.
  const turnHolder = players.find((p) => p.user_id === currentTurnUserId)
  const holderName = turnHolder?.username
  const holderColor = turnHolder?.color
  useEffect(function showWaiting() {
    if (!waiting) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.waiting(
        holderName === undefined ? undefined : { username: holderName, color: holderColor ?? '' },
      ),
    )
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, waiting, holderName, holderColor])

  // The THEME, quoted, on an untouched board — what an empty slot says before
  // anything has happened. The clue also sits in the info column, but that
  // column is off-canvas on a phone: without this a mobile player would open
  // the game with no idea what they were looking for until they thought to
  // open the sheet. It leaves the moment a trace begins (the echo needs the
  // row) and comes back if that trace is taken back or rejected, until the
  // first find — a `prompt`, which everything else outranks, so a rejection
  // shows over it and dismissing that uncovers it again. The quotes carry
  // it: no "Theme:" prefix, which a phone has no room for and which a quoted
  // phrase under the board doesn't need.
  const untouched = events.length === 0 && trace.length === 0
  const clue = game?.clue
  useEffect(function showThemeClue() {
    if (!untouched || clue === undefined) return
    const id = localFeedbackSlot.show(FeedbackMessage.prompt(`“${clue}”`))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, untouched, clue])

  if (loading) return <div className={styles.loading}>Loading…</div>
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "Game not found." about a dead connection is a confident wrong answer —
  // this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) return <div className={styles.empty}>Game not found.</div>

  const foundPaths = found.map((f) => ({
    path: f.path,
    isSpangram: f.result === 'spangram',
  }))

  // The replayed board, or null when live. A one-liner because strands' board
  // only accumulates — see lib/history.
  const historySnap = historyViewer.historyId !== null ? historySnapshot(historyRows, historyViewer.historyId) : null
  // The words nobody found, drawn as gray lines — ONLY while this viewer is
  // asking for them. `game.solution` arrives at terminal (is_terminal lifts the
  // shield), so mid-game this is empty by construction; after that it's empty
  // because the reveal is off, which is what makes Hide return the board to
  // exactly how the players left it.
  // The theme words as TEXT, spangram first — the info column's half of the
  // reveal. Same gate as the board's gray lines: one toggle, one secret.
  const solutionWords =
    solutionShown && game.solution
      ? [game.solution.spangram.word, ...game.solution.themeWords.map((w) => w.word)]
      : null

  const foundWords = new Set(found.map((f) => f.word))
  const missed =
    solutionShown && game.solution
      ? [game.solution.spangram, ...game.solution.themeWords]
        .filter((w) => !foundWords.has(w.word))
        .map((w) => w.coords)
      : []

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        board={game.board}
        found={historySnap?.found ?? foundPaths}
        // The missed-word reveal is a TERMINAL artifact — drawing it on a
        // historic snapshot would mix the endgame's gray lines into a board
        // that hadn't reached it.
        missed={historyViewer.isViewingHistory ? [] : missed}
        trace={historyViewer.isViewingHistory ? EMPTY_TRACE : trace}
        // While replaying, a HINT turn re-rings the cells it revealed (that's why
        // the coords are logged); every other turn shows no ring at all. Live,
        // it's my own unspent hint. Either way the board draws it as rings with
        // no connecting line — a hint never gave you the order.
        hintCoords={historyViewer.isViewingHistory ? historySnap?.hintCoords ?? null : me?.active_hint_coords ?? null}
        onTileClick={onTileClick}
        // `waiting` folds in turn-order (coop only): a waiting player's board
        // is inert, and the slot below says why.
        disabled={isTerminal || isLocallyDone || busy || waiting}
        // The hint bar keeps its own gate: spend_hint is deliberately NOT
        // turn-gated (a team decision, not a move), so waiting must not dim
        // it — but replaying history must, or a click meant to exit the viewer
        // would irreversibly spend a hint.
        historyLitTiles={historySnap?.historyLitTiles ?? []}
        historyLabel={historySnap?.historyLabel ?? null}
        onExitHistory={historyViewer.exitHistory}
        // The word being traced. Shares its slot with the feedback pill — you
        // are either building a word or reading what the last one did.
        echo={trace.length ? wordFromPath(game.board, trace) : ''}
        actDelete={actDropLastCell}
        actSubmit={actSubmitEntry}
        ambiguous={[...ambiguous]}
        localFeedbackSlot={localFeedbackSlot}
        hintPoints={me?.hint_points ?? 0}
        hintCost={game.hint_cost}
        hintShowing={(me?.active_hint_coords ?? null) !== null}
        actHint={actHint}
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
          solutionWords={solutionWords}
          currentTurnUserId={ctx.currentTurnUserId ?? null}
          clue={game.clue}
          wordsFound={found.length}
          hintsSpent={me?.hints_spent ?? 0}
          events={events}
          players={players}
          selfId={session.user.id}
          setup={strandsSetup}
          setupRows={summaryRows}
          actEndGame={actEndGame}
          actConcede={actConcede}
          actRestart={actRestart}
          actNewGame={actNewGame}
          actReveal={actReveal}
          actBackToClub={menu.actBackToClub}
          historyId={historyViewer.historyId}
          onShowHistory={historyViewer.showHistory}
        />
      </InfoSheet>

      {acknowledgeModal}
      {celebration.show && (
        <CelebrationBlockingModal
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
