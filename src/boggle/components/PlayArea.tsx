import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GamePageCtx, GamePlayer } from '../../common/lib/games'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { invokeStartGameEdgeFn } from '../../common/lib/game/manifestRpcs'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { outOfRacePill } from '../../common/lib/game/localPills'
import { memberById } from '../../common/lib/game/peers'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { useWordSubmit, wordWithBonusDot, type WordEntry } from '../../common/hooks/game/useWordSubmit'
import { boardToDisplay, DICE_BY_NAME } from '../lib/dice'
import { traceableStr } from '../lib/boardTrace'
import { type LadderName } from '../lib/solver'
import type { BoggleSetup } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { buildDisplayRows } from '../lib/displayRows'
import { printBogglePdf } from '../pdf/printBogglePdf'
import { db } from '../db'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

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
 * `<EntryBox>` display), the same as spellingbee — boggle's structural twin.
 */
export function PlayArea(ctx: GamePageCtx) {
  const { gameId, players, isTerminal, playState, setup, goToClub, clubHandle, goToGame, session, status, globalFeedback, menu, brand, title } = ctx
  const { game, foundWords, loading, rowsLoaded } = useGame(gameId)

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into a full-width off-canvas
  // <InfoSheet> (wide, like spellingbee — its WordList wants the room). The board
  // fills for free (a square sized min(--avail-w, --avail-h, …)); input is tile
  // taps (path-tracing, see BoardCol). Desktop is unchanged.
  const infoSheet = useInfoSheet()

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

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
  const ladder: LadderName = (boggleSetup.scoring_ladder as LadderName) ?? 'basic'

  // ─── Move entry + own-move feedback (shared engine) ────
  // The board ships with its full legal list (required ∪ bonus), so a guess is
  // validated + scored locally — index it by word for O(1) lookup. `useWordSubmit`
  // owns the typed-word state, the sticky own-move pill, and the optimistic
  // commit + dedup; boggle only supplies the lookup, the RPC, the reject reason
  // (not-on-board vs not-a-word, client-side via `traceableStr`), and the success
  // label. See docs/games/boggle.md.
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

  // The End/Concede handlers are declared BELOW the menu effect (they depend on
  // the move-entry hook, declared later). Hold them in a stable ref — populated
  // by its own effect once they exist — so the menu effect can call them without
  // listing them in its deps and re-running on every render (the crosswords
  // `actionsRef` pattern; setGameSections is a setState, so a per-render re-run
  // would loop).
  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    restart: () => void
    newGame: () => void
  } | null>(null)

  const { word, setWord, lastWord, submit, localFeedback, clearLocalFeedback, showLocalFeedback } =
    useWordSubmit({
      mode: game?.mode ?? 'coop',
      userId: myId,
      // A conceder is locally done: gate word entry as if the game were terminal.
      isTerminal: isTerminal || myConceded,
      minWordLength: game?.min_word_length ?? 3,
      foundWords,
      lookup: (w) => legalIndex.get(w) ?? null,
      commit: async (e) => {
        const { error } = await db.rpc('submit_word', {
          target_game: gameId,
          word: e.word,
          points: e.points,
          is_bonus: e.isBonus,
        })
        return { error }
      },
      // A miss is either untraceable ("not on board") or traceable-but-not-a-word
      // — the distinction boggle keeps, computed from the board on the FE. The
      // hook wraps the reason as `WORD — reason`.
      explainReject: (w) => (game && traceableStr(game.board, w) ? 'not a word' : 'not on board'),
    })

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

  // "Print board (PDF)" GamePage menu item. Builds the plain-data print model from
  // the live state (RLS already scoped `foundWords` to what I may see — coop = the
  // team's, compete = my own) and hands it to the jsPDF renderer. A snapshot at
  // click time — works mid-game or at the end. See docs/pdf.md.
  useEffect(() => {
    if (!game) return
    // The same reveal the on-screen list uses: at terminal, required-but-missed words
    // are folded in (`buildDisplayRows` dedups found + appends the unfound); mid-game
    // there's no reveal, so only found words show. Look up each found word's points
    // (the shared row type carries the finder/bonus but not the score).
    const foundSet = new Set(foundWords.map((w) => w.word))
    const revealWords = isTerminal ? game.required_words.filter((r) => !foundSet.has(r.word)) : null
    const pointsByWord = new Map(foundWords.map((w) => [w.word, w.points]))
    const words = buildDisplayRows(foundWords, revealWords).map((r) => ({
      word: r.word.toUpperCase(),
      bonus: r.kind === 'found' ? (r.isBonus ?? false) : false,
      // A found word carries score + finder; an unfound (missed) reveal entry is bare.
      found:
        r.kind === 'found'
          ? { points: pointsByWord.get(r.word) ?? 0, who: memberById(players, r.userId)?.username ?? 'someone' }
          : null,
    }))
    const model = {
      brand,
      gameTitle: title,
      date: new Date().toLocaleDateString(),
      // Exactly the on-screen InfoCol status: found / required words · score.
      summary: `${myCount} / ${game.required_words_count} words · ${myScore} pts`,
      board: boardToDisplay(game.board, game.n),
      // Relevant setup only (the timer isn't relevant on a print).
      setup: [
        { label: 'Dice', value: DICE_BY_NAME[boggleSetup.dice_set]?.desc ?? boggleSetup.dice_set },
        { label: 'Required words', value: difficultyValue(boggleSetup.band) },
        { label: 'Bonus words', value: difficultyValue(boggleSetup.legal_band) },
        { label: 'Min length', value: `${boggleSetup.min_word_length} letters` },
        { label: 'Scoring', value: ladder.charAt(0).toUpperCase() + ladder.slice(1) },
      ],
      // Alphabetical — the 5-column list renders them column-major.
      words,
    }
    // The FULL boggle menu: Help (top) + our Print item + the End/Concede +
    // Back-to-club tail. The End/Concede handlers dispatch through the stable
    // `actionsRef` so this effect needn't depend on them (they're declared below).
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
          { items: [{ id: 'print', label: 'Print board (PDF)', onClick: () => printBogglePdf(model) }] },
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
  }, [menu, game, foundWords, players, brand, title, boggleSetup, ladder, isTerminal, myConceded, myCount, myScore, infoSheet.menuSections])

  // Every visible found word (used for the missed-words reveal; in compete this
  // is self-only mid-game and everyone's post-terminal — exactly "words nobody
  // found").
  const foundSet = useMemo(() => new Set(foundWords.map((f) => f.word)), [foundWords])

  // ─── End / Concede / Replay — the shared trio ──────────
  // The byte-identical shared handlers (useStandardGameActions); only the
  // failure-pill format + the replay sentence are boggle's. Its errors share the
  // same below-board pill as a word submit (via showLocalFeedback). New game
  // stays below — its create path diverges per game.
  const showError = useCallback((m: string) => showLocalFeedback('error', m), [showLocalFeedback])
  const { endGame, concede, restart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    restartConfirm: "Restart? This clears everyone's found words and restarts the board.",
    showError,
  })

  // ─── New game — a FRESH game (new id, new board) with THIS game's setup ──
  // Same roster + mode, in the same club, via the same boggle-build-board edge
  // function the manifest's startGameInClub uses. Non-destructive (this game
  // un-currents into the club list), so no confirm; the creator jumps in via
  // ctx.goToGame, peers arrive via the game-invitation toast.
  const gameMode = game?.mode
  const handleNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet
    const res = await invokeStartGameEdgeFn(
      'boggle-build-board',
      {
        target_club: clubHandle,
        setup,
        player_user_ids: players.map((p) => p.user_id),
        mode: gameMode,
      },
      brand,
    )
    if ('error' in res) {
      showLocalFeedback('error', `New game failed: ${res.error}`)
      return
    }
    goToGame(`boggle_${gameMode}`, res.id)
  }, [gameMode, clubHandle, setup, players, brand, goToGame, showLocalFeedback, confirmAction, isTerminal])

  // Keep the menu's actions current (read via the stable actionsRef, so the
  // menu effect above never re-runs to pick up a new closure).
  useEffect(() => {
    actionsRef.current = {
      endGame,
      concede,
      restart,
      newGame: () => void handleNewGame(),
    }
  }, [endGame, concede, restart, handleNewGame])

  // ─── Coop peer-word narration (global header) ──────────────────
  // coop's `found_words` is club-wide, so a teammate's accepted word arrives in
  // `foundWords`; surface it in the shared header slot (the twin of spellingbee's
  // coop narration). Rejected words never become a row, so there's nothing to
  // suppress; own words go to the in-body local pill. boggle has no pangram, but
  // a long find (7+ letters) is its "wow" moment — flag those. Compete stays
  // silent by design (opponents' words are private; no rank ladder to announce).
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    // Gate the seed on the found_words fetch (separate from the header that sets
    // `game`), so a coop rejoin doesn't replay the backlog as a burst of pills.
    ready: rowsLoaded,
    items: foundWords,
    keyOf: (r) => `${r.user_id}:${r.word}`,
    messageFor: (r) => {
      if (r.user_id === myId) return null // own word → in-body pill
      const member = players.find((p) => p.user_id === r.user_id)
      const wow = r.word.length >= 7
      const label = wordWithBonusDot(r.word, r.is_bonus)
      return {
        tone: 'success',
        variant: 'outline',
        // A long find leads with the flourish (spellingbee's "pangram 🐝 WORD
        // +14" shape) so the headline reads before the word does — and so the
        // line fits the header pill's ~26 phone characters.
        text: wow ? (
          <>
            <ActorDot actor={member} fallback="A teammate" /> wow! {label} +{r.points}
          </>
        ) : (
          <>
            <ActorDot actor={member} fallback="A teammate" /> found {label} +{r.points}
          </>
        ),
        dismiss: { kind: 'timed' },
      }
    },
    globalFeedback,
  })


  if (loading || !game || !grid) return <div className={styles.loading}>Loading…</div>

  const isCompete = game.mode === 'compete'
  // Locally terminal (compete only): I conceded but the game continues for the
  // others. boggle has no elimination, so conceding is the only path to it.
  const isLocallyDone = isCompete && myConceded && !isTerminal

  // When the legal band equals the required band, bonus words are only words the
  // clean filter removed from the required set — not an intentional wider dictionary.
  // Suppress the Bonus Words / Bonus Score cells in that case.
  const hasBonusDifficulty = boggleSetup.legal_band !== boggleSetup.band

  // Post-terminal reveal: the required words nobody found.
  const revealWords = isTerminal
    ? game.required_words.filter((r) => !foundSet.has(r.word))
    : null
  // Merged, alphabetized rows for the shared WordList (found + the reveal).
  const wordRows = buildDisplayRows(foundWords, revealWords)

  const over = isTerminal
    ? buildOver({ mode: game.mode, status, myCount, myScore, players, myConceded, selfId: myId, playState })
    : null

  // Index the compete leaderboard by user so the OpponentStrip metric can read
  // each peer's score (self reads the live local computation so it stays in lock
  // step with the state line above).
  const leaderboard = (status?.leaderboard as LeaderRow[] | undefined) ?? []
  const scoreByUser = new Map(leaderboard.map((e) => [e.user_id, e.found_words_score]))

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
        // ── Word entry (engine here; rendered in BoardCol) ──
        word={word}
        onChange={setWord}
        onSubmit={submit}
        onAnyKey={clearLocalFeedback}
        lastWord={lastWord}
        readOnly={isTerminal || myConceded}
        // ── Below-board pill ──
        over={over}
        // Locally terminal (compete: I conceded while the others play on) gets the
        // standard "you're out" pill, so the frozen entry has an explanation right
        // beside it. The InfoCol's LocalTerminalRow says the same thing tersely —
        // dual placement is the rule (docs/playarea.md), and on a phone the InfoCol
        // is off-canvas, making this the ONLY copy the player sees.
        localPill={isLocallyDone ? outOfRacePill(true) : localFeedback}
      />

      {/* Info column — off-canvas full-width sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close} wide>
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
        onEndGame={endGame}
        onConcede={concede}
        onRestart={restart}
        onNewGame={() => void handleNewGame()}
        onBackToClub={goToClub}
        onRequestBackToClub={menu.requestBackToClub}
        // ── Setup disclosure ──
        setup={boggleSetup}
        diceLabel={diceLabel}
        ladderLabel={ladderLabel}
        minWordLength={game.min_word_length}
        // ── Found-words list ──
        wordRows={wordRows}
        reveal={revealWords !== null}
        />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board pill + the info-column outcome line. A coop TARGET
          win — the only unambiguous win boggle has — gets the celebration
          instead, once, at the moment the team crosses. */}
      {celebration.show && (
        <CelebrationDialog
          title="Target reached! 🎉"
          body={`${myCount} words, ${myScore} points.`}
          onClose={celebration.close}
        />
      )}
      {confirmDialog}
    </div>
  )
}

type StatusBlob = Record<string, unknown>
type LeaderRow = { user_id: string; found_words_count: number; found_words_score: number }

/**
 * Per-status terminal copy. A game ends three ways (`status.outcome`): a player
 * hitting End (`'manual'`), the timer expiring (`'timeout'`), or a score TARGET
 * being reached (`'target'`, when setup.win_percent is set — a real win). Coop is
 * otherwise a neutral shared hunt (no win/loss); compete without a target picks
 * the highest score. A `'target'` compete win names the crosser in
 * `status.winner_id` / `status.winner_username`.
 *
 * `verdict` + `tone` drive the permanent below-board pill; `message` + `tone`
 * drive the short bold line in the info-column action row.
 */
function buildOver({
  mode,
  status,
  myCount,
  myScore,
  players,
  myConceded,
  selfId,
  playState,
}: {
  mode: 'coop' | 'compete'
  status: StatusBlob | null
  /** The terminal play_state — coop distinguishes a missed TARGET (`lost`)
   *  from the neutral end of a no-target hunt (`ended`) by it. */
  playState: string
  myCount: number
  myScore: number
  players: GamePlayer[]
  myConceded: boolean
  selfId: string
}): {
  verdict: string
  /** The one case where the pill wants a WIDGET rather than a string: the
   *  winner's identity dot, the same way peer feedback names people elsewhere.
   *  `verdict` carries the plain-text twin for anything that needs a string. */
  verdictNode?: ReactNode
  message: string
  tone: 'won' | 'lost' | 'neutral'
} {
  const statusOutcome = status?.outcome as string | undefined
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
    // Which of timeout-vs-manual ended it rides in `message` ("Time's up" /
    // "Game ended") — the pill spends its width on the tally.
    if (isTarget) {
      return { verdict: `Won: ${tally}`, message: 'Target reached!', tone: 'won' }
    }
    if (playState === 'lost') {
      return { verdict: `Lost: ${tally}`, message: reason, tone: 'lost' }
    }
    return { verdict: `Ended: ${tally}`, message: reason, tone: 'neutral' }
  }

  // Compete — most points wins (no dupes-cancel; see boggle.md §12).
  // A conceder forfeited the race: they see a plain loss even if their
  // banked score was the highest (mirrors the server's won:false).
  if (myConceded) {
    return {
      verdict: 'Lost: conceded',
      message: 'You conceded',
      tone: 'lost',
    }
  }
  // A target win is a RACE the server already decided: the crosser (named in the
  // status) wins outright, everyone else loses — no leaderboard comparison.
  if (isTarget) {
    const winnerId = status?.winner_user_id as string | undefined
    const winner = players.find((p) => p.user_id === winnerId)
    const winnerName = (status?.winner_username as string | undefined) ?? 'Someone'
    if (winnerId === selfId) {
      return {
        verdict: `Won: ${tally}`,
        message: 'You won!',
        tone: 'won',
      }
    }
    return {
      verdict: `${winnerName} won`,
      verdictNode: (
        <>
          <ActorDot actor={winner} fallback="Someone" show="both" /> won
        </>
      ),
      message: `${winnerName} won`,
      tone: 'lost',
    }
  }
  // The winning bar excludes conceded players — a drop-out can't be the
  // winner anyone sees, matching boggle._finish's max_score.
  const concededIds = new Set(players.filter((p) => p.conceded).map((p) => p.user_id))
  const board = ((status?.leaderboard as LeaderRow[] | undefined) ?? []).filter(
    (r) => !concededIds.has(r.user_id),
  )
  const max = board.reduce((m, r) => Math.max(m, r.found_words_score), 0)
  // Nobody scored. The server agrees — boggle._finish writes lost_compete for
  // exactly this case, rather than flagging everyone a co-winner at 0 (which
  // is what "your score is the best score" does when every score is 0). This
  // used to render a neutral "Ended" while the club-page label read
  // "Won (co-winners)" off the same row; both now say the same thing.
  if (max === 0) {
    return {
      verdict: 'Lost: no words found',
      message: 'No winner',
      tone: 'lost',
    }
  }
  if (myScore >= max) {
    return {
      verdict: `Won: ${tally}`,
      message: 'You won!',
      tone: 'won',
    }
  }
  const topRow = board.find((r) => r.found_words_score === max)
  const topPlayer = players.find((p) => p.user_id === topRow?.user_id)
  const topName = topPlayer?.username ?? 'Someone'
  return {
    verdict: `${topName} won`,
    verdictNode: (
      <>
        <ActorDot actor={topPlayer} fallback="Someone" show="both" /> won
      </>
    ),
    message: `${topName} won`,
    tone: 'lost',
  }
}
