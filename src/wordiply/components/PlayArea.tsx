// cs-fixed-outcome-fix

import { useCallback, useEffect, useMemo, useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { db } from '../db'
import { useGame, type EventRow } from '../hooks/useGame'
import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { historySnapshot } from '../lib/history'
import type { Outcome } from '@/common/outcomes/outcomes'
import { ANSWER_OUTCOME, type Answer } from '../lib/answer'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { Actor } from '@/common/members/member'
import { useWordSubmit, type WordEntry } from '@/shared/word-hunt/useWordSubmit'
import { useAnnouncedMark } from '@/common/board-marks/useAnnouncedMark'
import { lengthScore } from '../lib/scoring'
import type { WordiplySetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { MAX_GUESSES } from './GuessBoard'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { runEdgeFn, runRpc } from '@/common/supabase/dbResult'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { buildWordiplyPrintModel } from '../pdf/model'
import { printWordiplyPdf } from '../pdf/printWordiplyPdf'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { describeReveal } from '@/common/reveal/describeReveal'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import styles from './PlayArea.module.css'

import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** A row of `status.leaderboard`. Mid-game only `guesses_used` is set (no
 *  scores leak early); the score fields fill in at terminal. */
type LeaderRow = {
  user_id: string
  guesses_used?: number
  length_score?: number
  letter_count?: number
  won?: boolean
}


/**
 * wordiply's play surface — shared between the coop and compete manifests.
 * Mode is read off `game.mode` (denormalized on `wordiply.games_state`).
 *
 * Per-mode rendering:
 *   - **Coop**: the five guesses are shared (the whole team fills one
 *     board); everyone sees every guess live. Terminal shows the team's
 *     length score.
 *   - **Compete**: each player has their own five-guess board (opponents'
 *     guesses are RLS-hidden mid-game; the OpponentStrip shows only guesses
 *     used). Terminal reveals every score + the winner via the comparator.
 *
 * The live readout is ONLY each guess's length (a badge on its row); the
 * length score + letter count + longest word are terminal-only.
 */
/** What `wordiply.submit_guess` puts in `data`.
 *
 *  The two results reach DIFFERENT call sites, which is what `fe_legal` says:
 *  `commit` claims the word is legal and can only be told `accepted`, while
 *  `recordReject` reports a rejection the FE already made and asks which guard
 *  applied. A duplicate is neither — nothing is recorded, so it refuses. */
type GuessResult =
  | { result: 'accepted'; length: number; guesses_used: number; is_terminal: boolean }
  | { result: 'rejected'; reason: 'too_short' | 'missing_base' | 'not_a_word' }
  | null

export function PlayArea(ctx: GamePageCtx) {
  const {
    gameId, isTerminal, playState, players, session, status,
    isMyTurn, currentTurnUserId,
    setup, clubHandle, goToGame, menu, brand, globalFeedbackSlot, title,
  } = ctx
  const { game, guesses, validGuesses, loading, rowsLoaded, failure } = useGame(gameId)

  // The entry is typed at the window rather than into an input, so nothing here
  // takes focus and Tab has nowhere to go; an empty ring keeps it from walking
  // out to the browser.
  useTabRing([])

  const wordiplySetup = setup as WordiplySetup

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (docs/pdf.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(wordiplySetup, game?.mode ?? 'coop', players),
    [wordiplySetup, game, players],
  )

  const infoSheet = useInfoSheet()

  // ─── The best possible word shows only when asked ──────
  // The two readouts that matter — the length score and the letter count — say how well
  // you did WITHOUT naming the word, so a table that wants to keep guessing at
  // it can. Local and reversible, so my looking doesn't end anyone else's think.
  const { revealed: solutionShown, toggle: toggleSolution } =
    useSolutionReveal()

  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  // The board's rows. Coop shares one track (every guess); compete shows only
  // the caller's own (opponents' rows are RLS-hidden mid-game and, once the
  // reveal opens them at terminal, must NOT crowd my board — my five guesses
  // stay mine). Already ordered by id from useGame.
  const myGuesses = useMemo<EventRow[]>(
    () =>
      game?.mode === 'compete'
        ? validGuesses.filter((g) => g.user_id === session.user.id)
        : validGuesses,
    [validGuesses, game?.mode, session.user.id],
  )
  const boardRows = useMemo(() => myGuesses.map((g) => ({ word: g.word, length: g.length })), [myGuesses])

  // The board viewer. wordiply's board is five rows all on screen, so replaying
  // an ACCEPTED word shows what you can already see — but most of this log is
  // REJECTS, which are on no board at all, and opening one is the only way to
  // see the table as it stood when that word was tried. So the list it folds
  // includes rejects; which player's rows those are is settled below.
  // (Above the loading guard, like every other hook here.)
  const { historyId, showHistory, exitHistory } = useHistoryViewer<number>()
  const guessesUsed = boardRows.length
  const longest = boardRows.reduce((m, g) => Math.max(m, g.length), 0)
  const letters = boardRows.reduce((s, g) => s + g.length, 0)

  // Compete terminal reveal — each opponent's words. Mid-game their rows are
  // RLS-hidden so `guesses` holds only mine; at terminal the RLS opens them,
  // so group the now-visible non-self rows by player (in play order — useGame
  // orders by id). Empty in coop / mid-game → the reveal renders null.
  const opponentReveal = useMemo(() => {
    if (game?.mode !== 'compete' || !isTerminal) return []
    const byUser = new Map<string, { word: string; length: number }[]>()
    for (const g of validGuesses) {
      if (g.user_id === session.user.id) continue
      const rows = byUser.get(g.user_id) ?? []
      rows.push({ word: g.word, length: g.length })
      byUser.set(g.user_id, rows)
    }
    return players
      .filter((p) => p.user_id !== session.user.id)
      .map((player) => ({ player, guesses: byUser.get(player.user_id) ?? [] }))
  }, [validGuesses, game?.mode, isTerminal, players, session.user.id])

  const base = game?.base ?? ''

  // ─── The local feedback slot ────
  // The slot above the keyboard: the word engine's rejections, End / Concede's
  // not-oks, and the standing conditions below. At terminal it takes the
  // keyboard's place.
  const localFeedbackSlot = useFeedbackSlot('local')

  // ─── Move entry + own-move results (shared engine) ────
  // The legal list ships to the FE, so a guess validates locally against a
  // Set. useWordSubmit owns the typed word, the results it shows into the
  // slot, and the optimistic commit + dedup; wordiply supplies the lookup
  // (points = the word's LENGTH), the submit_guess RPC, and the reject reason.
  const legalSet = useMemo(() => new Set(game?.legalWords ?? []), [game?.legalWords])

  /** The engine's four answers in the SERVER's vocabulary — it reports one
   *  `not_legal` for two different things, and which one it was decides whether
   *  a word was a miss or a rule broken. Everything that shows an answer goes
   *  through here and then through `ANSWER_OUTCOME`, so the pill, the row and
   *  the log cannot disagree about one word. */
  const answerFor = useCallback(
    (w: string, answer: 'accepted' | 'too_short' | 'not_legal' | 'already_found'): Answer =>
      answer !== 'not_legal'
        ? answer
        : base !== '' && !w.includes(base.toLowerCase())
          ? 'missing_base'
          : 'not_a_word',
    [base],
  )

  // ─── The answer, on the row the word was typed into ────────────
  // The shared engine consumes the box the instant you submit — it has to, or a
  // double-tap double-fires — so without this the word simply VANISHES for a
  // round trip: gone from the active row, not yet arrived as a landed one.
  //
  // So the row holds the word while its answer shows. An accepted word stays
  // (optimistically, since this game knows its own legal list) until the real
  // row lands behind it; a refused one is shown for the beat and then goes,
  // which is also how long its color is up.
  /** My own word, drawn in the next row while its answer shows. The engine
   *  clears the box on submit, so without this the word vanishes the instant it
   *  is judged — and a refused word has no row of its own to be judged ON.
   *
   *  It is NOT the mark: the mark is timed for everyone. An ACCEPTED word
   *  outlives its mark here, because it stays until the server's row lands
   *  behind it; a refused one goes when the mark does, since nothing is coming
   *  to replace it. */
  const [held, setHeld] = useState<
    { word: string; length: number; awaitingRow: boolean } | null
  >(null)
  /** The answer being shown on whichever row the word is in. Always timed, for
   *  everyone: a mark that waits for your next move is a mark still claiming
   *  something about a board you have moved on from. */
  const [flash, showFlash] = useAnnouncedMark<{ word: string; outcome: Outcome }>()
  const showAnswer = useCallback(
    (w: string, outcome: Outcome, peer = false) => {
      // A teammate's word lands in a row nobody was watching, so it is
      // ANNOUNCED: the attention flash says where, and once it fades the
      // answer's color says what. My own word needs only the color — I am
      // looking at the row I typed into.
      //
      // A teammate's word is already a row of its own; mine is not one yet —
      // accepted, it is about to be, and refused, it never will be.
      // `awaitingRow` is the difference between the two kinds of held row: an
      // ACCEPTED word is standing in for a server row that is on its way, and
      // steps aside when it lands. Anything else — refused, already used — has
      // no row coming, so it stays put for the mark's life and goes with it,
      // which is what `onEnd` is for.
      if (!peer) setHeld({ word: w, length: w.length, awaitingRow: outcome === 'won' })
      showFlash(
        { word: w, outcome },
        { announce: peer, onEnd: outcome === 'won' ? undefined : () => setHeld(null) },
      )
    },
    [showFlash],
  )

  // …and a held row that is WAITING for its server row goes the moment that row
  // lands. A word already on the board is not waiting for anything — guessing it
  // again is answered on the row you just typed it into, not on the one from
  // four turns ago.
  const takenOver =
    held !== null && held.awaitingRow && boardRows.some((r) => r.word === held.word)
  if (takenOver) setHeld(null)

  const { word, setWord, lastWord, submit } =
    useWordSubmit({
      mode: game?.mode ?? 'coop',
      userId: session.user.id,
      isTerminal: isTerminal || myConceded,
      // Must be LONGER than the base, so the minimum length is base + 1.
      minWordLength: base.length + 1,
      localFeedbackSlot,
      // The board row shows an accepted word and its length — the one live
      // readout — so the engine says nothing on an accept.
      hideAccepted: true,
      foundWords: guesses, // ALL rows: the server dedups on rejects too, so a re-try reads as 'already found' here rather than round-tripping
      lookup: (w): WordEntry | null =>
        legalSet.has(w) ? { word: w, points: w.length, isBonus: false } : null,
      // ONE ok answer reaches this path. `rejected` is the other one the RPC can
      // give, but only to `recordReject` below: the FE gates all three reasons
      // before committing, so a structural break claimed legal here comes back
      // as PN367, a fault. Every refusal means the guess was NOT recorded.
      commit: async (e) => {
        const res = await runRpc<GuessResult>(
          db.rpc('submit_guess', { target_game: gameId, word: e.word }),
        )
        if (res.type === 'not-ok') {
          return res
        } else if (res.type === 'ok' && res.data?.result === 'accepted') {
          return null
        } else {
          reportUnhandled('submit_guess', res)
          return null
        }
      },
      // Every answer, on the row the word was typed into, in this game's own
      // reading of them: a word the list does not know is not a bad move — you
      // are hunting for the longest word you can think of, and a miss is a miss
      // — and a word you already used is the same kind of nothing-happened. Too
      // short and "must contain the stem" are RULES, and breaking one costs a
      // turn like any other move.
      onAnswer: (w, answer) => showAnswer(w, ANSWER_OUTCOME[answerFor(w, answer)]),
      // …and the pill says the same, because it is the same table. A word the
      // list does not know is a WARNING here and not a loss: this game asks you
      // to try long, strange words, and answering one of them like an error
      // would be mean. boggle and the bee games read the same event as `lost`,
      // which is why the engine holds no default and every game says its own.
      outcomeFor: (w, answer) => ANSWER_OUTCOME[answerFor(w, answer)],
      // Not in the legal set: either it doesn't contain the base, or it's not
      // a word. (Too-short is handled by minWordLength above.)
      explainReject: (w) =>
        answerFor(w, 'not_legal') === 'missing_base'
          ? `must contain "${base.toUpperCase()}"`
          : 'not a word',
      // Record the rejection too — in wordiply a rejected guess is a TURN (see
      // the guesses table header). We hand the server `fe_legal: false` and it
      // re-derives WHICH guard applies, since it owns the structural rules; a
      // structural reject also costs the caller their go in turn-by-turn coop.
      // Fire-and-forget: the result already says the same thing, so a failed
      // write must not change what the player sees.
      recordReject: (w) => {
        void runRpc<GuessResult>(
          db.rpc('submit_guess', { target_game: gameId, word: w, fe_legal: false }),
        ).then((res) => {
          if (res.type === 'ok' && res.data?.result === 'rejected') {
            // The expected answer: the turn is logged and the server has told
            // us which guard applied. Nothing to show — the result saying the
            // same thing went up before this call.
          } else if (res.type === 'not-ok') {
            // Log-and-swallow: the result already told the player, so a failed
            // write must not change what they see — but it must not vanish
            // silently either (the log would just be missing a row). `runRpc`
            // has raised the modal for the faults among these.
            console.error('recording a rejected guess failed', res.message)
          } else {
            reportUnhandled('submit_guess', res)
          }
        })
      },
    })

  // ─── End / Concede / Replay — the shared trio ──────────
  // The byte-identical shared handlers (useStandardGameActions); only the
  // replay sentence is wordiply's. Its not-oks land in the same slot as a
  // rejected word. New game stays below — its create path diverges per game.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: game?.mode === 'compete' ? 'compete' : 'coop',
    myConceded,
    localFeedbackSlot,
  })

  // Reveal the best possible word — a LOCAL display toggle: it shows the word to
  // me alone, writes nothing, and affects no peer. Inert until the game is over
  // for everyone, so a player who conceded can't spoil a race.
  const actReveal = useBoundAction('act-reveal', {
    // "best solution" rather than the bare default: what this shows is the best
    // word that existed, which a winner never has to have found.
    describe: () => describeReveal({ noun: 'best solution', revealed: solutionShown, isTerminal }),
    run: toggleSolution,
  })

  // A plain function, rebuilt every render: the binding below reads it at click
  // time, so `setup` and `players` are whatever the last realtime refetch left,
  // and the action's own identity doesn't move when they do.
  const gameMode = game?.mode
  const createNewGame = async () => {
    if (!gameMode) return
    const res = await runEdgeFn<CreatedGame>(
      'wordiply-build-board',
      { target_club: clubHandle, setup, player_user_ids: players.map((p) => p.user_id), mode: gameMode },
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
      goToGame(`wordiply_${gameMode}`, res.data.id)
      return
    } else {
      reportUnhandled('wordiply-build-board', res)
      return
    }
  }

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game:
  // create_game clears the club's current-view flag, so it stays resumable — the
  // copy says shelved, not ended) and goes straight through at terminal, where
  // there is nothing to interrupt. The shared run's single flight is what stops a
  // second press dealing a second base.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

  // Compete leaderboard (off the live status jsonb) → per-player metrics.
  // Memoized because the print model (and so the menu effect) depends on it: the
  // `?? []` fallback would otherwise mint a new array every render and rebuild
  // the whole game menu each time.
  const leaderboard = useMemo(
    () => (status?.leaderboard as LeaderRow[] | undefined) ?? [],
    [status],
  )

  // ─── GamePage menu ─────────────────────────────────────
  // Print the board — a snapshot at CLICK time (docs/pdf.md). What it may show is
  // decided in pdf/model.ts — notably wordiply's terminal-only reveal, which has
  // to hold on paper too. RLS already scopes `guesses` to what I may see, so a
  // mid-game compete print carries only my own rows without needing a filter.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      if (!game) return
      printWordiplyPdf(
        buildWordiplyPrintModel({
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          base,
          maxWordLength: game.max_word_length,
          longestWord: game.longestWords[0] ?? null,
          solutionRevealed: solutionShown,
          mode: game.mode,
          isTerminal,
          guesses,
          players,
          selfId: session.user.id,
          guessesUsed,
          maxGuesses: MAX_GUESSES,
          lengthScore: lengthScore(longest, game.max_word_length),
          letterCount: letters,
          leaderboard,
          setup: summaryRows,
        }),
      )
    },
  })

  // The FULL wordiply menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time. Reveal wears the
  // same two faces here as on the terminal button, because it IS that binding.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          { items: [actRestart, actNewGame, actReveal] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actRestart, actNewGame, actReveal, actPrintBoard])

  // ─── Coop peer-guess narration (global header) ─────────
  // coop's guesses are club-wide, so a teammate's guess arrives in `guesses`;
  // surface it with its length (the one live readout — no scores). Own guesses
  // show on the board row.
  usePeerFeedback({
    enabled: game?.mode === 'coop',
    // Gate the seed on the guesses fetch (separate from the header that sets
    // `game`), so a coop rejoin doesn't replay the backlog as a burst.
    ready: rowsLoaded,
    items: validGuesses,
    keyOf: (r) => `${r.user_id}:${r.word}`,
    messageFor: (r) => {
      if (r.user_id === session.user.id) return null
      const member = players.find((p) => p.user_id === r.user_id)
      // No verb: the dot names who, the word is the news, the count is its
      // length. "played" earned no room in the header's ~26 phone characters.
      // …and their word lands on the shared board, so the row says so too.
      showAnswer(r.word, ANSWER_OUTCOME.accepted, true)
      return FeedbackMessage.peer(
        member,
        ANSWER_OUTCOME.accepted,
        `${r.word.toUpperCase()} (${r.length})`,
      )
    },
    globalFeedbackSlot,
  })

  // ─── The three standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome. The one person it can name — a sole compete
  // winner — is resolved here to name + color; a tie is a string of names.
  const isCompete = game?.mode === 'compete'
  const statusOutcome = (status?.outcome as string | undefined) ?? null
  const winnerId = (status?.winner_user_id as string | undefined) ?? null
  const winners = useMemo(() => leaderboard.filter((e) => e.won), [leaderboard])
  const soleWinner = players.find((p) => p.user_id === (winners[0]?.user_id ?? winnerId))
  const soleWinnerName = soleWinner?.username
  const soleWinnerColor = soleWinner?.color
  const tiedNames = winners
    .map((e) => players.find((p) => p.user_id === e.user_id)?.username ?? 'a player')
    .join(' & ')
  const over = useMemo(
    () =>
      isTerminal && gameMode
        ? buildOver({
            mode: gameMode,
            playState,
            statusOutcome,
            longest,
            letters,
            maxWordLength: game?.max_word_length ?? 0,
            winnerId,
            winners,
            selfId: session.user.id,
            soleWinner:
              soleWinnerName === undefined
                ? undefined
                : { username: soleWinnerName, color: soleWinnerColor ?? '' },
            tiedNames,
          })
        : null,
    [isTerminal, gameMode, playState, statusOutcome, longest, letters, game?.max_word_length,
     winnerId, winners, session.user.id, soleWinnerName, soleWinnerColor, tiedNames],
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

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId`
  // is null in a free-for-all game, so this never fires there. On a phone the
  // InfoCol's TurnStatusLine is off-canvas, so this is the only whose-turn
  // indicator beside the frozen keyboard.
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

  if (loading) return <div className={styles.loading}>Loading…</div>
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "Game not found." about a dead connection is a confident wrong answer —
  // this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) return <div className={styles.empty}>Game not found.</div>

  const guessesByUser = new Map(leaderboard.map((e) => [e.user_id, e.guesses_used ?? 0]))
  const scoreByUser = new Map(leaderboard.map((e) => [e.user_id, e.length_score ?? 0]))

  const active = !isTerminal && !myConceded && guessesUsed < MAX_GUESSES

  // WHOSE board a `#N` replays is the row's own author's. Mid-game compete that
  // is always me — RLS shows me nothing else — but at TERMINAL every player's
  // rows arrive, and a `#N` on one of theirs replays THEIR five slots. Coop is
  // one shared track, so the filter is a no-op there. Rejects stay in the list
  // either way: the builder has to find the row to fold up to it.
  const historyRow = historyId !== null ? guesses.find((g) => g.id === historyId) : undefined
  const historyRows =
    isCompete && historyRow ? guesses.filter((g) => g.user_id === historyRow.user_id) : guesses
  const historySnap = historyId !== null ? historySnapshot(historyRows, historyId) : null
  // Named only when the board on screen is not the viewer's own — which only
  // compete can be. Coop is one shared board, so a teammate's row replays the
  // board you are already looking at.
  const historyActor =
    isCompete && historyRow && historyRow.user_id !== session.user.id
      ? players.find((p) => p.user_id === historyRow.user_id)
      : undefined

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        base={base}
        guesses={historySnap?.rows ?? boardRows}
        isViewingHistory={historySnap !== null}
        historyLabel={historySnap?.historyLabel ?? ''}
        historyActor={historyActor}
        onExitHistory={exitHistory}
        // `!isMyTurn` folds in turn-order (coop only): a waiting player's entry
        // freezes. Always true for free-for-all / solo.
        entryDisabled={!active || !isMyTurn}
        word={word}
        onChange={setWord}
        onSubmit={submit}
        held={held}
        flash={flash}
        // The slot the keyboard area draws: a rejection, "you're out", whose
        // turn it is, the verdict — so the frozen keyboard always has its
        // explanation beside it, matching every other game's below-board
        // treatment.
        localFeedbackSlot={localFeedbackSlot}
        lastWord={lastWord}
        isTerminal={isTerminal}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          allGuesses={guesses}
          historyId={historyId}
          onShowHistory={showHistory}
          isCompete={isCompete}
          isTerminal={isTerminal}
          over={over}
          isLocallyDone={isLocallyDone}
          currentTurnUserId={currentTurnUserId}
          guessesUsed={guessesUsed}
          longest={longest}
          letters={letters}
          maxWordLength={game.max_word_length}
          longestWord={game.longestWords[0] ?? null}
          solutionShown={solutionShown}
          base={base}
          opponentReveal={opponentReveal}
          players={players}
          selfId={session.user.id}
          guessesByUser={guessesByUser}
          scoreByUser={scoreByUser}
          concededIds={concededIds}
          actReveal={actReveal}
          actEndGame={actEndGame}
          actConcede={actConcede}
          actRestart={actRestart}
          actNewGame={actNewGame}
          actBackToClub={menu.actBackToClub}
          setup={wordiplySetup}
          setupRows={summaryRows}
        />
      </InfoSheet>
      {/* No modal at terminal (docs/ui.md → Terminal results) — the result is
          shown in the below-board slot (BoardCol) + the info column (score bar,
          letters, reveal), so a modal would just interrupt. wordiply has no win
          state, so there's no celebration either. */}
    </div>
  )
}

/**
 * Maps the terminal play_state to the shared `TerminalMessage`. The scores
 * that were hidden all game land here: `outcome` + `pillText` are the
 * below-board verdict, `outcome` + `infoColText` the short info-column line.
 *
 * Verdicts lead with the outcome word (`Won:` / `Lost:` / `Ended:`) and carry
 * no trailing period — the pill is a one-line, ellipsising row (~48 chars on a
 * phone), so it's a LABEL, not prose. A compete loss names WHO beat you: a
 * sole winner rides as `actor`, so the pill draws the mention the way every
 * other message names someone. A CO-win has 2+ winners, so it stays a plain
 * string (a row of dots would read as noise).
 *
 * Coop: no clear win — the team just did as well as it did — so every coop
 * terminal reports the result neutrally, manual end included; the clock is
 * the one coop loss.
 * Compete: `won_compete` → self won / tied vs a named winner;
 * `lost_compete` → a collective loss naming its cause (all conceded, or a
 * nobody-scored race that ran out of time / guesses); `ended` + manual → the
 * shared neutral message.
 */
function buildOver({
  mode,
  playState,
  statusOutcome,
  longest,
  letters,
  maxWordLength,
  winnerId,
  winners,
  selfId,
  soleWinner,
  tiedNames,
}: {
  mode: 'coop' | 'compete'
  playState: string
  /** `status.outcome`, or null when the status carries none. */
  statusOutcome: string | null
  longest: number
  letters: number
  maxWordLength: number
  /** `status.winner_user_id` — null on a co-win the server didn't break. */
  winnerId: string | null
  /** The leaderboard rows flagged `won` — every tied player on a co-win. */
  winners: LeaderRow[]
  selfId: string
  /** The one winner when there is exactly one, resolved to name + color. */
  soleWinner: Actor | undefined
  /** The winners' names joined with " & ", for a co-win. */
  tiedNames: string
}): TerminalMessage {
  if (mode === 'compete') {
    if (playState === 'won_compete') {
      // winner_user_id is null on co-winners (a tie the server didn't break);
      // every tied player is flagged won in the leaderboard, so I read my own
      // row rather than trust a single-winner id. The winners share one score
      // (they tied on it), so any winner row gives the % to show.
      const iWon = winnerId === selfId || (winnerId === null && winners.some((e) => e.user_id === selfId))
      const pct = winners[0]?.length_score ?? 0
      const shared = winners.length > 1
      if (iWon) {
        return {
          pillText: shared ? `Won: tied at ${pct}%` : `Won: ${pct}%`,
          infoColText: shared ? 'You tied for the win!' : 'You won!',
          outcome: 'won',
        }
      }
      if (shared) {
        return {
          pillText: `${tiedNames} tied at ${pct}%`,
          infoColText: `${tiedNames} tied`,
          outcome: 'lost',
        }
      }
      return {
        pillText: `won at ${pct}%`,
        infoColText: `${soleWinner?.username ?? 'a player'} won`,
        outcome: 'lost',
        actor: soleWinner,
      }
    }
    // The three compete collective losses all land on `lost_compete`, told
    // apart by `outcome`: the last racer dropping out (common.concede), or a
    // nobody-scored race ending by the clock / by the table spending all its
    // guesses (wordiply._finish_compete's best_score=0 path). Each names its
    // cause, agreeing with the club card's `Lost (…)` label.
    if (playState === 'lost_compete') {
      if (statusOutcome === 'conceded') {
        return { pillText: 'Lost: all conceded', infoColText: 'All conceded', outcome: 'lost' }
      }
      if (statusOutcome === 'timeout') {
        return { pillText: 'Lost: out of time, nobody scored', infoColText: 'Out of time', outcome: 'lost' }
      }
      return { pillText: 'Lost: out of guesses, nobody scored', infoColText: 'Nobody scored', outcome: 'lost' }
    }
    // ended / manual — no winner. The shared neutral message, so the one
    // terminal every game has stays worded in one place.
    return gameEndedTerminalMessage('compete')
  }

  // coop — the team's collaborative result. There's no "win" in coop (you just
  // did as well as you did), so spending the guesses or stopping on purpose are
  // NEUTRAL (a gray outcome color, `Ended:` — the vocabulary's word for "over,
  // nobody won or lost"), and the score is reported either way: the numbers are
  // more use than a bare "game ended".
  //
  // The CLOCK is the one exception, and the one way a coop table loses: the
  // team set a timer and didn't spend its five guesses inside it (see
  // wordiply._finish_coop). Same reading scrabble coop gives its own clock.
  const pct = lengthScore(longest, maxWordLength)
  if (playState === 'lost') {
    return {
      pillText: `Lost: out of time, ${pct}%`,
      infoColText: `Length ${pct}%`,
      outcome: 'lost',
    }
  }
  return {
    pillText: `Ended: ${pct}%, ${letters} letters`,
    infoColText: `Length ${pct}%`,
    outcome: 'neutral',
  }
}
