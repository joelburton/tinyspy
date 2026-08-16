import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconNewGame, IconPrint, IconRestart } from '../../common/components/icons'
import { cls } from '../../common/lib/util/cls'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import type { GamePageCtx, Member } from '../../common/lib/games'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { outOfRacePill, stickyPill, terminalPill } from '../../common/lib/game/localPills'
import { failureMessage, faultMessage } from '../../common/lib/game/serverError'
import { waitingTurnPill, yourTurnPill } from '../../common/components/game/turnCopy'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { isSet, type Card as CardCode } from '../lib/cards'
import { nextHint, ringFromLog } from '../lib/hint'
import { turnSnapshot } from '../lib/history'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { CLAIM_SIZE, liveSelection, toggleCard } from '../lib/selection'
import { DEAL_STAGGER_MS, nextPendingSlot, stageBoard, type Slot } from '../lib/staging'
import { slotForKey } from '../lib/letters'
import { setupRows } from '../lib/setupSummary'
import { paletteOf, type SetgameSetup } from '../lib/setup'
import { buildPrintModel } from '../pdf/model'
import { printSetgamePdf } from '../pdf/printSetgamePdf'
import { useGame } from '../hooks/useGame'
import { db } from '../db'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

import '../theme.css'

/** A row of `status.leaderboard` (compete). */
type LeaderRow = {
  user_id: string
  username?: string
  sets_found?: number
  won?: boolean
}

/**
 * setgame's play surface — shared between the coop and compete manifests. Mode
 * is read off `game.mode` (denormalized on `setgame.games_state`).
 *
 * The game is unusual for this roster in how LITTLE the client has to be told:
 * every card is face-up, so the FE holds the whole rule and can judge a
 * selection itself. Two things follow.
 *
 * **A wrong claim never reaches the server.** Picking a third card that doesn't
 * complete a set is refused right here, with a pill — so there is no
 * wrong-guess penalty to design, and no round trip to wait through. The server
 * still re-checks, because it is the authority; it just never sees one in
 * practice.
 *
 * **The one rejection that does happen is contention.** In compete (and in
 * free-for-all coop) a rival can claim a card out from under a half-made
 * selection. Two defences: selection is keyed by CARD rather than by slot, so a
 * card that leaves the board simply drops out of the selection; and the server
 * takes a row lock, so of two overlapping claims exactly one wins and the other
 * comes back `cards-gone`.
 */
export function PlayArea(ctx: GamePageCtx) {
  const {
    gameId, isTerminal, playState, players, session, status,
    isMyTurn, currentTurnUserId,
    setup, goToClub, clubHandle, goToGame, menu, brand, globalFeedback, title,
  } = ctx
  const { game, players: rows, events, claims, lastClaim, teamFound, loading } =
    useGame(gameId, session.user.id)

  const selfId = session.user.id
  const setgameSetup = setup as SetgameSetup

  const summaryRows = useMemo(
    () => setupRows(setgameSetup, game?.mode ?? 'coop', players),
    [setgameSetup, game, players],
  )

  // The turn-history viewer: click a log row to see the table as it stood just
  // after that event. Keyed by log POSITION rather than by event id, which is
  // what `turnSnapshot` indexes.
  const viewer = useHistoryViewer<number>()

  const infoSheet = useInfoSheet()
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback()

  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    restart: () => void
    newGame: () => void
  } | null>(null)

  const myConceded = players.find((m) => m.user_id === selfId)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  const board = useMemo(() => game?.board ?? [], [game?.board])

  // ─── The staged deal ───────────────────────────────────
  // The refill happens IN PLACE, which keeps the rest of the table still but
  // makes the change itself easy to miss — three cards are quietly substituted
  // where they sat, and in coop the claim was somebody else's. So the board is
  // displayed with the claimed slots EMPTY, and their replacements land one a
  // second: you see the gap, then watch it fill.
  //
  // `shown` is what the board renders; `board` stays the server's truth and is
  // what the rules run against. The two differ only for the few seconds a deal
  // is arriving.
  //
  // The diff is taken DURING RENDER via the adjust-state-when-input-changes
  // pattern (the same one useCelebration uses), keyed on the board's CONTENT:
  // every refetch mints a fresh array, so an identity check would re-stage the
  // board on realtime traffic that changed nothing.
  const boardKey = board.join(',')
  // `seen` holds the last SERVER board, which is what the change count is taken
  // from — `shown` can hold empties from a deal still arriving, and counting
  // those as changes would read as a wholesale replacement.
  const [seen, setSeen] = useState<{ key: string; cards: CardCode[] }>({
    key: boardKey,
    cards: [...board],
  })
  const [shown, setShown] = useState<Slot[]>(() => [...board])
  const [dealt, setDealt] = useState<CardCode[]>([])
  if (seen.key !== boardKey) {
    setShown(stageBoard(shown, seen.cards, board))
    // The opening board is not "newly dealt" — every card would flash at once.
    setDealt(seen.cards.length ? board.filter((c) => !seen.cards.includes(c)) : [])
    setSeen({ key: boardKey, cards: [...board] })
  }

  // One timer at a time: filling a slot re-renders, which schedules the next.
  // A setState inside the timeout, never synchronously in the effect.
  const pending = nextPendingSlot(shown)
  useEffect(() => {
    if (pending < 0) return
    const timer = setTimeout(() => {
      setShown((prev) => {
        const next = [...prev]
        next[pending] = board[pending]
        return next
      })
    }, DEAL_STAGGER_MS)
    return () => clearTimeout(timer)
  }, [pending, board])

  const flashes = useMemo(() => {
    const marks = new Map<CardCode, 'claimed' | 'dealt'>()
    for (const card of dealt) marks.set(card, 'dealt')
    return marks
  }, [dealt])

  // ─── Selection ─────────────────────────────────────────
  // Stored as card codes and FILTERED against the live board every render, so a
  // card a rival took is not selected any more — no stale highlight, no claim
  // fired at a card that isn't there. Derived rather than repaired in an effect,
  // which is what keeps the two in step without a synchronising write.
  const [picked, setPicked] = useState<CardCode[]>([])
  // Against `shown`, not `board`: a card that has been claimed is not selectable
  // even for the second it takes its replacement to arrive.
  const visible = useMemo(
    () => shown.filter((c): c is CardCode => c !== null),
    [shown],
  )
  const selected = useMemo(() => liveSelection(picked, visible), [picked, visible])

  // Claim in flight: the three cards keep a green ring while the RPC is out, so
  // a slow network reads as "sent" rather than "nothing happened".
  const [claiming, setClaiming] = useState(false)

  const flashesWithClaim = useMemo(() => {
    if (!claiming) return flashes
    const marks = new Map(flashes)
    for (const card of selected) marks.set(card, 'claimed')
    return marks
  }, [flashes, claiming, selected])

  // ─── Claiming ──────────────────────────────────────────
  const submitClaim = useCallback(
    async (cards: CardCode[]) => {
      setClaiming(true)
      const { error } = await db.rpc('submit_set', { target_game: gameId, cards })
      setClaiming(false)
      setPicked([])
      if (error) {
        // `cards-gone` is the ONLY rejection a player realistically meets, and
        // it isn't their mistake — someone was faster. failureMessage turns the
        // server's key into that sentence; anything else falls through to its
        // generic copy rather than inventing a second dialect here.
        showLocalFeedback(failureMessage(error, 'claim'))
      }
    },
    [gameId, showLocalFeedback],
  )

  const active = !isTerminal && !myConceded && !claiming && isMyTurn

  const onCardClick = useCallback(
    (card: CardCode) => {
      if (!active) return
      clearLocalFeedback()
      const next = toggleCard(selected, card)
      if (next.length < CLAIM_SIZE) {
        setPicked(next)
        return
      }
      // The third card completes a claim, and the FE can judge it: the whole
      // board is face-up, so a non-set is refused here instead of round-tripping
      // to be told the same thing. The selection clears either way — a rejected
      // pick is not a state worth keeping around to correct.
      setPicked([])
      if (isSet(next[0], next[1], next[2])) {
        void submitClaim(next)
      } else {
        showLocalFeedback(stickyPill('error', 'Not a set'))
      }
    },
    [active, selected, submitClaim, showLocalFeedback, clearLocalFeedback],
  )

  // ─── Keyboard ──────────────────────────────────────────
  // A letter under each card, typing toggles it, Backspace clears. Not
  // `useCaptureKeys`: that helper accumulates TEXT (a value, an onChange, an
  // Enter to submit), and a letter here is a toggle on a card, not a character
  // appended to a word. The layer below it brings the focused-field gate along,
  // so typing in chat never reaches the board.
  useGlobalKeyHandler(
    useCallback(
      (e: KeyboardEvent) => {
        // Tab is swallowed outright. Nothing on this surface takes focus — the
        // cards are clickable but never focusable — so a Tab that did anything
        // would only move a focus ring somewhere the player can't use it.
        if (e.key === 'Tab') {
          e.preventDefault()
          return
        }
        // While replaying a past turn, the next key returns to the live board
        // and is CONSUMED — otherwise the same press would also toggle a card
        // on a board the player has only just got back.
        if (viewer.exitOnKey(e)) return
        if (e.metaKey || e.ctrlKey || e.altKey) return
        if (!active) return
        if (e.key === 'Backspace') {
          e.preventDefault()
          setPicked([])
          clearLocalFeedback()
          return
        }
        const slot = slotForKey(e.key)
        if (slot < 0 || slot >= shown.length) return
        e.preventDefault()
        // An empty slot's letter does nothing — there is no card there yet.
        const card = shown[slot]
        if (card !== null) onCardClick(card)
      },
      [active, shown, onCardClick, clearLocalFeedback, viewer],
    ),
  )

  // ─── Hint (coop only), computed HERE ───────────────────
  // The board is face-up and lib/cards.ts holds the same algebra the server
  // does, so a hint is a local search — the ring lands on the keystroke rather
  // than after a round trip, which matters because it also SELECTS the cards.
  // The server is told afterwards: it charges the asker and writes the log row,
  // because the ring is transient UI while the ASKING is history.
  //
  // The ring is keyed on the number of CLAIMS: a claim (anyone's) moves the
  // board, so it clears the ring — while a hint event, which is what asking
  // again produces, leaves it alone. On first sight of the log it seeds from
  // there instead, so a reload restores the last hint I asked for. That is the
  // persistence a stored column would have bought, for free.
  const [ring, setRing] = useState<CardCode[]>([])
  const [seenClaims, setSeenClaims] = useState<number | null>(null)
  if (!loading && seenClaims !== claims.length) {
    setRing(seenClaims === null ? ringFromLog(events, selfId) : [])
    setSeenClaims(claims.length)
  }

  const askHint = useCallback(async () => {
    if (!game) return
    const next = nextHint(game.board, ring)
    if (!next) return
    setRing(next)
    setPicked(next)
    // Recorded BEFORE the claim, not alongside it. Firing both at once put two
    // transactions on the same two rows in opposite orders and Postgres broke
    // the tie with a deadlock — reliably, on the third hint, since that is the
    // press that also claims. Awaiting is the causal order anyway: you asked,
    // and then it was claimed.
    const { error } = await db.rpc('record_hint', { target_game: gameId, cards: next })
    if (error) showLocalFeedback(failureMessage(error, 'hint'))
    // The third rung needs no special case: three selected cards claim, which
    // is the same path a player's own third click takes.
    if (next.length === CLAIM_SIZE) void submitClaim(next)
  }, [game, gameId, ring, submitClaim, showLocalFeedback])

  // Single-flight, because a press takes a round trip to record and the button
  // stays live meanwhile. Without it a fast second press runs a second ladder
  // against the ring and board of the first — the stale-state half of the same
  // bug `nextHint` guards from the other side.
  const [requestHint] = useSingleFlight(askHint)

  // ─── End / Concede / Restart — the shared trio ─────────
  const { endGame, concede, restart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    showError: showLocalFeedback,
    onRestarted: () => setPicked([]),
  })

  const gameMode = game?.mode
  const createNewGame = useCallback(async () => {
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    if (!gameMode) return
    const { data, error } = await db.rpc('create_game', {
      target_club: clubHandle,
      setup: setup as never,
      player_user_ids: players.map((p) => p.user_id),
      mode: gameMode,
    })
    if (error) {
      // New game is a FAULT surface: this setup already built a game once, so
      // anything coming back now is a bug or an outage, never a pill.
      showLocalFeedback(faultMessage(error, 'new game'))
      return
    }
    const id = (data as { id: string }[] | null)?.[0]?.id
    if (id) goToGame(`setgame_${gameMode}`, id)
  }, [gameMode, clubHandle, setup, players, goToGame, showLocalFeedback, confirmAction, isTerminal])

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

  const foundByUser = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.user_id, row.sets_found)
    return counts
  }, [rows])

  const hintsByUser = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.user_id, row.hints_used)
    return counts
  }, [rows])

  // ─── GamePage menu ─────────────────────────────────────
  useEffect(() => {
    if (!game) return
    const printModel = buildPrintModel({
      brand,
      gameTitle: title,
      date: new Date().toLocaleDateString(),
      mode: game.mode,
      isTerminal,
      teamFound,
      deckLeft: game.deck_left,
      players,
      foundByUser,
      hintsByUser,
      events,
      palette: paletteOf(setgameSetup),
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
          {
            items: [
              { id: 'restart', icon: IconRestart, label: 'Restart', onClick: () => actionsRef.current?.restart() },
              { id: 'new-game', icon: IconNewGame, label: 'New game', shortcut: '+', onClick: () => actionsRef.current?.newGame() },
            ],
          },
          { items: [{ id: 'print', icon: IconPrint, label: 'Print board (PDF)', onClick: () => printSetgamePdf(printModel) }] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [
    menu, game, isTerminal, myConceded, brand, title, teamFound,
    players, foundByUser, hintsByUser, events, setgameSetup, summaryRows,
  ])

  // ─── Peer narration (coop, free-for-all only) ──────────
  // A teammate's claim, in the global header. Coop only: in compete the
  // opponent strip already ticks, and a pill for every rival claim would be a
  // running commentary on the one activity that needs concentration.
  //
  // OFF in turn-by-turn coop, where the same header slot carries the sticky
  // "Waiting for ● Name…" (below). One slot, one pill, last write wins — so the
  // two would fight on every claim, since a claim is exactly what changes whose
  // turn it is. The waiting pill is the better tenant of the two: it answers
  // "why can't I do anything?", which is a question that stays asked, while the
  // narration is redundant here anyway (the pill renaming itself IS the news
  // that the previous player claimed, and the log and counts both say so).
  useGlobalFeedback({
    enabled: game?.mode === 'coop' && currentTurnUserId === null,
    ready: !loading,
    items: claims,
    keyOf: (c) => String(c.id),
    messageFor: (c) => {
      if (c.user_id === selfId) return null
      const member = players.find((p) => p.user_id === c.user_id)
      return {
        tone: 'success',
        text: (
          <>
            <ActorDot actor={member} fallback="A teammate" /> found a set
          </>
        ),
        mode: { kind: 'timed' },
      }
    },
    globalFeedback,
  })

  // ─── "Waiting for ● Name…" in the header (turn-by-turn coop) ──
  //
  // State-derived rather than event-driven, so it can't be a `useGlobalFeedback`
  // stream: it must be showing for as long as the wait lasts and gone the
  // instant the turn arrives, which is a function of the pointer, not of an
  // event. Hence the effect — `show`/`clear` are prop callbacks, so no local
  // state is set here and the no-setState-in-effect rule is not in play.
  //
  // Deps are PRIMITIVES — the holder's name and color, not the member object.
  // `show` re-renders the parent (the pill lives in GamePage's header), which
  // re-renders this component; if a dep were the object `players.find` returns,
  // a fresh `players` array on that render would look like a change and the
  // effect would show again, forever. Primitives settle in one pass.
  const turnHolder = players.find((p) => p.user_id === currentTurnUserId)
  const holderName = turnHolder?.username
  const holderColor = turnHolder?.color
  const stillWaiting = currentTurnUserId !== null && !isMyTurn && !isTerminal
  useEffect(() => {
    if (!stillWaiting) return
    globalFeedback.show(
      waitingTurnPill(
        holderName === undefined ? undefined : { username: holderName, color: holderColor ?? '' },
      ),
    )
    // The cleanup covers every way the wait can end — the turn arriving, the
    // game finishing, a peer conceding, leaving the page — so there is no
    // separate "clear it" branch to keep in step with the show.
    return () => globalFeedback.clear()
  }, [stillWaiting, holderName, holderColor, globalFeedback])

  if (loading) return <div className={styles.loading}>Loading…</div>
  if (!game) return <div className={styles.empty}>Game not found.</div>

  const isCompete = game.mode === 'compete'
  const isLocallyDone = isCompete && myConceded && !isTerminal
  // Turn-by-turn is fixed at create time, so this never changes mid-game.
  const isTurnGame = currentTurnUserId !== null
  const waiting = isTurnGame && !isMyTurn && !isTerminal

  // The past turn being replayed, or null for the live board.
  const viewing = viewer.viewingId === null ? null : turnSnapshot(events, viewer.viewingId)

  const over = isTerminal
    ? buildOver({
        mode: game.mode,
        playState,
        status,
        teamFound,
        stranded: game.board.length,
        leaderboard,
        selfId,
        players,
      })
    : null

  return (
    <div
      className={cls(
        shared.layout,
        shared.mobileFill,
        styles.layout,
        // The colorblind-safe palette repaints the three color tokens for
        // everything inside — the board AND the info column's mini cards.
        paletteOf(setgameSetup) === 'colorblind' && 'setgamePaletteColorblind',
      )}
    >
      <BoardCol
        board={viewing ? viewing.board : shown}
        selected={viewing ? [] : selected}
        hinted={viewing ? viewing.highlight : ring}
        flashes={flashesWithClaim}
        disabled={!active || viewing !== null}
        waiting={waiting}
        isCompete={isCompete}
        teamFound={teamFound}
        deckLeft={game.deck_left}
        hintsUsed={rows.reduce((n, p) => n + p.hints_used, 0)}
        canHint={active}
        onHint={() => void requestHint()}
        onCardClick={onCardClick}
        pill={
          viewing
            ? stickyPill('info', viewing.description)
            : over
            ? terminalPill(over.tone, over.verdict)
            : isLocallyDone
              ? outOfRacePill(true)
              : // In turn-by-turn coop the slot prompts you when the table is
                // waiting on YOU — the counterpart to the faded board and the
                // header's "Waiting for ● Name…" while it isn't.
                //
                // It sits BELOW an own-move result rather than above it, which
                // is what makes a permanent prompt safe here: "Not a set" and
                // "Cards gone" both land while it is your turn, so a prompt
                // that outranked them would evict exactly the messages you
                // need. It is the fallback for an empty slot, nothing more.
                (localFeedback ?? (isMyTurn && isTurnGame ? yourTurnPill : null))
        }
        onDismissPill={clearLocalFeedback}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          isCompete={isCompete}
          isTerminal={isTerminal}
          isLocallyDone={isLocallyDone}
          over={over}
          currentTurnUserId={currentTurnUserId}
          teamFound={teamFound}
          deckLeft={game.deck_left}
          lastClaim={lastClaim}
          events={events}
          viewingIndex={viewer.viewingId}
          onSelectTurn={(index) => (index === null ? viewer.exitViewing() : viewer.select(index))}
          players={players}
          selfId={selfId}
          foundByUser={foundByUser}
          concededIds={concededIds}
          canHint={active}
          onHint={() => void requestHint()}
          hintsUsed={rows.reduce((n, p) => n + p.hints_used, 0)}
          onEndGame={endGame}
          onConcede={concede}
          onRestart={restart}
          onNewGame={handleNewGame}
          startingNewGame={startingNewGame}
          onBackToClub={goToClub}
          onRequestBackToClub={menu.requestBackToClub}
          setupRows={summaryRows}
        />
      </InfoSheet>

      {confirmDialog}
    </div>
  )
}

/**
 * Maps the terminal play_state to the shared `TerminalCopy`.
 *
 * **Coop wins by clearing the deck**, which means no sets left to find — NOT
 * using every card. Stranding six or nine is the normal ending (a full clear
 * happens in about 2% of games), so the copy leads with the sets found and
 * mentions the leftovers as a fact rather than as a shortfall. Getting this
 * wrong would make an ordinary finish read as a near miss.
 *
 * **Compete ranks on sets found with no speed tiebreak**, so ties are real and
 * common. `winner_user_id` is null on co-winners — every tied player is flagged
 * `won` in the leaderboard instead, and each reads their own row.
 */
function buildOver({
  mode,
  playState,
  status,
  teamFound,
  stranded,
  leaderboard,
  selfId,
  players,
}: {
  mode: 'coop' | 'compete'
  playState: string
  status: Record<string, unknown> | null
  teamFound: number
  stranded: number
  leaderboard: LeaderRow[]
  selfId: string
  players: Member[]
}): TerminalCopy {
  const sets = `${teamFound} ${teamFound === 1 ? 'set' : 'sets'}`

  if (mode === 'compete') {
    if (playState === 'won_compete') {
      const winnerId = (status?.winner_user_id as string | undefined) ?? null
      const winners = leaderboard.filter((e) => e.won)
      const iWon = winnerId === selfId || (winnerId === null && winners.some((e) => e.user_id === selfId))
      const top = winners[0]?.sets_found ?? 0
      const isShared = winners.length > 1
      if (iWon) {
        return {
          verdict: isShared ? `Won: tied on ${top}` : `Won: ${top} sets`,
          message: isShared ? 'You tied for the win!' : 'You won!',
          tone: 'won',
        }
      }
      const nameOf = (id?: string) => players.find((p) => p.user_id === id)?.username ?? 'someone'
      if (isShared) {
        const label = winners.map((e) => nameOf(e.user_id)).join(' & ')
        return { verdict: `${label} tied on ${top}`, message: `${label} tied`, tone: 'lost' }
      }
      const label = nameOf(winners[0]?.user_id ?? winnerId ?? undefined)
      return { verdict: `${label} won with ${top}`, message: `${label} won`, tone: 'lost' }
    }
    if (playState === 'lost_compete') {
      const outcome = (status?.outcome as string | undefined) ?? ''
      if (outcome === 'conceded') {
        return { verdict: 'Lost: all conceded', message: 'All conceded', tone: 'lost' }
      }
      return { verdict: 'Lost: nobody found a set', message: 'Nobody scored', tone: 'lost' }
    }
    return endedCopy('compete')
  }

  // Coop.
  if (playState === 'won') {
    // NOT a count of what was left behind. Ending with six or nine cards that
    // form no set is the ordinary ending — it is what "no sets left to find"
    // looks like — so reporting it as "6 stranded" reads as a shortfall against
    // a target that does not exist. The win is that every set on the table was
    // found, and that is what it says. A full clear is genuinely rare (~2% of
    // games) and keeps its own line.
    return {
      verdict: stranded === 0 ? `Won: the whole deck, ${sets}` : `Won: all sets found, ${sets}`,
      message: stranded === 0 ? 'A perfect clear!' : 'All sets found',
      tone: 'won',
    }
  }
  if (playState === 'lost') {
    return { verdict: `Lost: out of time, ${sets}`, message: `${sets} found`, tone: 'lost' }
  }
  return { verdict: `Ended: ${sets}`, message: `${sets} found`, tone: 'neutral' }
}
