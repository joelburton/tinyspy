// cs-unmet

import type { ReactNode } from 'react'
import { cls } from '../utils/cls'
import type { TerminalCopy } from './terminalCopy'
import shared from '../game-page/PlayArea.module.css'

type Props = {
  /** The terminal copy — `tone` picks the outcome color, `message` is the line. */
  over: TerminalCopy
  /** The row's controls, left to right: what the game offers at the end, and
   *  "back to club" last (`ctx.menu.actBackToClub`, like any other action). */
  children?: ReactNode
}

/**
 * The game-over action row in the info column: a short bold outcome line
 * (colored by `over.tone` via `outcome_<tone>`) + whatever the game offers at
 * the end — reveal the answer, play the same board again, deal a new one, leave.
 * Every PlayArea rendered this identical block in its `over ?` branch, so this
 * single-sources the `outcome_<tone>` + `message` contract.
 *
 * Only the TERMINAL branch is shared — the non-terminal branches genuinely
 * differ per game (plain action buttons vs a compete game's "you conceded"
 * sub-state), so each game keeps its own `over ? <TerminalActionRow/> : (…)`.
 */
export function TerminalActionRow({ over, children }: Props) {
  return (
    <div className={cls(shared.infoActions, shared.terminalActions)}>
      <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>{over.message}</span>
      {children}
    </div>
  )
}
