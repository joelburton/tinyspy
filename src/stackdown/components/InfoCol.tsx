import { cls } from '../../common/lib/util/cls'
import type { Member } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { timerLabel } from '../../common/lib/game/timerLabel'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { HintButton } from '../../common/components/buttons/HintButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import type { StackdownSetup } from '../lib/setup'
import type { PlayerRow, SubmissionRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './InfoCol.module.css'

/**
 * stackdown's info column — near-zero state, just an arrangement of the shared
 * scaffold pieces in the fixed order (docs/design-decisions.md → Info column):
 * state readout → OpponentStrip → action row → help → setup disclosure → terminal
 * words reveal → GameTurnLog log. Every mutation is a named callback up
 * (`onHint`/`onReveal`/`onEndGame`/`onConcede`/`onSelectTurn`); PlayArea owns the
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
  revealCount,
  players,
  selfId,
  playerStates,
  concededIds,
  onHint,
  onReveal,
  onEndGame,
  onConcede,
  onBackToClub,
  setup,
  solution,
  submissions,
  showWho,
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
  revealCount: number

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
  onReveal: () => void
  onEndGame: () => void
  onConcede: () => void
  onBackToClub: () => void

  // ── Setup disclosure + terminal words reveal ──
  setup: StackdownSetup
  /** The six solution words, revealed at game-over (terminal only). */
  solution: string[] | null

  // ── Turn-history log (GameTurnLog) ──
  /** The submission log the log renders + the viewer indexes (by position). */
  submissions: SubmissionRow[]
  showWho: boolean
  /** The log row currently open in the board viewer, or null. */
  viewingIndex: number | null
  onSelectTurn: (index: number) => void
}) {
  const self = playerStates.find((p) => p.user_id === selfId)

  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* InfoCol order is FIXED (docs/design-decisions.md → Info column):
            state → opponent strip → action row → help → setup disclosure → log. */}

        {/* State — words cleared out of six, plus the cheat tallies (hints /
            reveals used). Always shown (even at 0) so using one doesn't shift
            the rows below. */}
        <p className={shared.infoState}>
          <strong>{foundCount}</strong> / 6 words cleared
          <br />
          <strong>{hintCount}</strong> hint{hintCount === 1 ? '' : 's'} ·{' '}
          <strong>{revealCount}</strong> reveal{revealCount === 1 ? '' : 's'} used
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
          <TerminalActionRow over={over} onBackToClub={onBackToClub} />
        ) : isLocallyDone ? (
          // I conceded; the others race on. Terminal LOOK (a status line + the
          // now-disabled Concede) so the drop-out reads loudly.
          <LocalTerminalRow label="You conceded">
            <ConcedeGameButton className={shared.helperButton} disabled />
          </LocalTerminalRow>
        ) : isPlayer ? (
          <div className={shared.infoActions}>
            {/* Cheats: both warning-toned (amber) — "help, not good-or-bad".
                Default labels ("Hint" / "Reveal"); the tooltip carries the
                full "what it does" copy. */}
            <HintButton
              onClick={onHint}
              className={shared.helperButton}
              title="Cheat: show the next word's definition (not the word)"
            />
            <RevealButton
              onClick={onReveal}
              className={shared.helperButton}
              title="Cheat: peek at the next word (for verifying boards)"
            />
            {isCompete ? (
              <ConcedeGameButton onClick={onConcede} className={shared.helperButton} />
            ) : (
              <EndGameButton onClick={onEndGame} className={shared.helperButton} />
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
        {!over && !isPlayer && (
          <p className={shared.infoHelp}>Watching — you&rsquo;re not in this game.</p>
        )}

        {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          <li>30 tiles · 6 words to clear</li>
          <li>Common 5-letter words</li>
          <li>{timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      {/* Terminal-only reveal of the six solution words — the one info-column
          region allowed to grow at game-over (docs/ui.md → Layout stability). */}
      {over && solution && (
        <div className={cls(shared.terminalExtra, styles.reveal)}>
          <span className="muted">The words were</span>{' '}
          <strong>{solution.map((w) => w.toUpperCase()).join(' · ')}</strong>
        </div>
      )}

      <GameTurnLog
        submissions={submissions}
        players={players}
        showWho={showWho}
        viewingIndex={viewingIndex}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
