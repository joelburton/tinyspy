import { useCallback, useEffect, useRef, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GamePageCtx } from '../../common/lib/games'
import type { PsychicnumSetup } from '../lib/setup'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { memberById } from '../../common/lib/game/peers'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { printPsychicnumPdf } from '../pdf/printPsychicnumPdf'
import { turnSnapshot } from '../lib/history'
import { capitalize } from '../lib/capitalize'
import { stickyPill } from '../../common/lib/game/localPills'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // psychicnum-specific tokens (empty today, see file)

/** The computer hides this many secret words; players win by finding all. */
const SECRET_COUNT = 3

/**
 * psychicnum's play surface, shared between coop and compete
 * manifests. The mode is read from `game.mode` (set at create-
 * game time and never changes); rendering branches on it for:
 *
 *   - Header copy + progress: coop shows the team's "found X of 3";
 *     compete shows the caller's own progress + opponents' budgets.
 *   - GameTurnLog: coop shows everyone's guesses (and hints);
 *     compete is RLS-scoped to the caller.
 *   - Feedback: coop narrates teammates' guesses (green/red) and
 *     hint requests (amber) in the header; compete narrates an
 *     opponent finding a secret in GREEN — never which one. Green
 *     means "they found a word" in BOTH modes, so the player keeps
 *     one color-meaning rather than learning a compete-only one.
 *   - Terminal copy: coop is a team verdict; compete distinguishes
 *     "you won the race" vs "<name> won".
 *
 * Cross-cutting state (members, timer, play_state, paused, chat)
 * lives in `<GamePage>` above this component. PlayArea unmounts
 * on pause — its local state goes with it.
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
  brand,
  title,
}: GamePageCtx) {
  const { game, players: playerBudgets, guesses, loading } = useGame(gameId)
  const mode = game?.mode

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // opened from the hook's "Game info" menu item. Desktop is unchanged.
  const infoSheet = useInfoSheet()

  // I dropped out of a compete race (a real loss; the others keep racing). Read
  // from the common roster (prop `players`, always present) so it's available
  // here — above the early returns — for the game-menu effect. (The board/strip
  // recompute it below where the other conceded-set derivations live.)
  const myConceded = players.find((p) => p.user_id === session.user.id)?.conceded ?? false

  // The End / Concede action handlers, held in a stable ref so the game-menu
  // effect's onClick closures can call them without depending on the concrete
  // handlers (whose closures change each render). Populated by the effect just
  // below `useGlobalKeyHandler`, like the crosswords `actionsRef` pattern.
  const actionsRef = useRef<{ end: () => void; concede: () => void } | null>(null)

  // The FULL psychicnum game menu (Help + Print + End/Concede + Back to club).
  // `buildGameMenu` supplies the framing; `extra` is our one Print item. Print
  // builds its model from the live state (RLS already scoped `guesses`/`results`
  // to what I may see) and hands it to the jsPDF renderer — a snapshot at click
  // time, so it works mid-game or at the end. End/Concede dispatch through the
  // stable `actionsRef` so this effect needn't depend on the later handlers.
  useEffect(() => {
    if (!game) return
    // Board results: fold the 'guess' turns into word → was-a-secret (the same
    // rule the live board + lib/history use).
    const results = new Map<string, boolean>()
    for (const g of guesses) if (g.kind === 'guess') results.set(g.word, g.was_correct)
    const found = [...results.values()].filter(Boolean).length
    const guessesUsed = guesses.filter((g) => g.kind === 'guess').length
    const s = setup as unknown as PsychicnumSetup
    const model = {
      brand,
      gameTitle: title,
      date: new Date().toLocaleDateString(),
      summary: `${found} of 3 secrets found · ${guessesUsed} guess${guessesUsed === 1 ? '' : 'es'} used`,
      board: game.words.map((w) => ({
        word: w.toUpperCase(),
        state: results.has(w) ? (results.get(w) ? 'correct' : 'miss') : 'undecided',
      })) as { word: string; state: 'correct' | 'miss' | 'undecided' }[],
      cols: Math.ceil(Math.sqrt(game.words.length)),
      turns: guesses.map((g, i) => ({
        seq: i + 1,
        who: memberById(players, g.user_id)?.username ?? 'someone',
        text:
          g.kind === 'hint'
            ? `Hint: ${g.word}`
            : g.kind === 'reveal'
              ? `${g.word.toUpperCase()} — Answer`
              : `${g.word.toUpperCase()} — ${g.was_correct ? 'Correct' : 'Incorrect'}`,
      })),
      // Relevant setup only (the timer isn't relevant on a print).
      setup: [
        { label: 'Difficulty', value: difficultyValue(s.difficulty) },
        { label: 'Guesses', value: String(s.guesses) },
      ],
    }
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: mode ?? 'coop',
        isTerminal,
        conceded: myConceded,
        onEndGame: () => actionsRef.current?.end(),
        onConcede: () => actionsRef.current?.concede(),
        extra: [
          // Mobile-only "Game info" item (off-canvas info column); empty on desktop.
          ...infoSheet.menuSections,
          { items: [{ id: 'print', label: 'Print board (PDF)', onClick: () => printPsychicnumPdf(model) }] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, mode, isTerminal, myConceded, game, guesses, players, brand, title, setup, infoSheet.menuSections])

  // Per-opponent secrets-found count we've already announced (compete tension).
  const seenOpponentFoundRef = useRef<Map<string, number>>(new Map())

  // The Hint / Reveal in-flight flags (their buttons live in InfoCol; the RPCs stay
  // here in the coordinator). The guess input + the board shuffle moved into BoardCol.
  const [hinting, setHinting] = useState(false)
  const [revealing, setRevealing] = useState(false)

  // ─── Local feedback (own-action) — the coordinator owns the channel ────
  // The below-board own-move pill ("Correct"/"Incorrect", a validation error) is the
  // LOCAL half of the feedback split (peer/turn-state news → the header pill). It
  // lives HERE because BOTH columns write it: BoardCol's guess dispatch AND InfoCol's
  // Hint / Reveal / End / Concede. STICKY, dismissed by the next move (a keystroke /
  // tile click routed through BoardCol's `clearLocalFeedback`). PlayArea passes
  // `localFeedback` + `showLocalFeedback` / `clearLocalFeedback` down to BoardCol.
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })

  // ─── Coop peer events (group feedback) ─────────────────
  // A teammate's guess (green correct / red not) or hint request (amber) is
  // narrated in the header. My own events are excluded — my guesses get the
  // local flash, my hint shows in my own turn log. Compete never reaches here:
  // RLS scopes both guesses AND hints to the caller, and we gate on coop.
  // globalFeedback.show is a prop callback, so no local set-state lives in here.
  // The shared seen-set hook narrates EVERY new peer event (the old hand-rolled
  // version only looked at the latest row, dropping any that batched between
  // refetches). keyOf is the guess id; own events return null (mine → local).
  useGlobalFeedback({
    enabled: mode === 'coop',
    items: guesses,
    keyOf: (g) => g.id,
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → local
      const member = memberById(players, g.user_id)
      // Helper actions (hint / reveal) → amber: important, but neither good nor
      // bad. (A reveal logs the answer word, but we narrate it without naming
      // the word — "revealed a word", not which one.)
      if (g.kind === 'hint' || g.kind === 'reveal') {
        return {
          tone: 'warning',
          variant: 'outline',
          text: (
            <>
              <ActorDot actor={member} fallback="Someone" />{' '}
              {g.kind === 'hint' ? 'asked for a hint' : 'revealed a word'}
            </>
          ),
          dismiss: { kind: 'timed', ms: 3000 },
        }
      }
      return {
        tone: g.was_correct ? 'success' : 'error',
        variant: 'outline',
        text: g.was_correct ? (
          <>
            <ActorDot actor={member} fallback="Someone" /> found a secret —{' '}
            {g.word.toUpperCase()}!
          </>
        ) : (
          <>
            <ActorDot actor={member} fallback="Someone" /> guessed {g.word.toUpperCase()} — not it
          </>
        ),
        dismiss: { kind: 'timed', ms: 3000 },
      }
    },
    globalFeedback,
  })

  // ─── Compete opponent progress (group feedback) ────────
  // When an opponent's public secrets_found count ticks up, narrate "X guessed a
  // secret word" — the COUNT, never which word (that stays private). GREEN
  // (success), the SAME tone coop uses for a peer's correct guess: green means
  // "they found a word" in both modes, so the player doesn't maintain a
  // compete-only color-meaning. Watches the players rows; the ref seeds silently
  // on first load so history isn't replayed.
  useEffect(function announceOpponentProgress() {
    if (mode !== 'compete') return
    for (const p of playerBudgets) {
      if (p.user_id === session.user.id) continue
      const prev = seenOpponentFoundRef.current.get(p.user_id)
      seenOpponentFoundRef.current.set(p.user_id, p.secrets_found)
      if (prev === undefined) continue  // first sighting — seed, don't announce
      if (p.secrets_found <= prev) continue
      const member = memberById(players, p.user_id)
      globalFeedback.show({
        tone: 'success',
        variant: 'outline',
        text: (
          <>
            <ActorDot actor={member} fallback="Someone" /> guessed a secret word
          </>
        ),
        dismiss: { kind: 'timed', ms: 3000 },
      })
    }
  }, [playerBudgets, mode, players, session.user.id, globalFeedback])

  // ─── Turn-history viewer ───────────────────────────────
  // Click a turn-log #N to replay that turn's board (the tiles decided up to that
  // turn, with that turn's guessed tile ringed history-yellow). Keyed by log
  // position (guesses have no per-turn ordinal). Exit is intrinsic to the hook (a
  // click anywhere / the banner ✕); a keystroke also exits — the entry's capture is
  // frozen while viewing (see `disabled` below), so exitOnKey has the keys to itself.
  const { viewing, viewingId, select: selectTurn, exitViewing, exitOnKey } =
    useHistoryViewer<number>()
  useGlobalKeyHandler(exitOnKey)

  // Keep the End / Concede handlers current in the stable ref the game-menu
  // effect's onClick closures read (so that effect needn't depend on these,
  // and so it lives above the early returns without a Rules-of-Hooks snag).
  // The menu (⌥⌫ + the End/Concede item) and InfoCol's buttons share ONE pair
  // of handlers — hoisted above the early returns as useCallbacks so the ref
  // can list them in its deps. (The crosswords `actionsRef` pattern.)
  const endGame = useCallback(async () => {
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', capitalize(error.message)))
  }, [gameId, showLocalFeedback])
  const handleConcede = useCallback(async () => {
    if (isTerminal || myConceded) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', capitalize(error.message)))
  }, [isTerminal, myConceded, gameId, showLocalFeedback])
  useEffect(() => {
    actionsRef.current = { end: () => void endGame(), concede: () => void handleConcede() }
  }, [endGame, handleConcede])

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const selfBudget =
    playerBudgets.find((p) => p.user_id === session.user.id)
      ?.guesses_remaining ?? 0
  const selfSecretsFound =
    playerBudgets.find((p) => p.user_id === session.user.id)?.secrets_found ?? 0

  // Concede lives on the common roster (ctx `players` = GamePlayer[]), NOT on
  // psychicnum.players (the budget rows). `myConceded` is derived above (the menu
  // effect needs it before the early returns). `concededIds` marks the players
  // who've bowed out, for the opponent strip's "out" cell.
  const concededIds = new Set(players.filter((p) => p.conceded).map((p) => p.user_id))

  // Per-status modal + indicator copy. Mode-aware so compete-mode
  // winners get the "you won the race" vs "Bea won the race"
  // distinction, while coop stays the simple team verdict. In compete the
  // winner is the one who completed the set (their secrets_found hit 3).
  const winnerName = (status?.winner_username as string | undefined) ?? 'Someone'
  const over = isTerminal ? buildOver({
    mode: game.mode,
    playState,
    timerExpired: timer.expired,
    selfWon: game.mode === 'compete' ? selfSecretsFound >= SECRET_COUNT : true,
    winnerName,
  }) : null

  // Guessed words → was-it-a-secret, for the board's permanent green/red.
  // Hint rows are excluded (a hint reveals but doesn't mark a tile). In compete
  // RLS scopes `guesses` to the caller, so this is the viewer's own board.
  const results = new Map(
    guesses.filter((g) => g.kind === 'guess').map((g) => [g.word, g.was_correct]),
  )

  // Turn-history: when a past turn is open, `snap` is that turn's board (else null =
  // live) — the tiles decided up to that turn + the tile it decided (ringed). Stable:
  // a later realtime guess only grows the log past viewingId, so a past turn holds.
  const snap = viewingId !== null ? turnSnapshot(guesses, viewingId) : null

  // Progress toward the 3 secrets. Coop = the team's distinct finds (everyone's
  // correct guesses are visible); compete = the caller's own count.
  const teamFound = new Set(
    guesses.filter((g) => g.kind === 'guess' && g.was_correct).map((g) => g.word),
  ).size
  const found = game.mode === 'coop' ? teamFound : selfSecretsFound

  // ─── Info-column readouts (setup choices + live state) ──
  const psychicnumSetup = setup as PsychicnumSetup
  const totalGuesses = psychicnumSetup.guesses
  const guessesUsed = totalGuesses - selfBudget

  // Conceding (compete drop-out) locks guessing the same way running out of
  // budget does — I'm done, but the game continues for the others. (The guess
  // dispatch itself lives in BoardCol; PlayArea passes `canGuess` down.)
  const canGuess = !over && selfBudget > 0 && !myConceded

  // Hint (a clue) and reveal (the answer word) both land in the turn log via
  // realtime; coop teammates get a header pill. Nothing to do with the return
  // value here — the helper rows arrive over the subscription.
  const getHint = async () => {
    setHinting(true)
    const { error } = await db.rpc('request_hint', { target_game: gameId })
    setHinting(false)
    if (error) showLocalFeedback(stickyPill('error', capitalize(error.message)))
  }

  const getReveal = async () => {
    setRevealing(true)
    const { error } = await db.rpc('request_reveal', { target_game: gameId })
    setRevealing(false)
    if (error) showLocalFeedback(stickyPill('error', capitalize(error.message)))
  }

  // (endGame / handleConcede are hoisted above the early returns — see the
  // actionsRef block — so the menu, ⌥⌫, and InfoCol's buttons share one pair.)

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Board to render (live OR the historical snapshot — picked here) ──
        words={game.words}
        results={snap ? snap.results : results}
        highlightWord={snap?.highlightWord ?? null}
        // ── History viewer ──
        viewing={viewing}
        viewingDescription={snap?.description ?? null}
        onExitViewing={exitViewing}
        // ── Guess dispatch (BoardCol owns submit_guess) ──
        gameId={gameId}
        canGuess={canGuess}
        showLocalFeedback={showLocalFeedback}
        clearLocalFeedback={clearLocalFeedback}
        localPill={localFeedback}
        // ── Below-board slot content ──
        over={over}
        secrets={game.secrets}
        myConceded={myConceded}
      />
      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
        // ── Mode + phase ──
        isCompete={game.mode === 'compete'}
        over={over}
        canGuess={canGuess}
        myConceded={myConceded}
        // ── State readout ──
        found={found}
        secretCount={SECRET_COUNT}
        guessesUsed={guessesUsed}
        totalGuesses={totalGuesses}
        // ── Players (OpponentStrip, compete) ──
        players={players}
        selfId={session.user.id}
        playerBudgets={playerBudgets}
        concededIds={concededIds}
        // ── Action row ──
        onHint={() => void getHint()}
        hinting={hinting}
        onReveal={() => void getReveal()}
        revealing={revealing}
        onEndGame={() => void endGame()}
        onConcede={() => void handleConcede()}
        onBackToClub={goToClub}
        // ── Setup disclosure ──
        setup={psychicnumSetup}
        wordCount={game.words.length}
        // ── Turn-history log ──
        guesses={guesses}
        viewingIndex={viewingId}
        onSelectTurn={selectTurn}
        />
      </InfoSheet>

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}

/**
 * Per-status terminal copy. `outcome` + `verdict` drive the GameOverModal;
 * `message` + `tone` drive the short, bold, color-coded line in the info column
 * (won = green, lost = red, manual end = neutral).
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
  winnerName,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  /** Compete: did the caller complete the set? (Coop verdicts ignore it.) */
  selfWon: boolean
  /** Compete: the winner's frozen username (for the "X won" message). */
  winnerName: string
}): TerminalCopy {
  // Manual end ('ended', written by psychicnum.end_game) is the uniform neutral
  // terminal shared with the other games — the shared endedCopy() owns it.
  if (playState === 'ended') return endedCopy(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'You found all three!', message: 'You won!', tone: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'You lost: out of time' : 'You lost: out of guesses',
      message: timerExpired ? 'Timer elapsed' : 'Out of guesses',
      tone: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { outcome: 'won', verdict: 'You won the race!', message: 'You won!', tone: 'won' }
      : { outcome: 'lost', verdict: 'Beaten to the punch.', message: `${winnerName} won`, tone: 'lost' }
  }
  // lost_compete (all exhausted OR timeout in compete)
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time — nobody won.' : 'Out of guesses — nobody won.',
    message: timerExpired ? 'Timer elapsed' : 'Out of guesses',
    tone: 'lost',
  }
}
