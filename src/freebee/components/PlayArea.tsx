import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { WordLookupDialog } from '../../common/components/WordLookupDialog'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import type { GamePageCtx, Member } from '../../common/lib/games'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { useGlobalKeyHandler } from '../../common/hooks/useGlobalKeyHandler'
import { usePeerFeedback } from '../hooks/usePeerFeedback'
import { readLeaderboard } from '../lib/leaderboard'
import { currentRankIndex, RANKS } from '../lib/ranks'
import type { FreeBeeSetup } from '../lib/setup'
import { Actions } from './Actions'
import type { WordResultTone } from './Feedback'
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
const RESULT_TONE: Record<string, WordResultTone> = {
  accepted: 'success',
  bonus: 'success',
  pangram: 'success',
  alreadyFound: 'warning',
  tooShort: 'warning',
  badLetters: 'error',
  missingCenter: 'error',
  notAWord: 'error',
}

/** Short human-readable label for each result enum. The typed
 *  word is prefixed at render time for context.
 *
 *  `bonus` reads identically to `accepted`: a bonus word scores the
 *  same points as a required word (submit_word computes length-based +
 *  pangram points for it — see the freebee migration), it just
 *  doesn't count toward the "X / Y words" denominator. That internal
 *  distinction isn't worth surfacing to the player, and the old
 *  "Bonus — no points" was simply wrong — they DO earn points. */
const RESULT_LABEL: Record<string, string> = {
  accepted: 'Good!',
  bonus: 'Good!',
  pangram: 'Pangram!',
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
 * freebee's play surface — shared between the coop and compete
 * manifests. Mode is read off `game.mode` (denormalized at
 * create_game time, surfaced on `freebee.games_state`).
 *
 * Per-mode rendering:
 *   - **Coop**: shared score, shared rank bar, shared WordList
 *     showing every player's finds with per-finder color, score
 *     reaches Genius at 70% of total. Terminal verdict on
 *     `ended` is Genius (rank ≥ 6) vs Stopped (rank < 6).
 *   - **Compete**: caller-only score, caller-only WordList (RLS
 *     filters peer rows during play), OpponentStrip in the
 *     side panel showing each opponent's current rank — that's
 *     the entire "what opponents know about you" surface during
 *     play. Terminal verdict on `won_compete` is "You won the
 *     race!" vs "Beaten to the punch."; `ended` with
 *     `outcome=timeout`/`manual` is "No winner at <rank>".
 *
 * Cross-cutting chrome (header / pause / chat / timer) lives in
 * `<GamePage>` above this component.
 */
export function PlayArea(ctx: GamePageCtx) {
  const {
    gameId, isTerminal, menu, playState, players, session, status,
    setup, goToClub,
    // The COMMON header feedback slot. Aliased so it doesn't clash with the
    // local in-body `feedback` state below — the two are different surfaces:
    // `headerFeedback` carries peer/opponent events (usePeerFeedback), the
    // local pill carries the player's own word result.
    feedback: headerFeedback,
  } = ctx
  const { game, foundWords, loading } = useGame(gameId)

  const freebeeSetup = setup as FreeBeeSetup

  // Score + words-found derived from the FE's view of
  // freebee.found_words. The bucket of rows we sum depends on mode:
  //
  //   - coop: the team's total — every visible row (everyone's).
  //   - compete: the *caller's own* rows only.
  //
  // Mid-game RLS already narrows compete rows to the caller, so a
  // naive "sum every row" matched both modes. But post-terminal the
  // reveal opens peers' rows (so the WordList can show cat B), which
  // would otherwise inflate the caller's score/rank at game end. So
  // compete filters to the caller explicitly rather than leaning on
  // RLS, and stays correct across the terminal transition.
  //
  // foundWordsCount counts ALL of the viewer's accepted submissions
  // (required + bonus). Matches freebee-ws's "found.length" stat —
  // the displayed "X / Y words" can legitimately overshoot Y (the
  // required goal) when the player digs into the bonus list. The
  // denominator (game.required_words_count) stays required-only.
  // foundWordsScore sums every row's points, which include bonus-word
  // points (bonus words score the same as required words).
  const myFoundRows = useMemo(
    () =>
      game?.mode === 'compete'
        ? foundWords.filter((r) => r.user_id === session.user.id)
        : foundWords,
    [foundWords, game?.mode, session.user.id],
  )
  const { foundWordsScore, foundWordsCount } = useMemo(() => {
    let s = 0
    for (const row of myFoundRows) {
      s += row.points
    }
    return { foundWordsScore: s, foundWordsCount: myFoundRows.length }
  }, [myFoundRows])

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
  // bumps the seed, which re-runs the memo and produces a fresh
  // order.
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
    void shuffleSeed
    return shuffled(Array.from(outerLetters))
  }, [outerLetters, shuffleSeed])

  const handleShuffle = useCallback(() => {
    setShuffleSeed((s) => s + 1)
  }, [])

  // ─── Typed-word state ──────────────────────────────────
  const [word, setWord] = useState('')
  // The last word the player submitted, kept so ArrowUp can recall it into the
  // input for quick editing (add an 'S' for the plural, fix a typo, …).
  // FE-only — never shared or stored.
  const [lastWord, setLastWord] = useState('')

  // ─── "Look up any word" dialog (tilde shortcut) ────────
  const [lookupOpen, setLookupOpen] = useState(false)

  const handleLetterClick = useCallback((letter: string) => {
    setWord((prev) => prev + letter.toUpperCase())
  }, [])

  const handleDelete = useCallback(() => {
    setWord((prev) => prev.slice(0, -1))
  }, [])

  // ─── Feedback + auto-clear ─────────────────────────────
  const [feedback, setFeedback] = useState<{
    message: string
    tone: WordResultTone
  }>({ message: '', tone: 'success' })

  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showFeedback = useCallback((message: string, tone: WordResultTone) => {
    setFeedback({ message, tone })
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current)
    }
    clearTimerRef.current = setTimeout(() => {
      setFeedback({ message: '', tone: 'success' })
      clearTimerRef.current = null
    }, FEEDBACK_TIMEOUT_MS)
  }, [])

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
    // Remember what was submitted so ArrowUp can recall it (the word clears on
    // submit, including a rejected one — recalling lets them fix it too).
    setLastWord(word)
    setSubmitting(true)
    try {
      const { data, error } = await db.rpc('submit_word', {
        target_game: gameId,
        word,
      })
      if (error) {
        showFeedback(error.message, 'error')
        return
      }
      // submit_word returns { result, points } — points lets us show the score
      // earned (and the result enum carries 'pangram') without re-deriving the
      // point rules on the FE.
      const payload =
        (data as unknown as { result: string; points: number } | null)
        ?? { result: 'notAWord', points: 0 }
      const tone = RESULT_TONE[payload.result] ?? 'error'
      const label = RESULT_LABEL[payload.result] ?? payload.result
      // Scoring results (accepted / bonus / pangram) carry points > 0.
      const suffix = payload.points > 0 ? ` +${payload.points}pts` : ''
      showFeedback(`${word.toUpperCase()}: ${label}${suffix}`, tone)
      setWord('')
    } finally {
      setSubmitting(false)
    }
  }, [gameId, isTerminal, showFeedback, submitting, word])

  // ─── Global keyboard handler ───────────────────────────
  useGlobalKeyHandler(
    useCallback(
      (e: KeyboardEvent) => {
        // useGlobalKeyHandler already drops keystrokes aimed at a focused
        // text field (chat, dialogs), so everything below only ever runs
        // for board-level input — never while the user is typing in chat.

        // Tilde opens the "look up any word" dialog. Handled BEFORE the
        // loading/terminal guards so it works in every state — chasing
        // a "see X" definition during the post-game reveal is a prime use.
        if (e.key === '~') {
          e.preventDefault()
          setLookupOpen(true)
          return
        }

        if (loading || !game) return
        if (isTerminal) return

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
          void handleSubmit()
          return
        }
        // ArrowUp recalls the previously-submitted word into the input for
        // editing — fast "add an S" entry. (The hook's field guard means
        // this only fires for word entry, never in chat.)
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (lastWord) setWord(lastWord)
          return
        }
        // ArrowDown clears the current entry.
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setWord('')
          return
        }
        if (e.key === ' ') {
          e.preventDefault()
          handleShuffle()
          return
        }
      },
      [game, handleShuffle, handleSubmit, isTerminal, lastWord, loading],
    ),
  )

  // ─── End-game action (per-game menu item) ──────────────
  // Available in both modes. In compete, manual end terminates
  // the race with everyone {won:false} — friends agreeing to stop
  // the race is a valid outcome, not a "you lose" punishment.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm('End the game now? You can\'t undo this.')) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) {
      showFeedback(`End game failed: ${error.message}`, 'error')
    }
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

  // Peer/opponent activity → header feedback pills (coop: a peer found a
  // word; compete: an opponent climbed a rank). Self-activity is excluded —
  // it's reported by the in-body pill / RankBar. Called unconditionally,
  // before the early returns, and reads `game?.mode` (null while loading; the
  // hook no-ops until loaded + bootstrapped).
  usePeerFeedback({
    loading,
    mode: game?.mode,
    selfUserId: session.user.id,
    players,
    foundWords,
    status,
    feedback: headerFeedback,
  })

  // Called UNCONDITIONALLY here, before any early returns —
  // React forbids conditional hook calls.
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  if (loading) {
    return <div className={styles.loading}>Loading…</div>
  }
  if (!game) {
    return <div className={styles.empty}>Game not found.</div>
  }

  const isCompete = game.mode === 'compete'

  // Caller's current rank in the local ladder. For compete this
  // is the value the OpponentStrip surfaces for the "You:
  // <rank>" entry. For coop it's the team rank (same number, same
  // computation — the RLS-narrowed sum just happens to equal the
  // team sum in coop because everyone sees every row).
  const selfRankIdx = currentRankIndex(foundWordsScore, game.required_words_score)

  // Compete-only: pull the leaderboard payload off the live
  // status jsonb. Pre-first-submission the array is empty and
  // the strip falls back to placeholder zeros for opponents.
  const leaderboard = isCompete
    ? readLeaderboard(status)
    : null
  // Target rank reads off `setup`, NOT `status.target_rank`. Setup
  // is fixed at create_game time and lives on every code path; the
  // status copy is written by submit_word's mid-game path and by
  // the won_compete terminal, but submit_timeout + end_game don't
  // re-emit it on the terminal status. Reading from setup avoids
  // a "Time up — no winner at Genius" verdict on a game that
  // actually targeted Amazing.
  const targetRankIdx = isCompete
    ? (freebeeSetup.target_rank ?? null)
    : null

  const over = isTerminal
    ? buildOver({
      mode: game.mode,
      playState,
      status,
      targetRankIdx,
      foundWordsScore,
      requiredWordsScore: game.required_words_score,
      selfRankIdx,
      selfUserId: session.user.id,
      players,
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
              <BackToClubButton onClick={goToClub} />
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
        <RankBar score={foundWordsScore} total={game.required_words_score} />
        {isCompete && targetRankIdx !== null && (() => {
          // Index the leaderboard by user so the metric callback can
          // pull each opponent's rank by id. leaderboard is null until
          // the compete branch above populates it (and stays null in
          // coop, which never reaches this guard), so default to [].
          const byUserId = new Map(
            leaderboard?.map((e) => [e.user_id, e]) ?? [],
          )
          return (
            <OpponentStrip
              players={players}
              selfId={session.user.id}
              leading={<>target: <strong>{RANKS[targetRankIdx]}</strong></>}
              // Self reads its rank from the local FE computation
              // (selfRankIdx) so "You" updates in lock step with the
              // RankBar above; peers read from the leaderboard payload.
              metricFor={(p, isSelf) => {
                const rankIdx = isSelf
                  ? selfRankIdx
                  : (byUserId.get(p.user_id)?.rank_idx ?? 0)
                return RANKS[rankIdx]
              }}
            />
          )
        })()}
        <Stats
          foundWordsScore={foundWordsScore}
          requiredWordsScore={game.required_words_score}
          foundWordsCount={foundWordsCount}
          requiredWordsCount={game.required_words_count}
        />
        <WordList
          foundWords={foundWords}
          players={players}
          foundWordsCount={foundWordsCount}
          requiredWordsCount={game.required_words_count}
          // Once terminal, games_state surfaces the full required-
          // words list via _required_words_for. Pre-terminal
          // game.requiredWords is null and WordList skips reveal.
          revealWords={game.requiredWords}
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
      {lookupOpen && (
        <WordLookupDialog onClose={() => setLookupOpen(false)} />
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
 * Coop:
 *   - `playState='ended'` + Genius rank → "Genius! N/M points."
 *   - `playState='ended'` + lower rank → "Stopped at <rank> —
 *     N/M points." (covers timeout AND manual end, since the
 *     player already knows which one happened)
 *
 * Compete:
 *   - `playState='won_compete'` + caller is winner → "You won
 *     the race — reached <rank>!"
 *   - `playState='won_compete'` + caller is NOT winner → "<name>
 *     beat you to <rank>."
 *   - `playState='ended'` with outcome='timeout' → "Time's up —
 *     no winner at <rank>."
 *   - `playState='ended'` with outcome='manual' → "Game ended —
 *     no winner at <rank>."
 */
function buildOver({
  mode,
  playState,
  status,
  targetRankIdx,
  foundWordsScore,
  requiredWordsScore,
  selfRankIdx,
  selfUserId,
  players,
}: {
  mode: 'coop' | 'compete'
  playState: string
  status: Record<string, unknown> | null
  /** From `setup.target_rank` — null in coop, present in compete. */
  targetRankIdx: number | null
  foundWordsScore: number
  requiredWordsScore: number
  selfRankIdx: number
  selfUserId: string
  players: Member[]
}): {
  outcome: 'won' | 'lost'
  verdict: string
  indicator: string
} {
  const rankName = RANKS[selfRankIdx]

  if (mode === 'compete') {
    // Passed in from setup, not derived here — see the comment at
    // the call site for why status is the wrong source for this.
    const targetRankName = RANKS[targetRankIdx ?? 6]

    if (playState === 'won_compete') {
      const winnerId = (status?.winner_user_id as string | undefined) ?? null
      const selfWon = winnerId === selfUserId
      if (selfWon) {
        return {
          outcome: 'won',
          verdict: `You won the race — reached ${targetRankName}!`,
          indicator: `you won at ${targetRankName}`,
        }
      }
      const winnerName =
        players.find((p) => p.user_id === winnerId)?.username ?? 'someone'
      return {
        outcome: 'lost',
        verdict: `${winnerName} beat you to ${targetRankName}.`,
        indicator: `${winnerName} won at ${targetRankName}`,
      }
    }

    // playState='ended' in compete: timeout or manual. No winner
    // either way — the race didn't finish.
    const outcome = (status?.outcome as string | undefined) ?? 'ended'
    if (outcome === 'timeout') {
      return {
        outcome: 'lost',
        verdict: `Time's up — no winner at ${targetRankName}.`,
        indicator: `time up — no winner at ${targetRankName}`,
      }
    }
    return {
      outcome: 'lost',
      verdict: `Game ended — no winner at ${targetRankName}.`,
      indicator: `ended — no winner at ${targetRankName}`,
    }
  }

  // coop
  if (selfRankIdx >= 6) {
    return {
      outcome: 'won',
      verdict: `Genius! ${foundWordsScore}/${requiredWordsScore} points.`,
      indicator: `Genius! ${foundWordsScore}/${requiredWordsScore} points`,
    }
  }
  return {
    outcome: 'won',
    verdict: `Stopped at ${rankName} — ${foundWordsScore}/${requiredWordsScore} points.`,
    indicator: `stopped at ${rankName}`,
  }
}
