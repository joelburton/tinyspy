// cs-unmet

import { runRpc } from '@/common/supabase/dbResult'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconHideSolution } from '@/common/icons/icons'
import { cls } from '@/common/utils/cls'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import type { PsychicnumSetup } from '../lib/setup'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useTurnStartFlash } from '@/common/move-flash/useTurnStartFlash'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useHistoryViewer } from '@/common/turn-log/useHistoryViewer'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { solvedByMe, useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { setupRows } from '../lib/setupSummary'
import { memberById } from '@/common/members/memberList'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { printPsychicnumPdf } from '../pdf/printPsychicnumPdf'
import { buildPsychicnumPrintModel } from '../pdf/model'
import { turnSnapshot } from '../lib/history'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { StateLine } from './StateLine'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import styles from './PlayArea.module.css'
import '../theme.css'  // psychicnum-specific tokens (empty today, see file)
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

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
/**
 * What `request_hint` answers. TWO `ok`s, because "here is a clue" and "this
 * word has no clue" used to arrive as one string with a magic value in it —
 * `hint` carries the row's text either way, and only `result` tells them apart.
 */
type HintAnswer = {
  result: 'hint' | 'no-hint'
  hint: string
}

/** What `request_reveal` answers: one `ok`, carrying the spoiled secret. */
type RevealAnswer = {
  result: 'reveal'
  word: string
}

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
  globalFeedbackSlot,
  clubHandle,
  goToGame,
  menu,
  brand,
  title,
}: GamePageCtx) {
  const { game, players: playerBudgets, guesses, loading, failure } = useGame(gameId)
  const mode = game?.mode

  // The guess is typed at the window rather than into an input, so nothing here
  // takes focus and Tab has nowhere to go; an empty ring keeps it from walking
  // out to the browser.
  useTabRing([])

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // reached by the header's InfoSwitchButton. Desktop is unchanged.
  const infoSheet = useInfoSheet()

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
  // ─── The turn arriving (turn-order coop) ───────────────
  // The board frame flashes yellow the moment the move becomes mine. The dim is
  // what says "not yours"; its lifting is a removal, and you are by definition
  // looking elsewhere when it happens. Never fires in a free-for-all game.
  const turnFlash = useTurnStartFlash(isMyTurn)

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
  // game-menu effect below needs them to gray the Hint / Spoiler rows in step
  // with the InfoCol buttons they name. `playerBudgets` is [] until the fetch
  // lands, so a pre-load menu reads "no guesses left" and the pair is grayed;
  // the row still shows its glyph, which is the point of it being there.
  const selfBudget =
    playerBudgets.find((p) => p.user_id === session.user.id)
      ?.guesses_remaining ?? 0
  // Did I find all three? (Same row, read up here because the reveal below
  // needs it — `playerBudgets` is [] until the fetch lands, which is exactly
  // why the reveal derives rather than initializes from it.)
  const iFoundThemAll =
    (playerBudgets.find((p) => p.user_id === session.user.id)?.found_secrets_count ?? 0)
    >= SECRET_COUNT
  // Am I a live PARTICIPANT (not out of budget, not conceded, game not over)?
  // This drives the terminal-vs-play LOOK in both columns. It deliberately does
  // NOT fold in turn-order: a player who's merely waiting their turn isn't
  // "done", so they must not get the locally-terminal "out of guesses" look.
  // Turn-order gates the actual input separately (`isMyTurn`, passed to BoardCol).
  const canGuess = !isTerminal && selfBudget > 0 && !myConceded

  // ─── The three standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.
  const localFeedbackSlot = useFeedbackSlot('local')

  // Per-status terminal message. Mode-aware so compete-mode winners get the
  // "you won the race" vs "Bea won the race" distinction, while coop stays the
  // simple team verdict. In compete the winner is the one who completed the
  // set (their found_secrets_count hit 3). Memoized on its inputs so the
  // verdict effect below sees one object per outcome, not one per render.
  const selfSecretsFound =
    playerBudgets.find((p) => p.user_id === session.user.id)?.found_secrets_count ?? 0
  const winnerName = (status?.winner_username as string | undefined) ?? 'Someone'
  const selfWon = mode === 'compete' ? selfSecretsFound >= SECRET_COUNT : true
  const over = useMemo(
    () =>
      isTerminal && mode
        ? buildOver({ mode, playState, timerExpired: timer.expired, selfWon, winnerName })
        : null,
    [isTerminal, mode, playState, timer.expired, selfWon, winnerName],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Out of the race while the others play on: out of guesses, or conceded.
  // A standing state with the fill; the verdict outranks it when the game ends.
  useEffect(function showOutOfRace() {
    if (isTerminal || canGuess) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.outOfRace(myConceded, 'Out of guesses — race continues'),
    )
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isTerminal, canGuess, myConceded])

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId`
  // is null in a free-for-all game, so this never fires there. It carries the
  // whose-turn answer on MOBILE, where the InfoCol's TurnStatusLine is
  // off-canvas; without it a frozen board just ignored taps. The holder is
  // read as two primitives so the effect settles in one pass — a fresh
  // `players` array on a re-render would look like a change.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal
  const turnHolder = players.find((p) => p.user_id === currentTurnUserId)
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

  // The Hint / Spoiler in-flight flags (their buttons live in InfoCol, their
  // menu twins in the game menu; the RPCs stay here in the coordinator). Also up
  // here so the menu effect can read them — the guess input + the board shuffle
  // moved into BoardCol.
  const [hinting, setHinting] = useState(false)
  const [spoiling, setSpoiling] = useState(false)

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
  } = useSolutionReveal({
    impliedBy: solvedByMe({
      isCompete: mode === 'compete',
      playState,
      mine: iFoundThemAll,
    }),
  })
  // Per-opponent secrets-found count we've already announced (compete tension).
  const seenOpponentFoundRef = useRef<Map<string, number>>(new Map())

  // ─── The two help asks ─────────────────────────────────
  // Hint (a clue) and spoiler (the answer word itself) both land in the turn log
  // via realtime; coop teammates get a header message. Nothing to do with the
  // return value here — the helper rows arrive over the subscription. The RPC
  // keeps its `request_reveal` name; only the FE vocabulary moved, so that "reveal"
  // on this page means the whole solution at game-over.
  //
  // Both are useCallbacks up here (not plain functions below the early returns)
  // because the bindings below close over them, and a binding is what the
  // button and its menu twin both read.
  const getHint = useCallback(async () => {
    setHinting(true)
    const res = await runRpc<HintAnswer>(db.rpc('request_hint', { target_game: gameId }))
    setHinting(false)
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'hint') {
      // Nothing to show: the clue arrives as a `kind = 'hint'` row over the
      // subscription and lands in the turn log, where it stays. A pill would
      // say the same thing twice and then vanish.
      return
    } else if (res.type === 'ok' && res.data.result === 'no-hint') {
      return
    } else {
      reportUnhandled('request_hint', res)
      return
    }
  }, [gameId, localFeedbackSlot])

  const getSpoiler = useCallback(async () => {
    setSpoiling(true)
    const res = await runRpc<RevealAnswer>(db.rpc('request_reveal', { target_game: gameId }))
    setSpoiling(false)
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'reveal') {
      // Same as the hint: the word arrives as a `kind = 'reveal'` row and the
      // turn log is where it belongs — a spoiler you asked for should stay
      // readable, not flash past.
      return
    } else {
      reportUnhandled('request_reveal', res)
      return
    }
  }, [gameId, localFeedbackSlot])

  // ─── Coop peer events → the header ─────────────────────
  // A teammate's guess (green correct / red not) or help request (amber) is
  // narrated in the header. My own events are excluded — my guesses get the
  // local slot, my hint shows in my own turn log. Compete never reaches here:
  // RLS scopes both guesses AND hints to the caller, and we gate on coop.
  // The shared seen-set producer narrates EVERY new peer event (the old
  // hand-rolled version only looked at the latest row, dropping any that
  // batched between refetches). keyOf is the guess id; own events return null.
  usePeerFeedback({
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
        return FeedbackMessage.peer(member, 'warning', g.kind === 'hint' ? 'got hint' : 'revealed word')
      }
      // "Correct: WORD" / "Wrong: WORD" — the label carries the outcome (with
      // the color), leaving the header's ~26 phone characters for the word
      // itself rather than a sentence around it.
      return FeedbackMessage.peer(
        member,
        g.is_correct ? 'won' : 'lost',
        `${g.is_correct ? 'Correct: ' : 'Wrong: '}${g.word.toUpperCase()}`,
      )
    },
    globalFeedbackSlot,
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
      globalFeedbackSlot.show(FeedbackMessage.peer(member, 'won', 'guessed a word'))
    }
  }, [playerBudgets, mode, players, session.user.id, globalFeedbackSlot])

  // ─── Turn-history viewer ───────────────────────────────
  // Click a turn-log #N to replay that turn's board (the tiles decided up to that
  // turn, with that turn's guessed tile ringed history-blue). Keyed by log
  // position (guesses have no per-turn ordinal). Exit is intrinsic to the hook (a
  // click anywhere / the banner ✕) and so is the keystroke exit: the viewer binds
  // an any-key action that CONSUMES the press, so the key that brings the board
  // back doesn't also play on it.
  const { viewing, viewingId, select: selectTurn, exitViewing } = useHistoryViewer<number>()

  // End / Concede / Restart come from the shared `useStandardGameActions` as
  // bound actions — the menu row, the button and ⌥⌫ are all the same binding, so
  // there is nothing to keep in step. psychicnum's own bits are which `db` they
  // call and the post-replay cleanup (leave the turn-history view; a restart
  // is the player's next action, so it dismisses a lingering result — the
  // verdict itself leaves by its own effect when the terminal state ends).
  //
  // (No reveal-flag reset here: `common.reset_game` clears solution_revealed
  //  server-side, so the same three secrets are hunted blind again.)
  const onRestarted = useCallback(() => {
    exitViewing()
    localFeedbackSlot.dismiss()
    // The same board and the same three secrets, hunted again — so un-ring
    // them. Nothing on the server remembers the reveal any more, which is
    // exactly why this is spelled out.
    resetSecrets()
  }, [exitViewing, localFeedbackSlot, resetSecrets])
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: mode ?? 'coop',
    myConceded,
    localFeedbackSlot,
    onRestarted,
  })

  // New game — a FRESH game (new id, a new random board + secrets) with THIS
  // game's setup + roster + mode, in the same club. psychicnum's create_game
  // samples its board inline, so this is a direct RPC — no edge function.
  // Non-destructive (common.create_game un-currents this game into the club
  // list), so no confirm; the creator jumps in via ctx.goToGame, peers arrive
  // via the game-invitation toast.
  const createNewGame = useCallback(async () => {
    if (!mode) return // menu exists pre-load, but there's no mode to copy yet
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup: setup as unknown as PsychicnumSetup,
        player_user_ids: players.map((p) => p.user_id),
        mode,
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
      goToGame(`psychicnum_${mode}`, res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }, [mode, clubHandle, setup, players, goToGame, localFeedbackSlot])

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (an accidental `+` should not
  // read as "I just lost my game" — the copy says shelved, not ended) and goes
  // straight through at terminal, and the shared run's single flight is what
  // stops a second press dealing a second game.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

  // The two help asks. Grayed rather than dropped when you can't ask: the menu
  // row is what NAMES those glyphs (docs/ui.md → the menu is the legend), so a
  // disabled row still teaches the lightbulb and the bare eye.
  const actHint = useBoundAction('act-hint', {
    describe: () => (canGuess && !hinting ? 'active' : 'disabled'),
    run: getHint,
  })
  const actSpoiler = useBoundAction('act-spoiler', {
    describe: () => (canGuess && !spoiling ? 'active' : 'disabled'),
    run: getSpoiler,
  })

  // Print builds its model from the live state at CLICK time (RLS already
  // scoped `guesses`/`results` to what I may see), so it works mid-game or at
  // the end — and so the menu needn't rebuild when the board changes.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      if (!game) return
      // The board/turn/score judgment (whose marks belong on whose board — one
      // merged track in coop, one PER PLAYER at compete terminal) lives in the
      // pure builder; see pdf/model.ts.
      printPsychicnumPdf(
        buildPsychicnumPrintModel({
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
        }),
      )
    },
  })

  // Ring the three secrets at game-over — or un-ring them. A LOCAL toggle: mine
  // alone, nothing written, no peer affected, so a teammate can go on eyeing the
  // board while I look. Its two faces are what `describe` is for — the words and
  // the glyph move together, because on the icon-only button the glyph is the
  // label. Inert mid-game: there is nothing to ring until the server unshields
  // the secrets at terminal, and nothing to do once solving has shown them.
  const actReveal = useBoundAction('act-reveal', {
    describe: () => {
      if (impliedBySolve) return { state: 'disabled', label: 'Solution already shown' }
      if (secretsShown) return { state: 'active', label: 'Hide secrets', icon: IconHideSolution }
      // Named in the inert case too: the registry's bare "Reveal" would make the
      // row change its words as the game ended, which is not what it says.
      return isTerminal
        ? { state: 'active', label: 'Reveal secrets' }
        : { state: 'disabled', label: 'Reveal secrets', tooltip: "Can't reveal until all end" }
    },
    run: toggleSecrets,
  })

  // The FULL psychicnum game menu. `buildGameMenu` supplies the framing (Help +
  // chat above, Back to club below); the middle is this game's own rows, each
  // one a binding it already made — so a row's words, glyph, key and
  // availability come from the action rather than being typed here a second
  // time. The effect re-runs only when the SHAPE changes, which is why every
  // dep is a stable value.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that
        // isn't its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          // The menu twins of the info column's two help buttons.
          { items: [actHint, actSpoiler] },
          { items: [actPrintBoard] },
          {
            items: [
              // The same pair the terminal action row offers, reachable mid-game too.
              actRestart,
              actNewGame,
              // The menu twin of the terminal row's boxed-eye button — the same
              // binding, so a player who has scrolled past the row reaches the
              // identical toggle, wearing the identical face.
              actReveal,
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actHint, actSpoiler, actPrintBoard,
      actRestart, actNewGame, actReveal])

  if (loading) return <p>Loading game…</p>
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "Game not found." about a dead connection is a confident wrong answer —
  // this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) return <p>Game not found.</p>

  // Concede lives on the common roster (ctx `players` = GamePlayer[]), NOT on
  // psychicnum.players (the budget rows). `myConceded` is derived above (the menu
  // effect needs it before the early returns). `concededIds` marks the players
  // who've bowed out, for the opponent strip's "out" cell.
  const concededIds = new Set(players.filter((p) => p.conceded).map((p) => p.user_id))

  // Guessed words → was-it-a-secret, for the board's permanent green/red.
  // Hint rows are excluded (a hint reveals but doesn't mark a tile). In compete
  // RLS scopes `guesses` to the caller, so this is the viewer's own board.
  const guessed = guesses.filter((g) => g.kind === 'guess')
  const results = new Map(guessed.map((g) => [g.word, g.is_correct]))

  // WHO decided each tile — the identity dot the board draws on a decided tile
  // (coop only; see `<Board>`). Built from the guess rows rather than from
  // `results`, which is what keeps a REVEALED secret dot-less: nobody guessed it.
  const decidedBy = new Map(
    guessed.map((g) => [g.word, players.find((m) => m.user_id === g.user_id)]),
  )

  // Revealing the answer is a STATE CHANGE, not a mark: a secret I've asked to
  // see simply goes green, exactly as a found one is green, because green means
  // "this word is a secret" and the reveal is what makes me know it. It used to be
  // a bright ring around every secret — a channel of its own, a hue outside the
  // palette, and a thing every solution-game would have had to invent separately.
  //
  // Nothing is lost by dropping it. The reveal is personal and reversible now
  // (useSolutionReveal), so "did we find this or am I peeking?" is one toggle
  // away — and in coop it doesn't even need the toggle: a found secret carries its
  // guesser's dot and a revealed one has none.
  const shown = new Map(results)
  if (secretsShown) for (const w of game.secrets ?? []) if (!shown.has(w)) shown.set(w, true)

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

  // (Every command this game offers is bound above the early returns, where the
  // menu is assembled from those same bindings — so a row, a button and a key
  // are one thing rather than three that have to agree.)

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
        results={snap ? snap.results : shown}
        // Who decided each tile — only where the answer can differ: a SHARED
        // board (compete shows you nobody's guesses but your own) with more than
        // one player on it (in a solo game every tile has the same one possible
        // author, so a dot per tile is a label that says "you" nine times). A
        // history snapshot carries the same rows, so it keeps its dots.
        decidedBy={game.mode === 'coop' && players.length > 1 ? decidedBy : null}
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
        // message takes the entry slot (EntryRow's designed swap — same height),
        // so the frozen input explains itself instead of silently ignoring taps.
        isMyTurn={isMyTurn}
        // ── The below-board slot: BoardCol shows results into it and draws it ──
        localFeedbackSlot={localFeedbackSlot}
        // ── Board-scope marks ──
        // The finished board wears its verdict; `over` is the same terminal
        // message the below-board slot shows, so the two can't disagree.
        gameOver={over ? over.outcome : null}
        notMyTurn={waiting}
        myTurnJustStarted={turnFlash}
        // The CAUSE the attention flash reads: a board that changed while this
        // stood still was revealed or re-dealt, not played into. Restart deletes
        // the guess rows, so it moves back down.
        moveCount={guessed.length}
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
        // ── Action row — the same bindings the menu rows are ──
        actHint={actHint}
        actSpoiler={actSpoiler}
        actReveal={actReveal}
        actEndGame={actEndGame}
        actConcede={actConcede}
        actRestart={actRestart}
        actNewGame={actNewGame}
        actBackToClub={menu.actBackToClub}
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
        <CelebrationBlockingModal
          title="You win! 🎉"
          body="All three secret words found."
          onClose={celebration.close}
        />
      )}
    </div>
  )
}

/**
 * Per-status terminal message. `pillText` + `outcome` are the below-board
 * verdict; `infoColText` + `outcome` are the short, bold, color-coded line in
 * the info column (won = green, lost = red, manual end = neutral).
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
}): TerminalMessage {
  // Manual end ('ended', written by psychicnum.end_game) is the uniform neutral
  // terminal shared with the other games — the shared message owns it.
  if (playState === 'ended') return gameEndedTerminalMessage(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { pillText: 'Won: all found', infoColText: 'You won!', outcome: 'won' }
    }
    return {
      pillText: timerExpired ? 'Lost: out of time' : 'Lost: out of guesses',
      infoColText: timerExpired ? 'Timer elapsed' : 'Out of guesses',
      outcome: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { pillText: 'Won: the race', infoColText: 'You won!', outcome: 'won' }
      : { pillText: 'Beaten to the punch', infoColText: `${winnerName} won`, outcome: 'lost' }
  }
  // lost_compete (all exhausted OR timeout in compete)
  return {
    pillText: timerExpired ? 'Out of time — no winner' : 'Out of guesses — no winner',
    infoColText: timerExpired ? 'Timer elapsed' : 'Out of guesses',
    outcome: 'lost',
  }
}
