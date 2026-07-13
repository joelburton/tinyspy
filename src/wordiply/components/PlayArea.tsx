import { useCallback, useEffect, useMemo, useRef } from 'react'
import { cls } from '../../common/lib/util/cls'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import type { GamePageCtx, Member } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
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
import { useConfirmDialog, END_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
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
      return 'already used'
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

  // ─── Actions ───────────────────────────────────────────
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!(await confirmAction(END_GAME_CONFIRM))) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback('error', `End game failed: ${error.message}`)
  }, [gameId, isTerminal, showLocalFeedback, confirmAction])

  const handleConcede = useCallback(async () => {
    if (isTerminal || myConceded) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback('error', `Concede failed: ${error.message}`)
  }, [gameId, isTerminal, myConceded, showLocalFeedback])

  const handleReplay = useCallback(async () => {
    if (
      !isTerminal &&
      !window.confirm("Replay board? This clears everyone's guesses and restarts the same starter.")
    )
      return
    const { error } = await db.rpc('replay_board', { target_game: gameId })
    if (error) showLocalFeedback('error', `Replay failed: ${error.message}`)
  }, [isTerminal, gameId, showLocalFeedback])

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
      endGame: () => void handleEndGame(),
      concede: () => void handleConcede(),
      replay: () => void handleReplay(),
      newGame: () => void handleNewGame(),
    }
  }, [handleEndGame, handleConcede, handleReplay, handleNewGame])

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
        text: (
          <>
            <ActorDot actor={member} fallback="A teammate" /> played {r.word.toUpperCase()} ({r.length})
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
        entryDisabled={!active}
        word={word}
        onChange={setWord}
        onSubmit={submit}
        clearLocalFeedback={clearLocalFeedback}
        lastWord={lastWord}
        localPill={localFeedback}
        over={over}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close} wide>
        <InfoCol
          isCompete={isCompete}
          isTerminal={isTerminal}
          over={over}
          isLocallyDone={isLocallyDone}
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
          onEndGame={() => void handleEndGame()}
          onConcede={() => void handleConcede()}
          onRestart={() => void handleReplay()}
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
 * Maps the terminal play_state to the shared `TerminalCopy` (modal +
 * info-column line) plus a wordiply `indicator` (the below-board line). The
 * scores that were hidden all game land here.
 *
 * Coop: `ended` → "You reached N%" (a collaborative result, framed as a win).
 * Compete: `won_compete` → self won ("You won — N%") vs a named opponent won;
 * `ended`/manual → no winner.
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
}): TerminalCopy & { indicator: string } {
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
          outcome: 'won',
          verdict: shared ? `You tied for the win — ${pct}%!` : `You won — ${pct}%!`,
          indicator: shared ? `you tied for the win at ${pct}%` : `you won at ${pct}%`,
          message: shared ? 'You tied for the win!' : 'You won!',
          tone: 'won',
        }
      }
      const nameOf = (id?: string) => players.find((p) => p.user_id === id)?.username ?? 'someone'
      const winnerLabel = shared
        ? winners.map((e) => nameOf(e.user_id)).join(' & ')
        : nameOf(winners[0]?.user_id ?? winnerId ?? undefined)
      return {
        outcome: 'lost',
        verdict: shared ? `${winnerLabel} tied for the win — ${pct}%.` : `${winnerLabel} won with ${pct}%.`,
        indicator: shared ? `${winnerLabel} tied at ${pct}%` : `${winnerLabel} won at ${pct}%`,
        message: shared ? `${winnerLabel} tied` : `${winnerLabel} won`,
        tone: 'lost',
      }
    }
    // ended / manual — no winner.
    return {
      outcome: 'lost',
      verdict: 'Game ended — no winner.',
      indicator: 'ended — no winner',
      message: 'Game ended',
      tone: 'neutral',
    }
  }

  // coop — the team's collaborative result. There's no clear "win" in coop
  // (you just did as well as you did), so the tone is NEUTRAL (a grey outcome
  // colour), not the celebratory green. `outcome: 'won'` only keeps the modal
  // from reading as a LOSS (neutral-green, per TerminalCopy's convention).
  const pct = lengthScore(longest, maxWordLength)
  return {
    // `outcome` only drives the GameOverModal, which wordiply doesn't show —
    // 'won' just means "not a loss". The DISPLAYED colour is `tone: 'neutral'`
    // (grey), because coop has no clear win.
    outcome: 'won',
    verdict: `Length: ${pct}%, Letters: ${letters}.`,
    indicator: `Length: ${pct}%, Letters: ${letters}`,
    message: `Length ${pct}%`,
    tone: 'neutral',
  }
}
