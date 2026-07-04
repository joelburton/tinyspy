import { useCallback, useEffect, useMemo } from 'react'
import { cls } from '../../common/lib/cls'
import type { GamePageCtx, Member } from '../../common/lib/games'
import { TerminalModal } from '../../common/components/TerminalModal'
import { useGlobalFeedback } from '../../common/hooks/useGlobalFeedback'
import { colorVarFor } from '../../common/lib/memberColor'
import { memberById } from '../../common/lib/peers'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import { useWordSubmit, wordWithBonusDot, type WordEntry } from '../../common/hooks/useWordSubmit'
import { boardToDisplay, DICE_BY_NAME } from '../lib/dice'
import { traceableStr } from '../lib/boardTrace'
import { type LadderName } from '../lib/solver'
import type { BoggleSetup } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { buildDisplayRows } from '../lib/displayRows'
import { printBogglePdf } from '../pdf/printBogglePdf'
import { db } from '../db'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

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
  const { gameId, players, isTerminal, setup, goToClub, session, status, globalFeedback, menu, brand, title } = ctx
  const { game, foundWords, loading } = useGame(gameId)
  const myId = session.user.id

  // `setup` is typed `Record<string, unknown>`; BoggleSetup is an `interface`,
  // which TS won't treat as index-compatible with Record, so route through unknown.
  const boggleSetup = setup as unknown as BoggleSetup
  const ladder: LadderName = (boggleSetup.scoring_ladder as LadderName) ?? 'basic'

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

  // The display grid (letters in board order). BoardCol owns the local rotate on top.
  const grid = useMemo(
    () => (game ? boardToDisplay(game.board, game.n) : null),
    [game],
  )

  // The viewer/team's own found rows: coop sees the whole team's; compete sees
  // only the caller's (filtered explicitly so the post-terminal reveal — which
  // opens peers' rows — doesn't inflate the caller's count/score).
  const myFoundRows = useMemo(
    () => (game?.mode === 'compete' ? foundWords.filter((f) => f.user_id === myId) : foundWords),
    [foundWords, game?.mode, myId],
  )
  const myScore = useMemo(() => myFoundRows.reduce((s, r) => s + r.points, 0), [myFoundRows])
  const myCount = useMemo(() => new Set(myFoundRows.map((r) => r.word)).size, [myFoundRows])

  // "Print board (PDF)" GamePage menu item. Builds the plain-data print model from
  // the live state (RLS already scoped `foundWords` to what I may see — coop = the
  // team's, compete = my own) and hands it to the jsPDF renderer. A snapshot at
  // click time — works mid-game or at the end. See docs/pdf.md.
  useEffect(() => {
    if (!game) return
    // The same reveal the on-screen list uses: at terminal, required-but-missed words
    // are folded in (`buildDisplayRows` dedups found + appends the unfound); mid-game
    // there's no reveal, so only found words show. Look up each found word's points
    // (the shared row type carries the finder/bonus but not the score).
    const foundSet = new Set(foundWords.map((w) => w.word))
    const revealWords = isTerminal ? game.required_words.filter((r) => !foundSet.has(r.word)) : null
    const pointsByWord = new Map(foundWords.map((w) => [w.word, w.points]))
    const words = buildDisplayRows(foundWords, revealWords).map((r) => ({
      word: r.word.toUpperCase(),
      bonus: r.kind === 'found' ? (r.isBonus ?? false) : false,
      // A found word carries score + finder; an unfound (missed) reveal entry is bare.
      found:
        r.kind === 'found'
          ? { points: pointsByWord.get(r.word) ?? 0, who: memberById(players, r.userId)?.username ?? 'someone' }
          : null,
    }))
    const model = {
      brand,
      gameTitle: title,
      date: new Date().toLocaleDateString(),
      // Exactly the on-screen InfoCol status: found / required words · score.
      summary: `${myCount} / ${game.required_words_count} words · ${myScore} pts`,
      board: boardToDisplay(game.board, game.n),
      // Relevant setup only (the timer isn't relevant on a print).
      setup: [
        { label: 'Dice', value: DICE_BY_NAME[boggleSetup.dice_set]?.desc ?? boggleSetup.dice_set },
        { label: 'Required words', value: `${DIFFICULTY_LABELS[boggleSetup.band - 1] ?? '?'} (band ${boggleSetup.band})` },
        { label: 'Bonus words', value: `${DIFFICULTY_LABELS[boggleSetup.legal_band - 1] ?? '?'} (band ${boggleSetup.legal_band})` },
        { label: 'Min length', value: `${boggleSetup.min_word_length} letters` },
        { label: 'Scoring', value: ladder.charAt(0).toUpperCase() + ladder.slice(1) },
      ],
      // Alphabetical — the 5-column list renders them column-major.
      words,
    }
    menu.setGameItems([
      { id: 'print', label: 'Print board (PDF)', onClick: () => printBogglePdf(model) },
    ])
    return () => menu.setGameItems([])
  }, [menu, game, foundWords, players, brand, title, boggleSetup, ladder, isTerminal, myCount, myScore])

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


  if (loading || !game || !grid) return <div className={styles.loading}>Loading…</div>

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
      <BoardCol
        // ── Board to render ──
        grid={grid}
        n={game.n}
        // ── Word entry (engine here; rendered in BoardCol) ──
        word={word}
        onChange={setWord}
        onSubmit={submit}
        onAnyKey={clearLocalFeedback}
        lastWord={lastWord}
        entryDisabled={isTerminal || myConceded}
        // ── Below-board pill ──
        over={over}
        localFeedback={localFeedback}
      />

      <InfoCol
        // ── Mode + phase ──
        isCompete={isCompete}
        isTerminal={isTerminal}
        over={over}
        isLocallyDone={isLocallyDone}
        // ── State readout ──
        myCount={myCount}
        requiredWordsCount={game.required_words_count}
        myScore={myScore}
        // ── Players (OpponentStrip, compete) ──
        players={players}
        selfId={myId}
        scoreByUser={scoreByUser}
        concededIds={concededIds}
        // ── Action row ──
        onEndGame={() => void handleEndGame()}
        onConcede={() => void handleConcede()}
        onBackToClub={goToClub}
        // ── Setup disclosure ──
        setup={boggleSetup}
        diceLabel={diceLabel}
        ladderLabel={ladderLabel}
        minWordLength={game.min_word_length}
        // ── Found-words list ──
        wordRows={wordRows}
        reveal={revealWords !== null}
      />

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
