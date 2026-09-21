// cs-blessed-psychicnum

import { runRpc } from '@/common/supabase/dbResult'
import { useEffect, useMemo, useRef } from 'react'
import { cls } from '@/common/utils/cls'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { answerMessage, peerAnswerMessage } from '../lib/answer'
import { SECRET_COUNT, type PsychicnumSetup } from '../lib/setup'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { describeReveal } from '@/common/reveal/describeReveal'
import { solvedByMe, useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { setupRows } from '../lib/setupSummary'
import { memberById } from '@/common/members/memberList'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { db } from '../db'
import { useGame, type EventRow, type PlayerRow, type PsychicnumGame } from '../hooks/useGame'
import { printPsychicnumPdf } from '../pdf/printPsychicnumPdf'
import { buildPsychicnumPrintModel } from '../pdf/model'
import { historySnapshot } from '../lib/history'
import { buildTerminalMessage } from '../lib/terminal'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { StateLine } from './StateLine'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { Loading } from '@/common/loading/Loading'
import { NoSuchGamePage } from '@/common/game-page/NoSuchGamePage'
import styles from './PlayArea.module.css'
import '../theme.css'  // psychicnum-specific tokens (empty today, see file)
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * What `request_hint` answers. TWO `ok`s: `hint` carries the row's text whether
 * or not there was a clue to give, so `result` is the only thing that tells a
 * real clue from "this word has none".
 */
type HintAnswer = {
  result: 'hint' | 'no-hint'
  hint: string
}

/** What `request_spoiler` answers: one `ok`, carrying the secret handed over. */
type SpoilerAnswer = {
  result: 'spoiler'
  word: string
}

/**
 * The three gates in front of psychicnum's play surface: the read is out, the
 * read failed, or there is no such game. Everything below starts with a game
 * in hand, which is why the surface never writes `game?.`.
 *
 * The game's menu rows and its `+` arrive WITH the game, because the surface
 * that binds them mounts with it — a row for a game not yet read could only
 * gray itself or lie.
 */
export function PlayAreaLoader(ctx: GamePageCtx) {
  const { game, players: playerBudgets, guesses, loading, failure } = useGame(ctx.gameId)

  if (loading) return <Loading />
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "there's no game here" about a dead connection is a confident wrong answer
  // — this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Reaching this means the COMMON row exists — `GamePageGate` and
  // `GamePageLoader` each checked — and the psychicnum one does not: a torn
  // write, or a game deleted while somebody had the board open. `detail` goes
  // to the console, never to the page.
  if (!game) return <NoSuchGamePage detail={`rows=0 view=psychicnum.games_state game=${ctx.gameId}`} />

  return (
    <PlayArea
      {...ctx}
      game={game}
      playerBudgets={playerBudgets}
      guesses={guesses}
      // The one place the setup blob is narrowed. `GamePageCtx` types it
      // `Record<string, unknown>` for every game; below, it is this game's.
      setup={ctx.setup as unknown as PsychicnumSetup}
    />
  )
}

type PlayAreaProps = Omit<GamePageCtx, 'setup'> & {
  // The loaded game row. Non-null by construction — the loader holds the gates.
  game: PsychicnumGame
  // Per-player guess budgets (`psychicnum.players`), club-wide visible.
  playerBudgets: PlayerRow[]
  // This player's event log (`psychicnum.events`); RLS scopes it in compete.
  guesses: EventRow[]
  // This game's setup blob, narrowed once by the loader.
  setup: PsychicnumSetup
}

/**
 * psychicnum's play surface — the coordinator. It holds no board and draws no
 * control of its own: `<BoardCol>` takes the board and the guess entry,
 * `<InfoCol>` the readouts and the action row, and this component decides what
 * each of them is handed.
 *
 * Both manifests mount it, and `mode` (`game.mode`, fixed at create-game time)
 * is what differs — who a narration names, whose progress a readout counts,
 * and which verdict `lib/terminal.ts` builds. The rule it keeps across that
 * split: green means "a secret was found" in both modes, so nothing here
 * teaches a compete-only color.
 *
 * Above it, `<GamePage>` owns members, the timer, play_state, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it.
 */
function PlayArea({
  game,
  playerBudgets,
  guesses,
  session,
  gameId,
  players,
  playState,
  isTerminal,
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
}: PlayAreaProps) {
  const mode = game.mode

  // ─── Page hooks ────────────────────────────────────────
  // What this surface IS, before anything this game knows: where Tab may go,
  // where the info column sits on a phone, and the two things that fire at a
  // moment rather than describing a state — the win's confetti and the frame's
  // flash when the turn becomes mine.

  // The guess is typed at the window rather than into an input, so nothing here
  // takes focus and Tab has nowhere to go; an empty ring keeps it from walking
  // out to the browser.
  useTabRing([])

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // reached by the header's InfoSwitchButton. Desktop is unchanged.
  const infoSheet = useInfoSheet()

  // My budget row (`psychicnum.players`) — looked up once; Derived reads the
  // budget off it, and the reveal and the verdict read the count.
  const myBudgetRow = playerBudgets.find((p) => p.user_id === session.user.id)
  const selfSecretsFound = myBudgetRow?.found_secrets_count ?? 0
  const iFoundThemAll = selfSecretsFound >= SECRET_COUNT

  // Confetti the moment the win is MINE — the coop team's third secret, or my
  // own third in a race — and never on mount: opening an already-won game
  // stays quiet. It is the ONLY modal at terminal; the verdict itself rides
  // the below-board pill, and a racer who lost gets that and nothing more.
  //
  // Both gates are correct on the first render, which is what `useCelebration`
  // requires: `playState` comes with the page, and `playerBudgets` comes with
  // the game — the loader holds this surface back until both are in hand.
  const celebration = useCelebration(
    playState === 'won' || (playState === 'won_compete' && iFoundThemAll),
  )

  // The board frame flashes yellow the moment the move becomes mine. The dim is
  // what says "not yours"; its lifting is a removal, and you are by definition
  // looking elsewhere when it happens. Never fires in a free-for-all game.
  const turnFlash = useTurnStartFlash(isMyTurn)

  // ─── Derived ───────────────────────────────────────────
  // Who I am in this game and what I may still do, read off the props and
  // `playerBudgets`. Named here because the sections below share them: the
  // standing conditions, the bindings' `describe`s, and both columns all ask
  // the same questions, and they must not answer them differently.

  // I dropped out of a compete race (a real loss; the others keep racing). Read
  // from the common roster (prop `players`), not from `playerBudgets` — those
  // are guess budgets. (`concededIds` below is the same fact for everyone.)
  const myConceded = players.find((p) => p.user_id === session.user.id)?.conceded ?? false

  // My remaining guesses, and from it the "can I still act?" gate — read by the
  // Hint / Spoiler bindings, so their menu rows and their InfoCol buttons gray
  // together.
  const selfBudget = myBudgetRow?.guesses_remaining ?? 0
  // Still in this game: it is live, I have guesses left, and I have not
  // conceded. Drives the terminal-vs-play LOOK in both columns.
  //
  // NOT about whose turn it is — waiting your turn is still playing, and
  // `isMyTurn` (passed to BoardCol) is what gates the actual input.
  //
  // A club member WATCHING reads false here through `selfBudget`'s `?? 0`
  // rather than through a test of their own — so give that default a non-zero
  // placeholder and a watcher silently becomes a player.
  const isStillPlaying = !isTerminal && selfBudget > 0 && !myConceded

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array (common/setup-form/doc.md →
  // Setup rows). Literally the same object, which beats "both call the same
  // function": this is the game whose two hand-written lists had drifted into
  // reporting different facts on paper than on screen.
  const summaryRows = useMemo(
    () => setupRows(setup, mode, players),
    [setup, mode, players],
  )

  // The terminal secrets reveal — derived state, because the Reveal binding
  // below reads it. The three secrets are NOT shown just because the game ended:
  // `replay_board` hunts the SAME board and the SAME three secrets again (see
  // its RPC comment), so auto-revealing on a loss would leave Restart with
  // nothing to find.
  //
  // The ask is LOCAL and reversible (useSolutionReveal): mine alone, so a
  // teammate can go on eyeing the board for the three while I look, and the
  // same control hides them again. The secrets themselves are on every client
  // once the game is terminal, so this is purely which tiles go green.
  //
  // `impliedBy: iFoundThemAll` is the exception: finding all three IS the win
  // here, and a found secret's tile is already green — so a solver is looking
  // at the answer key and showing it adds nothing. MY three, not the game's
  // verdict: compete's loser found fewer.
  const {
    revealed: secretsShown,
    toggle: toggleSecrets,
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: solvedByMe({
      isCompete: mode === 'compete',
      playState,
      mine: iFoundThemAll,
    }),
  })

  // ─── The local slot, and its three standing conditions ─
  // Each condition is an effect on a primitive edge that shows on true and
  // retracts in its cleanup — the slot draws whichever ranks highest. The local
  // slot is the one for messages about ME; a peer's go in the header's.
  const localFeedbackSlot = useFeedbackSlot('local')

  // Per-status terminal message. Mode-aware so compete-mode winners get the
  // "you won the race" vs "Bea won the race" distinction, while coop stays the
  // simple team verdict. In compete the winner is the one who completed the
  // set (their found_secrets_count hit 3). Memoized on its inputs so the
  // verdict effect below sees one object per outcome, not one per render.
  const winnerName = (status?.winner_username as string | undefined) ?? 'Someone'
  // WHY it ended is the server's word (`status.reason`), never the browser
  // clock's: the RPC that ended the game wrote the reason, and the club-list
  // label reads the same column.
  const reason = status?.reason as string | undefined
  const selfWon = mode === 'compete' ? iFoundThemAll : true
  const terminalMessage = useMemo(
    () =>
      isTerminal
        ? buildTerminalMessage({ mode, playState, reason, selfWon, winnerName })
        : null,
    [isTerminal, mode, playState, reason, selfWon, winnerName],
  )
  useEffect(function showTerminalVerdict() {
    if (!terminalMessage) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(terminalMessage))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, terminalMessage])

  // Out of the race while the others play on: out of guesses, or conceded.
  // A standing state with the fill; the verdict outranks it when the game ends.
  useEffect(function showOutOfRace() {
    if (isTerminal || isStillPlaying) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.outOfRace(myConceded, 'Out of guesses — race continues'),
    )
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isTerminal, isStillPlaying, myConceded])

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId`
  // is null in a free-for-all game, so this never fires there. It carries the
  // whose-turn answer on MOBILE, where the InfoCol's TurnStatusLine is
  // off-canvas; without it a frozen board just ignored taps. The holder is
  // read as two primitives so the effect settles in one pass — a fresh
  // `players` array on a re-render would look like a change.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal
  const turnHolder = players.find((p) => p.user_id === currentTurnUserId)
  const turnHolderName = turnHolder?.username
  const turnHolderColor = turnHolder?.color
  useEffect(function showWaiting() {
    if (!waiting) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.waiting(
        turnHolderName === undefined
            ? undefined
            : { username: turnHolderName, color: turnHolderColor ?? '' },
      ),
    )
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, waiting, turnHolderName, turnHolderColor])

  // ─── Narration — what a PEER did, in the header slot ───
  // Both of these are about somebody else, which is what puts them in the
  // global slot rather than the local one (docs/ui.md → the two feedback
  // slots). Each mode reaches exactly one of them.

  // A teammate's guess (green correct / red not), or their hint or spoiler, is
  // narrated in the header. My own events are excluded — my guesses get the
  // local slot, my hint shows in my own event log. Compete never reaches here:
  // RLS scopes both guesses AND hints to the caller, and we gate on coop.
  // The shared seen-set producer narrates EVERY new peer event (the old
  // hand-rolled version only looked at the latest row, dropping any that
  // batched between refetches). keyOf is the guess id; own events return null.
  usePeerFeedback({
    enabled: mode === 'coop',
    items: guesses,
    keyOf: (g) => String(g.id),
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → local
      const member = memberById(players, g.user_id)
      // The row is somebody else's — the line above returned for my own — so
      // every answer here is a `_peer` one, which is what gives a spoiler words
      // that do not name the word.
      const { outcome, text } = peerAnswerMessage(g)
      return FeedbackMessage.peer(member, outcome, text)
    },
    globalFeedbackSlot,
  })

  // When an opponent's public found_secrets_count ticks up, narrate "X guessed a
  // secret word" — the COUNT, never which word (that stays private). It reads as
  // the HIT it is, the same as coop's line for a peer's correct guess: green
  // means "they found a word" in both modes, so the player doesn't maintain a
  // compete-only color-meaning. Watches the players rows; the ref seeds silently
  // on first load so history isn't replayed.
  // Per-opponent secrets-found count we've already announced (compete tension).
  const seenOpponentFoundRef = useRef<Map<string, number>>(new Map())
  useEffect(function announceOpponentProgress() {
    if (mode !== 'compete') return
    for (const p of playerBudgets) {
      if (p.user_id === session.user.id) continue
      const prev = seenOpponentFoundRef.current.get(p.user_id)
      seenOpponentFoundRef.current.set(p.user_id, p.found_secrets_count)
      if (prev === undefined) continue  // first sighting — seed, don't announce
      if (p.found_secrets_count <= prev) continue
      const member = memberById(players, p.user_id)
      // `found_peer`, not `hit_peer`: in compete a racer may learn THAT an
      // opponent found a secret and never which, so the answer that names a
      // word is not reachable from here.
      const { outcome, text } = answerMessage({ answerType: 'found_peer' })
      globalFeedbackSlot.show(FeedbackMessage.peer(member, outcome, text))
    }
  }, [playerBudgets, mode, players, session.user.id, globalFeedbackSlot])

  // ─── The turn-history viewer ───────────────────────────
  // Click an event-log #N to replay that turn's board (the tiles decided up to that
  // turn, with that turn's guessed tile ringed history-blue). Keyed by the row's
  // own id, resolved against the rows the board replays (`lib/history.ts` says
  // why not by position). Exit is intrinsic to the hook (a
  // click anywhere / the banner ✕) and so is the keystroke exit: the viewer binds
  // an any-key action that CONSUMES the press, so the key that brings the board
  // back doesn't also play on it.
  const { historyId, showHistory, exitHistory } = useHistoryViewer<number>()

  // ─── The commands, bound ───────────────────────────────
  // Every command this game offers, in one order that three readers keep: this
  // block, the info column's prop list, and the menu's rows. A binding is what
  // the button, the menu row and the key all read, so none of them can drift
  // from another — and `pending` grays every surface of one for the length of
  // its run, which is why no handler here carries an in-flight flag of its own.
  // None of them is a `useCallback`: `useBoundAction` reads its live half
  // through a ref it refreshes every render, and the bound value's identity
  // turns on `pending` alone.

  // The shared trio — End / Concede / Restart. psychicnum's own bit is which
  // `db` they call; a restart needs nothing else from this game, because the
  // page unmounts the whole play surface when the run changes
  // (common/game-page/doc.md). The turn-history view, a lingering result and
  // the revealed secrets all go with it, so the same three are hunted blind
  // again.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode,
    myConceded,
    localFeedbackSlot,
  })

  // Hint (a clue) and spoiler (the answer word itself) both land in the event
  // log via realtime; coop teammates get a header message. Nothing to do with
  // the return value here — those rows arrive over the subscription. "Reveal"
  // on this page means one thing only: the whole solution at game-over, which
  // is local FE state and no RPC at all.
  async function getHint() {
    const res = await runRpc<HintAnswer>(db.rpc('request_hint', { target_game: gameId }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'hint') {
      // Nothing to show: the clue arrives as a `kind = 'hint'` row over the
      // subscription and lands in the event log, where it stays. A pill would
      // say the same thing twice and then vanish.
      return
    } else if (res.type === 'ok' && res.data.result === 'no-hint') {
      return
    } else {
      reportUnhandled('request_hint', res)
      return
    }
  }

  async function getSpoiler() {
    const res = await runRpc<SpoilerAnswer>(db.rpc('request_spoiler', { target_game: gameId }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'spoiler') {
      // Same as the hint: the word arrives as a `kind = 'spoiler'` row and the
      // event log is where it belongs — a spoiler you asked for should stay
      // readable, not flash past.
      return
    } else {
      reportUnhandled('request_spoiler', res)
      return
    }
  }

  // The hint and the spoiler. Grayed rather than dropped when you can't ask:
  // the menu row is what NAMES those glyphs (docs/ui.md → the menu is the
  // legend), so a disabled row still teaches the lightbulb and the bare eye.
  const actHint = useBoundAction('act-hint', {
    // Three states, not two: GONE once the game is over (there is no guess left
    // to nudge), gray while the game is live and you are out of guesses, live
    // otherwise. The in-flight beat is `pending`'s to gray, not this one's.
    describe: () => (isTerminal ? 'hidden' : isStillPlaying ? 'active' : 'disabled'),
    run: getHint,
  })
  const actSpoiler = useBoundAction('act-spoiler', {
    // Same three states as the hint above.
    describe: () => (isTerminal ? 'hidden' : isStillPlaying ? 'active' : 'disabled'),
    run: getSpoiler,
  })

  // Show the three secrets, or hide them again — a LOCAL toggle: nothing is
  // written and no peer is affected, so a teammate can go on hunting while I
  // look. Both faces come from `describeReveal`, which is where the rule for
  // every game's reveal lives.
  const actReveal = useBoundAction('act-reveal', {
    describe: (asker) => {
      // The one narrowing this game adds: no BUTTON until EVERYONE is done, so
      // a player who dropped out cannot spoil a race that is still running. The
      // menu row and the Help list keep it all game, grayed, because they NAME
      // the glyph (docs/ui.md → the menu is the legend).
      if (isStillPlaying && asker === 'button') return 'hidden'
      return describeReveal({ noun: 'solution', revealed: secretsShown, impliedBySolve, isTerminal })
    },
    run: toggleSecrets,
  })

  // New game — a FRESH game (new id, a new random board + secrets) with THIS
  // game's setup + roster + mode, in the same club. psychicnum's create_game
  // samples its board inline, so this is a direct RPC — no edge function.
  // Non-destructive (common.create_game un-currents this game into the club
  // list), so no confirm; the creator jumps in via ctx.goToGame, peers arrive
  // via the game-invitation toast.
  async function createNewGame() {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup,
        player_user_ids: players.map((p) => p.user_id),
        mode,
      }),
    )
    if (res.type === 'not-ok') {
      // Shown even for a fault whose modal has already fired: a modal escalates
      // rather than replaces, so the board must not go silent when it is
      // dismissed. See docs/envelopes.md.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`psychicnum_${mode}`, res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (an accidental `+` should not
  // read as "I just lost my game" — the text says shelved, not ended) and goes
  // straight through at terminal, and the shared run's single flight is what
  // stops a second press dealing a second game.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    // Reachable all game from the menu and `+` — NEW_GAME_CONFIRM is written
    // for that ("will be shelved, not lost", "Keep playing"). A BUTTON only at
    // the end, where "deal another" is what you came to the row for.
    describe: (asker) => (asker === 'button' && !isTerminal ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time (RLS already
  // scoped `guesses`/`results` to what I may see), so it works mid-game or at
  // the end — and so the menu needn't rebuild when the board changes.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      // The board/turn/score judgment (whose marks belong on whose board — one
      // merged track in coop, one PER PLAYER at compete terminal) lives in the
      // pure builder; see pdf/model.ts.
      printPsychicnumPdf(
        buildPsychicnumPrintModel({
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          mode,
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

  // ─── The menu ──────────────────────────────────────────
  // The FULL psychicnum game menu. `buildGameMenu` supplies the framing (Help +
  // chat above, Back to club below); the middle is this game's own rows, each
  // one a binding it already made — so a row's words, glyph, key and
  // availability come from the action rather than being typed here a second
  // time. The effect re-runs only when the SHAPE changes, which is why every
  // dep is a stable value.
  //
  // **The rows read as the info column's action row does, divider for divider.**
  // The two are views of the same bindings, so a player who learned the row
  // finds the menu in the same order (docs/playarea.md). Print is the one row
  // with no twin in the row, and sits after them.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that
        // isn't its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          // The menu twins of the info column's hint and spoiler buttons.
          { items: [actHint, actSpoiler] },
          {
            items: [
              // The menu twin of the terminal row's boxed-eye button — the same
              // binding, so a player who has scrolled past the row reaches the
              // identical toggle, wearing the identical face.
              actReveal,
              // The same pair the terminal action row offers, reachable mid-game too.
              actRestart,
              actNewGame,
            ],
          },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actHint, actSpoiler, actReveal,
      actRestart, actNewGame, actPrintBoard])

  // ─── Render ────────────────────────────────────────────
  // Everything below is derived fresh each render and read only by the JSX —
  // nothing here is a hook, which is why it may sit after the menu effect.

  // Concede lives on the common roster (ctx `players` = GamePlayer[]), NOT on
  // psychicnum.players (the budget rows). `concededIds` marks the players who've
  // bowed out, for the opponent strip's "out" cell.
  const concededIds = new Set(players.filter((p) => p.conceded).map((p) => p.user_id))

  // Guessed words → was-it-a-secret, for the board's permanent green/red.
  // Hint and spoiler rows are excluded — neither marks a tile. In compete
  // RLS scopes `guesses` to the caller, so this is the viewer's own board.
  const guessed = guesses.filter((g) => g.kind === 'guess')
  const results = new Map(guessed.map((g) => [g.word, g.is_correct]))

  // WHO decided each tile — the identity dot the board draws on a decided tile
  // (coop only; see `<Board>`). Built from the guess rows rather than from
  // `results`, which is what keeps a REVEALED secret dot-less: nobody guessed it.
  const decidedBy = new Map(
    guessed.map((g) => [g.word, players.find((m) => m.user_id === g.user_id)]),
  )

  // A revealed secret joins `results` as a HIT rather than getting a mark of its
  // own: green means "this word is a secret", and the reveal is what makes me
  // know it. Found-versus-peeked stays answerable — the toggle un-reveals, and in
  // coop a found secret carries its guesser's dot while a revealed one has none.
  const shown = new Map(results)
  if (secretsShown) for (const w of game.secrets ?? []) if (!shown.has(w)) shown.set(w, true)

  // When a past turn is open, `historySnap` is that turn's board (else null =
  // live) — the tiles decided up to that turn + the tile it decided (ringed). Stable:
  // a later realtime guess only grows the log past historyId, so a past turn holds.
  //
  // WHOSE board it replays is the row's own author's. Mid-game compete that is
  // always me (RLS shows me nothing else), but at TERMINAL every player's rows
  // arrive, and a `#N` on one of theirs has to fold THEIR guesses — folding the
  // whole table would draw a board nobody ever played. Coop is one shared board,
  // so the filter is a no-op there.
  const historyRow = historyId !== null ? guesses.find((g) => g.id === historyId) : undefined
  const historyRows =
    mode === 'compete' && historyRow
      ? guesses.filter((g) => g.user_id === historyRow.user_id)
      : guesses
  const historySnap = historyId !== null ? historySnapshot(historyRows, historyId) : null
  // Named only when the board on screen is not the viewer's own — which only
  // compete can be. Coop is one shared board, so a teammate's row replays the
  // board you are already looking at and there is no "whose" to answer.
  const historyActor =
    mode === 'compete' && historyRow && historyRow.user_id !== session.user.id
      ? memberById(players, historyRow.user_id)
      : undefined

  // Progress toward the 3 secrets. Coop = the team's distinct finds (everyone's
  // correct guesses are visible); compete = the caller's own count.
  const teamFound = new Set(
    guesses.filter((g) => g.kind === 'guess' && g.is_correct).map((g) => g.word),
  ).size
  const found = mode === 'coop' ? teamFound : selfSecretsFound

  // The info column's numbers.
  const totalGuesses = setup.guesses
  const guessesUsed = totalGuesses - selfBudget

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
        results={historySnap ? historySnap.results : shown}
        // Who decided each tile — only where the answer can differ: a SHARED
        // board (compete shows you nobody's guesses but your own) with more than
        // one player on it (in a solo game every tile has the same one possible
        // author, so a dot per tile is a label that says "you" nine times). A
        // history snapshot carries the same rows, so it keeps its dots.
        decidedBy={mode === 'coop' && players.length > 1 ? decidedBy : null}
        historyLitWord={historySnap?.historyLitWord ?? null}
        // ── History viewer ──
        historyLabel={historySnap?.historyLabel ?? null}
        historyActor={historyActor}
        onExitHistory={exitHistory}
        // ── Guess dispatch (BoardCol owns submit_guess) ──
        gameId={gameId}
        isStillPlaying={isStillPlaying}
        // Turn-order: gates the ENTRY input only (not the play-vs-terminal look
        // above). Always true for free-for-all / solo. When false the waiting
        // message takes the entry slot (WordEntryArea's designed swap — same height),
        // so the frozen input explains itself instead of silently ignoring taps.
        isMyTurn={isMyTurn}
        // ── The below-board slot: BoardCol shows results into it and draws it ──
        localFeedbackSlot={localFeedbackSlot}
        // ── Board-scope marks ──
        // The finished board wears its verdict; it is the same terminal message
        // the below-board slot shows, so the two can't disagree.
        gameOver={terminalMessage ? terminalMessage.outcome : null}
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
        isCompete={mode === 'compete'}
        terminalMessage={terminalMessage}
        isStillPlaying={isStillPlaying}
        myConceded={myConceded}
        // ── Turn-order: the shell's one answer (gates the help line), and the
        //    holder's id (null for free-for-all games → no TurnStatusLine) ──
        isMyTurn={isMyTurn}
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
        // ── Action row — the same bindings, in the order the menu lists them ──
        actHint={actHint}
        actSpoiler={actSpoiler}
        actReveal={actReveal}
        actRestart={actRestart}
        actNewGame={actNewGame}
        actConcede={actConcede}
        actEndGame={actEndGame}
        actBackToClub={menu.actBackToClub}
        // ── Setup disclosure ──
        setupRows={summaryRows}
        // ── Turn-history log ──
        guesses={guesses}
        isTerminal={isTerminal}
        historyId={historyId}
        onShowHistory={showHistory}
        />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board pill + the info-column outcome line, and MY
          win gets the celebration instead — once, when it happens. */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body={mode === 'compete' ? 'You found all three first.' : 'All three secret words found.'}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
