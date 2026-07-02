import { useCallback, useMemo, useState } from 'react'
import { cls } from '../../common/lib/cls'
import type { GenericFeedbackTone, GamePageCtx, Member, TimerMode } from '../../common/lib/games'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { EntryRow } from '../../common/components/EntryRow'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { asciiLetters } from '../../common/hooks/useCaptureKeys'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useLocalFeedback } from '../../common/hooks/useLocalFeedback'
import { boardToDisplay, DICE_BY_NAME } from '../lib/dice'
import { traceableStr } from '../lib/boardTrace'
import { LADDERS, scoreFor, type LadderName } from '../lib/solver'
import type { BoggleSetup } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { WordList } from '../../common/components/WordList'
import { buildDisplayRows } from '../lib/displayRows'
import { db } from '../db'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/** Rotate a square grid 90° clockwise — repositions tiles; the letters
 *  themselves render upright (no spin). new[i][j] = old[n-1-j][i]. */
function rotateCW(g: string[][]): string[][] {
  const n = g.length
  return g.map((_, i) => g.map((_, j) => g[n - 1 - j][i]))
}

/**
 * MothCubes play surface, shared by the coop and compete manifests, on the shared
 * two-column scaffold (board column + fixed info column — see docs/ui.md →
 * "PlayArea layout"):
 *
 *   - **Board column** — the square tile grid (sized like waffle's: the largest
 *     square that fits) with a floating Rotate control over its top-right, and a
 *     below-board slot holding ONE of: the typed-word input row, the sticky
 *     own-move feedback pill, or the permanent terminal pill (they replace each
 *     other in a fixed-height slot so the board never reflows).
 *   - **Info column** — the live word/score state, the compete OpponentStrip, the
 *     End/Concede action row (terminal outcome line at game-over), a help line,
 *     the setup disclosure, and the found-words `<WordList>` filling the rest.
 *
 * The board is shipped to the FE with its required-word list, so guesses are
 * classified instantly: a required word (membership) or an off-board/too-short
 * word needs no server round-trip; only an unknown (bonus-candidate) word is sent
 * for the dictionary check. Traceability is checked client-side (trusting-commit).
 *
 * Move entry is the shared capture model (window key capture + a chrome-less
 * `<EntryBox>` display), the same as spellingbee — boggle's structural twin.
 */
export function PlayArea(ctx: GamePageCtx) {
  const { gameId, players, isTerminal, setup, goToClub, session, status } = ctx
  const { game, foundWords, loading } = useGame(gameId)
  const myId = session.user.id

  // `setup` is typed `Record<string, unknown>`; BoggleSetup is an `interface`,
  // which TS won't treat as index-compatible with Record, so route through unknown.
  const boggleSetup = setup as unknown as BoggleSetup
  const ladder: LadderName = (boggleSetup.scoring_ladder as LadderName) ?? 'basic'

  // ─── Typed-word state ──────────────────────────────────
  const [word, setWord] = useState('')
  // The last word submitted, kept so ArrowUp can recall it for quick editing
  // (add an 'S', fix a typo). FE-only — never shared or stored.
  const [lastWord, setLastWord] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // number of 90° clockwise turns applied to the displayed grid (local view only).
  const [turns, setTurns] = useState(0)

  // ─── Local own-move feedback (sticky) ──────────────────
  // The player's own submission result, shown as a centered <GenericFeedbackPill> in the
  // below-board slot — the same shared pill the header's global feedback uses
  // (docs/design-decisions.md → Feedback). STICKY: it persists until the player's
  // NEXT move dismisses it (any key the game sees, a Delete) rather than vanishing
  // on a timer.
  // The shared hook owns the state + cleanup; this thin builder keeps boggle's
  // `(message, tone)` call sites over it. Own-move results are sticky (the next
  // key dismisses them).
  const { localFeedback, showLocalFeedback: showMsg, clearLocalFeedback } = useLocalFeedback()
  const showLocalFeedback = useCallback(
    (message: string, tone: GenericFeedbackTone) =>
      showMsg({ tone, text: message, variant: 'outline', dismiss: { kind: 'sticky' } }),
    [showMsg],
  )

  const grid = useMemo(
    () => (game ? boardToDisplay(game.board, game.n) : null),
    [game],
  )
  // Rotating the board repositions the tiles but keeps each letter upright (a
  // matrix rotation, not a visual spin) — so it stays readable from any side.
  const view = useMemo(() => {
    if (!grid) return null
    let g = grid
    for (let i = 0; i < turns; i++) g = rotateCW(g)
    return g
  }, [grid, turns])

  // The viewer/team's own found rows: coop sees the whole team's; compete sees
  // only the caller's (filtered explicitly so the post-terminal reveal — which
  // opens peers' rows — doesn't inflate the caller's count/score).
  const myFoundRows = useMemo(
    () => (game?.mode === 'compete' ? foundWords.filter((f) => f.user_id === myId) : foundWords),
    [foundWords, game?.mode, myId],
  )
  const myScore = useMemo(() => myFoundRows.reduce((s, r) => s + r.points, 0), [myFoundRows])
  const myCount = useMemo(() => new Set(myFoundRows.map((r) => r.word)).size, [myFoundRows])

  // Every visible found word (used for the missed-words reveal; in compete this
  // is self-only mid-game and everyone's post-terminal — exactly "words nobody
  // found").
  const foundSet = useMemo(() => new Set(foundWords.map((f) => f.word)), [foundWords])

  const submit = useCallback(async () => {
    const w = word.trim().toLowerCase()
    if (!game || isTerminal || submitting || w.length === 0) return
    // Every submit attempt clears the box — the own-move <GenericFeedbackPill> reclaims
    // the below-board slot only when word === '', so a reject that left the word in
    // place would suppress its own feedback. lastWord is set here (not just on the
    // accepted path) so ArrowUp recalls a rejected word to fix it.
    setLastWord(word)

    if (w.length < game.min_word_length) {
      showLocalFeedback(`Too short (min ${game.min_word_length})`, 'warning')
      setWord('')
      return
    }
    const dup = foundWords.some(
      (f) => f.word === w && (game.mode === 'coop' || f.user_id === myId),
    )
    if (dup) {
      showLocalFeedback(`${w.toUpperCase()} — already found`, 'warning')
      setWord('')
      return
    }
    if (!traceableStr(game.board, w)) {
      showLocalFeedback(`${w.toUpperCase()} — not on the board`, 'error')
      setWord('')
      return
    }

    const required = game.required_words.find((r) => r.word === w)
    const points = required ? required.points : scoreFor(w.length, LADDERS[ladder] ?? LADDERS.basic)
    setWord('')

    if (required) {
      // Known-good (member + traceable + not dup): show points instantly, record
      // in the background — the realtime insert lands it in the list.
      showLocalFeedback(`${w.toUpperCase()} +${points}`, 'success')
      void db.rpc('submit_word', { target_game: gameId, word: w, points }).then(({ error }) => {
        if (error) showLocalFeedback(error.message, 'error')
      })
      return
    }
    // Bonus candidate — only the server knows if it's a real word.
    setSubmitting(true)
    try {
      const { data, error } = await db.rpc('submit_word', { target_game: gameId, word: w, points })
      if (error) {
        showLocalFeedback(error.message, 'error')
        return
      }
      const res = data as { result: string; points: number }
      if (res.result === 'bonus' || res.result === 'accepted') {
        showLocalFeedback(`${w.toUpperCase()} +${res.points} (bonus)`, 'success')
      } else if (res.result === 'notAWord') {
        showLocalFeedback(`${w.toUpperCase()} — not a word`, 'error')
      } else if (res.result === 'alreadyFound') {
        showLocalFeedback(`${w.toUpperCase()} — already found`, 'warning')
      } else {
        showLocalFeedback(res.result, 'warning')
      }
    } finally {
      setSubmitting(false)
    }
  }, [word, game, isTerminal, submitting, foundWords, myId, ladder, gameId, showLocalFeedback])

  // Manual end — an info-column action-row button now (like the other converged
  // games), off the GamePage menu. Confirmed; it's irreversible.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(`End game failed: ${error.message}`, 'error')
  }, [gameId, isTerminal, showLocalFeedback])

  const { showModal, closeModal } = useTerminalModal(isTerminal)

  if (loading || !game || !view) return <div className={styles.loading}>Loading…</div>

  const isCompete = game.mode === 'compete'

  // Post-terminal reveal: the required words nobody found.
  const revealWords = isTerminal
    ? game.required_words.filter((r) => !foundSet.has(r.word))
    : null
  // Merged, alphabetized rows for the shared WordList (found + the reveal).
  const wordRows = buildDisplayRows(foundWords, revealWords)

  const over = isTerminal ? buildOver({ mode: game.mode, status, myCount, myScore, players }) : null

  // Index the compete leaderboard by user so the OpponentStrip metric can read
  // each peer's score (self reads the live local computation so it stays in lock
  // step with the state line above).
  const leaderboard = (status?.leaderboard as LeaderRow[] | undefined) ?? []
  const scoreByUser = new Map(leaderboard.map((e) => [e.user_id, e.score]))

  const ladderLabel = ladder.charAt(0).toUpperCase() + ladder.slice(1)
  const diceLabel = DICE_BY_NAME[boggleSetup.dice_set]?.desc ?? `${game.n}×${game.n}`

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <div
        className={cls(shared.boardCol, styles.boardCol)}
        style={{ ['--cols' as string]: game.n, ['--rows' as string]: game.n }}
      >
        <div className={styles.grid}>
          {view.flatMap((row, y) =>
            row.map((cell, x) => (
              <div key={`${y}-${x}`} className={styles.tile} data-boggle-tile>
                {/* a blank tile (face 0) shows a faint "?", like a scrabble blank */}
                <span className={cell === '?' ? styles.blank : undefined}>{cell}</span>
              </div>
            )),
          )}
        </div>
        {/* Rotate floats over the board's top-right — a fresh visual scan of the
            SAME board (letters stay upright), not a turn action. Local to this
            player in both modes; never persisted, never seen by others. */}
        <ShuffleButton
          onShuffle={() => setTurns((t) => (t + 1) % 4)}
          label="Rotate board"
          className={shared.floatingShuffle}
        />
        {/* The below-board slot — the shared <EntryRow> (icon-only Delete + the
            EntryBox + icon-only Submit, plus the capture keyboard). It renders the
            terminal verdict / own-move feedback pill in place of the controls when
            `pill` is set (terminal takes precedence; an own-move result shows only
            while the entry is empty so typing reclaims the slot). */}
        <div className={styles.belowBoard}>
          <div className={shared.moveAreaOrLocalFeedback}>
          <EntryRow
            value={word}
            onChange={setWord}
            onSubmit={() => void submit()}
            placeholder="Type a word"
            disabled={isTerminal}
            busy={submitting}
            onAnyKey={clearLocalFeedback}
            charFor={asciiLetters('upper')}
            recall={lastWord}
            pill={
              over
                ? {
                    tone: over.tone === 'won' ? 'success' : over.tone === 'lost' ? 'error' : 'neutral',
                    text: over.verdict,
                    variant: 'fill', // permanent → lightened-tone fill
                    dismiss: { kind: 'sticky' },
                  }
                : word === ''
                  ? localFeedback
                  : null
            }
          />
          </div>
        </div>
      </div>

      <div className={shared.infoCol}>
        <div className={shared.actionSlot}>
          {/* InfoCol order is FIXED (docs/design-decisions.md → Info column):
              state → opponent strip → action row → help → setup disclosure → list. */}

          {/* State — words found / required + score earned. */}
          <p className={shared.infoState}>
            <strong>{myCount}</strong> / {game.required_words_count} words ·{' '}
            <strong>{myScore}</strong> pts
          </p>

          {/* Opponent strip (compete) — each peer's score, identity on a leading
              disc; word counts stay private (the compete privacy line). */}
          {isCompete && (
            <OpponentStrip
              players={players}
              selfId={myId}
              metricLabel="Score"
              metricFor={(p, isSelf) => (isSelf ? myScore : (scoreByUser.get(p.user_id) ?? 0))}
            />
          )}

          {/* Action row — End (coop) / Concede (compete) during play; at terminal
              the bold outcome line + a compact back-to-club button. */}
          {over ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>
                {over.message}
              </span>
              <BackToClubButton onClick={goToClub} compact />
            </div>
          ) : (
            <div className={shared.infoActions}>
              {isCompete ? (
                <ConcedeGameButton
                  className={shared.helperButton}
                  onClick={() => void handleEndGame()}
                />
              ) : (
                <EndGameButton
                  className={shared.helperButton}
                  onClick={() => void handleEndGame()}
                />
              )}
            </div>
          )}

          {/* Help — only while the player can act on it (never silently swapped). */}
          {!over && (
            <p className={shared.infoHelp}>
              Type a word, then Enter. <kbd>↑</kbd> recalls your last word.
            </p>
          )}

          {/* Setup — LAST before the list, behind a disclosure (closed by default). */}
          <details className={shared.infoSetup}>
            <summary>Setup options</summary>
            <ul>
              <li>{diceLabel} board</li>
              <li>{DIFFICULTY_LABELS[boggleSetup.band - 1] ?? '—'} required words</li>
              <li>{DIFFICULTY_LABELS[boggleSetup.legal_band - 1] ?? '—'} legal (bonus) words</li>
              <li>{ladderLabel} scoring · min length {game.min_word_length}</li>
              <li>{timerLabel(boggleSetup.timer)}</li>
            </ul>
          </details>
        </div>

        <WordList rows={wordRows} players={players} reveal={revealWords !== null} />
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

type StatusBlob = Record<string, unknown>
type LeaderRow = { user_id: string; count: number; score: number }

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

/**
 * Per-status terminal copy. boggle has no intrinsic win threshold — a game ends
 * by manual End, a player hitting End, or the timer expiring — so the terminal is
 * always 'ended'/'timeout' (the reason is read off `status.outcome`). Coop is a
 * neutral shared hunt (no win/loss); compete picks the highest score.
 *
 * Returns `{ outcome, verdict, message, tone }`: `outcome` + `verdict` drive the
 * GameOverModal + the permanent below-board pill; `message` + `tone` drive the
 * short bold line in the info-column action row.
 */
function buildOver({
  mode,
  status,
  myCount,
  myScore,
  players,
}: {
  mode: 'coop' | 'compete'
  status: StatusBlob | null
  myCount: number
  myScore: number
  players: Member[]
}): {
  outcome: 'won' | 'lost'
  verdict: string
  message: string
  tone: 'won' | 'lost' | 'neutral'
} {
  const reason = (status?.outcome as string | undefined) === 'timeout' ? "Time's up" : 'Game ended'

  if (mode === 'coop') {
    // Coop is a shared hunt with no loss: reuse the modal's non-red 'won' styling,
    // but a neutral tone in the info-column line.
    return {
      outcome: 'won',
      verdict: `${reason} — ${myCount} words, ${myScore} points.`,
      message: reason,
      tone: 'neutral',
    }
  }

  // Compete — most points wins (no dupes-cancel; see boggle.md §12).
  const board = (status?.leaderboard as LeaderRow[] | undefined) ?? []
  const max = board.reduce((m, r) => Math.max(m, r.score), 0)
  if (max === 0) {
    return {
      outcome: 'lost',
      verdict: `${reason} — no words found.`,
      message: 'No winner',
      tone: 'neutral',
    }
  }
  if (myScore >= max) {
    return {
      outcome: 'won',
      verdict: `You win — ${myCount} words, ${myScore} points!`,
      message: 'You won!',
      tone: 'won',
    }
  }
  const winner = board.find((r) => r.score === max)
  const winnerName = players.find((p) => p.user_id === winner?.user_id)?.username ?? 'Someone'
  return {
    outcome: 'lost',
    verdict: `${winnerName} won — you had ${myCount} words, ${myScore} points.`,
    message: `${winnerName} won`,
    tone: 'lost',
  }
}
