import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import type { GamePageCtx } from '../../common/lib/games'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { outOfRacePill, stickyPill } from '../../common/lib/game/localPills'
import { waitingTurnPill } from '../../common/components/game/turnCopy'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { BOARD_SIZE, rejectReason, tailLetter } from '../lib/board'
import { isSuggestion, suggest } from '../lib/solve'
import type { LetterboxedSetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { invokeStartGameEdgeFn } from '../../common/lib/game/manifestRpcs'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

import '../theme.css'

/** A row of `status.leaderboard` (compete). */
type LeaderRow = {
  user_id: string
  username?: string
  words_used?: number
  letters_covered?: number
}

/**
 * letterboxed's play surface — shared between the coop and compete manifests.
 * Mode is read off `game.mode` (denormalized on `letterboxed.games_state`).
 *
 * Per-mode rendering:
 *   - **Coop**: ONE chain, shared. Every player's `players_state` row holds
 *     the same words (the server keeps them in lock-step), so the board simply
 *     renders "my" row and everyone sees the same thing.
 *   - **Compete**: each player builds their own chain on the same board.
 *     Rivals' words are hidden until terminal; the OpponentStrip publishes
 *     only the two numbers a race may reveal — letters covered and words used.
 *
 * Move entry is deliberately NOT `useWordSubmit`: that hook models a
 * found-words game (dedup against a growing set, points per word). Here a
 * submission is a chain APPEND whose legality depends on the word before it,
 * so the validation lives in `lib/board.ts` and the commit is a plain RPC.
 */
export function PlayArea(ctx: GamePageCtx) {
  const {
    gameId, isTerminal, playState, solutionRevealed, players, session, status,
    isMyTurn, currentTurnUserId,
    setup, goToClub, clubHandle, goToGame, menu, brand, globalFeedback,
  } = ctx
  const { game, playerRows, myRow, events, loading, rowsLoaded } = useGame(gameId)

  const letterboxedSetup = setup as LetterboxedSetup
  const infoSheet = useInfoSheet()
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback()

  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    restart: () => void
    newGame: () => void
  } | null>(null)

  // Only the letters the player typed/clicked. The mandatory first letter is
  // DERIVED from the chain each render (see BoardCol), so playing a word
  // re-seeds the entry without an effect and without stale state.
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // How many times the hint has been asked for at the CURRENT chain length.
  // The first press describes the move, a second names the word — so a nudge
  // is available without the answer being one click away. Playing or taking
  // back a word resets it, since the position changed.
  const [hintDepth, setHintDepth] = useState(0)
  const [hintAt, setHintAt] = useState(-1)

  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  const chain = useMemo(() => myRow?.chain ?? [], [myRow])
  const lettersCovered = myRow?.letters_covered ?? 0
  const playable = useMemo(() => new Set(game?.playableWords ?? []), [game?.playableWords])

  const sides = game?.sides ?? ''
  const maxWords = game?.max_words ?? 5

  // ─── Move entry ────────────────────────────────────────
  const submit = useCallback(async () => {
    if (!game || busy) return
    const word = (tailLetter(chain) ?? '') + draft
    const bad = rejectReason(word, { sides, chain, playable, maxWords })
    if (bad) {
      showLocalFeedback(stickyPill('error', bad))
      return
    }
    setBusy(true)
    const { error } = await db.rpc('submit_word', { target_game: gameId, submitted: word })
    setBusy(false)
    if (error) {
      showLocalFeedback(stickyPill('error', error.message))
      return
    }
    // The next word's first letter comes from the chain, which the realtime
    // refetch is about to update — so clearing the draft is all that's needed.
    setDraft('')
    clearLocalFeedback()
  }, [game, busy, chain, draft, sides, playable, maxWords, gameId, showLocalFeedback, clearLocalFeedback])

  // A board click appends — unless it lands on the letter the word already
  // ends with, which submits (see Board.tsx for why that is unambiguous).
  const pick = useCallback(
    (letter: string) => {
      clearLocalFeedback()
      const word = (tailLetter(chain) ?? '') + draft
      if (word.length > 0 && letter === word[word.length - 1]) {
        void submit()
        return
      }
      setDraft((d) => d + letter)
    },
    [chain, draft, submit, clearLocalFeedback],
  )

  const runChainRpc = useCallback(
    async (fn: 'undo_word' | 'clear_chain') => {
      setBusy(true)
      const { error } = await db.rpc(fn, { target_game: gameId })
      setBusy(false)
      if (error) {
        showLocalFeedback(stickyPill('error', error.message))
        return
      }
      setDraft('')
      clearLocalFeedback()
    },
    [gameId, showLocalFeedback, clearLocalFeedback],
  )
  // The chain strip's × on the last word. `clear_chain` still exists
  // server-side but has no surface: clicking × repeatedly reaches the empty
  // chain, so a bulk clear would be a second way to do the same thing.
  const removeLast = useCallback(() => void runChainRpc('undo_word'), [runChainRpc])

  // ─── Hint (coop only) ──────────────────────────────────
  // The search runs HERE, over the board's shipped word list — see lib/solve.ts
  // for why that list ships at all. The server is told only that a hint was
  // taken, so the counter and the log agree with what happened.
  const takeHint = useCallback(() => {
    if (!game) return
    const r = suggest(game.playableWords, sides, chain)
    // A new position resets the ladder; the same position advances it.
    const step = hintAt === chain.length ? hintDepth + 1 : 1
    setHintAt(chain.length)
    setHintDepth(step)

    if (!isSuggestion(r)) {
      showLocalFeedback(
        stickyPill(
          'warning',
          r.kind === 'stuck'
            ? 'Dead end — take a word back'
            : 'No way home from here — take a word back',
        ),
      )
      return
    }

    // Step 1 describes the move; step 2 names it. Both count as a hint: the
    // shape alone is often enough, and charging for it keeps the two honest.
    const text =
      step === 1
        ? `A ${r.word.length}-letter word from ${r.word[0].toUpperCase()} covers ${r.newLetters} new`
        : r.word.toUpperCase()
    showLocalFeedback(stickyPill('info', text))
    void db.rpc('log_hint', { target_game: gameId, suggested: r.word }).then(({ error }) => {
      // Log-and-swallow: the player already has their hint, so a failed write
      // must not change what they see — but it must not vanish either.
      if (error) console.error('recording a hint failed', error)
    })
  }, [game, sides, chain, hintAt, hintDepth, gameId, showLocalFeedback])

  // ─── End / Concede / Replay — the shared trio ──────────
  const showError = useCallback(
    (m: string) => showLocalFeedback(stickyPill('error', m)),
    [showLocalFeedback],
  )
  const { endGame, concede, restart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    showError,
  })

  const gameMode = game?.mode
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (it stays resumable from
    // the club page). Confirm so an accidental `+` doesn't read as a loss.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    if (!gameMode) return
    const res = await invokeStartGameEdgeFn(
      'letterboxed-build-board',
      { target_club: clubHandle, setup, player_user_ids: players.map((p) => p.user_id), mode: gameMode },
      brand,
    )
    if ('error' in res) {
      showError(`New game failed: ${res.error}`)
      return
    }
    goToGame(`letterboxed_${gameMode}`, res.id)
  }, [gameMode, clubHandle, setup, players, brand, goToGame, showError, confirmAction, isTerminal])

  // Single-flight: "New game" has three triggers (terminal button, menu item,
  // the global `+`) and create_game is NOT idempotent — guarding the handler
  // covers all three at once, which a `disabled` button could not.
  const [handleNewGame, startingNewGame] = useSingleFlight(createNewGame)

  useEffect(() => {
    actionsRef.current = {
      endGame,
      concede,
      restart,
      newGame: () => void handleNewGame(),
    }
  }, [endGame, concede, restart, handleNewGame])

  const leaderboard = useMemo(
    () => (status?.leaderboard as LeaderRow[] | undefined) ?? [],
    [status],
  )

  // ─── GamePage menu ─────────────────────────────────────
  // No "Print board (PDF)" item yet — the printer is deferred until the play
  // surface is settled.
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
          {
            items: [
              { id: 'restart', label: 'Restart', onClick: () => actionsRef.current?.restart() },
              { id: 'new-game', label: 'New game', shortcut: '+', onClick: () => actionsRef.current?.newGame() },
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, game, isTerminal, myConceded])

  // ─── Coop peer narration (global header) ───────────────
  // In coop the chain is shared, so a teammate's word changes MY board; say so.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    ready: rowsLoaded,
    items: events,
    keyOf: (e) => String(e.id),
    messageFor: (e) => {
      if (e.user_id === session.user.id || e.kind === 'hint') return null
      const member = players.find((p) => p.user_id === e.user_id)
      const what =
        e.kind === 'played'
          ? `${e.word?.toUpperCase() ?? ''} (${e.letters_covered}/${BOARD_SIZE})`
          : e.kind === 'undone'
            ? 'undid the last word'
            : 'cleared the chain'
      return {
        tone: e.kind === 'played' ? 'success' : 'info',
        variant: 'outline',
        text: (
          <>
            <ActorDot actor={member} fallback="A teammate" /> {what}
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
  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId`
  // is null in a free-for-all game, so this is false there — the pill's
  // presence is fixed for the game's life, no reflow.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal
  // The cap is spent and the board isn't covered. There is no legal move left
  // but taking a word back, so the board and the entry both go inert rather
  // than letting a player compose a sixth word only to be refused it.
  const chainFull = chain.length >= maxWords && lettersCovered < BOARD_SIZE
  // TWO different gates, and conflating them is a bug: a full chain freezes the
  // ENTRY (there is no word to compose) but must leave the chain EDITABLE,
  // because taking a word back is the only move left. Passing the entry's gate
  // to the chain strip hid the × exactly when it was needed.
  const chainEditable = !isTerminal && !myConceded && isMyTurn
  const entryDisabled = !chainEditable || chainFull

  const wordsByUser = new Map(
    playerRows.map((r) => [r.user_id, r.word_count]),
  )
  const coveredByUser = new Map(
    playerRows.map((r) => [r.user_id, r.letters_covered]),
  )

  const over = isTerminal
    ? buildOver({
        mode: game.mode,
        playState,
        status,
        leaderboard,
        selfId: session.user.id,
        lettersCovered,
        wordsUsed: chain.length,
      })
    : null

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        sides={sides}
        chain={chain}
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={() => void submit()}
        onPick={pick}
        onRemoveLast={removeLast}
        clearLocalFeedback={clearLocalFeedback}
        entryDisabled={entryDisabled}
        chainEditable={chainEditable}
        chainFull={chainFull}
        busy={busy}
        // Locally terminal (compete: I conceded while the others race on) gets
        // the standard "you're out" pill; a teammate's turn gets the
        // whose-turn pill — the ONLY such indicator on a phone, where the
        // InfoCol's TurnStatusLine is off-canvas.
        localPill={
          isLocallyDone
            ? outOfRacePill(true)
            : waiting
              ? waitingTurnPill(players.find((p) => p.user_id === currentTurnUserId))
              : localFeedback
        }
        over={over}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          over={over}
          isTerminal={isTerminal}
          isLocallyDone={isLocallyDone}
          isTurnGame={letterboxedSetup.coop_style === 'turns'}
          currentTurnUserId={currentTurnUserId}
          chain={chain}
          maxWords={maxWords}
          lettersCovered={lettersCovered}
          solution={game.solution}
          solutionRevealed={solutionRevealed}
          events={events}
          players={players}
          selfId={session.user.id}
          isCompete={isCompete}
          wordsByUser={wordsByUser}
          coveredByUser={coveredByUser}
          concededIds={concededIds}
          setup={letterboxedSetup}
          hintsUsed={myRow?.hints_used ?? 0}
          onHint={takeHint}
          onEndGame={endGame}
          onConcede={concede}
          onRestart={restart}
          onNewGame={handleNewGame}
          startingNewGame={startingNewGame}
          onBackToClub={goToClub}
          onRequestBackToClub={menu.requestBackToClub}
        />
      </InfoSheet>
      {/* No modal at terminal (docs/ui.md → Terminal results) — the result is
          in the below-board pill and the info column, so a modal would just
          interrupt. */}
      {confirmDialog}
    </div>
  )
}

/**
 * Maps the terminal play_state to the shared `TerminalCopy`.
 *
 * Coop wins by covering all twelve inside the cap; its losses are the clock
 * and the group calling it. Compete's win is FIRST past that same bar, which
 * is why the race ends on a solve rather than continuing — there is no
 * "fewest" left to improve on. A timed-out race still resolves, on the most
 * letters covered, so a clock expiry produces a result rather than crowning
 * nobody.
 */
function buildOver({
  mode,
  playState,
  status,
  leaderboard,
  selfId,
  lettersCovered,
  wordsUsed,
}: {
  mode: 'coop' | 'compete'
  playState: string
  status: Record<string, unknown> | null
  leaderboard: LeaderRow[]
  selfId: string
  lettersCovered: number
  wordsUsed: number
}): TerminalCopy {
  const timedOut = status?.timed_out === true

  if (mode === 'coop') {
    if (playState === 'won') {
      return {
        tone: 'won',
        verdict: `Won: all twelve in ${wordsUsed} ${wordsUsed === 1 ? 'word' : 'words'}`,
        message: 'You covered the board!',
      }
    }
    if (playState === 'lost') {
      return timedOut
        ? { tone: 'lost', verdict: `Lost: out of time at ${lettersCovered}/12`, message: 'Out of time' }
        : { tone: 'lost', verdict: `Lost: stopped at ${lettersCovered}/12`, message: 'Called it' }
    }
    return endedCopy('coop')
  }

  // Compete.
  if (playState === 'won_compete') {
    const winnerId = status?.winner_id as string | undefined
    if (winnerId === selfId) {
      return {
        tone: 'won',
        verdict: `Won: all twelve in ${wordsUsed} ${wordsUsed === 1 ? 'word' : 'words'}`,
        message: 'You got there first!',
      }
    }
    // A timeout resolves on coverage instead of a solve, so the winner comes
    // off the leaderboard rather than from a winner_id.
    if (timedOut) {
      const best = leaderboard[0]
      const iWon = best?.user_id === selfId
      return {
        tone: iWon ? 'won' : 'lost',
        verdict: iWon
          ? `Won: most letters (${best?.letters_covered ?? 0}/12)`
          : `Lost: ${best?.username ?? 'someone'} covered more`,
        message: iWon ? 'Most letters when time ran out' : 'Out of time',
      }
    }
    const name = leaderboard.find((e) => e.user_id === winnerId)?.username
    return {
      tone: 'lost',
      verdict: `Lost: ${name ?? 'someone'} got there first`,
      message: 'Beaten to it',
    }
  }
  if (playState === 'lost_compete') {
    return status?.outcome === 'conceded'
      ? { tone: 'lost', verdict: 'Lost: everyone conceded', message: 'Everyone dropped out' }
      : { tone: 'lost', verdict: 'Lost: nobody covered the board', message: 'Nobody finished' }
  }
  return endedCopy('compete')
}
