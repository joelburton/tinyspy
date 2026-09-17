// cs-fixed-outcome-fix

import { useEffect, useMemo, useRef, useState } from 'react'
import { cls } from '@/common/utils/cls'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { runRpc } from '@/common/supabase/dbResult'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { Actor } from '@/common/members/member'
import { useWordSubmit, wordWithBonusDot, type WordEntry } from '@/shared/word-hunt/useWordSubmit'
import { memberById } from '@/common/members/memberList'
import { readLeaderboard } from '@/shared/bee-games/foundWordsLeaderboard'
import { currentRankIndex, RANKS } from '@/shared/rank-ladder/rankLadder'
import { ANSWER_OUTCOME } from '../lib/answer'
import type { WordwheelSetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { buildDisplayRows } from '@/shared/word-hunt/foundWordsDisplayRows'
import { buildRevealWords } from '@/shared/word-hunt/revealWords'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { printWordwheelPdf } from '../pdf/printWordwheelPdf'
import { buildWordSections } from '@/common/pdf/wordSections'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/bee-games/foundWordsPlayArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import styles from './PlayArea.module.css'

import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * wordwheel's play surface — shared between the coop and compete
 * manifests. Mode is read off `game.mode` (denormalized at
 * create_game time, surfaced on `wordwheel.games_state`).
 *
 * Per-mode rendering:
 *   - **Coop**: shared score, shared rank bar, shared WordList
 *     showing every player's finds with per-finder color, score
 *     reaches Genius at 70% of total. Terminal verdict on
 *     `ended` is Genius (rank ≥ 6) vs Stopped (rank < 6).
 *   - **Compete**: caller-only score, caller-only WordList (RLS
 *     filters peer rows during play), OpponentStrip in the
 *     side panel showing each opponent's current rank — that's
 *     the entire "what opponents know about you" surface during
 *     play. Terminal verdict on `won_compete` is "You won the
 *     race!" vs "Beaten to the punch."; `ended` with
 *     `outcome=timeout`/`manual` is "No winner at <rank>".
 *
 * Cross-cutting chrome (header / pause / chat / timer) lives in
 * `<GamePage>` above this component.
 */
/** What `wordwheel.submit_word` puts in `data`. All four mean the row landed:
 *  three classifications echoing the caller's own flags, plus `won` — the word
 *  crossed the target rank and ended the game. */
type SubmittedWord =
  | { result: 'accepted'; points: number }
  | { result: 'bonus'; points: number }
  | { result: 'pangram'; points: number }
  | { result: 'won'; points: number }
  | null

export function PlayArea(ctx: GamePageCtx) {
  const {
    gameId, isTerminal, playState, players, session, status,
    setup, clubHandle, goToGame, menu, brand, title,
    // The page's header slot (peer/opponent events, via usePeerFeedback + the
    // compete rank effect) — as opposed to the local slot below, which carries
    // the player's own word result. Two different surfaces.
    globalFeedbackSlot,
  } = ctx
  const { game, foundWords, loading, rowsLoaded, failure } = useGame(gameId)

  // The entry is typed at the window rather than into an input, so nothing here
  // takes focus and Tab has nowhere to go; an empty ring keeps it from walking
  // out to the browser.
  useTabRing([])

  const wordwheelSetup = setup as WordwheelSetup

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (docs/pdf.md → Setup rows).
  // The wheel's own letters ride along as the recap's `Letters` row. Passed as
  // its stored center/outer; the row alphabetizes them, so every player — and
  // the printout — names this wheel the same way, whatever the local shuffle.
  const summaryRows = useMemo(
    () =>
      setupRows(
        wordwheelSetup,
        game?.mode ?? 'coop',
        players,
        game ? { center: game.center_letter, outer: game.outer_letters } : null,
      ),
    [wordwheelSetup, game, players],
  )

  // Does this board have a genuinely wider bonus dictionary? With the legal band
  // equal to the required band, "bonus" degenerates to nothing but the words the
  // clean filter removed from required (non-american / slang / crude / slur) —
  // which is not a list to hand anyone as "here's what you missed". Gates BOTH the
  // missed-bonus reveal and the word list's KIND filter, so the two can't disagree
  // about whether this board has bonus words. Same rule as boggle's.
  const hasBonus = wordwheelSetup.legal !== wordwheelSetup.required

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the wheel
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // opened from the hook's "Game info" menu item. The sheet is `wide` (full device
  // width) so the WordList has room — the rem-width columns side-scroll. Desktop
  // is unchanged. No board divergence — input is letter taps (no keyboard).
  const infoSheet = useInfoSheet()

  // ─── Coop-win celebration ──────────────────────────────
  // Confetti at the MOMENT the team crosses the rank they set out for (the
  // winning word flips playState to 'won' on every connected client via
  // realtime); opening an already-won game stays quiet (useCelebration never
  // pops on mount). Only coop reaches 'won' — compete writes 'won_compete', and
  // telling the winner from the losers there needs data that isn't right on the
  // first render (the waffle loading-race lesson), so compete doesn't celebrate.
  const celebration = useCelebration(playState === 'won')

  // Concede state (from the common roster). A conceder can't submit and sees the
  // locally-terminal look while the others race; peers show as "out" in the strip.
  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  // Score + words-found derived from the FE's view of
  // wordwheel.found_words. The bucket of rows we sum depends on mode:
  //
  //   - coop: the team's total — every visible row (everyone's).
  //   - compete: the *caller's own* rows only.
  //
  // Mid-game RLS already narrows compete rows to the caller, so a
  // naive "sum every row" matched both modes. But post-terminal the
  // reveal opens peers' rows (so the WordList can show cat B), which
  // would otherwise inflate the caller's score/rank at game end. So
  // compete filters to the caller explicitly rather than leaning on
  // RLS, and stays correct across the terminal transition.
  //
  // foundWordsCount counts ALL of the viewer's accepted submissions
  // (required + bonus). Matches spellingbee's "found.length" stat (this
  // game is a fork of it; there is no "wordwheel-ws" upstream) —
  // the displayed "X / Y words" can legitimately overshoot Y (the
  // required goal) when the player digs into the bonus list. The
  // denominator (game.required_words_count) stays required-only.
  // foundWordsScore sums every row's points, which include bonus-word
  // points (bonus words score the same as required words).
  const myFoundRows = useMemo(
    () =>
      game?.mode === 'compete'
        ? foundWords.filter((r) => r.user_id === session.user.id)
        : foundWords,
    [foundWords, game?.mode, session.user.id],
  )
  const { foundWordsScore, foundWordsCount } = useMemo(() => {
    let s = 0
    for (const row of myFoundRows) {
      s += row.points
    }
    return { foundWordsScore: s, foundWordsCount: myFoundRows.length }
  }, [myFoundRows])

  // Print the board — the plain-data print model built from the live state (RLS +
  // the explicit compete filter already scope what I may see) and handed to the
  // jsPDF renderer. Built inside `run`, so it is a snapshot at CLICK time and the
  // menu needn't rebuild as words are found. See docs/pdf.md.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      if (!game) return
      // The same reveal the on-screen list uses: at terminal, every missed word —
      // required AND bonus — folds in (`buildDisplayRows` dedups found + appends the
      // unfound). The print deliberately follows the screen here: the missed-word
      // list IS the post-game artifact, so a printout that quietly dropped the bonus
      // half would be a different document from the one on screen. Look up each found
      // word's points (the shared row type carries finder/bonus/pangram, not score).
      // Gated on `isTerminal`, which is the whole rule for these three word-finding
      // games: at game over the list shows what nobody found, and the KIND filter
      // (found / missed) is the only control anyone needs over it. They carry no
      // Reveal button on purpose — it would be a second, confusing way to switch
      // between the same two lists (docs/ui.md → Terminal results). If we ever
      // wanted the answer withheld at the end, the change is the filter's DEFAULT,
      // not a new control.
      const reveal = isTerminal
        ? buildRevealWords(game.requiredWords, hasBonus ? game.bonusWords : [], foundWords)
        : null
      const pointsByWord = new Map(foundWords.map((w) => [w.word, w.points]))
      const words = buildDisplayRows(foundWords, reveal).map((r) => ({
        word: r.word.toUpperCase(),
        pangram: r.isPangram ?? false, // wordwheel's own difference: pangrams print bold
        bonus: r.isBonus ?? false,
        found:
          r.kind === 'found'
            ? { points: pointsByWord.get(r.word) ?? 0, who: memberById(players, r.userId)?.username ?? 'someone' }
            : null,
      }))
      const rankIdx = currentRankIndex(foundWordsScore, game.required_words_score)
      printWordwheelPdf({
        brand,
        gameTitle: title,
        date: new Date().toLocaleDateString(),
        // Coop's rank + totals are the TEAM's, so the header states them. Compete's
        // are per-player — each section carries its own — so the header states only
        // the shared targets rather than reporting the viewer's as the table's.
        summary:
          game.mode === 'compete'
            ? `Target: ${game.required_words_score} pts · ${game.required_words_count} words`
            : `${RANKS[rankIdx]} · Score ${foundWordsScore} / ${game.required_words_score} · Words ${foundWordsCount} / ${game.required_words_count}`,
        outerLetters: game.outer_letters.split(''),
        centerLetter: game.center_letter,
        mode: game.mode,
        setup: summaryRows,
        // Coop prints one shared list; compete a section per player, each with its
        // own score, plus a trailing "Not found" for the terminal reveal.
        sections: buildWordSections(words, game.mode, players, session.user.id),
      })
    },
  })

  // ─── Wheel tile counts (drive the illegal-letter dim + tile spending) ────
  // The wheel is a MULTISET — the same letter may sit on two tiles — so the
  // "can I type this letter?" question is a per-letter tile COUNT, not set
  // membership: a word may use a letter as many times as it has tiles.
  const letterCounts = useMemo(() => {
    const m = new Map<string, number>()
    if (!game) return m
    for (const ch of game.outer_letters + game.center_letter) {
      const lower = ch.toLowerCase()
      m.set(lower, (m.get(lower) ?? 0) + 1)
    }
    return m
  }, [game])

  // (The local outer-letter shuffle + the letter-click input moved into BoardCol,
  // beside the wheel + entry.)

  // ─── The local feedback slot ────
  // The below-board slot every own-move result lands in: the word engine's
  // results, End / Concede's not-oks, and the two standing conditions below.
  const localFeedbackSlot = useFeedbackSlot('local')

  // ─── Move entry + own-move results (shared engine) ────
  // Both word lists ship to the FE, so a guess is validated + scored locally —
  // index required ∪ bonus by word. useWordSubmit owns the typed-word state,
  // the results it shows into the slot, and the optimistic commit + dedup;
  // wordwheel supplies the lookup, the RPC, the reject reason (missing-center /
  // not-a-word), and the success label (with the pangram flourish). See
  // docs/games/wordwheel.md.
  const legalIndex = useMemo(() => {
    const m = new Map<string, WordEntry>()
    for (const r of game?.requiredWords ?? []) {
      m.set(r.word, { word: r.word, points: r.points, isBonus: false, isPangram: r.is_pangram })
    }
    for (const b of game?.bonusWords ?? []) {
      m.set(b.word, { word: b.word, points: b.points, isBonus: true, isPangram: b.is_pangram })
    }
    return m
  }, [game?.requiredWords, game?.bonusWords])

  // A refused word shakes the wheel — the head-shake "no" every board gives a
  // move that wasn't a winning one. A bumping nonce, because it is the WHOLE
  // board that shakes and a board is always mounted: the nonce keys the wheel so
  // each refusal remounts it and the animation plays again (a CSS animation
  // restarts on a remount, not on a state change under it).
  const [shakeNonce, setShakeNonce] = useState(0)

  const center = game?.center_letter.toLowerCase() ?? ''
  const { word, setWord, lastWord, submit } =
    useWordSubmit({
      mode: game?.mode ?? 'coop',
      userId: session.user.id,
      isTerminal: isTerminal || myConceded,
      minWordLength: 4,
      localFeedbackSlot,
      foundWords,
      lookup: (w) => legalIndex.get(w) ?? null,
      // Four ok answers, all meaning the row landed: three classifications the
      // FE's own flags come back as, plus `won` — this word crossed the target
      // rank and ended the game. None of them changes what the optimistic pill
      // already says; the terminal flip arrives over realtime. Every refusal
      // means the word was NOT recorded, so each releases it.
      commit: async (e) => {
        const res = await runRpc<SubmittedWord>(
          db.rpc('submit_word', {
            target_game: gameId,
            word: e.word,
            points: e.points,
            is_pangram: e.isPangram ?? false,
            is_bonus: e.isBonus,
          }),
        )
        if (res.type === 'not-ok') {
          return res
        } else if (res.type === 'ok' && res.data?.result === 'accepted') {
          return null
        } else if (res.type === 'ok' && res.data?.result === 'bonus') {
          return null
        } else if (res.type === 'ok' && res.data?.result === 'pangram') {
          return null
        } else if (res.type === 'ok' && res.data?.result === 'won') {
          return null
        } else {
          reportUnhandled('submit_word', res)
          return null
        }
      },
      // A miss at/above min length. Words that don't fit the wheel's tiles (an
      // off-wheel letter, or a letter over its tile count) can't reach here —
      // BoardCol's `submitDisabled` gate vetoes their submit — so the only
      // reasons left are the missing center or simply not-a-word. The hook wraps
      // the reason as `WORD — reason`.
      // What each refusal means HERE. Required, and no engine decides it: a word
      // the list does not know is a WRONG MOVE in this game — the letters are in
      // front of you and the list is the ordinary one. (wordiply reads the same
      // event as a `warning`, because it is asking you to try strange words.)
      // Too short is a slip rather than a wrong move; a word you already found
      // is nothing happening.
      outcomeFor: (_w, answer) => ANSWER_OUTCOME[answer],
      // Any answer but an accept is a move that didn't win, which is the whole
      // of what the shake says. The actor's alone: a peer is never told about
      // somebody else's miss.
      onAnswer: (_w, answer) => {
        if (answer !== 'accepted') setShakeNonce((n) => n + 1)
      },
      explainReject: (w) => {
        // Name the letter rather than the rule: "missing \"A\"" is both shorter
        // and more actionable than "missing center letter" (the quotes are
        // literal — they mark the letter as a quoted character, not a word).
        if (center && !w.includes(center)) return `missing "${center.toUpperCase()}"`
        return 'not a word'
      },
    })

  // ─── End / Concede / Replay — the shared trio ──────────
  // End is coop's manual "we're done" stop (everyone {won:false} — a valid
  // outcome, not a punishment), hidden in compete. Concede (compete) is a real
  // loss for the conceder while the others race on. Replay restarts this board,
  // clearing everyone's finds. All three are the shared bindings
  // (useStandardGameActions); the slot a not-ok lands in is wordwheel's.
  // New game stays below — its create path diverges per game.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: game?.mode === 'compete' ? 'compete' : 'coop',
    myConceded,
    localFeedbackSlot,
  })

  // ─── New game — a FRESH game (new id, new board) with THIS game's setup ──
  // Same roster + mode, in the same club, via the same wordwheel-build-board
  // edge function the manifest's startGameInClub uses. Non-destructive (this
  // game un-currents into the club list); the creator jumps in via ctx.goToGame,
  // peers arrive via the game-invitation toast.
  //
  // A plain function, rebuilt every render: the binding below reads it at click
  // time, so `setup` and `players` are whatever the last realtime refetch left,
  // and the action's own identity doesn't move when they do.
  const gameMode = game?.mode
  const createNewGame = async () => {
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet
    // A hand-picked custom board is a ONE-OFF (docs/games/wordwheel.md): a "new
    // game" should get a fresh RANDOM board, not silently rebuild the identical
    // letters (which would carry everyone's answer knowledge over). create_game
    // already strips these from the saved club default; strip them here too so
    // the edge fn takes the random path.
    const freshSetup = { ...setup, custom_center: undefined, custom_letters: undefined }
    const res = await runEdgeFn<CreatedGame>(
      'wordwheel-build-board',
      {
        target_club: clubHandle,
        setup: freshSetup,
        player_user_ids: players.map((p) => p.user_id),
        mode: gameMode,
      },
    )
    if (res.type === 'not-ok') {
      // THE SAME ENVELOPE, READ DIFFERENTLY. On the setup form a validation is
      // an answer — fix the field and press Start again. Here there is no field
      // and no form, so whatever came back goes in the slot as it reads, over
      // the verdict, until its × is pressed. Shown even for a fault whose
      // modal has already fired centrally — the modal escalates, it does not
      // replace (docs/envelopes.md), so dismissing it must not leave the board
      // silent about why the game didn't start. FIVE of the answers here are
      // form-validations rather than faults — the most of any game — and the
      // message wears whatever outcome arrived.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`wordwheel_${gameMode}`, res.data.id)
      return
    } else {
      reportUnhandled('wordwheel-build-board', res)
      return
    }
  }

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game:
  // create_game clears the club's current-view flag, so it stays resumable — the
  // copy says shelved, not ended) and goes straight through at terminal, where
  // there is nothing to interrupt. The shared run's single flight is what stops a
  // second press building a second board.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

  // The FULL wordwheel menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time. The effect
  // re-runs only when the SHAPE changes, which is why every dep is stable.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          { items: [actPrintBoard] },
          // Same board, wiped finds / same setup, fresh board + id.
          { items: [actRestart, actNewGame] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actRestart, actNewGame, actPrintBoard])

  // Peer/opponent activity → header feedback pills (coop: a peer found a
  // word; compete: an opponent climbed a rank). Self-activity is excluded —
  // it's reported by the in-body pill / RankBar. Called unconditionally,
  // before the early returns, and reads `game?.mode` (null while loading; the
  // hook no-ops until loaded + bootstrapped).
  // ─── Coop peer-word narration (global header) ──────────────────
  // coop's `found_words` is club-wide, so a teammate's accepted word arrives in
  // `foundWords`; surface good + pangram finds. Rejected words never become a
  // row, so there's nothing to suppress. Own words go to the in-body local pill.
  usePeerFeedback({
    enabled: game?.mode === 'coop',
    // Gate the seed on the found_words fetch (separate from the header that sets
    // `game`), so a coop rejoin doesn't replay the backlog as a burst of pills.
    ready: rowsLoaded,
    items: foundWords,
    keyOf: (r) => `${r.user_id}:${r.word}`,
    messageFor: (r) => {
      if (r.user_id === session.user.id) return null // own word → the local slot
      const member = players.find((p) => p.user_id === r.user_id)
      // A pangram leads with the label + the moose, so the headline reads before
      // the word does — and so the line fits the header's ~26 phone characters,
      // which "found WORD +14 — pangram! 🦌" did not.
      const what = `${r.is_pangram ? 'pangram 🦌' : 'found'} ${wordWithBonusDot(r.word, r.is_bonus)} +${r.points}`
      return FeedbackMessage.peer(member, ANSWER_OUTCOME.accepted, what)
    },
    globalFeedbackSlot,
  })

  // ─── Compete opponent-rank narration (global header) ───────────
  // Opponents' words are RLS-hidden in compete, so the one competitively-
  // meaningful signal is a rank CLIMB, read off `status.leaderboard` — a delta
  // detector, NOT a seen-set — it fires on a rank INCREASE rather than a new
  // row — so it stays hand-rolled here rather than going through
  // `usePeerFeedback`. `ranksReady` seeds each player's last-seen rank on first
  // load so history isn't replayed. A `peerMilestone`: a climb is where a
  // player STANDS, so it outranks the stream of finds and a chat line.
  const prevRankRef = useRef<Map<string, number>>(new Map())
  const ranksReadyRef = useRef(false)
  useEffect(function narrateRankClimbs() {
    if (game?.mode !== 'compete') return
    const board = readLeaderboard(status)
    const prev = prevRankRef.current
    if (!ranksReadyRef.current) {
      ranksReadyRef.current = true
      for (const row of board) prev.set(row.user_id, row.rank_idx)
      return
    }
    for (const row of board) {
      const was = prev.get(row.user_id) ?? 0
      prev.set(row.user_id, row.rank_idx)
      if (row.user_id === session.user.id) continue // own rank → RankBar
      if (row.rank_idx > was) {
        const member = players.find((p) => p.user_id === row.user_id)
        globalFeedbackSlot.show(
          FeedbackMessage.peerMilestone(member, 'noted', `reached ${RANKS[row.rank_idx] ?? 'a new rank'}`),
        )
      }
    }
  }, [game, status, players, session.user.id, globalFeedbackSlot])

  // ─── The two standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // The per-status terminal message, memoized on primitives so the verdict
  // effect sees one object per outcome, not one per render. The winner is
  // read as name + color rather than as the member object for the same reason.
  const isCompete = game?.mode === 'compete'
  const selfRankIdx = currentRankIndex(foundWordsScore, game?.required_words_score ?? 0)
  // Target rank reads off `setup`, NOT `status.target_rank`. Setup is fixed at
  // create_game time and lives on every code path; the status copy is written by
  // submit_word and the terminals, but reading it would make the verdict depend
  // on which terminal path ran — a "Time up — no winner at Genius" on a game
  // that targeted Amazing. Both modes: compete's race finish line, and coop's
  // OPTIONAL win threshold (null = the open-ended hunt).
  const targetRankIdx = wordwheelSetup.target_rank ?? null
  const winnerId = (status?.winner_user_id as string | undefined) ?? null
  const winner = players.find((p) => p.user_id === winnerId)
  const winnerName = winner?.username
  const winnerColor = winner?.color
  const statusOutcome = (status?.outcome as string | undefined) ?? 'ended'
  const requiredWordsScore = game?.required_words_score ?? 0
  const over = useMemo(
    () =>
      isTerminal && gameMode
        ? buildOver({
            mode: gameMode,
            playState,
            statusOutcome,
            winnerId,
            winner: winnerName === undefined ? undefined : { username: winnerName, color: winnerColor ?? '' },
            targetRankIdx,
            foundWordsScore,
            requiredWordsScore,
            selfRankIdx,
            selfId: session.user.id,
          })
        : null,
    [isTerminal, gameMode, playState, statusOutcome, winnerId, winnerName, winnerColor, targetRankIdx,
     foundWordsScore, requiredWordsScore, selfRankIdx, session.user.id],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Locally terminal (compete only): I conceded but the game continues for the
  // others. wordwheel has no other per-player "done" state (no elimination),
  // so conceding is the only way to reach it.
  const isLocallyDone = isCompete && myConceded && !isTerminal
  useEffect(function showOutOfRace() {
    if (!isLocallyDone) return
    const id = localFeedbackSlot.show(FeedbackMessage.outOfRace(true))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isLocallyDone])

  if (loading) {
    return <div className={surface.loading}>Loading…</div>
  }
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "Game not found." about a dead connection is a confident wrong answer —
  // this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) {
    return <div className={surface.empty}>Game not found.</div>
  }

  // (`selfRankIdx` — the caller's rank in the local ladder, which compete's
  // OpponentStrip surfaces as "You: <rank>" and coop reads as the team rank —
  // is derived above, beside the verdict that reads it.)

  // Compete-only: pull the leaderboard payload off the live
  // status jsonb. Pre-first-submission the array is empty and
  // the strip falls back to placeholder zeros for opponents.
  const leaderboard = isCompete
    ? readLeaderboard(status)
    : null
  // Each peer's rank index, keyed by user — the OpponentStrip metric reads it.
  const rankByUser = new Map(leaderboard?.map((e) => [e.user_id, e.rank_idx]) ?? [])

  // Merged, alphabetized rows for the shared WordList (found + the terminal
  // reveal). The reveal covers BOTH shipped lists — the missed bonus words are
  // half the fun of the post-game read, and they're the same client-side data the
  // required half comes from.
  const wordRows = buildDisplayRows(
    foundWords,
    isTerminal ? buildRevealWords(game.requiredWords, hasBonus ? game.bonusWords : [], foundWords) : null,
  )

  return (
    <div className={cls(shared.layout, shared.responsiveInfoCol, shared.mobileFill, surface.layout, styles.layout)}>
      <BoardCol
        shakeNonce={shakeNonce}
        // ── Mobile-only status block (the SAME RankBar + Stats the InfoCol
        //    renders; on a phone the info column is off-canvas in the InfoSheet) ──
        foundWordsScore={foundWordsScore}
        requiredWordsScore={game.required_words_score}
        foundWordsCount={foundWordsCount}
        requiredWordsCount={game.required_words_count}
        targetRankIdx={targetRankIdx}
        // ── Board to render ──
        outerLetters={game.outer_letters}
        centerLetter={game.center_letter}
        letterCounts={letterCounts}
        // ── Word entry (engine here; rendered in BoardCol) ──
        word={word}
        onChange={setWord}
        onSubmit={submit}
        // The slot the entry row draws: a word result, the "you're out" state
        // (its info-column twin is the InfoActionsRow's line — dual placement is the
        // rule, docs/playarea.md, and on a phone the InfoCol is off-canvas, so
        // this is the ONLY copy the player sees), the verdict.
        localFeedbackSlot={localFeedbackSlot}
        lastWord={lastWord}
        isTerminal={isTerminal}
      />

      {/* The info column. Its top region — the readouts + action row + setup — is
          wrapped in the shared `.noShrinkRow` (same as psychicnum / connections /
          codenamesduet / waffle): a fixed-height block so the WordList below it
          doesn't shift when the action row swaps play↔terminal (docs/ui.md →
          Layout stability). Order follows the canonical info-column sequence
          (docs/playarea.md → Info-column readouts), with two wordwheel picks:
          the RankBar + Stats are ONE "state" unit and lead (the thing you watch),
          and there's no help line — the wheel makes the move obvious. The
          WordList fills the rest. Off-canvas full-width sheet on mobile, flex
          child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
        // ── Mode + phase ──
        isCompete={isCompete}
        isTerminal={isTerminal}
        over={over}
        isLocallyDone={isLocallyDone}
        // ── State (RankBar + Stats) ──
        foundWordsScore={foundWordsScore}
        requiredWordsScore={game.required_words_score}
        foundWordsCount={foundWordsCount}
        requiredWordsCount={game.required_words_count}
        // ── Opponent strip (compete) ──
        players={players}
        selfId={session.user.id}
        targetRankIdx={targetRankIdx}
        selfRankIdx={selfRankIdx}
        metricByUser={rankByUser}
        concededIds={concededIds}
        // ── Action row ──
        actEndGame={actEndGame}
        actConcede={actConcede}
        actRestart={actRestart}
        actNewGame={actNewGame}
        actBackToClub={menu.actBackToClub}
        // ── Setup disclosure ──
        setup={wordwheelSetup}
        setupRows={summaryRows}
        // ── Found-words list ──
        wordRows={wordRows}
        reveal={isTerminal}
        hasBonus={hasBonus}
        />
      </InfoSheet>
      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board pill + the info-column outcome line.
          A coop WIN — only possible when the team set a target rank — gets the
          celebration instead, once, at the moment they cross. */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body={`Reached "${RANKS[wordwheelSetup.target_rank ?? 6]}" — ${foundWordsScore}/${game.required_words_score} points.`}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}

/**
 * The terminal message: `pillText` + `outcome` are the below-board verdict,
 * `infoColText` + `outcome` the short bold line in the info-column action row.
 * No modal carries the verdict — a coop WIN pops `<CelebrationBlockingModal>`
 * and everything else lives in-page.
 *
 * Verdicts lead with the OUTCOME WORD — "Won:" / "Lost:" / "Ended:" — so the
 * result reads before the detail does, and they stay short enough for the
 * below-board pill on a phone (~44 characters; it ellipsises rather than wraps).
 * A rank in a verdict is quoted (`"Genius"`), the one place we still use
 * `rankLabel`'s longer `rank "Genius"` form being the info-column line.
 *
 * **Coop** (the target rank is optional — see `WordwheelSetup.target_rank`):
 *   - `won`   — the team reached the rank they set out for → `Won: "Genius" 47/50 points`
 *   - `lost`  — the countdown beat an unreached target → `Lost: ran out of time`
 *   - `ended` — no target, or they stopped early → `Ended: Solid 10/50 points`
 *     (the rank REACHED, not a target; the same sentence at every rank)
 *
 * **Compete** (a target rank is always set):
 *   - `won_compete`, caller won → `Won: "Amazing" 47/50 points`
 *   - `won_compete`, beaten → `● alice won at "Amazing"` — the winner is the
 *     message's `actor`, drawn as the leading mention the way every other
 *     peer message names a person; no "Lost:" prefix, the loss is implicit
 *   - `lost_compete` + outcome `conceded` (everyone dropped) → `Lost: all conceded`
 *   - `lost_compete` + outcome `timeout` → `Lost: ran out of time`
 *   - `ended` + outcome `manual` → the shared `gameEndedTerminalMessage('compete')` → `Game ended — no winner`
 */
function buildOver({
  mode,
  playState,
  statusOutcome,
  winnerId,
  winner,
  targetRankIdx,
  foundWordsScore,
  requiredWordsScore,
  selfRankIdx,
  selfId,
}: {
  mode: 'coop' | 'compete'
  playState: string
  /** `status.outcome`, or 'ended' when the status carries none. */
  statusOutcome: string
  /** `status.winner_user_id`, or null. */
  winnerId: string | null
  /** The winner's identity, when the roster knows them. */
  winner: Actor | undefined
  /** From `setup.target_rank`: always set in compete, optional in coop (null =
   *  the open-ended hunt, which has no win condition). */
  targetRankIdx: number | null
  foundWordsScore: number
  requiredWordsScore: number
  selfRankIdx: number
  selfId: string
}): TerminalMessage {
  const rankName = RANKS[selfRankIdx]
  const points = `${foundWordsScore}/${requiredWordsScore} points`

  if (mode === 'compete') {
    // Passed in from setup, not derived here — see the comment at
    // the call site for why status is the wrong source for this.
    const targetRankName = RANKS[targetRankIdx ?? 6]

    if (playState === 'won_compete') {
      if (winnerId === selfId) {
        return {
          pillText: `Won: "${targetRankName}" ${points}`,
          infoColText: 'You won!',
          outcome: 'won',
        }
      }
      return {
        pillText: `won at "${targetRankName}"`,
        infoColText: `${winner?.username ?? 'a player'} won`,
        outcome: 'lost',
        actor: winner,
      }
    }

    // What's left in compete is the two collective losses — both land on
    // play_state 'lost_compete' — and manual ('ended'). The play_state can't
    // tell the losses apart, so all three key on `outcome`: 'conceded' (the
    // last racer dropped, via common.concede), 'timeout' (the clock beat
    // everyone to the target), or 'manual'. The clock and attrition are
    // losses; agreeing to stop isn't.
    if (statusOutcome === 'conceded') {
      return {
        pillText: 'Lost: all conceded',
        infoColText: 'All conceded',
        outcome: 'lost',
      }
    }
    if (statusOutcome === 'timeout') {
      return {
        pillText: 'Lost: ran out of time',
        infoColText: 'Out of time',
        outcome: 'lost',
      }
    }
    // The shared neutral manual-end message, like every other game — the
    // friends agreed to stop, and that sentence isn't per-game.
    return gameEndedTerminalMessage('compete')
  }

  // ─── coop ───
  if (playState === 'won') {
    // The rank NAMED is the one they set out for; the score can overshoot it.
    const targetRankName = RANKS[targetRankIdx ?? selfRankIdx]
    return {
      pillText: `Won: "${targetRankName}" ${points}`,
      infoColText: 'You won!',
      outcome: 'won',
    }
  }
  if (playState === 'lost') {
    // Only reachable with a target set: the countdown beat them to it.
    return {
      pillText: 'Lost: ran out of time',
      infoColText: 'Out of time',
      outcome: 'lost',
    }
  }
  // 'ended' — the open-ended hunt finishing, or an early stop. Neutral, and the
  // same sentence at every rank (Genius included): they didn't fail at anything.
  return {
    pillText: `Ended: ${rankName} ${points}`,
    infoColText: rankName,
    outcome: 'neutral',
  }
}
