// cs-met-codenamesduet

import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'

/** The per-status terminal message for codenamesduet. `playState` is the
 *  authoritative input — only terminal states appear here. Returns the shared
 *  `TerminalMessage` shape (the same psychicnum/connections use): `pillText` +
 *  `outcome` are the below-board verdict; `infoColText` + `outcome` the
 *  short, bold, color-coded line in the info-column action row (won = green,
 *  lost = red, manual end = neutral). Detail-on-page intentionally: the
 *  agents-found counter sits in the info-column state line, the board carries
 *  the revealed tiles.
 *
 *  The loss verdicts are terse ("Lost: assassin") rather than sentences: the pill
 *  is a fixed-height below-board slot, and on a phone a long verdict wraps and
 *  grows it. */
export function buildTerminalMessage(playState: string): TerminalMessage {
  if (playState === 'won') {
    return { pillText: 'You win!', infoColText: 'You won!', outcome: 'won' }
  }
  if (playState === 'lost_assassin') {
    return {
      pillText: 'Lost: assassin',
      infoColText: 'Assassin revealed',
      outcome: 'lost',
    }
  }
  if (playState === 'lost_clock') {
    return {
      pillText: 'Lost: out of turns',
      infoColText: 'Out of turns',
      outcome: 'lost',
    }
  }
  // Manual end (codenamesduet.end_game): the friends stopped the game on purpose
  // — the uniform neutral terminal shared with the other games, owned by the
  // shared gameEndedTerminalMessage(). codenamesduet is coop-only.
  if (playState === 'ended') return gameEndedTerminalMessage('coop')
  // lost_timeout (and any future terminal state that doesn't match above —
  // falls back to a generic timer-out message rather than crashing).
  return {
    pillText: 'Lost: out of time',
    infoColText: 'Out of time',
    outcome: 'lost',
  }
}
