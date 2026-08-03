import { cls } from '../../common/lib/util/cls'
import type { Member } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { timerLabel } from '../../common/lib/game/timerLabel'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { HintButton } from '../../common/components/buttons/HintButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import { SpoilerButton } from '../../common/components/buttons/SpoilerButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { StackdownSetup } from '../lib/setup'
import type { PlayerRow, SubmissionRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './InfoCol.module.css'

/**
 * stackdown's info column — near-zero state, just an arrangement of the shared
 * scaffold pieces in the fixed order (docs/playarea.md → Info-column readouts):
 * state readout → OpponentStrip → action row → help → setup disclosure → terminal
 * words reveal → GameTurnLog log. Every mutation is a named callback up
 * (`onHint`/`onSpoiler`/`onReveal`/`onEndGame`/`onConcede`/`onSelectTurn`); PlayArea owns the
 * RPCs and the coordination state. See docs/playarea-decomposition-plan.md.
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below),
  // so "what is this prop for?" is answerable by eye. Names are shared verbatim with
  // the other games' columns for the same idea — see docs/playarea-decomposition-plan.md.
  isCompete,
  isTerminal,
  over,
  isPlayer,
  isLocallyDone,
  foundCount,
  hintCount,
  spoilerCount,
  players,
  selfId,
  playerStates,
  concededIds,
  onHint,
  onSpoiler,
  onEndGame,
  onConcede,
  onRestart,
  onNewGame,
  startingNewGame,
  onBackToClub,
  setup,
  solution,
  onReveal,
  revealDisabled,
  submissions,
  viewingIndex,
  onSelectTurn,
}: {
  // ── Mode + phase (read by several regions below) ──
  /** compete shows the OpponentStrip + Concede; coop shows End. */
  isCompete: boolean
  isTerminal: boolean
  /** Terminal copy when the game is over (drives the action row + words reveal), else null. */
  over: TerminalCopy | null
  /** Am I a player in this game (gates the cheats + the "click tiles" help). */
  isPlayer: boolean
  /** I conceded but the others race on — a terminal LOOK without ending the game. */
  isLocallyDone: boolean

  // ── State readout (the count line at the top) ──
  /** Words cleared, out of six. */
  foundCount: number
  /** Cheat tallies shown beneath the count. */
  hintCount: number
  /** How many times a player took the "just tell me the next word" spoiler.
   *  The submission rows still carry `kind='reveal'` server-side (renaming the
   *  stored value would be a migration for a label); only the word the players
   *  read changed, so "reveal" can mean the whole solution at game-over. */
  spoilerCount: number

  // ── Players (the OpponentStrip + the log's identity discs) ──
  /** The roster (identity + per-player concede flags). */
  players: Member[]
  selfId: string
  /** Public per-player tallies (found_count / solved); `self` is derived from these. */
  playerStates: PlayerRow[]
  /** Who has conceded (drives the OpponentStrip "out" mid-game). */
  concededIds: Set<string>

  // ── Action row (cheats + End/Concede, back-to-club at terminal) ──
  onHint: () => void
  /** Mid-game cheat: hand over the next word (the amber bare-eye SpoilerButton).
   *  Named for what it does to a LIVE game — distinct from `onReveal` below,
   *  which opens the whole solution once the game is over. */
  onSpoiler: () => void
  onEndGame: () => void
  onConcede: () => void
  /** Restart THIS stack — same tiles, same solution — from scratch (the menu's
   *  replay-board, unconfirmed at terminal since there's no progress left to lose). */
  onRestart: () => void
  /** Start a fresh follow-up game — same setup + roster, a newly claimed board. */
  onNewGame: () => void
  /** New game is mid-flight — disables the button so a slow network reads as
   *  "working", not "nothing happened". Paired with the menu item's own
   *  `disabled`; see useSingleFlight in this game's PlayArea. */
  startingNewGame?: boolean
  onBackToClub: () => void

  // ── Setup disclosure + terminal words reveal ──
  setup: StackdownSetup
  /** The six solution words — non-null ONLY when they should be on screen: a
   *  clean win, or after someone asked. A plain loss keeps them hidden so
   *  Restart (same stack, same solution) stays a genuine second try. */
  solution: string[] | null
  /** Open the solution at game-over (the red boxed-eye RevealButton + its menu
   *  twin). Local display toggle — nothing is written. */
  onReveal: () => void
  /** The solution is already showing, so the reveal control self-disables. */
  revealDisabled: boolean

  // ── Turn-history log (GameTurnLog) ──
  /** The submission log the log renders + the viewer indexes (by position). */
  submissions: SubmissionRow[]
  /** The log row currently open in the board viewer, or null. */
  viewingIndex: number | null
  onSelectTurn: (index: number) => void
}) {
  const self = playerStates.find((p) => p.user_id === selfId)

  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* InfoCol order is FIXED (docs/playarea.md → Info-column readouts):
            state → opponent strip → action row → help → setup disclosure → log. */}

        {/* State — words cleared out of six, plus the cheat tallies (hints /
            spoilers used). Always shown (even at 0) so using one doesn't shift
            the rows below. */}
        <p className={shared.infoState}>
          <strong>{foundCount}</strong> / 6 words cleared
          <br />
          <strong>{hintCount}</strong> hint{hintCount === 1 ? '' : 's'} ·{' '}
          <strong>{spoilerCount}</strong> spoiler{spoilerCount === 1 ? '' : 's'} used
        </p>

        {/* Opponent strip (compete) — each player's found-word count, identity
            on a leading disc; a ✓ marks a player who's cleared the board. */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Found"
            metricFor={(player, isSelf) => {
              // Mid-game a conceder reads as "out" (dropped from the race). At
              // terminal we keep the found/✓ tally so the final board still
              // shows how far each player got before it ended.
              if (!isTerminal && concededIds.has(player.user_id)) return 'out'
              const ps = playerStates.find((p) => p.user_id === player.user_id)
              const found = isSelf ? self?.found_count ?? 0 : ps?.found_count ?? 0
              return (
                <>
                  {found}
                  {ps?.solved ? ' ✓' : ''}
                </>
              )
            }}
          />
        )}

        {/* Action row — Reveal hint / Reveal word cheats + End/Concede during
            play; at terminal the bold outcome line + a compact back-to-club
            button. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} iconOnly>
            {/* Stay-here options left of the leave option (Club): run this stack
                back, or claim the next one. */}
            {/* Reveal first: it's the one that acts on THIS finished game.
                Restart / New game are both "move on", and they leave. */}
            <RevealButton iconOnly onClick={onReveal} disabled={revealDisabled} />
            <RestartButton iconOnly onClick={onRestart} />
            <NewGameButton iconOnly onClick={onNewGame} disabled={startingNewGame} />
          </TerminalActionRow>
        ) : isLocallyDone ? (
          // I conceded; the others race on. Terminal LOOK (a status line + the
          // now-disabled Concede) so the drop-out reads loudly.
          <LocalTerminalRow label="You conceded">
            {/* Reveal keeps its slot while the others race, but inert: the
                solution opens only when the game is over for EVERYONE
                (common.reveal_solution enforces the same rule server-side), so
                a player who dropped out can't spoil a live race. Present
                rather than absent so the row doesn't change shape when the
                last racer finishes — the button is simply enabled then. */}
            <RevealButton iconOnly disabled tooltip="Can't reveal until all end" />
            <ConcedeGameButton iconOnly className={shared.helperButton} disabled />
          </LocalTerminalRow>
        ) : isPlayer ? (
          <div className={shared.infoActions}>
            {/* Cheats: both warning-toned (amber) — "help, not good-or-bad".
                Icon-only like the rest of the row; `tooltip` (the styled hover
                bubble) carries the full "what it does" copy, richer than the
                aria-label the glyph gets from `label`. */}
            <HintButton
              iconOnly
              onClick={onHint}
              className={shared.helperButton}
              tooltip="Hint for next word"
            />
            {/* The bare eye, not the boxed one: this hands over ONE word of a
                live game. The boxed-eye RevealButton is reserved for the whole
                solution at game-over (see the icon registry). */}
            <SpoilerButton
              iconOnly
              onClick={onSpoiler}
              className={shared.helperButton}
              tooltip="Cheat for next word"
            />
            {isCompete ? (
              <ConcedeGameButton iconOnly onClick={onConcede} className={shared.helperButton} />
            ) : (
              <EndGameButton iconOnly onClick={onEndGame} className={shared.helperButton} />
            )}
          </div>
        ) : null}

        {/* Help — only while the player can act on it (never silently swapped).
            Hidden once conceded: the "click tiles" prompt would contradict the
            now-disabled entry. */}
        {!over && isPlayer && !isLocallyDone && (
          <p className={shared.infoHelp}>
            Click exposed tiles — or type a letter — to spell a word.{' '}
            <kbd>Backspace</kbd> takes one back.
          </p>
        )}
        {/* Watching someone else's game (rare by design — "no spectators", see
            CLAUDE.md). Given the terminal LOOK rather than a muted help line:
            being unable to act is terminal for you, so it reads as a state, not
            as advice. Matches waffle. */}
        {!over && !isPlayer && <LocalTerminalRow label="Watching — not in this game" />}

        {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          <li>Tiles: 30</li>
          <li>Words to clear: 6</li>
          <li>Dictionary: {difficultyValue(setup.band)}</li>
          <li>Timer: {timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      {/* The six solution words — the one info-column region allowed to grow at
          game-over (docs/ui.md → Layout stability). Shown only once `solution`
          is non-null, which PlayArea gates on won-or-revealed. */}
      {over && solution && (
        <div className={cls(shared.terminalExtra, styles.reveal)}>
          <span className="muted">The words were</span>{' '}
          <strong>{solution.map((w) => w.toUpperCase()).join(' · ')}</strong>
        </div>
      )}

      <GameTurnLog
        submissions={submissions}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        isTerminal={isTerminal}
        viewingIndex={viewingIndex}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
