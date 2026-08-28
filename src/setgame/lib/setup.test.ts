// cs-unmet

/**
 * setgame's Start gate — two closed choices, and which one is unset.
 *
 * Both of these are radio groups with every option drawn, so a real player
 * cannot reach either message; they exist for a setup blob that arrived from
 * somewhere else — an old saved default whose vocabulary has since changed.
 * That is exactly why they need the field: "Pick a deck." and "Pick a color
 * set." are indistinguishable on a shared bottom line, and there is no other
 * clue on screen about which group is empty.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETGAME_SETUP_COOP, setgameSetupError } from './setup'

const setup = (over: Partial<typeof DEFAULT_SETGAME_SETUP_COOP> = {}) => ({
  ...DEFAULT_SETGAME_SETUP_COOP,
  ...over,
})

describe('setgameSetupError', () => {
  it('accepts the defaults', () => {
    expect(setgameSetupError(DEFAULT_SETGAME_SETUP_COOP)).toEqual({})
  })

  it('accepts either deck with either palette', () => {
    for (const deck of ['full', 'junior'] as const) {
      for (const palette of ['traditional', 'colorblind'] as const) {
        expect(setgameSetupError(setup({ deck, palette })), `${deck}/${palette}`).toEqual({})
      }
    }
  })

  it('refuses an unknown deck, under Deck', () => {
    expect(setgameSetupError(setup({ deck: 'tarot' as never }))).toEqual({
      deck: 'Pick a deck.',
    })
  })

  it('refuses an unknown palette, under Colors', () => {
    expect(setgameSetupError(setup({ palette: 'neon' as never }))).toEqual({
      palette: 'Pick a color set.',
    })
  })

  it('names the deck first when both are unset, and only the deck', () => {
    // One at a time is fine here — fixing the deck resubmits and the palette
    // then names itself. What would not be fine is one message for both, since
    // neither group would be rung.
    expect(setgameSetupError(setup({ deck: 'x' as never, palette: 'y' as never }))).toEqual({
      deck: 'Pick a deck.',
    })
  })
})
