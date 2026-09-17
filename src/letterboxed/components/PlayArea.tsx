// cs-met-outcome-fix

import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconHideSolution } from '@/common/icons/icons'
import { cls } from '@/common/utils/cls'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { BOARD_SIZE, rejectReason, tailLetter } from '../lib/board'
import { isSuggestion, suggest } from '../lib/solve'
import type { LetterboxedSetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { runEdgeFn, runRpc } from '@/common/supabase/dbResult'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useHistoryViewer } from '@/common/turn-log/useHistoryViewer'
import { useCelebration } from '@/common/terminal/useCelebration'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { historyChainAt, historyLabelAt } from '../lib/history'
import { setupRows } from '../lib/setupSummary'
import { helpPillText } from '../lib/help'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { buildLetterboxedPrintModel } from '../pdf/model'
import { printLetterboxedPdf } from '../pdf/printLetterboxedPdf'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import styles from './PlayArea.module.css'

import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** A row of `status.leaderboard` (compete). */
type LeaderRow = {
  user_id: string
  username?: string
  words_used?: number
  letters_covered?: number
  /** Only on a timed-out race: the server's per-row verdict. Ties are
   *  co-winners (every tied row flagged), so "did I win" is my own row's
   *  flag — never `leaderboard[0]`, whose order among tied rows is
   *  arbitrary. The solve-path win writes `winner_id` instead. */
  won?: boolean
}

/**
 * letterboxed's play surface — shared between the coop and compete manifests.
 * Mode is read off `game.mode` (denormalized on `letterboxed.games_state`).
 *
 * Per-mode rendering:
 *   - **Coop**: ONE chain, shared. Every player's `players_state` row holds
 *     the same words (the server keeps them in lock-step), so the board simply
 *     renders "my" row and everyone sees the same thing.
 *   - **Compete**: each player builds their own chain on the same board.
 *     Rivals' words are hidden until terminal; the OpponentStrip publishes
 *     only the two numbers a race may reveal — letters covered and words used.
 *
 * Move entry is deliberately NOT `useWordSubmit`: that hook models a
 * found-words game (dedup against a growing set, points per word). Here a
 * submission is a chain APPEND whose legality depends on the word before it,
 * so the validation lives in `lib/board.ts` and the commit is a plain RPC.
 */
/**
 * What `submit_word` answers. TWO `ok`s — the word landed, or it landed and
 * covered the twelve. `accepted`, `letters_covered` and `solved` are the
 * fields this RPC has always returned; `result` is what names the case.
 */
type WordAnswer = {
  result: 'accepted' | 'solved'
  accepted: true
  letters_covered: number
  solved: boolean
}

/** What `undo_word` and `clear_chain` answer — one `ok` each, and the pair
 *  shares a call site, so it shares a type. */
type ChainAnswer =
  | { result: 'undone'; word: string; letters_covered: number }
  | { result: 'cleared'; letters_covered: 0 }

/** What `log_help` answers: one `ok`, echoing the row it wrote. */
type HelpAnswer = {
  result: 'logged'
  kind: 'hint' | 'spoiler'
  word: string
}

export function PlayArea(ctx: GamePageCtx) {
  const {
    gameId, isTerminal, playState, players, session, status,
    isMyTurn, currentTurnUserId,
    setup, clubHandle, goToGame, menu, brand, globalFeedbackSlot, title,
  } = ctx
  const { game, playerRows, myRow, events, loading, rowsLoaded, failure } = useGame(gameId, session.user.id)

  // The entry is typed at the window rather than into an input, so nothing here
  // takes focus and Tab has nowhere to go; an empty ring keeps it from walking
  // out to the browser.
  useTabRing([])

  const letterboxedSetup = setup as LetterboxedSetup

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array. Literally the
  // same object, which is a stronger guarantee than "both call the same
  // function" (docs/pdf.md → Setup rows). Empty until the game row lands; the
  // print effect below is guarded on `game` anyway, and the info column doesn't
  // render until after the loading return.
  const summaryRows = useMemo(
    () => (game ? setupRows(letterboxedSetup, game.mode, players, game.sides) : []),
    [letterboxedSetup, game, players],
  )

  const infoSheet = useInfoSheet()
  // The below-board slot: word results, help, End / Concede's not-oks, and
  // the four standing conditions further down.
  const localFeedbackSlot = useFeedbackSlot('local')

  const leaderboard = useMemo(
    () => (status?.leaderboard as LeaderRow[] | undefined) ?? [],
    [status],
  )

  // Confetti at the MOMENT the board is covered. Gated ONLY on the common.games
  // row, which GamePage has already awaited — anything that arrives later would
  // flip false→true after mount and celebrate at someone merely reviewing a
  // finished game (useCelebration's rule 1). A solve names its winner_id; a
  // timed-out race has co-winners instead, flagged per leaderboard row.
  const celebration = useCelebration(
    playState === 'won' ||
      (playState === 'won_compete' &&
        (status?.winner_id === session.user.id ||
          leaderboard.some((e) => e.won && e.user_id === session.user.id))),
  )

  // Only the letters the player typed/clicked. The mandatory first letter is
  // DERIVED from the chain each render (see BoardCol), so playing a word
  // re-seeds the entry without an effect and without stale state.
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  // Turn-history viewer, keyed by POSITION in the rows the log is showing (the
  // log hands them up, so both sides index the same list).
  // BoardCol freezes the entry's capture while viewing, so the viewer's own
  // any-key action has the keys to itself: any keystroke returns to the live
  // board instead of typing behind the banner (the hook binds
  // `act-exit-history`; docs/keyboard-shortcuts.md → the viewer contract).
  const { historyId, isViewingHistory, showHistory, exitHistory } = useHistoryViewer<number>()
  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  const chain = useMemo(() => myRow?.chain ?? [], [myRow])
  const lettersCovered = myRow?.letters_covered ?? 0
  const playable = useMemo(() => new Set(game?.playableWords ?? []), [game?.playableWords])

  const sides = game?.sides ?? ''
  const maxWords = game?.max_words ?? 5

  /** The word this player just had refused, with a nonce beside it: refusing the
   *  same word twice has to shake twice, and a CSS animation only restarts on a
   *  new element — so the letters are keyed on this.
   *
   *  It is about the word AS SUBMITTED, so the next edit ends it — which is why
   *  `editDraft` below clears it rather than the board comparing text. Comparing
   *  text was the first version and it was wrong in a way worth remembering: a
   *  refused ABD shook again on the way to ABDE, because typing toward a longer
   *  word passes through the refused one and the match came back. */
  const [refused, setRefused] = useState<{ word: string; nonce: number } | null>(null)
  /** Every path that changes what is in the box goes through here, so a refusal
   *  cannot outlive the word it was about. */
  const editDraft = useCallback((next: string) => {
    setRefused(null)
    setDraft(next)
  }, [])

  // ─── Move entry ────────────────────────────────────────
  const submit = useCallback(async () => {
    if (!game || busy) return
    const word = (tailLetter(chain) ?? '') + draft
    const bad = rejectReason(word, { sides, chain, playable, maxWords })
    if (bad) {
      localFeedbackSlot.show(FeedbackMessage.result('lost', bad))
      // …and the path says no on the board, where the word is drawn. Nothing
      // left this client — a word the frontend can refuse never reaches the
      // server — so there is no peer half to this mark.
      setRefused((r) => ({ word, nonce: (r?.nonce ?? 0) + 1 }))
      return
    }
    setBusy(true)
    const res = await runRpc<WordAnswer>(
      db.rpc('submit_word', { target_game: gameId, submitted: word }),
    )
    setBusy(false)
    // `rejectReason` above has already refused every shape the FRONTEND can
    // judge alone, in these same words. What still reaches the server is the
    // shared chain moving under you — coop is free-for-all, so a teammate's
    // word can fill the cap, take your word, or change the tail between the
    // local check and this call — plus the game ending, a concede landing, the
    // turn moving. Races, all of them, and the draft stays put: the word was
    // not taken, and it may well be legal again next second.
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'accepted') {
      // The next word's first letter comes from the chain, which the realtime
      // refetch is about to update — so clearing the draft is all that's needed.
      setDraft('')
      setRefused(null)
      // The accepted-word result restates the cap: with no mobile status bar
      // the board shows WHICH letters are covered and the strip shows the
      // words, but "how many words are left" has no ambient home on a phone,
      // so every accepted word says it. A cap-filling word says nothing: the
      // chain-full note (below) is what the player needs to read then.
      const wordsLeft = maxWords - (chain.length + 1)
      if (wordsLeft > 0) {
        localFeedbackSlot.show(
          FeedbackMessage.result(
            'won',
            `${word.toUpperCase()} — ${wordsLeft} ${wordsLeft === 1 ? 'word' : 'words'} left`,
          ),
        )
      } else {
        localFeedbackSlot.dismiss()
      }
      return
    } else if (res.type === 'ok' && res.data.result === 'solved') {
      // The terminal verdict is about to arrive on the play_state, so this
      // says nothing and only hands the entry back.
      setDraft('')
      setRefused(null)
      localFeedbackSlot.dismiss()
      return
    } else {
      reportUnhandled('submit_word', res)
      return
    }
  }, [game, busy, chain, draft, sides, playable, maxWords, gameId, localFeedbackSlot])

  // A board click appends — unless it lands on the letter the word already
  // ends with, which submits (see Board.tsx for why that is unambiguous).
  const pick = useCallback(
    (letter: string) => {
      localFeedbackSlot.dismiss() // a click is the next move, like a keystroke
      setRefused(null) // …and so is no longer the word that was refused
      const word = (tailLetter(chain) ?? '') + draft
      if (word.length > 0 && letter === word[word.length - 1]) {
        void submit()
        return
      }
      setDraft((d) => d + letter)
    },
    [chain, draft, submit, localFeedbackSlot],
  )

  const runChainRpc = useCallback(
    async (fn: 'undo_word' | 'clear_chain') => {
      setBusy(true)
      const res = await runRpc<ChainAnswer>(db.rpc(fn, { target_game: gameId }))
      setBusy(false)
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'undone') {
        // The shortened chain arrives by subscription and the strip redraws
        // itself; all this owes the player is the entry back — taking a word
        // back is a move, so it dismisses the last result like a keystroke.
        setDraft('')
        setRefused(null)
        localFeedbackSlot.dismiss()
        return
      } else if (res.type === 'ok' && res.data.result === 'cleared') {
        setDraft('')
        setRefused(null)
        localFeedbackSlot.dismiss()
        return
      } else {
        reportUnhandled(fn, res)
        return
      }
    },
    [gameId, localFeedbackSlot],
  )
  // The chain strip's × on the last word. `clear_chain` still exists
  // server-side but has no surface: clicking × repeatedly reaches the empty
  // chain, so a bulk clear would be a second way to do the same thing.
  const removeLast = useCallback(() => void runChainRpc('undo_word'), [runChainRpc])

  // ─── Help (coop only) ──────────────────────────────────
  // The search runs HERE, over the board's shipped word list — see lib/solve.ts
  // for why that list ships at all. The server is told only that help was
  // taken, so the turn log agrees with what happened.
  //
  // Two buttons, two rungs of the shared help ladder (docs/ui.md → button
  // iconography): HINT describes the word, SPOILER hands it over. Both are
  // coop-only — in compete, "first past the bar wins" would make either a win
  // button, and the server refuses them there too.
  const askHelp = useCallback(
    async (kind: 'hint' | 'spoiler') => {
      if (!game) return
      // `cleanWords`, NOT `playableWords` — the accept list carries crude,
      // slur, slang and dialect words because the PLAYER may type them, and a
      // hint is the game speaking (docs/common.md → the word list's filter
      // rule). Searching the accept list would let a spoiler answer "the word
      // is BITCH", which is precisely the asymmetry the two tiers exist for.
      //
      // ...UNLESS the clean list is EMPTY, which is not a board — it's a broken
      // derivation. `clean_words` is computed by joining the board's words
      // against `common.words` (games_state), so it empties wholesale when
      // those words aren't in the dictionary at all: a synthetic test fixture,
      // or a dictionary that was never imported. Refusing to hint then tells
      // the player "No words to play" about a board full of words, which is a
      // lie with no remedy. Falling back to the accept list keeps the feature
      // honest; the purity guarantee is worth less than truthfulness in a state
      // where nothing is clean because nothing is known.
      //
      // This does NOT cover a single word going missing (a dictionary deletion
      // shrinking a live board's corpus by one). That case still silently
      // narrows the search — see docs/games/letterboxed.md.
      //
      // The room left under the cap rides along so the search can refuse to
      // point down a road the cap cuts off (the offPar answer below).
      const corpus = game.cleanWords.length > 0 ? game.cleanWords : game.playableWords
      const r = suggest(corpus, sides, chain, maxWords - chain.length)

      if (!isSuggestion(r)) {
        // All three are DIAGNOSIS ONLY — none of them ends in "take a word
        // back" any more. The remedy is the same in every case, the chain
        // strip's × is right there, and the pill is `nowrap` + ellipsis inside
        // a reserved-height slot, so a sentence that doesn't fit is a sentence
        // nobody reads: the off-par one used to run 74 characters and
        // truncated mid-word even on desktop. Spend the characters on WHICH
        // wall you hit, not on the shared way out. A `hint` like the answer
        // it stands in for: the player asked, maybe mid-word, and the reply
        // holds the slot until they have read it and pressed ×.
        const tail = tailLetter(chain as string[])
        // Did I already SPEND a word starting with the tail letter? `suggest`
        // excludes words already in the chain (the server refuses a repeat), so
        // there are two ways to be stuck on G and they deserve different
        // sentences: the board never had a G-word, or it had one and I've used
        // it. The second is the crueller one — the player can see a G-word right
        // there in their own chain — so the message says "other" and stops it
        // reading as a bug. A chain word starting with G means an earlier word
        // ended in G, which is ordinary play, not a corner case.
        const spentTail = tail !== null && chain.some((w) => w.startsWith(tail))
        // `suggest` searched the CLEAN list, so its "stuck" means "no word I'd
        // offer follows the tail" — which is not the same as "no legal move",
        // now that the accept list is wider. Re-ask that question against the
        // accept list, because "No word starts with G" is a claim about the
        // RULES and would be a lie if a crude or dialect G-word is sitting
        // there playable. When one is, the honest answer is the unreachable
        // line: there's a move, just no route the hint can name.
        const stuck =
          r.kind === 'stuck' &&
          !(tail !== null &&
            game.playableWords.some((w) => w.startsWith(tail) && !chain.includes(w)))
        localFeedbackSlot.show(
          FeedbackMessage.hint(
            'warning',
            stuck
              // Naming the letter is the whole message: "no word starts with G"
              // is something the player can act on and remember, where "dead
              // end" only said that something was wrong. A null tail means an
              // empty chain, where `stuck` can't fire (with no tail every word
              // is an opener) — the fallback is for the type, not for a state
              // that happens.
              ? tail
                ? `No ${spentTail ? 'other ' : ''}word starts with ${tail.toUpperCase()}`
                : 'No words to play'
              : r.kind === 'offPar'
                // The one case carrying a number, and the reason it exists: the
                // board IS solvable, just not in the words left under the cap.
                ? `Best solution needs ${r.wordsToFinish} ${r.wordsToFinish === 1 ? 'word' : 'words'}`
                : 'No winning path from here',
          ),
        )
        return
      }

      // A `hint` leaves only by its ×, like every priced help: it sits in the
      // entry's slot until the player has read it, and a keystroke can't take
      // it away by accident (docs/ui.md → Feedback pill).
      //
      // A failed log is shown, not swallowed: the turn log keeps the hint's
      // CONTENT ("Hint: 8 letters: ADG") only when the write SUCCEEDS, so a
      // not-ok goes up over the hint. Nothing is lost by that: the four
      // answers below are one race that only fires once the game is over (a
      // hint has nothing left to be for) and three faults that mean a broken
      // client, so no player is holding a hint they could still have used
      // (Joel, 2026-09-01).
      localFeedbackSlot.show(FeedbackMessage.hint('noted', helpPillText(kind, r.word)))
      const res = await runRpc<HelpAnswer>(
        db.rpc('log_help', { target_game: gameId, word_shown: r.word, kind }),
      )
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'logged') {
        // The help row arrives in the turn log by subscription. The hint
        // above stands, which is the whole of what a successful log owes anyone.
        return
      } else {
        reportUnhandled('log_help', res)
        return
      }
    },
    [game, sides, chain, maxWords, gameId, localFeedbackSlot],
  )
  const takeHint = useCallback(() => void askHelp('hint'), [askHelp])
  const takeSpoiler = useCallback(() => void askHelp('spoiler'), [askHelp])

  // Reveal the seeded pair — LOCAL and reversible (useSolutionReveal), and
  // never automatic: a letterboxed win is covering the twelve letters with ANY
  // chain inside the cap, so the pair is a different, usually much shorter
  // answer the players never saw. It's precisely what the button exists to hand
  // over, and my asking for it doesn't hand it to anyone else. Terminal-only
  // (the gate below), so a player who dropped out can't spoil a live race.
  const { revealed: solutionShown, toggle: toggleSolution } =
    useSolutionReveal()

  // ─── End / Concede / Replay — the shared trio ──────────
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
    const res = await runEdgeFn<CreatedGame>(
      'letterboxed-build-board',
      { target_club: clubHandle, setup, player_user_ids: players.map((p) => p.user_id), mode: gameMode },
    )
    if (res.type === 'not-ok') {
      // THE SAME ENVELOPE, READ DIFFERENTLY. On the setup form a validation is
      // an answer — fix the field and press Start again. Here there is no field
      // and no form, so whatever came back goes in the slot as it reads, over
      // the verdict, until its × is pressed. Shown even for a fault whose
      // modal has already fired centrally — the modal escalates, it does not
      // replace (docs/envelopes.md), so dismissing it must not leave the board
      // silent about why the game didn't start. FOUR of the answers here are
      // form-validations rather than faults — PN214/PN215 (the letters have
      // no solution), PN216/PN217 (the dictionary does not reach it) — and the
      // message wears whatever outcome arrived.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`letterboxed_${gameMode}`, res.data.id)
      return
    } else {
      reportUnhandled('letterboxed-build-board', res)
      return
    }
  }

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game
  // rather than ending it) and goes straight through at terminal. The shared
  // run's single flight is what covers all three triggers at once, which a
  // `disabled` button could not.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

  // ─── The help ladder ───────────────────────────────────
  // Two rungs, COOP ONLY: in a race "first past the bar wins" would make either
  // one a win button, and the server refuses them there too. Hiding rather than
  // disabling is deliberate — a control that named a glyph the surface never
  // shows would teach a lie (crosswords drops its Reveal submenu in compete for
  // the same reason). Both go inert at terminal: there is nothing left to help.
  const actHint = useBoundAction('act-hint', {
    describe: () => {
      if (game?.mode === 'compete') return 'hidden'
      return isTerminal ? 'disabled' : 'active'
    },
    run: takeHint,
  })
  const actSpoiler = useBoundAction('act-spoiler', {
    describe: () => {
      if (game?.mode === 'compete') return 'hidden'
      return { state: isTerminal ? 'disabled' : 'active', label: 'Show the word' }
    },
    run: takeSpoiler,
  })

  // Reveal the seeded pair — the same toggle wearing the same two faces in the
  // menu and in the terminal row, so a player who scrolled past the row can
  // still reach it. Inert until the game is over for EVERYONE.
  const actReveal = useBoundAction('act-reveal', {
    describe: () => {
      if (solutionShown) return { state: 'active', label: 'Hide solution', icon: IconHideSolution }
      // Named in the inert case too: the registry's bare "Reveal" would make the
      // row change its words as the game ended, which is not what it says.
      return { state: isTerminal ? 'active' : 'disabled', label: 'Reveal solution' }
    },
    run: toggleSolution,
  })

  // Print the board — a snapshot at CLICK time (docs/pdf.md). What it may SHOW
  // is decided in pdf/model.ts — notably that the solution prints only once the
  // players have revealed it on screen, which has to hold on paper too.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      if (!game) return
      printLetterboxedPdf(
        buildLetterboxedPrintModel({
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          sides: game.sides,
          mode: game.mode,
          solution: game.solution,
          solutionRevealed: solutionShown,
          players,
          playerRows,
          events,
          selfId: session.user.id,
          summary: `${lettersCovered}/${BOARD_SIZE} letters · ${chain.length}/${maxWords} words`,
          setup: summaryRows,
        }),
      )
    },
  })

  // The FULL letterboxed menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time. The help ladder
  // hides itself in compete, which is why this list is the same in both modes.
  // The effect re-runs only when the SHAPE changes, hence every dep is stable.
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

  // ─── Coop peer narration (global header) ───────────────
  // In coop the chain is shared, so a teammate's word changes MY board; say so.
  usePeerFeedback({
    enabled: game?.mode === 'coop',
    ready: rowsLoaded,
    items: events,
    keyOf: (e) => String(e.id),
    messageFor: (e) => {
      if (e.user_id === session.user.id) return null
      const member = players.find((p) => p.user_id === e.user_id)
      // Peer help is TWO messages (Joel's spec, 2026-08-05): the header names
      // the ACT ("● joel got a hint"), and the CONTENT — the same hint the
      // requester saw — lands in the local slot, so a hint one player asks
      // for is a hint the whole team has. Showing into the local slot from
      // here is sound: messageFor runs once per NEW event inside the hook's
      // effect (the seen-set), never during render.
      if (e.kind === 'hint' || e.kind === 'spoiler') {
        if (e.word) localFeedbackSlot.show(FeedbackMessage.hint('noted', helpPillText(e.kind, e.word)))
        return FeedbackMessage.peer(member, 'noted', e.kind === 'hint' ? 'got a hint' : 'revealed a word')
      }
      const what =
        e.kind === 'played'
          ? `${e.word?.toUpperCase() ?? ''} (${e.letters_covered}/${BOARD_SIZE})`
          : e.kind === 'undone'
            ? // Named, not "the last word": the peers' boards just lost it, so
              // say WHICH word came off (the log's "took back GJB" agrees).
              `undid ${e.word?.toUpperCase() ?? 'the last word'}`
            : 'cleared the chain'
      return FeedbackMessage.peer(member, e.kind === 'played' ? 'won' : 'noted', what)
    },
    globalFeedbackSlot,
  })

  // ─── The four standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome. `leaderboard` is already memoized on the status.
  const isCompete = game?.mode === 'compete'
  const timedOut = status?.timed_out === true
  const statusOutcome = (status?.outcome as string | undefined) ?? null
  const winnerId = (status?.winner_id as string | undefined) ?? null
  const over = useMemo(
    () =>
      isTerminal && gameMode
        ? buildOver({
            mode: gameMode,
            playState,
            timedOut,
            statusOutcome,
            winnerId,
            leaderboard,
            selfId: session.user.id,
            lettersCovered,
            wordsUsed: chain.length,
          })
        : null,
    [isTerminal, gameMode, playState, timedOut, statusOutcome, winnerId, leaderboard,
     session.user.id, lettersCovered, chain.length],
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
  // indicator.
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

  // The cap is spent and the board isn't covered. There is no legal move left
  // but taking a word back, so the board and the entry both go inert rather
  // than letting a player compose a sixth word only to be refused it — and
  // the slot says so in the entry's place.
  const chainFull = chain.length >= maxWords && lettersCovered < BOARD_SIZE
  useEffect(function showChainFull() {
    if (!chainFull) return
    const id = localFeedbackSlot.show(FeedbackMessage.note('Chain is full — remove a word'))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, chainFull])

  if (loading) return <div className={styles.loading}>Loading…</div>
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "Game not found." about a dead connection is a confident wrong answer —
  // this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) return <div className={styles.empty}>Game not found.</div>

  // The rows the BOARD's viewer replays: the shared chain's events in coop, my
  // own in compete — the wordle shape. The log derives the same list for
  // itself and makes `#N` a live handle ONLY while its picker shows exactly
  // this list (`boardIsShown`), so a selected index is always an index here.
  // (An earlier version had the log hand its rows UP through a state-setting
  // effect; the fresh array re-fired it every render and hit React's
  // update-depth limit.)
  const boardRows =
    game.mode === 'compete' ? events.filter((e) => e.user_id === session.user.id) : events

  // The chain the BOARD shows: a past move's while viewing, the live one
  // otherwise. Folding rather than reconstructing — see lib/history.ts.
  const shownChain = isViewingHistory && historyId !== null ? historyChainAt(boardRows, historyId) : chain
  const historyLabel =
    isViewingHistory && historyId !== null ? historyLabelAt(boardRows, historyId) : null

  // TWO different gates, and conflating them is a bug: a full chain freezes the
  // ENTRY (there is no word to compose) but must leave the chain EDITABLE,
  // because taking a word back is the only move left. Passing the entry's gate
  // to the chain strip hid the × exactly when it was needed.
  const chainEditable = !isTerminal && !myConceded && isMyTurn
  const entryDisabled = !chainEditable || chainFull

  const wordsByUser = new Map(
    playerRows.map((r) => [r.user_id, r.word_count]),
  )
  const coveredByUser = new Map(
    playerRows.map((r) => [r.user_id, r.letters_covered]),
  )

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        sides={sides}
        chain={shownChain}
        liveChain={chain}
        historyLabel={historyLabel}
        onExitHistory={exitHistory}
        draft={draft}
        onDraftChange={editDraft}
        refused={refused}
        onSubmit={() => void submit()}
        onPick={pick}
        onRemoveLast={removeLast}
        // The slot the entry row draws in its place: a word result, a hint,
        // "you're out", whose turn it is, the full chain, the verdict.
        localFeedbackSlot={localFeedbackSlot}
        entryDisabled={entryDisabled}
        chainEditable={chainEditable}
        busy={busy}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          over={over}
          isTerminal={isTerminal}
          isLocallyDone={isLocallyDone}
          isTurnGame={letterboxedSetup.coop_style === 'turns'}
          currentTurnUserId={currentTurnUserId}
          chain={chain}
          maxWords={maxWords}
          lettersCovered={lettersCovered}
          solution={game.solution}
          events={events}
          players={players}
          selfId={session.user.id}
          isCompete={isCompete}
          wordsByUser={wordsByUser}
          coveredByUser={coveredByUser}
          concededIds={concededIds}
          setupRows={summaryRows}
          actHint={actHint}
          actSpoiler={actSpoiler}
          actReveal={actReveal}
          solutionShown={solutionShown}
          actEndGame={actEndGame}
          actConcede={actConcede}
          actRestart={actRestart}
          actNewGame={actNewGame}
          actBackToClub={menu.actBackToClub}
          historyId={historyId}
          onShowHistory={showHistory}
        />
      </InfoSheet>
      {/* No modal at terminal (docs/ui.md → Terminal results) — the result is
          in the below-board slot and the info column, so a modal would just
          interrupt. */}
      {/* Confetti at the MOMENT the board is covered — coop's win, and compete's
          for whoever got there first. useCelebration never pops on mount, so
          reopening a finished game doesn't re-celebrate. */}
      {celebration.show && (
        <CelebrationBlockingModal title="All twelve! 🐍" onClose={celebration.close} />
      )}
    </div>
  )
}

/**
 * Maps the terminal play_state to the shared `TerminalMessage`.
 *
 * Coop wins by covering all twelve inside the cap; its losses are the clock
 * and the group calling it. Compete's win is FIRST past that same bar, which
 * is why the race ends on a solve rather than continuing — there is no
 * "fewest" left to improve on. A timed-out race still resolves, on the most
 * letters covered, so a clock expiry produces a result rather than crowning
 * nobody.
 */
function buildOver({
  mode,
  playState,
  timedOut,
  statusOutcome,
  winnerId,
  leaderboard,
  selfId,
  lettersCovered,
  wordsUsed,
}: {
  mode: 'coop' | 'compete'
  playState: string
  /** `status.timed_out` — the clock ended it. */
  timedOut: boolean
  /** `status.outcome`, or null when the status carries none. */
  statusOutcome: string | null
  /** `status.winner_id` — the solve-path winner, or null. */
  winnerId: string | null
  leaderboard: LeaderRow[]
  selfId: string
  lettersCovered: number
  wordsUsed: number
}): TerminalMessage {
  if (mode === 'coop') {
    if (playState === 'won') {
      return {
        outcome: 'won',
        pillText: `Won: all twelve in ${wordsUsed} ${wordsUsed === 1 ? 'word' : 'words'}`,
        infoColText: 'All letters used!',
      }
    }
    if (playState === 'lost') {
      return timedOut
        ? { outcome: 'lost', pillText: `Lost: out of time at ${lettersCovered}/12`, infoColText: 'Out of time' }
        : { outcome: 'lost', pillText: `Lost: stopped at ${lettersCovered}/12`, infoColText: 'Called it' }
    }
    return gameEndedTerminalMessage('coop')
  }

  // Compete.
  if (playState === 'won_compete') {
    if (winnerId === selfId) {
      return {
        outcome: 'won',
        pillText: `Won: all twelve in ${wordsUsed} ${wordsUsed === 1 ? 'word' : 'words'}`,
        infoColText: 'You got there first!',
      }
    }
    // A timeout resolves on coverage instead of a solve, so the verdict comes
    // off the leaderboard's per-row `won` flags rather than from a winner_id.
    // Exact ties are CO-winners (the server flags every tied row), so read my
    // own row — leaderboard[0] would tell one tied winner they lost.
    if (timedOut) {
      const winners = leaderboard.filter((e) => e.won)
      const iWon = winners.some((e) => e.user_id === selfId)
      const covered = winners[0]?.letters_covered ?? 0
      if (iWon) {
        return {
          outcome: 'won',
          pillText:
            winners.length > 1
              ? `Won: tied at most letters (${covered}/12)`
              : `Won: most letters (${covered}/12)`,
          infoColText: 'Most letters when time ran out',
        }
      }
      const names = winners.map((e) => e.username ?? 'a player').join(' & ')
      return {
        outcome: 'lost',
        pillText: `Lost: ${names || 'a player'} covered more`,
        infoColText: 'Out of time',
      }
    }
    const name = leaderboard.find((e) => e.user_id === winnerId)?.username
    return {
      outcome: 'lost',
      pillText: `Lost: ${name ?? 'a player'} got there first`,
      infoColText: 'Beaten to it',
    }
  }
  if (playState === 'lost_compete') {
    return statusOutcome === 'conceded'
      ? { outcome: 'lost', pillText: 'Lost: everyone conceded', infoColText: 'Everyone dropped out' }
      : { outcome: 'lost', pillText: 'Lost: nobody covered the board', infoColText: 'Nobody finished' }
  }
  return gameEndedTerminalMessage('compete')
}
