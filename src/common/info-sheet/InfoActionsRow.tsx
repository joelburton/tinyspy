// cs-unmet

import type { ReactNode } from 'react'
import { cls } from '../utils/cls'
import type { Outcome } from '../outcomes/outcomes'
import shared from '@/common/game-page/playArea.module.css'
import styles from './InfoActionsRow.module.css'

/**
 * The line an `<InfoActionsRow>` draws to the left of its buttons.
 *
 * `outcome` picks the ink, from the one vocabulary (docs/outcomes.md) — so a
 * finished game's "You won!" and a live game's "Two left" are the same kind of
 * statement said in different colors, rather than two mechanisms.
 *
 * `error` is the one member left out: it is a fault's word, and
 * docs/outcomes.md is explicit that it is never an outcome. A row with
 * something broken to report has the fault modal for it.
 */
export type InfoActionsMessage = {
  text: ReactNode
  outcome: Exclude<Outcome, 'error'>
}

type Props = {
  // The line left of the buttons. Omitted while there is nothing to say, which
  // is most of play; the row is then the buttons alone, in the same place.
  message?: InfoActionsMessage
  // The row's controls, left to right: what the game offers right now, and
  // "back to club" last (`ctx.menu.actBackToClub`, like any other action).
  children?: ReactNode
}

/**
 * The info column's action row: whatever the game offers right now, with an
 * optional line to their left.
 *
 * Every state of the action slot is this one row — playing (the buttons
 * alone), locally terminal ("You conceded" while the others race on), and over
 * ("You won!" beside reveal / restart / new game / leave). They differ only in
 * whether there is a line and what it says, which is why they are not three
 * components: a game writes one element and varies the `message`.
 *
 * **The message is passed, never derived.** What a finished game says is its
 * own `buildOver()`'s to know — `terminal/terminalMessage.ts` puts the boundary
 * exactly there: the one outcome common code can write is "the friends agreed
 * to stop", *"because nothing about that outcome is game-specific"*. "Out of
 * guesses" and "Solved — waiting" need the game's own rules, so they arrive as
 * words. A terminal caller has a `TerminalMessage` and hands over two of its
 * fields:
 *
 *     <InfoActionsRow message={{ text: over.infoColText, outcome: over.outcome }}>
 *
 * It takes a message of its own rather than that whole object so a caller with
 * no verdict — a live game that wants to say something beside its buttons — has
 * nothing to invent.
 */
export function InfoActionsRow({ message, children }: Props) {
  return (
    // The row's own classes are the play-surface scaffold's, because a game can
    // compose them directly; `.terminalActions` stops the row wrapping, which
    // is only wanted when there is a line for the buttons to stay beside.
    <div className={cls(shared.infoActions, message && shared.terminalActions)}>
      {message && (
        <span className={cls(styles.outcome, styles[`outcome_${message.outcome}`])}>
          {message.text}
        </span>
      )}
      {children}
    </div>
  )
}
