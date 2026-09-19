// cs-unmet

import { useEffect, useMemo, useRef } from 'react'
import { cls } from '@/common/utils/cls'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { Actor } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { useWordSubmit, wordWithBonusDot, type WordEntry } from '@/shared/word-hunt/useWordSubmit'
import { boardToDisplay, DICE_BY_NAME } from '../lib/dice'
import { traceableStr, tracePathStr, traceCellsStr } from '../lib/boardTrace'
import { ANSWER_OUTCOME } from '../lib/answer'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { useMark } from '@/common/board-marks/useMark'
import type { Outcome } from '@/common/outcomes/outcomes'
import { type LadderName } from '../lib/solver'
import type { BoggleSetup } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { buildRevealWords } from '@/shared/word-hunt/revealWords'
import { buildDisplayRows } from '../lib/displayRows'
import { printBogglePdf } from '../pdf/printBogglePdf'
import { buildWordSections } from '@/common/pdf/wordSections'
import { db } from '../db'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { runRpc } from '@/common/supabase/dbResult'
import styles from './PlayArea.module.css'
import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * boggle play surface, shared by the coop and compete manifests, on the shared
 * two-column scaffold (board column + fixed info column — see docs/ui.md →
 * "PlayArea layout"):
 *
 *   - **Board column** — the square tile grid (sized like waffle's: the largest
 *     square that fits) with a floating Rotate control over its top-right, and a
 *     below-board slot holding ONE of: the typed-word input row, the sticky
 *     own-move feedback pill, or the permanent terminal pill (they replace each
 *     other in a fixed-height slot so the board never reflows).
 *   - **Info column** — the live word/score state, the compete OpponentStrip, the
 *     End/Concede action row (terminal outcome line at game-over), a help line,
 *     the setup disclosure, and the found-words `<WordList>` filling the rest.
 *
 * The board is shipped to the FE with its required-word list, so guesses are
 * classified instantly: a required word (membership) or an off-board/too-short
 * word needs no server round-trip; only an unknown (bonus-candidate) word is sent
 * for the dictionary check. Traceability is checked client-side (trusting-commit).
 *
 * Move entry is the shared capture model (window key capture + a chrome-less
 * `<WordEntryInput>` display), the same as spellingbee — boggle's structural twin.
 */
/** What `boggle.submit_word` puts in `data`. Both results mean the row landed;
 *  they differ only by the bonus flag the caller sent. A duplicate and a
 *  post-terminal submit record nothing, so they arrive as refusals. */
type SubmittedWord =
  | { result: 'accepted'; points: number }
  | { result: 'bonus'; points: number }
  | null

export function PlayArea(ctx: GamePageCtx) {
  const { gameId, players, isTerminal, playState, setup, clubHandle, goToGame, session, status, globalFeedbackSlot, menu, brand, title } = ctx
  const { game, foundWords, loading, rowsLoaded, failure } = useGame(gameId)

  // The entry is typed at the window rather than into an input, so nothing here
  // takes focus and Tab has nowhere to go; an empty ring keeps it from walking
  // out to the browser.
  useTabRing([])

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into a full-width off-canvas
  // <InfoSheet> (wide, like spellingbee — its WordList wants the room). The board
  // fills for free (a square sized min(--avail-w, --avail-h, …)); input is tile
  // taps (path-tracing, see BoardCol). Desktop is unchanged.
  const infoSheet = useInfoSheet()

  // ─── Coop-target celebration ───────────────────────────
  // boggle's only unambiguous win: a COOP team crossing the score target
  // (`setup.win_percent`, `status.outcome='target'`). Confetti at the moment it
  // happens — the crossing word ends the game on every connected client via
  // realtime — and never on mount, so opening a finished game is quiet review
  // (`useCelebration`). Both inputs come off the SAME common.games row that
  // gates GamePage's render, so they're correct on the first render here; no
  // per-player data is involved, which is what keeps this safe (the
  // connections/psychicnum loading-race lesson).
  //
  // Compete deliberately doesn't celebrate, matching the other games: the
  // winner-vs-loser test is a leaderboard comparison, and a race has a loser
  // watching.
  const celebration = useCelebration(
    (status?.mode as string | undefined) === 'coop' &&
      (status?.outcome as string | undefined) === 'target',
  )
  const myId = session.user.id

  // `setup` is typed `Record<string, unknown>`; BoggleSetup is an `interface`,
  // which TS won't treat as index-compatible with Record, so route through unknown.
  const boggleSetup = setup as unknown as BoggleSetup

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (common/setup-form/doc.md → Setup rows).
  // The board itself rides along as the recap's `Letters` row — the raw face
  // string, which `setupRows` writes out the way the setup dialog takes it back.
  const summaryRows = useMemo(
    () =>
      setupRows(
        boggleSetup,
        game?.mode ?? 'coop',
        players,
        game ? { board: game.board, n: game.n } : null,
      ),
    [boggleSetup, game, players],
  )
  const ladder: LadderName = (boggleSetup.scoring_ladder as LadderName) ?? 'basic'

  // When the legal band equals the required band, bonus words are only words the
  // clean filter removed from the required set — not an intentional wider
  // dictionary. Declared up here because THREE things read it: the Bonus stat
  // cells, the missed-word reveal, and the word list's kind filter. They must
  // agree, or the UI claims this board has bonus words in one place and denies it
  // in another.
  const hasBonusDifficulty = boggleSetup.legal_band !== boggleSetup.band

  // ─── The local feedback slot ────
  // The below-board slot every own-move result lands in: the word engine's
  // results, End / Concede's not-oks, and the two standing conditions below.
  const localFeedbackSlot = useFeedbackSlot('local')

  // ─── Move entry + own-move results (shared engine) ────
  // The board ships with its full legal list (required ∪ bonus), so a guess is
  // validated + scored locally — index it by word for O(1) lookup. `useWordSubmit`
  // owns the typed-word state, the results it shows into the slot, and the
  // optimistic commit + dedup; boggle only supplies the lookup, the RPC, the
  // reject reason (not-on-board vs not-a-word, client-side via `traceableStr`),
  // and the success label. See docs/games/boggle.md.
  const legalIndex = useMemo(() => {
    const m = new Map<string, WordEntry>()
    for (const r of game?.required_words ?? []) {
      m.set(r.word, { word: r.word, points: r.points, isBonus: false })
    }
    for (const b of game?.bonus_words ?? []) {
      m.set(b.word, { word: b.word, points: b.points, isBonus: true })
    }
    return m
  }, [game?.required_words, game?.bonus_words])

  // Concede state (from the common roster). A conceder can't submit and sees the
  // locally-terminal look while the others race; peers show as "out" in the strip.
  const myConceded = players.find((m) => m.user_id === myId)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  /** The tiles a refused word used, wearing its answer. Board-cell indices —
   *  BoardCol turns them into view positions, since the player may have rotated
   *  the board under them.
   *
   *  `nonce` counts the RAISES, so the tiles can be keyed by it: a CSS animation
   *  runs once per mount, and refusing the same word twice inside the answer's
   *  beat leaves the shake's class exactly where it was. ArrowUp recalls the
   *  last word and Enter re-submits it, so twice is a keystroke away. */
  const [answered, showAnswer] =
    useMark<{ cells: number[]; outcome: Outcome; nonce: number }>(WORD_ANSWER_MS)
  const answerNonce = useRef(0)

  const { word, setWord, lastWord, submit } =
    useWordSubmit({
      mode: game?.mode ?? 'coop',
      userId: myId,
      // A conceder is locally done: gate word entry as if the game were terminal.
      isTerminal: isTerminal || myConceded,
      minWordLength: game?.min_word_length ?? 3,
      localFeedbackSlot,
      foundWords,
      lookup: (w) => legalIndex.get(w) ?? null,
      // Two ok answers, both meaning the row landed — the classification is the
      // FE's own flag coming back, and the optimistic pill already said it. The
      // three refusals all mean the word was NOT recorded, so each releases it.
      commit: async (e) => {
        const res = await runRpc<SubmittedWord>(
          db.rpc('submit_word', {
            target_game: gameId,
            word: e.word,
            points: e.points,
            is_bonus: e.isBonus,
          }),
        )
        if (res.type === 'not-ok') {
          return res
        } else if (res.type === 'ok' && res.data?.result === 'accepted') {
          return null
        } else if (res.type === 'ok' && res.data?.result === 'bonus') {
          return null
        } else {
          reportUnhandled('submit_word', res)
          return null
        }
      },
      // A miss is either untraceable ("not on board") or traceable-but-not-a-word
      // — the distinction boggle keeps, computed from the board on the FE. The
      // hook wraps the reason as `WORD — reason`.
      explainReject: (w) => (game && traceableStr(game.board, w) ? 'not a word' : 'not on board'),
      // What each refusal means HERE, read by the pill and by the tiles below —
      // one table, so they cannot say different things about one word.
      outcomeFor: (_w, answer) => ANSWER_OUTCOME[answer],
      // A refused word wears its answer on the tiles it used. The path has to be
      // WORKED OUT: a typed word says nothing about which of two Es it meant, so
      // the board is walked for a route that spells it. A word that traces
      // nowhere ("not on board") has no tiles to mark, and the pill carries it
      // alone.
      //
      // The actor's alone, and no attention flash with it: you know what you
      // just typed, and a peer is never told about somebody else's miss.
      onAnswer: (w, answer) => {
        if (answer === 'accepted' || !game) return
        const cells = tracePathStr(game.board, w)
        if (cells === null) return
        showAnswer({ cells, outcome: ANSWER_OUTCOME[answer], nonce: ++answerNonce.current })
      },
    })

  // TRACE AS YOU TYPE. Every letter lights the tiles that could carry it: one
  // candidate and the tile is settled, more than one and they all light faintly
  // until a later letter picks between them. So the board only ever ADDS
  // certainty as the word grows — no tile is ever lit and then taken back.
  //
  // Board-cell indices, like the refused-word marks — BoardCol turns them into
  // whatever rotation the player is looking at, and ignores them entirely while
  // a TAPPED path exists, since that path is what the player actually chose.
  const typedCells = useMemo(
    () => (game && word.length > 0 ? traceCellsStr(game.board, word) : null),
    [game, word],
  )

  // The display grid (letters in board order). BoardCol owns the local rotate on top.
  const grid = useMemo(
    () => (game ? boardToDisplay(game.board, game.n) : null),
    [game],
  )

  // The viewer/team's own found rows: coop sees the whole team's; compete sees
  // only the caller's (filtered explicitly so the post-terminal reveal — which
  // opens peers' rows — doesn't inflate the caller's count/score).
  const myFoundRows = useMemo(
    () => (game?.mode === 'compete' ? foundWords.filter((f) => f.user_id === myId) : foundWords),
    [foundWords, game?.mode, myId],
  )
  const myScore = useMemo(() => myFoundRows.reduce((s, r) => s + r.points, 0), [myFoundRows])
  const myCount = useMemo(() => new Set(myFoundRows.map((r) => r.word)).size, [myFoundRows])
  // The Stats grid figures, split required vs bonus (count + score each). The
  // *found* sides come off `myFoundRows` (non-bonus vs bonus); the *total* sides
  // are the board's required/bonus lists.
  const requiredFound = useMemo(
    () => new Set(myFoundRows.filter((r) => !r.is_bonus).map((r) => r.word)).size,
    [myFoundRows],
  )
  const requiredFoundScore = useMemo(
    () => myFoundRows.filter((r) => !r.is_bonus).reduce((s, r) => s + r.points, 0),
    [myFoundRows],
  )
  const bonusFound = useMemo(
    () => new Set(myFoundRows.filter((r) => r.is_bonus).map((r) => r.word)).size,
    [myFoundRows],
  )
  const bonusFoundScore = useMemo(
    () => myFoundRows.filter((r) => r.is_bonus).reduce((s, r) => s + r.points, 0),
    [myFoundRows],
  )
  // The board's total bonus score (H) — sum of every bonus word's points.
  const bonusScore = useMemo(
    () => (game?.bonus_words ?? []).reduce((s, b) => s + b.points, 0),
    [game?.bonus_words],
  )

  // Print the board — the plain-data print model built from the live state (RLS
  // already scoped `foundWords` to what I may see — coop = the team's, compete =
  // my own) and handed to the jsPDF renderer. Built inside `run`, so it is a
  // snapshot at CLICK time and the menu needn't rebuild as words are found.
  // Works mid-game or at the end. See common/pdf/doc.md.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      if (!game) return
      // The same reveal the on-screen list uses: at terminal every missed word folds
      // in (`buildDisplayRows` dedups found + appends the unfound) — required always,
      // bonus only on a board with a genuinely wider legal band; mid-game there's no
      // reveal, so only found words show. The print follows the screen deliberately:
      // the missed-word list IS the post-game artifact. Look up each found word's
      // points (the shared row type carries the finder/bonus but not the score).
      // Gated on `isTerminal`, which is the whole rule for these three word-finding
      // games: at game over the list shows what nobody found, and the KIND filter
      // (found / missed) is the only control anyone needs over it. They carry no
      // Reveal button on purpose — it would be a second, confusing way to switch
      // between the same two lists (docs/ui.md → Terminal results). If we ever
      // wanted the answer withheld at the end, the change is the filter's DEFAULT,
      // not a new control.
      const revealWords = isTerminal
        ? buildRevealWords(game.required_words, hasBonusDifficulty ? game.bonus_words : [], foundWords)
        : null
      const pointsByWord = new Map(foundWords.map((w) => [w.word, w.points]))
      const words = buildDisplayRows(foundWords, revealWords).map((r) => ({
        word: r.word.toUpperCase(),
        bonus: r.isBonus ?? false,
        // A found word carries score + finder; an unfound (missed) reveal entry is bare.
        found:
          r.kind === 'found'
            ? { points: pointsByWord.get(r.word) ?? 0, who: memberById(players, r.userId)?.username ?? 'someone' }
            : null,
      }))
      printBogglePdf({
        brand,
        gameTitle: title,
        date: new Date().toLocaleDateString(),
        // Coop's counts are the TEAM's, so the header can state them. Compete's
        // are per-player — each section carries its own — so the header states
        // only the shared target, rather than reporting the viewer's tally as if
        // it were the table's.
        summary:
          game.mode === 'compete'
            ? `${game.required_words_count} word${game.required_words_count === 1 ? '' : 's'} to find`
            : `${myCount} / ${game.required_words_count} words · ${myScore} pts`,
        board: boardToDisplay(game.board, game.n),
        mode: game.mode,
        setup: summaryRows,
        // Coop prints one shared list; compete a section per player, each with
        // its own score, plus a trailing "Not found" for the terminal reveal.
        sections: buildWordSections(words, game.mode, players, myId),
      })
    },
  })

  // ─── End / Concede / Replay — the shared trio ──────────
  // The byte-identical shared handlers (useStandardGameActions); only the
  // replay sentence is boggle's. Its not-oks land in the same below-board slot
  // as a word result. New game stays below — its create path diverges per game.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: game?.mode === 'compete' ? 'compete' : 'coop',
    myConceded,
    localFeedbackSlot,
  })

  // ─── New game — a FRESH game (new id, new board) with THIS game's setup ──
  // Same roster + mode, in the same club, via the same boggle-build-board edge
  // function the manifest's startGameInClub uses. Non-destructive (this game
  // un-currents into the club list); the creator jumps in via ctx.goToGame,
  // peers arrive via the game-invitation toast.
  //
  // A plain function, rebuilt every render: the binding below reads it at click
  // time, so `setup` and `players` are whatever the last realtime refetch left,
  // and the action's own identity doesn't move when they do.
  const gameMode = game?.mode
  const createNewGame = async () => {
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet
    const res = await runEdgeFn<CreatedGame>(
      'boggle-build-board',
      {
        target_club: clubHandle,
        setup,
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
      // silent about why the game didn't start. THREE of the answers here are
      // genuinely form-validations rather than faults — PN154 (no words for
      // those letters), PN155 (no board met those constraints) and the RPC's
      // own PN147 — and the message wears whatever outcome arrived.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`boggle_${gameMode}`, res.data.id)
      return
    } else {
      reportUnhandled('boggle-build-board', res)
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

  // The FULL boggle menu. `buildGameMenu` supplies the framing (Help + chat
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

  // ─── Coop peer-word narration (global header) ──────────────────
  // coop's `found_words` is club-wide, so a teammate's accepted word arrives in
  // `foundWords`; surface it in the shared header slot (the twin of spellingbee's
  // coop narration). Rejected words never become a row, so there's nothing to
  // suppress; own words go to the in-body local pill. boggle has no pangram, but
  // a long find (7+ letters) is its "wow" moment — flag those. Compete stays
  // silent by design (opponents' words are private; no rank ladder to announce).
  usePeerFeedback({
    enabled: game?.mode === 'coop',
    // Gate the seed on the found_words fetch (separate from the header that sets
    // `game`), so a coop rejoin doesn't replay the backlog as a burst of pills.
    ready: rowsLoaded,
    items: foundWords,
    keyOf: (r) => `${r.user_id}:${r.word}`,
    messageFor: (r) => {
      if (r.user_id === myId) return null // own word → the local slot
      const member = players.find((p) => p.user_id === r.user_id)
      const wow = r.word.length >= 7
      const label = wordWithBonusDot(r.word, r.is_bonus)
      // A long find leads with the flourish (spellingbee's "pangram 🐝 WORD
      // +14" shape) so the headline reads before the word does — and so the
      // line fits the header's ~26 phone characters.
      return FeedbackMessage.peer(
        member,
        ANSWER_OUTCOME.accepted,
        `${wow ? 'wow!' : 'found'} ${label} +${r.points}`,
      )
    },
    globalFeedbackSlot,
  })

  // ─── The two standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // The per-status terminal message, memoized on primitives so the verdict
  // effect sees one object per outcome, not one per render. The two people it
  // can name — a target crosser, or the top scorer among the non-conceded —
  // are resolved here to name + color for the same reason.
  const isCompete = game?.mode === 'compete'
  const statusOutcome = (status?.outcome as string | undefined) ?? null
  const winnerId = (status?.winner_user_id as string | undefined) ?? null
  const winner = players.find((p) => p.user_id === winnerId)
  const winnerName = winner?.username ?? (status?.winner_username as string | undefined)
  const winnerColor = winner?.color
  // The winning bar excludes conceded players — a drop-out can't be the
  // winner anyone sees, matching boggle._finish's max_score.
  const racers = ((status?.leaderboard as LeaderRow[] | undefined) ?? []).filter(
    (r) => !concededIds.has(r.user_id),
  )
  const leaderMax = racers.reduce((m, r) => Math.max(m, r.found_words_score), 0)
  const leaderId = racers.find((r) => r.found_words_score === leaderMax)?.user_id ?? null
  const leader = players.find((p) => p.user_id === leaderId)
  const leaderName = leader?.username
  const leaderColor = leader?.color
  const over = useMemo(
    () =>
      isTerminal && gameMode
        ? buildOver({
            mode: gameMode,
            playState,
            statusOutcome,
            myCount,
            myScore,
            myConceded,
            selfId: myId,
            winnerId,
            winner: winnerName === undefined ? undefined : { username: winnerName, color: winnerColor ?? '' },
            leaderMax,
            leader: leaderName === undefined ? undefined : { username: leaderName, color: leaderColor ?? '' },
          })
        : null,
    [isTerminal, gameMode, playState, statusOutcome, myCount, myScore, myConceded, myId,
     winnerId, winnerName, winnerColor, leaderMax, leaderName, leaderColor],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Locally terminal (compete only): I conceded but the game continues for the
  // others. boggle has no elimination, so conceding is the only path to it.
  const isLocallyDone = isCompete && myConceded && !isTerminal
  useEffect(function showOutOfRace() {
    if (!isLocallyDone) return
    const id = localFeedbackSlot.show(FeedbackMessage.outOfRace(true))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isLocallyDone])

  if (loading) return <div className={styles.loading}>Loading…</div>
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "Game not found." about a dead connection is a confident wrong answer —
  // this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // `!grid` stays fused with `!game`: the grid is DERIVED from the game's board,
  // so it can only be absent when the game is, and it has no failure of its own.
  if (!game || !grid) return <div className={styles.empty}>Game not found.</div>

  // The reveal: every word nobody found, at game over. No button gates it —
  // the word list's KIND filter (found / missed) already IS that control, and a
  // Reveal button would be a second, confusing way to switch the same two lists
  // (docs/ui.md → Terminal results). boggle, spellingbee and wordwheel are the
  // three games that work this way.
  //
  // The missed BONUS words fold in too — but only when the board actually has a
  // wider legal band. With the bands equal, "bonus" means nothing but the words
  // the clean filter removed from required (crude / slang / slur), and printing
  // those as a list of things you might have played is not the post-game read
  // anyone wants. Same `hasBonusDifficulty` flag that suppresses the Bonus stat
  // cells, so the two can't disagree about whether this board has bonus words.
  const revealWords = isTerminal
    ? buildRevealWords(
      game.required_words,
      hasBonusDifficulty ? game.bonus_words : [],
      foundWords,
    )
    : null
  // Merged, alphabetized rows for the shared WordList (found + the reveal).
  const wordRows = buildDisplayRows(foundWords, revealWords)

  // Index the compete leaderboard by user so the OpponentStrip metric can read
  // each peer's score (self reads the live local computation so it stays in lock
  // step with the state line above). Every row, conceded included: the strip
  // shows a conceder's banked score beside their "out" cell.
  const scoreByUser = new Map(
    ((status?.leaderboard as LeaderRow[] | undefined) ?? []).map((e) => [e.user_id, e.found_words_score]),
  )

  const ladderLabel = ladder.charAt(0).toUpperCase() + ladder.slice(1)
  const diceLabel = DICE_BY_NAME[boggleSetup.dice_set]?.desc ?? `${game.n}×${game.n}`

  // The 4-cell Stats figures, built once and handed to BOTH surfaces: the info
  // column (desktop) and the mobile status block above the board (where the info
  // column is off-canvas). One object, so the two can't drift.
  const stats = {
    requiredFound,
    requiredCount: game.required_words_count,
    requiredFoundScore,
    requiredScore: game.required_words_score,
    bonusFound: hasBonusDifficulty ? bonusFound : 0,
    bonusCount: hasBonusDifficulty ? game.bonus_words.length : 0,
    bonusFoundScore: hasBonusDifficulty ? bonusFoundScore : 0,
    bonusScore: hasBonusDifficulty ? bonusScore : 0,
  }

  return (
    <div className={cls(shared.layout, shared.responsiveInfoCol, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Mobile-only status block (the SAME Stats the InfoCol renders; on a
        //    phone the info column is off-canvas in the InfoSheet) ──
        stats={stats}
        // ── Board to render ──
        grid={grid}
        n={game.n}
        // The tiles a refused word used, wearing its answer — board-cell
        // indices, which BoardCol rotates into the view the player is looking at.
        answered={answered}
        typedCells={typedCells}
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
        readOnly={isTerminal || myConceded}
      />

      {/* Info column — off-canvas full-width sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
        // ── Mode + phase ──
        isCompete={isCompete}
        isTerminal={isTerminal}
        over={over}
        isLocallyDone={isLocallyDone}
        // ── State readout ──
        score={myScore}
        stats={stats}
        // ── Players (OpponentStrip, compete) ──
        players={players}
        selfId={myId}
        metricByUser={scoreByUser}
        concededIds={concededIds}
        // ── Action row ──
        actEndGame={actEndGame}
        actConcede={actConcede}
        actRestart={actRestart}
        actNewGame={actNewGame}
        actBackToClub={menu.actBackToClub}
        // ── Setup disclosure ──
        setup={boggleSetup}
        setupRows={summaryRows}
        diceLabel={diceLabel}
        ladderLabel={ladderLabel}
        minWordLength={game.min_word_length}
        // ── Found-words list ──
        wordRows={wordRows}
        reveal={revealWords !== null}
        hasBonus={hasBonusDifficulty}
        />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board pill + the info-column outcome line. A coop TARGET
          win — the only unambiguous win boggle has — gets the celebration
          instead, once, at the moment the team crosses. */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="Target reached! 🎉"
          body={`${myCount} words, ${myScore} points.`}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}

type LeaderRow = { user_id: string; found_words_count: number; found_words_score: number }

/**
 * The per-status terminal message. A game ends three ways (`status.outcome`):
 * a player hitting End (`'manual'`), the timer expiring (`'timeout'`), or a
 * score TARGET being reached (`'target'`, when setup.win_percent is set — a
 * real win). Coop is otherwise a neutral shared hunt (no win/loss); compete
 * without a target picks the highest score. A `'target'` compete win names
 * the crosser in `status.winner_user_id` / `status.winner_username`.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` +
 * `outcome` the short bold line in the info-column action row. A verdict
 * that names a person carries them as `actor`, and the pill draws the
 * mention the way every other peer message names someone.
 */
function buildOver({
  mode,
  playState,
  statusOutcome,
  myCount,
  myScore,
  myConceded,
  selfId,
  winnerId,
  winner,
  leaderMax,
  leader,
}: {
  mode: 'coop' | 'compete'
  /** The terminal play_state — coop distinguishes a missed TARGET (`lost`)
   *  from the neutral end of a no-target hunt (`ended`) by it. */
  playState: string
  /** `status.outcome`, or null when the status carries none. */
  statusOutcome: string | null
  myCount: number
  myScore: number
  myConceded: boolean
  selfId: string
  /** A target crosser — `status.winner_user_id`, or null. */
  winnerId: string | null
  winner: Actor | undefined
  /** The best score among the non-conceded, and who holds it. */
  leaderMax: number
  leader: Actor | undefined
}): TerminalMessage {
  const isTarget = statusOutcome === 'target'
  const reason = statusOutcome === 'timeout' ? "Time's up" : 'Game ended'

  const tally = `${myCount} words, ${myScore} points`

  if (mode === 'coop') {
    // Coop is a shared hunt, and what it means to END depends on whether there
    // was a TARGET to reach — the same three-way the server picks the
    // play_state from (boggle._finish):
    //   reached it            → a real win
    //   clock beat a target   → a real loss; there WAS a bar and we missed it
    //   anything else         → neutral (no bar to fail, or we chose to stop)
    // Which of timeout-vs-manual ended it rides in the info-column line
    // ("Time's up" / "Game ended") — the pill spends its width on the tally.
    if (isTarget) {
      return { pillText: `Won: ${tally}`, infoColText: 'Target reached!', outcome: 'won' }
    }
    if (playState === 'lost') {
      return { pillText: `Lost: ${tally}`, infoColText: reason, outcome: 'lost' }
    }
    return { pillText: `Ended: ${tally}`, infoColText: reason, outcome: 'neutral' }
  }

  // Compete — most points wins (no dupes-cancel; see boggle.md §12).
  // A conceder forfeited the race: they see a plain loss even if their
  // banked score was the highest (mirrors the server's won:false).
  if (myConceded) {
    return {
      pillText: 'Lost: conceded',
      infoColText: 'You conceded',
      outcome: 'lost',
    }
  }
  // A target win is a RACE the server already decided: the crosser (named in the
  // status) wins outright, everyone else loses — no leaderboard comparison.
  if (isTarget) {
    if (winnerId === selfId) {
      return {
        pillText: `Won: ${tally}`,
        infoColText: 'You won!',
        outcome: 'won',
      }
    }
    return {
      pillText: 'won',
      infoColText: `${winner?.username ?? 'a player'} won`,
      outcome: 'lost',
      actor: winner,
    }
  }
  // Nobody scored. The server agrees — boggle._finish writes lost_compete for
  // exactly this case, rather than flagging everyone a co-winner at 0 (which
  // is what "your score is the best score" does when every score is 0). This
  // used to render a neutral "Ended" while the club-page label read
  // "Won (co-winners)" off the same row; both now say the same thing.
  if (leaderMax === 0) {
    return {
      pillText: 'Lost: no words found',
      infoColText: 'No winner',
      outcome: 'lost',
    }
  }
  if (myScore >= leaderMax) {
    return {
      pillText: `Won: ${tally}`,
      infoColText: 'You won!',
      outcome: 'won',
    }
  }
  return {
    pillText: 'won',
    infoColText: `${leader?.username ?? 'a player'} won`,
    outcome: 'lost',
    actor: leader,
  }
}
