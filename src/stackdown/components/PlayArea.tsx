// cs-unmet

import { runRpc } from '@/common/supabase/dbResult'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconHideSolution } from '@/common/icons/icons'
import { cls } from '@/common/utils/cls'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildStackdownPrintModel } from '../pdf/model'
import { printStackdownPdf } from '../pdf/printStackdownPdf'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { solvedByMe, useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { db } from '../db'
import { turnSnapshot } from '../lib/history'
import { offBoardIds } from '../lib/board'
import type { StackdownSetup } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useFlash } from '@/common/board-marks/useFlash'
import { useMark } from '@/common/board-marks/useMark'
import {
  ATTENTION_FADE_MS,
  ATTENTION_FLASH_MS,
  WORD_ANSWER_MS,
} from '@/common/board-marks/feedbackTiming'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { Actor } from '@/common/members/member'
import { useHistoryViewer } from '@/common/turn-log/useHistoryViewer'
import { type WordFlash } from './WordEntry'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import styles from './PlayArea.module.css'
import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** Empty highlight set — while live, the board rings no tiles green (turn-viewer only). */
const NO_TILES: ReadonlySet<number> = new Set()

/** What `stackdown.submit_word` puts in `data`. The structural fact travels even
 *  where the server also wrote the sentence: `result` decides whether the tiles
 *  leave the board or come back, and has nothing to do with the words. */
type WordAnswer = {
  result: 'accepted' | 'invalid'
  word: string
  terminal: boolean
}

/** What the two cheats put in `data`. Each has exactly one `ok` answer today,
 *  and `result` names it anyway: a call site may not take an `ok` branch by
 *  merely matching `ok` (docs/envelopes.md → Choosing which `ok` branch), or a
 *  second answer added to either RPC would be drawn as this one, silently. */
type RevealAnswer = { result: 'reveal'; word: string }
type HintAnswer = { result: 'hint'; hint: string }

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
 *     disclosure, terminal words reveal, and the GameTurnLog log. Every command
 *     arrives as a bound action it places; the one callback up is `onSelectTurn`.
 *
 * The load-bearing seam: BoardCol owns *editing*; PlayArea hands it *the board to
 * show*. That's what makes turn-history a drop-in (see docs/playarea.md).
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
  timer,
  setup,
  status,
  globalFeedbackSlot,
  clubHandle,
  goToGame,
  menu,
  brand,
  title,
}: GamePageCtx) {
  // The board is worked by clicks and typing, so Tab has nowhere to go here —
  // and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])
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
    failure,
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
  // The shared coordination state (docs/playarea.md): which log
  // row is open on the board. Identified by the row's POSITION in the log, not its
  // seq (stackdown's seq is per-user — see lib/history). When set, PlayArea feeds
  // BoardCol that turn's historical snapshot + readOnly; BoardCol shows the yellow
  // frame + banner and freezes input, and any keystroke / board click / ✕ exits.
  const { viewingId: viewingIndex, viewing, select: setViewingIndex, exitViewing } =
    useHistoryViewer()

  // ─── The local feedback slot (the below-board pill) ──────────────
  // The player's OWN move results — a rejected word, a keystroke that matched
  // no exposed tile (or too many), a hint's answer, a not-ok, the verdict —
  // show as the `<FeedbackPill>` in BoardCol's below-board slot (docs/ui.md →
  // Feedback pill). Peer narration goes to the GLOBAL header instead
  // (usePeerFeedback). The slot lives in PlayArea because it has triggers in
  // BOTH columns (the keyboard input engine in BoardCol; the reveal/hint
  // cheats in InfoCol) plus the terminal verdict — so the coordinator owns it
  // and both columns show into it.
  const localFeedbackSlot = useFeedbackSlot('local')

  // ─── Coop-win celebration ──────────────────────────────
  // Confetti at the MOMENT the team clears the stack — the sixth word flips
  // playState to 'won' on every connected client via the realtime refetch, so
  // the whole group celebrates together; opening an already-won game stays
  // quiet (useCelebration never pops on mount). Gated on playState ALONE:
  // it's coop-only by the states vocabulary (compete writes 'won_compete'),
  // and unlike anything from `useGame` it's correct from the very first render
  // (GamePage has already waited for the common.games row).
  const celebration = useCelebration(playState === 'won')

  // ─── Word-slot flash (the WordEntry green/red beat) ─────────────
  // A word flashes in the entry row for a beat, then clears — or sooner, when the
  // player starts a new word (BoardCol's tile click clears it). Two sources feed it:
  // the player's OWN just-accepted word (green "good move"), and — in coop — a
  // TEAMMATE's played word (green if valid, red if rejected), driven by
  // usePeerFeedback. Because a teammate can trigger it, the state lives here and is
  // passed down to BoardCol (which renders it via WordEntry).
  const [flash, showFlash, clearFlash] = useMark<WordFlash>(WORD_ANSWER_MS)
  // ─── A teammate's word, marked where it happened ───────────────
  // On the BOARD, on their tiles — not in this player's entry row, which is
  // their own workspace. Two beats in the order every board uses: the attention
  // flash says WHERE, and once it has faded the answer's own color says WHAT.
  //
  // An accepted word's tiles are HELD on the board for the whole sequence
  // instead of leaving the moment the row lands. Otherwise the news and the
  // change are one event — the tiles you are being told about are already gone
  // by the time you look. They are inert while held (`heldTileIds` below), so
  // nobody can pick up a tile the server has already taken.
  const [peerMark, setPeerMark] = useState<
    { ids: number[]; tone: 'won' | 'lost'; answered: boolean } | null
  >(null)
  const peerMarkTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const markPeerWord = useCallback((tileIds: number[], valid: boolean) => {
    if (tileIds.length === 0) return
    peerMarkTimers.current.forEach(clearTimeout)
    setPeerMark({ ids: tileIds, tone: valid ? 'won' : 'lost', answered: false })
    peerMarkTimers.current = [
      setTimeout(
        () => setPeerMark((m) => (m ? { ...m, answered: true } : null)),
        ATTENTION_FADE_MS,
      ),
      setTimeout(() => setPeerMark(null), ATTENTION_FADE_MS + WORD_ANSWER_MS),
    ]
  }, [])
  useEffect(() => () => peerMarkTimers.current.forEach(clearTimeout), [])

  // My own refused word's tiles, marked as they land back on the board — the
  // answer was read in the slots, and this is where the letters went.
  const [returnedTiles, flashReturned] = useFlash<number>(ATTENTION_FLASH_MS)

  /** The word this player just had refused, still in the slots and wearing the
   *  answer. Its tiles are off the board until the beat ends. */
  const [refusedWord, setRefusedWord] = useState<number[] | null>(null)
  const refusedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (refusedTimer.current) clearTimeout(refusedTimer.current)
  }, [])

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

  // The gate on the two CHEATS (hint / spoiler), which is looser than `canPlay`:
  // a solved compete player waiting out the race still sees both buttons in the
  // info column, so this mirrors that row's condition exactly rather than
  // inventing a second answer. Read by the game menu, where the pair's menu
  // twins live.
  const canAskHelp = !!self && !isTerminal && !myConceded

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
      const res = await runRpc<WordAnswer>(
        db.rpc('submit_word', { target_game: gameId, tile_ids: tileIds }),
      )
      setSubmitting(false)
      if (res.type === 'not-ok') {
        // The tiles come back to the board: nothing was cleared. A coop
        // teammate taking your tiles mid-flight is the one refusal a player
        // realistically meets here, and it isn't their mistake.
        clearWord()
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'accepted') {
        // Empty the word and hold its tiles removed optimistically on THIS client so
        // the grid doesn't flash them back on before the valid submission lands via
        // realtime. Teammates just see the tiles leave once, on their own refetch.
        commitWord(tileIds)
        // Flash the just-spelled word green in the entry row (the ring is the
        // own-accepted signal; no message needed — and the move dismisses the
        // last result).
        localFeedbackSlot.dismiss()
        showFlash({ letters: [...res.data.word.toUpperCase()], tone: 'won' })
        return
      } else if (res.type === 'ok' && res.data.result === 'invalid' && res.message !== null) {
        // NOT A WORD — an `ok`, because the rules were applied and no tile
        // moved: the five tiles go straight back onto the board. The server
        // wrote the sentence, and named the word in it, because by the time it
        // is read `clearWord` has taken the word off the screen — so the
        // sentence is half of what this case promises, and the branch says so.
        // The answer shows in the SLOTS, where the eye already is, and the five
        // tiles stay off the board while it does — coming back only once the
        // beat ends, wearing the attention flash so the eye follows them home.
        setRefusedWord(tileIds)
        localFeedbackSlot.show(FeedbackMessage.result(res.outcome, res.message))
        if (refusedTimer.current) clearTimeout(refusedTimer.current)
        refusedTimer.current = setTimeout(() => {
          clearWord()
          flashReturned(tileIds)
          setRefusedWord(null)
          refusedTimer.current = null
        }, WORD_ANSWER_MS)
        return
      } else {
        reportUnhandled('submit_word', res)
        return
      }
    },
    [gameId, clearWord, commitWord, showFlash, localFeedbackSlot, flashReturned],
  )

  // ─── Spoiler: the next word (a CHEAT — see stackdown.reveal_next_word) ──
  // Hands over the next solution word the caller still has to clear. Used to verify
  // generated boards are solvable in order; may be removed once boards are trusted.
  // Named `spoilNext`, not `revealNext`: "reveal" on this page now means the WHOLE
  // solution at game-over (the red boxed-eye button below).
  // Surfaced in the LOCAL feedback slot (the player's own request) as a `hint`,
  // which leaves only by its × — it lingers while they hunt for the tiles.
  const spoilNext = useCallback(async () => {
    const res = await runRpc<RevealAnswer>(db.rpc('reveal_next_word', { target_game: gameId }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'reveal' && res.outcome !== null) {
      // The server sends no sentence — the word IS the answer, and only the
      // surface knows it belongs in a "Next word:" line rather than, say, a
      // PDF. What it does send is how that reads, so the outcome is the other
      // half of this case's promise and the branch asserts it too.
      localFeedbackSlot.show(
        FeedbackMessage.hint(res.outcome, `Next word: ${res.data.word.toUpperCase()}`),
      )
      return
    } else {
      reportUnhandled('reveal_next_word', res)
      return
    }
  }, [gameId, localFeedbackSlot])


  // ─── Reveal hint (the next word's HINT — a nudge, not the word) ──
  // A softer reveal than "Reveal word": shows the curated hint for the next solution
  // word (common.words.hint, a clue that hides the word). The word never reaches the
  // client — reveal_next_hint returns only the hint text. There is no "no hint for
  // this word" answer: every word a stackdown board can hold carries one, so the
  // server treats a missing hint as a fault and says so (see its comment).
  const revealHint = useCallback(async () => {
    const res = await runRpc<HintAnswer>(db.rpc('reveal_next_hint', { target_game: gameId }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'hint' && res.outcome !== null) {
      localFeedbackSlot.show(FeedbackMessage.hint(res.outcome, `Hint: ${res.data.hint}`))
      return
    } else {
      reportUnhandled('reveal_next_hint', res)
      return
    }
  }, [gameId, localFeedbackSlot])

  // ─── Terminal solution reveal ────────────────────────────────────
  // The six words are NOT shown just because the game ended — not even on a
  // win: `replay_board` re-runs this very stack with the same solution (see its
  // RPC comment), so an answer left on screen would make Restart theater,
  // shuffling tiles you already know.
  //
  // The ask is LOCAL and reversible (useSolutionReveal): mine alone, so a
  // teammate can keep working the stack out in their head while I look, and the
  // same control puts it away again. The words themselves are on every client
  // once the game is terminal (stackdown._solution_for), so this is purely
  // what's drawn.
  //
  // `impliedBy: mySolved` is the exception: you can only finish a stackdown by
  // playing all six words, so a solver has already SEEN every one of them —
  // the info-column list just gathers them in one place, click-to-define. MY
  // solve, not the game's verdict: compete's loser cleared nothing.
  const {
    revealed: solutionShown,
    toggle: toggleSolution,
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: solvedByMe({ isCompete, playState, mine: mySolved }),
  })

  // ─── End / Concede / Replay — the shared trio ─────────────────
  // The byte-identical shared handlers (useStandardGameActions). End is coop's
  // neutral whole-table stop (confirmed through the styled modal); Concede is
  // compete's per-player drop-out; Replay restarts THIS stack — same tiles, same
  // solution, everything the players did wiped. stackdown's own bits are the
  // replay sentence and the post-replay cleanup (leave the turn-history view,
  // dismiss the last result, re-hide a revealed solution).
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: isCompete ? 'compete' : 'coop',
    myConceded,
    localFeedbackSlot,
  })

  // ─── The help ladder ─────────────────────────────────────────
  // Two rungs, both grayed rather than dropped once you can't ask: the row is
  // what NAMES those glyphs (docs/ui.md → the menu is the legend), and a
  // disabled row still teaches the lightbulb and the bare eye. The labels say
  // which word each acts on, which the icon-only buttons have no room for.
  const actHint = useBoundAction('act-hint', {
    describe: () => ({
      state: canAskHelp ? 'active' : 'disabled',
      label: 'Hint for next word',
    }),
    run: revealHint,
  })
  const actSpoiler = useBoundAction('act-spoiler', {
    describe: () => ({
      state: canAskHelp ? 'active' : 'disabled',
      label: 'Cheat for next word',
    }),
    run: spoilNext,
  })

  // Reveal the six words — the same toggle wearing the same two faces in the
  // menu and in the terminal row, so a player who dismissed the row can still
  // reach it. Inert mid-game: there is nothing to reveal until the server
  // unshields, and nothing left to show once solving has put them all up.
  const actReveal = useBoundAction('act-reveal', {
    describe: () => {
      if (impliedBySolve) return { state: 'disabled', label: 'Solution already shown' }
      if (solutionShown) return { state: 'active', label: 'Hide solution', icon: IconHideSolution }
      // Named in the inert case too: the registry's bare "Reveal" would make the
      // row change its words as the game ended, which is not what it says.
      return isTerminal
        ? { state: 'active', label: 'Reveal solution' }
        : { state: 'disabled', label: 'Reveal solution', tooltip: "Can't reveal until all end" }
    },
    run: toggleSolution,
  })

  // New game — a FRESH game (new id, a newly claimed board) with THIS game's
  // setup + roster + mode, in the same club. stackdown's create_game claims a
  // random board from the pre-generated library, so this is a direct RPC — no
  // edge function — mirroring the manifest's startGameInClub. Non-destructive
  // (common.create_game un-currents this game into the club list), so no
  // confirm; the creator jumps in via ctx.goToGame, peers arrive via the
  // game-invitation toast.
  //
  // A plain function, rebuilt every render: the binding below reads it at click
  // time, so `setup` and `players` are whatever the last realtime refetch left,
  // and the action's own identity doesn't move when they do.
  const gameMode = game?.mode
  const createNewGame = async () => {
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup: setup as StackdownSetup,
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
      goToGame(`stackdown_${gameMode}`, res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game:
  // create_game clears the club's current-view flag, so it stays resumable — the
  // copy says shelved, not ended) and goes straight through at terminal, where
  // there is nothing to interrupt. The shared run's single flight is what stops a
  // second press claiming a second board.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

  // ─── Header menu ──────────────────────────────────────────────
  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // opened from the hook's "Game info" menu item. stackdown needs no board
  // divergence — its square board is min(--avail-w, --avail-h, 620px), so it
  // fits a phone on its own; the input is tile taps (no keyboard).
  const infoSheet = useInfoSheet()

  // Words cleared. Coop counts the shared valid submissions; compete reads the
  // caller's public tally (found_count is authoritative there). Hoisted with
  // shownTiles below, for the same reason — the print model needs it.
  const foundCount = isCompete
    ? self?.found_count ?? 0
    : submissions.filter((s) => s.valid).length

  // Which tiles are OFF the board, from the shared rule in `lib/board.ts` — the
  // same one each compete print track applies to its own player. Hoisted above
  // the early return because the print model is built in a hook (the menu
  // effect), which can't sit below one.
  //
  // `removedTileIds` is per-viewer (coop shares every submission, compete shows
  // you your own), so "cleared" here means the board THIS viewer was working on.
  // A teammate's accepted word is HELD on the board for the length of its mark:
  // the tiles the server has already taken stay drawn, and inert, until the
  // answer has been read. Nothing else delays a removal.
  const heldTileIds = useMemo(
    () => (peerMark?.tone === 'won' ? new Set(peerMark.ids) : new Set<number>()),
    [peerMark],
  )
  const offBoard = useMemo(() => {
    if (!game) return new Set<number>()
    const off = offBoardIds(game.tiles, removedTileIds, currentWord, isTerminal)
    for (const id of heldTileIds) off.delete(id)
    return off
  }, [game, isTerminal, removedTileIds, currentWord, heldTileIds])

  /** Tiles taking the attention flash: a teammate's word before its answer
   *  shows, and my own refused tiles as they land back. */
  const attentionTiles = useMemo(() => {
    const ids = new Set<number>(returnedTiles)
    if (peerMark && !peerMark.answered) for (const id of peerMark.ids) ids.add(id)
    return ids
  }, [returnedTiles, peerMark])

  /** A teammate's answer, once the attention flash has handed the tiles back. */
  const boardAnswer = useMemo(
    () =>
      peerMark?.answered ? { ids: new Set(peerMark.ids), tone: peerMark.tone } : null,
    [peerMark],
  )

  // Feeds the print model only; `game?.mode` is null until loaded.
  const menuMode = game?.mode === 'compete' ? 'compete' : 'coop'

  // Print the board — a snapshot at CLICK time (docs/pdf.md). RLS already scopes
  // the submissions to what the viewer may see, the SERVER withholds `solution`
  // until terminal, and `solutionShown` withholds it until this viewer asks — so
  // a printout carries the answer only if the page in front of them does, and
  // can't spoil a stack they're about to run back.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      if (!game) return
      printStackdownPdf(
        buildStackdownPrintModel({
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          // The WHOLE stack: compete prints a board per player and each has
          // cleared a different set, so the model works out what's still down
          // per track rather than taking the viewer's board for everyone's.
          allTiles: game.tiles,
          currentWord,
          solution: solutionShown ? game.solution : null,
          submissions,
          players,
          selfId: session.user.id,
          mode: menuMode,
          isTerminal,
          found: foundCount,
          target: SOLUTION_WORDS,
          setup: summaryRows,
        }),
      )
    },
  })

  // The FULL stackdown menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time. The help rungs
  // and Reveal are the menu twins of the info column's buttons: the row is what
  // NAMES those glyphs, which is why they gray rather than drop.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          { items: [actHint, actSpoiler] },
          { items: [actRestart, actNewGame, actReveal] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actHint, actSpoiler, actRestart, actNewGame, actReveal, actPrintBoard])

  // ─── Coop: narrate teammates' moves ───────────────────────────
  // The player who DIDN'T make a move otherwise saw nothing but the log quietly
  // growing. Surface each teammate submission as a `peer` message in the
  // GLOBAL header (with their identity disc), and flash their played word
  // (green/red) in the entry row. Called unconditionally before the early
  // returns; the hook no-ops off coop and until loaded.
  usePeerFeedback({
    enabled: game?.mode === 'coop',
    items: submissions,
    keyOf: (s) => `${s.user_id}:${s.seq}`,
    messageFor: (s) => {
      if (s.user_id === session.user.id) return null // own → the local slot / flash
      const member = players.find((p) => p.user_id === s.user_id)
      if (s.kind === 'hint') return FeedbackMessage.peer(member, 'warning', 'revealed a hint')
      if (s.kind === 'reveal') return FeedbackMessage.peer(member, 'warning', 'took a spoiler')
      // kind === 'word': ALSO mark their tiles on the board (an ambient cue, not
      // the message). Safe to fire here — the hook calls messageFor exactly once
      // per NEW peer submission, mirroring the one message.
      const word = (s.word ?? '').toUpperCase()
      const valid = s.valid === true
      markPeerWord(s.tile_ids ?? [], valid)
      // "tried X" (not "tried X — not a word"): the header fits ~26 chars on a
      // phone and ellipsises silently, and the outcome already says it failed.
      return valid
        ? FeedbackMessage.peer(member, 'won', `found ${word}`)
        : FeedbackMessage.peer(member, 'lost', `tried ${word}`)
    },
    globalFeedbackSlot,
  })

  // ─── The two standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome. The compete winner is `status.winner_user_id`,
  // with `status.winner_username` the handle cached at finish time (a rename
  // is rare enough that a stale name beats a follow-up query); the roster row
  // is read for the identity DOT, falling back to the cached name.
  const winnerId = (status?.winner_user_id as string | undefined) ?? null
  const selfWon = winnerId === session.user.id
  const winnerRow = players.find((p) => p.user_id === winnerId)
  const winnerName = winnerRow?.username ?? (status?.winner_username as string | undefined)
  const winnerColor = winnerRow?.color
  const timerExpired = timer.expired
  const over = useMemo(
    () =>
      isTerminal && gameMode
        ? buildOver({
            mode: gameMode,
            playState,
            timerExpired,
            selfWon,
            winner: winnerName === undefined ? undefined : { username: winnerName, color: winnerColor ?? '' },
          })
        : null,
    [isTerminal, gameMode, playState, timerExpired, selfWon, winnerName, winnerColor],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Out of the race while the others play on — stackdown's only locally-
  // terminal state is conceding (there's no elimination here: you can't run
  // out of tiles). It matches the other games' below-board treatment, so a
  // conceder sees the drop-out in the slot they've been reading all game, not
  // only in the info column.
  useEffect(function showOutOfRace() {
    if (!isLocallyDone) return
    const id = localFeedbackSlot.show(FeedbackMessage.outOfRace(myConceded))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isLocallyDone, myConceded])

  if (loading) return <p>Loading game…</p>
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "Game not found." about a dead connection is a confident wrong answer —
  // this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) return <p>Game not found.</p>

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
        // While viewing a past turn, BoardCol's yellow overlay banner covers the
        // slot's region with the turn's description.
        localFeedbackSlot={localFeedbackSlot}
        flash={flash}
        clearFlash={clearFlash}
        // The marks a live board wears. All three are empty while viewing a past
        // turn: that board is a record, and nothing is happening on it.
        attentionTiles={snap ? NO_TILES : attentionTiles}
        boardAnswer={snap ? null : boardAnswer}
        heldTiles={snap ? NO_TILES : heldTileIds}
        refusedWord={refusedWord !== null}
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
        actHint={actHint}
        actSpoiler={actSpoiler}
        actEndGame={actEndGame}
        actConcede={actConcede}
        actRestart={actRestart}
        actNewGame={actNewGame}
        actBackToClub={menu.actBackToClub}
        setup={setup as unknown as StackdownSetup}
        solution={solutionShown ? game.solution : null}
        actReveal={actReveal}
        submissions={logWords}
        viewingIndex={viewingIndex}
        onSelectTurn={setViewingIndex}
        />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board slot + the info-column outcome line, and a coop
          clear gets the celebration instead — once, when it happens. */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="Stack cleared! 🎉"
          body="All six words found."
          onClose={celebration.close}
        />
      )}
    </div>
  )
}

/** The terminal message (the shared `TerminalMessage`), mode- and (compete)
 *  self-aware. `outcome` + `pillText` are the below-board verdict; `outcome`
 *  + `infoColText` the short bold line in the info-column action row (the
 *  outcome picks its `outcome_<outcome>` color — incl. neutral for a manual
 *  end).
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
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfWon: boolean
  /** The compete winner as name + color — the roster row when we have it,
   *  else the handle cached in `status` at finish time. */
  winner: Actor | undefined
}): TerminalMessage {
  // Manual end (stackdown.end_game) → the shared neutral message (no winner).
  if (playState === 'ended') return gameEndedTerminalMessage(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { pillText: 'Won: stack cleared', infoColText: 'Cleared!', outcome: 'won' }
    }
    return {
      pillText: timerExpired ? 'Lost: out of time' : 'Lost: stack not cleared',
      infoColText: timerExpired ? 'Out of time' : 'Not cleared',
      outcome: 'lost',
    }
  }
  // compete — a race to clear, so a loss names WHO beat you: the winner rides
  // as `actor`, and the pill draws the mention the way every other message
  // names someone.
  if (playState === 'won_compete') {
    if (selfWon) {
      return { pillText: 'Won: cleared it first', infoColText: 'You won!', outcome: 'won' }
    }
    return {
      pillText: 'cleared it first',
      infoColText: `${winner?.username ?? 'a player'} won`,
      outcome: 'lost',
      actor: winner,
    }
  }
  // lost_compete — nobody cleared, or time ran out. No `Lost:` prefix: nobody was
  // beaten, the stack just outlasted everyone.
  return {
    pillText: timerExpired ? 'Out of time — no winner' : 'Nobody cleared it',
    infoColText: timerExpired ? 'Out of time' : 'No winner',
    outcome: 'lost',
  }
}
