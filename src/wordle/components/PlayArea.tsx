import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { GamePageCtx, GenericFeedbackMsg } from '../../common/lib/games'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { turnSnapshot } from '../lib/history'
import { stickyPill, terminalPill, outOfRacePill } from '../../common/lib/game/localPills'
import type { WordleSetup } from '../lib/setup'
import { memberById } from '../../common/lib/game/peers'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { cls } from '../../common/lib/util/cls'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * wordle's play surface, shared by the coop and compete manifests. The thin
 * COORDINATOR of the two columns: it owns the game data (`useGame`), the below-board
 * feedback channel (both columns write it), the turn-history viewer, the peer
 * narration, and the cross-column derivations — then hands each column what it needs.
 *
 *   - `<BoardCol>` — the board + on-screen keyboard: the input engine (the pending
 *     guess + `submit_guess`, Pattern A). See BoardCol.tsx.
 *   - `<InfoCol>` — the guess counter + guess list + action row + setup. Presentational.
 *
 * Mode (`game.mode`) branches the derivations: coop shows the SHARED guess list +
 * team budget; compete shows only the caller's own guesses (RLS hides opponents) plus
 * an OpponentStrip of their guess counts.
 */
export function PlayArea({
  session,
  gameId,
  brand,
  players: members,
  playState,
  isTerminal,
  timer,
  setup,
  status,
  globalFeedback,
  goToClub,
  menu,
}: GamePageCtx) {
  const { game, players: playerStates, guesses, loading } = useGame(gameId)
  // The own-move local feedback pill (soft reject / RPC error), shown in the
  // fixed-height slot between the board and the keyboard. Sticky (localPill): cleared
  // by the player's next edit (in BoardCol), the "next move dismisses it" rule. Lives
  // HERE because BOTH columns write it: BoardCol's guess dispatch AND InfoCol's End /
  // Concede. Accepted guesses get NO pill — the colored row that lands IS the feedback.
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })

  // ─── Turn-history viewer ───────────────────────────────
  // Click a turn-log #N to replay that turn's board (the guess rows up to that turn,
  // with that turn's row ringed history-yellow). Keyed by log position. Exit is
  // intrinsic to the hook (a click anywhere / the banner ✕); a keystroke also exits —
  // BoardCol freezes its capture while viewing, so exitOnKey has the keys to itself.
  const { viewing, viewingId, select: selectTurn, exitViewing, exitOnKey } =
    useHistoryViewer<number>()
  useGlobalKeyHandler(exitOnKey)

  // ─── Derived (null-safe; real values after the loading guard) ──
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = game?.mode === 'compete'
  const maxGuesses = game?.max_guesses ?? 6
  const guessesUsed = self?.guesses_used ?? 0
  const mySolved = self?.solved ?? false
  // Concede lives on the common roster (ctx `members`), not wordle.players.
  const myConceded = members.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(members.filter((m) => m.conceded).map((m) => m.user_id))
  // Coop: the shared board. Compete: my own guesses (RLS-filtered).
  const myGuesses = isCompete
    ? guesses.filter((g) => g.user_id === session.user.id)
    : guesses

  // ─── Coop peer-guess narration (global header) ─────────────────
  // A teammate's ACCEPTED guess is narrated in the GamePage header: "● moth guessed
  // CRANE", neutral-toned with their identity dot. Only accepted guesses reach here —
  // `wordle.guesses` holds nothing else (a soft reject writes no row). My own guesses
  // are excluded (they land on the shared board). Compete never narrates a guess: RLS
  // scopes `guesses` to the caller, and we gate on coop besides. The shared hook's
  // seen-set (not "the last row") handles coop interleaving two players' rows by
  // seq, so the newest isn't last.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    items: guesses,
    keyOf: (g) => `${g.user_id}-${g.seq}`,
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → board, no narration
      const member = memberById(members, g.user_id)
      return {
        tone: 'neutral',
        variant: 'outline',
        dot: member?.color ?? null,
        text: `${member?.username ?? 'Someone'} guessed ${g.guess.toUpperCase()}`,
        dismiss: { kind: 'timed', ms: 3000 },
      }
    },
    globalFeedback,
  })

  // ─── Compete opponent-solve narration (global header) ──────────
  // In compete, RLS hides opponents' guesses, so the only peer event we can surface is
  // a SOLVE (the public `players.solved` flag flips): "● moth solved it". SUCCESS-toned
  // (green) — a solve is a solve regardless of whose it is; tone follows the event, not
  // my competitive stake (docs/design-decisions.md → "Tone follows the event"). My own
  // solve is excluded (covered by the terminal feedback). `solvedIds` is memoized so
  // the hook re-runs only when it changes.
  const solvedIds = useMemo(
    () => playerStates.filter((p) => p.solved).map((p) => p.user_id),
    [playerStates],
  )
  useGlobalFeedback({
    enabled: game?.mode === 'compete',
    items: solvedIds,
    keyOf: (id) => id,
    messageFor: (id) => {
      if (id === session.user.id) return null // my own solve → terminal handling
      const member = memberById(members, id)
      return {
        tone: 'success',
        variant: 'outline',
        dot: member?.color ?? null,
        text: `${member?.username ?? 'Someone'} solved it`,
        dismiss: { kind: 'timed', ms: 3000 },
      }
    },
    globalFeedback,
  })

  // Manual end — the friends agreeing to stop (a neutral terminal). Confirmed because
  // it's irreversible; an RPC failure flashes in the local feedback slot. `useCallback`
  // so the ref-populate effect below re-runs only when its real inputs change.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', error.message))
  }, [isTerminal, gameId, showLocalFeedback])

  // Concede — drop out of a compete race (a real loss; the others keep racing). Distinct
  // from End: wordle.concede flips the shared conceded flag then re-runs the compete
  // terminal check (which now counts me as done).
  const handleConcede = useCallback(async () => {
    if (isTerminal || myConceded) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', error.message))
  }, [isTerminal, myConceded, gameId, showLocalFeedback])

  // ─── Header menu (each game owns its whole menu) ───────────────
  // wordle isn't printable and adds no game-specific items, so the menu is just
  // the shared frame: Help / End-or-Concede / Back to club. End/Concede dispatch
  // through a stable `actionsRef` so this effect's deps stay stable values only
  // (menu, mode, isTerminal, myConceded) — it must NOT re-run per render, since
  // `setGameSections` is a setState (a fresh handler identity each render would
  // loop). The handlers themselves are defined below the loading guard; the ref
  // is repopulated with the current closures in a second effect.
  const actionsRef = useRef<{ endGame: () => void; concede: () => void }>({
    endGame: () => {},
    concede: () => {},
  })
  const mode = game?.mode
  useEffect(() => {
    if (!mode) return // wait for the game to load before there's a real menu
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode,
        isTerminal,
        conceded: myConceded,
        onEndGame: () => actionsRef.current.endGame(),
        onConcede: () => actionsRef.current.concede(),
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, mode, isTerminal, myConceded])

  // Keep the ref's end/concede closures current so the menu effect above never
  // needs the (identity-changing) handlers in its own dep array.
  useEffect(() => {
    actionsRef.current = {
      endGame: () => void handleEndGame(),
      concede: () => void handleConcede(),
    }
  }, [handleEndGame, handleConcede])

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const rows = myGuesses.map((g) => ({ guess: g.guess, colors: g.colors }))

  // Turn-history: when a past turn is open, `snap` is that turn's board (the guess rows
  // up to it, the last one ringed); else null = live. `myGuesses` is exactly the board
  // BoardCol shows (coop team / compete self), and the log only hangs its #N handles on
  // THAT board — so `viewingId` indexes `myGuesses` 1:1. Stable: a later realtime guess
  // only grows the log past `viewingId`, so a past turn holds.
  const snap = viewing && viewingId !== null ? turnSnapshot(myGuesses, viewingId) : null

  const winnerId = status?.winner as string | undefined
  const selfWon = winnerId === session.user.id
  // Tie-break inference (no backend flag needed): the server picks the winner by fewest
  // guesses, then earliest solved_at. So if any OTHER solver used the same guess count
  // as the winner, the clock broke the tie — say "same guesses, but faster".
  const winnerState = playerStates.find((p) => p.user_id === winnerId)
  const wonByClock =
    !!winnerState &&
    playerStates.some(
      (p) =>
        p.user_id !== winnerId &&
        p.solved &&
        p.guesses_used === winnerState.guesses_used,
    )
  // Did the viewer lose specifically on the clock (tied the winner's guess count but
  // solved later)?
  const selfTiedWinner =
    !selfWon &&
    !!self &&
    self.solved &&
    !!winnerState &&
    self.guesses_used === winnerState.guesses_used
  const over = isTerminal
    ? buildOver({
        mode: game.mode,
        playState,
        timerExpired: timer.expired,
        selfWon,
        wonByClock,
        selfTiedWinner,
      })
    : null

  // Locally terminal (compete only): I'm done — solved, or out of my own guesses — but
  // the game continues for the others still racing. Coop has no such state (one shared
  // board: over for me ⇒ over for everyone). Shown as the terminal LOOK (a status line +
  // Concede), not a quietly-swapped help line.
  const isLocallyDone =
    !isTerminal && isCompete && (mySolved || guessesUsed >= maxGuesses || myConceded)

  // The GAME-STATE half of the board gate — BoardCol ORs in its own mid-submit
  // state. `readOnly` (glossary): the board is inert when there's no self row, the
  // game's terminal, I've solved / conceded, or I'm out of guesses. (De Morgan of
  // the old positive `guessingAllowed`.)
  const readOnly =
    !self || isTerminal || mySolved || myConceded || guessesUsed >= maxGuesses

  const wordleSetup = setup as WordleSetup

  // ─── The below-board pill (terminal / locally-terminal / own-move) ─────
  // The fixed-height feedback slot under the board shows exactly one pill, chosen here
  // by priority (BoardCol just renders it):
  //   - terminal → a PERMANENT (fill) verdict pill with the answer folded in (the answer
  //     also shows in the info column's terminalExtra — it lands in both places);
  //   - locally terminal (compete: I'm done while the others race) → a sticky "you're
  //     out" pill (the target isn't revealed until the whole game ends);
  //   - otherwise → the own-move soft-reject / error pill (localFeedback, or nothing).
  // Kept short ("Answer: CRANE.") so the terminal pill stays on one line — the info
  // column's terminalExtra carries the fuller "The answer was …" sentence.
  const answerSuffix = game.target ? `Answer: ${game.target.toUpperCase()}.` : ''
  const localPill: GenericFeedbackMsg | null = over
    ? terminalPill(over.tone, answerSuffix ? `${over.verdict} ${answerSuffix}` : over.verdict)
    : isLocallyDone
      ? outOfRacePill(myConceded)
      : localFeedback

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <BoardCol
        // ── Board to render (live rows + the history snapshot) ──
        rows={rows}
        snap={snap}
        maxGuesses={game.max_guesses}
        brand={brand}
        // ── History viewer ──
        onExitViewing={exitViewing}
        // ── Guess dispatch (BoardCol owns submit_guess) ──
        gameId={gameId}
        readOnly={readOnly}
        showLocalFeedback={showLocalFeedback}
        clearLocalFeedback={clearLocalFeedback}
        // ── Below-board pill ──
        localPill={localPill}
      />
      <InfoCol
        // ── Mode + phase ──
        isCompete={isCompete}
        isTerminal={isTerminal}
        over={over}
        isLocallyDone={isLocallyDone}
        myConceded={myConceded}
        isPlayer={!!self}
        // ── State ──
        guessesUsed={guessesUsed}
        maxGuesses={maxGuesses}
        // ── Opponent strip (compete) ──
        players={members}
        selfId={session.user.id}
        playerStates={playerStates}
        concededIds={concededIds}
        // ── Action row ──
        onEndGame={() => void handleEndGame()}
        onConcede={() => void handleConcede()}
        onBackToClub={goToClub}
        // ── Setup disclosure ──
        setup={wordleSetup}
        // ── Terminal answer reveal ──
        solution={game.target}
        // ── Turn log ──
        guesses={guesses}
        mode={game.mode}
        viewingIndex={viewingId}
        onSelectTurn={selectTurn}
      />

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}

/**
 * Per-status terminal copy. `outcome` + `verdict` drive the `<GameOverModal>`;
 * `message` + `tone` drive the short, color-coded info-column outcome line (the shared
 * `TerminalCopy` shape, like psychicnum / connections). Mode- and (compete) self-aware.
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
  wonByClock,
  selfTiedWinner,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfWon: boolean
  /** The winner tied another solver on guesses → the clock decided it. */
  wonByClock: boolean
  /** The viewer lost specifically on the clock (tied the winner's count). */
  selfTiedWinner: boolean
}): TerminalCopy {
  // Manual end (wordle.end_game) → the shared neutral 'ended' copy.
  if (playState === 'ended') return endedCopy(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'Solved! 🎉', message: 'Solved it!', tone: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'Out of time.' : 'Out of guesses.',
      message: timerExpired ? 'Out of time' : 'Out of guesses',
      tone: 'lost',
    }
  }
  // compete. The winner is fewest-guesses, clock-as-tiebreak — so the copy distinguishes
  // "fewest guesses" from "same guesses, but faster".
  if (playState === 'won_compete') {
    if (selfWon) {
      return wonByClock
        ? { outcome: 'won', verdict: 'You won — same guesses, but faster! ⏱️', message: 'You won (faster)', tone: 'won' }
        : { outcome: 'won', verdict: 'You won — fewest guesses!', message: 'You won!', tone: 'won' }
    }
    return selfTiedWinner
      ? { outcome: 'lost', verdict: 'Beaten on the clock — same guesses, just slower.', message: 'Opponent won (faster)', tone: 'lost' }
      : { outcome: 'lost', verdict: 'Beaten on guesses.', message: 'Opponent won', tone: 'lost' }
  }
  // lost_compete — nobody solved, or time ran out.
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time — no winner.' : 'Nobody solved it.',
    message: timerExpired ? 'Out of time' : 'No winner',
    tone: 'lost',
  }
}
