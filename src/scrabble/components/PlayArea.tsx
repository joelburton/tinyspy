import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { GenericFeedbackMsg, GamePageCtx, Member } from '../../common/lib/games'
import { cls } from '../../common/lib/util/cls'
import { outOfRacePill, terminalPill } from '../../common/lib/game/localPills'
import { waitingTurnPill } from '../../common/components/game/turnCopy'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { colorVarFor } from '../../common/lib/color/memberColor'
import { supabase } from '../../common/lib/supabase/supabase'
import { unwrapEdgeFnError } from '../../common/lib/supabase/edgeFnError'
import { db } from '../db'
import type { ScrabbleSetup } from '../lib/setup'
import type { Placement } from '../lib/play'
import type { RankedMove } from '../lib/rank'
import { useGame, type PlayRow } from '../hooks/useGame'
import { useSharedMove, type SharedMovePayload } from '../hooks/useSharedMove'
import { printScrabblePdf } from '../pdf/printScrabblePdf'
import { BoardCol, type LocalFeedbackMsg, type ViewTarget } from './BoardCol'
import { InfoCol, type SuggestState } from './InfoCol'
import { StateLine } from './StateLine'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'
import { useSwallowTab } from '../../common/hooks/input/useSwallowTab'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'

/** Disc colors for AI seats (up to 3), kept distinct from the common
 *  member-color palette's usual first picks so a bot reads as "not one of us". */
const AI_DISC_COLORS = ['brown', 'purple', 'pink']

/**
 * scrabble's play surface (coop + compete). PlayArea is the **coordinator**: it holds
 * the game data (`useGame`), the board-viewer coordination (`useHistoryViewer`, whose
 * `ViewTarget` here carries BOTH a past turn AND a coop teammate's shared move), the
 * coop "show a move" Broadcast transport (`useSharedMove`), the below-board feedback
 * channel (`useLocalFeedback` — lifted here because InfoCol's End/Concede write to it
 * too), and the terminal copy; it wires two columns:
 *
 *   - **`<BoardCol>`** — the 15×15 board + the rack + the whole turn machine
 *     (staging via drag/keyboard, the blank picker, the optimistic hold, and the
 *     play_word/exchange/pass RPCs, which are inseparable from that state). Takes the
 *     game data + gameId + the feedback channel + the history-view inputs down.
 *   - **`<InfoCol>`** — the turn/score readout, OpponentStrip, action row, help,
 *     setup disclosure, and the Moves log. Named callbacks up.
 *
 * "Play word" evaluates the staged tiles with `lib/play.ts` (in BoardCol) and sends
 * words + score to `scrabble.play_word`, which trusts them and checks only the
 * dictionary. See docs/playarea-decomposition-plan.md.
 */
export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  isMyTurn,
  currentTurnUserId,
  status,
  setup,
  goToClub,
  clubHandle,
  goToGame,
  menu,
  brand,
  title,
  globalFeedback,
}: GamePageCtx) {
  // Tab does nothing while the board has the keyboard — this play surface is
  // not a form, so native Tab would walk out to the header buttons and on into
  // the browser's URL bar, stranding the player. (The capture-entry games get
  // this from useCaptureKeys; see useSwallowTab.)
  useSwallowTab()
  const { game, players: playerStates, plays, loading } = useGame(gameId)

  // Mobile (docs/mobile.md → the psychicnum recipe): below the breakpoint the
  // board fills the screen and the info column moves into an off-canvas
  // <InfoSheet>, opened from the hook's "Game info" menu item. Desktop is
  // unchanged. This is a LAYOUT for keyboard-attached devices (tablets), not a
  // touch-entry mode — the drag path gets no touch support; play is the
  // keyboard cursor (tap a square, type). Like crosswords, the window-level key
  // capture keeps running while the sheet is open — typing stages tiles behind
  // it; acceptable for the keyboard-tablet class this targets.
  const infoSheet = useInfoSheet()

  // The player's own-move result — a sticky pill in the commit slot (the local
  // feedback area; docs/ui.md → Feedback pill). Lifted to the coordinator
  // because BOTH columns write it: BoardCol's turn machine (played/rejected/…) AND
  // InfoCol's End/Concede failures. The thin builder keeps the terse `{ tone, text }`
  // call sites (own-move results are outline + sticky — the next move dismisses them).
  const { localFeedback, showLocalFeedback: showMsg, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()
  const showLocalFeedback = useCallback(
    (m: LocalFeedbackMsg) => showMsg({ ...m, variant: 'outline', dismiss: { kind: 'sticky' } }),
    [showMsg],
  )

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
  // past turn OR a teammate's shared move (the `ViewTarget` union). Cross-column:
  // BoardCol renders it, InfoCol's Moves log selects a turn, a broadcast opens a
  // shared move. A new committed move (the version effect in BoardCol) exits either.
  const { viewingId: viewTarget, viewingIdRef: viewTargetRef, viewing, select, exitViewing } =
    useHistoryViewer<ViewTarget>()
  // Only a TURN is highlighted in the Moves log (`#N`) — a shared move has no row.
  const viewingSeq = viewTarget?.kind === 'turn' ? viewTarget.seq : null

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
        select({ kind: 'shared', placements: p.placements, sharerId: p.sharerId, words: p.words, score: p.score })
      },
      [game, select],
    ),
  })

  // ─── Derived (null-safe until the loading guard) ──────────────
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = game?.mode === 'compete'
  // Concede lives on the common roster (ctx.players → `players`).
  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))
  // Compete gates by scrabble's own seat pointer (`game.currentUserId`); coop
  // uses the COMMON turn pointer via ctx `isMyTurn` (true for free-for-all coop,
  // so nothing changes there; false when a turn-order coop game isn't your turn).
  const myTurn = isCompete ? game?.currentUserId === session.user.id : isMyTurn
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

  // ─── AI opponents (compete; docs/scrabble-ai-strength.md) ──────────
  // AI seats live in the per-seat state (user_id null + ai_level), NOT in the
  // common roster (`players`) — so we build their display identity here:
  // numbered "AI 1".."AI 3" in seat order, each a distinct disc color. Used by
  // the turn line, the Moves log, and the compact AI score strip.
  const aiRoster = useMemo(
    () =>
      playerStates
        .filter((p) => p.ai_level != null)
        .sort((a, b) => a.seat - b.seat)
        .map((p, i) => ({
          seat: p.seat,
          name: `AI ${i + 1}`,
          color: AI_DISC_COLORS[i % AI_DISC_COLORS.length],
          score: p.score ?? 0,
        })),
    [playerStates],
  )
  // A synthetic Member for an AI seat (the turn line + Moves log resolve identity
  // through Member, keyed on the disc color + name). Memoized so the peer-news
  // effect below doesn't re-fire every render.
  const aiMemberOfSeat = useCallback(
    (seat: number | null): Member | undefined => {
      if (seat == null) return undefined
      const ai = aiRoster.find((a) => a.seat === seat)
      return ai ? ({ user_id: `ai:${seat}`, username: ai.name, color: ai.color } as Member) : undefined
    },
    [aiRoster],
  )

  // Drive the AI opponent: when the turn lands on an AI seat, poke the
  // scrabble-ai-move edge function — it plays the AI seat(s) forward until a
  // human's turn. Any connected client may fire it (the RPCs it calls are
  // seat+version guarded, so a duplicate poke is a harmless no-op). Fire once per
  // board `version` so we don't spam while the bot is thinking; a real move bumps
  // the version and re-arms this.
  const currentSeatIsAi =
    isCompete && game != null && game.currentUserId == null && aiRoster.some((a) => a.seat === game.currentSeat)
  const aiPokeVersionRef = useRef<number | null>(null)
  useEffect(() => {
    if (!currentSeatIsAi || !game || isTerminal) return
    if (aiPokeVersionRef.current === game.version) return
    aiPokeVersionRef.current = game.version
    void supabase.functions.invoke('scrabble-ai-move', { body: { game_id: gameId } })
  }, [currentSeatIsAi, game, gameId, isTerminal])

  // Peer-move news → the GLOBAL header (the peer-news channel; my own move goes
  // to the below-board pill — docs/code-conventions.md → Feedback naming).
  // Compete only: announce each OPPONENT's committed move (human OR AI), so a
  // move that lands while I'm looking elsewhere — especially an AI's, which has
  // no visible human actor — gets noticed. Seeded to the current tail on the
  // first run so the existing log isn't replayed. `globalFeedback.show` is a
  // prop callback, so there's no local setState in this effect.
  const announcedSeqRef = useRef<number | null>(null)
  useEffect(() => {
    if (!game || !isCompete) return
    const tailSeq = plays.length ? plays[plays.length - 1].seq : 0
    if (announcedSeqRef.current === null) {
      announcedSeqRef.current = tailSeq // seed once — don't announce prior history
      return
    }
    if (tailSeq <= announcedSeqRef.current) return
    const fresh = plays.filter((p) => p.seq > (announcedSeqRef.current ?? 0))
    announcedSeqRef.current = tailSeq
    // The newest OPPONENT move in this batch (mine already showed in the commit slot).
    const latest = fresh.filter((p) => p.user_id !== session.user.id).at(-1)
    if (!latest) return
    const actor = latest.user_id
      ? players.find((m) => m.user_id === latest.user_id)
      : aiMemberOfSeat(latest.seat)
    globalFeedback.show({
      tone: latest.kind === 'word' ? 'success' : 'neutral',
      variant: 'outline',
      dot: colorVarFor(actor?.color),
      text: peerMoveText(actor?.username ?? 'Someone', latest),
      dismiss: { kind: 'timed' },
    })
  }, [plays, game, isCompete, session.user.id, players, aiMemberOfSeat, globalFeedback])

  // ─── Suggest-a-move (coop AI hints — docs/scrabble-ai.md S5) ──────────
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
  const handleSuggest = useCallback(async () => {
    setSuggest({ status: 'loading' })
    const { data, error } = await supabase.functions.invoke('scrabble-suggest-move', {
      body: { game_id: gameId },
    })
    if (error) {
      // invoke folds a non-2xx into its own generic message; the real server
      // error rides on error.context, a Response readable once (the shared
      // unwrap, also used by invokeStartGameEdgeFn).
      setSuggest({ status: 'error', message: (await unwrapEdgeFnError(error)) ?? error.message })
      return
    }
    const payload = data as { moves?: RankedMove[]; version?: number; error?: string } | null
    if (!payload || payload.error || !Array.isArray(payload.moves) || typeof payload.version !== 'number') {
      setSuggest({ status: 'error', message: payload?.error ?? 'Could not fetch suggestions.' })
      return
    }
    // We do NOT reject a version mismatch here. The response's version is the
    // DB's fresh snapshot; the FE's realtime copy can still LAG behind it, in
    // which case the hints answer the board the FE is about to catch up to —
    // rejecting would lie ("Board changed") and loop until the CDC lands. The
    // render-derived `suggestView` (below) is the single staleness authority:
    // it shows the list exactly when `suggest.version === game.version` and
    // hides it otherwise, so a genuinely superseded answer never surfaces.
    setSuggest({ status: 'ready', moves: payload.moves, version: payload.version })
  }, [gameId])

  const handleApplySuggestion = useCallback((move: RankedMove) => {
    suggestionApplierRef.current?.(move.placements)
  }, [])

  // The End/Concede handlers are declared BELOW the menu effect (they read
  // `isTerminal` and the local-feedback channel), so the menu effect can't list
  // them in its deps without either re-running per render or going stale. Route
  // them through a stable ref (the crosswords `actionsRef` pattern): the menu's
  // End/Concede items call `actionsRef.current?.…` at click time, and a separate
  // effect keeps the ref current. This keeps the menu effect's deps stable so
  // `setGameSections` (a setState) doesn't loop.
  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    restart: () => void
    newGame: () => void
  } | null>(null)

  // SPIKE (branch scrabble-jspdf): a "Print board (PDF)" item in the GamePage menu.
  // Builds the print model from the live state (RLS already scoped it to what I may
  // see — my own rack, my visible moves) and hands it to the jsPDF renderer. Prints
  // a snapshot at click time, so it works mid-game or at the end. Re-registers when
  // the inputs change so the closure stays fresh; cleared on unmount.
  useEffect(() => {
    if (!game) return
    const rack = isCompete ? (self?.rack ?? []) : (game.sharedRack ?? [])
    const s = setup as unknown as ScrabbleSetup
    const band = (n: number) => difficultyValue(n)
    const model = {
      // "Brand: game title" (brand from the manifest via ctx — never the "scrabble"
      // code-name; title = common.games.title, this game's own name) + today's date.
      brand,
      gameTitle: title,
      date: new Date().toLocaleDateString(),
      summary: isCompete
        ? `${game.bagCount} tiles in the bag`
        : `Team score: ${game.teamScore ?? 0} · ${game.bagCount} tiles in the bag`,
      board: game.board,
      moves: plays.map((p) => ({ seq: p.seq, who: nameOf(p.user_id), text: moveText(p) })),
      rack,
      rackLabel: !self ? '' : isCompete ? 'Your rack' : 'Team rack',
      // Relevant setup only — the dictionary bands (the timer isn't relevant on a print).
      setup: [
        { label: '2-letter words', value: band(s.dict_2) },
        { label: 'Longer words (3+)', value: band(s.dict_3plus) },
      ],
    }
    // The FULL scrabble menu: Help (top) + the Print item + the End/Concede +
    // Back-to-club tail, all from `buildGameMenu`. End/Concede dispatch through
    // the stable `actionsRef` so this effect needn't depend on the (later-declared)
    // handlers. ⌥⌫ / ⇧< are wired globally by the shell — no shortcuts here.
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: isCompete ? 'compete' : 'coop',
        isTerminal,
        conceded: myConceded,
        onEndGame: () => actionsRef.current?.endGame(),
        onConcede: () => actionsRef.current?.concede(),
        extra: [
          ...infoSheet.menuSections,
          { items: [{ id: 'print', label: 'Print board (PDF)', onClick: () => printScrabblePdf(model) }] },
          {
            items: [
              // The same pair the terminal action row offers, reachable mid-game too.
              { id: 'restart', label: 'Restart', onClick: () => actionsRef.current?.restart() },
              { id: 'new-game', label: 'New game', shortcut: '+', onClick: () => actionsRef.current?.newGame() },
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, game, plays, self, isCompete, isTerminal, myConceded, nameOf, setup, brand, title, infoSheet.menuSections])

  // ─── End / Concede / Replay — the shared trio ─────────────
  // The byte-identical shared handlers (useStandardGameActions). scrabble's own
  // bits are the failure-pill format, the replay sentence, and the post-replay
  // cleanup (leave whichever read-only overlay is open — a past turn or a
  // teammate's shared move — since the board it described is gone).
  //
  // What "Restart" means here is worth stating: scrabble's 15×15 grid is
  // the standard layout, not a generated puzzle, so there's no board to restore.
  // A replay re-deals — fresh bag, new racks, empty grid — keeping the setup,
  // roster, seats and any AI opponents. Hence the confirm's wording.
  const showError = useCallback(
    (m: string) => showLocalFeedback({ tone: 'error', text: m }),
    [showLocalFeedback],
  )
  const onRestarted = useCallback(() => {
    exitViewing()
    clearLocalFeedback()
  }, [exitViewing, clearLocalFeedback])
  const { endGame, concede, restart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    showError,
    onRestarted,
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
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: setup as unknown as ScrabbleSetup,
        player_user_ids: players.map((p) => p.user_id),
        mode: gameMode,
      })
      .single()
    if (error || !data) {
      showLocalFeedback({ tone: 'error', text: `New game failed: ${error?.message ?? 'unknown'}` })
      return
    }
    goToGame(`scrabble_${gameMode}`, (data as { id: string }).id)
  }, [gameMode, clubHandle, setup, players, goToGame, showLocalFeedback, confirmAction, isTerminal])

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

  // Keep the menu's dispatch current (read via the stable actionsRef by the menu
  // items above). Separate from the menu effect so those handlers' changing
  // identity doesn't rebuild the menu each time.
  useEffect(() => {
    actionsRef.current = {
      endGame,
      concede,
      restart,
      newGame: () => void handleNewGame(),
    }
  }, [endGame, concede, restart, handleNewGame])

  if (loading) return <p className={styles.loading}>Loading game…</p>
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
  // The winner's member row for the terminal identity dot: a human from the
  // common roster, or — when `winner_seat` names an AI seat — the synthetic
  // "AI n" member. Undefined on a tie / all-conceded / coop, where nobody is named.
  const winnerSeat = status?.winner_seat as number | null | undefined
  const winnerMember =
    players.find((m: Member) => m.user_id === (status?.winner_user_id as string | undefined)) ??
    (winnerSeat != null ? aiMemberOfSeat(winnerSeat) : undefined)
  const over = isTerminal
    ? buildOver({
        game,
        playState,
        status,
        selfId: session.user.id,
        nameOf,
        winnerMember,
      })
    : null
  // The player whose turn it is (compete) — for the "Turn: ● name" state line.
  // A human (by currentUserId) or, when it's an AI seat's turn, the synthetic
  // "AI n" member.
  const currentMember =
    players.find((m: Member) => m.user_id === game.currentUserId) ?? aiMemberOfSeat(game.currentSeat)

  // The commit-slot pill: the terminal verdict (permanent fill) takes precedence,
  // else the sticky own-move result (transient outline), else nothing (the commit
  // buttons show). Passed down to BoardCol, which renders it in the Controls.
  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId` is
  // null in a free-for-all game, so this is false there. (Compete is ALWAYS
  // turn-based, but its status line already names the current player, so the
  // pill would be redundant — hence the coop-only pointer, which compete leaves
  // null.) The pill lands where the commit buttons would be: they're useless on a
  // teammate's turn, so swapping them for the reason is exactly right.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal
  // Locally terminal (compete: I conceded while the others play on). Mutually
  // exclusive with `waiting` — that pointer is coop-only here — but ordered first
  // to match the other games' chains. The InfoCol's LocalTerminalRow carries the
  // terse half of this; dual placement is the rule (docs/playarea.md), and on a
  // phone the InfoCol is off-canvas, making this the ONLY copy the player sees.
  const isLocallyDone = isCompete && myConceded && !isTerminal
  const localPill: GenericFeedbackMsg | null = over
    ? // `verdict` (or its `verdictNode` widget, when the winner is named) — the
      // pill's own string, distinct from the info column's shorter `message`.
      terminalPill(over.tone, over.verdictNode ?? over.verdict)
    : isLocallyDone
      ? outOfRacePill(true)
      : waiting
        ? waitingTurnPill(players.find((m: Member) => m.user_id === currentTurnUserId))
        : localFeedback

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        mobileStatus={
          <StateLine
            isCompete={isCompete}
            myTurn={myTurn}
            currentMember={currentMember}
            teamScore={game.teamScore}
            bagCount={game.bagCount}
          />
        }
        game={game}
        gameId={gameId}
        self={self}
        myTurn={myTurn}
        isTerminal={isTerminal}
        myConceded={myConceded}
        showLocalFeedback={showLocalFeedback}
        clearLocalFeedback={clearLocalFeedback}
        localPill={localPill}
        plays={plays}
        viewTarget={viewTarget}
        viewing={viewing}
        viewTargetRef={viewTargetRef}
        onExitViewing={exitViewing}
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
          myTurn={myTurn}
          over={over}
          myConceded={myConceded}
          isTerminal={isTerminal}
          currentTurnUserId={currentTurnUserId}
          currentMember={currentMember}
          teamScore={game.teamScore}
          bagCount={game.bagCount}
          players={players}
          selfId={session.user.id}
          playerStates={playerStates}
          concededIds={concededIds}
          onEndGame={endGame}
          onConcede={concede}
          onRestart={restart}
          onNewGame={handleNewGame}
        startingNewGame={startingNewGame}
          onBackToClub={goToClub}
          suggest={isCompete ? null : suggestView}
          canSuggest={!isTerminal && !!self}
          onSuggest={() => void handleSuggest()}
          onApplySuggestion={handleApplySuggestion}
          setup={scrabbleSetup}
          aiSeats={aiRoster}
          aiMemberOfSeat={aiMemberOfSeat}
          plays={plays}
          viewingSeq={viewingSeq}
          onSelectTurn={(seq: number) => select({ kind: 'turn', seq })}
        />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the commit-slot pill + the info-column outcome line. Only a COMPETE
          win celebrates — coop has no win to celebrate (see useCelebration above). */}
      {celebration.show && (
        <CelebrationDialog title="You win! 🎉" onClose={celebration.close} />
      )}
      {confirmDialog}
    </div>
  )
}

/** One opponent move as a terse peer-news line for the global header. */
function peerMoveText(name: string, p: PlayRow): string {
  if (p.kind === 'word') {
    const w = (p.words ?? [])[0]?.toUpperCase() ?? ''
    return `${name} played ${w} (+${p.score ?? 0})`
  }
  if (p.kind === 'exchange') return `${name} exchanged ${p.tile_count} tiles`
  if (p.kind === 'pass') return `${name} passed`
  return `${name} ended the game`
}

/** SPIKE: format one play for the print moves table (mirrors BoardCol's turnSummary). */
function moveText(p: PlayRow): string {
  if (p.kind === 'word') {
    const words = (p.words ?? []).map((w) => w.toUpperCase()).join(', ')
    return `+${p.score ?? 0} ${words}`
  }
  if (p.kind === 'exchange') return `exchanged ${p.tile_count} tiles`
  if (p.kind === 'pass') return 'passed'
  return `ended — ${-(p.score ?? 0)} tiles unplayed` // forfeit
}

/**
 * Terminal copy, mode- and self-aware.
 *
 *   - `verdict` (+ the `verdictNode` widget when the winner is NAMED) drives the
 *     permanent pill in the commit slot. ONE OR TWO WORDS — far terser than the
 *     other games' verdicts, because scrabble's slot is not a full below-board
 *     row: it's the sub-area that swaps in for the commit buttons, with the rack
 *     still beside it, and on a phone the rack + controls have already wrapped to
 *     two rows. No score in it either — the mobile status bar above the board
 *     carries the live number, so repeating it here spends the width twice.
 *   - `message` (+ `tone`) drives the bold info-column outcome line. Deliberately
 *     UNCHANGED by the end-states sweep — the two surfaces carry two lengths.
 *
 * COOP has no win — one shared rack, no opponent — so its three endings are all
 * neutral, and they're distinguished rather than collapsed: `Completed:` for
 * playing the board out, `Ended: time` for the clock, plain `Ended:` for a manual
 * stop. COMPETE names who won, which is the one case the pill wants a WIDGET (the
 * winner's identity dot, the way peer feedback names people elsewhere).
 */
function buildOver({
  game,
  playState,
  status,
  selfId,
  nameOf,
  winnerMember,
}: {
  game: { mode: 'coop' | 'compete'; teamScore: number | null }
  playState: string
  status: Record<string, unknown> | null
  selfId: string
  nameOf: (id: string | null) => string
  /** The winner's member row (a human from the roster, or the synthetic "AI n"),
   *  for the identity dot. Undefined on a tie / all-conceded / coop. */
  winnerMember: Member | undefined
}): {
  verdict: string
  verdictNode?: ReactNode
  message: string
  tone: 'won' | 'lost' | 'neutral'
} {
  const outcome = (status?.outcome as string | undefined) ?? ''
  if (game.mode === 'coop') {
    const score = game.teamScore ?? 0
    if (outcome === 'manual') return { verdict: 'Ended', message: `${score} pts`, tone: 'neutral' }
    // The clock is the ONE way a coop table loses: it failed to finish in time,
    // which is how every other game on the roster reads a timeout (the server
    // agrees — scrabble._finish writes play_state 'lost' for it alone).
    if (outcome === 'timeout') {
      return { verdict: 'Lost: out of time', message: `${score} pts`, tone: 'lost' }
    }
    // Played all the way out (coop's only automatic ending — the blocked end
    // needs passes, and coop has no turns to pass). Not a WIN (coop has no
    // opponent), but a real completion, worth distinguishing from "it just
    // stopped".
    return { verdict: 'Completed', message: `${score} pts`, tone: 'won' }
  }
  if (playState === 'ended') return { verdict: 'Ended', message: 'Ended', tone: 'neutral' }
  // Everyone conceded (play_state 'lost_compete', outcome 'conceded'): a collective
  // loss with no eligible winner. Must precede the winner logic below, which
  // would otherwise fall through to the phantom co-winners tie on null winner.
  if (outcome === 'conceded') return { verdict: 'All conceded', message: 'All conceded', tone: 'lost' }
  const winner = status?.winner_user_id as string | null | undefined
  if (winner === selfId) return { verdict: 'You won', message: 'You won!', tone: 'won' }
  const named = (name: string) => ({
    verdict: `${name} won`,
    verdictNode: (
      <>
        <ActorDot actor={winnerMember} fallback="Someone" show="both" /> won
      </>
    ),
    message: `${name} won`,
    tone: 'lost' as const,
  })
  if (winner) return named(nameOf(winner))
  // An AI winner: `status.winner_user_id` is null, but `winner_seat` names the seat and
  // `winner_username` carries its "AI n" label (from scrabble._finish).
  const winnerSeat = status?.winner_seat as number | null | undefined
  if (winnerSeat != null) return named((status?.winner_username as string | undefined) ?? 'The AI')
  return { verdict: 'Tie', message: 'Tie', tone: 'neutral' }
}
