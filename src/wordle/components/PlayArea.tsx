import { useCallback, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useEndGameMenu } from '../../common/hooks/useEndGameMenu'
import { useGlobalKeyHandler } from '../../common/hooks/useGlobalKeyHandler'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { colorRank, tileColor, type TileColor } from '../lib/colors'
import { WordleGrid } from './WordleGrid'
import { Keyboard } from './Keyboard'
import { GuessList } from './GuessList'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * WordNerd's play surface, shared by the coop and compete manifests.
 * Two columns: the board + on-screen keyboard on the left, the
 * guesses-used counter + guess list on the right. Mode is read from
 * `game.mode`.
 *
 * Guesses go through `wordle.submit_guess`; the board/keyboard update
 * via the realtime refetch in `useGame` (Pattern A). Soft rejects
 * (notAWord / duplicate / invalid) keep the typed row and flash a timed
 * pill; an accepted guess clears the input and arrives as a new row.
 *
 * Coop renders the SHARED guess list (everyone's), the budget is the
 * team's. Compete renders only the caller's own guesses (RLS hides
 * opponents) plus an OpponentStrip of their guess counts.
 */
export function PlayArea({
  session,
  gameId,
  players: members,
  playState,
  isTerminal,
  timer,
  status,
  feedback,
  goToClub,
  menu,
}: GamePageCtx) {
  const { game, players: playerStates, guesses, loading } = useGame(gameId)
  const { showModal, closeModal } = useTerminalModal(isTerminal)
  const [current, setCurrent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // The accepted-but-not-yet-rendered guess: kept on the board (uncolored)
  // from the moment we submit until its colored server row arrives via
  // realtime, so the letters don't blink out during the round-trip. The
  // row then flips in place. Cleared on soft-reject, or once it lands.
  const [pending, setPending] = useState<string | null>(null)

  // ─── Derived (null-safe; real values after the loading guard) ──
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = game?.mode === 'compete'
  const maxGuesses = game?.max_guesses ?? 6
  const guessesUsed = self?.guesses_used ?? 0
  const mySolved = self?.solved ?? false
  // Coop: the shared board. Compete: my own guesses (RLS-filtered).
  const myGuesses = isCompete
    ? guesses.filter((g) => g.user_id === session.user.id)
    : guesses
  // The pending word, shown until its colored server row actually lands.
  // Once it's in myGuesses we stop showing it (the real row flips in its
  // place) — `pending` state may linger stale, but `pendingWord` is the
  // value everything reads, so that's harmless. Deriving it (vs. clearing
  // `pending` in an effect) also dodges a one-frame double-render.
  const pendingLanded =
    pending != null && myGuesses.some((g) => g.guess === pending)
  const pendingWord = pending && !pendingLanded ? pending : ''
  const canGuess =
    !!self &&
    !isTerminal &&
    !mySolved &&
    guessesUsed < maxGuesses &&
    !submitting &&
    !pendingWord

  // ─── Submit a guess (stable across keystrokes) ────────────────
  const doSubmit = useCallback(
    async (word: string) => {
      if (word.length !== 5) {
        feedback.show({ tone: 'info', text: 'Not enough letters', dismiss: { kind: 'timed', ms: 1200 } })
        return
      }
      setSubmitting(true)
      // Optimistically keep the letters on the board through the round-trip
      // so they don't blink out. Reverted on any soft-reject below.
      setPending(word)
      const { data, error } = await db.rpc('submit_guess', {
        target_game: gameId,
        guess: word,
      })
      setSubmitting(false)
      if (error) {
        setPending(null)
        feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'closeable' } })
        return
      }
      const res = data as { result: string }
      if (res.result === 'notAWord') {
        setPending(null)
        feedback.show({ tone: 'error', text: 'Not in word list', dismiss: { kind: 'timed', ms: 1500 } })
        return
      }
      if (res.result === 'duplicate') {
        setPending(null)
        feedback.show({ tone: 'info', text: 'Already guessed', dismiss: { kind: 'timed', ms: 1500 } })
        return
      }
      if (res.result === 'invalid') {
        setPending(null)
        feedback.show({ tone: 'error', text: 'Not enough letters', dismiss: { kind: 'timed', ms: 1200 } })
        return
      }
      // accepted (correct/incorrect): clear the typing buffer. `pending`
      // holds the word in place until its colored row lands (then flips).
      setCurrent('')
    },
    [gameId, feedback],
  )

  // ─── Physical keyboard ────────────────────────────────────────
  // Mirrors the on-screen <Keyboard>. The handler reads canGuess /
  // current / doSubmit fresh through useGlobalKeyHandler's ref, so the
  // window listener registers once rather than re-binding per keystroke.
  useGlobalKeyHandler((e) => {
    if (!canGuess) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'Enter') {
      e.preventDefault()
      void doSubmit(current)
    } else if (e.key === 'Backspace') {
      setCurrent((c) => c.slice(0, -1))
    } else if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
      setCurrent((c) => (c.length < 5 ? c + e.key.toLowerCase() : c))
    }
  })

  // ─── End-game menu item (both modes) ──────────────────────────
  useEndGameMenu({
    isTerminal,
    menu,
    feedback,
    endGame: () => db.rpc('end_game', { target_game: gameId }),
  })

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  // Per-key feedback state — strongest color each letter has earned.
  const keyStates = new Map<string, TileColor>()
  for (const g of myGuesses) {
    for (let i = 0; i < 5; i++) {
      const ch = g.guess[i]
      const col = tileColor(g.colors[i])
      const prev = keyStates.get(ch)
      if (!prev || colorRank(col) > colorRank(prev)) keyStates.set(ch, col)
    }
  }

  const rows = myGuesses.map((g) => ({ guess: g.guess, colors: g.colors }))

  const selfWon = (status?.winner as string | undefined) === session.user.id
  const over = isTerminal
    ? buildOver({ mode: game.mode, playState, timerExpired: timer.expired, selfWon })
    : null

  return (
    <div className={styles.layout}>
      <div
        className={styles.boardArea}
        style={{ ['--rows' as string]: game.max_guesses }}
      >
        <WordleGrid
          rows={rows}
          current={current}
          pending={pendingWord}
          maxGuesses={game.max_guesses}
          active={canGuess}
        />
        <Keyboard
          keyStates={keyStates}
          onKey={(ch) => canGuess && setCurrent((c) => (c.length < 5 ? c + ch : c))}
          onEnter={() => void doSubmit(current)}
          onBackspace={() => setCurrent((c) => c.slice(0, -1))}
          disabled={!canGuess}
        />
      </div>

      <div className={styles.rightCol}>
        {over ? (
          <div className={styles.gameOver}>
            <span>
              <span className="muted">Game over:</span> {over.status}
            </span>
            {game.target && (
              <span>
                The answer was{' '}
                <strong className={styles.answer}>
                  {game.target.toUpperCase()}
                </strong>
              </span>
            )}
            <button type="button" className="secondary" onClick={goToClub}>
              Back to club
            </button>
          </div>
        ) : (
          <>
            {isCompete && (
              <OpponentStrip
                players={members}
                selfId={session.user.id}
                metricFor={(player) => {
                  const ps = playerStates.find(
                    (p) => p.user_id === player.user_id,
                  )
                  const used = ps?.guesses_used ?? 0
                  const solved = ps?.solved ?? false
                  const out = !solved && used >= game.max_guesses
                  return (
                    <>
                      {used}
                      {solved ? ' ✓' : out ? ' ✗' : ''}
                    </>
                  )
                }}
              />
            )}
            {!self && (
              <p className="muted">Watching — you're not in this game.</p>
            )}
          </>
        )}

        <GuessList
          guesses={myGuesses}
          players={members}
          guessesUsed={guessesUsed}
          maxGuesses={game.max_guesses}
          showWho={!isCompete}
        />
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

/** Terminal verdict + status copy, mode- and (compete) self-aware. */
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
}): { outcome: 'won' | 'lost'; verdict: string; status: string } {
  // Manual end (wordle.end_game) → neutral 'ended'. We reuse the modal's
  // 'won' (green) treatment; the verdict copy makes clear there's no
  // winner.
  if (playState === 'ended') {
    return {
      outcome: 'won',
      verdict: mode === 'coop' ? 'Game ended.' : 'Game ended — no winner.',
      status: 'ended',
    }
  }
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'Solved it! 🎉', status: 'solved' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'Out of time.' : 'Out of guesses.',
      status: timerExpired ? 'out of time' : 'out of guesses',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { outcome: 'won', verdict: 'You won — fewest guesses!', status: 'you won' }
      : { outcome: 'lost', verdict: 'Beaten on guesses.', status: 'opponent won' }
  }
  // lost_compete — nobody solved, or time ran out
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time — no winner.' : 'Nobody solved it.',
    status: timerExpired ? 'out of time' : 'no winner',
  }
}
