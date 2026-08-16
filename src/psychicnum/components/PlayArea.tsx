import { faultMessage } from '../../common/lib/game/serverError'
import { callRpc } from '../../common/lib/game/callRpc'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconHideSolution, IconHint, IconNewGame, IconPrint, IconRestart, IconReveal, IconSpoiler } from '../../common/components/icons'
import { cls } from '../../common/lib/util/cls'
import type { GamePageCtx } from '../../common/lib/games'
import type { PsychicnumSetup } from '../lib/setup'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { useSolutionReveal } from '../../common/hooks/game/useSolutionReveal'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { setupRows } from '../lib/setupSummary'
import { memberById } from '../../common/lib/game/peers'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { printPsychicnumPdf } from '../pdf/printPsychicnumPdf'
import { buildPsychicnumPrintModel } from '../pdf/model'
import { turnSnapshot } from '../lib/history'
import { waitingTurnPill } from '../../common/components/game/turnCopy'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { StateLine } from './StateLine'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // psychicnum-specific tokens (empty today, see file)

/** The computer hides this many secret words; players win by finding all. */
const SECRET_COUNT = 3

/**
 * psychicnum's play surface, shared between coop and compete
 * manifests. The mode is read from `game.mode` (set at create-
 * game time and never changes); rendering branches on it for:
 *
 *   - Header copy + progress: coop shows the team's "found X of 3";
 *     compete shows the caller's own progress + opponents' budgets.
 *   - GameTurnLog: coop shows everyone's guesses (and hints);
 *     compete is RLS-scoped to the caller.
 *   - Feedback: coop narrates teammates' guesses (green/red) and
 *     hint requests (amber) in the header; compete narrates an
 *     opponent finding a secret in GREEN — never which one. Green
 *     means "they found a word" in BOTH modes, so the player keeps
 *     one color-meaning rather than learning a compete-only one.
 *   - Terminal copy: coop is a team verdict; compete distinguishes
 *     "you won the race" vs "<name> won".
 *
 * Cross-cutting state (members, timer, play_state, paused, chat)
 * lives in `<GamePage>` above this component. PlayArea unmounts
 * on pause — its local state goes with it.
 */
export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  timer,
  isMyTurn,
  currentTurnUserId,
  setup,
  status,
  globalFeedback,
  goToClub,
  clubHandle,
  goToGame,
  menu,
  brand,
  title,
}: GamePageCtx) {
  const { game, players: playerBudgets, guesses, loading } = useGame(gameId)
  const mode = game?.mode

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // opened from the hook's "Game info" menu item. Desktop is unchanged.
  const infoSheet = useInfoSheet()

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  // ─── Coop-win celebration ──────────────────────────────
  // Confetti at the MOMENT the team finds the third secret (the winning guess
  // flips playState to 'won' on every connected client via realtime, so the
  // whole group celebrates together); opening an already-won game stays quiet
  // (useCelebration never pops on mount). It's the ONLY modal at terminal — the
  // verdict itself rides the below-board pill (docs/ui.md → Terminal results).
  //
  // Gated on `playState` ALONE, which is available from the very first render —
  // the waffle loading-race lesson. That's also why COMPETE doesn't celebrate:
  // 'won_compete' means SOMEONE won, and telling my own win from a loss needs
  // per-player data from useGame that's empty until the fetch lands, so an
  // already-won race would flip false→true after load and pop confetti at
  // someone merely reviewing it. Same call connections + wordle + waffle made.
  const celebration = useCelebration(playState === 'won')

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array (docs/pdf.md →
  // Setup rows). Literally the same object, which beats "both call the same
  // function": this is the game whose two hand-written lists had drifted into
  // reporting different facts on paper than on screen.
  const summaryRows = useMemo(
    () => setupRows(setup as unknown as PsychicnumSetup, mode ?? 'coop', players),
    [setup, mode, players],
  )

  // I dropped out of a compete race (a real loss; the others keep racing). Read
  // from the common roster (prop `players`, always present) so it's available
  // here — above the early returns — for the game-menu effect. (The board/strip
  // recompute it below where the other conceded-set derivations live.)
  const myConceded = players.find((p) => p.user_id === session.user.id)?.conceded ?? false

  // My remaining guesses, and from it the "can I still act?" gate. Both live up
  // here — above the early returns — for the same reason `myConceded` does: the
  // game-menu effect below needs them to grey the Hint / Spoiler rows in step
  // with the InfoCol buttons they name. `playerBudgets` is [] until the fetch
  // lands, so a pre-load menu reads "no guesses left" and the pair is greyed;
  // the row still shows its glyph, which is the point of it being there.
  const selfBudget =
    playerBudgets.find((p) => p.user_id === session.user.id)
      ?.guesses_remaining ?? 0
  // Did I find all three? (Same row, read up here because the reveal below
  // needs it — `playerBudgets` is [] until the fetch lands, which is exactly
  // why the reveal derives rather than initialises from it.)
  const iFoundThemAll =
    (playerBudgets.find((p) => p.user_id === session.user.id)?.found_secrets_count ?? 0)
    >= SECRET_COUNT
  // Am I a live PARTICIPANT (not out of budget, not conceded, game not over)?
  // This drives the terminal-vs-play LOOK in both columns. It deliberately does
  // NOT fold in turn-order: a player who's merely waiting their turn isn't
  // "done", so they must not get the locally-terminal "out of guesses" look.
  // Turn-order gates the actual input separately (`isMyTurn`, passed to BoardCol).
  const canGuess = !isTerminal && selfBudget > 0 && !myConceded

  // The Hint / Spoiler in-flight flags (their buttons live in InfoCol, their
  // menu twins in the game menu; the RPCs stay here in the coordinator). Also up
  // here so the menu effect can read them — the guess input + the board shuffle
  // moved into BoardCol.
  const [hinting, setHinting] = useState(false)
  const [spoiling, setSpoiling] = useState(false)

  // The End / Concede action handlers, held in a stable ref so the game-menu
  // effect's onClick closures can call them without depending on the concrete
  // handlers (whose closures change each render). Populated by the effect just
  // below `useGlobalKeyHandler`, like the crosswords `actionsRef` pattern.
  const actionsRef = useRef<{
    end: () => void
    concede: () => void
    restart: () => void
    newGame: () => void
    reveal: () => void
    hint: () => void
    spoiler: () => void
  } | null>(null)

  // ─── Terminal secrets reveal ─────────────────────────────────────
  // The three secrets are NOT ringed just because the game ended:
  // `replay_board` hunts the SAME board and the SAME three secrets again (see
  // its RPC comment), so auto-revealing on a loss would leave Restart with
  // nothing to find.
  //
  // The ask is LOCAL and reversible (useSolutionReveal): mine alone, so a
  // teammate can go on eyeing the board for the three while I look, and the
  // same control un-rings them. The secrets themselves are on every client once
  // the game is terminal, so this is purely which tiles get rung.
  //
  // `impliedBy: iFoundThemAll` is the exception: finding all three IS the win
  // here, and a found secret's tile is already green — so a solver is looking
  // at the answer key and the rings add nothing to it. MY three, not the
  // game's verdict: compete's loser found fewer.
  const {
    revealed: secretsShown,
    toggle: toggleSecrets,
    reset: resetSecrets,
    impliedBySolve,
  } = useSolutionReveal({ impliedBy: iFoundThemAll })
  // The FULL psychicnum game menu (Help + Print + End/Concede + Back to club).
  // `buildGameMenu` supplies the framing; `extra` is our one Print item. Print
  // builds its model from the live state (RLS already scoped `guesses`/`results`
  // to what I may see) and hands it to the jsPDF renderer — a snapshot at click
  // time, so it works mid-game or at the end. End/Concede dispatch through the
  // stable `actionsRef` so this effect needn't depend on the later handlers.
  useEffect(() => {
    if (!game) return
    // The board/turn/score judgment (whose marks belong on whose board — one
    // merged track in coop, one PER PLAYER at compete terminal) lives in the
    // pure builder; see pdf/model.ts.
    const model = buildPsychicnumPrintModel({
      brand,
      gameTitle: title,
      date: new Date().toLocaleDateString(),
      mode: mode ?? 'coop',
      isTerminal,
      words: game.words,
      guesses,
      players,
      selfId: session.user.id,
      setup: summaryRows,
    })
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: mode ?? 'coop',
        isTerminal,
        conceded: myConceded,
        onEndGame: () => actionsRef.current?.end(),
        onConcede: () => actionsRef.current?.concede(),
        extra: [
          // The menu twins of the info column's two help buttons. The row is
          // what NAMES those glyphs (docs/ui.md → the menu is the legend), so
          // it's greyed rather than dropped when you can't ask: a disabled row
          // still teaches the lightbulb and the bare eye.
          {
            items: [
              { id: 'hint', icon: IconHint, label: 'Hint', disabled: !canGuess || hinting, onClick: () => actionsRef.current?.hint() },
              { id: 'spoiler', icon: IconSpoiler, label: 'Spoiler', disabled: !canGuess || spoiling, onClick: () => actionsRef.current?.spoiler() },
            ],
          },
          // Mobile-only "Game info" item (off-canvas info column); empty on desktop.
          { items: [{ id: 'print', icon: IconPrint, label: 'Print board (PDF)', onClick: () => printPsychicnumPdf(model) }] },
          {
            items: [
              // The same pair the terminal action row offers, reachable mid-game too.
              { id: 'restart', icon: IconRestart, label: 'Restart', onClick: () => actionsRef.current?.restart() },
              { id: 'new-game', icon: IconNewGame, label: 'New game', shortcut: '+', onClick: () => actionsRef.current?.newGame() },
              // The menu twin of the terminal row's boxed-eye button — the same
              // local toggle, so a player who's scrolled past the row can still
              // reach it. Inert mid-game: there's nothing to ring until the
              // server unshields the secrets at terminal.
              {
                id: 'reveal',
                // The same two faces as the terminal row's button — one toggle.
                // The View glyph, not EyeOff, once solving put it there — see
                // RevealButton for why the inert face keeps the plain eye.
                icon: secretsShown && !impliedBySolve ? IconHideSolution : IconReveal,
                label: impliedBySolve
                  ? 'Solution already shown'
                  : secretsShown
                    ? 'Hide secrets'
                    : 'Reveal secrets',
                disabled: !isTerminal || impliedBySolve,
                onClick: () => actionsRef.current?.reveal(),
              },
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, mode, isTerminal, myConceded, secretsShown, impliedBySolve, canGuess, hinting, spoiling, game, guesses, players, brand, title, setup, summaryRows, session.user.id])

  // Per-opponent secrets-found count we've already announced (compete tension).
  const seenOpponentFoundRef = useRef<Map<string, number>>(new Map())

  // ─── Local feedback (own-action) — the coordinator owns the channel ────
  // The below-board own-move pill ("Correct"/"Incorrect", a validation error) is the
  // LOCAL half of the feedback split (peer/turn-state news → the header pill). It
  // lives HERE because BOTH columns write it: BoardCol's guess dispatch AND InfoCol's
  // Hint / Reveal / End / Concede. STICKY, dismissed by the next move (a keystroke /
  // tile click routed through BoardCol's `clearLocalFeedback`). PlayArea passes
  // `localFeedback` + `showLocalFeedback` / `clearLocalFeedback` down to BoardCol.
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })

  // ─── Coop peer events (group feedback) ─────────────────
  // A teammate's guess (green correct / red not) or hint request (amber) is
  // Hint (a clue) and spoiler (the answer word itself) both land in the turn log
  // via realtime; coop teammates get a header pill. Nothing to do with the
  // return value here — the helper rows arrive over the subscription. The RPC
  // keeps its `request_reveal` name; only the FE vocabulary moved, so that "reveal"
  // on this page means the whole solution at game-over.
  //
  // Both are useCallbacks up here (not plain functions below the early returns)
  // so the actionsRef effect can list them — the InfoCol buttons and their menu
  // twins then share ONE pair of handlers, the way End / Concede already do.
  const getHint = useCallback(async () => {
    setHinting(true)
    const bad = await callRpc(db, 'request_hint', { target_game: gameId })
    setHinting(false)
    if (bad) showLocalFeedback(bad)
  }, [gameId, showLocalFeedback])

  const getSpoiler = useCallback(async () => {
    setSpoiling(true)
    const bad = await callRpc(db, 'request_reveal', { target_game: gameId })
    setSpoiling(false)
    if (bad) showLocalFeedback(bad)
  }, [gameId, showLocalFeedback])

  // narrated in the header. My own events are excluded — my guesses get the
  // local flash, my hint shows in my own turn log. Compete never reaches here:
  // RLS scopes both guesses AND hints to the caller, and we gate on coop.
  // globalFeedback.show is a prop callback, so no local set-state lives in here.
  // The shared seen-set hook narrates EVERY new peer event (the old hand-rolled
  // version only looked at the latest row, dropping any that batched between
  // refetches). keyOf is the guess id; own events return null (mine → local).
  useGlobalFeedback({
    enabled: mode === 'coop',
    items: guesses,
    keyOf: (g) => g.id,
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → local
      const member = memberById(players, g.user_id)
      // Helper actions (hint / reveal) → amber: important, but neither good nor
      // bad. (A reveal logs the answer word, but we narrate it without naming
      // the word — "revealed a word", not which one.)
      if (g.kind === 'hint' || g.kind === 'reveal') {
        return {
          tone: 'warning',
          text: (
            <>
              <ActorDot actor={member} fallback="Someone" />{' '}
              {g.kind === 'hint' ? 'got hint' : 'revealed word'}
            </>
          ),
          mode: { kind: 'timed' },
        }
      }
      return {
        tone: g.is_correct ? 'success' : 'error',
        // "Correct: WORD" / "Wrong: WORD" — the label carries the outcome (with
        // the tone), leaving the header pill's ~26 phone characters for the word
        // itself rather than a sentence around it.
        text: (
          <>
            <ActorDot actor={member} fallback="Someone" />{' '}
            {g.is_correct ? 'Correct: ' : 'Wrong: '}
            {g.word.toUpperCase()}
          </>
        ),
        mode: { kind: 'timed' },
      }
    },
    globalFeedback,
  })

  // ─── Compete opponent progress (group feedback) ────────
  // When an opponent's public found_secrets_count count ticks up, narrate "X guessed a
  // secret word" — the COUNT, never which word (that stays private). GREEN
  // (success), the SAME tone coop uses for a peer's correct guess: green means
  // "they found a word" in both modes, so the player doesn't maintain a
  // compete-only color-meaning. Watches the players rows; the ref seeds silently
  // on first load so history isn't replayed.
  useEffect(function announceOpponentProgress() {
    if (mode !== 'compete') return
    for (const p of playerBudgets) {
      if (p.user_id === session.user.id) continue
      const prev = seenOpponentFoundRef.current.get(p.user_id)
      seenOpponentFoundRef.current.set(p.user_id, p.found_secrets_count)
      if (prev === undefined) continue  // first sighting — seed, don't announce
      if (p.found_secrets_count <= prev) continue
      const member = memberById(players, p.user_id)
      globalFeedback.show({
        tone: 'success',
        text: (
          <>
            <ActorDot actor={member} fallback="Someone" /> guessed a word
          </>
        ),
        mode: { kind: 'timed' },
      })
    }
  }, [playerBudgets, mode, players, session.user.id, globalFeedback])

  // ─── Turn-history viewer ───────────────────────────────
  // Click a turn-log #N to replay that turn's board (the tiles decided up to that
  // turn, with that turn's guessed tile ringed history-yellow). Keyed by log
  // position (guesses have no per-turn ordinal). Exit is intrinsic to the hook (a
  // click anywhere / the banner ✕); a keystroke also exits — the entry's capture is
  // frozen while viewing (see `disabled` below), so exitOnKey has the keys to itself.
  const { viewing, viewingId, select: selectTurn, exitViewing, exitOnKey } =
    useHistoryViewer<number>()
  useGlobalKeyHandler(exitOnKey)

  // Keep the End / Concede handlers current in the stable ref the game-menu
  // effect's onClick closures read (so that effect needn't depend on these,
  // and so it lives above the early returns without a Rules-of-Hooks snag).
  // The menu (⌥⌫ + the End/Concede item) and InfoCol's buttons share ONE pair
  // of handlers — hoisted above the early returns as useCallbacks so the ref
  // can list them in its deps. (The crosswords `actionsRef` pattern.)
  //
  // End / Concede / Replay come from the shared `useStandardGameActions`;
  // psychicnum's own bits are the replay sentence and the post-replay cleanup
  // (leave the turn-history view, clear the pill).
  //
  // (No reveal-flag reset here: `common.reset_game` clears solution_revealed
  //  server-side, so the same three secrets are hunted blind again.)
  const onRestarted = useCallback(() => {
    exitViewing()
    clearLocalFeedback()
    // The same board and the same three secrets, hunted again — so un-ring
    // them. Nothing on the server remembers the reveal any more, which is
    // exactly why this is spelled out.
    resetSecrets()
  }, [exitViewing, clearLocalFeedback, resetSecrets])
  const { endGame, concede, restart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    showError: showLocalFeedback,
    onRestarted,
  })

  // New game — a FRESH game (new id, a new random board + secrets) with THIS
  // game's setup + roster + mode, in the same club. psychicnum's create_game
  // samples its board inline, so this is a direct RPC — no edge function.
  // Non-destructive (common.create_game un-currents this game into the club
  // list), so no confirm; the creator jumps in via ctx.goToGame, peers arrive
  // via the game-invitation toast.
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    if (!mode) return // menu exists pre-load, but there's no mode to copy yet
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: setup as unknown as PsychicnumSetup,
        player_user_ids: players.map((p) => p.user_id),
        mode,
      })
      .single()
    if (error || !data) {
      // New game is a FAULT SURFACE (serverError.ts → faultMessage): this setup
      // already built a game once, so any failure here is a bug or an outage
      // — never a pill. Copy supplies the words when it has them.
      showLocalFeedback(faultMessage(error, 'new game'))
      return
    }
    goToGame(`psychicnum_${mode}`, (data as { id: string }).id)
  }, [mode, clubHandle, setup, players, goToGame, showLocalFeedback, confirmAction, isTerminal])

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
      end: endGame,
      concede,
      restart,
      newGame: () => void handleNewGame(),
      reveal: toggleSecrets,
      hint: () => void getHint(),
      spoiler: () => void getSpoiler(),
    }
  }, [endGame, concede, restart, handleNewGame, toggleSecrets, getHint, getSpoiler])

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const selfSecretsFound =
    playerBudgets.find((p) => p.user_id === session.user.id)?.found_secrets_count ?? 0

  // Concede lives on the common roster (ctx `players` = GamePlayer[]), NOT on
  // psychicnum.players (the budget rows). `myConceded` is derived above (the menu
  // effect needs it before the early returns). `concededIds` marks the players
  // who've bowed out, for the opponent strip's "out" cell.
  const concededIds = new Set(players.filter((p) => p.conceded).map((p) => p.user_id))

  // Per-status modal + indicator copy. Mode-aware so compete-mode
  // winners get the "you won the race" vs "Bea won the race"
  // distinction, while coop stays the simple team verdict. In compete the
  // winner is the one who completed the set (their found_secrets_count hit 3).
  const winnerName = (status?.winner_username as string | undefined) ?? 'Someone'
  const over = isTerminal ? buildOver({
    mode: game.mode,
    playState,
    timerExpired: timer.expired,
    selfWon: game.mode === 'compete' ? selfSecretsFound >= SECRET_COUNT : true,
    winnerName,
  }) : null

  // Guessed words → was-it-a-secret, for the board's permanent green/red.
  // Hint rows are excluded (a hint reveals but doesn't mark a tile). In compete
  // RLS scopes `guesses` to the caller, so this is the viewer's own board.
  const results = new Map(
    guesses.filter((g) => g.kind === 'guess').map((g) => [g.word, g.is_correct]),
  )

  // Turn-history: when a past turn is open, `snap` is that turn's board (else null =
  // live) — the tiles decided up to that turn + the tile it decided (ringed). Stable:
  // a later realtime guess only grows the log past viewingId, so a past turn holds.
  const snap = viewingId !== null ? turnSnapshot(guesses, viewingId) : null

  // Progress toward the 3 secrets. Coop = the team's distinct finds (everyone's
  // correct guesses are visible); compete = the caller's own count.
  const teamFound = new Set(
    guesses.filter((g) => g.kind === 'guess' && g.is_correct).map((g) => g.word),
  ).size
  const found = game.mode === 'coop' ? teamFound : selfSecretsFound

  // ─── Info-column readouts (setup choices + live state) ──
  const psychicnumSetup = setup as PsychicnumSetup
  const totalGuesses = psychicnumSetup.guesses
  const guessesUsed = totalGuesses - selfBudget

  // (canGuess, and the Hint / Spoiler handlers behind it, are hoisted above the
  // early returns so the game menu can name and grey them in step with the
  // InfoCol buttons — see the actionsRef block.)

  // (endGame / handleConcede are hoisted above the early returns — see the
  // actionsRef block — so the menu, ⌥⌫, and InfoCol's buttons share one pair.)

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId` is
  // null in a free-for-all game, so this is false there — the pill's presence is
  // fixed for the game's life, no reflow. It carries the whose-turn answer on
  // MOBILE, where the InfoCol's TurnStatusLine is off-canvas in the InfoSheet;
  // without it a frozen board just ignored taps with no explanation.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal
  const boardPill = waiting
    ? waitingTurnPill(players.find((p) => p.user_id === currentTurnUserId))
    : localFeedback

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Mobile-only status strip (the SAME StateLine the InfoCol renders;
        //    on a phone the info column is off-canvas in the InfoSheet) ──
        mobileStatus={
          <StateLine
            found={found}
            secretCount={SECRET_COUNT}
            guessesUsed={guessesUsed}
            totalGuesses={totalGuesses}
          />
        }
        // ── Board to render (live OR the historical snapshot — picked here) ──
        words={game.words}
        results={snap ? snap.results : results}
        highlightWord={snap?.highlightWord ?? null}
        // ── History viewer ──
        viewing={viewing}
        viewingDescription={snap?.description ?? null}
        onExitViewing={exitViewing}
        // ── Guess dispatch (BoardCol owns submit_guess) ──
        gameId={gameId}
        canGuess={canGuess}
        // Turn-order: gates the ENTRY input only (not the play-vs-terminal look
        // above). Always true for free-for-all / solo. When false the waiting
        // pill takes the entry slot (EntryRow's designed swap — same height), so
        // the frozen input explains itself instead of silently ignoring taps.
        isMyTurn={isMyTurn}
        showLocalFeedback={showLocalFeedback}
        clearLocalFeedback={clearLocalFeedback}
        localPill={boardPill}
        // ── Below-board slot content ──
        over={over}
        secrets={secretsShown ? game.secrets : null}
        myConceded={myConceded}
      />
      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
        // ── Mode + phase ──
        isCompete={game.mode === 'compete'}
        over={over}
        canGuess={canGuess}
        myConceded={myConceded}
        // ── Turn-order (null for free-for-all games → no TurnStatusLine) ──
        currentTurnUserId={currentTurnUserId}
        // ── State readout ──
        found={found}
        secretCount={SECRET_COUNT}
        guessesUsed={guessesUsed}
        totalGuesses={totalGuesses}
        // ── Players (OpponentStrip, compete) ──
        players={players}
        selfId={session.user.id}
        playerBudgets={playerBudgets}
        concededIds={concededIds}
        // ── Action row ──
        onHint={() => void getHint()}
        hinting={hinting}
        onSpoiler={() => void getSpoiler()}
        spoiling={spoiling}
        onReveal={toggleSecrets}
        secretsShown={secretsShown}
        secretsAlreadyShown={impliedBySolve}
        onEndGame={endGame}
        onConcede={concede}
        onRestart={restart}
        onNewGame={handleNewGame}
        startingNewGame={startingNewGame}
        onBackToClub={goToClub}
        // ── Setup disclosure ──
        setupRows={summaryRows}
        // ── Turn-history log ──
        guesses={guesses}
        isTerminal={isTerminal}
        viewingIndex={viewingId}
        onSelectTurn={selectTurn}
        />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board pill + the info-column outcome line, and a
          coop win gets the celebration instead — once, when it happens. */}
      {celebration.show && (
        <CelebrationDialog
          title="You win! 🎉"
          body="All three secret words found."
          onClose={celebration.close}
        />
      )}
      {confirmDialog}
    </div>
  )
}

/**
 * Per-status terminal copy. `verdict` + `tone` drive the permanent below-board
 * pill; `message` + `tone` drive the short, bold, color-coded line in the info
 * column (won = green, lost = red, manual end = neutral).
 *
 * Verdicts are terse and unpunctuated ("Lost: out of guesses"), the shared
 * sweep vocabulary — the pill is a fixed-height, ellipsising row that has to fit
 * a phone (docs/mobile.md → feedback copy). The pill only became free to carry
 * them when the secret reveal moved onto the BOARD (ringed tiles); before that it
 * spent its width listing "The words were APPLE, RIVER, STONE".
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
  winnerName,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  /** Compete: did the caller complete the set? (Coop verdicts ignore it.) */
  selfWon: boolean
  /** Compete: the winner's frozen username (for the "X won" message). */
  winnerName: string
}): TerminalCopy {
  // Manual end ('ended', written by psychicnum.end_game) is the uniform neutral
  // terminal shared with the other games — the shared endedCopy() owns it.
  if (playState === 'ended') return endedCopy(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { verdict: 'Won: all found', message: 'You won!', tone: 'won' }
    }
    return {
      verdict: timerExpired ? 'Lost: out of time' : 'Lost: out of guesses',
      message: timerExpired ? 'Timer elapsed' : 'Out of guesses',
      tone: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { verdict: 'Won: the race', message: 'You won!', tone: 'won' }
      : { verdict: 'Beaten to the punch', message: `${winnerName} won`, tone: 'lost' }
  }
  // lost_compete (all exhausted OR timeout in compete)
  return {
    verdict: timerExpired ? 'Out of time — no winner' : 'Out of guesses — no winner',
    message: timerExpired ? 'Timer elapsed' : 'Out of guesses',
    tone: 'lost',
  }
}
