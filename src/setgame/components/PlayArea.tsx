// cs-fixed-outcome-fix

import { useCallback, useEffect, useMemo, useState } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import { cls } from '@/common/utils/cls'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { ANSWER_OUTCOME } from '../lib/answer'
import { isSet, type Card as CardCode } from '../lib/cards'
import { nextHint, ringFromLog } from '../lib/hint'
import { historySnapshot } from '../lib/history'
import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { CLAIM_SIZE, liveSelection, toggleCard } from '../lib/selection'
import { ARRIVE_MS, claimTransition, DEPART_MS, type FlashKind } from '../lib/flash'
import { useChangeCause } from '@/common/board-marks/useChangeCause'
import { useMark } from '@/common/board-marks/useMark'
import { slotForKey } from '../lib/letters'
import { hintLabel } from '../lib/readouts'
import { setupRows } from '../lib/setupSummary'
import { paletteOf, type SetgameSetup } from '../lib/setup'
import { buildPrintModel } from '../pdf/model'
import { printSetgamePdf } from '../pdf/printSetgamePdf'
import { useGame } from '../hooks/useGame'
import { db } from '../db'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import styles from './PlayArea.module.css'

import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** Empty arrival list — the resting value of the arrive mark, so a table with
 *  nothing arriving rebuilds `flashes` from the same object every render. */
const NO_CARDS: CardCode[] = []

/** What `setgame.submit_set` puts in `data`. One `ok` answer, named anyway — a
 *  branch matching merely by being `ok` would draw a second one as this. Its
 *  `terminal` is the claim that ended the game, which this surface does not read:
 *  the finish reaches it by realtime like everyone else's. */
type ClaimAnswer = { result: 'claimed'; terminal: boolean }

/** What `setgame.record_hint` puts in `data`. `hints_used` is the tally after
 *  this press; unread here, because the info column reads it off `players`. */
type HintAnswer = { result: 'recorded'; hints_used: number }

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
 * complete a set is refused right here, with a result — so there is no
 * wrong-guess penalty to design, and no round trip to wait through. The server
 * still re-checks, because it is the authority; it just never sees one in
 * practice.
 *
 * **The one rejection that does happen is contention.** In compete (and in
 * free-for-all coop) a rival can claim a card out from under a half-made
 * selection. Two defenses: selection is keyed by CARD rather than by slot, so a
 * card that leaves the board simply drops out of the selection; and the server
 * takes a row lock, so of two overlapping claims exactly one wins and the other
 * comes back `cards-gone` — a normal not-ok, not a fault: nobody did anything
 * wrong, and the cards visibly leaving is most of the explanation.
 */
export function PlayArea(ctx: GamePageCtx) {
  const {
    gameId, isTerminal, playState, players, session, status,
    isMyTurn, currentTurnUserId,
    setup, clubHandle, goToGame, menu, brand, globalFeedbackSlot, title,
  } = ctx
  const { game, players: rows, events, claims, lastClaim, teamFound, loading, failure } =
    useGame(gameId, session.user.id)

  const selfId = session.user.id
  const setgameSetup = setup as SetgameSetup

  const summaryRows = useMemo(
    () => setupRows(setgameSetup, game?.mode ?? 'coop', players),
    [setgameSetup, game, players],
  )

  // The turn-history viewer: click a log row to see the table as it stood just
  // after that event. Keyed by the row's own id — the board is one shared table
  // here, so any row replays whoever played it.
  const historyViewer = useHistoryViewer<number>()

  const infoSheet = useInfoSheet()
  // The below-board slot: a claim's result, the hint's not-oks, End /
  // Concede's, and the standing conditions further down.
  const localFeedbackSlot = useFeedbackSlot('local')

  const myConceded = players.find((m) => m.user_id === selfId)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  const board = useMemo(() => game?.board ?? [], [game?.board])

  // ─── The claim flash ───────────────────────────────────
  // See lib/flash.ts for the whole design. In short: a claim is marked LOUDLY
  // and dealt INSTANTLY — the departing set is held on screen for a beat so it
  // can be seen leaving, then the replacements appear at once and light up.
  //
  // `shown` is what the board renders; `board` is the server's truth and is what
  // the rules run against. They differ only during that hold.
  //
  // The diff is taken DURING RENDER via the adjust-state-when-input-changes
  // pattern (the same one useCelebration uses), keyed on the board's CONTENT:
  // every refetch mints a fresh array, so an identity check would re-fire on
  // realtime traffic that changed nothing.
  const boardKey = board.join(',')
  const [shown, setShown] = useState<CardCode[]>(() => [...board])
  /** The departing set, held on screen; `mine` picks dim over lit. */
  const [depart, setDepart] = useState<{ leaving: CardCode[]; mine: boolean } | null>(null)
  /** Cards lit as freshly arrived — raised when the hold ends, and it clears
   *  itself after `ARRIVE_MS`. */
  const [arrivingMark, flashArriving, clearArriving] = useMark<{ cards: CardCode[] }>(ARRIVE_MS)
  const arriving = arrivingMark?.value.cards ?? NO_CARDS
  /** My own three, dim from the click — before any server answer. */
  const [submitted, setSubmitted] = useState<CardCode[]>([])

  // WHY did this board change? There are only two answers, and the log gives it
  // away rather than us inferring it: a claim writes an event, and the only other
  // thing that moves this board — a fresh deal, whether a new game or a restart —
  // has no claim behind it (`replay_board` deletes the events). So a claim gets
  // the flash and everything else is simply SHOWN. Nothing here depends on how
  // many slots differ, on the board growing or shrinking, or on the deck — every
  // one of those proxies had a case that broke it, and two of them shipped.
  //
  // The claim's id is the move marker `useChangeCause` reads, and the board and
  // the events arrive in ONE fetch (useGame's single `Promise.all`), so within a
  // render they cannot disagree.
  //
  // `game != null` is the readiness flag, and it is load-bearing here in a way
  // it is not for the games that mark a move from inside their `Board`: this
  // block sits ABOVE the loading guard below, so its first renders have no board
  // and no claim. Without it the hook would seed on that placeholder, and the
  // render where the real board lands would look exactly like a claim — content
  // changed, marker advanced — lighting the whole table on arrival.
  const cause = useChangeCause(board, boardKey, lastClaim?.id ?? 0, game != null)
  if (cause?.byMove) {
    // `shown` deliberately stays put: the old cards are what we are holding, and
    // they are what the departing set is measured against — not the board the
    // hook handed back, which is the server's.
    setDepart({
      leaving: claimTransition(shown, board).leaving,
      mine: lastClaim?.user_id === selfId,
    })
  } else if (cause) {
    setShown([...board])
    setDepart(null)
    clearArriving()
    setSubmitted([])
  }

  // The hold, then the swap. One timer for the whole board — the replacements
  // all land together, because it was never the SPEED of their arrival that made
  // them noticeable, only the mark.
  useEffect(function holdThenSwap() {
    if (!depart) return
    const timer = setTimeout(() => {
      flashArriving({ cards: claimTransition(shown, board).arriving })
      setShown([...board])
      setDepart(null)
      setSubmitted([]) // the claimer's dim ends exactly when everyone's mark does
    }, DEPART_MS)
    return () => clearTimeout(timer)
  }, [depart, shown, board, flashArriving])

  const flashes = useMemo(() => {
    const marks = new Map<CardCode, FlashKind>()
    for (const card of arriving) marks.set(card, 'arriving')
    // Departures outrank arrivals: during a hold the old cards are what is on
    // screen, and a card can be both (claimed here, dealt back there) only in
    // the moment the two overlap.
    if (depart) for (const card of depart.leaving) marks.set(card, depart.mine ? 'held' : 'leaving')
    // My own claim, still in flight — no board change has happened yet.
    for (const card of submitted) marks.set(card, 'held')
    return marks
  }, [arriving, depart, submitted])

  // ─── Selection ─────────────────────────────────────────
  // Stored as card codes and FILTERED against the live board every render, so a
  // card a rival took is not selected any more — no stale highlight, no claim
  // fired at a card that isn't there. Derived rather than repaired in an effect,
  // which is what keeps the two in step without a synchronising write.
  const [picked, setPicked] = useState<CardCode[]>([])
  // Filtered against the SERVER board, not against what is on screen: during a
  // departure hold the screen still shows cards that are already gone, and a
  // selection that included one would submit a claim doomed to `cards-gone`.
  // Held cards are unclickable (see `Board`), so nothing can be added to it
  // either — this only heals a selection made before the claim landed.
  const selected = useMemo(() => liveSelection(picked, board), [picked, board])

  // ─── Claiming ──────────────────────────────────────────
  const submitClaim = useCallback(
    async (cards: CardCode[]) => {
      // Dim them NOW, before the round trip. This is the only feedback that
      // cannot be late, and on a slow link it is the whole answer to "did it
      // hear me?" — its length IS the lag.
      setSubmitted(cards)
      setPicked([])
      const res = await runRpc<ClaimAnswer>(db.rpc('submit_set', { target_game: gameId, cards }))
      if (res.type === 'not-ok') {
        // Release the dim: nothing is coming. The contention RACE — someone was
        // faster — is the one refusal a player realistically meets, and it
        // isn't their mistake. Those cards are already gone, so this player
        // falls through to the same mark everyone else gets for them.
        setSubmitted([])
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
      } else if (res.type === 'ok' && res.data.result === 'claimed') {
        // Nothing to show and nothing to release: the cards leaving the board
        // IS the feedback, and the dim ends when they go (`marks` derives it
        // from the live board). `data.terminal` rides along unread for the same
        // reason — the game ending reaches this surface by realtime.
      } else {
        // The dim would otherwise sit on three cards forever: it is released by
        // the board moving, and an answer nobody named is an answer that may not
        // have moved it.
        setSubmitted([])
        reportUnhandled('submit_set', res)
      }
    },
    [gameId, localFeedbackSlot],
  )

  // NOT gated on a claim being in flight: the rest of the board stays live so a
  // fast player can start their next set while this one is still traveling.
  // The three cards being claimed are made unclickable individually.
  const active = !isTerminal && !myConceded && isMyTurn
  // Derived here, above the loading guards, because the Hint binding's
  // `describe` names it and can be read on any render — the key list asks every
  // binding when Help opens.
  const isCompete = game?.mode === 'compete'

  const onCardClick = useCallback(
    (card: CardCode) => {
      if (!active) return
      localFeedbackSlot.dismiss() // a click is the next move, like a keystroke
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
        localFeedbackSlot.show(
          FeedbackMessage.result(ANSWER_OUTCOME.not_a_set, 'Not a set'),
        )
      }
    },
    [active, selected, submitClaim, localFeedbackSlot],
  )

  // ─── Keyboard ──────────────────────────────────────────
  // The board is worked by clicks and letter keys, so Tab has nowhere to go
  // here — and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])

  // A letter under each card, and Backspace clears the picks. Two bound
  // actions, so the keys and the cards say the same thing: `act-toggle-card`
  // is a PATTERN action — it is handed whichever letter fired it, which is what
  // makes twenty-one cards one binding rather than twenty-one.
  //
  // Both hide while a past turn is open. The viewer's exit does not depend on
  // that — the dispatcher gives an any-key MODE priority over a particular key —
  // but a live card key over a frozen historical board would be lying about
  // what it can do.
  useBoundAction('act-toggle-card', {
    describe: () => (active && !historyViewer.isViewingHistory ? 'active' : 'hidden'),
    run: (key) => {
      const slot = slotForKey(key ?? '')
      if (slot < 0 || slot >= shown.length) return
      // An empty slot's letter does nothing — there is no card there yet.
      const card = shown[slot]
      if (card !== null) onCardClick(card)
    },
  })
  useBoundAction('act-clear-selection', {
    describe: () => (active && !historyViewer.isViewingHistory ? 'active' : 'hidden'),
    run: () => {
      setPicked([])
      localFeedbackSlot.dismiss()
    },
  })

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
    const res = await runRpc<HintAnswer>(
      db.rpc('record_hint', { target_game: gameId, cards: next }),
    )
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.data.result === 'recorded') {
      // Nothing to show: the ring was drawn before the round trip, and it is the
      // whole of what a hint looks like. `hints_used` rides along unread here —
      // the info column reads the tally off `players`, which realtime refetches.
      //
      // The claim lives IN this branch, because a recorded hint is the only
      // answer it may follow. The third rung needs no special case beyond that:
      // three selected cards claim, which is the same path a player's own third
      // click takes, and only the third press gets here — the ladder hands back
      // one card, then two, then three.
      if (next.length === CLAIM_SIZE) void submitClaim(next)
    } else {
      reportUnhandled('record_hint', res)
    }
  }, [game, gameId, ring, submitClaim, localFeedbackSlot])

  // Hint — RENDERED IN COMPETE TOO, disabled and saying why. Hiding it would
  // leave a player hunting for a button they know this game has; a gray one
  // with a reason answers the question before it is asked. (The ban itself is
  // the priced-hint rule: a free generative hint decides a race.) The shared
  // run's single flight is what stops a fast second press running a second
  // ladder against the ring and board of the first.
  const actHint = useBoundAction('act-hint', {
    describe: () => ({
      state: isCompete || !active ? 'disabled' : 'active',
      label: hintLabel(isCompete),
    }),
    run: askHint,
  })

  // ─── End / Concede / Restart — the shared trio ─────────
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: game?.mode === 'compete' ? 'compete' : 'coop',
    myConceded,
    localFeedbackSlot,
  })

  // A plain function, rebuilt every render: the binding below reads it at click
  // time, so `setup` and `players` are whatever the last realtime refetch left,
  // and the action's own identity doesn't move when they do.
  const gameMode = game?.mode
  const createNewGame = async () => {
    if (!gameMode) return
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup: setup as never,
        player_user_ids: players.map((p) => p.user_id),
        mode: gameMode,
      }),
    )
    if (res.type === 'not-ok') {
      // THE SAME ENVELOPE, READ DIFFERENTLY. On the setup form a validation is
      // an answer — fix the field and press Start again. Here there is no field
      // and no form, so whatever came back goes in the slot as it reads, over
      // the verdict, until its × is pressed. Shown even for a fault whose
      // modal has already fired centrally — the modal escalates, it does not
      // replace (docs/envelopes.md), so dismissing it must not leave the board
      // silent about why the game didn't start.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`setgame_${gameMode}`, res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game
  // rather than ending it) and goes straight through at terminal. The shared
  // run's single flight is what stops a second press dealing a second board.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

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
  // Print the board — a snapshot at CLICK time (common/pdf/doc.md), so the menu needn't
  // rebuild as cards are claimed.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      if (!game) return
      printSetgamePdf(
        buildPrintModel({
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
        }),
      )
    },
  })

  // The FULL setgame menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time. The effect
  // re-runs only when the SHAPE changes, which is why every dep is stable.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          { items: [actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actRestart, actNewGame, actPrintBoard])

  // ─── Peer narration (coop, free-for-all only) ──────────
  // A teammate's claim, in the global header. Coop only: in compete the
  // opponent strip already ticks, and a message for every rival claim would
  // be a running commentary on the one activity that needs concentration.
  //
  // OFF in turn-by-turn coop, where the narration is redundant: the waiting
  // note renaming itself IS the news that the previous player claimed, and
  // the log and counts both say so.
  usePeerFeedback({
    enabled: game?.mode === 'coop' && currentTurnUserId === null,
    ready: !loading,
    items: claims,
    keyOf: (c) => String(c.id),
    messageFor: (c) => {
      if (c.user_id === selfId) return null
      const member = players.find((p) => p.user_id === c.user_id)
      return FeedbackMessage.peer(member, ANSWER_OUTCOME.claim, 'found a set')
    },
    globalFeedbackSlot,
  })

  // ─── The standing conditions ───────────────────────────
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — a slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // "Waiting for ● Name…" — below the board, and it shares that slot with the
  // your-turn prompt below, which is safe because the two are exclusive on
  // `isMyTurn`. Deps are PRIMITIVES — the holder's name and color, not the
  // member object — so a fresh `players` array on a re-render doesn't look
  // like a change.
  const turnHolder = players.find((p) => p.user_id === currentTurnUserId)
  const holderName = turnHolder?.username
  const holderColor = turnHolder?.color
  // Turn-by-turn is fixed at create time, so this never changes mid-game.
  const isTurnGame = currentTurnUserId !== null
  const waiting = isTurnGame && !isMyTurn && !isTerminal
  useEffect(function showWaiting() {
    if (!waiting) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.waiting(
        holderName === undefined ? undefined : { username: holderName, color: holderColor ?? '' },
      ),
    )
    // The cleanup covers every way the wait can end — the turn arriving, the
    // game finishing, a peer conceding, leaving the page.
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, waiting, holderName, holderColor])

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome. The compete names are reduced to strings here.
  const statusOutcome = (status?.reason as string | undefined) ?? null
  const winnerId = (status?.winner_user_id as string | undefined) ?? null
  const winners = useMemo(() => leaderboard.filter((e) => e.won), [leaderboard])
  const iWon = winnerId === selfId || (winnerId === null && winners.some((e) => e.user_id === selfId))
  const topFound = winners[0]?.sets_found ?? 0
  const nameOf = (id: string | undefined) => players.find((p) => p.user_id === id)?.username ?? 'a player'
  const winnerNames =
    winners.length > 1
      ? winners.map((e) => nameOf(e.user_id)).join(' & ')
      : nameOf(winners[0]?.user_id ?? winnerId ?? undefined)
  const stranded = game?.board.length ?? 0
  const over = useMemo(
    () =>
      isTerminal && gameMode
        ? buildOver({
            mode: gameMode,
            playState,
            statusOutcome,
            teamFound,
            stranded,
            iWon,
            isShared: winners.length > 1,
            topFound,
            winnerNames,
          })
        : null,
    [isTerminal, gameMode, playState, statusOutcome, teamFound, stranded, iWon, winners.length, topFound, winnerNames],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Locally terminal (compete only): I conceded but the others race on.
  const isLocallyDone = isCompete && myConceded && !isTerminal
  useEffect(function showOutOfRace() {
    if (!isLocallyDone) return
    const id = localFeedbackSlot.show(FeedbackMessage.outOfRace(true))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isLocallyDone])

  // In turn-by-turn coop the slot prompts you when the table is waiting on
  // YOU — the counterpart to the faded board and to "Waiting for ● Name…"
  // while it isn't. A `prompt`, which everything else outranks:
  // "Not a set" and "Someone got there first" both land while it is your
  // turn, and show over it rather than being evicted by it.
  const myMove = isTurnGame && isMyTurn && !isTerminal && !isLocallyDone
  useEffect(function showYourTurnPrompt() {
    if (!myMove) return
    const id = localFeedbackSlot.show(FeedbackMessage.prompt('Waiting for your move'))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, myMove])

  if (loading) return <div className={styles.loading}>Loading…</div>
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "Game not found." about a dead connection is a confident wrong answer —
  // this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) return <div className={styles.empty}>Game not found.</div>

  // The past turn being replayed, or null for the live board.
  const historySnap =
    historyViewer.historyId === null
      ? null
      : historySnapshot(events, historyViewer.historyId, historyViewer.historyN)

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
        board={historySnap ? historySnap.board : shown}
        selected={historySnap ? [] : selected}
        ringed={historySnap ? historySnap.historyLitCards : ring}
        flashes={flashes}
        disabled={!active || historySnap !== null}
        waiting={waiting}
        isCompete={isCompete}
        teamFound={teamFound}
        deckLeft={game.deck_left}
        hintsUsed={rows.reduce((n, p) => n + p.hints_used, 0)}
        actHint={actHint}
        onCardClick={onCardClick}
        // The slot the pill row draws: a claim's result, the verdict, "you're
        // out", the your-turn prompt. While a past turn is open, the shared
        // history banner covers it with the turn's description.
        localFeedbackSlot={localFeedbackSlot}
        historyLabel={historySnap?.historyLabel ?? null}
        onExitHistory={historyViewer.exitHistory}
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
          historyId={historyViewer.historyId}
          onShowHistory={historyViewer.showHistory}
          players={players}
          selfId={selfId}
          foundByUser={foundByUser}
          concededIds={concededIds}
          actHint={actHint}
          hintsUsed={rows.reduce((n, p) => n + p.hints_used, 0)}
          actEndGame={actEndGame}
          actConcede={actConcede}
          actRestart={actRestart}
          actNewGame={actNewGame}
          actBackToClub={menu.actBackToClub}
          setupRows={summaryRows}
        />
      </InfoSheet>

    </div>
  )
}

/**
 * Maps the terminal play_state to the shared `TerminalMessage`.
 *
 * **Coop wins by clearing the deck**, which means no sets left to find — NOT
 * using every card. Stranding six or nine is the normal ending (a full clear
 * happens in about 2% of games), so the text leads with the sets found and
 * mentions the leftovers as a fact rather than as a shortfall. Getting this
 * wrong would make an ordinary finish read as a near miss.
 *
 * **Compete ranks on sets found with no speed tiebreak**, so ties are real and
 * common. `winner_user_id` is null on co-winners — every tied player is flagged
 * `won` in the leaderboard instead, and each reads their own row; the caller
 * reduces that to `iWon`, `isShared` and the winners' names.
 */
function buildOver({
  mode,
  playState,
  statusOutcome,
  teamFound,
  stranded,
  iWon,
  isShared,
  topFound,
  winnerNames,
}: {
  mode: 'coop' | 'compete'
  playState: string
  /** `status.reason`, or null when the status carries none. */
  statusOutcome: string | null
  teamFound: number
  stranded: number
  iWon: boolean
  /** Two or more winners tied on sets found. */
  isShared: boolean
  /** The winners' sets found (they tied on it). */
  topFound: number
  /** The winner's name, or the tied winners' joined with " & ". */
  winnerNames: string
}): TerminalMessage {
  const sets = `${teamFound} ${teamFound === 1 ? 'set' : 'sets'}`

  if (mode === 'compete') {
    if (playState === 'won_compete') {
      if (iWon) {
        return {
          pillText: isShared ? `Won: tied on ${topFound}` : `Won: ${topFound} sets`,
          infoColText: isShared ? 'You tied for the win!' : 'You won!',
          outcome: 'won',
        }
      }
      if (isShared) {
        return { pillText: `${winnerNames} tied on ${topFound}`, infoColText: `${winnerNames} tied`, outcome: 'lost' }
      }
      return { pillText: `${winnerNames} won with ${topFound}`, infoColText: `${winnerNames} won`, outcome: 'lost' }
    }
    if (playState === 'lost_compete') {
      if (statusOutcome === 'conceded') {
        return { pillText: 'Lost: all conceded', infoColText: 'All conceded', outcome: 'lost' }
      }
      return { pillText: 'Lost: nobody found a set', infoColText: 'Nobody scored', outcome: 'lost' }
    }
    return gameEndedTerminalMessage('compete')
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
      pillText: stranded === 0 ? `Won: the whole deck, ${sets}` : `Won: all sets found, ${sets}`,
      infoColText: stranded === 0 ? 'A perfect clear!' : 'All sets found',
      outcome: 'won',
    }
  }
  if (playState === 'lost') {
    return { pillText: `Lost: out of time, ${sets}`, infoColText: `${sets} found`, outcome: 'lost' }
  }
  return { pillText: `Ended: ${sets}`, infoColText: `${sets} found`, outcome: 'neutral' }
}
