import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cls } from '../../common/lib/cls'
import { TerminalModal } from '../../common/components/TerminalModal'
import { TerminalActionRow } from '../../common/components/TerminalActionRow'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { EntryRow } from '../../common/components/EntryRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import { playerOutcome } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/timerLabel'
import type { GamePageCtx, Member } from '../../common/lib/games'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { asciiLetters } from '../../common/hooks/useCaptureKeys'
import { useGlobalFeedback } from '../../common/hooks/useGlobalFeedback'
import { useWordSubmit, wordWithBonusDot, type WordEntry } from '../../common/hooks/useWordSubmit'
import { colorVarFor } from '../../common/lib/memberColor'
import { readLeaderboard } from '../lib/leaderboard'
import { currentRankIndex, RANKS } from '../lib/ranks'
import type { SpellingbeeSetup } from '../lib/setup'
import { Letters } from './Letters'
import { RankBar } from './RankBar'
import { Stats } from './Stats'
import { TypedWord } from './TypedWord'
import { WordList } from '../../common/components/WordList'
import { buildDisplayRows } from '../lib/displayRows'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'

import '../theme.css'

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
    // The COMMON header slot (peer/opponent events, via useGlobalFeedback + the compete rank effect) — as
    // opposed to the local in-body `localFeedback` state below, which carries
    // the player's own word result. Two different surfaces.
    globalFeedback,
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

  // ─── Move entry + own-move feedback (shared engine) ────
  // Both word lists ship to the FE, so a guess is validated + scored locally —
  // index required ∪ bonus by word. useWordSubmit owns the typed-word state, the
  // sticky own-move pill, and the optimistic commit + dedup; spellingbee supplies
  // the lookup, the RPC, the reject reason (bad-letters / missing-center /
  // not-a-word), and the success label (with the pangram flourish). See
  // docs/games/spellingbee.md.
  const legalIndex = useMemo(() => {
    const m = new Map<string, WordEntry>()
    for (const r of game?.requiredWords ?? []) {
      m.set(r.word, { word: r.word, points: r.points, isBonus: false, isPangram: r.is_pangram })
    }
    for (const b of game?.bonusWords ?? []) {
      m.set(b.word, { word: b.word, points: b.points, isBonus: true, isPangram: b.is_pangram })
    }
    return m
  }, [game?.requiredWords, game?.bonusWords])

  // Concede state (from the common roster). A conceder can't submit and sees the
  // locally-terminal look while the others race; peers show as "out" in the strip.
  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  const center = game?.center_letter.toLowerCase() ?? ''
  const { word, setWord, lastWord, submit, localFeedback, clearLocalFeedback, showFeedback } =
    useWordSubmit({
      mode: game?.mode ?? 'coop',
      userId: session.user.id,
      isTerminal: isTerminal || myConceded,
      minWordLength: 4,
      foundWords,
      lookup: (w) => legalIndex.get(w) ?? null,
      commit: async (e) => {
        const { error } = await db.rpc('submit_word', {
          target_game: gameId,
          word: e.word,
          points: e.points,
          is_pangram: e.isPangram ?? false,
          is_bonus: e.isBonus,
        })
        return { error }
      },
      // A miss at/above min length: name why (a letter off the board, or the
      // center letter missing) else it's simply not a word. The hook wraps the
      // reason as `WORD — reason`.
      explainReject: (w) => {
        for (const ch of w) {
          if (!allowedLetters.has(ch)) return 'bad letters'
        }
        if (center && !w.includes(center)) return 'missing center letter'
        return 'not a word'
      },
    })

  const handleLetterClick = useCallback(
    (letter: string) => {
      clearLocalFeedback()
      setWord((prev) => prev + letter.toUpperCase())
    },
    [clearLocalFeedback, setWord],
  )

  // Space shuffles the outer letters — spellingbee's one capture-entry extra key
  // (passed to the shared <EntryRow> below, which owns the rest of the keyboard:
  // letters/Backspace/Enter + the ArrowUp-recall / ArrowDown-clear history). The
  // `~` word-lookup shortcut is app-global (useAppShortcuts), not here.
  const handleEntryExtraKey = useCallback((e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault()
      handleShuffle()
      return true
    }
    return false
  }, [handleShuffle])

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
      showFeedback('error', `End game failed: ${error.message}`)
    }
  }, [gameId, isTerminal, showFeedback])

  // ─── Concede (compete) — drop out of the race ──────────
  // A real loss for the conceder; the others keep racing (spellingbee.concede →
  // common.concede). Distinct from End, which is coop's neutral mutual stop.
  const handleConcede = useCallback(async () => {
    if (isTerminal || myConceded) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) {
      showFeedback('error', `Concede failed: ${error.message}`)
    }
  }, [gameId, isTerminal, myConceded, showFeedback])

  // Peer/opponent activity → header feedback pills (coop: a peer found a
  // word; compete: an opponent climbed a rank). Self-activity is excluded —
  // it's reported by the in-body pill / RankBar. Called unconditionally,
  // before the early returns, and reads `game?.mode` (null while loading; the
  // hook no-ops until loaded + bootstrapped).
  // ─── Coop peer-word narration (global header) ──────────────────
  // coop's `found_words` is club-wide, so a teammate's accepted word arrives in
  // `foundWords`; surface good + pangram finds. Rejected words never become a
  // row, so there's nothing to suppress. Own words go to the in-body local pill.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    items: foundWords,
    keyOf: (r) => `${r.user_id}:${r.word}`,
    messageFor: (r) => {
      if (r.user_id === session.user.id) return null // own word → in-body pill
      const member = players.find((p) => p.user_id === r.user_id)
      const name = member?.username ?? 'A teammate'
      return {
        tone: 'success',
        variant: 'outline',
        dot: colorVarFor(member?.color),
        text: r.is_pangram
          ? `${name} found ${wordWithBonusDot(r.word, r.is_bonus)} +${r.points} — pangram! 🐝`
          : `${name} found ${wordWithBonusDot(r.word, r.is_bonus)} +${r.points}`,
        dismiss: { kind: 'timed' },
      }
    },
    globalFeedback,
  })

  // ─── Compete opponent-rank narration (global header) ───────────
  // Opponents' words are RLS-hidden in compete, so the one competitively-
  // meaningful signal is a rank CLIMB, read off `status.leaderboard` — a delta
  // detector (bucket B in docs/peer-feedback-audit.md), NOT a seen-set: it fires
  // on a rank INCREASE, not a new row, so it stays hand-rolled here. `ranksReady`
  // seeds each player's last-seen rank on first load so history isn't replayed.
  const prevRankRef = useRef<Map<string, number>>(new Map())
  const ranksReadyRef = useRef(false)
  useEffect(() => {
    if (game?.mode !== 'compete') return
    const board = readLeaderboard(status)
    const prev = prevRankRef.current
    if (!ranksReadyRef.current) {
      ranksReadyRef.current = true
      for (const row of board) prev.set(row.user_id, row.rank_idx)
      return
    }
    for (const row of board) {
      const was = prev.get(row.user_id) ?? 0
      prev.set(row.user_id, row.rank_idx)
      if (row.user_id === session.user.id) continue // own rank → RankBar
      if (row.rank_idx > was) {
        const member = players.find((p) => p.user_id === row.user_id)
        const name = member?.username ?? 'An opponent'
        globalFeedback.show({
          tone: 'info',
          variant: 'outline',
          dot: colorVarFor(member?.color),
          text: `${name} reached ${RANKS[row.rank_idx] ?? 'a new rank'}`,
          dismiss: { kind: 'sticky' },
        })
      }
    }
  }, [game, status, players, session.user.id, globalFeedback])

  // Called UNCONDITIONALLY here, before any early returns —
  // React forbids conditional hook calls.

  if (loading) {
    return <div className={styles.loading}>Loading…</div>
  }
  if (!game) {
    return <div className={styles.empty}>Game not found.</div>
  }

  const isCompete = game.mode === 'compete'
  // Locally terminal (compete only): I conceded but the game continues for the
  // others. spellingbee has no other per-player "done" state (no elimination),
  // so conceding is the only way to reach it.
  const isLocallyDone = isCompete && myConceded && !isTerminal

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
        {/* The below-board slot — the shared <EntryRow> (icon-only Delete + the
            EntryBox + icon-only Submit + the capture keyboard; Space shuffles via
            onExtraKey). The EntryBox renders spellingbee's per-character illegal-
            letter dim via <TypedWord> children. When `pill` is set, EntryRow shows
            it in place of the controls (same slot, no reflow): the terminal verdict
            (permanent fill) takes precedence over an own-move result, which shows
            only while the entry is empty so typing reclaims the slot. */}
        <div className={styles.belowBoard}>
          <div className={shared.moveAreaOrLocalFeedback}>
          <EntryRow
            value={word}
            onChange={setWord}
            onSubmit={submit}
            placeholder="Type or click letters"
            disabled={isTerminal}
            onAnyKey={clearLocalFeedback}
            charFor={asciiLetters('upper')}
            onExtraKey={handleEntryExtraKey}
            recall={lastWord}
            pill={
              isTerminal && over
                ? {
                    tone: over.tone === 'won' ? 'success' : over.tone === 'lost' ? 'error' : 'neutral',
                    text: `Game over — ${over.indicator}`,
                    variant: 'fill', // permanent → lightened-tone fill
                    dismiss: { kind: 'sticky' },
                  }
                : word === ''
                  ? localFeedback
                  : null
            }
          >
            <TypedWord word={word} allowedLetters={allowedLetters} />
          </EntryRow>
          </div>
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
                  const rank = RANKS[rankIdx]
                  // Mid-game: a conceder reads as "out". At terminal, prefix the
                  // outcome verb so the two "no longer active" states read
                  // differently — "Quit at Amazing" vs "Lost at Amazing" vs
                  // "Won at Genius" (the distinction the conceded flag buys us).
                  if (!isTerminal) return concededIds.has(p.user_id) ? 'out' : rank
                  const member = players.find((m) => m.user_id === p.user_id)
                  const verb =
                    member && playerOutcome(member) === 'won'
                      ? 'Won'
                      : member && playerOutcome(member) === 'quit'
                        ? 'Quit'
                        : 'Lost'
                  return `${verb} at ${rank}`
                }}
              />
            )
          })()}

          {/* Action row: the End-game button during play; at terminal it's
              replaced by the bold, outcome-colored result line + a compact
              back-to-club button. */}
          {over ? (
            <TerminalActionRow over={over} onBackToClub={goToClub} />
          ) : isLocallyDone ? (
            // I conceded; the others race on. Terminal LOOK (a status line + the
            // now-disabled Concede) so the state change reads loudly.
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared.outcome_neutral)}>
                You conceded
              </span>
              <ConcedeGameButton className={shared.helperButton} disabled />
            </div>
          ) : (
            <div className={shared.infoActions}>
              {isCompete ? (
                <ConcedeGameButton
                  className={shared.helperButton}
                  onClick={() => void handleConcede()}
                />
              ) : (
                <EndGameButton
                  className={shared.helperButton}
                  onClick={() => void handleEndGame()}
                />
              )}
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

        {/* The required-words answer key now ships from game start, so the
            missed-words reveal is gated on `isTerminal` (not on the list being
            present): during play only found rows show; at terminal the unfound
            required words are revealed (bonus words are never revealed). */}
        <WordList
          rows={buildDisplayRows(foundWords, isTerminal ? game.requiredWords : null)}
          players={players}
          reveal={isTerminal}
        />
      </div>
      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
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
