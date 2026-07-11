import { useCallback, useEffect, useRef, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import type {
  GenericFeedbackMsg,
  GenericFeedbackTone,
  GamePageCtx,
} from '../../common/lib/games'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, END_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { terminalPill } from '../../common/lib/game/localPills'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { db } from '../db'
import { turnSnapshot } from '../lib/history'
import type { StackdownSetup } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
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
export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  timer,
  setup,
  status,
  globalFeedback,
  goToClub,
  menu,
}: GamePageCtx) {
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

  // ─── Reveal next word (a CHEAT — see stackdown.reveal_next_word) ──
  // Peeks at the next solution word the caller still has to clear. Used to verify
  // generated boards are solvable in order; may be removed once boards are trusted.
  // Surfaced in the LOCAL feedback slot (the player's own request) — closeable so it
  // lingers while they hunt for the tiles.
  const revealNext = useCallback(async () => {
    const { data, error } = await db.rpc('reveal_next_word', { target_game: gameId })
    if (error) {
      showLocalFeedback(error.message, 'error')
      return
    }
    const word = data as string | null
    showLocalFeedback(
      word ? `Next word: ${word.toUpperCase()}` : 'All words cleared',
      'warning', // a reveal is a "help, not good-or-bad" action — amber like the button
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
      hint ? `Hint: ${hint}` : 'No hint for this word yet.',
      'warning', // a reveal is a "help, not good-or-bad" action — amber like the button
      { kind: 'closeable' },
    )
  }, [gameId, showLocalFeedback])

  // ─── End (coop) — an info-column action-row button ────────────
  // Manual end (stackdown.end_game) → a neutral whole-table stop. Always
  // confirmed via the shared modal (ending is harmful for the whole group, even
  // coop/solo); irreversible. Coop's answer to "we're done"; compete uses
  // Concede instead.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!(await confirmAction(END_GAME_CONFIRM))) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(`End game failed: ${error.message}`, 'error')
  }, [gameId, isTerminal, showLocalFeedback, confirmAction])

  // ─── Concede (compete) — drop out of the race ─────────────────
  // A real loss for the conceder; the others keep racing (stackdown.concede →
  // common.concede). Distinct from End, which is coop's neutral mutual stop.
  const handleConcede = useCallback(async () => {
    if (isTerminal || myConceded) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback(`Concede failed: ${error.message}`, 'error')
  }, [gameId, isTerminal, myConceded, showLocalFeedback])

  // ─── Header menu (every game owns its whole menu now) ─────────
  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // opened from the hook's "Game info" menu item. stackdown needs no board
  // divergence — its square board is min(--avail-w, --avail-h, 620px), so it
  // fits a phone on its own; the input is tile taps (no keyboard).
  const infoSheet = useInfoSheet()

  // stackdown adds no game-specific actions (its reveal/hint cheats live in the
  // info-column action row, not the menu); the only `extra` is the mobile-only
  // "Game info" item that opens the off-canvas info column (empty on desktop).
  // Placed after handleEndGame/handleConcede so they're in scope for the deps; all
  // deps here are stable (the useCallback handlers + primitives + the memoized
  // menuSections), so setGameSections — a setState — runs only when the
  // mode/terminal/conceded facts actually change, not every render. `game?.mode`
  // is null until loaded; default to coop so the menu exists during the loading
  // beat and re-runs once the real mode arrives.
  const menuMode = game?.mode === 'compete' ? 'compete' : 'coop'
  useEffect(() => {
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: menuMode,
        isTerminal,
        conceded: myConceded,
        onEndGame: () => void handleEndGame(),
        onConcede: () => void handleConcede(),
        extra: infoSheet.menuSections,
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, menuMode, isTerminal, myConceded, handleEndGame, handleConcede, infoSheet.menuSections])

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
        return { tone: 'warning', text: <>{who} revealed a word</>, dismiss: { kind: 'timed' } }
      // kind === 'word': ALSO flash the letters green/red in the WordEntry ring (an
      // ambient cue, not the pill). Safe to fire here — the hook calls messageFor
      // exactly once per NEW peer submission, mirroring the one pill.
      const word = (s.word ?? '').toUpperCase()
      const valid = s.valid === true
      onPeerWord([...word], valid)
      return valid
        ? { tone: 'success', text: <>{who} found {word}</>, dismiss: { kind: 'timed' } }
        : { tone: 'error', text: <>{who} tried {word} — not a word</>, dismiss: { kind: 'timed' } }
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

  const selfWon = (status?.winner as string | undefined) === session.user.id
  const over = isTerminal
    ? buildOver({ mode: game.mode, playState, timerExpired: timer.expired, selfWon })
    : null

  // The words-cleared count for the info-column state line. Coop is the shared total
  // (every valid submission is visible); compete reads the caller's own public tally
  // (submissions are RLS-scoped to the caller, so its valid count matches, but
  // found_count is the authoritative number).
  const foundCount = isCompete
    ? self?.found_count ?? 0
    : submissions.filter((s) => s.valid).length

  // Cheat tallies for the status line. Counted off the caller's visible submissions —
  // coop = the shared team total, compete = the caller's own (RLS already scopes the
  // list), matching how foundCount reads per mode.
  const hintCount = submissions.filter((s) => s.kind === 'hint').length
  const revealCount = submissions.filter((s) => s.kind === 'reveal').length

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
  // transient own-move message. While viewing a past turn the pill is irrelevant —
  // BoardCol's yellow overlay banner covers the region with the turn's description.
  const localPill: GenericFeedbackMsg | null = over
    ? // over.tone (won/lost/neutral) not over.outcome, so a manual end (neutral)
      // reads neutral here — matching the info-column line and the other games,
      // rather than the green a `.outcome`-keyed map used to give it.
      terminalPill(over.tone, over.verdict)
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
        isCompete={isCompete}
        isTerminal={isTerminal}
        over={over}
        isPlayer={!!self}
        isLocallyDone={isLocallyDone}
        foundCount={foundCount}
        hintCount={hintCount}
        revealCount={revealCount}
        players={players}
        selfId={session.user.id}
        playerStates={playerStates}
        concededIds={concededIds}
        onHint={() => void revealHint()}
        onReveal={() => void revealNext()}
        onEndGame={() => void handleEndGame()}
        onConcede={() => void handleConcede()}
        onBackToClub={goToClub}
        setup={setup as unknown as StackdownSetup}
        solution={game.solution}
        submissions={logWords}
        showWho={!isCompete}
        viewingIndex={viewingIndex}
        onSelectTurn={setViewingIndex}
        />
      </InfoSheet>

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
      {confirmDialog}
    </div>
  )
}

/** Terminal copy (the shared `TerminalCopy`), mode- and (compete) self-aware.
 *  `outcome` + `verdict` drive the GameOverModal + the permanent below-board pill;
 *  `message` + `tone` drive the short bold line in the info-column action row
 *  (`tone` picks its `outcome_<tone>` color — incl. neutral for a manual end). */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfWon: boolean
}): TerminalCopy {
  // Manual end (stackdown.end_game) → the shared neutral copy (no winner).
  if (playState === 'ended') return endedCopy(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'Stack cleared! 🎉', message: 'Cleared!', tone: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'Out of time.' : 'Stack not cleared.',
      message: timerExpired ? 'Out of time' : 'Not cleared',
      tone: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { outcome: 'won', verdict: 'You won — cleared it first!', message: 'You won!', tone: 'won' }
      : { outcome: 'lost', verdict: 'Beaten to the clear.', message: 'Opponent won', tone: 'lost' }
  }
  // lost_compete — nobody cleared, or time ran out
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time — no winner.' : 'Nobody cleared it.',
    message: timerExpired ? 'Out of time' : 'No winner',
    tone: 'lost',
  }
}
