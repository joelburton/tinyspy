import { useCallback, useEffect, useRef } from 'react'
import type { GamePageCtx, GenericFeedbackMsg, GenericFeedbackTone } from '../../common/lib/games'
import { cls } from '../../common/lib/util/cls'
import { terminalPill, outOfRacePill } from '../../common/lib/game/localPills'
import { colorVarFor } from '../../common/lib/color/memberColor'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/feedback/useDismissLocalFeedbackOnKey'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { turnSnapshot } from '../lib/history'
import { solvedWords } from '../lib/waffle'
import type { WaffleSetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/** Build waffle's own-action local pill: outline + TIMED (auto-clears after a
 *  beat — waffle's only own-move feedback is a rejected swap / failed End, a
 *  transient nudge). A pure msg-builder over the shared `useLocalFeedback`. */
const ownAction = (tone: GenericFeedbackTone, text: string): GenericFeedbackMsg => ({
  tone,
  text,
  variant: 'outline',
  dismiss: { kind: 'timed' },
})

/**
 * waffle's play surface, shared by the coop and compete manifests, on the shared
 * two-column scaffold. PlayArea is the **coordinator**: it holds the game data
 * (`useGame`), the server mutations (swap / end / concede RPCs), and the cross-column
 * coordination state (the turn-history viewer, the below-board feedback), and wires
 * two presentational columns:
 *
 *   - **`<BoardCol>`** — the square Board + the below-board feedback slot. Takes
 *     the board to render (live OR a historical snapshot) + `readOnly`; emits a swap
 *     up (`onSwap`) and "back to live" (`onExitViewing`).
 *   - **`<InfoCol>`** — the swap-state readout, OpponentStrip, action row, setup
 *     disclosure, terminal answer reveal, and the coop swap log. Named callbacks up.
 *
 * Mode is read from `game.mode`. Moves go through `waffle.submit_swap`; board/colors
 * update via the realtime refetch in `useGame` (Pattern A) — a live swap needs no
 * optimistic local state. Turn-history (coop only) replays past boards, coloring them
 * on the FE (see lib/history + lib/colors). See docs/playarea-decomposition-plan.md.
 *
 * **Feedback split** (docs/deferred.md → Feedback channels): the player's OWN errors
 * (a rejected swap, a failed End) flash LOCALLY in BoardCol's below-board slot; the
 * header pill carries PEER/group news — in compete, when an opponent solves or runs
 * out of swaps (coop needs none: the swap log already shows every move).
 */
export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  timer,
  setup,
  status,
  globalFeedback,
  goToClub,
  menu,
}: GamePageCtx) {
  const { game, players: playerStates, swaps, loading } = useGame(gameId)

  // Own-action feedback (LOCAL): a rejected swap or a failed End flashes in the
  // below-board slot — never the header pill (that's the peer/group channel).
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })
  // Any key is the player's next move → dismiss the own-move pill, even though
  // waffle has no keyboard entry (swaps are clicks). No-op at terminal (locked).
  useDismissLocalFeedbackOnKey(clearLocalFeedback)

  // ─── Turn-history viewer (coop only) ───────────────────
  // The shared coordination state: which swap-log row (by POSITION in the coop log)
  // is open on the board, or null = live. When set, PlayArea feeds BoardCol that
  // swap's historical snapshot + readOnly; BoardCol shows the yellow frame + banner
  // and freezes input. Only coop can reach it (compete renders no swap log). waffle
  // has no keyboard play, so `exitOnKey` is its ONLY key handler — a bare key exits.
  const { viewingId: viewingIndex, viewing, select: setViewingIndex, exitViewing, exitOnKey } =
    useHistoryViewer()
  useGlobalKeyHandler(exitOnKey)

  // ─── Compete peer news (header pill) ───────────────────
  // When an opponent's public state ticks — they solved the puzzle, or they ran out
  // of swaps — narrate it in the header (tension; compete has no swap log to show
  // it). The count/word stays hidden; we only surface the milestone. The ref seeds
  // silently on first load so history isn't replayed. Coop surfaces nothing here.
  const seenOpponentRef = useRef<Map<string, { solved: boolean; out: boolean }>>(new Map())
  useEffect(
    function announceOpponentMilestones() {
      if (!game || game.mode !== 'compete') return
      for (const ps of playerStates) {
        if (ps.user_id === session.user.id) continue
        const out = !ps.solved && ps.swaps_used >= game.max_swaps
        const prev = seenOpponentRef.current.get(ps.user_id)
        seenOpponentRef.current.set(ps.user_id, { solved: ps.solved, out })
        if (prev === undefined) continue // first sighting — seed, don't announce
        const member = players.find((m) => m.user_id === ps.user_id)
        const name = member?.username ?? 'Someone'
        const dot = colorVarFor(member?.color)
        if (ps.solved && !prev.solved) {
          // A solve is a GOOD outcome → success (green) — the same green a found word
          // reads as in both modes (docs/design-decisions.md → Tone follows the
          // event). Adverse to me in compete, but the tone names the event, not my stake.
          globalFeedback.show({
            tone: 'success',
            variant: 'outline',
            dot,
            text: `${name} solved it`,
            dismiss: { kind: 'timed', ms: 3000 },
          })
        } else if (out && !prev.out) {
          // Out of swaps is a milestone — important, neither clearly good nor bad → warning.
          globalFeedback.show({
            tone: 'warning',
            variant: 'outline',
            dot,
            text: `${name} is out of swaps`,
            dismiss: { kind: 'timed', ms: 3000 },
          })
        }
      }
    },
    [playerStates, game, players, session.user.id, globalFeedback],
  )

  const handleSwap = useCallback(
    async (a: number, b: number) => {
      const { error } = await db.rpc('submit_swap', { target_game: gameId, pos_a: a, pos_b: b })
      // Own-action error → the local below-board flash. Success: the swap mutated
      // waffle.players → realtime refetch re-renders the board + colors.
      if (error) showLocalFeedback(ownAction('error', error.message))
    },
    [gameId, showLocalFeedback],
  )

  // Manual end — the friends agreeing they're done (neutral terminal, nobody
  // wins/loses). Confirmed; it's irreversible.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(ownAction('error', `End game failed: ${error.message}`))
  }, [gameId, isTerminal, showLocalFeedback])

  // Concede — drop out of a compete race (a real loss; the rest keep racing).
  // Distinct from End: waffle.concede flips the shared conceded flag then re-runs the
  // compete terminal check (which now counts me as done). Confirmed; irreversible.
  const handleConcede = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm('Concede the game? You drop out and the rest keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback(ownAction('error', `Concede failed: ${error.message}`))
  }, [gameId, isTerminal, showLocalFeedback])

  // Replay board — restart THIS board (same scramble/setup) from scratch for
  // everyone: clears the turn log + all progress and un-terminals the game.
  // Available mid-game or after game-over; confirmed since it wipes progress
  // for the whole group. The board/log/terminal reset arrives via the realtime
  // refetch (useGame + useCommonGame); we just leave any open history view +
  // clear the local pill.
  const handleReplay = useCallback(async () => {
    if (
      !window.confirm(
        "Replay board? This clears everyone's progress and the turn log, and restarts from the original scramble.",
      )
    )
      return
    const { error } = await db.rpc('replay_board', { target_game: gameId })
    if (error) {
      showLocalFeedback(ownAction('error', `Replay failed: ${error.message}`))
      return
    }
    exitViewing()
    clearLocalFeedback()
  }, [gameId, showLocalFeedback, clearLocalFeedback, exitViewing])

  // Reveal answer — give up: fill every board with the solution and END the game.
  // Server-side `reveal_answer` overwrites `waffle.players.board` with the solution
  // (so the board the players are looking at literally becomes the answer, all green)
  // then ends the game as a neutral give-up (nobody wins). Confirmed since it ends the
  // game for the whole group + wipes progress. The answer board + terminal state arrive
  // via the realtime refetch; we just leave any open history view + clear the pill.
  const handleRevealAnswer = useCallback(async () => {
    if (!window.confirm('Reveal the answer? This ends the game and fills the board with the solution.'))
      return
    const { error } = await db.rpc('reveal_answer', { target_game: gameId })
    if (error) {
      showLocalFeedback(ownAction('error', `Reveal failed: ${error.message}`))
      return
    }
    exitViewing()
    clearLocalFeedback()
  }, [gameId, showLocalFeedback, clearLocalFeedback, exitViewing])

  // Game menu: waffle now owns its FULL menu (Help + its own items + End/Concede +
  // Back to club) via `buildGameMenu`. Its two own items are "Replay board" (both
  // modes, any state) + "Reveal answer". Reveal ENDS the game, so it's only offered
  // while a game is in progress and the caller actually holds the solution — disabled
  // at terminal (already over) and whenever the solution isn't on the client (compete
  // *during play*; the shield only lifts post-terminal). In practice that's
  // coop-in-progress. No leak: you can't reveal what wasn't sent.
  //
  // mode/myConceded are derived up here (not the below-guard copies) so the effect can
  // pick coop End vs compete Concede. Every handler in the deps is a stable useCallback
  // (or a one-shot transition value like `isTerminal`), so this effect only re-runs on
  // real menu-affecting changes — never every render — keeping the setState loop-free.
  const solutionKnown = game?.solution != null
  const menuMode: 'coop' | 'compete' = game?.mode === 'compete' ? 'compete' : 'coop'
  const menuConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  useEffect(() => {
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: menuMode,
        isTerminal,
        conceded: menuConceded,
        onEndGame: () => void handleEndGame(),
        onConcede: () => void handleConcede(),
        extra: [
          {
            items: [
              { id: 'replay', label: 'Replay board', onClick: () => void handleReplay() },
              {
                id: 'reveal',
                label: 'Reveal answer',
                disabled: isTerminal || !solutionKnown,
                onClick: () => void handleRevealAnswer(),
              },
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [
    menu,
    menuMode,
    menuConceded,
    handleEndGame,
    handleConcede,
    handleReplay,
    handleRevealAnswer,
    isTerminal,
    solutionKnown,
  ])

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const waffleSetup = setup as WaffleSetup
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isPlayer = self !== undefined
  const isCompete = game.mode === 'compete'

  // Concede lives on the COMMON roster (ctx `players` = GamePlayer[]), not on
  // waffle.players. `myConceded` drives the "You conceded" copy; `concededIds` marks
  // a conceded opponent 'out' in the strip mid-game.
  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  // Turn viewer (coop only): the historical board for the swap being viewed, or null
  // when live. Replayed from the scramble + swap log, colored on the FE (coop exposes
  // the solution). Works at terminal too (reviewing the finished solve).
  const snap =
    viewingIndex !== null ? turnSnapshot(game.scramble, game.solution, swaps, viewingIndex) : null

  // The grid shows the caller's own board + live colors (including at game-over) — OR,
  // while viewing, the historical snapshot. After "Reveal answer" the caller's own
  // board IS the solution (the RPC overwrote it), so this needs no special case — it
  // renders the all-green answer for free. The info-column word list is derived below.
  const board = snap ? snap.board : (self?.board ?? game.scramble)
  const colors = snap ? snap.colors : (self?.colors ?? null)

  // The answer reveal (info column) reads the caller's OWN live board + colors —
  // never the history snapshot, and never the shielded solution. A word all of
  // whose cells are green is already on the caller's screen, so revealing it leaks
  // nothing; unsolved words stay hidden (em dashes). A non-player watcher (no
  // colors) sees all-hidden.
  const answerWords = solvedWords(self?.board ?? game.scramble, self?.colors ?? null)

  const swapsUsed = self?.swaps_used ?? 0
  const remaining = Math.max(0, game.max_swaps - swapsUsed)

  const selfWon = (status?.winner as string | undefined) === session.user.id
  const over = isTerminal
    ? buildOver({ mode: game.mode, playState, timerExpired: timer.expired, selfWon })
    : null

  // LOCALLY TERMINAL (compete only): the game continues but *I* can't act — I've
  // solved my board (waiting), run out of swaps, OR conceded (a real loss, the rest
  // race on). Shown with the terminal LOOK, not a quietly swapped help line.
  const selfDone = isPlayer && (self?.solved === true || remaining === 0 || myConceded)

  // The board is inert whenever I can't act OR I'm peeking at history.
  const readOnly = isTerminal || !isPlayer || selfDone || viewing

  // The below-board local pill. Precedence: the permanent terminal verdict → the
  // sticky locally-terminal "waiting" pill → the transient own-move error. (While
  // viewing, BoardCol's yellow banner covers this region with the swap description.)
  const localPill: GenericFeedbackMsg | null = over
    ? terminalPill(over.tone, over.verdict)
    : selfDone
      ? outOfRacePill(
          myConceded,
          self?.solved ? 'Solved — waiting on the rest.' : 'Out of swaps — waiting on the rest.',
        )
      : localFeedback

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <BoardCol
        board={board}
        colors={colors}
        readOnly={readOnly}
        highlight={snap?.highlight}
        viewingDescription={snap ? snap.description : null}
        onExitViewing={exitViewing}
        onSwap={handleSwap}
        localPill={localPill}
      />

      <InfoCol
        isCompete={isCompete}
        over={over}
        isPlayer={isPlayer}
        selfDone={selfDone}
        myConceded={myConceded}
        selfSolved={self?.solved ?? false}
        swapsUsed={swapsUsed}
        maxSwaps={game.max_swaps}
        remaining={remaining}
        parSwaps={game.par_swaps}
        players={players}
        selfId={session.user.id}
        playerStates={playerStates}
        concededIds={concededIds}
        onEndGame={() => void handleEndGame()}
        onConcede={() => void handleConcede()}
        onBackToClub={goToClub}
        setup={waffleSetup}
        answerWords={answerWords}
        swaps={swaps}
        viewingIndex={viewingIndex}
        onSelectTurn={setViewingIndex}
      />

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}

/**
 * Per-status terminal copy (the shared `TerminalCopy`), mode- and (compete)
 * self-aware. `outcome` + `verdict` drive the GameOverModal; `message` + `tone` drive
 * the short bold info-column line (won = green, lost = red, manual end = neutral).
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfWon: boolean
}): TerminalCopy {
  // Manual end (waffle.end_game) → 'ended' in either mode. Neutral result: nobody
  // won or lost. GameOverModal's 'won' outcome is reused purely for its non-red
  // styling; tone:'neutral' keeps the info-column line plain. Handled first so an
  // 'ended' game never falls through to a loss verdict.
  if (playState === 'ended') {
    return {
      outcome: 'won',
      verdict: mode === 'coop' ? 'Game ended.' : 'Game ended — no winner.',
      message: 'Game ended',
      tone: 'neutral',
    }
  }
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'Solved it! 🧇', message: 'Solved!', tone: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'Out of time.' : 'Out of swaps.',
      message: timerExpired ? 'Out of time' : 'Out of swaps',
      tone: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { outcome: 'won', verdict: 'You won — fewest swaps!', message: 'You won!', tone: 'won' }
      : { outcome: 'lost', verdict: 'Beaten on swaps.', message: 'Opponent won', tone: 'lost' }
  }
  // lost_compete — nobody solved, or time ran out
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time — no winner.' : 'Nobody solved it.',
    message: timerExpired ? 'Out of time' : 'No winner',
    tone: 'lost',
  }
}
