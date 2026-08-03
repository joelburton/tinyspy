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
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { buildWordiplyPrintModel } from '../pdf/model'
import { printWordiplyPdf } from '../pdf/printWordiplyPdf'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
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
    gameId, isTerminal, playState, solutionRevealed, players, session, status,
    isMyTurn, currentTurnUserId,
    setup, goToClub, clubHandle, goToGame, menu, brand, globalFeedback, title,
  } = ctx
  const { game, guesses, validGuesses, loading, rowsLoaded } = useGame(gameId)

  const wordiplySetup = setup as WordiplySetup

  const infoSheet = useInfoSheet()
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    restart: () => void
    newGame: () => void
  } | null>(null)

  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  // The board's rows. Coop shares one track (every guess); compete shows only
  // the caller's own (opponents' rows are RLS-hidden mid-game and, once the
  // reveal opens them at terminal, must NOT crowd my board — my five guesses
  // stay mine). Already ordered by guessed_at from useGame.
  const myGuesses = useMemo<GuessRow[]>(
    () =>
      game?.mode === 'compete'
        ? validGuesses.filter((g) => g.user_id === session.user.id)
        : validGuesses,
    [validGuesses, game?.mode, session.user.id],
  )
  const boardRows = useMemo(() => myGuesses.map((g) => ({ word: g.word, length: g.length })), [myGuesses])
  const guessesUsed = boardRows.length
  const longest = boardRows.reduce((m, g) => Math.max(m, g.length), 0)
  const letters = boardRows.reduce((s, g) => s + g.length, 0)

  // Compete terminal reveal — each opponent's words. Mid-game their rows are
  // RLS-hidden so `guesses` holds only mine; at terminal the RLS opens them,
  // so group the now-visible non-self rows by player (in play order — useGame
  // orders by guessed_at). Empty in coop / mid-game → the reveal renders null.
  const opponentReveal = useMemo(() => {
    if (game?.mode !== 'compete' || !isTerminal) return []
    const byUser = new Map<string, { word: string; length: number }[]>()
    for (const g of validGuesses) {
      if (g.user_id === session.user.id) continue
      const rows = byUser.get(g.user_id) ?? []
      rows.push({ word: g.word, length: g.length })
      byUser.set(g.user_id, rows)
    }
    return players
      .filter((p) => p.user_id !== session.user.id)
      .map((player) => ({ player, guesses: byUser.get(player.user_id) ?? [] }))
  }, [validGuesses, game?.mode, isTerminal, players, session.user.id])

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
      foundWords: guesses, // ALL rows: the server dedups on rejects too, so a re-try reads as 'already found' here rather than round-tripping
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
      // Record the rejection too — in wordiply a rejected guess is a TURN (see
      // the guesses table header). We hand the server `fe_legal: false` and it
      // re-derives WHICH guard applies, since it owns the structural rules; a
      // structural reject also costs the caller their go in turn-by-turn coop.
      // Fire-and-forget: the pill already says the same thing, so a failed
      // write must not change what the player sees.
      recordReject: (w) => {
        void db
          .rpc('submit_guess', { target_game: gameId, word: w, fe_legal: false })
          .then(({ error }) => {
            // Log-and-swallow: the pill already told the player, so a failed
            // write must not change what they see — but it must not vanish
            // silently either (the log would just be missing a row).
            if (error) console.error('recording a rejected guess failed', error)
          })
      },
    })

  // ─── End / Concede / Replay — the shared trio ──────────
  // The byte-identical shared handlers (useStandardGameActions); only the
  // failure-pill format + the replay sentence are wordiply's. New game stays
  // below — its create path diverges per game.
  const showError = useCallback((m: string) => showLocalFeedback('error', m), [showLocalFeedback])
  const { endGame, concede, restart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    restartConfirm: "Restart? This clears everyone's guesses and restarts the same starter.",
    showError,
  })

  const gameMode = game?.mode
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
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
  }, [gameMode, clubHandle, setup, players, brand, goToGame, showLocalFeedback, confirmAction, isTerminal])

  // Single-flight guard. New game has THREE triggers (the terminal button, the
  // game-menu item, and the global `+` shortcut), and `common.create_game` is
  // NOT idempotent — every call shelves the club's current game and starts
  // another, orphaning the last in the club list and toasting every peer.
  // Guarding the HANDLER covers all three triggers at once, which a `disabled`
  // button could never do. `startingNewGame` then greys the button so a slow
  // network reads as "working" rather than "nothing happened".
  //
  // The MENU ITEM deliberately takes no `disabled`: its effect is built above
  // this line and is kept independent of handler identity on purpose (the
  // actionsRef indirection). It doesn't need one — `+` and the menu both route
  // through this same guarded handler.
  const [handleNewGame, startingNewGame] = useSingleFlight(createNewGame)

  useEffect(() => {
    actionsRef.current = {
      endGame,
      concede,
      restart,
      newGame: () => void handleNewGame(),
    }
  }, [endGame, concede, restart, handleNewGame])

  // Compete leaderboard (off the live status jsonb) → per-player metrics.
  // Memoized because the print model (and so the menu effect) depends on it: the
  // `?? []` fallback would otherwise mint a new array every render and rebuild
  // the whole game menu each time.
  const leaderboard = useMemo(
    () => (status?.leaderboard as LeaderRow[] | undefined) ?? [],
    [status],
  )

  // ─── GamePage menu ─────────────────────────────────────
  // The "Print board (PDF)" model is built HERE, from the live state, and is a
  // snapshot at click time (docs/pdf.md). What it may show is decided in
  // pdf/model.ts — notably wordiply's terminal-only reveal, which has to hold on
  // paper too. RLS already scopes `guesses` to what I may see, so a mid-game
  // compete print carries only my own rows without needing a filter here.
  useEffect(() => {
    if (!game) return
    const printModel = buildWordiplyPrintModel({
      brand,
      gameTitle: title,
      date: new Date().toLocaleDateString(),
      base,
      maxWordLength: game.max_word_length,
      longestWord: game.longestWords[0] ?? null,
      solutionRevealed,
      mode: game.mode,
      isTerminal,
      guesses,
      players,
      selfId: session.user.id,
      guessesUsed,
      maxGuesses: MAX_GUESSES,
      lengthScore: lengthScore(longest, game.max_word_length),
      letterCount: letters,
      leaderboard,
      // Relevant setup only — the timer isn't meaningful on paper.
      setup: [{ label: 'Dictionary', value: difficultyValue(wordiplySetup.difficulty) }],
    })
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
              { id: 'restart', label: 'Restart', onClick: () => actionsRef.current?.restart() },
              { id: 'new-game', label: 'New game', shortcut: '+', onClick: () => actionsRef.current?.newGame() },
            ],
          },
          { items: [{ id: 'print', label: 'Print board (PDF)', onClick: () => printWordiplyPdf(printModel) }] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [
    menu, game, isTerminal, solutionRevealed, myConceded, infoSheet.menuSections,
    brand, title, base, guesses, players, session.user.id, guessesUsed,
    longest, letters, leaderboard, wordiplySetup,
  ])

  // ─── Coop peer-guess narration (global header) ─────────
  // coop's guesses are club-wide, so a teammate's guess arrives in `guesses`;
  // surface it with its length (the one live readout — no scores). Own guesses
  // go to the in-body local pill.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    // Gate the seed on the guesses fetch (separate from the header that sets
    // `game`), so a coop rejoin doesn't replay the backlog as a burst of pills.
    ready: rowsLoaded,
    items: validGuesses,
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
          allGuesses={guesses}
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
          solutionRevealed={solutionRevealed}
          base={base}
          opponentReveal={opponentReveal}
          players={players}
          selfId={session.user.id}
          guessesByUser={guessesByUser}
          scoreByUser={scoreByUser}
          concededIds={concededIds}
          onEndGame={endGame}
          onConcede={concede}
          onRestart={restart}
          onNewGame={handleNewGame}
        startingNewGame={startingNewGame}
          onBackToClub={goToClub}
          onRequestBackToClub={menu.requestBackToClub}
          setup={wordiplySetup}
        />
      </InfoSheet>
      {/* No modal at terminal (docs/ui.md → Terminal results) — the result is
          shown in the below-board pill (BoardCol) + the info column (score bar,
          letters, reveal), so a modal would just interrupt. wordiply has no win
          state, so there's no celebration either. */}
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
 * terminal reports the result neutrally, manual end included; the clock is
 * the one coop loss.
 * Compete: `won_compete` → self won / tied vs a named winner;
 * `lost_compete` → a collective loss naming its cause (all conceded, or a
 * nobody-scored race that ran out of time / guesses); `ended` + manual → the
 * shared neutral copy.
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
    // The three compete collective losses all land on `lost_compete`, told
    // apart by `outcome`: the last racer dropping out (common.concede), or a
    // nobody-scored race ending by the clock / by the table spending all its
    // guesses (wordiply._finish_compete's best_score=0 path). Each names its
    // cause, agreeing with the club card's `Lost (…)` label.
    if (playState === 'lost_compete') {
      const outcome = (status?.outcome as string | undefined) ?? ''
      if (outcome === 'conceded') {
        return { verdict: 'Lost: all conceded', message: 'All conceded', tone: 'lost' }
      }
      if (outcome === 'timeout') {
        return { verdict: 'Lost: out of time, nobody scored', message: 'Out of time', tone: 'lost' }
      }
      return { verdict: 'Lost: out of guesses, nobody scored', message: 'Nobody scored', tone: 'lost' }
    }
    // ended / manual — no winner. The shared neutral copy, so the one terminal
    // every game has stays worded in one place.
    return endedCopy('compete')
  }

  // coop — the team's collaborative result. There's no "win" in coop (you just
  // did as well as you did), so spending the guesses or stopping on purpose are
  // NEUTRAL (a grey outcome colour, `Ended:` — the vocabulary's word for "over,
  // nobody won or lost"), and the score is reported either way: the numbers are
  // more use than a bare "game ended".
  //
  // The CLOCK is the one exception, and the one way a coop table loses: the
  // team set a timer and didn't spend its five guesses inside it (see
  // wordiply._finish_coop). Same reading scrabble coop gives its own clock.
  const pct = lengthScore(longest, maxWordLength)
  if (playState === 'lost') {
    return {
      verdict: `Lost: out of time, ${pct}%`,
      message: `Length ${pct}%`,
      tone: 'lost',
    }
  }
  return {
    verdict: `Ended: ${pct}%, ${letters} letters`,
    message: `Length ${pct}%`,
    tone: 'neutral',
  }
}
