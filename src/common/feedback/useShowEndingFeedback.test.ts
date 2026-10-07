// cs-unmet

import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { EndingMessage } from '../ending/endingMessage'
import { createFeedbackSlot } from './feedbackSlotStore'
import { useShowEndingFeedback } from './useShowEndingFeedback'

type Props = {
  gameEndingMessage: EndingMessage | null
  playerEndingMessage: EndingMessage | null
}

const NO_ENDING: Props = { gameEndingMessage: null, playerEndingMessage: null }

/** Mount the hook over a real local slot, with spies on what it shows and
 *  takes back. */
function setup(initial: Props) {
  const slot = createFeedbackSlot('local')
  const shown = vi.spyOn(slot, 'show')
  const retracted = vi.spyOn(slot, 'retract')
  const { rerender, unmount } = renderHook(
    (p: Props) => useShowEndingFeedback(slot, p),
    { initialProps: initial },
  )
  return { slot, shown, retracted, rerender, unmount }
}

const WON: EndingMessage = { pillText: 'Won: all found', infoColText: 'You won!', outcome: 'won' }
const CONCEDED: EndingMessage = {
  pillText: 'Conceded — race continues',
  infoColText: 'You conceded',
  outcome: 'neutral',
}

describe('useShowEndingFeedback — the game ending', () => {
  it('shows nothing while the game is played', () => {
    const { shown } = setup(NO_ENDING)
    expect(shown).not.toHaveBeenCalled()
  })

  it('shows the message as a verdict once the game has ended', () => {
    const { shown } = setup({ ...NO_ENDING, gameEndingMessage: WON })
    expect(shown).toHaveBeenCalledTimes(1)
    expect(shown.mock.calls[0][0].kind).toBe('endingVerdict')
  })

  it('does not show it again while the message keeps its identity', () => {
    const { rerender, shown, retracted } = setup({ ...NO_ENDING, gameEndingMessage: WON })
    rerender({ ...NO_ENDING, gameEndingMessage: WON })
    expect(shown).toHaveBeenCalledTimes(1)
    expect(retracted).not.toHaveBeenCalled()
  })

  it('retracts it when the ending goes, as after a Restart', () => {
    const { rerender, retracted } = setup({ ...NO_ENDING, gameEndingMessage: WON })
    rerender(NO_ENDING)
    expect(retracted).toHaveBeenCalledTimes(1)
  })

  it('retracts it on unmount', () => {
    const { unmount, retracted } = setup({ ...NO_ENDING, gameEndingMessage: WON })
    unmount()
    expect(retracted).toHaveBeenCalledTimes(1)
  })
})

describe('useShowEndingFeedback — the player ending', () => {
  it('shows the pill text as a standing state once I have ended', () => {
    const { shown } = setup({ ...NO_ENDING, playerEndingMessage: CONCEDED })
    expect(shown).toHaveBeenCalledTimes(1)
    const message = shown.mock.calls[0][0]
    expect(message.kind).toBe('standingState')
    expect(message.text).toBe('Conceded — race continues')
  })

  it('retracts it when the game ends and the verdict takes over', () => {
    const { rerender, shown, retracted } = setup({ ...NO_ENDING, playerEndingMessage: CONCEDED })
    rerender({ gameEndingMessage: WON, playerEndingMessage: null })
    expect(retracted).toHaveBeenCalledTimes(1)
    expect(shown.mock.calls.at(-1)?.[0].kind).toBe('endingVerdict')
  })
})
