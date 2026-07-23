import { useCallback, useEffect, useMemo, useRef } from 'react'
import { cls } from '../../common/lib/util/cls'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import type { GamePageCtx, Member } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useWordSubmit, wordWithBonusDot, type WordEntry } from '../../common/hooks/game/useWordSubmit'
import { memberById } from '../../common/lib/game/peers'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { readLeaderboard } from '../../common/lib/game/foundWordsLeaderboard'
import { currentRankIndex, RANKS } from '../../common/lib/game/rankLadder'
import type { WordwheelSetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { buildDisplayRows } from '../../common/lib/game/foundWordsDisplayRows'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { invokeStartGameEdgeFn } from '../../common/lib/game/manifestRpcs'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { printWordwheelPdf } from '../pdf/printWordwheelPdf'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

import '../theme.css'

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
export function PlayArea(ctx: GamePageCtx) {
  const {
    gameId, isTerminal, playState, players, session, status,
    setup, goToClub, clubHandle, goToGame, menu, brand, title,
    // The COMMON header slot (peer/opponent events, via useGlobalFeedback + the compete rank effect) — as
    // opposed to the local in-body `localFeedback` state below, which carries
    // the player's own word result. Two different surfaces.
    globalFeedback,
  } = ctx
  const { game, foundWords, loading, rowsLoaded } = useGame(gameId)

  const wordwheelSetup = setup as WordwheelSetup

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the wheel
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // opened from the hook's "Game info" menu item. The sheet is `wide` (full device
  // width) so the WordList has room — the rem-width columns side-scroll. Desktop
  // is unchanged. No board divergence — input is letter taps (no keyboard).
  const infoSheet = useInfoSheet()

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  // The end/concede action handlers, held in a stable ref so the menu effect
  // needn't list the (later-declared, per-render `useCallback`) handlers in its
  // deps — that would rebuild the menu every render. Populated by an effect once
  // handleEndGame/handleConcede exist (below); read at click time. (Crosswords'
  // `actionsRef` pattern.)
  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    replay: () => void
    newGame: () => void
  } | null>(null)

  // Concede state (from the common roster). A conceder can't submit and sees the
  // locally-terminal look while the others race; peers show as "out" in the strip.
  // Declared up here (above the menu effect that greys the Concede item on it).
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
  // (required + bonus). Matches wordwheel-ws's "found.length" stat —
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
    const reveal = isTerminal ? game.requiredWords.filter((w) => !foundSet.has(w.word)) : null
    const pointsByWord = new Map(foundWords.map((w) => [w.word, w.points]))
    const words = buildDisplayRows(foundWords, reveal).map((r) => ({
      word: r.word.toUpperCase(),
      pangram: r.isPangram ?? false, // wordwheel's own difference: pangrams print bold
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
        { label: 'Required words', value: difficultyValue(wordwheelSetup.required) },
        { label: 'Bonus words', value: difficultyValue(wordwheelSetup.legal) },
        ...(game.mode === 'compete' && wordwheelSetup.target_rank != null
          ? [{ label: 'Target rank', value: RANKS[wordwheelSetup.target_rank] ?? '?' }]
          : []),
      ],
      words,
    }
    // The FULL wordwheel menu: Help (top) + the Print item + the End/Concede +
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
          { items: [{ id: 'print', label: 'Print board (PDF)', onClick: () => printWordwheelPdf(model) }] },
          {
            items: [
              // Same board, wiped finds / same setup, fresh board + id.
              { id: 'replay', label: 'Replay board', onClick: () => actionsRef.current?.replay() },
              { id: 'new-game', label: 'New game', onClick: () => actionsRef.current?.newGame() },
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, game, foundWords, players, brand, title, wordwheelSetup, isTerminal, myConceded, foundWordsScore, foundWordsCount, infoSheet.menuSections])

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

  // (The local outer-letter shuffle + the letter-click / Space-shuffle input moved
  // into BoardCol, beside the wheel + entry.)

  // ─── Move entry + own-move feedback (shared engine) ────
  // Both word lists ship to the FE, so a guess is validated + scored locally —
  // index required ∪ bonus by word. useWordSubmit owns the typed-word state, the
  // sticky own-move pill, and the optimistic commit + dedup; wordwheel supplies
  // the lookup, the RPC, the reject reason (bad-letters / missing-center /
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
      // A miss at/above min length. Words that don't fit the wheel's tiles (an
      // off-wheel letter, or a letter over its tile count) can't reach here —
      // BoardCol's `submitDisabled` gate vetoes their submit — so the only
      // reasons left are the missing centre or simply not-a-word. The hook wraps
      // the reason as `WORD — reason`.
      explainReject: (w) => {
        if (center && !w.includes(center)) return 'missing center letter'
        return 'not a word'
      },
    })

  // ─── End / Concede / Replay — the shared trio ──────────
  // End is the manual "we're done" stop (both modes; compete ends the race with
  // everyone {won:false} — a valid outcome, not a punishment), confirmed via the
  // styled modal. Concede (compete) is a real loss for the conceder while the
  // others race on. Replay restarts this board, clearing everyone's finds. All
  // three are the byte-identical shared handlers (useStandardGameActions); only
  // the failure-pill format + the replay sentence are wordwheel's. New game stays
  // below — its create path diverges per game.
  const showError = useCallback((m: string) => showLocalFeedback('error', m), [showLocalFeedback])
  const { endGame, concede, replay } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    replayConfirm: "Replay board? This clears everyone's found words and restarts the board.",
    showError,
  })

  // ─── New game — a FRESH game (new id, new board) with THIS game's setup ──
  // Same roster + mode, in the same club, via the same wordwheel-build-board
  // edge function the manifest's startGameInClub uses. Non-destructive (this
  // game un-currents into the club list), so no confirm; the creator jumps in
  // via ctx.goToGame, peers arrive via the game-invitation toast.
  const gameMode = game?.mode
  const handleNewGame = useCallback(async () => {
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet
    // A hand-picked custom board is a ONE-OFF (docs/games/wordwheel.md): a "new
    // game" should get a fresh RANDOM board, not silently rebuild the identical
    // letters (which would carry everyone's answer knowledge over). create_game
    // already strips these from the saved club default; strip them here too so
    // the edge fn takes the random path.
    const freshSetup = { ...setup, custom_center: undefined, custom_letters: undefined }
    const res = await invokeStartGameEdgeFn(
      'wordwheel-build-board',
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
    goToGame(`wordwheel_${gameMode}`, res.id)
  }, [gameMode, clubHandle, setup, players, brand, goToGame, showLocalFeedback])

  // Keep the menu's actions current (read by the menu items via the stable
  // actionsRef, so the menu effect needn't depend on these handlers).
  useEffect(() => {
    actionsRef.current = {
      endGame,
      concede,
      replay,
      newGame: () => void handleNewGame(),
    }
  }, [endGame, concede, replay, handleNewGame])

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
        text: r.is_pangram ? (
          <>
            <ActorDot actor={member} fallback="A teammate" /> found{' '}
            {wordWithBonusDot(r.word, r.is_bonus)} +{r.points} — pangram! 🦌
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
    return <div className={styles.loading}>Loading…</div>
  }
  if (!game) {
    return <div className={styles.empty}>Game not found.</div>
  }

  const isCompete = game.mode === 'compete'
  // Locally terminal (compete only): I conceded but the game continues for the
  // others. wordwheel has no other per-player "done" state (no elimination),
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
  // Target rank reads off `setup`, NOT `status.target_rank`. Setup
  // is fixed at create_game time and lives on every code path; the
  // status copy is written by submit_word's mid-game path and by
  // the won_compete terminal, but submit_timeout + end_game don't
  // re-emit it on the terminal status. Reading from setup avoids
  // a "Time up — no winner at Genius" verdict on a game that
  // actually targeted Amazing.
  const targetRankIdx = isCompete
    ? (wordwheelSetup.target_rank ?? null)
    : null

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
  const wordRows = buildDisplayRows(foundWords, isTerminal ? game.requiredWords : null)

  return (
    <div className={cls(shared.layout, shared.responsiveInfoCol, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Board to render ──
        outerLetters={game.outer_letters}
        centerLetter={game.center_letter}
        letterCounts={letterCounts}
        // ── Word entry (engine here; rendered in BoardCol) ──
        word={word}
        onChange={setWord}
        onSubmit={submit}
        localPill={localFeedback}
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
          (docs/playarea.md → Info-column readouts), with two wordwheel picks:
          the RankBar + Stats are ONE "state" unit and lead (the thing you watch),
          and there's no help line — the wheel makes the move obvious. The
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
        onRestart={replay}
        onNewGame={() => void handleNewGame()}
        onBackToClub={goToClub}
        onRequestBackToClub={menu.requestBackToClub}
        // ── Setup disclosure ──
        setup={wordwheelSetup}
        // ── Found-words list ──
        wordRows={wordRows}
        reveal={isTerminal}
        />
      </InfoSheet>
      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
      {confirmDialog}
    </div>
  )
}

/** Wraps a rank name for terminal copy: `rank "Solid"`. The bare ladder words
 *  ("Start", "Solid", "Nice", …) read as a puzzle mid-sentence — "Stopped at
 *  Start" looks like a typo — so a terminal line that embeds a rank labels it as
 *  one and quotes the name. (The standalone "Genius!" win celebration keeps the
 *  bare, iconic word — it's the exclamation, not embedded mid-sentence.) */
function rankLabel(name: string): string {
  return `rank "${name}"`
}

/**
 * Maps the terminal play_state to:
 *   - `outcome` — the GameOverModal's green/red color cue.
 *   - `verdict` — the centered large-font line in the modal.
 *   - `indicator` — the detailed status line that replaces the input area
 *     below the board (e.g. "Genius! 12/93 points").
 *   - `message` + `tone` — the short, bold, color-coded line in the
 *     info-column action row (won = green, lost = red, neutral = plain).
 *
 * A rank embedded mid-sentence is wrapped via `rankLabel` (`rank "Solid"`); the
 * bare "Genius!" win is the one exception (it's the celebratory exclamation).
 *
 * Coop:
 *   - `playState='ended'` + Genius rank → "Genius! N/M points."
 *   - `playState='ended'` + lower rank → 'Stopped at rank "Solid" —
 *     N/M points.' (covers timeout AND manual end, since the
 *     player already knows which one happened)
 *
 * Compete:
 *   - `playState='won_compete'` + caller is winner → 'You won
 *     the race — reached rank "Amazing"!'
 *   - `playState='won_compete'` + caller is NOT winner → '<name>
 *     beat you to rank "Amazing".'
 *   - `playState='ended'` with outcome='timeout' → 'Time's up —
 *     no winner at rank "Amazing".'
 *   - `playState='ended'` with outcome='manual' → 'Game ended —
 *     no winner at rank "Amazing".'
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
  /** From `setup.target_rank` — null in coop, present in compete. */
  targetRankIdx: number | null
  foundWordsScore: number
  requiredWordsScore: number
  selfRankIdx: number
  selfId: string
  players: Member[]
  // The shared TerminalCopy (drives the modal + info-column line) extended with a
  // wordwheel-specific `indicator` — the detailed below-board status line. Naming
  // TerminalCopy here (rather than re-listing its fields) makes the "same copy, plus
  // one extra field" relationship explicit; InfoCol consumes it as a plain TerminalCopy.
}): TerminalCopy & { indicator: string } {
  const rankName = RANKS[selfRankIdx]

  if (mode === 'compete') {
    // Passed in from setup, not derived here — see the comment at
    // the call site for why status is the wrong source for this.
    const targetRankName = RANKS[targetRankIdx ?? 6]

    if (playState === 'won_compete') {
      const winnerId = (status?.winner_user_id as string | undefined) ?? null
      const selfWon = winnerId === selfId
      if (selfWon) {
        return {
          outcome: 'won',
          verdict: `You won the race — reached ${rankLabel(targetRankName)}!`,
          indicator: `you won at ${rankLabel(targetRankName)}`,
          message: 'You won!',
          tone: 'won',
        }
      }
      const winnerName =
        players.find((p) => p.user_id === winnerId)?.username ?? 'someone'
      return {
        outcome: 'lost',
        verdict: `${winnerName} beat you to ${rankLabel(targetRankName)}.`,
        indicator: `${winnerName} won at ${rankLabel(targetRankName)}`,
        message: `${winnerName} won`,
        tone: 'lost',
      }
    }

    // playState='ended' in compete: timeout or manual. No winner
    // either way — the race didn't finish.
    const outcome = (status?.outcome as string | undefined) ?? 'ended'
    if (outcome === 'timeout') {
      return {
        outcome: 'lost',
        verdict: `Time's up — no winner at ${rankLabel(targetRankName)}.`,
        indicator: `time up — no winner at ${rankLabel(targetRankName)}`,
        message: 'Time up',
        tone: 'lost',
      }
    }
    return {
      outcome: 'lost',
      verdict: `Game ended — no winner at ${rankLabel(targetRankName)}.`,
      indicator: `ended — no winner at ${rankLabel(targetRankName)}`,
      message: 'Game ended',
      tone: 'neutral',
    }
  }

  // coop
  if (selfRankIdx >= 6) {
    return {
      outcome: 'won',
      verdict: `Genius! ${foundWordsScore}/${requiredWordsScore} points.`,
      indicator: `Genius! ${foundWordsScore}/${requiredWordsScore} points`,
      message: 'Genius!',
      tone: 'won',
    }
  }
  return {
    outcome: 'won',
    verdict: `Stopped at ${rankLabel(rankName)} — ${foundWordsScore}/${requiredWordsScore} points.`,
    indicator: `stopped at ${rankLabel(rankName)}`,
    message: `Stopped at ${rankLabel(rankName)}`,
    tone: 'neutral',
  }
}
