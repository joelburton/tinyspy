import { cls } from '../lib/cls'
import { BackToClubButton } from './BackToClubButton'
import type { TerminalCopy } from '../lib/terminalCopy'
import shared from './PlayArea.module.css'

type Props = {
  /** The terminal copy — `tone` picks the outcome color, `message` is the line. */
  over: TerminalCopy
  onBackToClub: () => void
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
export function TerminalActionRow({ over, onBackToClub }: Props) {
  return (
    <div className={cls(shared.infoActions, shared.terminalActions)}>
      <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>{over.message}</span>
      <BackToClubButton onClick={onBackToClub} compact />
    </div>
  )
}
