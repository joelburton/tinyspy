import { useCallback, useEffect, useRef, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useEndGameMenu } from '../../common/hooks/useEndGameMenu'
import { colorVarFor } from '../../common/lib/memberColor'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { GuessForm } from './GuessForm'
import { GuessHistory } from './GuessHistory'
import { WordBoard } from './WordBoard'
import styles from './PlayArea.module.css'
import '../theme.css'  // psychicnum-specific tokens (empty today, see file)

/** The computer hides this many secret words; players win by finding all. */
const SECRET_COUNT = 3
/** How long the player's own-guess result flash (the entry box) stays up. */
const LOCAL_RESULT_MS = 1000

/**
 * psychicnum's play surface, shared between coop and compete
 * manifests. The mode is read from `game.mode` (set at create-
 * game time and never changes); rendering branches on it for:
 *
 *   - Header copy + progress: coop shows the team's "found X of 3";
 *     compete shows the caller's own progress + opponents' budgets.
 *   - GuessHistory: coop shows everyone's guesses (and hints);
 *     compete is RLS-scoped to the caller.
 *   - Feedback: coop narrates teammates' guesses (green/red) and
 *     hint requests (amber) in the header; compete narrates an
 *     opponent finding a secret (amber tension) — never which one.
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
  feedback,
  goToClub,
  menu,
}: GamePageCtx) {
  const { game, players: playerBudgets, guesses, loading } = useGame(gameId)
  const mode = game?.mode

  // Track the id of the last guess/hint we've already-announced (peer events).
  const lastSeenGuessIdRef = useRef<string | null>(null)
  // Per-opponent secrets-found count we've already announced (compete tension).
  const seenOpponentFoundRef = useRef<Map<string, number>>(new Map())

  // The pending guess, shared by the board tiles and the entry below the board
  // (string so the entry can be empty). PlayArea owns it — and the submit RPC —
  // so a tile click and a keystroke drive the same guess.
  const [pending, setPending] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hinting, setHinting] = useState(false)
  const [guessError, setGuessError] = useState<string | null>(null)

  // ─── Own-guess local feedback ──────────────────────────
  // A transient "Correct"/"Incorrect" flash in the entry box for the player's
  // OWN last guess. Set straight from the submit RPC (an event handler, so no
  // set-state-in-effect), cleared after a beat. The *tile* color is now
  // permanent (derived from the guess log), so this is the only flash. Local
  // channel: near my eyes, about what I just did (docs/deferred.md → Feedback).
  const [localResult, setLocalResult] = useState<{ correct: boolean } | null>(null)
  const localResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashOwnResult = useCallback((correct: boolean) => {
    setLocalResult({ correct })
    if (localResultTimerRef.current !== null) {
      clearTimeout(localResultTimerRef.current)
    }
    localResultTimerRef.current = setTimeout(() => {
      setLocalResult(null)
      localResultTimerRef.current = null
    }, LOCAL_RESULT_MS)
  }, [])

  useEffect(function clearLocalResultTimerOnUnmount() {
    return () => {
      if (localResultTimerRef.current !== null) {
        clearTimeout(localResultTimerRef.current)
      }
    }
  }, [])

  // ─── Coop peer events (group feedback) ─────────────────
  // A teammate's guess (green correct / red not) or hint request (amber) is
  // narrated in the header. My own events are excluded — my guesses get the
  // local flash, my hint shows in my own turn log. Compete never reaches here:
  // RLS scopes both guesses AND hints to the caller, and we gate on coop.
  // feedback.show is a prop callback, so no local set-state lives in here.
  useEffect(function announcePeerEvent() {
    if (guesses.length === 0) return
    const latest = guesses[guesses.length - 1]
    // First load / refetch: adopt the latest as seen without replaying it.
    if (lastSeenGuessIdRef.current === null) {
      lastSeenGuessIdRef.current = latest.id
      return
    }
    if (latest.id === lastSeenGuessIdRef.current) return
    lastSeenGuessIdRef.current = latest.id

    if (latest.user_id === session.user.id) return  // mine → local
    if (mode !== 'coop') return
    const member = players.find((p) => p.user_id === latest.user_id)
    const name = member?.username ?? 'Someone'
    const dot = colorVarFor(member?.color)

    if (latest.kind === 'hint') {
      // Amber — important, but neither good nor bad.
      feedback.show({
        tone: 'warning',
        variant: 'outline',
        dot,
        text: `${name} asked for a hint`,
        dismiss: { kind: 'timed', ms: 3000 },
      })
      return
    }
    feedback.show({
      tone: latest.was_correct ? 'success' : 'error',
      variant: 'outline',
      dot,
      text: latest.was_correct
        ? `${name} found a secret — ${latest.word.toUpperCase()}!`
        : `${name} guessed ${latest.word.toUpperCase()} — not it`,
      dismiss: { kind: 'timed', ms: 3000 },
    })
  }, [guesses, mode, players, session.user.id, feedback])

  // ─── Compete opponent progress (group feedback) ────────
  // The tension signal: when an opponent's public secrets_found count ticks
  // up, narrate "X guessed a secret word" — the COUNT, never which word
  // (that stays private). Watches the players rows; the ref seeds silently on
  // first load so history isn't replayed.
  useEffect(function announceOpponentProgress() {
    if (mode !== 'compete') return
    for (const p of playerBudgets) {
      if (p.user_id === session.user.id) continue
      const prev = seenOpponentFoundRef.current.get(p.user_id)
      seenOpponentFoundRef.current.set(p.user_id, p.secrets_found)
      if (prev === undefined) continue  // first sighting — seed, don't announce
      if (p.secrets_found <= prev) continue
      const member = players.find((m) => m.user_id === p.user_id)
      const name = member?.username ?? 'Someone'
      feedback.show({
        tone: 'warning',
        variant: 'outline',
        dot: colorVarFor(member?.color),
        text: `${name} guessed a secret word`,
        dismiss: { kind: 'timed', ms: 3000 },
      })
    }
  }, [playerBudgets, mode, players, session.user.id, feedback])

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
  const selfSecretsFound =
    playerBudgets.find((p) => p.user_id === session.user.id)?.secrets_found ?? 0

  // Per-status modal + indicator copy. Mode-aware so compete-mode
  // winners get the "you won the race" vs "Bea won the race"
  // distinction, while coop stays the simple team verdict. In compete the
  // winner is the one who completed the set (their secrets_found hit 3).
  const over = isTerminal ? buildOver({
    mode: game.mode,
    playState,
    timerExpired: timer.expired,
    selfWon: game.mode === 'compete' ? selfSecretsFound >= SECRET_COUNT : true,
  }) : null

  // Guessed words → was-it-a-secret, for the board's permanent green/red.
  // Hint rows are excluded (a hint reveals but doesn't mark a tile). In compete
  // RLS scopes `guesses` to the caller, so this is the viewer's own board.
  const results = new Map(
    guesses.filter((g) => g.kind === 'guess').map((g) => [g.word, g.was_correct]),
  )

  // Progress toward the 3 secrets. Coop = the team's distinct finds (everyone's
  // correct guesses are visible); compete = the caller's own count.
  const teamFound = new Set(
    guesses.filter((g) => g.kind === 'guess' && g.was_correct).map((g) => g.word),
  ).size
  const found = game.mode === 'coop' ? teamFound : selfSecretsFound

  // Picking a tile or typing in the form both drive this one pending guess word.
  // (A partially-typed word won't equal any board word, so the board only
  // highlights once a tile is clicked or the full word is typed.)
  const selected = pending === '' ? null : pending
  const canGuess = !over && selfBudget > 0

  // const arrow (not a hoisted `function`) so the `if (!game) return` narrowing
  // above still applies inside — a function declaration is hoisted above it.
  const submitGuess = async () => {
    const guess = pending.trim().toLowerCase()
    // Client-side board-word check for snappy feedback; the server re-validates.
    if (!game.words.includes(guess)) {
      setGuessError(`"${pending}" isn't on the board.`)
      return
    }
    setGuessError(null)
    setSubmitting(true)
    // submit_guess returns 'won' | 'correct' | 'wrong' | 'lost'. 'won'/'correct'
    // both mean the guess hit a secret; the terminal transition we observe via
    // realtime, not the return value.
    const { data, error } = await db.rpc('submit_guess', {
      target_game: gameId,
      guess,
    })
    setSubmitting(false)
    if (error) {
      setGuessError(error.message)
      return
    }
    setPending('')
    flashOwnResult(data === 'won' || data === 'correct')
  }

  const getHint = async () => {
    setGuessError(null)
    setHinting(true)
    // The revealed word lands in the turn log (amber) via realtime; coop
    // teammates get a header pill. Nothing to do with the return value here.
    const { error } = await db.rpc('request_hint', { target_game: gameId })
    setHinting(false)
    if (error) setGuessError(error.message)
  }

  return (
    <div className={styles.layout}>
      {/* The board column hugs the board's width (the board has a definite size),
          and the input row stretches to match it. */}
      <div className={styles.boardCol}>
        <WordBoard
          words={game.words}
          results={results}
          selected={selected}
          onPick={canGuess ? (w) => setPending(w) : undefined}
        />
        {/* The slot below the board: the guess entry during play, the secret
            reveal once over — same place the player's eyes already are, and it
            explains why the entry is gone. Below the board (never a heading
            above it) so the board never shifts when the game ends. */}
        {canGuess ? (
          <GuessForm
            value={pending}
            onChange={setPending}
            onSubmit={submitGuess}
            submitting={submitting}
            error={guessError}
            result={
              localResult
                ? {
                    tone: localResult.correct ? 'good' : 'bad',
                    label: localResult.correct ? 'Correct' : 'Incorrect',
                  }
                : null
            }
          />
        ) : over && game.secrets ? (
          <p className={styles.reveal}>
            The words were <strong>{game.secrets.join(', ').toUpperCase()}</strong>
          </p>
        ) : null}
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
          ) : (
            <>
              {game.mode === 'coop' ? (
                <p className="muted">
                  Find the {SECRET_COUNT} secret words.{' '}
                  <strong>{found}</strong> of {SECRET_COUNT} found ·{' '}
                  <strong>{selfBudget}</strong>{' '}
                  {selfBudget === 1 ? 'guess' : 'guesses'} left.
                </p>
              ) : (
                <>
                  <p className="muted">
                    Race to find the {SECRET_COUNT} secret words. You've found{' '}
                    <strong>{found}</strong> of {SECRET_COUNT}.
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
              {canGuess && (
                <button
                  type="button"
                  className="secondary"
                  onClick={getHint}
                  disabled={hinting}
                >
                  {hinting ? 'Revealing…' : 'Get a hint'}
                </button>
              )}
              {selfBudget === 0 && (
                <p className="muted">No guesses left — waiting on the rest.</p>
              )}
            </>
          )}
        </div>
        <GuessHistory guesses={guesses} players={players} />
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
  /** Compete: did the caller complete the set? (Coop verdicts ignore it.) */
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
      return { outcome: 'won', verdict: 'You found all three!', status: 'won' }
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
