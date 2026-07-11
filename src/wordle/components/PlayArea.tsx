import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GamePageCtx, GenericFeedbackMsg } from '../../common/lib/games'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, END_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
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
  clubHandle,
  goToGame,
  menu,
}: GamePageCtx) {
  const { game, players: playerStates, guesses, loading } = useGame(gameId)

  // Mobile (docs/mobile.md → the psychicnum recipe): below the breakpoint the
  // board + keyboard fill the screen and the info column moves into an off-canvas
  // <InfoSheet>, opened from the hook's "Game info" menu item. Desktop is
  // unchanged. wordle's one divergence — the board caps its height so the
  // keyboard always fits — lives in Board.module.css, not here.
  const infoSheet = useInfoSheet()

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

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

  // ─── Coop-win celebration ──────────────────────────────
  // Confetti at the MOMENT the team solves it (the winning guess flips
  // playState to 'won' on every connected client via realtime); opening an
  // already-won game stays quiet (useCelebration never pops on mount). Gated on
  // playState ALONE — it's coop-only by the states vocabulary (compete writes
  // 'won_compete') and, unlike anything read from useGame, correct from the
  // very first render (the waffle loading-race lesson).
  const celebration = useCelebration(playState === 'won')

  // ─── The hidden word stays hidden on a loss ────────────
  // The word is DISPLAYED at terminal only when it was earned or asked for:
  // a win (either mode — coop guessed it; compete's winner row shows in the
  // opened-up turn log anyway), an explicit reveal (the mid-game give-up RPC
  // tags status.outcome='revealed'), or this client's post-game "Reveal
  // answer" menu click (answerRevealed — FE-local: the target is already on
  // the client post-terminal, so showing it is a display decision, per the
  // friends trust model). A plain loss / manual end keeps it hidden so
  // "Replay board" stays a genuine second try (docs/celebration-ideas.md).
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const answerShown =
    playState === 'won' ||
    playState === 'won_compete' ||
    (status?.outcome as string | undefined) === 'revealed' ||
    answerRevealed

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
        text: (
          <>
            <ActorDot actor={member} fallback="Someone" /> guessed {g.guess.toUpperCase()}
          </>
        ),
        dismiss: { kind: 'timed', ms: 3000 },
      }
    },
    globalFeedback,
  })

  // ─── Compete opponent-solve narration (global header) ──────────
  // In compete, RLS hides opponents' guesses, so the only peer event we can surface is
  // a SOLVE (the public `players.solved` flag flips): "● moth solved it". SUCCESS-toned
  // (green) — a solve is a solve regardless of whose it is; tone follows the event, not
  // my competitive stake (docs/ui.md → Feedback pill ("tone follows the event")). My own
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
        text: (
          <>
            <ActorDot actor={member} fallback="Someone" /> solved it
          </>
        ),
        dismiss: { kind: 'timed', ms: 3000 },
      }
    },
    globalFeedback,
  })

  // Manual end — the friends agreeing to stop (a neutral terminal). Always
  // confirmed via the shared modal (ending is harmful for the whole group, even
  // coop/solo); it's irreversible; an RPC failure flashes in the local feedback
  // slot. `useCallback` so the ref-populate effect below re-runs only when its
  // real inputs change.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!(await confirmAction(END_GAME_CONFIRM))) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', error.message))
  }, [isTerminal, gameId, showLocalFeedback, confirmAction])

  // Concede — drop out of a compete race (a real loss; the others keep racing). Distinct
  // from End: wordle.concede flips the shared conceded flag then re-runs the compete
  // terminal check (which now counts me as done).
  const handleConcede = useCallback(async () => {
    if (isTerminal || myConceded) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', error.message))
  }, [isTerminal, myConceded, gameId, showLocalFeedback])

  // Replay board — restart THIS game (same word) from scratch for everyone:
  // clears every guess and un-terminals the game. Confirmed MID-GAME only (it
  // wipes the group's progress); at terminal there's nothing left to lose
  // (waffle's replay behavior). The reset arrives via the realtime refetch;
  // we leave any open history view, clear the pill, and re-hide a locally
  // revealed answer so the new run starts blind.
  const handleReplay = useCallback(async () => {
    if (
      !isTerminal &&
      !window.confirm("Replay board? This clears everyone's guesses and restarts with the same word.")
    )
      return
    const { error } = await db.rpc('replay_board', { target_game: gameId })
    if (error) {
      showLocalFeedback(stickyPill('error', `Replay failed: ${error.message}`))
      return
    }
    exitViewing()
    clearLocalFeedback()
    setAnswerRevealed(false)
  }, [isTerminal, gameId, showLocalFeedback, clearLocalFeedback, exitViewing])

  // New game — a FRESH game (new id, new random target) with THIS game's
  // setup + roster + mode, in the same club (waffle's "same again!" feature).
  // wordle's create_game is a direct RPC — no edge function; picking a random
  // target is one SQL line — so this mirrors the manifest's startGameInClub.
  // Non-destructive (common.create_game un-currents this game into the club
  // list), so no confirm; the creator jumps in via ctx.goToGame, peers arrive
  // via the game-invitation toast.
  const gameMode = game?.mode
  const handleNewGame = useCallback(async () => {
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        // ctx.setup is Record<string,unknown> at the shell level; this game's
        // rows were created from a WordleSetup, so the cast is the usual
        // per-game narrowing (docs/common.md → GamePageCtx.setup).
        setup: setup as WordleSetup,
        player_user_ids: members.map((m) => m.user_id),
        mode: gameMode,
      })
      .single()
    if (error || !data) {
      showLocalFeedback(stickyPill('error', `New game failed: ${error?.message ?? 'unknown'}`))
      return
    }
    goToGame(`wordle_${gameMode}`, (data as { id: string }).id)
  }, [gameMode, clubHandle, setup, members, goToGame, showLocalFeedback])

  // Reveal answer — two shapes behind one menu item:
  //   MID-GAME: a group give-up — ends the game for everyone (confirmed,
  //   irreversible), tagged status.outcome='revealed' so the word displays.
  //   AT TERMINAL (a loss / manual end left the word hidden): just show it to
  //   THIS client — no RPC, no confirm; the target is already here, this is
  //   purely "okay, what was it?".
  const handleReveal = useCallback(async () => {
    if (isTerminal) {
      setAnswerRevealed(true)
      return
    }
    if (!window.confirm('Reveal the answer? This ends the game for everyone.')) return
    const { error } = await db.rpc('reveal_answer', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', `Reveal failed: ${error.message}`))
  }, [isTerminal, gameId, showLocalFeedback])

  // ─── Header menu (each game owns its whole menu) ───────────────
  // The shared frame (Help / End-or-Concede / Back to club) plus wordle's two
  // own items, "Replay board" (both modes, any state) and "Reveal answer"
  // (disabled once the word is already showing — a win, a prior reveal). All
  // four actions dispatch through a stable `actionsRef` so this effect's deps
  // stay stable values only (menu, mode, isTerminal, myConceded, answerShown)
  // — it must NOT re-run per render, since `setGameSections` is a setState (a
  // fresh handler identity each render would loop). The handlers themselves
  // are defined above; the ref is repopulated with the current closures in a
  // second effect.
  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    replay: () => void
    reveal: () => void
    newGame: () => void
  }>({
    endGame: () => {},
    concede: () => {},
    replay: () => {},
    reveal: () => {},
    newGame: () => {},
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
        extra: [
          // Mobile-only "Game info" item (reaches the off-canvas info column);
          // empty on desktop where the column is always visible.
          ...infoSheet.menuSections,
          {
            items: [
              { id: 'replay', label: 'Replay board', onClick: () => actionsRef.current.replay() },
              // Same setup + roster, a fresh random target, a NEW game id.
              { id: 'new-game', label: 'New game', onClick: () => actionsRef.current.newGame() },
              {
                id: 'reveal',
                label: 'Reveal answer',
                disabled: answerShown,
                onClick: () => actionsRef.current.reveal(),
              },
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, mode, isTerminal, myConceded, answerShown, infoSheet.menuSections])

  // Keep the ref's action closures current so the menu effect above never
  // needs the (identity-changing) handlers in its own dep array.
  useEffect(() => {
    actionsRef.current = {
      endGame: () => void handleEndGame(),
      concede: () => void handleConcede(),
      replay: () => void handleReplay(),
      reveal: () => void handleReveal(),
      newGame: () => void handleNewGame(),
    }
  }, [handleEndGame, handleConcede, handleReplay, handleReveal, handleNewGame])

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
  // column's terminalExtra carries the fuller "The answer was …" sentence. Gated on
  // `answerShown` (win / explicit reveal), NOT on target availability: post-terminal
  // the target is always on the client, but a loss keeps it hidden (see the
  // answerShown block above).
  const answerSuffix =
    answerShown && game.target ? `Answer: ${game.target.toUpperCase()}.` : ''
  const localPill: GenericFeedbackMsg | null = over
    ? terminalPill(over.tone, answerSuffix ? `${over.verdict} ${answerSuffix}` : over.verdict)
    : isLocallyDone
      ? outOfRacePill(myConceded)
      : localFeedback

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
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
      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
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
        onRestart={() => void handleReplay()}
        onRevealAnswer={() => void handleReveal()}
        revealDisabled={answerShown}
        onNewGame={() => void handleNewGame()}
        onBackToClub={goToClub}
        onRequestBackToClub={menu.requestBackToClub}
        // ── Setup disclosure ──
        setup={wordleSetup}
        // ── Terminal answer reveal (null while hidden — incl. on a loss) ──
        solution={answerShown ? game.target : null}
        // ── Turn log ──
        guesses={guesses}
        mode={game.mode}
        viewingIndex={viewingId}
        onSelectTurn={selectTurn}
        />
      </InfoSheet>

      {/* Wordle skips the shared GameOverModal (the waffle treatment —
          docs/celebration-ideas.md): the verdict is carried in-page by the
          below-board pill + the action-row outcome line, and a coop solve
          gets the celebration instead. */}
      {celebration.show && <CelebrationDialog title="Solved! 🎉" onClose={celebration.close} />}
      {confirmDialog}
    </div>
  )
}

/**
 * Per-status terminal copy (the shared `TerminalCopy` shape). `tone` + `verdict`
 * drive the below-board terminal pill; `tone` + `message` drive the short,
 * color-coded info-column outcome line. `outcome` was the GameOverModal's field —
 * wordle no longer renders that modal (the coop celebration + the in-page verdict
 * replaced it) — but the shared shape still requires it. Mode- and (compete)
 * self-aware.
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
