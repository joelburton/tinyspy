import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import type { GamePageCtx, Member } from '../../common/lib/games'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { outOfRacePill } from '../../common/lib/game/localPills'
import { waitingTurnPill } from '../../common/components/game/turnCopy'
import { db } from '../db'
import { useGame, type GuessRow } from '../hooks/useGame'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useWordSubmit, type WordEntry } from '../../common/hooks/game/useWordSubmit'
import { lengthScore } from '../lib/scoring'
import type { WordiplySetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { MAX_GUESSES } from './GuessBoard'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { invokeStartGameEdgeFn } from '../../common/lib/game/manifestRpcs'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

import '../theme.css'

/** A row of `status.leaderboard`. Mid-game only `guesses_used` is set (no
 *  scores leak early); the score fields fill in at terminal. */
type LeaderRow = {
  user_id: string
  guesses_used?: number
  length_score?: number
  letter_count?: number
  won?: boolean
}

/** Map a server reject reason to a short line — rare (the FE pre-validates,
 *  so these only surface on a race with another tab). */
function rejectReason(reason: string | undefined, base: string): string {
  switch (reason) {
    case 'too_short':
      return 'too short'
    case 'missing_base':
      return `must contain "${base.toUpperCase()}"`
    case 'duplicate':
      // Worded exactly like the CLIENT-side duplicate check in useWordSubmit —
      // same condition, so it must not read as two different rejections
      // depending on which side caught it.
      return 'already found'
    default:
      return 'not accepted'
  }
}

/**
 * wordiply's play surface — shared between the coop and compete manifests.
 * Mode is read off `game.mode` (denormalized on `wordiply.games_state`).
 *
 * Per-mode rendering:
 *   - **Coop**: the five guesses are shared (the whole team fills one
 *     board); everyone sees every guess live. Terminal shows the team's
 *     length score.
 *   - **Compete**: each player has their own five-guess board (opponents'
 *     guesses are RLS-hidden mid-game; the OpponentStrip shows only guesses
 *     used). Terminal reveals every score + the winner via the comparator.
 *
 * The live readout is ONLY each guess's length (a badge on its row); the
 * length score + letter count + longest word are terminal-only.
 */
export function PlayArea(ctx: GamePageCtx) {
  const {
    gameId, isTerminal, playState, players, session, status,
    isMyTurn, currentTurnUserId,
    setup, goToClub, clubHandle, goToGame, menu, brand, globalFeedback,
  } = ctx
  const { game, guesses, loading, rowsLoaded } = useGame(gameId)

  const wordiplySetup = setup as WordiplySetup

  const infoSheet = useInfoSheet()
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    replay: () => void
    newGame: () => void
  } | null>(null)

  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  // The board's rows. Coop shares one track (every guess); compete shows only
  // the caller's own (opponents' rows are RLS-hidden mid-game and, once the
  // reveal opens them at terminal, must NOT crowd my board — my five guesses
  // stay mine). Already ordered by created_at from useGame.
  const myGuesses = useMemo<GuessRow[]>(
    () =>
      game?.mode === 'compete'
        ? guesses.filter((g) => g.user_id === session.user.id)
        : guesses,
    [guesses, game?.mode, session.user.id],
  )
  const boardRows = useMemo(() => myGuesses.map((g) => ({ word: g.word, length: g.length })), [myGuesses])
  const guessesUsed = boardRows.length
  const longest = boardRows.reduce((m, g) => Math.max(m, g.length), 0)
  const letters = boardRows.reduce((s, g) => s + g.length, 0)

  // Compete terminal reveal — each opponent's words. Mid-game their rows are
  // RLS-hidden so `guesses` holds only mine; at terminal the RLS opens them,
  // so group the now-visible non-self rows by player (in play order — useGame
  // orders by created_at). Empty in coop / mid-game → the reveal renders null.
  const opponentReveal = useMemo(() => {
    if (game?.mode !== 'compete' || !isTerminal) return []
    const byUser = new Map<string, { word: string; length: number }[]>()
    for (const g of guesses) {
      if (g.user_id === session.user.id) continue
      const rows = byUser.get(g.user_id) ?? []
      rows.push({ word: g.word, length: g.length })
      byUser.set(g.user_id, rows)
    }
    return players
      .filter((p) => p.user_id !== session.user.id)
      .map((player) => ({ player, guesses: byUser.get(player.user_id) ?? [] }))
  }, [guesses, game?.mode, isTerminal, players, session.user.id])

  const base = game?.base ?? ''

  // ─── Move entry + own-move feedback (shared engine) ────
  // The legal list ships to the FE, so a guess validates locally against a
  // Set. useWordSubmit owns the typed word, the sticky own-move pill, and the
  // optimistic commit + dedup; wordiply supplies the lookup (points = the
  // word's LENGTH, so the success pill shows the length — the one live
  // readout), the submit_guess RPC, and the reject reason.
  const legalSet = useMemo(() => new Set(game?.legalWords ?? []), [game?.legalWords])

  const { word, setWord, lastWord, submit, localFeedback, clearLocalFeedback, showLocalFeedback } =
    useWordSubmit({
      mode: game?.mode ?? 'coop',
      userId: session.user.id,
      isTerminal: isTerminal || myConceded,
      // Must be LONGER than the base, so the minimum length is base + 1.
      minWordLength: base.length + 1,
      foundWords: guesses,
      lookup: (w): WordEntry | null =>
        legalSet.has(w) ? { word: w, points: w.length, isBonus: false } : null,
      commit: async (e) => {
        const { data, error } = await db.rpc('submit_guess', { target_game: gameId, word: e.word })
        if (error) return { error }
        const res = data as { ok?: boolean; reason?: string } | null
        if (res && res.ok === false) return { error: { message: rejectReason(res.reason, base) } }
        return { error: null }
      },
      // Not in the legal set: either it doesn't contain the base, or it's not
      // a word. (Too-short is handled by minWordLength above.)
      explainReject: (w) =>
        base && !w.includes(base.toLowerCase()) ? `must contain "${base.toUpperCase()}"` : 'not a word',
    })

  // ─── End / Concede / Replay — the shared trio ──────────
  // The byte-identical shared handlers (useStandardGameActions); only the
  // failure-pill format + the replay sentence are wordiply's. New game stays
  // below — its create path diverges per game.
  const showError = useCallback((m: string) => showLocalFeedback('error', m), [showLocalFeedback])
  const { endGame, concede, replay } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    replayConfirm: "Replay board? This clears everyone's guesses and restarts the same starter.",
    showError,
  })

  const gameMode = game?.mode
  const handleNewGame = useCallback(async () => {
    if (!gameMode) return
    const res = await invokeStartGameEdgeFn(
      'wordiply-build-board',
      { target_club: clubHandle, setup, player_user_ids: players.map((p) => p.user_id), mode: gameMode },
      brand,
    )
    if ('error' in res) {
      showLocalFeedback('error', `New game failed: ${res.error}`)
      return
    }
    goToGame(`wordiply_${gameMode}`, res.id)
  }, [gameMode, clubHandle, setup, players, brand, goToGame, showLocalFeedback])

  useEffect(() => {
    actionsRef.current = {
      endGame,
      concede,
      replay,
      newGame: () => void handleNewGame(),
    }
  }, [endGame, concede, replay, handleNewGame])

  // ─── GamePage menu ─────────────────────────────────────
  useEffect(() => {
    if (!game) return
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: game.mode,
        isTerminal,
        conceded: myConceded,
        onEndGame: () => actionsRef.current?.endGame(),
        onConcede: () => actionsRef.current?.concede(),
        extra: [
          ...infoSheet.menuSections,
          {
            items: [
              { id: 'replay', label: 'Replay board', onClick: () => actionsRef.current?.replay() },
              { id: 'new-game', label: 'New game', onClick: () => actionsRef.current?.newGame() },
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, game, isTerminal, myConceded, infoSheet.menuSections])

  // ─── Coop peer-guess narration (global header) ─────────
  // coop's guesses are club-wide, so a teammate's guess arrives in `guesses`;
  // surface it with its length (the one live readout — no scores). Own guesses
  // go to the in-body local pill.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    // Gate the seed on the guesses fetch (separate from the header that sets
    // `game`), so a coop rejoin doesn't replay the backlog as a burst of pills.
    ready: rowsLoaded,
    items: guesses,
    keyOf: (r) => `${r.user_id}:${r.word}`,
    messageFor: (r) => {
      if (r.user_id === session.user.id) return null
      const member = players.find((p) => p.user_id === r.user_id)
      return {
        tone: 'success',
        variant: 'outline',
        // No verb: the dot names who, the word is the news, the count is its
        // length. "played" earned no room in a ~26-char header pill.
        text: (
          <>
            <ActorDot actor={member} fallback="A teammate" /> {r.word.toUpperCase()} ({r.length})
          </>
        ),
        dismiss: { kind: 'timed' },
      }
    },
    globalFeedback,
  })

  if (loading) return <div className={styles.loading}>Loading…</div>
  if (!game) return <div className={styles.empty}>Game not found.</div>

  const isCompete = game.mode === 'compete'
  const isLocallyDone = isCompete && myConceded && !isTerminal
  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId` is
  // null in a free-for-all game, so this is false there — the pill's presence is
  // fixed for the game's life, no reflow.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal

  // Compete leaderboard (off the live status jsonb) → per-player metrics.
  const leaderboard = (status?.leaderboard as LeaderRow[] | undefined) ?? []
  const guessesByUser = new Map(leaderboard.map((e) => [e.user_id, e.guesses_used ?? 0]))
  const scoreByUser = new Map(leaderboard.map((e) => [e.user_id, e.length_score ?? 0]))

  const active = !isTerminal && !myConceded && guessesUsed < MAX_GUESSES

  const over = isTerminal
    ? buildOver({
        mode: game.mode,
        playState,
        status,
        longest,
        letters,
        maxWordLength: game.max_word_length,
        leaderboard,
        selfId: session.user.id,
        players,
      })
    : null

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        base={base}
        guesses={boardRows}
        // `!isMyTurn` folds in turn-order (coop only): a waiting player's entry
        // freezes. Always true for free-for-all / solo. wordiply's disabled entry
        // shows no "locally done" pill, so a waiting coop player sees only the
        // frozen keyboard + the InfoCol TurnStatusLine.
        entryDisabled={!active || !isMyTurn}
        word={word}
        onChange={setWord}
        onSubmit={submit}
        clearLocalFeedback={clearLocalFeedback}
        lastWord={lastWord}
        // Locally terminal (compete: I conceded while the others race on) gets
        // the standard "you're out" pill; a teammate's turn (coop turn-order)
        // gets the whose-turn pill — the ONLY such indicator on mobile, where the
        // InfoCol's TurnStatusLine is off-canvas. Either way the frozen keyboard
        // gets an explanation, matching every other game's below-board treatment.
        localPill={
          isLocallyDone
            ? outOfRacePill(true)
            : waiting
              ? waitingTurnPill(players.find((p) => p.user_id === currentTurnUserId))
              : localFeedback
        }
        over={over}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close} wide>
        <InfoCol
          isCompete={isCompete}
          isTerminal={isTerminal}
          over={over}
          isLocallyDone={isLocallyDone}
          currentTurnUserId={currentTurnUserId}
          guessesUsed={guessesUsed}
          longest={longest}
          letters={letters}
          maxWordLength={game.max_word_length}
          longestWord={game.longestWords[0] ?? null}
          base={base}
          opponentReveal={opponentReveal}
          players={players}
          selfId={session.user.id}
          guessesByUser={guessesByUser}
          scoreByUser={scoreByUser}
          concededIds={concededIds}
          onEndGame={endGame}
          onConcede={concede}
          onRestart={replay}
          onNewGame={() => void handleNewGame()}
          onBackToClub={goToClub}
          onRequestBackToClub={menu.requestBackToClub}
          setup={wordiplySetup}
        />
      </InfoSheet>
      {/* No GameOverModal — the terminal result is shown in the below-board pill
          (BoardCol) + the info column (score bar, letters, reveal), so a modal
          would just interrupt. */}
      {confirmDialog}
    </div>
  )
}

/**
 * Maps the terminal play_state to the shared `TerminalCopy`. The scores that
 * were hidden all game land here: `tone` + `verdict` drive the below-board
 * terminal pill, `tone` + `message` the short info-column outcome line.
 *
 * Verdicts lead with the outcome word (`Won:` / `Lost:` / `Ended:`) and carry
 * no trailing period — the pill is a one-line, ellipsising row (~48 chars on a
 * phone), so it's a LABEL, not prose. A compete loss names WHO beat you, which
 * is the one case the pill wants a WIDGET (the winner's identity dot, the way
 * peer feedback names people elsewhere) — returned as `verdictNode`, with
 * `verdict` carrying the plain-text twin. A CO-win has 2+ winners, so it stays
 * a plain string (a row of dots would read as noise).
 *
 * Coop: no clear win — the team just did as well as it did — so every coop
 * terminal reports the result neutrally, manual end included.
 * Compete: `won_compete` → self won / tied vs a named winner; anything else →
 * no winner.
 */
function buildOver({
  mode,
  playState,
  status,
  longest,
  letters,
  maxWordLength,
  leaderboard,
  selfId,
  players,
}: {
  mode: 'coop' | 'compete'
  playState: string
  status: Record<string, unknown> | null
  longest: number
  letters: number
  maxWordLength: number
  leaderboard: LeaderRow[]
  selfId: string
  players: Member[]
}): TerminalCopy & { verdictNode?: ReactNode } {
  if (mode === 'compete') {
    if (playState === 'won_compete') {
      // winner_user_id is null on co-winners (a tie the server didn't break);
      // every tied player is flagged won in the leaderboard, so I read my own
      // row rather than trust a single-winner id. The winners share one score
      // (they tied on it), so any winner row gives the % to show.
      const winnerId = (status?.winner_user_id as string | undefined) ?? null
      const winners = leaderboard.filter((e) => e.won)
      const iWon = winnerId === selfId || (winnerId === null && winners.some((e) => e.user_id === selfId))
      const pct = winners[0]?.length_score ?? 0
      const shared = winners.length > 1
      if (iWon) {
        return {
          verdict: shared ? `Won: tied at ${pct}%` : `Won: ${pct}%`,
          message: shared ? 'You tied for the win!' : 'You won!',
          tone: 'won',
        }
      }
      const nameOf = (id?: string) => players.find((p) => p.user_id === id)?.username ?? 'someone'
      if (shared) {
        const label = winners.map((e) => nameOf(e.user_id)).join(' & ')
        return {
          verdict: `${label} tied at ${pct}%`,
          message: `${label} tied`,
          tone: 'lost',
        }
      }
      const soleId = winners[0]?.user_id ?? winnerId ?? undefined
      const label = nameOf(soleId)
      return {
        verdict: `${label} won at ${pct}%`,
        verdictNode: (
          <>
            <ActorDot actor={players.find((p) => p.user_id === soleId)} fallback="Someone" show="both" /> won
            at {pct}%
          </>
        ),
        message: `${label} won`,
        tone: 'lost',
      }
    }
    // ended / manual — no winner. The shared neutral copy, so the one terminal
    // every game has stays worded in one place.
    return endedCopy('compete')
  }

  // coop — the team's collaborative result. There's no clear "win" in coop (you
  // just did as well as you did), so the tone is NEUTRAL (a grey outcome colour)
  // rather than the celebratory green, and the verdict leads with `Ended:` — the
  // vocabulary's word for "over, nobody won or lost". That covers a manual end
  // too: reporting the score is more use than "game ended" with the numbers
  // withheld.
  const pct = lengthScore(longest, maxWordLength)
  return {
    verdict: `Ended: ${pct}%, ${letters} letters`,
    message: `Length ${pct}%`,
    tone: 'neutral',
  }
}
