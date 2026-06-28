import { useEffect, useRef, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useEndGameMenu } from '../../common/hooks/useEndGameMenu'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { GuessForm } from './GuessForm'
import { GuessHistory } from './GuessHistory'
import { NumberBoard } from './NumberBoard'
import styles from './PlayArea.module.css'
import '../theme.css'  // psychicnum-specific tokens (empty today, see file)

/**
 * psychicnum's play surface, shared between coop and compete
 * manifests. The mode is read from `game.mode` (set at create-
 * game time and never changes); rendering branches on it for:
 *
 *   - Header copy: "X guesses left" (coop, shared) vs
 *     "You: X · Bea: Y" (compete, per-player budgets).
 *   - GuessHistory: in coop, shows everyone's guesses; in
 *     compete, RLS already filters to caller's own + the
 *     hook still passes everything through, but `players`-
 *     prop variant lets the row component highlight self.
 *     (RLS does the privacy enforcement; the FE doesn't need
 *     to re-filter.)
 *   - Terminal copy: coop says "you win/lose" (team verdict);
 *     compete distinguishes "you won the race" vs "Bea won".
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
  feedback,
  goToClub,
  menu,
}: GamePageCtx) {
  const { game, players: playerBudgets, guesses, loading } = useGame(gameId)

  // Track the id of the last guess we've already-pilled-for.
  const lastSeenGuessIdRef = useRef<string | null>(null)

  // The pending guess, shared by the board tiles and the text input below the
  // board (string so the number input can be empty). PlayArea owns it — and
  // the submit RPC — so a tile click and a keystroke drive the same guess.
  const [pending, setPending] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [guessError, setGuessError] = useState<string | null>(null)

  useEffect(function pillEachNewWrongGuess() {
    if (guesses.length === 0) return
    const latest = guesses[guesses.length - 1]
    if (lastSeenGuessIdRef.current === null) {
      lastSeenGuessIdRef.current = latest.id
      return
    }
    if (latest.id === lastSeenGuessIdRef.current) return
    lastSeenGuessIdRef.current = latest.id
    if (latest.was_correct) return  // GameOverModal covers this case
    feedback.show({
      tone: 'error',
      text: `${latest.number} — not the number`,
      dismiss: { kind: 'closeable' },
    })
  }, [guesses, feedback])

  // ─── End-game action (per-game menu item) ──────────────
  // Available in both modes. A manual end isn't a "you lose"
  // punishment — it's the friends agreeing they're done. The RPC
  // writes the neutral 'ended' terminal with everyone {won:false}.
  useEndGameMenu({
    isTerminal,
    menu,
    feedback,
    endGame: () => db.rpc('end_game', { target_game: gameId }),
  })

  const { showModal, closeModal } = useTerminalModal(isTerminal)

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const selfBudget =
    playerBudgets.find((p) => p.user_id === session.user.id)
      ?.guesses_remaining ?? 0

  // Per-status modal + indicator copy. Mode-aware so compete-mode
  // winners get the "you won the race" vs "Bea won the race"
  // distinction, while coop stays the simple team verdict.
  const over = isTerminal ? buildOver({
    mode: game.mode,
    playState,
    timerExpired: timer.expired,
    selfWon: didSelfWin(guesses, session.user.id, game.mode),
  }) : null

  // No mid-game prompt — the board IS the prompt. Post-terminal the heading
  // reveals the answer.
  const boardHeading = isTerminal && game.target !== null
    ? `The number was ${game.target}`
    : ''

  // Numbers already tried — their board tiles render spent. In compete
  // RLS scopes `guesses` to the caller, so this is the viewer's own.
  const guessedNumbers = new Set(guesses.map((g) => g.number))

  // Picking a tile or typing in the form both drive this one pending guess.
  const selected = pending === '' ? null : Number(pending)
  const canGuess = !over && selfBudget > 0

  // TEMP prototyping: 15 fake guesses to preview a long guess list. REMOVE.
  const fakeGuesses = Array.from({ length: 15 }, (_, i) => ({
    id: `fake-${i}`,
    user_id: session.user.id,
    number: (i % game.max_number) + 1,
    was_correct: false,
    guessed_at: `2020-01-01T00:00:${String(i).padStart(2, '0')}Z`,
  }))

  async function submitGuess() {
    const n = Number.parseInt(pending, 10)
    if (Number.isNaN(n) || n < 1 || n > game.max_number) {
      setGuessError(`Number must be between 1 and ${game.max_number}.`)
      return
    }
    setGuessError(null)
    setSubmitting(true)
    const { error } = await db.rpc('submit_guess', {
      target_game: gameId,
      guess: n,
    })
    setSubmitting(false)
    if (error) {
      setGuessError(error.message)
      return
    }
    setPending('')
  }

  return (
    <div className={styles.layout}>
      {/* The board column hugs the board's width (the board has a definite size),
          and the input row stretches to match it. */}
      <div className={styles.boardCol}>
        <NumberBoard
          heading={boardHeading}
          max={game.max_number}
          guessed={guessedNumbers}
          selected={selected}
          onPick={canGuess ? (n) => setPending(String(n)) : undefined}
        />
        {canGuess && (
          <GuessForm
            value={pending}
            onChange={setPending}
            onSubmit={submitGuess}
            submitting={submitting}
            max={game.max_number}
            error={guessError}
          />
        )}
      </div>
      <div className={styles.infoCol}>
        <div className={styles.actionSlot}>
          {over ? (
            <div className={styles.gameOverIndicator}>
              <span>
                <span className="muted">Game over:</span> {over.status}
              </span>
              <BackToClubButton onClick={goToClub} />
            </div>
          ) : game.mode === 'coop' ? (
            <p className="muted">
              Guess the number (1–{game.max_number}).{' '}
              <strong>{selfBudget}</strong>{' '}
              {selfBudget === 1 ? 'guess' : 'guesses'} left.
            </p>
          ) : (
            <>
              <p className="muted">
                Guess the number (1–{game.max_number}) — first one wins.
              </p>
              <OpponentStrip
                players={players}
                selfId={session.user.id}
                metricFor={(p) =>
                  playerBudgets.find((b) => b.user_id === p.user_id)
                    ?.guesses_remaining ?? 0
                }
              />
            </>
          )}
          {!over && selfBudget === 0 && (
            <p className="muted">No guesses left — waiting on the rest.</p>
          )}
        </div>
        {/* TEMP prototyping: fakeGuesses prepended to preview a long list. */}
        <GuessHistory guesses={[...fakeGuesses, ...guesses]} players={players} />
      </div>

      {showModal && over && (
        <GameOverModal
          outcome={over.outcome}
          verdict={over.verdict}
          onClose={closeModal}
          onBackToClub={goToClub}
        />
      )}
    </div>
  )
}

/**
 * In compete mode, "you won" depends on whether the caller is
 * the one who made the correct guess. In coop mode the verdict
 * is team-wide, so this returns true on any win (the verdict is
 * the same for everyone).
 */
function didSelfWin(
  guesses: { user_id: string; was_correct: boolean }[],
  selfId: string,
  mode: 'coop' | 'compete',
): boolean {
  const winner = guesses.find((g) => g.was_correct)
  if (!winner) return false
  if (mode === 'coop') return true
  return winner.user_id === selfId
}

/** Per-status modal + indicator copy. */
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
}): {
  outcome: 'won' | 'lost'
  verdict: string
  status: string
} {
  // Manual end ('ended', written by psychicnum.end_game) is the
  // uniform neutral terminal shared with the other games: nobody
  // won, nobody lost — the friends just stopped. We render it with
  // outcome:'won' so GameOverModal uses its green treatment (the
  // modal only knows 'won'/'lost'); the verdict copy stays neutral.
  if (playState === 'ended') {
    return mode === 'coop'
      ? { outcome: 'won', verdict: 'Game ended.', status: 'ended' }
      : { outcome: 'won', verdict: 'Game ended — no winner.', status: 'ended' }
  }
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'You win!', status: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired
        ? 'You lost: out of time'
        : 'You lost: out of guesses',
      status: timerExpired ? 'out of time' : 'out of guesses',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { outcome: 'won', verdict: 'You won the race!', status: 'you won' }
      : {
          outcome: 'lost',
          verdict: 'Beaten to the punch.',
          status: 'opponent won',
        }
  }
  // lost_compete (all exhausted OR timeout in compete)
  return {
    outcome: 'lost',
    verdict: timerExpired
      ? 'Out of time — nobody won.'
      : 'Out of guesses — nobody won.',
    status: timerExpired ? 'out of time' : 'out of guesses',
  }
}
