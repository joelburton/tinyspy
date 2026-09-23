// cs-unmet

import { currentProfile } from '../session/useProfile'

/** Every sound the app plays, by name, and its file under `public/audio/`. */
const SOUND_FILES = {
  // The turn became yours (`useTurnBell`).
  bell: '/audio/bell.mp3',
  // A win (`CelebrationBlockingModal`).
  tada: '/audio/tada.mp3',
} as const

export type SoundName = keyof typeof SOUND_FILES

/** Each sound's level. The bell comes often, so it sits under the jingle. */
const VOLUME: Record<SoundName, number> = { bell: 0.6, tada: 0.8 }

/** One element per sound, made on first use and reused, so a second ring does
 *  not fetch the file again. */
const elements = new Map<SoundName, HTMLAudioElement>()

function elementFor(name: SoundName): HTMLAudioElement | null {
  const made = elements.get(name)
  if (made) return made
  try {
    const audio = new Audio(SOUND_FILES[name])
    audio.preload = 'auto'
    audio.volume = VOLUME[name]
    elements.set(name, audio)
    return audio
  } catch {
    // No `Audio` in this environment. Nothing plays, and nothing else breaks.
    return null
  }
}

/**
 * Fetch a sound ahead of its first play, so the first ring lands with the
 * moment it marks rather than after a download. Harmless to call again.
 */
export function preloadSound(name: SoundName): void {
  elementFor(name)
}

/**
 * Play a sound — unless the player has turned sounds off in their profile
 * (`sounds_enabled`), which is checked here so no caller can forget it. With
 * no profile in the store (signed out) the default applies, which is on.
 *
 * Best-effort, and it never throws: a browser refuses audio until the page has
 * had a click, and jsdom implements no media at all, so every failure is
 * swallowed and whatever the sound accompanies still happens.
 *
 * Returns a `stop` that silences it and rewinds, for a sound whose occasion
 * can end first — the jingle when its dialog is dismissed.
 */
export function playSound(name: SoundName): () => void {
  if (currentProfile()?.sounds_enabled === false) return () => {}
  const audio = elementFor(name)
  if (!audio) return () => {}
  try {
    // Rewind first, so a sound still ringing from last time starts over.
    audio.currentTime = 0
    void audio.play()?.catch(() => {})
  } catch {
    return () => {}
  }
  return () => {
    try {
      audio.pause()
      audio.currentTime = 0
    } catch {
      // Nothing to stop.
    }
  }
}
