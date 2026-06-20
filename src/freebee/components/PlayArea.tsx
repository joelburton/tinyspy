import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GameOverModal } from '../../common/components/GameOverModal'
import { WordLookupDialog } from '../../common/components/WordLookupDialog'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import type { GamePageCtx, Member } from '../../common/lib/games'
import { colorVarFor } from '../../common/lib/memberColor'
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
 *  same points as a scoring word (submit_word computes length-based +
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
 * One row from the compete-mode leaderboard payload on
 * `common.games.status`. The RPC writes the full array on every
 * submission; the FE reads it from `ctx.status.leaderboard` for
 * the OpponentRanksStrip.
 */
type LeaderboardEntry = {
  user_id: string
  score: number
  rank_idx: number
  words_found: number
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
 *     filters peer rows during play), OpponentRanksStrip in the
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
    gameId, isTerminal, menu, playState, players, session, status, timer,
    setup, goToClub,
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
  // wordsFound counts ALL of the bucket's accepted submissions
  // (scoring + bonus). Matches freebee-ws's "found.length" stat —
  // the displayed "X / Y words" can legitimately overshoot Y when
  // the player digs into the bonus list. The denominator
  // (game.total_words) stays scoring-only. score sums every row's
  // points, which include bonus-word points after the bonus-
  // scoring fix in the freebee migration.
  const scoringRows = useMemo(
    () =>
      game?.mode === 'compete'
        ? foundWords.filter((r) => r.user_id === session.user.id)
        : foundWords,
    [foundWords, game?.mode, session.user.id],
  )
  const { score, wordsFound } = useMemo(() => {
    let s = 0
    for (const row of scoringRows) {
      s += row.points
    }
    return { score: s, wordsFound: scoringRows.length }
  }, [scoringRows])

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
    tone: FeedbackTone
  }>({ message: '', tone: 'success' })

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
      // scoring rules on the FE.
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
        const target = e.target as HTMLElement | null
        if (
          target
          && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
        ) {
          return
        }

        // Tilde opens the "look up any word" dialog. Handled BEFORE the
        // loading/terminal guards so it works in every state — chasing
        // a "see X" definition during the post-game reveal is a prime
        // use. The INPUT/TEXTAREA guard above already lets `~` type
        // literally when a text box (chat, this dialog) has focus.
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
        // editing — fast "add an S" entry. (The INPUT/TEXTAREA guard above
        // means this only fires for word entry, never in chat.)
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

  const timerDisplay =
    freebeeSetup.timer?.kind === 'none'
      ? '—'
      : formatTimerSeconds(timer.displaySeconds)

  // Caller's current rank in the local ladder. For compete this
  // is the value the OpponentRanksStrip surfaces for the "You:
  // <rank>" entry. For coop it's the team rank (same number, same
  // computation — the RLS-narrowed sum just happens to equal the
  // team sum in coop because everyone sees every row).
  const selfRankIdx = currentRankIndex(score, game.total_score)

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
      score,
      totalScore: game.total_score,
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
        {isCompete && targetRankIdx !== null && (
          <OpponentRanksStrip
            players={players}
            leaderboard={leaderboard ?? []}
            selfUserId={session.user.id}
            selfRankIdx={selfRankIdx}
            targetRankIdx={targetRankIdx}
          />
        )}
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
          selfUserId={session.user.id}
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
      {lookupOpen && (
        <WordLookupDialog onClose={() => setLookupOpen(false)} />
      )}
    </div>
  )
}

/** Type-narrow read for status.leaderboard. Returns an empty
 *  array if the field is missing or malformed (defensive — the
 *  server writes it on every submit but pre-first-submission
 *  it's `[]`). */
function readLeaderboard(
  status: Record<string, unknown> | null,
): LeaderboardEntry[] {
  if (!status) return []
  const raw = status.leaderboard
  if (!Array.isArray(raw)) return []
  return raw as LeaderboardEntry[]
}

/**
 * Per-player rank strip for compete mode. Renders
 * "You: Great · Bea: Nice · Cade: Solid · target: Amazing", with
 * each name in their profile color so the strip matches the rest
 * of the multiplayer chrome.
 *
 * Per the design decision, opponents see RANK ONLY — no raw
 * score, no words-found count. The leaderboard payload carries
 * all three; the strip ignores the latter two. Matches wordknit's
 * OpponentMistakesStrip framing.
 *
 * Self's rank reads from the local FE computation (`selfRankIdx`,
 * derived from caller-narrowed `foundWords`) rather than from the
 * leaderboard entry; that way the strip's "You" updates in lock
 * step with the RankBar above it, without waiting for the round-
 * trip refresh of `common.games.status`.
 */
function OpponentRanksStrip({
  players,
  leaderboard,
  selfUserId,
  selfRankIdx,
  targetRankIdx,
}: {
  players: Member[]
  leaderboard: LeaderboardEntry[]
  selfUserId: string
  selfRankIdx: number
  targetRankIdx: number
}) {
  const byUserId = new Map<string, LeaderboardEntry>()
  for (const entry of leaderboard) byUserId.set(entry.user_id, entry)

  // Sort: self first, then peers by username for stable order.
  const ordered = [...players].sort((a, b) => {
    if (a.user_id === selfUserId) return -1
    if (b.user_id === selfUserId) return 1
    return a.username.localeCompare(b.username)
  })

  return (
    <div className={styles.opponentStrip}>
      <div className={styles.opponentTargetRow}>
        target: <strong>{RANKS[targetRankIdx]}</strong>
      </div>
      <div className={styles.opponentEntries}>
        {ordered.map((p, i) => {
          const rankIdx = p.user_id === selfUserId
            ? selfRankIdx
            : (byUserId.get(p.user_id)?.rank_idx ?? 0)
          const label = p.user_id === selfUserId ? 'You' : p.username
          return (
            <span key={p.user_id} className={styles.opponentEntry}>
              {i > 0 && <span className={styles.opponentSep}>·</span>}
              <strong style={{ color: colorVarFor(p.color) }}>{label}</strong>
              : {RANKS[rankIdx]}
            </span>
          )
        })}
      </div>
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
  score,
  totalScore,
  selfRankIdx,
  selfUserId,
  players,
}: {
  mode: 'coop' | 'compete'
  playState: string
  status: Record<string, unknown> | null
  /** From `setup.target_rank` — null in coop, present in compete. */
  targetRankIdx: number | null
  score: number
  totalScore: number
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
