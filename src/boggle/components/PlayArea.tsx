import { useCallback, useMemo, useState } from 'react'
import { cls } from '../../common/lib/cls'
import { playerOutcome } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/timerLabel'
import type { GamePageCtx, Member } from '../../common/lib/games'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import { TerminalModal } from '../../common/components/TerminalModal'
import { TerminalActionRow } from '../../common/components/TerminalActionRow'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { EntryRow } from '../../common/components/EntryRow'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { asciiLetters } from '../../common/hooks/useCaptureKeys'
import { useGlobalFeedback } from '../../common/hooks/useGlobalFeedback'
import { colorVarFor } from '../../common/lib/memberColor'
import { useWordSubmit, wordWithBonusDot, type WordEntry } from '../../common/hooks/useWordSubmit'
import { boardToDisplay, DICE_BY_NAME } from '../lib/dice'
import { traceableStr } from '../lib/boardTrace'
import { type LadderName } from '../lib/solver'
import type { BoggleSetup } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { WordList } from '../../common/components/WordList'
import { buildDisplayRows } from '../lib/displayRows'
import { db } from '../db'
import { SetupDisclosure } from '../../common/components/SetupDisclosure'
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
  const { gameId, players, isTerminal, setup, goToClub, session, status, globalFeedback } = ctx
  const { game, foundWords, loading } = useGame(gameId)
  const myId = session.user.id

  // `setup` is typed `Record<string, unknown>`; BoggleSetup is an `interface`,
  // which TS won't treat as index-compatible with Record, so route through unknown.
  const boggleSetup = setup as unknown as BoggleSetup
  const ladder: LadderName = (boggleSetup.scoring_ladder as LadderName) ?? 'basic'

  // number of 90° clockwise turns applied to the displayed grid (local view only).
  const [turns, setTurns] = useState(0)

  // ─── Move entry + own-move feedback (shared engine) ────
  // The board ships with its full legal list (required ∪ bonus), so a guess is
  // validated + scored locally — index it by word for O(1) lookup. `useWordSubmit`
  // owns the typed-word state, the sticky own-move pill, and the optimistic
  // commit + dedup; boggle only supplies the lookup, the RPC, the reject reason
  // (not-on-board vs not-a-word, client-side via `traceableStr`), and the success
  // label. See docs/games/boggle.md.
  const legalIndex = useMemo(() => {
    const m = new Map<string, WordEntry>()
    for (const r of game?.required_words ?? []) {
      m.set(r.word, { word: r.word, points: r.points, isBonus: false })
    }
    for (const b of game?.bonus_words ?? []) {
      m.set(b.word, { word: b.word, points: b.points, isBonus: true })
    }
    return m
  }, [game?.required_words, game?.bonus_words])

  // Concede state (from the common roster). A conceder can't submit and sees the
  // locally-terminal look while the others race; peers show as "out" in the strip.
  const myConceded = players.find((m) => m.user_id === myId)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  const { word, setWord, lastWord, submit, localFeedback, clearLocalFeedback, showFeedback } =
    useWordSubmit({
      mode: game?.mode ?? 'coop',
      userId: myId,
      // A conceder is locally done: gate word entry as if the game were terminal.
      isTerminal: isTerminal || myConceded,
      minWordLength: game?.min_word_length ?? 3,
      foundWords,
      lookup: (w) => legalIndex.get(w) ?? null,
      commit: async (e) => {
        const { error } = await db.rpc('submit_word', {
          target_game: gameId,
          word: e.word,
          points: e.points,
          is_bonus: e.isBonus,
        })
        return { error }
      },
      // A miss is either untraceable ("not on board") or traceable-but-not-a-word
      // — the distinction boggle keeps, computed from the board on the FE. The
      // hook wraps the reason as `WORD — reason`.
      explainReject: (w) => (game && traceableStr(game.board, w) ? 'not a word' : 'not on board'),
    })

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

  // Manual end — an info-column action-row button now (like the other converged
  // games), off the GamePage menu. Confirmed; it's irreversible. Its error shares
  // the same below-board pill as a word submit (via the hook's showFeedback).
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showFeedback('error', `End game failed: ${error.message}`)
  }, [gameId, isTerminal, showFeedback])

  // ─── Concede (compete) — drop out of the race ──────────
  // A real loss for the conceder; the others keep racing (boggle.concede →
  // common.concede). Distinct from End, which is coop's neutral mutual stop. Its
  // error shares the same below-board pill as a word submit (via showFeedback).
  const handleConcede = useCallback(async () => {
    if (isTerminal || myConceded) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showFeedback('error', `Concede failed: ${error.message}`)
  }, [gameId, isTerminal, myConceded, showFeedback])

  // ─── Coop peer-word narration (global header) ──────────────────
  // coop's `found_words` is club-wide, so a teammate's accepted word arrives in
  // `foundWords`; surface it in the shared header slot (the twin of spellingbee's
  // coop narration). Rejected words never become a row, so there's nothing to
  // suppress; own words go to the in-body local pill. boggle has no pangram, but
  // a long find (7+ letters) is its "wow" moment — flag those. Compete stays
  // silent by design (opponents' words are private; no rank ladder to announce).
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    items: foundWords,
    keyOf: (r) => `${r.user_id}:${r.word}`,
    messageFor: (r) => {
      if (r.user_id === myId) return null // own word → in-body pill
      const member = players.find((p) => p.user_id === r.user_id)
      const name = member?.username ?? 'A teammate'
      const wow = r.word.length >= 7
      const label = wordWithBonusDot(r.word, r.is_bonus)
      return {
        tone: 'success',
        variant: 'outline',
        dot: colorVarFor(member?.color),
        text: wow
          ? `${name} found ${label} +${r.points} — wow!`
          : `${name} found ${label} +${r.points}`,
        dismiss: { kind: 'timed' },
      }
    },
    globalFeedback,
  })


  if (loading || !game || !view) return <div className={styles.loading}>Loading…</div>

  const isCompete = game.mode === 'compete'
  // Locally terminal (compete only): I conceded but the game continues for the
  // others. boggle has no elimination, so conceding is the only path to it.
  const isLocallyDone = isCompete && myConceded && !isTerminal

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
            onSubmit={submit}
            placeholder="Type a word"
            disabled={isTerminal || myConceded}
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
              metricFor={(p, isSelf) => {
                const score = isSelf ? myScore : (scoreByUser.get(p.user_id) ?? 0)
                // Mid-game: a conceder reads as "out" (dropped out, still racing
                // for the rest). At terminal, prefix the outcome verb so the two
                // "no longer active" states read differently — "Quit at 12" vs
                // "Lost at 12" vs "Won at 40" (the distinction the conceded flag
                // buys us); an ordinary player just shows the number.
                if (!isTerminal) return concededIds.has(p.user_id) ? 'out' : score
                const member = players.find((m) => m.user_id === p.user_id)
                const outcome = member ? playerOutcome(member) : 'lost'
                if (outcome === 'won') return `Won at ${score}`
                if (outcome === 'quit') return `Quit at ${score}`
                return `Lost at ${score}`
              }}
            />
          )}

          {/* Action row — End (coop) / Concede (compete) during play; at terminal
              the bold outcome line + a compact back-to-club button. */}
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

          {/* Help — only while the player can act on it (never silently swapped);
              hidden once conceded, when entry is disabled. */}
          {!over && !isLocallyDone && (
            <p className={shared.infoHelp}>
              Type a word, then Enter. <kbd>↑</kbd> recalls your last word.
            </p>
          )}

          {/* Setup — LAST before the list, behind a disclosure (closed by default). */}
          <SetupDisclosure>
              <li>{diceLabel} board</li>
              <li>{DIFFICULTY_LABELS[boggleSetup.band - 1] ?? '—'} required words</li>
              <li>{DIFFICULTY_LABELS[boggleSetup.legal_band - 1] ?? '—'} legal (bonus) words</li>
              <li>{ladderLabel} scoring · min length {game.min_word_length}</li>
              <li>{timerLabel(boggleSetup.timer)}</li>
            </SetupDisclosure>
        </div>

        <WordList rows={wordRows} players={players} reveal={revealWords !== null} />
      </div>

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}

type StatusBlob = Record<string, unknown>
type LeaderRow = { user_id: string; count: number; score: number }

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
