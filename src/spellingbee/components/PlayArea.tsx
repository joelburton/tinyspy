import { useCallback, useMemo, useState } from 'react'
import { cls } from '../../common/lib/cls'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { FeedbackPill } from '../../common/components/FeedbackPill'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { SubmitButton } from '../../common/components/buttons/SubmitButton'
import { DeleteButton } from '../../common/components/buttons/DeleteButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import type { FeedbackTone, GamePageCtx, Member, TimerMode } from '../../common/lib/games'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { useCaptureKeys, asciiLetters } from '../../common/hooks/useCaptureKeys'
import { usePeerFeedback } from '../hooks/usePeerFeedback'
import { readLeaderboard } from '../lib/leaderboard'
import { currentRankIndex, RANKS } from '../lib/ranks'
import type { SpellingbeeSetup } from '../lib/setup'
import { Letters } from './Letters'
import { RankBar } from './RankBar'
import { Stats } from './Stats'
import { EntryBox } from '../../common/components/EntryBox'
import { TypedWord } from './TypedWord'
import { WordList } from './WordList'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'

import '../theme.css'

/** Local feedback pills are never closeable (sticky, dismissed by the next move),
 *  so the × is never rendered and `onClose` is never called — but `<FeedbackPill>`
 *  requires the prop. */
const noop = () => {}

/**
 * Maps each `submit_word` result-enum value to the visual tone
 * the feedback pill renders. See the RPC for the full enum. These are the
 * shared `FeedbackTone` values now — the in-body word-result pill is the same
 * `<FeedbackPill>` the header uses (`warning` is in the common palette, which is
 * why spellingbee no longer needs its own feedback component / tone type).
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
 *  same points as a required word (submit_word computes length-based +
 *  pangram points for it — see the spellingbee migration), it just
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
 * spellingbee's play surface — shared between the coop and compete
 * manifests. Mode is read off `game.mode` (denormalized at
 * create_game time, surfaced on `spellingbee.games_state`).
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
    gameId, isTerminal, playState, players, session, status,
    setup, goToClub,
    // The COMMON header feedback slot. Aliased so it doesn't clash with the
    // local in-body `feedback` state below — the two are different surfaces:
    // `headerFeedback` carries peer/opponent events (usePeerFeedback), the
    // local pill carries the player's own word result.
    feedback: headerFeedback,
  } = ctx
  const { game, foundWords, loading } = useGame(gameId)

  const spellingbeeSetup = setup as SpellingbeeSetup

  // Score + words-found derived from the FE's view of
  // spellingbee.found_words. The bucket of rows we sum depends on mode:
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
  // (required + bonus). Matches spellingbee-ws's "found.length" stat —
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
  // submission — same bug spellingbee-ws didn't have because that
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

  // ─── Local own-move feedback (sticky) ──────────────────
  // The player's own submission result, shown as a centered <FeedbackPill> in the
  // below-board slot — the same shared pill the header's global feedback uses
  // (docs/design-decisions.md → Feedback). STICKY, not timed: an own-move result
  // is important and the player may be looking at the board when it lands, so it
  // persists until their NEXT move dismisses it rather than vanishing on a timer
  // (docs/design-decisions.md → Dismissal modes). `clearFeedback` is called on
  // every move gesture below — any key the game sees, a hex click, or Delete.
  const [feedback, setFeedback] = useState<{
    message: string
    tone: FeedbackTone
  }>({ message: '', tone: 'success' })

  const showFeedback = useCallback((message: string, tone: FeedbackTone) => {
    setFeedback({ message, tone })
  }, [])

  const clearFeedback = useCallback(() => {
    setFeedback((f) => (f.message === '' ? f : { message: '', tone: 'success' }))
  }, [])

  const handleLetterClick = useCallback((letter: string) => {
    clearFeedback()
    setWord((prev) => prev + letter.toUpperCase())
  }, [clearFeedback])

  const handleDelete = useCallback(() => {
    clearFeedback()
    setWord((prev) => prev.slice(0, -1))
  }, [clearFeedback])

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

  // ─── Capture-entry key handling ────────────────────────
  // The shared capture-key helper owns the universal plumbing (modifier bail, Tab
  // swallow, sticky-feedback dismissal, Backspace / Enter, the 16-char cap).
  // spellingbee's own pieces: letters stored UPPERCASE, and three extra keys —
  // Space shuffles, ArrowUp recalls the last submitted word ("add an S"), ArrowDown
  // clears. (The `~` word-lookup shortcut is app-global; see useAppShortcuts.)
  useCaptureKeys({
    value: word,
    onChange: setWord,
    onSubmit: () => void handleSubmit(),
    disabled: loading || !game || isTerminal,
    onAnyKey: clearFeedback,
    charFor: asciiLetters('upper'),
    onExtraKey: (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (lastWord) setWord(lastWord)
        return true
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setWord('')
        return true
      }
      if (e.key === ' ') {
        e.preventDefault()
        handleShuffle()
        return true
      }
      return false
    },
  })

  // ─── End-game action (info-column button) ──────────────
  // The manual "we're done" stop — an info-column action-row button now (like
  // psychicnum / waffle), off the GamePage menu. Available in both modes; in
  // compete it terminates the race with everyone {won:false} — friends agreeing
  // to stop is a valid outcome, not a "you lose" punishment. Confirmed (it's
  // irreversible); a failure flashes the local feedback.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm('End the game now? You can\'t undo this.')) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) {
      showFeedback(`End game failed: ${error.message}`, 'error')
    }
  }, [gameId, isTerminal, showFeedback])

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
    ? (spellingbeeSetup.target_rank ?? null)
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
    <div className={cls(shared.layout, styles.layout)}>
      <div className={cls(shared.boardCol, styles.boardCol)}>
        <Letters
          outerLetters={outerShuffled}
          centerLetter={game.center_letter}
          onLetterClick={handleLetterClick}
        />
        {/* Shuffle floats over the board's top-right — a fresh visual scan of the
            SAME board, not a turn action (psychicnum's pattern). Always
            clickable, even when locked (a harmless rearrange). */}
        <ShuffleButton
          onShuffle={handleShuffle}
          label="Shuffle outer letters"
          className={shared.floatingShuffle}
        />
        {/* The below-board slot holds exactly ONE of: the input row (typed-word
            display flanked by Delete/Submit), the sticky own-move feedback pill,
            or the terminal pill — they replace each other in a fixed-height slot
            so the board never reflows. The board itself is the letter input; this
            row commits/edits it. */}
        <div className={styles.belowBoard}>
          {isTerminal && over ? (
            /* Terminal: a PERMANENT fill <FeedbackPill> (outcome-colored) carrying
               the game-over line REPLACES the input area. Terminal local feedback
               always lands as a permanent fill pill — it reads *more* like its tone
               (docs/design-decisions.md → Transient vs permanent). The back-to-club
               button is NOT here — it's in the info-column action row. */
            <div className={shared.localFeedback}>
              <FeedbackPill
                msg={{
                  tone:
                    over.tone === 'won'
                      ? 'success'
                      : over.tone === 'lost'
                        ? 'error'
                        : 'neutral',
                  text: `Game over — ${over.indicator}`,
                  variant: 'fill', // permanent → lightened-tone fill
                  dismiss: { kind: 'sticky' }, // never auto- or user-dismissed
                }}
                onClose={noop}
              />
            </div>
          ) : feedback.message && word === '' ? (
            /* Own-action local feedback REPLACES the input row for its beat (a word
               result / validation message) — the shared centered <FeedbackPill>
               (transient outline), so local own-move feedback reads identically to
               the header's global pill. STICKY: it persists until the player's next
               move clears it (the key / hex-click / Delete handlers). Gated on
               word === '' so the moment they type the next word their letters
               reclaim the slot. */
            <div className={shared.localFeedback}>
              <FeedbackPill
                msg={{
                  tone: feedback.tone,
                  text: feedback.message,
                  variant: 'outline',
                  dismiss: { kind: 'sticky' },
                }}
                onClose={noop}
              />
            </div>
          ) : (
            /* The entry row: icon-only Delete (left) flanking the chrome-less
               capture-input box, icon-only Submit (right). The shared purpose
               buttons bake in the glyph, icon-size, tone, and the focus-guard
               (a click must not steal focus from the window keyboard-capture). */
            <div className={styles.inputRow}>
              <DeleteButton
                iconOnly
                onClick={handleDelete}
                disabled={word.length === 0 || isTerminal}
              />
              {/* The shared capture-input box (chrome-less, large, centered; no
                  <input>). spellingbee's per-character illegal-letter dim rides in
                  as the box's children via <TypedWord>. */}
              <EntryBox
                value={word}
                placeholder="Type or click letters"
                className={styles.entry}
              >
                <TypedWord word={word} allowedLetters={allowedLetters} />
              </EntryBox>
              <SubmitButton
                iconOnly
                onClick={() => void handleSubmit()}
                disabled={word.length === 0 || isTerminal}
              />
            </div>
          )}
        </div>
      </div>

      {/* The info column. Its top region — the readouts + action row + setup — is
          wrapped in the shared `.actionSlot` (same as psychicnum / connections /
          codenamesduet / waffle): a fixed-height block so the WordList below it
          doesn't shift when the action row swaps play↔terminal (docs/ui.md →
          Layout stability). Order follows the canonical info-column sequence
          (docs/design-decisions.md → Info column), with two spellingbee picks:
          the RankBar + Stats are ONE "state" unit and lead (the thing you watch),
          and there's no help line — the honeycomb makes the move obvious. The
          WordList fills the rest. */}
      <div className={shared.infoCol}>
        <div className={shared.actionSlot}>
          {/* State — RankBar + Stats are one unit (score progress + the figures),
              kept together and leading. */}
          <RankBar score={foundWordsScore} total={game.required_words_score} />
          <Stats
            foundWordsScore={foundWordsScore}
            requiredWordsScore={game.required_words_score}
            foundWordsCount={foundWordsCount}
            requiredWordsCount={game.required_words_count}
          />

          {/* Opponent strip — below the state unit, per the canonical order. */}
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
                metricLabel="Rank"
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

          {/* Action row: the End-game button during play; at terminal it's
              replaced by the bold, outcome-colored result line + a compact
              back-to-club button. */}
          {over ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>
                {over.message}
              </span>
              <BackToClubButton onClick={goToClub} compact />
            </div>
          ) : (
            <div className={shared.infoActions}>
              <EndGameButton
                className={shared.helperButton}
                onClick={() => void handleEndGame()}
              />
            </div>
          )}

          {/* Setup options — what was picked at create time, behind the shared
              disclosure. Closed by default so it doesn't crowd the status above. */}
          <details className={shared.infoSetup}>
            <summary>Setup options</summary>
            <ul>
              <li>{DIFFICULTY_LABELS[spellingbeeSetup.required - 1] ?? '—'} required words</li>
              <li>{DIFFICULTY_LABELS[spellingbeeSetup.legal - 1] ?? '—'} legal (bonus) words</li>
              {isCompete && targetRankIdx !== null && (
                <li>Target rank: {RANKS[targetRankIdx]}</li>
              )}
              <li>{timerLabel(spellingbeeSetup.timer)}</li>
            </ul>
          </details>
        </div>

        <WordList
          foundWords={foundWords}
          players={players}
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
    </div>
  )
}

/** One-line timer summary for the setup disclosure (same shape the other migrated
 *  games use). */
function timerLabel(t: TimerMode): string {
  if (t.kind === 'countup') return 'count-up timer'
  if (t.kind === 'countdown') {
    const m = Math.floor(t.seconds / 60)
    const s = t.seconds % 60
    return `${m}:${String(s).padStart(2, '0')} countdown`
  }
  return 'no timer'
}

/** Wraps a rank name for terminal copy: `rank "Solid"`. The bare ladder words
 *  ("Start", "Solid", "Nice", …) read as a puzzle mid-sentence — "Stopped at
 *  Start" looks like a typo — so a terminal line that embeds a rank labels it as
 *  one and quotes the name. (The standalone "Genius!" win celebration keeps the
 *  bare, iconic word — it's the exclamation, not embedded mid-sentence.) */
function rankLabel(name: string): string {
  return `rank "${name}"`
}

/**
 * Maps the terminal play_state to:
 *   - `outcome` — the GameOverModal's green/red color cue.
 *   - `verdict` — the centered large-font line in the modal.
 *   - `indicator` — the detailed status line that replaces the input area
 *     below the board (e.g. "Genius! 12/93 points").
 *   - `message` + `tone` — the short, bold, color-coded line in the
 *     info-column action row (won = green, lost = red, neutral = plain).
 *
 * A rank embedded mid-sentence is wrapped via `rankLabel` (`rank "Solid"`); the
 * bare "Genius!" win is the one exception (it's the celebratory exclamation).
 *
 * Coop:
 *   - `playState='ended'` + Genius rank → "Genius! N/M points."
 *   - `playState='ended'` + lower rank → 'Stopped at rank "Solid" —
 *     N/M points.' (covers timeout AND manual end, since the
 *     player already knows which one happened)
 *
 * Compete:
 *   - `playState='won_compete'` + caller is winner → 'You won
 *     the race — reached rank "Amazing"!'
 *   - `playState='won_compete'` + caller is NOT winner → '<name>
 *     beat you to rank "Amazing".'
 *   - `playState='ended'` with outcome='timeout' → 'Time's up —
 *     no winner at rank "Amazing".'
 *   - `playState='ended'` with outcome='manual' → 'Game ended —
 *     no winner at rank "Amazing".'
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
  message: string
  tone: 'won' | 'lost' | 'neutral'
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
          verdict: `You won the race — reached ${rankLabel(targetRankName)}!`,
          indicator: `you won at ${rankLabel(targetRankName)}`,
          message: 'You won!',
          tone: 'won',
        }
      }
      const winnerName =
        players.find((p) => p.user_id === winnerId)?.username ?? 'someone'
      return {
        outcome: 'lost',
        verdict: `${winnerName} beat you to ${rankLabel(targetRankName)}.`,
        indicator: `${winnerName} won at ${rankLabel(targetRankName)}`,
        message: `${winnerName} won`,
        tone: 'lost',
      }
    }

    // playState='ended' in compete: timeout or manual. No winner
    // either way — the race didn't finish.
    const outcome = (status?.outcome as string | undefined) ?? 'ended'
    if (outcome === 'timeout') {
      return {
        outcome: 'lost',
        verdict: `Time's up — no winner at ${rankLabel(targetRankName)}.`,
        indicator: `time up — no winner at ${rankLabel(targetRankName)}`,
        message: 'Time up',
        tone: 'lost',
      }
    }
    return {
      outcome: 'lost',
      verdict: `Game ended — no winner at ${rankLabel(targetRankName)}.`,
      indicator: `ended — no winner at ${rankLabel(targetRankName)}`,
      message: 'Game ended',
      tone: 'neutral',
    }
  }

  // coop
  if (selfRankIdx >= 6) {
    return {
      outcome: 'won',
      verdict: `Genius! ${foundWordsScore}/${requiredWordsScore} points.`,
      indicator: `Genius! ${foundWordsScore}/${requiredWordsScore} points`,
      message: 'Genius!',
      tone: 'won',
    }
  }
  return {
    outcome: 'won',
    verdict: `Stopped at ${rankLabel(rankName)} — ${foundWordsScore}/${requiredWordsScore} points.`,
    indicator: `stopped at ${rankLabel(rankName)}`,
    message: `Stopped at ${rankLabel(rankName)}`,
    tone: 'neutral',
  }
}
