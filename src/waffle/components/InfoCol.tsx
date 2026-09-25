// cs-unmet

import type { Member } from '@/common/members/member'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { WaffleSetup } from '../lib/setup'
import type { WafflePlayerState, EventRow } from '../hooks/useGame'
import { SolutionReveal } from './SolutionReveal'
import { StateLine } from './StateLine'
import { GameEventLog } from './GameEventLog'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import shared from '@/common/info-sheet/infoCol.module.css'

/**
 * waffle's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): swap-state
 * readout → progressive answer reveal → OpponentStrip → action row → help → setup
 * disclosure → swap log. Every command is a BOUND ACTION the PlayArea handed down
 * (`actEndGame`, `actConcede`, …), so this column places buttons and decides
 * nothing about them; the history-viewer selection (`onShowHistory`) is the one
 * callback. Prop names match the other games' columns for the same idea (see
 * docs/playarea.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea.md.
  isCompete,
  over,
  isPlayer,
  selfDone,
  myConceded,
  turnHolderId,
  selfSolved,
  swapsUsed,
  maxSwaps,
  remaining,
  parSwaps,
  players,
  selfId,
  playerStates,
  concededIds,
  actEndGame,
  actConcede,
  actRestart,
  actReveal,
  actNewGame,
  actBackToClub,
  setupRows,
  answerWords,
  swaps,
  historyId,
  onShowHistory,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  /** The terminal message when the game is over (drives the action row), else null. */
  over: TerminalMessage | null
  /** Am I a player in this game (gates the action row + help). */
  isPlayer: boolean
  /** Whose turn it is under turn-order, or null for a free-for-all game.
   *  Non-null ⇒ render the shared TurnStatusLine (a turn game). */
  turnHolderId: string | null
  /** I can't act any more, but the game continues for others (compete: solved / out
   *  of swaps / conceded) — drives the terminal LOOK. The broader analog of the other
   *  games' concede-only `isLocallyDone`: waffle is a per-player-board race, so you can
   *  also be locally done by solving your board or running out of swaps, not just by
   *  conceding — which is why it needs its own name. */
  selfDone: boolean
  /** I conceded (vs solved / out of swaps) — picks the `selfDone` status wording. */
  myConceded: boolean
  /** I solved my board — picks the `selfDone` status wording. */
  selfSolved: boolean

  // ── State readout (the swap count line) ──
  swapsUsed: number
  maxSwaps: number
  remaining: number
  parSwaps: number

  // ── Players (the OpponentStrip) ──
  players: Member[]
  selfId: string
  playerStates: WafflePlayerState[]
  concededIds: Set<string>

  // ── Action row (ICON-ONLY buttons — waffle's experiment; tooltips carry
  //    the labels. Playing: End/Concede + back-to-club. Terminal: Restart +
  //    Reveal + New game + back-to-club.) ──
  /** The whole table stops, with no result. Hidden in a race that doesn't offer
   *  it, so the pair can be placed unconditionally. */
  actEndGame: BoundAction
  /** Drop out of a race; the others keep going. Hidden outside one, and gray
   *  once you have solved — see `selfSolved` in useStandardGameActions. */
  actConcede: BoundAction
  /** Restart THIS board from scratch. */
  actRestart: BoundAction
  /** Show the answer — or put it away again, bringing back the board the
   *  players finished with. A local display toggle, no RPC (see PlayArea's
   *  useSolutionReveal); it carries its own two faces, so this column places one
   *  button either way. */
  actReveal: BoundAction
  /** Start a fresh follow-up game — same setup, new board + id. Disables itself
   *  while the create is in flight, so a slow network reads as "working". */
  actNewGame: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. ONE binding
   *  for both rows: it navigates directly at terminal and routes through the
   *  suspend-confirm flow mid-game. */
  actBackToClub: BoundAction

  // ── Setup disclosure + answer reveal ──
  setup: WaffleSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]
  /** The 6 answer words in `WORDS` order (3 across, 3 down): a solved word's letters,
   *  or null for one still hidden. Revealed progressively throughout the game. */
  answerWords: (string | null)[]

  // ── Turn-history log (GameEventLog — both modes) ──
  swaps: EventRow[]
  /** The swap currently open in the board viewer, or null. */
  historyId: number | null
  /** Straight through to the log: opening a `#N` hands up the row's id and the
   *  number the log printed beside it. */
  onShowHistory: (id: number, n: number) => void
}) {

  // The End / Concede button — error-toned (red), shared by the "playing" and the
  // "locally terminal" action rows (you can bow out either way). compete CONCEDES
  // ("I give up, you keep racing"); coop ENDS (a neutral mutual "we're done"). Two
  // semantically distinct actions (docs/ui.md → Button iconography, End vs
  // Concede), each placed as an `<ActionButton>` — and each hides itself in the
  // mode that isn't its own, so both are placed and the row asks nothing.
  //
  // Concede is disabled once you've SOLVED: _maybe_finish_compete excludes
  // conceded players from the winner query, so a solved-and-waiting player who
  // clicked Concede ("I'm done waiting") would silently forfeit a win they may
  // have already banked. A solved player waits it out via Back-to-club instead.
  // Icon-only (the waffle experiment): the styled tooltip carries the label.
  const exits = (
    <>
      <ActionButton action={actConcede} show="icon" />
      <ActionButton action={actEndGame} show="icon" />
    </>
  )

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* InfoCol order is FIXED (docs/playarea.md → Info-column readouts):
            state → opponent strip → action row → help → setup disclosure → log. */}

        {/* State — shown in both play and terminal. The SAME <StateLine> the
            mobile status bar renders above the board (they must never drift). */}
        <p className={shared.infoState}>
          <StateLine
            swapsUsed={swapsUsed}
            maxSwaps={maxSwaps}
            remaining={remaining}
            parSwaps={parSwaps}
          />
        </p>
        {/* Whose-turn line — only for a turn-order game (pointer non-null). A
            separate line below the state readout; never replaces it. */}
        {turnHolderId !== null && (
          <TurnStatusLine
            turnHolderId={turnHolderId}
            players={players}
            selfId={selfId}
            isTerminal={over !== null}
          />
        )}

        {/* The answer, revealed progressively: a word shows once you've turned it
            fully green; the rest read as em dashes. Part of the status readout (above
            the action buttons), shown throughout the game. Leak-safe — every revealed
            word is already on the caller's board (see `solvedWords`). */}
        <SolutionReveal words={answerWords} />

        {/* Opponent strip (compete) — each player's swaps used + a ✓/✗ done mark. */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Swaps"
            metricFor={(player) => {
              // A conceded player is 'out' mid-game — they dropped out, so their
              // swap count is moot (mirrors wordle's strip).
              if (concededIds.has(player.user_id)) return 'out'
              const ps = playerStates.find((p) => p.user_id === player.user_id)
              const used = ps?.swaps_used ?? 0
              const solved = ps?.solved ?? false
              const out = !solved && used >= maxSwaps
              return (
                <>
                  {used}
                  {solved ? ' ✓' : out ? ' ✗' : ''}
                </>
              )
            }}
          />
        )}

        {/* Action row — four states, all ICON-ONLY (the waffle experiment;
            tooltips carry the labels). TERMINAL: the bold outcome line +
            Restart / Reveal / New game / back-to-club (primary). LOCALLY
            TERMINAL (compete: solved / out of swaps, the rest race on): the
            terminal LOOK — a bold status + Concede. PLAYING: End/Concede +
            back-to-club (secondary, via the suspend-confirm flow). WATCHING
            (not in the game): a bold note, no button. */}
        {over ? (
          <InfoActionsRow message={{ text: over.infoColText, outcome: over.outcome }}>
            {/* Stay-here options left of the leave option (Club): restart this
                board, see the answer, or spin up the next game. */}
            <ActionButton action={actRestart} show="icon" />
            <ActionButton action={actReveal} show="icon" />
            <ActionButton action={actNewGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : selfDone ? (
          <InfoActionsRow
            message={{ text: myConceded ? 'You conceded' : selfSolved ? 'Solved — waiting' : 'Out of swaps', outcome: 'neutral' }}
          >
            {/* Reveal keeps its slot while the others race, but inert: the
                solution opens only when the game is over for EVERYONE
                (common.reveal_solution enforces the same rule server-side), so
                a player who dropped out can't spoil a live race. Present
                rather than absent so the row doesn't change shape when the
                last racer finishes — the button is simply enabled then. */}
            <ActionButton action={actReveal} show="icon" />
            {exits}
          </InfoActionsRow>
        ) : isPlayer ? (
          <InfoActionsRow>
            {exits}
            <ActionButton action={actBackToClub} show="icon" />
          </InfoActionsRow>
        ) : (
          <InfoActionsRow message={{ text: 'Watching — not in this game', outcome: 'neutral' }} />
        )}

        {/* Help — shown ONLY while you can actually act on it (the locally-terminal /
            watching states are carried loudly by the action row above). */}
        {isPlayer && !over && !selfDone && (
          <p className={shared.infoHelp}>Tap two tiles to swap them.</p>
        )}

        {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
        <SetupDisclosure rows={setupRows} />
      </div>

      {/* The swap log — BOTH modes since 2026-08-02 (compete used to write none).
          Compete carries the shared "whose swaps?" picker: an opponent's rows are
          RLS-hidden during play and open at terminal, which is what makes logging
          them safe — replaying someone's swaps from the shared scramble would
          otherwise rebuild their board. Rows are clickable to replay that swap. */}
      <GameEventLog
        swaps={swaps}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        isTerminal={over !== null}
        historyId={historyId}
        onShowHistory={onShowHistory}
      />
    </div>
  )
}
