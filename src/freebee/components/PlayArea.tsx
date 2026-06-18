import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GameOverModal } from '../../common/components/GameOverModal'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import type { GamePageCtx } from '../../common/lib/games'
import { formatTimerSeconds } from '../../common/hooks/useGameTimer'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { useGlobalKeyHandler } from '../hooks/useGlobalKeyHandler'
import { currentRankIndex, RANKS } from '../lib/ranks'
import type { FreeBeeSetup } from '../lib/setup'
import { Actions } from './Actions'
import type { FeedbackTone } from './Feedback'
import { Feedback } from './Feedback'
import { Letters } from './Letters'
import { RankBar } from './RankBar'
import { Stats } from './Stats'
import { WordInput } from './WordInput'
import { WordList } from './WordList'
import styles from './PlayArea.module.css'

import '../theme.css'

/** How long a feedback pill stays on screen before auto-clearing. */
const FEEDBACK_TIMEOUT_MS = 2500

/**
 * Maps each `submit_word` result-enum value to the visual tone
 * the feedback pill renders. See the RPC for the full enum.
 */
const RESULT_TONE: Record<string, FeedbackTone> = {
  accepted: 'success',
  bonus: 'success',
  alreadyFound: 'warning',
  tooShort: 'warning',
  badLetters: 'error',
  missingCenter: 'error',
  notAWord: 'error',
}

/** Short human-readable label for each result enum. The typed
 *  word is prefixed at render time for context. */
const RESULT_LABEL: Record<string, string> = {
  accepted: 'Good!',
  bonus: 'Bonus — no points',
  alreadyFound: 'Already found',
  tooShort: 'Too short',
  badLetters: 'Bad letters',
  missingCenter: 'Missing center letter',
  notAWord: 'Not a word',
}

/** Fisher–Yates shuffle on a copy. Pure — doesn't mutate input. */
function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * freebee's play surface (Phase 3 — input loop only).
 *
 * Responsibilities:
 *   - Render the honeycomb (Letters), the in-progress word
 *     (WordInput), the feedback pill (Feedback), and the
 *     three action buttons (Actions).
 *   - Track the typed word as local state, with click handlers
 *     for the letters + a global key handler for typing.
 *   - Fire `freebee.submit_word` and map the result enum to
 *     a feedback message.
 *   - Auto-clear feedback after a short timeout.
 *   - Lock interaction (disable Delete + Enter) when the game
 *     is terminal. Shuffle stays clickable post-end so the user
 *     can fidget without losing the board state.
 *
 * What this phase does NOT do (yet):
 *   - Render found words. The list + per-finder color comes in
 *     Phase 4 (WordList).
 *   - Score + rank meter. Same.
 *   - Definition popover. Common feature; deferred per the plan.
 *
 * The component reads game data via `useGame(gameId)` (Pattern A
 * useRealtimeRefetch) and the cross-cutting chrome (header,
 * timer, pause, chat) lives in `<GamePage>` upstream.
 */
export function PlayArea(ctx: GamePageCtx) {
  const { gameId, isTerminal, menu, playState, players, timer, setup, goToClub } = ctx
  const { game, foundWords, loading } = useGame(gameId)

  // Cast setup to FreeBeeSetup so the timer-mode display below
  // can read `setup.timer.kind` for the "—" timer-cell case.
  const freebeeSetup = setup as FreeBeeSetup

  // Score + words-found derived from the FE's view of
  // freebee.found_words. The server computes the same values
  // from the same source for status.score / status.words_found;
  // the two agree as long as everyone reads from the canonical
  // table. Bonus rows have points=0 and don't count toward
  // words_found.
  const { score, wordsFound } = useMemo(() => {
    let s = 0
    let w = 0
    for (const row of foundWords) {
      s += row.points
      if (!row.is_bonus) w += 1
    }
    return { score: s, wordsFound: w }
  }, [foundWords])

  // ─── Allowed-letter set (drives illegal-letter dim) ────
  const allowedLetters = useMemo(() => {
    if (!game) return new Set<string>()
    const s = new Set<string>()
    for (const ch of game.outer_letters) s.add(ch.toLowerCase())
    s.add(game.center_letter.toLowerCase())
    return s
  }, [game])

  // ─── Local visual shuffle of the outer letters ─────────
  // Rather than store the shuffled order in state (which would
  // need a useEffect to sync from the loaded game and trip the
  // set-state-in-effect lint rule), we store a `shuffleSeed`
  // counter and recompute via useMemo. The first computation
  // happens once outer_letters is non-null; each Shuffle click
  // bumps the seed, which re-runs the memo and produces a
  // fresh order.
  //
  // **Dep is the outer_letters STRING, not the `game` object.**
  // useGame refetches on every realtime event (e.g., every
  // accepted submit_word echo), each refetch returns a fresh
  // game object reference even when outer_letters didn't change.
  // Depending on `game` would re-shuffle the tiles on every
  // submission — same bug freebee-ws didn't have because that
  // codebase held the letters in a different state shape. The
  // string is a primitive so identity equality matches.
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const outerLetters = game?.outer_letters

  const outerShuffled = useMemo(() => {
    if (!outerLetters) return []
    // The seed is in the dep array but its value isn't read —
    // bumping it is what tells React to re-run the memo. The
    // body itself just shuffles fresh from the source letters.
    void shuffleSeed
    return shuffled(Array.from(outerLetters))
  }, [outerLetters, shuffleSeed])

  const handleShuffle = useCallback(() => {
    setShuffleSeed((s) => s + 1)
  }, [])

  // ─── Typed-word state ──────────────────────────────────
  const [word, setWord] = useState('')

  const handleLetterClick = useCallback((letter: string) => {
    setWord((prev) => prev + letter.toUpperCase())
  }, [])

  const handleDelete = useCallback(() => {
    setWord((prev) => prev.slice(0, -1))
  }, [])

  // ─── Feedback + auto-clear ─────────────────────────────
  const [feedback, setFeedback] = useState<{
    message: string
    tone: FeedbackTone
  }>({ message: '', tone: 'success' })

  // Track the latest timeout id so a fresh submit cancels any
  // pending clear. Stored in a ref because we don't want the
  // clearing to re-run on every render.
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showFeedback = useCallback((message: string, tone: FeedbackTone) => {
    setFeedback({ message, tone })
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current)
    }
    clearTimerRef.current = setTimeout(() => {
      setFeedback({ message: '', tone: 'success' })
      clearTimerRef.current = null
    }, FEEDBACK_TIMEOUT_MS)
  }, [])

  // Clean up any pending timer on unmount so PauseBoundary's
  // child-unmount on pause doesn't leak a setTimeout.
  useEffect(function clearFeedbackTimerOnUnmount() {
    return () => {
      if (clearTimerRef.current !== null) {
        clearTimeout(clearTimerRef.current)
      }
    }
  }, [])

  // ─── Submit ────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (submitting || word.length === 0 || isTerminal) return
    setSubmitting(true)
    try {
      const { data, error } = await db.rpc('submit_word', {
        target_game: gameId,
        word,
      })
      if (error) {
        // Hard errors are auth / not-a-player / game-not-in-progress.
        // Surface the message verbatim — friends-only audience, no
        // sanitization needed.
        showFeedback(error.message, 'error')
        return
      }
      const result = (data ?? 'notAWord') as string
      const tone = RESULT_TONE[result] ?? 'error'
      const label = RESULT_LABEL[result] ?? result
      showFeedback(`${word.toUpperCase()}: ${label}`, tone)
      // Always clear the typed word after a submit attempt —
      // matches freebee-ws UX. The user can up-arrow to recall
      // the last word; that's a Phase 4 polish item.
      setWord('')
    } finally {
      setSubmitting(false)
    }
  }, [gameId, isTerminal, showFeedback, submitting, word])

  // ─── Global keyboard handler ───────────────────────────
  useGlobalKeyHandler(
    useCallback(
      (e: KeyboardEvent) => {
        // Skip when focus is in an input/textarea — the chat box
        // or a setup field shouldn't dispatch into the board.
        const target = e.target as HTMLElement | null
        if (
          target
          && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
        ) {
          return
        }
        if (loading || !game) return
        if (isTerminal) return

        // Letter keys: a-z (one character) goes into the typed word.
        if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
          setWord((prev) => prev + e.key.toUpperCase())
          return
        }
        if (e.key === 'Backspace') {
          e.preventDefault()
          setWord((prev) => prev.slice(0, -1))
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          // handleSubmit is intentionally fire-and-forget here —
          // the keydown event doesn't await anything. The
          // submitting-guard inside handleSubmit prevents the
          // race where the user mashes Enter.
          void handleSubmit()
          return
        }
        if (e.key === ' ') {
          // Space = shuffle, matching freebee-ws. preventDefault
          // so the browser doesn't scroll.
          e.preventDefault()
          handleShuffle()
          return
        }
      },
      [game, handleShuffle, handleSubmit, isTerminal, loading],
    ),
  )

  // ─── End-game action (per-game menu item) ──────────────
  // freebee has no intrinsic terminal state — coop play continues
  // until either the countdown hits 0 or the friends agree they're
  // done. The "agree they're done" path is this menu item; it
  // fires freebee.end_game which flips play_state='ended' with
  // status.outcome='manual'. The window.confirm guard catches
  // the misclick — light UI bar matching the alpha-software prior.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm('End the game now? You can\'t undo this.')) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) {
      // Surface in the existing feedback pill; the user already
      // dismissed the confirm so an error is unexpected.
      showFeedback(`End game failed: ${error.message}`, 'error')
    }
    // No optimistic UI — once the RPC commits, useCommonGame's
    // realtime sub on common.games sees is_terminal=true and the
    // GameOverModal pops via useTerminalModal below.
  }, [gameId, isTerminal, showFeedback])

  useEffect(function syncMenuItems() {
    menu.setGameItems([
      {
        id: 'end-game',
        label: 'End game',
        onClick: () => void handleEndGame(),
        disabled: isTerminal,
      },
    ])
    return () => menu.setGameItems([])
  }, [handleEndGame, isTerminal, menu])

  // ─── Terminal modal + verdict mapping ──────────────────
  // Shared scaffold: open on mount if already-terminal, re-pop
  // when isTerminal flips during play, no re-pop after dismiss.
  // See common/hooks/useTerminalModal.ts.
  //
  // Called UNCONDITIONALLY here, before any early returns —
  // React forbids conditional hook calls. The early returns
  // below are pure-render branches that all happen after every
  // hook has run.
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  // ─── Early returns ─────────────────────────────────────
  // Saved (suspended / terminal) freebee games trip these on
  // every reopen: the realtime channel attaches, then `load()`
  // resolves async, so the first render has `loading=true` and
  // `game=null`. Without the guards, the JSX below would
  // dereference `game.center_letter` and crash.
  if (loading) {
    return <div className={styles.loading}>Loading…</div>
  }
  if (!game) {
    return <div className={styles.empty}>Game not found.</div>
  }

  // ─── Derived values (game is guaranteed non-null) ──────
  // Timer display: "—" when timer mode is none (countup / countdown
  // share the same MM:SS render). The useGameTimer hook upstream
  // gives us displaySeconds regardless of mode; we only need to
  // decide whether to surface the digits or the em-dash.
  const timerDisplay =
    freebeeSetup.timer?.kind === 'none'
      ? '—'
      : formatTimerSeconds(timer.displaySeconds)

  // The verdict mapper is pure: given playState + the final
  // stats, return modal + indicator copy. Kept alongside the
  // render so future mode/outcome additions land in one place.
  //
  // status.outcome isn't on GamePageCtx today (it lives on
  // common.games and the ctx doesn't surface the full jsonb).
  // For v1 we derive the outcome from `playState` + the
  // foundWords-derived score, which is sufficient to choose
  // between "Genius!" and "Time's up — you reached <rank>".
  // When the ctx exposes status, threading it through here is
  // the cleanup.
  const over = isTerminal
    ? buildOver({
      playState,
      score,
      totalScore: game.total_score,
    })
    : null

  return (
    <div className={styles.playArea}>
      <div className={styles.inputColumn}>
        <WordInput word={word} allowedLetters={allowedLetters} />
        {isTerminal && over
          ? (
            <div className={styles.terminalIndicator}>
              <span>Game over — {over.indicator}</span>
              <button type="button" onClick={goToClub}>
                Back to club
              </button>
            </div>
          )
          : <Feedback message={feedback.message} tone={feedback.tone} />}
        <Letters
          outerLetters={outerShuffled}
          centerLetter={game.center_letter}
          onLetterClick={handleLetterClick}
        />
        <Actions
          wordEmpty={word.length === 0}
          locked={isTerminal}
          onDelete={handleDelete}
          onShuffle={handleShuffle}
          onSubmit={() => void handleSubmit()}
        />
      </div>
      <div className={styles.sidePanel}>
        <RankBar score={score} total={game.total_score} />
        <Stats
          score={score}
          totalScore={game.total_score}
          wordsFound={wordsFound}
          totalWords={game.total_words}
          timerDisplay={timerDisplay}
        />
        <WordList
          foundWords={foundWords}
          players={players}
          scoringFoundCount={wordsFound}
          totalWords={game.total_words}
          // Once terminal, games_state surfaces the full scoring
          // list via the _reveal_if_terminal helpers. Pre-terminal
          // game.scoringWords is null and WordList skips reveal.
          revealWords={game.scoringWords}
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

/**
 * Maps the terminal play_state to:
 *   - `outcome` — the GameOverModal's green/red color cue.
 *   - `verdict` — the centered large-font line in the modal.
 *   - `indicator` — short copy for the in-PlayArea terminal
 *     indicator (the line that replaces the Feedback row once
 *     the modal is dismissed).
 *
 * v1 cases:
 *   - playState='ended' with no further info → derived as
 *     completed-vs-timeout by score: if score reaches Genius
 *     threshold (rank 6) it was almost certainly a 100%-found
 *     completion, and we frame it as a win. Otherwise it's
 *     reasonable to frame as a timeout (the only other v1
 *     terminal path). We can refine when status.outcome flows
 *     down through GamePageCtx — until then, score-based
 *     framing is good enough for the modal copy.
 *
 * Future cases (designed-in):
 *   - 'won_compete' → outcome='won', verdict="<winner> won at
 *     <rank>". Renders when compete mode ships.
 */
function buildOver({
  playState,
  score,
  totalScore,
}: {
  playState: string
  score: number
  totalScore: number
}): {
  outcome: 'won' | 'lost'
  verdict: string
  indicator: string
} {
  const rank = currentRankIndex(score, totalScore)
  const rankName = RANKS[rank]

  if (playState === 'won_compete') {
    return {
      outcome: 'won',
      verdict: 'Compete won!',
      indicator: 'compete winner',
    }
  }

  // playState === 'ended' — covers all three v1 outcomes:
  // 'completed' (100% found), 'timeout' (countdown expired),
  // and 'manual' (the End-game menu item). The ctx doesn't
  // surface status.outcome today so we frame by rank instead:
  // Genius means a near-100% finish (well-played) and gets the
  // green/positive treatment; lower ranks get neutral copy
  // that reads correctly whether the timer ran out or the
  // friends stopped on purpose.
  if (rank >= 6) {
    return {
      outcome: 'won',
      verdict: `Genius! ${score}/${totalScore} points.`,
      indicator: `Genius! ${score}/${totalScore} points`,
    }
  }
  return {
    outcome: 'won',
    verdict: `Stopped at ${rankName} — ${score}/${totalScore} points.`,
    indicator: `stopped at ${rankName}`,
  }
}
