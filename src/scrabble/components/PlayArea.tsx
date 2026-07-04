import { useCallback, useEffect } from 'react'
import type { GenericFeedbackMsg, GamePageCtx, Member } from '../../common/lib/games'
import { cls } from '../../common/lib/util/cls'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { colorVarFor } from '../../common/lib/color/memberColor'
import { DIFFICULTY_LABELS } from '../../common/lib/game/difficulty'
import { db } from '../db'
import type { ScrabbleSetup } from '../lib/setup'
import { useGame, type PlayRow } from '../hooks/useGame'
import { useSharedMove, type SharedMovePayload } from '../hooks/useSharedMove'
import { printScrabblePdf } from '../pdf/printScrabblePdf'
import { BoardCol, type LocalFeedbackMsg, type ViewTarget } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * scrabble's play surface (coop + compete). PlayArea is the **coordinator**: it holds
 * the game data (`useGame`), the board-viewer coordination (`useHistoryViewer`, whose
 * `ViewTarget` here carries BOTH a past turn AND a coop teammate's shared move), the
 * coop "show a move" Broadcast transport (`useSharedMove`), the below-board feedback
 * channel (`useLocalFeedback` — lifted here because InfoCol's End/Concede write to it
 * too), and the terminal copy; it wires two columns:
 *
 *   - **`<BoardCol>`** — the 15×15 board + the rack + the whole turn machine
 *     (staging via drag/keyboard, the blank picker, the optimistic hold, and the
 *     play_word/exchange/pass RPCs, which are inseparable from that state). Takes the
 *     game data + gameId + the feedback channel + the history-view inputs down.
 *   - **`<InfoCol>`** — the turn/score readout, OpponentStrip, action row, help,
 *     setup disclosure, and the Moves log. Named callbacks up.
 *
 * "Play word" evaluates the staged tiles with `lib/play.ts` (in BoardCol) and sends
 * words + score to `scrabble.play_word`, which trusts them and checks only the
 * dictionary. See docs/playarea-decomposition-plan.md.
 */
export function PlayArea({
  session,
  gameId,
  players: members,
  playState,
  isTerminal,
  status,
  setup,
  goToClub,
  menu,
  brand,
  title,
}: GamePageCtx) {
  const { game, players: playerStates, plays, loading } = useGame(gameId)

  // The player's own-move result — a sticky pill in the commit slot (the local
  // feedback area; docs/design-decisions.md → Feedback). Lifted to the coordinator
  // because BOTH columns write it: BoardCol's turn machine (played/rejected/…) AND
  // InfoCol's End/Concede failures. The thin builder keeps the terse `{ tone, text }`
  // call sites (own-move results are outline + sticky — the next move dismisses them).
  const { localFeedback, showLocalFeedback: showMsg, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })
  const showLocalFeedback = useCallback(
    (m: LocalFeedbackMsg) => showMsg({ ...m, variant: 'outline', dismiss: { kind: 'sticky' } }),
    [showMsg],
  )

  // Board-viewer coordination (shared hook): which read-only overlay is open — a
  // past turn OR a teammate's shared move (the `ViewTarget` union). Cross-column:
  // BoardCol renders it, InfoCol's Moves log selects a turn, a broadcast opens a
  // shared move. A new committed move (the version effect in BoardCol) exits either.
  const { viewingId: viewTarget, viewingIdRef: viewTargetRef, viewing, select, exitViewing } =
    useHistoryViewer<ViewTarget>()
  // Only a TURN is highlighted in the Moves log (`#N`) — a shared move has no row.
  const viewingSeq = viewTarget?.kind === 'turn' ? viewTarget.seq : null

  // Show-a-move transport (coop only): a teammate's broadcast opens a read-only
  // preview of their staged tiles. Ignore a stale one (their board version no
  // longer matches ours — a real move landed in between), so we never overlay a
  // move that no longer fits. `select` opens it on the same viewer as history.
  const { shareMove } = useSharedMove({
    gameId,
    mode: game?.mode,
    onReceive: useCallback(
      (p: SharedMovePayload) => {
        if (!game || p.baseVersion !== game.version) return
        select({ kind: 'shared', placements: p.placements, sharerId: p.sharerId, words: p.words, score: p.score })
      },
      [game, select],
    ),
  })

  // ─── Derived (null-safe until the loading guard) ──────────────
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = game?.mode === 'compete'
  // Concede lives on the common roster (ctx.players → `members`).
  const myConceded = members.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(members.filter((m) => m.conceded).map((m) => m.user_id))
  const myTurn = !isCompete || game?.currentUserId === session.user.id
  const nameOf = useCallback(
    (userId: string | null) => members.find((m: Member) => m.user_id === userId)?.username ?? 'someone',
    [members],
  )
  // Identity-disc color for the share banner's ● (the shared member-color scheme).
  const memberColorOf = useCallback(
    (userId: string) => colorVarFor(members.find((m: Member) => m.user_id === userId)?.color),
    [members],
  )
  // Show-a-move is a coop, ≥2-player affordance — there's a teammate to show.
  const canShare = game?.mode === 'coop' && members.length >= 2

  // SPIKE (branch scrabble-jspdf): a "Print board (PDF)" item in the GamePage menu.
  // Builds the print model from the live state (RLS already scoped it to what I may
  // see — my own rack, my visible moves) and hands it to the jsPDF renderer. Prints
  // a snapshot at click time, so it works mid-game or at the end. Re-registers when
  // the inputs change so the closure stays fresh; cleared on unmount.
  useEffect(() => {
    if (!game) return
    const rack = isCompete ? (self?.rack ?? []) : (game.sharedRack ?? [])
    const s = setup as unknown as ScrabbleSetup
    const band = (n: number) => `${DIFFICULTY_LABELS[n - 1] ?? '?'} (band ${n})`
    const model = {
      // "Brand: game title" (brand from the manifest via ctx — never the "scrabble"
      // code-name; title = common.games.title, this game's own name) + today's date.
      brand,
      gameTitle: title,
      date: new Date().toLocaleDateString(),
      summary: isCompete
        ? `${game.bagCount} tiles in the bag`
        : `Team score: ${game.teamScore ?? 0} · ${game.bagCount} tiles in the bag`,
      board: game.board,
      moves: plays.map((p) => ({ seq: p.seq, who: nameOf(p.user_id), text: moveText(p) })),
      rack,
      rackLabel: !self ? '' : isCompete ? 'Your rack' : 'Team rack',
      // Relevant setup only — the dictionary bands (the timer isn't relevant on a print).
      setup: [
        { label: '2-letter words', value: band(s.dict_2) },
        { label: 'Longer words (3+)', value: band(s.dict_3plus) },
      ],
    }
    menu.setGameItems([
      { id: 'print', label: 'Print board (PDF)', onClick: () => printScrabblePdf(model) },
    ])
    return () => menu.setGameItems([])
  }, [menu, game, plays, self, isCompete, nameOf, setup, brand, title])

  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback({ tone: 'error', text: `End game failed: ${error.message}` })
  }, [gameId, isTerminal, showLocalFeedback])

  // Concede (compete) — drop out of the race. Turn-based, so the server hands off the
  // turn / ends the game (scrabble.concede); the conceder forfeits any win. Distinct
  // from End, which is coop's neutral mutual stop.
  const handleConcede = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback({ tone: 'error', text: `Concede failed: ${error.message}` })
  }, [gameId, isTerminal, showLocalFeedback])

  if (loading) return <p className={styles.loading}>Loading game…</p>
  if (!game) return <p className={styles.loading}>Game not found.</p>

  const scrabbleSetup = setup as unknown as ScrabbleSetup
  const over = isTerminal ? buildOver({ game, playState, status, selfId: session.user.id, nameOf }) : null
  // The player whose turn it is (compete) — for the "Turn: ● name" state line.
  const currentMember = members.find((m: Member) => m.user_id === game.currentUserId)

  // The commit-slot pill: the terminal verdict (permanent fill) takes precedence,
  // else the sticky own-move result (transient outline), else nothing (the commit
  // buttons show). Passed down to BoardCol, which renders it in the Controls.
  const localPill: GenericFeedbackMsg | null = over
    ? {
        tone: over.tone === 'won' ? 'success' : over.tone === 'lost' ? 'error' : 'neutral',
        text: over.message,
        variant: 'fill',
        dismiss: { kind: 'sticky' },
      }
    : localFeedback

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <BoardCol
        game={game}
        gameId={gameId}
        self={self}
        myTurn={myTurn}
        isTerminal={isTerminal}
        myConceded={myConceded}
        showLocalFeedback={showLocalFeedback}
        clearLocalFeedback={clearLocalFeedback}
        localPill={localPill}
        plays={plays}
        viewTarget={viewTarget}
        viewing={viewing}
        viewTargetRef={viewTargetRef}
        onExitViewing={exitViewing}
        nameOf={nameOf}
        memberColorOf={memberColorOf}
        canShare={canShare}
        shareMove={shareMove}
        selfId={session.user.id}
      />

      <InfoCol
        isCompete={isCompete}
        myTurn={myTurn}
        over={over}
        myConceded={myConceded}
        isTerminal={isTerminal}
        currentMember={currentMember}
        teamScore={game.teamScore}
        bagCount={game.bagCount}
        members={members}
        selfId={session.user.id}
        playerStates={playerStates}
        concededIds={concededIds}
        onEndGame={() => void handleEndGame()}
        onConcede={() => void handleConcede()}
        onBackToClub={goToClub}
        setup={scrabbleSetup}
        plays={plays}
        viewingSeq={viewingSeq}
        onSelectTurn={(seq: number) => select({ kind: 'turn', seq })}
      />

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}

/** SPIKE: format one play for the print moves table (mirrors BoardCol's turnSummary). */
function moveText(p: PlayRow): string {
  if (p.kind === 'word') {
    const words = (p.words ?? []).map((w) => w.toUpperCase()).join(', ')
    return `+${p.score ?? 0} ${words}`
  }
  if (p.kind === 'exchange') return `exchanged ${p.tile_count} tiles`
  if (p.kind === 'pass') return 'passed'
  return `ended — ${-(p.score ?? 0)} tiles unplayed` // forfeit
}

/**
 * Terminal copy, mode- and self-aware. Returns `{ outcome, verdict, message,
 * tone }`: `outcome` + `verdict` drive the GameOverModal; `message` (terse) +
 * `tone` drive BOTH the info-column outcome line AND the permanent below-board
 * pill (so the narrow commit slot stays one line).
 */
function buildOver({
  game,
  playState,
  status,
  selfId,
  nameOf,
}: {
  game: { mode: 'coop' | 'compete'; teamScore: number | null }
  playState: string
  status: Record<string, unknown> | null
  selfId: string
  nameOf: (id: string | null) => string
}): { outcome: 'won' | 'lost'; verdict: string; message: string; tone: 'won' | 'lost' | 'neutral' } {
  const outcome = (status?.outcome as string | undefined) ?? ''
  if (game.mode === 'coop') {
    const score = game.teamScore ?? 0
    if (outcome === 'manual') return { outcome: 'won', verdict: `Game ended — ${score} points.`, message: `${score} pts`, tone: 'neutral' }
    if (outcome === 'timeout') return { outcome: 'won', verdict: `Time's up — ${score} points.`, message: `${score} pts`, tone: 'neutral' }
    return { outcome: 'won', verdict: `Board cleared — ${score} points! 🎉`, message: `${score} pts`, tone: 'won' }
  }
  if (playState === 'ended') return { outcome: 'won', verdict: 'Game ended — no winner.', message: 'Ended', tone: 'neutral' }
  // Everyone conceded (play_state 'lost', outcome 'conceded'): a collective
  // loss with no eligible winner. Must precede the winner logic below, which
  // would otherwise fall through to the phantom co-winners tie on null winner.
  if (outcome === 'conceded') return { outcome: 'lost', verdict: 'Everyone conceded — no winner.', message: 'All conceded', tone: 'lost' }
  const winner = status?.winner as string | null | undefined
  if (winner === selfId) return { outcome: 'won', verdict: 'You won the game! 🎉', message: 'You won!', tone: 'won' }
  if (winner) return { outcome: 'lost', verdict: `${nameOf(winner)} won.`, message: `${nameOf(winner)} won`, tone: 'lost' }
  return { outcome: 'won', verdict: "It's a tie — co-winners!", message: 'Tie', tone: 'neutral' }
}
