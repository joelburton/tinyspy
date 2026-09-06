// cs-unmet

import type { ReactNode } from 'react'
import { cls } from '../utils/cls'
import { BackToClubButton } from '../buttons/BackToClubButton'
import type { ButtonShow } from '../buttons/StandardButton'
import type { TerminalCopy } from './terminalCopy'
import shared from '../game-page/PlayArea.module.css'

type Props = {
  /** The terminal copy — `tone` picks the outcome color, `message` is the line. */
  over: TerminalCopy
  onBackToClub: () => void
  /** Optional extra terminal action(s), rendered between the outcome line and
   *  the Back-to-Club button (i.e. to its left). Waffle's Restart is the first
   *  user; most games pass nothing. */
  children?: ReactNode
  /** What the Back-to-Club button DRAWS — passed straight through as its
   *  `show`, and required here for the same reason it is required there: a row
   *  that doesn't say is a row you have to open a file to read. A terminal row
   *  runs up to four controls wide in a ~22rem column, so `"icon"` is the one
   *  that fits. The button is called "Back to club" either way. */
  backShow: ButtonShow
}

/**
 * The game-over action row in the info column: a short bold outcome line
 * (colored by `over.tone` via `outcome_<tone>`) + a "back to club" button. Every PlayArea rendered this identical block in its `over ?` branch,
 * so this single-sources the `outcome_<tone>` + `message` + BackToClub contract.
 *
 * Only the TERMINAL branch is shared — the non-terminal branches genuinely
 * differ per game (plain action buttons vs a compete game's "you conceded"
 * sub-state), so each game keeps its own `over ? <TerminalActionRow/> : (…)`.
 */
export function TerminalActionRow({ over, onBackToClub, children, backShow }: Props) {
  return (
    <div className={cls(shared.infoActions, shared.terminalActions)}>
      <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>{over.message}</span>
      {children}
      <BackToClubButton onClick={onBackToClub} weight="primary" show={backShow} />
    </div>
  )
}
