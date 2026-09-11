// cs-audited-floating-panels

import type { ReactNode } from 'react'

/**
 * The words of a confirmation question, in the form `askConfirmation` takes
 * and `ConfirmationBlockingModal` draws: a title, a body, and what the buttons
 * say. The three canonical questions below are values of it; a game's own
 * question (scrabble's Pass) is another.
 */
export type ConfirmOptions = {
  title: string
  message: ReactNode
  confirmLabel: string
  // A SECOND way to say yes, drawn between Cancel and the confirm, for a
  // question whose two answers both DO something and differ in what they do:
  // conceding a race puts you out while the others play on, ending it stops the
  // game for everyone. Two buttons on a board can only name those; a question
  // can explain them, which is the whole reason to ask. Omit it for the
  // ordinary two-button box. There is no third — past two ways to say yes this
  // is a menu, not a question.
  alternativeLabel?: string
  // Omit for "Cancel". There is no "no cancel": a box with one way out is not a
  // question, and it has its own component (`AcknowledgeBlockingModal`).
  cancelLabel?: string
  // Which button is filled AND fires on Enter; see `ConfirmationBlockingModal`.
  primaryButton?: 'confirm' | 'cancel'
}

/** What a question was answered with — the act to do, or `null` for "no". */
export type ConfirmAnswer = 'confirm' | 'alternative' | null

/** The canonical end-game confirm — one question object, carried by the
 *  registry on the End action, so every placement of End asks the identical
 *  question. Ending is the one always-confirmed act: it's terminal for the
 *  whole group, even solo/coop (unlike suspend, which is confirmed only when
 *  there are peers to surprise). A RACE never asks this one — there the way
 *  out is Concede, whose question offers ending as its alternative. */
export const END_GAME_CONFIRM: ConfirmOptions = {
  title: 'End this game?',
  message: "This ends the game for everyone — you can't undo it.",
  confirmLabel: 'End game',
  cancelLabel: 'Keep playing',
}

/**
 * The canonical new-game confirm, asked only while a game is still in progress
 * (at terminal there's nothing to interrupt, so New game goes straight through).
 *
 * Starting a new game does NOT end this one: `create_game` clears the club's
 * current-view flag on the old row, which stays in `common.games` and can be
 * resumed from the club page — the same "shelved" language ClubPage already
 * uses. So the text REASSURES rather than warns: the point is that someone who
 * hits `+` by accident doesn't think they just lost their game. Deliberately
 * not phrased like END_GAME_CONFIRM's "you can't undo it", which would be
 * false here.
 */
export const NEW_GAME_CONFIRM: ConfirmOptions = {
  title: 'Start a new game?',
  message:
    'The game in progress will be shelved, not lost — you can resume it from the club page whenever you like.',
  confirmLabel: 'Start new game',
  cancelLabel: 'Keep playing',
}

/**
 * The canonical restart confirm, asked only while a game is still IN PROGRESS —
 * at terminal there's nothing left to lose, so Restart goes straight through.
 *
 * Mid-game it's the most destructive thing in the app after End: it wipes the
 * group's progress on a board they're still playing, for everyone at once, and
 * unlike End it leaves no trace that it happened. So the text WARNS, in
 * END_GAME_CONFIRM's register rather than NEW_GAME_CONFIRM's reassuring one.
 *
 * Deliberately generic — Restart is the same act in every game. What's being
 * wiped is visible on the board in front of you; what isn't obvious, and what
 * this says, is that it hits *everyone*.
 */
export const RESTART_CONFIRM: ConfirmOptions = {
  title: 'Restart this game?',
  message:
    "This clears everyone's progress and starts the same board again — you can't undo it.",
  confirmLabel: 'Restart',
  cancelLabel: 'Keep playing',
}
