import type { ReactNode } from 'react'
import { cls } from '../../../lib/util/cls'
import { BackToClubButton } from '../../buttons/BackToClubButton'
import type { TerminalCopy } from '../../../lib/game/terminalCopy'
import shared from '../PlayArea.module.css'

type Props = {
  /** The terminal copy — `tone` picks the outcome color, `message` is the line. */
  over: TerminalCopy
  onBackToClub: () => void
  /** Optional extra terminal action(s), rendered between the outcome line and
   *  the Back-to-Club button (i.e. to its left). Waffle's Restart is the first
   *  user; most games pass nothing. */
  children?: ReactNode
  /** Render the Back-to-Club as an icon-only square (waffle's icon-only
   *  action-row experiment) instead of the default compact "‹ Club". */
  iconOnly?: boolean
}

/**
 * The game-over action row in the info column: a short bold outcome line
 * (colored by `over.tone` via `outcome_<tone>`) + a compact "back to club"
 * button. Every PlayArea rendered this identical block in its `over ?` branch,
 * so this single-sources the `outcome_<tone>` + `message` + BackToClub contract.
 *
 * Only the TERMINAL branch is shared — the non-terminal branches genuinely
 * differ per game (plain action buttons vs a compete game's "you conceded"
 * sub-state), so each game keeps its own `over ? <TerminalActionRow/> : (…)`.
 */
export function TerminalActionRow({ over, onBackToClub, children, iconOnly }: Props) {
  return (
    <div className={cls(shared.infoActions, shared.terminalActions)}>
      <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>{over.message}</span>
      {children}
      <BackToClubButton onClick={onBackToClub} variant="primary" compact iconOnly={iconOnly} />
    </div>
  )
}
