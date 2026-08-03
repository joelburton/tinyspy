import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import type { GamePageCtx, Member } from '../../common/lib/games'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useWordSubmit, wordWithBonusDot, type WordEntry } from '../../common/hooks/game/useWordSubmit'
import { memberById } from '../../common/lib/game/peers'
import { outOfRacePill } from '../../common/lib/game/localPills'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { readLeaderboard } from '../../common/lib/game/foundWordsLeaderboard'
import { currentRankIndex, RANKS } from '../../common/lib/game/rankLadder'
import type { SpellingbeeSetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { buildDisplayRows } from '../../common/lib/game/foundWordsDisplayRows'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { invokeStartGameEdgeFn } from '../../common/lib/game/manifestRpcs'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { printSpellingbeePdf } from '../pdf/printSpellingbeePdf'
import shared from '../../common/components/game/PlayArea.module.css'
import surface from '../../common/components/game/foundWordsPlayArea.module.css'
import styles from './PlayArea.module.css'

import '../theme.css'

/**
 * spellingbee's play surface — shared between the coop and compete
 * manifests. Mode is read off `game.mode` (denormalized at
 * create_game time, surfaced on `spellingbee.games_state`).
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
export function PlayArea(ctx: GamePageCtx) {
  const {
    gameId, isTerminal, playState, solutionRevealed, players, session, status,
    setup, goToClub, clubHandle, goToGame, menu, brand, title,
    // The COMMON header slot (peer/opponent events, via useGlobalFeedback + the compete rank effect) — as
    // opposed to the local in-body `localFeedback` state below, which carries
    // the player's own word result. Two different surfaces.
    globalFeedback,
  } = ctx
  const { game, foundWords, loading, rowsLoaded } = useGame(gameId)

  const spellingbeeSetup = setup as SpellingbeeSetup

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the hive
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // opened from the hook's "Game info" menu item. The sheet is `wide` (full device
  // width) so the WordList has room — the rem-width columns side-scroll. Desktop
  // is unchanged. No board divergence — input is letter taps (no keyboard).
  const infoSheet = useInfoSheet()

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  // ─── Coop-win celebration ──────────────────────────────
  // Confetti at the MOMENT the team crosses the rank they set out for (the
  // winning word flips playState to 'won' on every connected client via
  // realtime); opening an already-won game stays quiet (useCelebration never
  // pops on mount). Only coop reaches 'won' — compete writes 'won_compete', and
  // telling the winner from the losers there needs data that isn't right on the
  // first render (the waffle loading-race lesson), so compete doesn't celebrate.
  const celebration = useCelebration(playState === 'won')

  // The end/concede action handlers, held in a stable ref so the menu effect
  // needn't list the (later-declared, per-render `useCallback`) handlers in its
  // deps — that would rebuild the menu every render. Populated by an effect once
  // handleEndGame/handleConcede exist (below); read at click time. (Crosswords'
  // `actionsRef` pattern.)
  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    restart: () => void
    newGame: () => void
  } | null>(null)

  // Concede state (from the common roster). A conceder can't submit and sees the
  // locally-terminal look while the others race; peers show as "out" in the strip.
  // Declared up here (above the menu effect that greys the Concede item on it).
  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  // Score + words-found derived from the FE's view of
  // spellingbee.found_words. The bucket of rows we sum depends on mode:
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
  // (required + bonus). Matches spellingbee-ws's "found.length" stat —
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

  // "Print board (PDF)" GamePage menu item. Builds the plain-data print model from the
  // live state (RLS + the explicit compete filter already scope what I may see) and
  // hands it to the jsPDF renderer. A snapshot at click time. See docs/pdf.md.
  useEffect(() => {
    if (!game) return
    // The same reveal the on-screen list uses: at terminal, required-but-missed words
    // fold in (`buildDisplayRows` dedups found + appends the unfound). Look up each
    // found word's points (the shared row type carries finder/bonus/pangram, not score).
    const foundSet = new Set(foundWords.map((w) => w.word))
    // Gated on the COMMON flag, not `isTerminal`: this game doesn't hide its
    // solution (gametypes.hides_solution = false), so end_game sets
    // solution_revealed at every ending — and if that ever changes, it changes
    // in one place instead of in each of these expressions.
    const reveal = solutionRevealed
      ? game.requiredWords.filter((w) => !foundSet.has(w.word))
      : null
    const pointsByWord = new Map(foundWords.map((w) => [w.word, w.points]))
    const words = buildDisplayRows(foundWords, reveal).map((r) => ({
      word: r.word.toUpperCase(),
      pangram: r.isPangram ?? false, // spellingbee's own difference: pangrams print bold
      bonus: r.kind === 'found' ? (r.isBonus ?? false) : false,
      found:
        r.kind === 'found'
          ? { points: pointsByWord.get(r.word) ?? 0, who: memberById(players, r.userId)?.username ?? 'someone' }
          : null,
    }))
    const rankIdx = currentRankIndex(foundWordsScore, game.required_words_score)
    const model = {
      brand,
      gameTitle: title,
      date: new Date().toLocaleDateString(),
      // Exactly the on-screen InfoCol status (RankBar rank + the Score / Words stats).
      summary: `${RANKS[rankIdx]} · Score ${foundWordsScore} / ${game.required_words_score} · Words ${foundWordsCount} / ${game.required_words_count}`,
      outerLetters: game.outer_letters.split(''),
      centerLetter: game.center_letter,
      // Relevant setup only (the timer isn't relevant on a print).
      setup: [
        { label: 'Required words', value: difficultyValue(spellingbeeSetup.required) },
        { label: 'Bonus words', value: difficultyValue(spellingbeeSetup.legal) },
        ...(game.mode === 'compete' && spellingbeeSetup.target_rank != null
          ? [{ label: 'Target rank', value: RANKS[spellingbeeSetup.target_rank] ?? '?' }]
          : []),
      ],
      words,
    }
    // The FULL spellingbee menu: Help (top) + the Print item + the End/Concede +
    // Back-to-club tail, all from `buildGameMenu`. End/concede dispatch through the
    // stable `actionsRef` so this effect needn't depend on the later-declared
    // handlers. `mode` picks coop's End vs compete's Concede; `myConceded` greys
    // the compete item once I've dropped out.
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: game.mode,
        isTerminal,
        conceded: myConceded,
        onEndGame: () => actionsRef.current?.endGame(),
        onConcede: () => actionsRef.current?.concede(),
        extra: [
          // Mobile-only "Game info" item (off-canvas info column); empty on desktop.
          ...infoSheet.menuSections,
          { items: [{ id: 'print', label: 'Print board (PDF)', onClick: () => printSpellingbeePdf(model) }] },
          {
            items: [
              // Same board, wiped finds / same setup, fresh board + id.
              { id: 'restart', label: 'Restart', onClick: () => actionsRef.current?.restart() },
              { id: 'new-game', label: 'New game', shortcut: '+', onClick: () => actionsRef.current?.newGame() },
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, game, foundWords, players, brand, title, spellingbeeSetup, isTerminal, solutionRevealed, myConceded, foundWordsScore, foundWordsCount, infoSheet.menuSections])

  // ─── Allowed-letter set (drives illegal-letter dim) ────
  const allowedLetters = useMemo(() => {
    if (!game) return new Set<string>()
    const s = new Set<string>()
    for (const ch of game.outer_letters) s.add(ch.toLowerCase())
    s.add(game.center_letter.toLowerCase())
    return s
  }, [game])

  // (The local outer-letter shuffle + the letter-click / Space-shuffle input moved
  // into BoardCol, beside the honeycomb + entry.)

  // ─── Move entry + own-move feedback (shared engine) ────
  // Both word lists ship to the FE, so a guess is validated + scored locally —
  // index required ∪ bonus by word. useWordSubmit owns the typed-word state, the
  // sticky own-move pill, and the optimistic commit + dedup; spellingbee supplies
  // the lookup, the RPC, the reject reason (bad-letters / missing-center /
  // not-a-word), and the success label (with the pangram flourish). See
  // docs/games/spellingbee.md.
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

  const center = game?.center_letter.toLowerCase() ?? ''
  const { word, setWord, lastWord, submit, localFeedback, clearLocalFeedback, showLocalFeedback } =
    useWordSubmit({
      mode: game?.mode ?? 'coop',
      userId: session.user.id,
      isTerminal: isTerminal || myConceded,
      minWordLength: 4,
      foundWords,
      lookup: (w) => legalIndex.get(w) ?? null,
      commit: async (e) => {
        const { error } = await db.rpc('submit_word', {
          target_game: gameId,
          word: e.word,
          points: e.points,
          is_pangram: e.isPangram ?? false,
          is_bonus: e.isBonus,
        })
        return { error }
      },
      // A miss at/above min length: name why (a letter off the board, or the
      // center letter missing) else it's simply not a word. The hook wraps the
      // reason as `WORD — reason`.
      explainReject: (w) => {
        for (const ch of w) {
          if (!allowedLetters.has(ch)) return 'bad letters'
        }
        // Name the letter rather than the rule: "missing \"A\"" is both shorter
        // and more actionable than "missing center letter" (the quotes are
        // literal — they mark the letter as a quoted character, not a word).
        if (center && !w.includes(center)) return `missing "${center.toUpperCase()}"`
        return 'not a word'
      },
    })

  // ─── End / Concede / Replay — the shared trio ──────────
  // End is the manual "we're done" stop (both modes; compete ends the race with
  // everyone {won:false} — a valid outcome, not a punishment), confirmed via the
  // styled modal. Concede (compete) is a real loss for the conceder while the
  // others race on. Replay restarts this board, clearing everyone's finds. All
  // three are the byte-identical shared handlers (useStandardGameActions); only
  // the failure-pill format + the replay sentence are spellingbee's. New game
  // stays below — its create path diverges per game.
  const showError = useCallback((m: string) => showLocalFeedback('error', m), [showLocalFeedback])
  const { endGame, concede, restart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    showError,
  })

  // ─── New game — a FRESH game (new id, new board) with THIS game's setup ──
  // Same roster + mode, in the same club, via the same spellingbee-build-board
  // edge function the manifest's startGameInClub uses. Non-destructive (this
  // game un-currents into the club list), so no confirm; the creator jumps in
  // via ctx.goToGame, peers arrive via the game-invitation toast.
  const gameMode = game?.mode
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet
    // A hand-picked custom board is a ONE-OFF (docs/games/spellingbee.md): a
    // "new game" should get a fresh RANDOM board, not silently rebuild the
    // identical letters (which would carry everyone's answer knowledge over).
    // create_game already strips these from the saved club default; strip them
    // here too so the edge fn takes the random path.
    const freshSetup = { ...setup, custom_center: undefined, custom_letters: undefined }
    const res = await invokeStartGameEdgeFn(
      'spellingbee-build-board',
      {
        target_club: clubHandle,
        setup: freshSetup,
        player_user_ids: players.map((p) => p.user_id),
        mode: gameMode,
      },
      brand,
    )
    if ('error' in res) {
      showLocalFeedback('error', `New game failed: ${res.error}`)
      return
    }
    goToGame(`spellingbee_${gameMode}`, res.id)
  }, [gameMode, clubHandle, setup, players, brand, goToGame, showLocalFeedback, confirmAction, isTerminal])

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

  // Keep the menu's actions current (read by the menu items via the stable
  // actionsRef, so the menu effect needn't depend on these handlers).
  useEffect(() => {
    actionsRef.current = {
      endGame,
      concede,
      restart,
      newGame: () => void handleNewGame(),
    }
  }, [endGame, concede, restart, handleNewGame])

  // Peer/opponent activity → header feedback pills (coop: a peer found a
  // word; compete: an opponent climbed a rank). Self-activity is excluded —
  // it's reported by the in-body pill / RankBar. Called unconditionally,
  // before the early returns, and reads `game?.mode` (null while loading; the
  // hook no-ops until loaded + bootstrapped).
  // ─── Coop peer-word narration (global header) ──────────────────
  // coop's `found_words` is club-wide, so a teammate's accepted word arrives in
  // `foundWords`; surface good + pangram finds. Rejected words never become a
  // row, so there's nothing to suppress. Own words go to the in-body local pill.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    // Gate the seed on the found_words fetch (separate from the header that sets
    // `game`), so a coop rejoin doesn't replay the backlog as a burst of pills.
    ready: rowsLoaded,
    items: foundWords,
    keyOf: (r) => `${r.user_id}:${r.word}`,
    messageFor: (r) => {
      if (r.user_id === session.user.id) return null // own word → in-body pill
      const member = players.find((p) => p.user_id === r.user_id)
      return {
        tone: 'success',
        variant: 'outline',
        // A pangram leads with the label + the bee, so the headline reads before
        // the word does — and so the line fits the header pill's ~26 phone
        // characters, which "found WORD +14 — pangram! 🐝" did not.
        text: r.is_pangram ? (
          <>
            <ActorDot actor={member} fallback="A teammate" /> pangram 🐝{' '}
            {wordWithBonusDot(r.word, r.is_bonus)} +{r.points}
          </>
        ) : (
          <>
            <ActorDot actor={member} fallback="A teammate" /> found{' '}
            {wordWithBonusDot(r.word, r.is_bonus)} +{r.points}
          </>
        ),
        dismiss: { kind: 'timed' },
      }
    },
    globalFeedback,
  })

  // ─── Compete opponent-rank narration (global header) ───────────
  // Opponents' words are RLS-hidden in compete, so the one competitively-
  // meaningful signal is a rank CLIMB, read off `status.leaderboard` — a delta
  // detector (bucket B in docs/peer-feedback-audit.md), NOT a seen-set: it fires
  // on a rank INCREASE, not a new row, so it stays hand-rolled here. `ranksReady`
  // seeds each player's last-seen rank on first load so history isn't replayed.
  const prevRankRef = useRef<Map<string, number>>(new Map())
  const ranksReadyRef = useRef(false)
  useEffect(() => {
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
        globalFeedback.show({
          tone: 'info',
          variant: 'outline',
          text: (
            <>
              <ActorDot actor={member} fallback="An opponent" /> reached{' '}
              {RANKS[row.rank_idx] ?? 'a new rank'}
            </>
          ),
          dismiss: { kind: 'sticky' },
        })
      }
    }
  }, [game, status, players, session.user.id, globalFeedback])

  // Called UNCONDITIONALLY here, before any early returns —
  // React forbids conditional hook calls.

  if (loading) {
    return <div className={surface.loading}>Loading…</div>
  }
  if (!game) {
    return <div className={surface.empty}>Game not found.</div>
  }

  const isCompete = game.mode === 'compete'
  // Locally terminal (compete only): I conceded but the game continues for the
  // others. spellingbee has no other per-player "done" state (no elimination),
  // so conceding is the only way to reach it.
  const isLocallyDone = isCompete && myConceded && !isTerminal

  // Caller's current rank in the local ladder. For compete this
  // is the value the OpponentStrip surfaces for the "You:
  // <rank>" entry. For coop it's the team rank (same number, same
  // computation — the RLS-narrowed sum just happens to equal the
  // team sum in coop because everyone sees every row).
  const selfRankIdx = currentRankIndex(foundWordsScore, game.required_words_score)

  // Compete-only: pull the leaderboard payload off the live
  // status jsonb. Pre-first-submission the array is empty and
  // the strip falls back to placeholder zeros for opponents.
  const leaderboard = isCompete
    ? readLeaderboard(status)
    : null
  // Each peer's rank index, keyed by user — the OpponentStrip metric reads it.
  const rankByUser = new Map(leaderboard?.map((e) => [e.user_id, e.rank_idx]) ?? [])
  // Target rank reads off `setup`, NOT `status.target_rank`. Setup is fixed at
  // create_game time and lives on every code path; the status copy is written by
  // submit_word and the terminals, but reading it would make the verdict depend
  // on which terminal path ran. Both modes now: compete's race finish line, and
  // coop's OPTIONAL win threshold (null = the open-ended hunt).
  const targetRankIdx = spellingbeeSetup.target_rank ?? null

  const over = isTerminal
    ? buildOver({
      mode: game.mode,
      playState,
      status,
      targetRankIdx,
      foundWordsScore,
      requiredWordsScore: game.required_words_score,
      selfRankIdx,
      selfId: session.user.id,
      players,
    })
    : null

  // Merged, alphabetized rows for the shared WordList (found + the terminal reveal).
  const wordRows = buildDisplayRows(foundWords, solutionRevealed ? game.requiredWords : null)

  return (
    <div className={cls(shared.layout, shared.responsiveInfoCol, shared.mobileFill, surface.layout, styles.layout)}>
      <BoardCol
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
        allowedLetters={allowedLetters}
        // ── Word entry (engine here; rendered in BoardCol) ──
        word={word}
        onChange={setWord}
        onSubmit={submit}
        // Locally terminal (compete: I conceded while the others play on) gets the
        // standard "you're out" pill, so the frozen entry has an explanation right
        // beside it. The InfoCol's LocalTerminalRow says the same thing tersely —
        // dual placement is the rule (docs/playarea.md), and on a phone the InfoCol
        // is off-canvas, making this the ONLY copy the player sees.
        localPill={isLocallyDone ? outOfRacePill(true) : localFeedback}
        clearLocalFeedback={clearLocalFeedback}
        lastWord={lastWord}
        isTerminal={isTerminal}
        // ── Below-board pill ──
        over={over}
      />

      {/* The info column. Its top region — the readouts + action row + setup — is
          wrapped in the shared `.actionSlot` (same as psychicnum / connections /
          codenamesduet / waffle): a fixed-height block so the WordList below it
          doesn't shift when the action row swaps play↔terminal (docs/ui.md →
          Layout stability). Order follows the canonical info-column sequence
          (docs/playarea.md → Info-column readouts), with two spellingbee picks:
          the RankBar + Stats are ONE "state" unit and lead (the thing you watch),
          and there's no help line — the honeycomb makes the move obvious. The
          WordList fills the rest. Off-canvas full-width sheet on mobile, flex
          child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close} wide>
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
        onEndGame={endGame}
        onConcede={concede}
        onRestart={restart}
        onNewGame={handleNewGame}
        startingNewGame={startingNewGame}
        onBackToClub={goToClub}
        onRequestBackToClub={menu.requestBackToClub}
        // ── Setup disclosure ──
        setup={spellingbeeSetup}
        // ── Found-words list ──
        wordRows={wordRows}
        reveal={solutionRevealed}
        />
      </InfoSheet>
      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board pill + the info-column outcome line.
          A coop WIN — only possible when the team set a target rank — gets the
          celebration instead, once, at the moment they cross. */}
      {celebration.show && (
        <CelebrationDialog
          title="You win! 🎉"
          body={`Reached "${RANKS[spellingbeeSetup.target_rank ?? 6]}" — ${foundWordsScore}/${game.required_words_score} points.`}
          onClose={celebration.close}
        />
      )}
      {confirmDialog}
    </div>
  )
}


/**
 * The terminal copy: `verdict` + `tone` drive the permanent below-board pill,
 * `message` + `tone` the short bold line in the info-column action row. No modal
 * carries the verdict — a coop WIN pops `<CelebrationDialog>` and everything
 * else lives in-page.
 *
 * Verdicts lead with the OUTCOME WORD — "Won:" / "Lost:" / "Ended:" — so the
 * result reads before the detail does, and they stay short enough for the
 * below-board pill on a phone (~44 characters; it ellipsises rather than wraps).
 * A rank in a verdict is quoted (`"Genius"`), the one place we still use
 * `rankLabel`'s longer `rank "Genius"` form being the info-column line.
 *
 * **Coop** (the target rank is optional — see `SpellingbeeSetup.target_rank`):
 *   - `won`   — the team reached the rank they set out for → `Won: "Genius" 47/50 points`
 *   - `lost`  — the countdown beat an unreached target → `Lost: ran out of time`
 *   - `ended` — no target, or they stopped early → `Ended: Solid 10/50 points`
 *     (the rank REACHED, not a target; the same sentence at every rank)
 *
 * **Compete** (a target rank is always set):
 *   - `won_compete`, caller won → `Won: "Amazing" 47/50 points`
 *   - `won_compete`, beaten → `● alice won at "Amazing"` (a WIDGET — the
 *     opponent's identity dot — hence `verdictNode`; `verdict` carries the
 *     plain-text twin for anything that needs a string)
 *   - `lost_compete` + outcome `conceded` (everyone dropped) → `Lost: all conceded`
 *   - `lost_compete` + outcome `timeout` → `Lost: ran out of time`
 *   - `ended` + outcome `manual` → the shared `endedCopy('compete')` → `Game ended — no winner`
 */
function buildOver({
  mode,
  playState,
  status,
  targetRankIdx,
  foundWordsScore,
  requiredWordsScore,
  selfRankIdx,
  selfId,
  players,
}: {
  mode: 'coop' | 'compete'
  playState: string
  status: Record<string, unknown> | null
  /** From `setup.target_rank`: always set in compete, optional in coop (null =
   *  the open-ended hunt, which has no win condition). */
  targetRankIdx: number | null
  foundWordsScore: number
  requiredWordsScore: number
  selfRankIdx: number
  selfId: string
  players: Member[]
  // The shared TerminalCopy plus an optional NODE verdict — the one case where
  // the pill needs a widget (the winner's identity dot) rather than a string.
  // InfoCol consumes it as a plain TerminalCopy.
}): TerminalCopy & { verdictNode?: ReactNode } {
  const rankName = RANKS[selfRankIdx]
  const points = `${foundWordsScore}/${requiredWordsScore} points`

  if (mode === 'compete') {
    // Passed in from setup, not derived here — see the comment at
    // the call site for why status is the wrong source for this.
    const targetRankName = RANKS[targetRankIdx ?? 6]

    if (playState === 'won_compete') {
      const winnerId = (status?.winner_user_id as string | undefined) ?? null
      if (winnerId === selfId) {
        return {
          verdict: `Won: "${targetRankName}" ${points}`,
          message: 'You won!',
          tone: 'won',
        }
      }
      const winner = players.find((p) => p.user_id === winnerId)
      const winnerName = winner?.username ?? 'someone'
      return {
        verdict: `${winnerName} won at "${targetRankName}"`,
        // The identity dot names the winner the way every other peer message
        // does — no "Lost:" prefix needed, the loss is implicit in "they won".
        verdictNode: (
          <>
            <ActorDot actor={winner} fallback="someone" show="both" /> won at "
            {targetRankName}"
          </>
        ),
        message: `${winnerName} won`,
        tone: 'lost',
      }
    }

    // What's left in compete is the two collective losses — both land on
    // play_state 'lost_compete' — and manual ('ended'). The play_state can't
    // tell the losses apart, so all three key on `outcome`: 'conceded' (the
    // last racer dropped, via common.concede), 'timeout' (the clock beat
    // everyone to the target), or 'manual'. The clock and attrition are
    // losses; agreeing to stop isn't.
    const outcome = (status?.outcome as string | undefined) ?? 'ended'
    if (outcome === 'conceded') {
      return {
        verdict: 'Lost: all conceded',
        message: 'All conceded',
        tone: 'lost',
      }
    }
    if (outcome === 'timeout') {
      return {
        verdict: 'Lost: ran out of time',
        message: 'Out of time',
        tone: 'lost',
      }
    }
    // The shared neutral manual-end copy, like every other game — the friends
    // agreed to stop, and that sentence isn't per-game.
    return endedCopy('compete')
  }

  // ─── coop ───
  if (playState === 'won') {
    // The rank NAMED is the one they set out for; the score can overshoot it.
    const targetRankName = RANKS[targetRankIdx ?? selfRankIdx]
    return {
      verdict: `Won: "${targetRankName}" ${points}`,
      message: 'You won!',
      tone: 'won',
    }
  }
  if (playState === 'lost') {
    // Only reachable with a target set: the countdown beat them to it.
    return {
      verdict: 'Lost: ran out of time',
      message: 'Out of time',
      tone: 'lost',
    }
  }
  // 'ended' — the open-ended hunt finishing, or an early stop. Neutral, and the
  // same sentence at every rank (Genius included): they didn't fail at anything.
  return {
    verdict: `Ended: ${rankName} ${points}`,
    message: rankName,
    tone: 'neutral',
  }
}
