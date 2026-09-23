// cs-unmet

/**
 * The one player every sound goes through: it honors the profile's
 * `sounds_enabled`, and it never throws. jsdom implements no media, so the
 * element's `play` / `pause` are spied on the prototype.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setProfile } from '../session/useProfile'
import { playSound } from './playSound'

const PROFILE = { username: 'ada', color: 'red', can_edit_words: false, sounds_enabled: true }

let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  setProfile(PROFILE)
})

afterEach(() => {
  vi.restoreAllMocks()
  setProfile(null)
})

describe('playSound', () => {
  it('plays when sounds are on', () => {
    playSound('bell')
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('plays nothing when the player has turned sounds off', () => {
    setProfile({ ...PROFILE, sounds_enabled: false })
    playSound('bell')
    playSound('tada')
    expect(play).not.toHaveBeenCalled()
  })

  it('plays with no profile in the store — the default is on', () => {
    setProfile(null)
    playSound('bell')
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('swallows a refused play and a throwing one', () => {
    play.mockRejectedValueOnce(new Error('NotAllowedError'))
    expect(() => playSound('bell')).not.toThrow()
    play.mockImplementationOnce(() => {
      throw new Error('not implemented')
    })
    expect(() => playSound('bell')).not.toThrow()
  })

  it('hands back a stop that silences the sound', () => {
    const stop = playSound('tada')
    stop()
    expect(pause).toHaveBeenCalledTimes(1)
  })
})
