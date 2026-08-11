import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconHint, IconNewGame, IconPrint, IconRestart, IconReveal, IconSpoiler } from '../../common/components/icons'
import { cls } from '../../common/lib/util/cls'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import type { GamePageCtx } from '../../common/lib/games'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { outOfRacePill, stickyPill } from '../../common/lib/game/localPills'
import { waitingTurnPill } from '../../common/components/game/turnCopy'
import { db } from '../db'
import { db as commonDb } from '../../common/db'
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
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { chainAt, describeAt } from '../lib/history'
import { setupRows } from '../lib/setupSummary'
import { helpPillText } from '../lib/help'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
import { buildLetterboxedPrintModel } from '../pdf/model'
import { printLetterboxedPdf } from '../pdf/printLetterboxedPdf'
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
  /** Only on a timed-out race: the server's per-row verdict. Ties are
   *  co-winners (every tied row flagged), so "did I win" is my own row's
   *  flag — never `leaderboard[0]`, whose order among tied rows is
   *  arbitrary. The solve-path win writes `winner_id` instead. */
  won?: boolean
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
    setup, goToClub, clubHandle, goToGame, menu, brand, globalFeedback, title,
  } = ctx
  const { game, playerRows, myRow, events, loading, rowsLoaded } = useGame(gameId, session.user.id)

  const letterboxedSetup = setup as LetterboxedSetup

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array. Literally the
  // same object, which is a stronger guarantee than "both call the same
  // function" (docs/pdf.md → Setup rows). Empty until the game row lands; the
  // print effect below is guarded on `game` anyway, and the info column doesn't
  // render until after the loading return.
  const summaryRows = useMemo(
    () => (game ? setupRows(letterboxedSetup, game.mode, players) : []),
    [letterboxedSetup, game, players],
  )

  const infoSheet = useInfoSheet()
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback()

  const leaderboard = useMemo(
    () => (status?.leaderboard as LeaderRow[] | undefined) ?? [],
    [status],
  )

  // Confetti at the MOMENT the board is covered. Gated ONLY on the common.games
  // row, which GamePage has already awaited — anything that arrives later would
  // flip false→true after mount and celebrate at someone merely reviewing a
  // finished game (useCelebration's rule 1). A solve names its winner_id; a
  // timed-out race has co-winners instead, flagged per leaderboard row.
  const celebration = useCelebration(
    playState === 'won' ||
      (playState === 'won_compete' &&
        (status?.winner_id === session.user.id ||
          leaderboard.some((e) => e.won && e.user_id === session.user.id))),
  )

  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    restart: () => void
    newGame: () => void
    hint: () => void
    spoiler: () => void
    reveal: () => void
  } | null>(null)

  // Only the letters the player typed/clicked. The mandatory first letter is
  // DERIVED from the chain each render (see BoardCol), so playing a word
  // re-seeds the entry without an effect and without stale state.
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  // Turn-history viewer, keyed by POSITION in the rows the log is showing (the
  // log hands them up, so both sides index the same list).
  const {
    viewingId: viewingIndex,
    viewing,
    select: selectTurn,
    exitViewing,
    exitOnKey,
  } = useHistoryViewer<number>()
  // BoardCol freezes the entry's capture while viewing, so exitOnKey has the
  // keys to itself: any keystroke returns to the live board instead of typing
  // behind the banner (docs/keyboard-shortcuts.md → the viewer contract).
  useGlobalKeyHandler(exitOnKey)
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
    // The accepted-word pill restates the cap: with no mobile status bar the
    // board shows WHICH letters are covered and the strip shows the words, but
    // "how many words are left" has no ambient home on a phone, so every
    // accepted word says it. TIMED, not sticky (Joel's call, 2026-08-05): a
    // sticky pill sits in the entry's slot until the next keystroke, which
    // made every submit feel like a modal moment — this one says its piece
    // and hands the entry back on its own. A solve is pre-empted by the
    // terminal verdict and a cap-filling word by BoardCol's chainFull pill
    // (both outrank localPill), so the two zero-cases need no branches here.
    const wordsLeft = maxWords - (chain.length + 1)
    if (wordsLeft > 0) {
      showLocalFeedback({
        tone: 'success',
        text: `${word.toUpperCase()} — ${wordsLeft} ${wordsLeft === 1 ? 'word' : 'words'} left`,
        mode: { kind: 'timed' },
      })
    } else {
      clearLocalFeedback()
    }
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

  // ─── Help (coop only) ──────────────────────────────────
  // The search runs HERE, over the board's shipped word list — see lib/solve.ts
  // for why that list ships at all. The server is told only that help was
  // taken, so the turn log agrees with what happened.
  //
  // Two buttons, two rungs of the shared help ladder (docs/ui.md → button
  // iconography): HINT describes the word, SPOILER hands it over. Both are
  // coop-only — in compete, "first past the bar wins" would make either a win
  // button, and the server refuses them there too.
  const askHelp = useCallback(
    (kind: 'hint' | 'spoiler') => {
      if (!game) return
      // The room left under the cap rides along so the search can refuse to
      // point down a road the cap cuts off (the offPar answer below).
      const r = suggest(game.playableWords, sides, chain, maxWords - chain.length)

      if (!isSuggestion(r)) {
        showLocalFeedback(
          stickyPill(
            'warning',
            r.kind === 'stuck'
              ? 'Dead end — take a word back'
              : r.kind === 'offPar'
                ? `The shortest finish is ${r.wordsToFinish} ${r.wordsToFinish === 1 ? 'word' : 'words'} — more than you have left. Take a word back`
                : 'No way home from here — take a word back',
          ),
        )
        return
      }

      // STICKY, not `manual` — deliberate, and the one place a hint isn't.
      //
      // stackdown's spoiler is `manual` because you hunt tiles across the board
      // with it open; a click must not take it away. Here the opposite is true:
      // the pill occupies the ENTRY's slot, so the moment you act on the hint —
      // type, or click a letter — you need that slot back. Making it `manual`
      // would mean either blocking input until the × is pressed, or a pill that
      // hides the entry you're typing into.
      //
      // It costs nothing to lose: the turn log keeps the hint's CONTENT ("Hint:
      // 8 letters: ADG"), so the pill is a convenience copy, not the record.
      showLocalFeedback(stickyPill('info', helpPillText(kind, r.word)))
      void db
        .rpc('log_help', { target_game: gameId, word_shown: r.word, kind })
        .then(({ error }) => {
          // Log-and-swallow: the player already has their answer, so a failed
          // write must not change what they see — but it must not vanish either.
          if (error) console.error('recording help failed', error)
        })
    },
    [game, sides, chain, maxWords, gameId, showLocalFeedback],
  )
  const takeHint = useCallback(() => askHelp('hint'), [askHelp])
  const takeSpoiler = useCallback(() => askHelp('spoiler'), [askHelp])

  // Reveal the seeded solution — the shared display flag, not a letterboxed
  // one: common.reveal_solution enforces "only once the game is over for
  // everyone", so a player who dropped out can't spoil a live race.
  const handleReveal = useCallback(async () => {
    const { error } = await commonDb.rpc('reveal_solution', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', `Reveal failed: ${error.message}`))
  }, [gameId, showLocalFeedback])

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
      hint: takeHint,
      spoiler: takeSpoiler,
      reveal: () => void handleReveal(),
    }
  }, [endGame, concede, restart, handleNewGame, takeHint, takeSpoiler, handleReveal])

  // ─── GamePage menu ─────────────────────────────────────
  // The print model is built HERE, from live state, and is a snapshot at click
  // time (docs/pdf.md). What it may SHOW is decided in pdf/model.ts — notably
  // that the solution prints only once the players have revealed it on screen,
  // which has to hold on paper too.
  useEffect(() => {
    if (!game) return
    const printModel = buildLetterboxedPrintModel({
      brand,
      gameTitle: title,
      date: new Date().toLocaleDateString(),
      sides: game.sides,
      mode: game.mode,
      solution: game.solution,
      solutionRevealed,
      players,
      playerRows,
      events,
      selfId: session.user.id,
      summary: `${lettersCovered}/${BOARD_SIZE} letters · ${chain.length}/${maxWords} words`,
      setup: summaryRows,
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
          // The menu twins of the info column's help ladder. COOP ONLY — the
          // whole pair is omitted in compete, where the buttons don't render
          // either (in a race "first past the bar wins" would make either one a
          // win button, and the server refuses them there too). A menu that
          // named a glyph the surface never shows would teach a lie; crosswords
          // drops its Reveal submenu in compete for exactly this reason.
          ...(game.mode === 'coop'
            ? [{
              items: [
                { id: 'hint', icon: IconHint, label: 'Hint', disabled: isTerminal, onClick: () => actionsRef.current?.hint() },
                { id: 'spoiler', icon: IconSpoiler, label: 'Show the word', disabled: isTerminal, onClick: () => actionsRef.current?.spoiler() },
              ],
            }]
            : []),
          {
            items: [
              { id: 'restart', icon: IconRestart, label: 'Restart', onClick: () => actionsRef.current?.restart() },
              { id: 'new-game', icon: IconNewGame, label: 'New game', shortcut: '+', onClick: () => actionsRef.current?.newGame() },
              // The menu twin of the terminal row's boxed-eye button — the same
              // shared display flag, reachable the whole time so a player who
              // scrolled past the row can still get to it. Inert until the game
              // is over for EVERYONE, which is where common.reveal_solution
              // enforces it too; the disabled row is a UI convenience, not the gate.
              {
                id: 'reveal',
                icon: IconReveal,
                label: 'Reveal solution',
                disabled: !isTerminal || solutionRevealed,
                onClick: () => actionsRef.current?.reveal(),
              },
            ],
          },
          { items: [{ id: 'print', icon: IconPrint, label: 'Print board (PDF)', onClick: () => printLetterboxedPdf(printModel) }] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [
    menu, game, isTerminal, myConceded, brand, title, solutionRevealed,
    players, playerRows, events, session.user.id, letterboxedSetup, summaryRows,
    lettersCovered, chain.length, maxWords,
  ])

  // ─── Coop peer narration (global header) ───────────────
  // In coop the chain is shared, so a teammate's word changes MY board; say so.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    ready: rowsLoaded,
    items: events,
    keyOf: (e) => String(e.id),
    messageFor: (e) => {
      if (e.user_id === session.user.id) return null
      const member = players.find((p) => p.user_id === e.user_id)
      // Peer help is TWO messages (Joel's spec, 2026-08-05): the header names
      // the ACT ("● joel got a hint"), and the CONTENT — the same text the
      // requester's own pill showed — lands in the local slot, so a hint one
      // player asks for is a hint the whole team has. Side-effecting
      // showLocalFeedback from here is sound: messageFor runs once per NEW
      // event inside the hook's effect (the seen-set), never during render.
      if (e.kind === 'hint' || e.kind === 'spoiler') {
        if (e.word) showLocalFeedback(stickyPill('info', helpPillText(e.kind, e.word)))
        return {
          tone: 'info',
          text: (
            <>
              <ActorDot actor={member} fallback="A teammate" />{' '}
              {e.kind === 'hint' ? 'got a hint' : 'revealed a word'}
            </>
          ),
          mode: { kind: 'timed' },
        }
      }
      const what =
        e.kind === 'played'
          ? `${e.word?.toUpperCase() ?? ''} (${e.letters_covered}/${BOARD_SIZE})`
          : e.kind === 'undone'
            ? // Named, not "the last word": the peers' boards just lost it, so
              // say WHICH word came off (the log's "took back GJB" agrees).
              `undid ${e.word?.toUpperCase() ?? 'the last word'}`
            : 'cleared the chain'
      return {
        tone: e.kind === 'played' ? 'success' : 'info',
        text: (
          <>
            <ActorDot actor={member} fallback="A teammate" /> {what}
          </>
        ),
        mode: { kind: 'timed' },
      }
    },
    globalFeedback,
  })

  if (loading) return <div className={styles.loading}>Loading…</div>
  if (!game) return <div className={styles.empty}>Game not found.</div>

  // The rows the BOARD's viewer replays: the shared chain's events in coop, my
  // own in compete — the wordle shape. The log derives the same list for
  // itself and makes `#N` a live handle ONLY while its picker shows exactly
  // this list (`boardIsShown`), so a selected index is always an index here.
  // (An earlier version had the log hand its rows UP through a state-setting
  // effect; the fresh array re-fired it every render and hit React's
  // update-depth limit.)
  const boardRows =
    game.mode === 'compete' ? events.filter((e) => e.user_id === session.user.id) : events

  // The chain the BOARD shows: a past move's while viewing, the live one
  // otherwise. Folding rather than reconstructing — see lib/history.ts.
  const shownChain = viewing && viewingIndex !== null ? chainAt(boardRows, viewingIndex) : chain
  const viewingDescription =
    viewing && viewingIndex !== null ? describeAt(boardRows, viewingIndex) : null

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
        chain={shownChain}
        liveChain={chain}
        viewingDescription={viewingDescription}
        onExitViewing={exitViewing}
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
          setupRows={summaryRows}
          onHint={takeHint}
          onSpoiler={takeSpoiler}
          onReveal={() => void handleReveal()}
          revealDisabled={solutionRevealed}
          onEndGame={endGame}
          onConcede={concede}
          onRestart={restart}
          onNewGame={handleNewGame}
          startingNewGame={startingNewGame}
          onBackToClub={goToClub}
          onRequestBackToClub={menu.requestBackToClub}
          viewingIndex={viewingIndex}
          onSelectTurn={selectTurn}
        />
      </InfoSheet>
      {/* No modal at terminal (docs/ui.md → Terminal results) — the result is
          in the below-board pill and the info column, so a modal would just
          interrupt. */}
      {/* Confetti at the MOMENT the board is covered — coop's win, and compete's
          for whoever got there first. useCelebration never pops on mount, so
          reopening a finished game doesn't re-celebrate. */}
      {celebration.show && (
        <CelebrationDialog title="All twelve! 🐍" onClose={celebration.close} />
      )}
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
        message: 'All letters used!',
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
    // A timeout resolves on coverage instead of a solve, so the verdict comes
    // off the leaderboard's per-row `won` flags rather than from a winner_id.
    // Exact ties are CO-winners (the server flags every tied row), so read my
    // own row — leaderboard[0] would tell one tied winner they lost.
    if (timedOut) {
      const winners = leaderboard.filter((e) => e.won)
      const iWon = winners.some((e) => e.user_id === selfId)
      const covered = winners[0]?.letters_covered ?? 0
      if (iWon) {
        return {
          tone: 'won',
          verdict:
            winners.length > 1
              ? `Won: tied at most letters (${covered}/12)`
              : `Won: most letters (${covered}/12)`,
          message: 'Most letters when time ran out',
        }
      }
      const names = winners.map((e) => e.username ?? 'someone').join(' & ')
      return {
        tone: 'lost',
        verdict: `Lost: ${names || 'someone'} covered more`,
        message: 'Out of time',
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
