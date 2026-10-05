// cs-blessed-codenamesduet

import { DotActor } from '@/common/members/ActorMention'
import { cls } from '@/common/utils/cls'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { InfoDisclosure } from '@/common/info-sheet/InfoDisclosure'
import type { GActions, GGameData, GHistoryView } from '../types'
import { GameEventLog } from './GameEventLog'
import { KeyCard } from './KeyCard'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './InfoCol.module.css'

/**
 * codenamesduet's info column — stateless, an arrangement of the shared
 * scaffold pieces in the fixed order (docs/playarea.md → Info-column
 * readouts): the state line → the finished-player banners → the action row →
 * help → the key-card and setup disclosures → the event log. There is no
 * opponent strip: the partner's status rides the header pill. Every command
 * arrives as an action this column places.
 */
export function InfoCol({
  gd,
  endingMessage,
  actions,
  historyView,
}: {
  gd: GGameData
  // The ending's verdict once the game is over — the action row's line — else null.
  endingMessage: TerminalMessage | null
  actions: GActions
  // The event log's `#N` opens a turn in it, and wears the ring while open.
  historyView: GHistoryView
}) {
  // Duet's finished-player rule (enforced in `_end_turn`): once a player's
  // agents are all contacted they give no more clues, and their partner takes
  // every remaining turn. Both players are told, so the lopsided turn flow does
  // not read as a bug. Only in normal play — nobody clues in sudden death, and
  // nothing is owed once the game is over.
  const isBannerShown = !gd.ended && !gd.team.suddenDeath
  const isMineFinished = isBannerShown && gd.me.allAgentsFound
  const isPartnerFinished = isBannerShown && gd.partner.allAgentsFound

  return (
    <div className={shared.infoCol}>
      {/* The readouts, in the shared order (docs/playarea.md → Info-column
          readouts); the finished-player banners sit under the state line they
          explain. */}
      <div className={shared.noShrinkRow}>
        {/* The same `<StateLine>` the phone's status bar renders above the board. */}
        <p className={shared.infoState}>
          <StateLine data={gd.stateLineData} />
        </p>

        {/* Duet's finished-player rule, told to BOTH players so the lopsided turn
            flow does not read as a bug. */}
        {isMineFinished && (
          <div className={cls(styles.finishedNote, styles.viewerFinished)}>
            <DotActor actor={gd.partner} fallback="Your partner" /> gives every remaining
            clue — your agents are all found.
          </div>
        )}
        {isPartnerFinished && (
          <div className={cls(styles.finishedNote, styles.peerFinished)}>
            <DotActor actor={gd.partner} fallback="Your partner" /> has no agents left — you
            give every remaining clue.
          </div>
        )}

        {/* The action row: every action, placed once, in the menu's order
            (docs/playarea.md); which buttons show is each action's own answer.
            The only thing that varies here is the line — the verdict once the
            game is over. No divider, since nothing sits left of it: this game's
            hint, the AI, is on the clue form. */}
        <InfoActionsRow message={endingMessage ? { text: endingMessage.infoColText, outcome: endingMessage.outcome } : undefined}>
          <ActionButton action={actions.actReveal} show="icon" />
          <ActionButton action={actions.actRestart} show="icon" />
          <ActionButton action={actions.actNewGame} show="icon" />
          <ActionButton action={actions.actConcede} show="icon" />
          <ActionButton action={actions.actStopGame} show="icon" />
          <ActionButton action={actions.actBackToClub} show="icon" weight={gd.ended ? 'primary' : 'secondary'} />
        </InfoActionsRow>

        {/* Help — one standing line during play; the per-phase guidance is below
            the board and in the header pill. In sudden death the rules change,
            and the red tag is what says so on a line that is otherwise skimmed
            past as unchanged. */}
        {!gd.ended && (
          <p className={shared.infoHelp}>
            {gd.team.suddenDeath ? (
              <>
                <strong className={styles.suddenDeathTag}>SUDDEN DEATH:</strong> no clues
                left — every reveal must be an agent. One non-green guess (a bystander or
                the assassin) ends the game.
              </>
            ) : (
              'Give clues for your agents; guess the clues your partner gives you.'
            )}
          </p>
        )}

        {/* The two disclosures, last before the event log: closed by default, a
            line each; opening one grows the column, the allowed exception since
            it closes again. */}
        <InfoDisclosure title="Key card">
          <KeyCard keys={gd.puzzle.tiles.map((t) => t.key[gd.me.id]!)} />
        </InfoDisclosure>
        <SetupDisclosure rows={gd.setupRows} />
      </div>

      <GameEventLog gd={gd} historyView={historyView} />
    </div>
  )
}
