import { useCallback, useState } from 'react'
import type { GamePageCtx, FeedbackMsg, TimerMode } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { FeedbackPill } from '../../common/components/FeedbackPill'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useGlobalKeyHandler } from '../../common/hooks/useGlobalKeyHandler'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import { endedCopy, type TerminalCopy } from '../../common/lib/terminalCopy'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { colorRank, tileColor, type TileColor } from '../lib/colors'
import type { WordleSetup } from '../lib/setup'
import { WordleGrid } from './WordleGrid'
import { Keyboard } from './Keyboard'
import { GuessList } from './GuessList'
import { cls } from '../../common/lib/cls'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * wordle's play surface, shared by the coop and compete manifests.
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

/** Local feedback pills are never closeable, so the × never renders and this is
 *  never called — but `<FeedbackPill>` requires the prop. */
const noop = () => {}

/** Build the own-move local pill: outline (transient) + STICKY — it sits in the
 *  local feedback area until the player's next keypress dismisses it (the typed
 *  letters stay on the board so they can fix the guess). Tone is per case:
 *  `error` for an invalid / failed guess (not a real word, an RPC error),
 *  `warning` for a non-error nudge ("already guessed", "not enough letters"). */
const localPill = (tone: 'warning' | 'error', text: string): FeedbackMsg => ({
  tone,
  text,
  variant: 'outline',
  dismiss: { kind: 'sticky' },
})

/** Where the hidden target is drawn from, for the setup disclosure. `0` = the
 *  curated NYT-Wordle answer list; `1..6` = a clean word of that difficulty band
 *  or easier. */
const answerSourceLabel = (n: number): string =>
  n === 0 ? 'NYT Wordle list' : `${DIFFICULTY_LABELS[n - 1] ?? 'any'} or easier`

/** One-line timer summary for the setup disclosure. */
function timerLabel(t: TimerMode): string {
  if (t.kind === 'countup') return 'count-up timer'
  if (t.kind === 'countdown') {
    const m = Math.floor(t.seconds / 60)
    const s = t.seconds % 60
    return `${m}:${String(s).padStart(2, '0')} countdown`
  }
  return 'no timer'
}

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
  goToClub,
}: GamePageCtx) {
  const { game, players: playerStates, guesses, loading } = useGame(gameId)
  const { showModal, closeModal } = useTerminalModal(isTerminal)
  const [current, setCurrent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // The own-move local feedback pill (soft reject / RPC error), shown in the
  // fixed-height slot between the board and the keyboard. Sticky: cleared by the
  // player's next edit (typeLetter / deleteLetter below), the "next move
  // dismisses it" rule (docs/design-decisions.md → Dismissal modes). Accepted
  // guesses get NO pill — the colored row that lands IS the feedback.
  const [localMsg, setLocalMsg] = useState<FeedbackMsg | null>(null)
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

  // ─── Edit the active row (dismisses any sticky local pill) ─────
  // Typing a letter or backspacing is the player's "next move", so it clears the
  // last soft-reject pill (the analog of psychicnum's "typing dismisses the
  // entry flash"). Both the physical and on-screen keyboards route through these,
  // so the clear lives in one place. Stable (no deps) — they only call setters.
  const typeLetter = useCallback((ch: string) => {
    setLocalMsg(null)
    setCurrent((c) => (c.length < 5 ? c + ch.toLowerCase() : c))
  }, [])
  const deleteLetter = useCallback(() => {
    setLocalMsg(null)
    setCurrent((c) => c.slice(0, -1))
  }, [])

  // ─── Submit a guess (stable across keystrokes) ────────────────
  const doSubmit = useCallback(
    async (word: string) => {
      if (word.length !== 5) {
        setLocalMsg(localPill('warning', 'Not enough letters'))
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
        // A real failure (not a soft reject) → error-toned, still sticky.
        setLocalMsg(localPill('error', error.message))
        return
      }
      const res = data as { result: string }
      // Soft rejects (no guess burned, the typed row stays). An invalid word
      // (`notAWord`) reads as an error; the rest are non-error nudges (warning).
      if (res.result === 'notAWord') {
        setPending(null)
        setLocalMsg(localPill('error', 'Not in word list'))
        return
      }
      if (res.result === 'duplicate') {
        setPending(null)
        setLocalMsg(localPill('warning', 'Already guessed'))
        return
      }
      if (res.result === 'invalid') {
        setPending(null)
        setLocalMsg(localPill('warning', 'Not enough letters'))
        return
      }
      // accepted (correct/incorrect): clear the typing buffer. `pending`
      // holds the word in place until its colored row lands (then flips).
      setCurrent('')
    },
    [gameId],
  )

  // ─── Physical keyboard ────────────────────────────────────────
  // Mirrors the on-screen <Keyboard>. The handler reads canGuess /
  // current / doSubmit fresh through useGlobalKeyHandler's ref, so the
  // window listener registers once rather than re-binding per keystroke.
  // Same ordering as useCaptureKeys (the EntryBox grabber): modifier bail →
  // hard-off → dismiss-on-ANY-key → dispatch.
  useGlobalKeyHandler((e) => {
    // Leave browser/OS shortcuts (Cmd-R, Ctrl-Tab, …) alone — and don't let
    // them count as a "next move" that dismisses feedback.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    // Hard-off when the player can't act (loading / terminal / out of guesses /
    // mid-submit): do nothing AND don't dismiss — matches useCaptureKeys'
    // `disabled` gate, so a sticky pill survives a stray key.
    if (!canGuess) return
    // ANY key the player presses is their next move → clear the local pill,
    // even keys we then pass up (space, punctuation, arrows). The on-screen
    // keyboard dismisses via typeLetter/deleteLetter instead; doing it here too
    // is a harmless no-op when those run. (Same rule as useCaptureKeys.onAnyKey
    // — the EntryBox grabber had this exact gap before.)
    setLocalMsg(null)
    if (e.key === 'Enter') {
      e.preventDefault()
      void doSubmit(current)
    } else if (e.key === 'Backspace') {
      deleteLetter()
    } else if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
      typeLetter(e.key)
    }
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

  const winnerId = status?.winner as string | undefined
  const selfWon = winnerId === session.user.id
  // Tie-break inference (no backend flag needed): the server picks the
  // winner by fewest guesses, then earliest solved_at. So if any OTHER
  // solver used the same guess count as the winner, the clock broke the
  // tie — say "same guesses, but faster" rather than "fewest guesses".
  const winnerState = playerStates.find((p) => p.user_id === winnerId)
  const wonByClock =
    !!winnerState &&
    playerStates.some(
      (p) =>
        p.user_id !== winnerId &&
        p.solved &&
        p.guesses_used === winnerState.guesses_used,
    )
  // Did the viewer lose specifically on the clock (tied the winner's
  // guess count but solved later)?
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

  // Locally terminal (compete only): I'm done — solved, or out of my own guesses
  // — but the game continues for the others still racing. Coop has no such state
  // (one shared board: over for me ⇒ over for everyone). Shown as the terminal
  // LOOK (a status line + Concede), not a quietly-swapped help line.
  const isLocallyDone =
    !isTerminal && isCompete && (mySolved || guessesUsed >= maxGuesses)

  const wordleSetup = setup as WordleSetup

  // Manual end — the friends agreeing to stop (a neutral terminal). Confirmed
  // because it's irreversible; an RPC failure flashes in the local feedback slot.
  const handleEndGame = async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) setLocalMsg(localPill('error', error.message))
  }

  // The End / Concede button — error-toned (red). Compete uses CONCEDE ("I give
  // up, you win"); coop uses the neutral "End" (a mutual "we're done"). Shared by
  // the playing and the locally-terminal action rows.
  const endButton = isCompete ? (
    <ConcedeGameButton onClick={() => void handleEndGame()} className={shared.helperButton} />
  ) : (
    <EndGameButton label="End" onClick={() => void handleEndGame()} className={shared.helperButton} />
  )

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <div className={shared.boardCol}>
        <WordleGrid
          rows={rows}
          current={current}
          pending={pendingWord}
          maxGuesses={game.max_guesses}
          active={canGuess}
          brand={brand}
        />
        {/* Local feedback area — between the board and the keyboard (Joel's call).
            A fixed-height slot so neither the board above nor the keyboard below
            reflows when the own-move pill appears/clears; it holds the centered
            soft-reject / error pill, and is empty (but space-reserving)
            otherwise. */}
        <div className={styles.feedbackSlot}>
          {localMsg && <FeedbackPill msg={localMsg} onClose={noop} />}
        </div>
        <Keyboard
          keyStates={keyStates}
          onKey={typeLetter}
          onEnter={() => void doSubmit(current)}
          onBackspace={deleteLetter}
          disabled={!canGuess}
        />
      </div>

      <div className={shared.infoCol}>
        <div className={shared.actionSlot}>
          {!self && (
            <p className={shared.infoHelp}>Watching — you&rsquo;re not in this game.</p>
          )}

          {/* State — the live guess count (the viewer's own; coop shares it). */}
          <p className={shared.infoState}>
            <strong>{guessesUsed}/{maxGuesses}</strong> guesses
          </p>

          {/* Opponent strip (compete) — each racer's guess COUNT (not their
              letters, which RLS hides until terminal). */}
          {isCompete && (
            <OpponentStrip
              players={members}
              selfId={session.user.id}
              metricLabel="Guesses"
              metricFor={(p, isSelf) =>
                isSelf
                  ? guessesUsed
                  : (playerStates.find((s) => s.user_id === p.user_id)?.guesses_used ?? 0)
              }
            />
          )}

          {/* Action row — three states. Terminal: the outcome line + back-to-club.
              Locally terminal (compete, I'm done while others race): the terminal
              LOOK — "Waiting for others" + Concede. Playing: just End/Concede
              (wordle has no hint/reveal). */}
          {over ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>
                {over.message}
              </span>
              <BackToClubButton onClick={goToClub} compact />
            </div>
          ) : isLocallyDone ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared.outcome_neutral)}>
                Waiting for others
              </span>
              {endButton}
            </div>
          ) : (
            <div className={shared.infoActions}>{endButton}</div>
          )}

          {/* Help — only while you can act (never a silent swap; the locally-done
              state is carried loudly by the action row above). */}
          {!over && !isLocallyDone && (
            <p className={shared.infoHelp}>Type a 5-letter word, then Enter.</p>
          )}

          {/* Setup — last, behind a disclosure (closed by default). */}
          <details className={shared.infoSetup}>
            <summary>Setup options</summary>
            <ul>
              <li>{maxGuesses} guesses</li>
              <li>Answer: {answerSourceLabel(wordleSetup.answer_source)}</li>
              <li>
                Legal guesses: {DIFFICULTY_LABELS[wordleSetup.legal_guess - 1] ?? '—'} or easier
              </li>
              <li>{timerLabel(wordleSetup.timer)}</li>
            </ul>
          </details>
        </div>

        {/* Bottom region: the guess list. Coop shows everyone's (tagged with
            who); compete shows only the viewer's own (RLS hides opponents — the
            opponent reveal grids are deliberately punted for now). */}
        <GuessList guesses={myGuesses} players={members} showWho={!isCompete} />
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
 * Per-status terminal copy. `outcome` + `verdict` drive the `<GameOverModal>`;
 * `message` + `tone` drive the short, color-coded info-column outcome line (the
 * shared `TerminalCopy` shape, like psychicnum / connections). Mode- and
 * (compete) self-aware.
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
      return { outcome: 'won', verdict: 'Solved it! 🎉', message: 'Solved it!', tone: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'Out of time.' : 'Out of guesses.',
      message: timerExpired ? 'Out of time' : 'Out of guesses',
      tone: 'lost',
    }
  }
  // compete. The winner is fewest-guesses, clock-as-tiebreak — so the
  // copy distinguishes "fewest guesses" from "same guesses, but faster".
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
