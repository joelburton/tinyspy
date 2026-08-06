import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import type {
  GenericFeedbackMsg,
  GenericFeedbackTone,
  GamePageCtx,
  Member,
} from '../../common/lib/games'
import { useSwallowTab } from '../../common/hooks/input/useSwallowTab'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { buildStackdownPrintModel } from '../pdf/model'
import { printStackdownPdf } from '../pdf/printStackdownPdf'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { terminalPill, outOfRacePill } from '../../common/lib/game/localPills'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { db } from '../db'
import { db as commonDb } from '../../common/db'
import { turnSnapshot } from '../lib/history'
import type { StackdownSetup } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import { type WordFlash } from './WordEntry'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/** Empty highlight set — while live, the board rings no tiles green (turn-viewer only). */
const NO_TILES: ReadonlySet<number> = new Set()

/**
 * stackdown's play surface, shared by the coop and compete manifests, on the
 * shared two-column scaffold (docs/playarea.md → PlayArea layout).
 * PlayArea is the **coordinator**: it holds the game data (`useGame`), the server
 * mutations (submit / reveal / hint / end / concede RPCs), and the cross-column
 * coordination state (the turn-history `viewingIndex`, the local + word-slot
 * feedback), and wires two presentational columns:
 *
 *   - **`<BoardCol>`** — the stacked-tile board + the live input engine (tile
 *     clicks / keyboard word-building) + the below-board region. Takes the board to
 *     render (live OR a historical snapshot) + `readOnly`; emits the completed word
 *     up (`onSubmitWord`) and "back to live" (`onExitViewing`).
 *   - **`<InfoCol>`** — the state readout, OpponentStrip, action row, setup
 *     disclosure, terminal words reveal, and the GameTurnLog log. Emits named
 *     callbacks up (`onHint`/`onReveal`/`onEndGame`/`onConcede`/`onSelectTurn`).
 *
 * The load-bearing seam: BoardCol owns *editing*; PlayArea hands it *the board to
 * show*. That's what makes turn-history a drop-in (see docs/playarea-decomposition-plan.md).
 *
 * Clicking an exposed tile picks it onto the word; the fifth tile auto-submits via
 * `stackdown.submit_word`. Accepted words remove their tiles (the board updates via
 * the realtime refetch in useGame); invalid attempts are logged and their tiles
 * returned. The word being built is **private** to each player in both modes. Coop
 * renders the SHARED stack + log; compete renders the caller's own copy + an
 * OpponentStrip (first to clear all six wins). Mode is read from `game.mode`.
 */
/** Every stackdown board is exactly six words (docs/games/stackdown.md). The
 *  info column prints the same six; named here so the print model and the
 *  readout can't disagree. */
const SOLUTION_WORDS = 6

export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  solutionRevealed,
  timer,
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
  // Tab does nothing while the board has the keyboard — this play surface is
  // not a form, so native Tab would walk out to the header buttons and on into
  // the browser's URL bar, stranding the player. (The capture-entry games get
  // this from useCaptureKeys; see useSwallowTab.)
  useSwallowTab()
  const {
    game,
    players: playerStates,
    submissions,
    removedTileIds,
    currentWord,
    appendTile,
    retractTo,
    clearWord,
    commitWord,
    loading,
  } = useGame(gameId)
  const stackdownSetup = setup as unknown as StackdownSetup

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (docs/pdf.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(stackdownSetup, game?.mode ?? 'coop', players),
    [stackdownSetup, game, players],
  )
  const [submitting, setSubmitting] = useState(false)

  // ─── Turn-history viewer ──────────────────────────────────────
  // The shared coordination state (docs/playarea-decomposition-plan.md): which log
  // row is open on the board. Identified by the row's POSITION in the log, not its
  // seq (stackdown's seq is per-user — see lib/history). When set, PlayArea feeds
  // BoardCol that turn's historical snapshot + readOnly; BoardCol shows the yellow
  // frame + banner and freezes input, and any keystroke / board click / ✕ exits.
  const { viewingId: viewingIndex, viewing, select: setViewingIndex, exitViewing } =
    useHistoryViewer()

  // ─── Local own-move feedback (the below-board pill) ──────────────
  // The player's OWN move results — a rejected word, a keystroke that matched no
  // exposed tile (or too many), a reveal's answer, an RPC error — show as a centered
  // <GenericFeedbackPill> in BoardCol's below-board slot (docs/ui.md → Feedback pill:
  // local feedback area). Sticky: it persists until the player's NEXT action
  // dismisses it. Peer narration goes to the GLOBAL header instead (useGlobalFeedback).
  // This channel lives in PlayArea because it has triggers in BOTH columns (the
  // keyboard input engine in BoardCol; the reveal/hint cheats in InfoCol) plus the
  // terminal verdict — so the coordinator owns it and both columns write through it.
  const { localFeedback, showLocalFeedback: showMsg, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  // ─── Coop-win celebration ──────────────────────────────
  // Confetti at the MOMENT the team clears the stack — the sixth word flips
  // playState to 'won' on every connected client via the realtime refetch, so
  // the whole group celebrates together; opening an already-won game stays
  // quiet (useCelebration never pops on mount). Gated on playState ALONE:
  // it's coop-only by the states vocabulary (compete writes 'won_compete'),
  // and unlike anything from `useGame` it's correct from the very first render
  // (GamePage has already waited for the common.games row).
  const celebration = useCelebration(playState === 'won')

  const showLocalFeedback = useCallback(
    (text: string, tone: GenericFeedbackTone, dismiss: GenericFeedbackMsg['dismiss'] = { kind: 'sticky' }) =>
      showMsg({ tone, text, variant: 'outline', dismiss }),
    [showMsg],
  )

  // ─── Word-slot flash (the WordEntry green/red beat) ─────────────
  // A word flashes in the entry row for a beat, then clears — or sooner, when the
  // player starts a new word (BoardCol's tile click clears it). Two sources feed it:
  // the player's OWN just-accepted word (green "good move"), and — in coop — a
  // TEAMMATE's played word (green if valid, red if rejected), driven by
  // useGlobalFeedback. Because a teammate can trigger it, the state lives here and is
  // passed down to BoardCol (which renders it via WordEntry).
  const [flash, setFlash] = useState<WordFlash | null>(null)
  const flashWordTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showFlash = useCallback((letters: string[], tone: 'good' | 'bad') => {
    setFlash({ letters, tone })
    if (flashWordTimer.current) clearTimeout(flashWordTimer.current)
    flashWordTimer.current = setTimeout(() => {
      setFlash(null)
      flashWordTimer.current = null
    }, 1500)
  }, [])
  const clearFlash = useCallback(() => {
    if (flashWordTimer.current) clearTimeout(flashWordTimer.current)
    flashWordTimer.current = null
    setFlash(null)
  }, [])
  useEffect(
    () => () => {
      if (flashWordTimer.current) clearTimeout(flashWordTimer.current)
    },
    [],
  )
  // Coop: a teammate's played word → flash it green (valid) / red (invalid).
  const onPeerWord = useCallback(
    (letters: string[], valid: boolean) => showFlash(letters, valid ? 'good' : 'bad'),
    [showFlash],
  )

  // ─── Derived (null-safe; real values after the loading guard) ──
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = game?.mode === 'compete'
  const mySolved = self?.solved ?? false

  // Concede state (from the common roster, `players` — the GamePlayer list that
  // carries per-player concede flags). A conceder drops out of the compete race:
  // they can't play, they see the locally-terminal "You conceded" look, and they
  // read as "out" in every peer's OpponentStrip while the others race on. Coop
  // never concedes (it uses the neutral whole-table End), so these stay false.
  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  const canPlay =
    !!self && !isTerminal && !submitting && !(isCompete && mySolved) && !myConceded

  // Locally terminal (compete only): I conceded but the game continues for the
  // others. stackdown has no elimination, so conceding is the only path to it — it
  // drives a terminal LOOK (a status line + a disabled Concede) so the drop-out reads
  // loudly, without actually ending the game for anyone else.
  const isLocallyDone = isCompete && myConceded && !isTerminal

  // ─── Submit a completed (5-tile) word ─────────────────────────
  // Each player builds their own word locally (selections aren't shared), so whoever
  // lays the fifth tile submits their own word — there's no shared word to
  // double-submit. BoardCol emits the completed word here.
  const submit = useCallback(
    async (tileIds: number[]) => {
      setSubmitting(true)
      const { data, error } = await db.rpc('submit_word', {
        target_game: gameId,
        tile_ids: tileIds,
      })
      setSubmitting(false)
      if (error) {
        // Reachability/lock races (rare in friendly coop) land here.
        clearWord()
        showLocalFeedback(error.message, 'error')
        return
      }
      const res = data as { result: 'accepted' | 'invalid'; word: string }
      if (res.result === 'accepted') {
        // Empty the word and hold its tiles removed optimistically on THIS client so
        // the grid doesn't flash them back on before the valid submission lands via
        // realtime. Teammates just see the tiles leave once, on their own refetch.
        commitWord(tileIds)
        // Flash the just-spelled word green in the entry row (the ring is the
        // own-accepted signal; no pill needed).
        clearLocalFeedback()
        showFlash([...res.word.toUpperCase()], 'good')
      } else {
        clearWord() // invalid → the tiles return to the board
        showLocalFeedback(`Not a word: ${res.word.toUpperCase()}`, 'error')
      }
    },
    [gameId, clearWord, commitWord, showFlash, showLocalFeedback, clearLocalFeedback],
  )

  // ─── Spoiler: the next word (a CHEAT — see stackdown.reveal_next_word) ──
  // Hands over the next solution word the caller still has to clear. Used to verify
  // generated boards are solvable in order; may be removed once boards are trusted.
  // Named `spoilNext`, not `revealNext`: "reveal" on this page now means the WHOLE
  // solution at game-over (the red boxed-eye button below).
  // Surfaced in the LOCAL feedback slot (the player's own request) — closeable so it
  // lingers while they hunt for the tiles.
  const spoilNext = useCallback(async () => {
    const { data, error } = await db.rpc('reveal_next_word', { target_game: gameId })
    if (error) {
      showLocalFeedback(error.message, 'error')
      return
    }
    const word = data as string | null
    showLocalFeedback(
      word ? `Next word: ${word.toUpperCase()}` : 'All words cleared',
      'warning', // a spoiler is a "help, not good-or-bad" action — amber like the button
      { kind: 'closeable' },
    )
  }, [gameId, showLocalFeedback])


  // ─── Reveal hint (the next word's HINT — a nudge, not the word) ──
  // A softer reveal than "Reveal word": shows the curated hint for the next solution
  // word (common.words.hint, a clue that hides the word). The word never reaches the
  // client — reveal_next_hint returns only the hint text. Band-1 words all carry a
  // hint, but higher-band words (difficulty >= 2) may not be backfilled yet, so a
  // NULL return means "this word has no hint" — NOT "all cleared". (You can't request
  // a hint after clearing the last word: the sixth clear ends the game, and the RPC
  // rejects a non-playing game.) So a null is a gentle "no hint" note, not a reveal.
  const revealHint = useCallback(async () => {
    const { data, error } = await db.rpc('reveal_next_hint', { target_game: gameId })
    if (error) {
      showLocalFeedback(error.message, 'error')
      return
    }
    const hint = data as string | null
    showLocalFeedback(
      hint ? `Hint: ${hint}` : 'No hint for this word yet',
      'warning', // a hint is a "help, not good-or-bad" action — amber like the button
      { kind: 'closeable' },
    )
  }, [gameId, showLocalFeedback])

  // ─── Terminal solution reveal ────────────────────────────────────
  // The six words are NOT shown just because the game ended: `replay_board`
  // re-runs this very stack with the same solution (see its RPC comment), so
  // auto-revealing on a loss would make Restart theater — you'd be shuffling
  // tiles you already know the answer to.
  //
  // `solutionShown` is `common.games.solution_revealed`, straight off the row —
  // the ONE common answer to "may they see it?" (docs/ui.md → Terminal
  // results). end_game sets it on a win, reveal_solution on the ask, and
  // reset_game clears it, so Restart re-hides with nothing to remember here.
  // Being on the row also makes it SHARED: a peer's Reveal arrives on the same
  // realtime refetch and opens this client's board too.
  const solutionShown = solutionRevealed
  const revealSolution = useCallback(async () => {
    const { error } = await commonDb.rpc('reveal_solution', { target_game: gameId })
    if (error) showLocalFeedback(error.message, 'error')
  }, [gameId, showLocalFeedback])

  // ─── End / Concede / Replay — the shared trio ─────────────────
  // The byte-identical shared handlers (useStandardGameActions). End is coop's
  // neutral whole-table stop (confirmed through the styled modal); Concede is
  // compete's per-player drop-out; Replay restarts THIS stack — same tiles, same
  // solution, everything the players did wiped. stackdown's own bits are the
  // failure-pill format, the replay sentence, and the post-replay cleanup
  // (leave the turn-history view, clear the pill, re-hide a revealed solution).
  const showError = useCallback(
    (m: string) => showLocalFeedback(m, 'error'),
    [showLocalFeedback],
  )
  // (No reveal-flag reset here: `common.reset_game` clears solution_revealed
  //  server-side, so the new run starts blind on every client at once.)
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

  // New game — a FRESH game (new id, a newly claimed board) with THIS game's
  // setup + roster + mode, in the same club. stackdown's create_game claims a
  // random board from the pre-generated library, so this is a direct RPC — no
  // edge function — mirroring the manifest's startGameInClub. Non-destructive
  // (common.create_game un-currents this game into the club list), so no
  // confirm; the creator jumps in via ctx.goToGame, peers arrive via the
  // game-invitation toast.
  const gameMode = game?.mode
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: setup as StackdownSetup,
        player_user_ids: players.map((p) => p.user_id),
        mode: gameMode,
      })
      .single()
    if (error || !data) {
      showLocalFeedback(`New game failed: ${error?.message ?? 'unknown'}`, 'error')
      return
    }
    goToGame(`stackdown_${gameMode}`, (data as { id: string }).id)
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

  // ─── Header menu (every game owns its whole menu now) ─────────
  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // opened from the hook's "Game info" menu item. stackdown needs no board
  // divergence — its square board is min(--avail-w, --avail-h, 620px), so it
  // fits a phone on its own; the input is tile taps (no keyboard).
  const infoSheet = useInfoSheet()

  // The shared frame (Help / End-or-Concede / Back to club) plus stackdown's two
  // own items, "Restart" and "New game" — the same pair the terminal action
  // row offers, so they're reachable mid-game too. (The reveal/hint cheats stay
  // in the info-column action row, not the menu.) Placed after the action
  // handlers so they're in scope for the deps; all deps here are stable (the
  // useCallback handlers + primitives + the memoized menuSections), so
  // setGameSections — a setState — runs only when the mode/terminal/conceded
  // facts actually change, not every render. `game?.mode` is null until loaded;
  // default to coop so the menu exists during the loading beat and re-runs once
  // the real mode arrives.
  // Words cleared. Coop counts the shared valid submissions; compete reads the
  // caller's public tally (found_count is authoritative there). Hoisted with
  // shownTiles below, for the same reason — the print model needs it.
  const foundCount = isCompete
    ? self?.found_count ?? 0
    : submissions.filter((s) => s.valid).length

  // The tiles to SHOW — hoisted above the early return so the print model (built
  // in the menu effect, a hook, which can't move below one) draws exactly what
  // the board draws rather than a second copy that could drift.
  //
  // Mirrors the screen's rule: while playing, hide tiles spent on accepted words
  // plus the ones picked up into the word being built. At terminal show the
  // ORIGINAL board — a won game has cleared every tile, so it would otherwise
  // print blank.
  const shownTiles = useMemo(() => {
    if (!game) return []
    if (isTerminal) return game.tiles
    const off = new Set<number>([...removedTileIds, ...currentWord])
    return game.tiles.filter((t) => !off.has(t.id))
  }, [game, isTerminal, removedTileIds, currentWord])

  const menuMode = game?.mode === 'compete' ? 'compete' : 'coop'
  useEffect(() => {
    // "Print board (PDF)" — a snapshot at click time (docs/pdf.md). RLS already
    // scopes the submissions to what the viewer may see, the SERVER withholds
    // `solution` until terminal, and `solutionShown` withholds it on a loss —
    // so a printout can't spoil a stack you're about to run back either.
    const printModel = game
      ? buildStackdownPrintModel({
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          tiles: shownTiles,
          solution: solutionShown ? game.solution : null,
          submissions,
          players,
          selfId: session.user.id,
          mode: menuMode,
          isTerminal,
          found: foundCount,
          target: SOLUTION_WORDS,
          setup: summaryRows,
        })
      : null
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: menuMode,
        isTerminal,
        conceded: myConceded,
        onEndGame: endGame,
        onConcede: concede,
        extra: [
          {
            items: [
              { id: 'restart', label: 'Restart', onClick: restart },
              // Same setup + roster, a freshly claimed board, a NEW game id.
              { id: 'new-game', label: 'New game', shortcut: '+', onClick: () => void handleNewGame() },
              // The menu twin of the terminal row's boxed-eye button — same
              // local toggle, reachable from the menu the whole time so a
              // player who dismissed the row can still get to it. Mid-game it's
              // inert: there's nothing to reveal until the server unshields.
              {
                id: 'reveal',
                label: 'Reveal solution',
                disabled: !isTerminal || solutionShown,
                onClick: () => void revealSolution(),
              },
            ],
          },
          ...(printModel
            ? [{ items: [{ id: 'print', label: 'Print board (PDF)', onClick: () => printStackdownPdf(printModel) }] }]
            : []),
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [
    menu, menuMode, isTerminal, myConceded, endGame, concede, restart, handleNewGame,
    revealSolution, solutionShown,
    // The print model's inputs. It's rebuilt whenever the printable state moves,
    // which is what makes the snapshot current at click time.
    brand, title, game, shownTiles, submissions, players, session.user.id, foundCount, setup,
    summaryRows,
  ])

  // ─── Coop: narrate teammates' moves ───────────────────────────
  // The player who DIDN'T make a move otherwise saw nothing but the log quietly
  // growing. Surface each teammate submission as a GLOBAL feedback pill (with their
  // identity disc), and flash their played word (green/red) in the entry row. Called
  // unconditionally before the early returns; the hook no-ops off coop and until loaded.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    items: submissions,
    keyOf: (s) => `${s.user_id}:${s.seq}`,
    messageFor: (s) => {
      if (s.user_id === session.user.id) return null // own → own local pill / flash
      const member = players.find((p) => p.user_id === s.user_id)
      const who = <ActorDot actor={member} fallback="A teammate" />
      if (s.kind === 'hint')
        return { tone: 'warning', text: <>{who} revealed a hint</>, dismiss: { kind: 'timed' } }
      if (s.kind === 'reveal')
        return { tone: 'warning', text: <>{who} took a spoiler</>, dismiss: { kind: 'timed' } }
      // kind === 'word': ALSO flash the letters green/red in the WordEntry ring (an
      // ambient cue, not the pill). Safe to fire here — the hook calls messageFor
      // exactly once per NEW peer submission, mirroring the one pill.
      const word = (s.word ?? '').toUpperCase()
      const valid = s.valid === true
      onPeerWord([...word], valid)
      // "tried X" (not "tried X — not a word"): the header pill fits ~26 chars on
      // a phone and ellipsises silently, and the error tone already says it failed.
      return valid
        ? { tone: 'success', text: <>{who} found {word}</>, dismiss: { kind: 'timed' } }
        : { tone: 'error', text: <>{who} tried {word}</>, dismiss: { kind: 'timed' } }
    },
    globalFeedback,
  })

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  // While playing, hide tiles spent on accepted words plus the tiles currently
  // picked up into the word being built. Once the game is over, show the ORIGINAL
  // board (a won game has cleared every tile, so it'd otherwise be blank) for review
  // — the tiles are inert since canPlay is false.
  const offBoard = new Set<number>()
  if (!isTerminal) {
    for (const id of removedTileIds) offBoard.add(id)
    for (const id of currentWord) offBoard.add(id)
  }

  // The compete winner, for the loser's named verdict. `status.winner_user_id` is the id
  // and `status.winner_username` the handle cached at finish time (a rename is
  // rare enough that a stale name beats a follow-up query); the roster row is
  // looked up for the identity DOT, falling back to the cached name.
  const winnerId = status?.winner_user_id as string | undefined
  const selfWon = winnerId === session.user.id
  const over = isTerminal
    ? buildOver({
        mode: game.mode,
        playState,
        timerExpired: timer.expired,
        selfWon,
        winner: players.find((p) => p.user_id === winnerId),
        winnerName: (status?.winner_username as string | undefined) ?? 'Someone',
      })
    : null

  // The words-cleared count for the info-column state line. Coop is the shared total
  // (every valid submission is visible); compete reads the caller's own public tally
  // (submissions are RLS-scoped to the caller, so its valid count matches, but
  // found_count is the authoritative number).

  // Cheat tallies for the status line. Counted off the caller's visible submissions —
  // coop = the shared team total, compete = the caller's own (RLS already scopes the
  // list), matching how foundCount reads per mode.
  const hintCount = submissions.filter((s) => s.kind === 'hint').length
  // `kind='reveal'` is the stored value for a mid-game spoiler (renaming it
  // would be a migration for a label); the READOUT says "spoilers".
  const spoilerCount = submissions.filter((s) => s.kind === 'reveal').length

  // The submission log. Compete RLS opens every player's submissions once the game is
  // terminal, but the log should keep showing just the caller's own — the same list
  // as during play — so it doesn't swap to an everyone's-words view at game over
  // (mirrors wordle's guess list). Coop is the shared board, so it shows everyone's.
  const logWords = isCompete
    ? submissions.filter((s) => s.user_id === session.user.id)
    : submissions

  // Turn viewer: the historical board for the row being viewed (or null when live).
  // `viewingIndex` indexes `logWords` — the same chronological list the GameTurnLog log
  // shows — so coop replays the shared board and compete the caller's own, for free.
  // Works at terminal too (reviewing the finished stack). (`viewing` is from the hook.)
  const snap = viewingIndex !== null ? turnSnapshot(logWords, viewingIndex) : null

  // The below-board local pill. Precedence: the permanent terminal verdict → the
  // sticky "I'm out, the others race on" pill → the transient own-move message.
  // While viewing a past turn the pill is irrelevant — BoardCol's yellow overlay
  // banner covers the region with the turn's description.
  //
  // The middle branch is stackdown's only locally-terminal state: conceding
  // (there's no elimination here — you can't run out of tiles). It matches the
  // other games' below-board treatment, so a conceder sees the drop-out in the
  // slot they've been reading all game, not only in the info column.
  const localPill: GenericFeedbackMsg | null = over
    ? // over.tone (won/lost/neutral) not over.outcome, so a manual end (neutral)
      // reads neutral here — matching the info-column line and the other games,
      // rather than the green a `.outcome`-keyed map used to give it. The
      // `verdictNode` (a compete loss's "● moth cleared it first") wins when
      // present; the plain string is the fallback for every other case.
      terminalPill(over.tone, over.verdictNode ?? over.verdict)
    : isLocallyDone
      ? outOfRacePill(myConceded)
      : localFeedback

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        tiles={game.tiles}
        offBoard={snap ? snap.offBoard : offBoard}
        greenTiles={snap ? snap.greenTiles : NO_TILES}
        readOnly={viewing || !canPlay}
        viewingDescription={snap ? snap.description : null}
        onExitViewing={exitViewing}
        currentWord={currentWord}
        appendTile={appendTile}
        retractTo={retractTo}
        onSubmitWord={submit}
        localPill={localPill}
        showLocalFeedback={showLocalFeedback}
        clearLocalFeedback={clearLocalFeedback}
        flash={flash}
        clearFlash={clearFlash}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop.
          Props grouped to match InfoCol's own grouping (mode+phase → state readout →
          players → action row → setup+reveal → log). */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          setupRows={summaryRows}
        isCompete={isCompete}
        isTerminal={isTerminal}
        over={over}
        isPlayer={!!self}
        isLocallyDone={isLocallyDone}
        foundCount={foundCount}
        hintCount={hintCount}
        spoilerCount={spoilerCount}
        players={players}
        selfId={session.user.id}
        playerStates={playerStates}
        concededIds={concededIds}
        onHint={() => void revealHint()}
        onSpoiler={() => void spoilNext()}
        onEndGame={endGame}
        onConcede={concede}
        onRestart={restart}
        onNewGame={handleNewGame}
        startingNewGame={startingNewGame}
        onBackToClub={goToClub}
        setup={setup as unknown as StackdownSetup}
        solution={solutionShown ? game.solution : null}
        onReveal={() => void revealSolution()}
        revealDisabled={solutionShown}
        submissions={logWords}
        viewingIndex={viewingIndex}
        onSelectTurn={setViewingIndex}
        />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board pill + the info-column outcome line, and a coop
          clear gets the celebration instead — once, when it happens. */}
      {celebration.show && (
        <CelebrationDialog
          title="Stack cleared! 🎉"
          body="All six words found."
          onClose={celebration.close}
        />
      )}
      {confirmDialog}
    </div>
  )
}

/** Terminal copy (the shared `TerminalCopy`), mode- and (compete) self-aware.
 *  `tone` + `verdict` drive the permanent below-board pill; `message` + `tone`
 *  drive the short bold line in the info-column action row (`tone` picks its
 *  `outcome_<tone>` color — incl. neutral for a manual end).
 *
 *  Verdicts lead with the outcome word (`Won:` / `Lost:`) and carry no trailing
 *  period: the pill is a one-line, ellipsising row (~48 chars on a phone), so
 *  it's a LABEL, not prose. */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
  winner,
  winnerName,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfWon: boolean
  /** The compete winner's roster row (for the identity dot), if we have it. */
  winner: Member | undefined
  /** The compete winner's handle, cached in `status` at finish time. */
  winnerName: string
}): TerminalCopy & { verdictNode?: ReactNode } {
  // Manual end (stackdown.end_game) → the shared neutral copy (no winner).
  if (playState === 'ended') return endedCopy(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { verdict: 'Won: stack cleared', message: 'Cleared!', tone: 'won' }
    }
    return {
      verdict: timerExpired ? 'Lost: out of time' : 'Lost: stack not cleared',
      message: timerExpired ? 'Out of time' : 'Not cleared',
      tone: 'lost',
    }
  }
  // compete — a race to clear, so a loss names WHO beat you. That's the one case
  // the pill wants a WIDGET rather than a string (the winner's identity dot, the
  // way peer feedback names people elsewhere); `verdict` carries the plain-text
  // twin for anything that needs a string.
  if (playState === 'won_compete') {
    if (selfWon) {
      return { verdict: 'Won: cleared it first', message: 'You won!', tone: 'won' }
    }
    return {
      verdict: `${winnerName} cleared it first`,
      verdictNode: (
        <>
          <ActorDot actor={winner} fallback="Someone" show="both" /> cleared it first
        </>
      ),
      message: `${winnerName} won`,
      tone: 'lost',
    }
  }
  // lost_compete — nobody cleared, or time ran out. No `Lost:` prefix: nobody was
  // beaten, the stack just outlasted everyone.
  return {
    verdict: timerExpired ? 'Out of time — no winner' : 'Nobody cleared it',
    message: timerExpired ? 'Out of time' : 'No winner',
    tone: 'lost',
  }
}
