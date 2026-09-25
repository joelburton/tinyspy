// cs-fixed-outcome-fix

import { runRpc } from '@/common/supabase/dbResult'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import type { Actor, Member } from '@/common/members/member'
import { cls } from '@/common/utils/cls'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { ANSWER_OUTCOME } from '../lib/answer'
import { setupRows } from '../lib/setupSummary'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { db } from '../db'
import type { ScrabbleSetup } from '../lib/setup'
import type { Placement } from '../lib/play'
import type { RankedMove } from '../lib/rank'
import { useGame, type EventRow } from '../hooks/useGame'
import { useSharedMove, type SharedMovePayload } from '../hooks/useSharedMove'
import { printScrabblePdf } from '../pdf/printScrabblePdf'
import { BoardCol, type HistoryTarget } from './BoardCol'
import { InfoCol, type SuggestState } from './InfoCol'
import { StateLine } from './StateLine'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import styles from './PlayArea.module.css'
import '../theme.css'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * scrabble's play surface (coop + compete). PlayArea is the **coordinator**: it holds
 * the game data (`useGame`), the board-viewer coordination (`useHistoryViewer`, whose
 * `HistoryTarget` here carries BOTH a past turn AND a coop teammate's shared move), the
 * coop "show a move" Broadcast transport (`useSharedMove`), the below-board feedback
 * slot (born here because InfoCol's End/Concede show into it too), and the
 * terminal message; it wires two columns:
 *
 *   - **`<BoardCol>`** — the 15×15 board + the rack + the whole turn machine
 *     (staging via drag/keyboard, the blank picker, the optimistic hold, and the
 *     play_word/exchange/pass RPCs, which are inseparable from that state). Takes the
 *     game data + gameId + the feedback slot + the history-view inputs down.
 *   - **`<InfoCol>`** — the turn/score readout, OpponentStrip, action row, help,
 *     setup disclosure, and the Moves log. Named callbacks up.
 *
 * "Play word" evaluates the staged tiles with `lib/play.ts` (in BoardCol) and sends
 * words + score to `scrabble.play_word`, which trusts them and checks only the
 * dictionary. See docs/playarea.md.
 */
export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  isConceded,
  isLocallyTerminal,
  isTurnBased,
  isMyTurn,
  isWaitingForTurn,
  isBoardInteractive,
  turnHolderId,
  status,
  setup,
  clubHandle,
  goToGame,
  menu,
  brand,
  title,
  globalFeedbackSlot,
}: GamePageCtx) {
  // The board is worked by clicks and typing, so Tab has nowhere to go here —
  // and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])
  const { game, players: playerStates, plays, loading, failure } = useGame(gameId)
  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (common/setup-form/doc.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(setup as unknown as ScrabbleSetup, game?.mode ?? 'coop', players),
    [setup, game, players],
  )

  // Mobile (docs/mobile.md → The info-sheet recipe): below the breakpoint the
  // board fills the screen and the info column moves into an off-canvas
  // <InfoSheet>, reached by the header's page switch. Desktop is
  // unchanged. This is a LAYOUT for keyboard-attached devices (tablets), not a
  // touch-entry mode — the drag path gets no touch support; play is the
  // keyboard cursor (tap a square, type). No device gate: a browser cannot tell
  // whether a keyboard is attached, so a phone renders and simply can't enter
  // tiles without one. Like crosswords, the window-level key
  // capture keeps running while the sheet is open — typing stages tiles behind
  // it; acceptable for the keyboard-tablet class this targets.
  const infoSheet = useInfoSheet()

  // The below-board slot — drawn in the commit slot (docs/ui.md → Feedback
  // pill). Born in the coordinator because BOTH columns show into it:
  // BoardCol's turn machine (played / rejected / …) AND InfoCol's End /
  // Concede; the standing conditions further down are its too.
  const localFeedbackSlot = useFeedbackSlot('local')

  // ─── Win celebration (COMPETE only) ────────────────────
  // scrabble inverts the usual gate. Everywhere else the celebration is the
  // COOP win, because coop is where the group shares an unambiguous victory —
  // but scrabble's coop has no win at all: one shared rack, no opponent, the
  // game just ends when the tiles run out and you're left with a score. There's
  // nothing to celebrate, so coop pops nothing. COMPETE has a real winner, so
  // that's where the confetti goes, for the player who won.
  //
  // Both inputs come off the `common.games` row GamePage already waited for
  // (`playState`, `status.winner_user_id`), so this is correct on the very FIRST render
  // — which is what makes a per-player gate safe here (the usual objection is
  // per-player data arriving empty and faking a flip). `useCelebration` never
  // pops on mount besides, so opening a finished game stays quiet.
  const celebration = useCelebration(
    playState === 'won_compete' && (status?.winner_user_id as string | undefined) === session.user.id,
  )

  // Board-viewer coordination (shared hook): which read-only overlay is open — a
  // past turn OR a teammate's shared move (the `HistoryTarget` union). Cross-column:
  // BoardCol renders it, InfoCol's Moves log selects a turn, a broadcast opens a
  // shared move. A new committed move (the version effect in BoardCol) exits either.
  const {
    historyId: historyTarget,
    historyN,
    historyIdRef: historyTargetRef,
    showHistory,
    exitHistory,
  } = useHistoryViewer<HistoryTarget>()
  // Only a TURN is highlighted in the Moves log (`#N`) — a shared move has no row.
  const historyId = historyTarget?.kind === 'turn' ? historyTarget.id : null

  // Show-a-move transport (coop only): a teammate's broadcast opens a read-only
  // preview of their staged tiles. Ignore a stale one (their board version no
  // longer matches ours — a real move landed in between), so we never overlay a
  // move that no longer fits. `select` opens it on the same viewer as history.
  const { shareMove } = useSharedMove({
    gameId,
    mode: game?.mode,
    onReceive: useCallback(
      (p: SharedMovePayload) => {
        if (!game || p.baseVersion !== game.version) return
        // No `#N`: a shared move arrives over Broadcast, not from a log row, and
        // its banner names the sharer instead of a number.
        showHistory(
          {
            kind: 'peerPreview',
            placements: p.placements,
            sharerId: p.sharerId,
            words: p.words,
            score: p.score,
          },
          null,
        )
      },
      [game, showHistory],
    ),
  })

  // ─── Derived (null-safe until the loading guard) ──────────────
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = game?.mode === 'compete'
  // Concede lives on the common roster (ctx.players → `players`).
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))
  const nameOf = useCallback(
    (userId: string | null) => players.find((m: Member) => m.user_id === userId)?.username ?? 'someone',
    [players],
  )
  // Identity-disc color NAME for the share banner's disc (the shared <Dot>
  // resolves it to the member-color tokens).
  const memberColorOf = useCallback(
    (userId: string) => players.find((m: Member) => m.user_id === userId)?.color,
    [players],
  )
  // Show-a-move is a coop, ≥2-player affordance — there's a teammate to show.
  const canShare = game?.mode === 'coop' && players.length >= 2

  // ─── AI opponents (compete; docs/games/scrabble.md) ──────────
  // Drive the AI opponent: when the turn lands on an AI seat, poke the
  // scrabble-ai-move edge function — it plays the AI seat(s) forward until a
  // human's turn. Any connected client may fire it (the RPCs it calls are
  // turn+version guarded, so a duplicate poke is a harmless no-op). Fire once per
  // board `version` so we don't spam while the bot is thinking; a real move bumps
  // the version and re-arms this.
  // A bot is a player with a user_id, so the question is whether the turn
  // holder's seat carries an `ai_level` (a bot's name and dot come off its
  // profile like anyone's). Get this wrong and nothing pokes the edge function —
  // the bot never moves and the table stalls.
  const turnHolderIsAi =
    isCompete && playerStates.find((p) => p.user_id === turnHolderId)?.ai_level != null
  /** What `scrabble-ai-move` puts in `data`. `turns` is how many seats it
   *  played this invocation — 0..40, and 0 is COMMON: every client pokes and
   *  only one wins the race. Nothing reads it; the poke is fire-and-forget. */
  type AiPoked = { result: 'moved'; turns: number } | null

  const aiPokeVersionRef = useRef<number | null>(null)
  useEffect(() => {
    if (!turnHolderIsAi || !game || isTerminal) return
    if (aiPokeVersionRef.current === game.version) return
    const pokedVersion = game.version
    aiPokeVersionRef.current = pokedVersion
    void runEdgeFn<AiPoked>('scrabble-ai-move', { game_id: gameId }).then((res) => {
      // DISARM, which every arm below but the first one wants. The once-per-
      // version guard above assumes the poke either moves the AI (bumping
      // `version`, which re-arms this) or is a harmless duplicate — a FAILED
      // poke is neither, and leaving the ref set wedges the game permanently:
      // the version never changes, so this effect never fires again and the bot
      // appears to think forever. Clearing it means the next render that still
      // sees an AI seat on turn tries again.
      //
      // Found the hard way: the edge function called two RPCs by the wrong
      // name (`ai_pass` for `ai_pass_turn`), which only bites the first time
      // the AI must pass rather than play — ~30 moves into a game, at which
      // point it hung with nothing in the logs and no way to recover but a
      // page reload.
      const disarm = () => {
        if (aiPokeVersionRef.current === pokedVersion) aiPokeVersionRef.current = null
      }
      if (res.type === 'ok' && res.data?.result === 'moved') {
        // Nothing to do, and nothing to disarm: a move bumped `version`, which
        // re-arms this effect on its own.
      } else if (res.type === 'not-ok') {
        // Every one of them is a `BUG:`, and `runEdgeFn` has already raised the
        // modal. A wedged AI SHOULD be loud — see the hard-won lesson above.
        disarm()
        console.error('scrabble-ai-move poke failed', res.message)
      } else {
        disarm()
        reportUnhandled('scrabble-ai-move', res)
      }
    })
  }, [turnHolderIsAi, game, gameId, isTerminal])

  // Peer-move news → the GLOBAL header (the peer channel; my own move goes to
  // the below-board slot — docs/ui.md → Where a message goes).
  // Compete only: announce each OPPONENT's committed move (human OR AI), so a
  // move that lands while I'm looking elsewhere — especially an AI's, which has
  // no visible human actor — gets noticed. Seeded to the current tail on the
  // first run so the existing log isn't replayed.
  const announcedIdRef = useRef<number | null>(null)
  useEffect(function announceOpponentMoves() {
    if (!game || !isCompete) return
    const tailId = plays.length ? plays[plays.length - 1].id : 0
    if (announcedIdRef.current === null) {
      announcedIdRef.current = tailId // seed once — don't announce prior history
      return
    }
    if (tailId <= announcedIdRef.current) return
    const fresh = plays.filter((p) => p.id > (announcedIdRef.current ?? 0))
    announcedIdRef.current = tailId
    // The newest OPPONENT move in this batch (mine already showed in the commit slot).
    const latest = fresh.filter((p) => p.user_id !== session.user.id).at(-1)
    if (!latest) return
    const actor = players.find((m) => m.user_id === latest.user_id)
    globalFeedbackSlot.show(
      FeedbackMessage.peer(actor, ANSWER_OUTCOME[latest.kind], peerMoveText(latest)),
    )
  }, [plays, game, isCompete, session.user.id, players, globalFeedbackSlot])

  // ─── Suggest-a-move (coop AI hints — docs/games/scrabble.md §11) ──────────
  // State lives here (the coordinator): InfoCol renders the box, BoardCol
  // registers the "stage these placements" applier the list's click calls.
  // A `ready` result remembers the board `version` it was computed against;
  // staleness is DERIVED at render (below), not cleared by an effect — coop
  // has no turns, so a teammate playing while the list is open is a real race.
  const [suggest, setSuggest] = useState<SuggestState>({ status: 'idle' })
  const suggestionApplierRef = useRef<((placements: Placement[]) => void) | null>(null)
  const registerSuggestionApplier = useCallback(
    (fn: ((placements: Placement[]) => void) | null) => {
      suggestionApplierRef.current = fn
    },
    [],
  )
/** What `scrabble-suggest-move` puts in `data`. Two `ok`s because the panel
 *  says two different things — a ranked list, or "No legal moves — swap
 *  tiles?", which is advice and only right when the generator actually
 *  searched. `version` rides on both: the staleness rule applies either way. */
type Suggested =
  | { result: 'suggested'; moves: RankedMove[]; version: number }
  | { result: 'no-legal-moves'; version: number }
  | null

  const handleSuggest = useCallback(async () => {
    setSuggest({ status: 'loading' })
    const res = await runEdgeFn<Suggested>('scrabble-suggest-move', { game_id: gameId })

    if (res.type === 'not-ok' && res.severity === 'fault') {
      // The panel resets to idle. `runEdgeFn` has raised the modal, and a fault
      // leaves nothing to put on the panel's line (docs/ui.md → Faults).
      setSuggest({ status: 'idle' })
    } else if (res.type === 'not-ok') {
      // `get_suggest_context`'s own refusals — not your turn, not a member —
      // relayed here in their own words.
      setSuggest({ status: 'error', message: res.message })
    } else if (res.type === 'ok' && res.data?.result === 'no-legal-moves') {
      // Its own answer, not an empty list: "No legal moves — swap tiles?" is a
      // RECOMMENDATION, and only right when we searched and found none.
      setSuggest({ status: 'ready', moves: [], version: res.data.version })
    } else if (res.type === 'ok' && res.data?.result === 'suggested') {
      // We do NOT reject a version mismatch here. The response's version is the
      // DB's fresh snapshot; the FE's realtime copy can still LAG behind it, in
      // which case the hints answer the board the FE is about to catch up to —
      // rejecting would lie ("Board changed") and loop until the CDC lands. The
      // render-derived `suggestView` (below) is the single staleness authority:
      // it shows the list exactly when `suggest.version === game.version` and
      // hides it otherwise, so a genuinely superseded answer never surfaces.
      setSuggest({ status: 'ready', moves: res.data.moves, version: res.data.version })
    } else {
      reportUnhandled('scrabble-suggest-move', res)
      setSuggest({ status: 'idle' })
    }
  }, [gameId])

  const handleApplySuggestion = useCallback((move: RankedMove) => {
    suggestionApplierRef.current?.(move.placements)
  }, [])

  // ─── End / Concede / Replay — the shared trio ─────────────
  // The byte-identical shared handlers (useStandardGameActions). scrabble's own
  // bits are the replay sentence and the post-replay cleanup (leave whichever
  // read-only overlay is open — a past turn or a teammate's shared move — since
  // the board it described is gone; dismiss the last result).
  //
  // What "Restart" means here is worth stating: scrabble's 15×15 grid is
  // the standard layout, not a generated puzzle, so there's no board to restore.
  // A replay re-deals — fresh bag, new racks, empty grid — keeping the setup,
  // roster, seats and any AI opponents. Hence the confirm's wording.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: isCompete ? 'compete' : 'coop',
    isLocallyTerminal,
    localFeedbackSlot,
  })

  // Ask the AI for a move — coop only (in a race a suggested play would be a win
  // button, and it reads the shared rack besides). Gray while a request is out,
  // so a second press can't stack two.
  const actSuggestMove = useBoundAction('act-suggest-move', {
    describe: () => {
      if (isCompete) return 'hidden'
      const busy = suggest.status === 'loading'
      return { state: isTerminal || !self || busy ? 'disabled' : 'active', label: 'Suggest' }
    },
    run: handleSuggest,
  })

  // New game — a FRESH game (new id, new shuffle) with THIS game's setup +
  // roster + mode, in the same club. scrabble's create_game is a direct RPC (no
  // edge function — the only per-game randomness is the bag shuffle), so this
  // mirrors the manifest's startGameInClub. Non-destructive (common.create_game
  // un-currents this game into the club list), so no confirm.
  //
  // `setup` is passed through verbatim, AI seats included — "same again" means
  // the same opponents. It carries `first_turn_user_id` for a turn-order coop game;
  // create_game re-reads it, so the rotation is seeded exactly as before.
  //
  // The roster is the FULL roster, conceded players included (as in every
  // sibling's New game). Conceding is "I'm out of THIS race", not a withdrawal
  // from the group — and `conceded` lives on the old game's `common.game_players`
  // rows, so a fresh game starts everyone clean. Filtering them out would drop a
  // friend from the rematch silently, and in the common 2-human compete case
  // would leave a single player, which create_game rejects outright.
  const gameMode: 'coop' | 'compete' = isCompete ? 'compete' : 'coop'
  //
  // A plain function, rebuilt every render: the binding below reads it at click
  // time, so `setup` and `players` are whatever the last realtime refetch left,
  // and the action's own identity doesn't move when they do.
  const createNewGame = async () => {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup: setup as unknown as ScrabbleSetup,
        // HUMANS only. The bots are seated by `setup.ai_count`, which is what
        // the setup form asks for and what create_game resolves to profiles —
        // passing their ids here too would seat each one twice.
        player_user_ids: players.filter((p) => !p.ai_member).map((p) => p.user_id),
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
      goToGame(`scrabble_${gameMode}`, res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game:
  // create_game clears the club's current-view flag, so it stays resumable — the
  // copy says shelved, not ended) and goes straight through at terminal. The
  // shared run's single flight is what stops a second press dealing a second bag.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

  // Print the board — a snapshot at CLICK time (common/pdf/doc.md). RLS already scoped
  // the state to what I may see (my own rack, my visible moves), so what prints
  // is what the page in front of me shows.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      if (!game) return
      const rack = isCompete ? (self?.rack ?? []) : (game.sharedRack ?? [])
      printScrabblePdf({
        // "Brand: game title" (brand from the manifest via ctx — never the
        // "scrabble" code-name; title = common.games.title, this game's own
        // name) + today's date.
        brand,
        gameTitle: title,
        date: new Date().toLocaleDateString(),
        summary: isCompete
          ? `${game.bagCount} tiles in the bag`
          : `Team score: ${game.teamScore ?? 0} · ${game.bagCount} tiles in the bag`,
        board: game.board,
        moves: plays.map((p, i) => ({ seq: i + 1, who: nameOf(p.user_id), text: moveText(p) })),
        rack,
        rackLabel: !self ? '' : isCompete ? 'Your rack' : 'Team rack',
        // Relevant setup only — the dictionary bands (the timer isn't relevant
        // on a print).
        mode: game.mode ?? 'coop',
        setup: summaryRows,
      })
    },
  })

  // The FULL scrabble menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          { items: [actPrintBoard] },
          // The same pair the terminal action row offers, reachable mid-game too.
          { items: [actRestart, actNewGame] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actRestart, actNewGame, actPrintBoard])

  // ─── The three standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome. The compete winner is whoever holds `winner_user_id`
  // — bot or person, one roster, one lookup — reduced to name + color for the
  // identity dot. Undefined on a tie / all-conceded / coop, where nobody is
  // named. `winner_username` covers the roster arriving a beat late.
  const statusOutcome = (status?.reason as string | undefined) ?? null
  const winnerId = (status?.winner_user_id as string | undefined) ?? null
  const winnerMember = players.find((m: Member) => m.user_id === winnerId)
  const winnerName =
    winnerMember?.username ??
    (winnerId !== null ? (status?.winner_username as string | undefined) : undefined)
  const winnerColor = winnerMember?.color
  const hasWinner = winnerId !== null
  const teamScore = game?.teamScore ?? null
  const over = useMemo(
    () =>
      isTerminal && game
        ? buildOver({
            mode: game.mode,
            playState,
            statusOutcome,
            teamScore,
            selfWon: winnerId === session.user.id,
            winner: hasWinner ? { username: winnerName ?? 'a player', color: winnerColor ?? '' } : undefined,
          })
        : null,
    // `game` stands in for its mode, which never changes once loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isTerminal, game?.mode, playState, statusOutcome, teamScore, winnerId, session.user.id, hasWinner, winnerName, winnerColor],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Locally terminal (compete: I conceded while the others play on). The
  // InfoCol's action-row line carries the terse half of this; dual placement
  // is the rule (docs/playarea.md), and on a phone the InfoCol is off-canvas,
  // making this the ONLY copy the player sees.
  useEffect(function showOutOfRace() {
    if (isTerminal || !isLocallyTerminal) return
    const id = localFeedbackSlot.show(FeedbackMessage.outOfRace(isConceded))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isTerminal, isLocallyTerminal, isConceded])

  // Turn-order (coop, opt-in): a teammate holds the move. Never in a
  // free-for-all game, where the move is always mine. (Compete is ALWAYS
  // turn-based, but its status line already names the current player, so the
  // note would be redundant — hence coop only; src/scrabble/todo.md.) The note
  // lands where the commit buttons would be: they're useless on a teammate's
  // turn, so swapping them for the reason is exactly right.
  const waiting = !isCompete && isWaitingForTurn
  const turnHolder = players.find((m: Member) => m.user_id === turnHolderId)
  const holderName = turnHolder?.username
  const holderColor = turnHolder?.color
  useEffect(function showWaiting() {
    if (!waiting) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.waiting(
        holderName === undefined ? undefined : { username: holderName, color: holderColor ?? '' },
      ),
    )
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, waiting, holderName, holderColor])

  if (loading) return <p className={styles.loading}>Loading game…</p>
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "Game not found." about a dead connection is a confident wrong answer —
  // this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) return <p className={styles.loading}>Game not found.</p>

  const scrabbleSetup = setup as unknown as ScrabbleSetup

  // A ready list quietly clears the moment the board moves past it — most
  // commonly because the player just COMMITTED the suggested move, where a
  // "board changed" message read as something going wrong. Also clears once
  // the game is over (`end_game` never bumps `version`, so the version test
  // alone would leave zombie "stage these tiles" rows on the terminal
  // screen). Derived each render, no clearing effect (the no-setState-in-
  // effects rule) — this is the single staleness authority for the hints.
  const suggestView: SuggestState =
    suggest.status === 'ready' && (isTerminal || suggest.version !== game.version)
      ? { status: 'idle' }
      : suggest

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        mobileStatus={
          <StateLine
            isCompete={isCompete}
            isTerminal={isTerminal}
            isMyTurn={isMyTurn}
            currentMember={turnHolder}
            teamScore={game.teamScore}
            bagCount={game.bagCount}
          />
        }
        game={game}
        gameId={gameId}
        self={self}
        isMyTurn={isMyTurn}
        isBoardInteractive={isBoardInteractive}
        localFeedbackSlot={localFeedbackSlot}
        plays={plays}
        historyTarget={historyTarget}
        historyN={historyN}
        historyTargetRef={historyTargetRef}
        onExitHistory={exitHistory}
        nameOf={nameOf}
        memberColorOf={memberColorOf}
        canShare={canShare}
        shareMove={shareMove}
        selfId={session.user.id}
        registerSuggestionApplier={registerSuggestionApplier}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          isCompete={isCompete}
          isMyTurn={isMyTurn}
          over={over}
          isLocallyTerminal={isLocallyTerminal}
          isTerminal={isTerminal}
          isTurnBased={isTurnBased}
          turnHolderId={turnHolderId}
          currentMember={turnHolder}
          teamScore={game.teamScore}
          bagCount={game.bagCount}
          players={players}
          selfId={session.user.id}
          playerStates={playerStates}
          concededIds={concededIds}
          actEndGame={actEndGame}
          actConcede={actConcede}
          actRestart={actRestart}
          actNewGame={actNewGame}
          actBackToClub={menu.actBackToClub}
          suggest={isCompete ? null : suggestView}
          actSuggestMove={actSuggestMove}
          onApplySuggestion={handleApplySuggestion}
          setup={scrabbleSetup}
          setupRows={summaryRows}
          plays={plays}
          historyId={historyId}
          onShowHistory={(id, n) => showHistory({ kind: 'turn', id }, n)}
        />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the commit slot's verdict + the info-column outcome line. Only a COMPETE
          win celebrates — coop has no win to celebrate (see useCelebration above). */}
      {celebration.show && (
        <CelebrationBlockingModal title="You win! 🎉" onClose={celebration.close} />
      )}
    </div>
  )
}

/** One opponent move as a terse peer line for the global header — the actor
 *  leads it, drawn by the pill, so this is what follows their name. */
function peerMoveText(p: EventRow): string {
  if (p.kind === 'word') {
    const w = (p.words ?? [])[0]?.toUpperCase() ?? ''
    return `played ${w} (+${p.score ?? 0})`
  }
  if (p.kind === 'exchange') return `exchanged ${p.tile_count} tiles`
  if (p.kind === 'pass') return 'passed'
  return 'ended the game'
}

/** SPIKE: format one play for the print moves table (a second copy of BoardCol's
 *  `historyLabelFor`, minus the `#N` and the name — see todo.md). */
function moveText(p: EventRow): string {
  if (p.kind === 'word') {
    const words = (p.words ?? []).map((w) => w.toUpperCase()).join(', ')
    return `+${p.score ?? 0} ${words}`
  }
  if (p.kind === 'exchange') return `exchanged ${p.tile_count} tiles`
  if (p.kind === 'pass') return 'passed'
  return `ended — ${-(p.score ?? 0)} tiles unplayed` // forfeit
}

/**
 * The terminal message, mode- and self-aware.
 *
 *   - `pillText` (+ the winner as `actor` when one is NAMED) is the verdict in
 *     the commit slot. ONE OR TWO WORDS — far terser than the other games'
 *     verdicts, because scrabble's slot is not a full below-board row: it's
 *     the sub-area that swaps in for the commit buttons, with the rack still
 *     beside it, and on a phone the rack + controls have already wrapped to
 *     two rows. No score in it either — the mobile status bar above the board
 *     carries the live number, so repeating it here spends the width twice.
 *   - `infoColText` (+ `outcome`) is the bold info-column outcome line.
 *     Deliberately UNCHANGED by the end-states sweep — the two surfaces carry
 *     two lengths.
 *
 * COOP has no win — one shared rack, no opponent — so its three endings are all
 * neutral, and they're distinguished rather than collapsed: `Completed:` for
 * playing the board out, `Ended: time` for the clock, plain `Ended:` for a manual
 * stop. COMPETE names who won: the winner rides as `actor`, and the pill draws
 * the mention the way every other message names someone.
 */
function buildOver({
  mode,
  playState,
  statusOutcome,
  teamScore,
  selfWon,
  winner,
}: {
  mode: 'coop' | 'compete'
  playState: string
  /** `status.reason`, or null when the status carries none. */
  statusOutcome: string | null
  teamScore: number | null
  selfWon: boolean
  /** The winner as name + color — a human from the roster, or the synthetic
   *  "AI n" (whose label `status.winner_username` also carries). Undefined on
   *  a tie / all-conceded / coop, where nobody is named. */
  winner: Actor | undefined
}): TerminalMessage {
  if (mode === 'coop') {
    const score = teamScore ?? 0
    if (statusOutcome === 'manual') return { pillText: 'Ended', infoColText: `${score} pts`, outcome: 'neutral' }
    // The clock is the ONE way a coop table loses: it failed to finish in time,
    // which is how every other game on the roster reads a timeout (the server
    // agrees — scrabble._finish writes play_state 'lost' for it alone).
    if (statusOutcome === 'timeout') {
      return { pillText: 'Lost: out of time', infoColText: `${score} pts`, outcome: 'lost' }
    }
    // Played all the way out (coop's only automatic ending — the blocked end
    // needs passes, and coop has no turns to pass). Not a WIN (coop has no
    // opponent), but a real completion, worth distinguishing from "it just
    // stopped".
    return { pillText: 'Completed', infoColText: `${score} pts`, outcome: 'won' }
  }
  if (playState === 'ended') return { pillText: 'Ended', infoColText: 'Ended', outcome: 'neutral' }
  // Everyone conceded (play_state 'lost_compete', outcome 'conceded'): a collective
  // loss with no eligible winner. Must precede the winner logic below, which
  // would otherwise fall through to the phantom co-winners tie on null winner.
  if (statusOutcome === 'conceded') {
    return { pillText: 'All conceded', infoColText: 'All conceded', outcome: 'lost' }
  }
  if (selfWon) return { pillText: 'You won', infoColText: 'You won!', outcome: 'won' }
  if (winner) {
    return { pillText: 'won', infoColText: `${winner.username} won`, outcome: 'lost', actor: winner }
  }
  return { pillText: 'Tie', infoColText: 'Tie', outcome: 'neutral' }
}
