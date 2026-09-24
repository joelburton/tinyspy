// cs-blessed-codenamesduet

import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'

/** The per-status terminal message for codenamesduet. `playState` is the
 *  authoritative input — only terminal states appear here. Returns the shared
 *  `TerminalMessage` shape: `pillText` +
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
  switch (playState) {
    case 'won':
      return { pillText: 'You win!', infoColText: 'You won!', outcome: 'won' }
    case 'lost_assassin':
      return { pillText: 'Lost: assassin', infoColText: 'Assassin revealed', outcome: 'lost' }
    case 'lost_clock':
      return { pillText: 'Lost: out of turns', infoColText: 'Out of turns', outcome: 'lost' }
    case 'lost_timeout':
      return { pillText: 'Lost: out of time', infoColText: 'Out of time', outcome: 'lost' }
    // Manual end (codenamesduet.end_game): the friends stopped the game on
    // purpose — the shared neutral ending.
    case 'ended':
      return gameEndedTerminalMessage('coop')
    // An ending nobody wrote a case for says so, neutrally and with its raw
    // name, rather than claiming a win or a loss it cannot know.
    default:
      return { pillText: `Game over: ${playState}`, infoColText: 'Game over', outcome: 'neutral' }
  }
}
