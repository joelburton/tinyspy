// cs-met-wordwheel

import { useEffect, useMemo, useRef } from 'react'
import { cls } from '@/common/utils/cls'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { db } from '../db'
import { useGame, type FoundWordRow, type WordwheelGame } from '../hooks/useGame'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { memberById } from '@/common/members/memberList'
import { readLeaderboard } from '@/common/game-page/readLeaderboard'
import type { LeaderboardEntry } from '@/shared/bee-games/beeLeaderboard'
import { currentRankIndex, RANKS } from '@/shared/rank-ladder/rankLadder'
import { answerMessage, peerAnswerMessage } from '../lib/answer'
import { buildTerminalMessage } from '../lib/terminal'
import type { WordwheelSetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { buildWordListRows } from '@/shared/found-words/wordListRows'
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
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { Loading } from '@/common/loading/Loading'
import { NoSuchGamePage } from '@/common/game-page/NoSuchGamePage'
import styles from './PlayArea.module.css'

import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * The GATES, and nothing else: the read, the three answers it can come back
 * with, and the one narrowing of `setup`. Splitting them off is what lets
 * `<PlayArea>` below start with a game in hand — no `game?.`, no `?? 'coop'`,
 * no guard inside a handler for a row that cannot be missing by then.
 */
export function PlayAreaLoader(ctx: GamePageCtx) {
  const { game, foundWords, loading, rowsLoaded, failure } = useGame(ctx.gameId)

  if (loading) return <Loading />
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "there's no game here" about a dead connection is a confident wrong answer
  // — this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Reaching this means the COMMON row exists — `GamePageGate` and
  // `GamePageLoader` each checked — and wordwheel's does not: a torn write,
  // or a game deleted while somebody had the board open. `detail` goes to the
  // console, never to the page.
  if (!game) {
    return <NoSuchGamePage detail={`rows=0 view=wordwheel.games_state game=${ctx.gameId}`} />
  }

  return (
    <PlayArea
      {...ctx}
      game={game}
      foundWords={foundWords}
      rowsLoaded={rowsLoaded}
      // The one place the setup blob is narrowed. `GamePageCtx` types it
      // `Record<string, unknown>` for every game; below, it is this game's.
      setup={ctx.setup as unknown as WordwheelSetup}
    />
  )
}

type PlayAreaProps = Omit<GamePageCtx, 'setup'> & {
  // The loaded game row: the wheel's letters, both word lists, the mode and the
  // required-band totals. Non-null by construction — the loader holds the gates.
  game: WordwheelGame
  // Every found word this viewer may see: in coop the table's, in compete the
  // caller's own until the terminal reveal opens the rest.
  foundWords: FoundWordRow[]
  // True once those rows have loaded at least once. Distinct from the header's
  // load, and what the peer narration seeds against.
  rowsLoaded: boolean
  // This game's setup, narrowed once by the loader.
  setup: WordwheelSetup
}

/**
 * wordwheel's play surface, shared by the coop and compete manifests. It
 * holds no board and draws no control: `<BoardCol>` owns the wheel, the word
 * engine and the `submit_word` commit, `<InfoCol>` the readouts, the action
 * row and the word list, and this component decides what each of them is
 * handed.
 *
 * What is genuinely this surface's: the below-board feedback slot both columns
 * write into, the peer narration, the bound actions, and the derivations the
 * two columns must agree on — the score and rank, the target, and whether I
 * may still play. The game rows arrive as props from the loader above.
 *
 * `game.mode` is what differs between the manifests, and it differs in one
 * place each: coop scores every visible row and narrates a teammate's find;
 * compete scores the caller's own rows (RLS hides the rest until terminal),
 * shows each opponent's rank in the strip, and narrates a rank climbed.
 */
export function PlayArea(props: PlayAreaProps) {
  const {
    gameId, isTerminal, playState, players, session, status,
    setup, clubHandle, goToGame, menu, brand, title,
    globalFeedbackSlot,
    game, foundWords, rowsLoaded,
  } = props

  // ─── Page hooks ────────────────────────────────────────
  // What this surface IS, before anything this game knows: where Tab may go,
  // where the info column sits on a phone, and the one thing that fires at a
  // moment rather than describing a state — the win's confetti.

  // The entry is typed at the window rather than into an input, so nothing here
  // takes focus and Tab has nowhere to go; an empty ring keeps it from walking
  // out to the browser.
  useTabRing([])

  // Mobile (docs/mobile.md): below the breakpoint the wheel fills the screen and
  // the info column moves into an off-canvas `<InfoSheet>`.
  const infoSheet = useInfoSheet()

  // Confetti at the MOMENT the team crosses the rank it set out for. The gate
  // reads the common row, so it is right on the very first render, which is
  // what `useCelebration` requires. Only coop reaches `won`; a race's
  // `won_compete` is not celebrated.
  const celebration = useCelebration(playState === 'won')

  // ─── Derived ───────────────────────────────────────────
  // Who I am in this game and what I may still do, read off the props and the
  // hook's rows. Named here because the sections below share them: the
  // standing conditions, the bindings' `describe`s, the print model and both
  // columns all ask the same questions, and they must not answer them
  // differently.

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (common/setup-form/doc.md → Setup rows). The letters go in as stored;
  // the row alphabetizes them.
  const summaryRows = useMemo(
    () =>
      setupRows(
        setup,
        game.mode,
        players,
        { center: game.center_letter, outer: game.outer_letters },
      ),
    [setup, game, players],
  )

  // Does this board have a genuinely wider bonus dictionary? With the legal
  // band equal to the required band, the bonus list is only what the clean
  // filter removed from required, which is not a list to hand anyone as "what
  // you missed". Gates BOTH the missed-bonus reveal and the word list's KIND
  // filter, so the two cannot disagree.
  const hasBonus = setup.legal !== setup.required

  // Concede lives on the common roster (`players`).
  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false

  const isCompete = game.mode === 'compete'

  // The rows I score: the team's in coop, my own in compete. Compete filters
  // explicitly rather than leaning on RLS, because the terminal reveal opens
  // every player's rows and a plain sum would then jump.
  const myFoundRows = useMemo(
    () =>
      game.mode === 'compete'
        ? foundWords.filter((r) => r.user_id === session.user.id)
        : foundWords,
    [foundWords, game.mode, session.user.id],
  )
  // Points over every row, bonus finds included; the count is every accepted
  // word, so "X / Y words" can pass Y once the bonus list is being mined — the
  // denominator (`required_words_count`) is required-only.
  const { foundWordsScore, foundWordsCount } = useMemo(() => {
    let s = 0
    for (const row of myFoundRows) {
      s += row.points
    }
    return { foundWordsScore: s, foundWordsCount: myFoundRows.length }
  }, [myFoundRows])

  // My rank on the ladder — the team's in coop, "You" in compete's strip.
  const selfRankIdx = currentRankIndex(foundWordsScore, game.required_words_score)

  // Off `setup`, which is fixed at creation, not off the `status` copy the
  // terminals write. Both modes: compete's finish line, and coop's optional
  // win threshold (null = the open-ended hunt).
  const targetRankIdx = setup.target_rank ?? null

  // Locally terminal (compete only): I conceded while the race runs on for the
  // others — the one per-player done state this game has.
  const isLocallyDone = isCompete && myConceded && !isTerminal

  // The board is inert once I can add nothing: the game is over, or I am out
  // of a race the others play on.
  const readOnly = isTerminal || isLocallyDone

  // ─── The local slot, and its two standing conditions ───
  // Each condition is an effect on a primitive edge that shows on true and
  // retracts in its cleanup — the slot draws whichever ranks highest. The
  // local slot is the one for messages about ME; a peer's go in the header's.

  // The below-board slot: BoardCol shows each word's answer and a commit's
  // not-ok into it, InfoCol's End / Concede their not-oks, and the two
  // standing conditions below are effects on it.
  const localFeedbackSlot = useFeedbackSlot('local')

  // The per-status terminal message, memoized on primitives so the verdict
  // effect sees one object per outcome, not one per render. The winner is
  // read as name + color rather than as the member object for the same reason.
  const winnerId = (status?.winner_user_id as string | undefined) ?? null
  const winner = players.find((p) => p.user_id === winnerId)
  const winnerName = winner?.username
  const winnerColor = winner?.color
  const reason = (status?.reason as string | undefined) ?? 'ended'
  const requiredWordsScore = game.required_words_score
  const terminalMessage = useMemo(
    () =>
      isTerminal
        ? buildTerminalMessage({
            mode: game.mode,
            playState,
            reason,
            winnerId,
            winner: winnerName === undefined ? undefined : { username: winnerName, color: winnerColor ?? '' },
            targetRankIdx,
            foundWordsScore,
            requiredWordsScore,
            selfRankIdx,
            selfId: session.user.id,
          })
        : null,
    [isTerminal, game.mode, playState, reason, winnerId, winnerName, winnerColor, targetRankIdx,
     foundWordsScore, requiredWordsScore, selfRankIdx, session.user.id],
  )
  useEffect(function showTerminalVerdict() {
    if (!terminalMessage) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(terminalMessage))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, terminalMessage])

  // Out of the race while the others play on.
  useEffect(function showOutOfRace() {
    if (!isLocallyDone) return
    const id = localFeedbackSlot.show(FeedbackMessage.outOfRace(true))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isLocallyDone])

  // ─── Narration — what a PEER did, in the header slot ───
  // About somebody else, which is what puts it in the global slot rather than
  // the local one (docs/ui.md → Feedback pill). Each mode has one peer event
  // it can see.

  // Coop: a teammate's accepted word, arriving as a `foundWords` row in the
  // outcome the finder saw. A refused word never becomes a row, so there is
  // nothing to suppress; my own go to the local slot.
  usePeerFeedback({
    enabled: game.mode === 'coop',
    // The rows load separately from the header, so the seed waits for them
    // (`usePeerFeedback`'s `ready`); otherwise a rejoin replays the backlog.
    ready: rowsLoaded,
    items: foundWords,
    keyOf: (r) => `${r.user_id}:${r.word}`,
    messageFor: (r) => {
      if (r.user_id === session.user.id) return null // own word → the local slot
      const member = players.find((p) => p.user_id === r.user_id)
      const { outcome, text } = peerAnswerMessage(r)
      return FeedbackMessage.peer(member, outcome, text)
    },
    globalFeedbackSlot,
  })

  // Compete: RLS hides opponents' words, so the peer event this mode can
  // surface is a rank CLIMB, read off `status.leaderboard`. A delta detector
  // rather than a seen-set, which is why it is hand-rolled instead of going
  // through `usePeerFeedback`; the first pass seeds each player's last-seen
  // rank so history is not replayed. A `peerMilestone`, since a climb is where
  // a player STANDS (docs/ui.md → Feedback pill). My own rank is the RankBar's.
  const prevRankRef = useRef<Map<string, number>>(new Map())
  const ranksReadyRef = useRef(false)
  useEffect(function narrateRankClimbs() {
    if (game.mode !== 'compete') return
    const board = readLeaderboard<LeaderboardEntry>(status)
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
        const { outcome, text } = answerMessage({
          answerType: 'reached_peer',
          rank: RANKS[row.rank_idx] ?? 'a new rank',
        })
        globalFeedbackSlot.show(FeedbackMessage.peerMilestone(member, outcome, text))
      }
    }
  }, [game.mode, status, players, session.user.id, globalFeedbackSlot])

  // ─── The commands, bound ───────────────────────────────
  // Every command this game offers, in one order that three readers keep: this
  // block, the info column's prop list, and the menu's rows. A binding is what
  // the button, the menu row and the key all read, so none of them can drift
  // from another — and `pending` grays every surface of one for the length of
  // its run, so no handler keeps an in-flight flag of its own.

  // End / Concede / Restart — the shared handlers, identical across games
  // (`useStandardGameActions`). New game is below, its path being this game's.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: game.mode,
    myConceded,
    localFeedbackSlot,
  })

  // New game — a FRESH game (new id, new board) with THIS game's setup, roster
  // and mode, in the same club, through the same edge function the manifest's
  // `startGameInClub` uses. Nothing is destroyed: the club's current-view flag
  // moves, leaving this game resumable from the club list. The creator jumps
  // in via `goToGame`, peers arrive by invitation toast.
  const createNewGame = async () => {
    // A hand-picked board is a one-off, so the follow-up takes the random
    // path (doc.md → FE submissions); `create_game` strips the same two from
    // the saved club default.
    const freshSetup = { ...setup, custom_center: undefined, custom_letters: undefined }
    const res = await runEdgeFn<CreatedGame>(
      'wordwheel-build-board',
      {
        target_club: clubHandle,
        setup: freshSetup,
        player_user_ids: players.map((p) => p.user_id),
        mode: game.mode,
      },
    )
    if (res.type === 'not-ok') {
      // No field to fix here, so whatever came back goes in the slot as it
      // reads, over the verdict, until its × is pressed — a fault whose modal
      // already fired centrally included, since the modal escalates rather than
      // replaces (docs/envelopes.md).
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`wordwheel_${game.mode}`, res.data.id)
      return
    } else {
      reportUnhandled('wordwheel-build-board', res)
      return
    }
  }

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play and goes straight through at
  // terminal, where there is nothing to interrupt; the shared run's single
  // flight stops a second press building a second board.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !isTerminal ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print the board — a snapshot at CLICK time (common/pdf/doc.md). RLS already
  // scopes `foundWords` to what the viewer may see.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      // The same rows call the on-screen list makes, so at terminal the missed
      // words — required AND bonus — print as they show.
      const words = buildWordListRows({
        foundWords,
        requiredWords: game.requiredWords,
        bonusWords: game.bonusWords,
        hasBonus: hasBonus,
        isTerminal,
      }).map((r) => ({
        word: r.word.toUpperCase(),
        pangram: r.isPangram ?? false, // pangrams print bold
        bonus: r.isBonus ?? false,
        found:
          r.kind === 'found'
            ? { points: r.points ?? 0, who: memberById(players, r.userId)?.username ?? 'someone' }
            : null,
      }))
      const rankIdx = currentRankIndex(foundWordsScore, game.required_words_score)
      printWordwheelPdf({
        brand,
        gameTitle: title,
        date: new Date().toLocaleDateString(),
        // Coop's rank and totals are the TEAM's, so the header states them.
        // Compete's are per player — each section carries its own — so the
        // header states only the shared targets.
        summary:
          game.mode === 'compete'
            ? `Target: ${game.required_words_score} pts · ${game.required_words_count} words`
            : `${RANKS[rankIdx]} · Score ${foundWordsScore} / ${game.required_words_score} · Words ${foundWordsCount} / ${game.required_words_count}`,
        outerLetters: game.outer_letters.split(''),
        centerLetter: game.center_letter,
        mode: game.mode,
        setup: summaryRows,
        // Coop prints one shared list; compete a section per player, plus a
        // trailing "Not found" at terminal.
        sections: buildWordSections(words, game.mode, players, session.user.id),
      })
    },
  })

  // ─── The menu ──────────────────────────────────────────
  // `buildGameMenu` supplies the framing (Help and chat above, Back to club
  // below); the middle is this game's own rows, each one a binding made above,
  // so a row's words, glyph, key and availability come from the action rather
  // than being typed a second time here.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          // The same two the terminal action row offers, reachable mid-game too.
          { items: [actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actRestart, actNewGame, actPrintBoard])

  // ─── Render ────────────────────────────────────────────
  // Everything below is derived fresh each render and read only by the JSX —
  // nothing here is a hook, which is why it may sit after the menu effect.

  // Who has bowed out of the race — the opponent strip's "out" cell. From the
  // common roster, like `myConceded`.
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  // Compete only: the leaderboard off the live status. Empty before the first
  // submission, and the strip then shows zeros for the opponents.
  const leaderboard = isCompete
    ? readLeaderboard<LeaderboardEntry>(status)
    : null
  // Each peer's rank index, keyed by user — the OpponentStrip metric reads it.
  const rankByUser = new Map(leaderboard?.map((e) => [e.user_id, e.rank_idx]) ?? [])

  // Merged, alphabetized rows for the shared WordList: the found words, and at
  // terminal every missed one — bonus included, being the same shipped data
  // the required half comes from.
  const wordRows = buildWordListRows({
    foundWords,
    requiredWords: game.requiredWords,
    bonusWords: game.bonusWords,
    hasBonus: hasBonus,
    isTerminal,
  })

  return (
    <div className={cls(shared.layout, shared.responsiveInfoCol, shared.mobileFill, surface.layout, styles.layout)}>
      <BoardCol
        // ── Mobile-only status block (the readouts the InfoCol renders too) ──
        foundWordsScore={foundWordsScore}
        requiredWordsScore={game.required_words_score}
        foundWordsCount={foundWordsCount}
        requiredWordsCount={game.required_words_count}
        targetRankIdx={targetRankIdx}
        // ── Board to render ──
        outerLetters={game.outer_letters}
        centerLetter={game.center_letter}
        // ── The move (BoardCol owns the engine and submit_word) ──
        gameId={gameId}
        mode={game.mode}
        selfId={session.user.id}
        readOnly={readOnly}
        foundWords={foundWords}
        requiredWords={game.requiredWords}
        bonusWords={game.bonusWords}
        // ── The below-board slot: BoardCol shows answers into it and draws it ──
        localFeedbackSlot={localFeedbackSlot}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
        // ── Mode + phase ──
        isCompete={isCompete}
        isTerminal={isTerminal}
        terminalMessage={terminalMessage}
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
        // ── Action row — the same bindings, in the order the menu lists them ──
        actRestart={actRestart}
        actNewGame={actNewGame}
        actConcede={actConcede}
        actEndGame={actEndGame}
        actBackToClub={menu.actBackToClub}
        // ── Setup disclosure ──
        setup={setup}
        setupRows={summaryRows}
        // ── Found-words list ──
        wordRows={wordRows}
        hasBonus={hasBonus}
        />
      </InfoSheet>
      {/* The win moment. The verdict itself stays in-page — the below-board
          pill and the action-row line (docs/ui.md → Terminal results). Only a
          coop game with a target rank can reach it. */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body={`Reached "${RANKS[setup.target_rank ?? 6]}" — ${foundWordsScore}/${game.required_words_score} points.`}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
