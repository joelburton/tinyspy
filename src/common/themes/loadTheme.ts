// cs-blessed-deep

// ⚠️ MIDNIGHT IS A SPIKE, behind a flag, and is not finished design. Reach it
// with `?theme=midnight`; the choice sticks in localStorage so it survives the
// in-app navigation that follows, and `?theme=daylight` clears it. There is no
// UI for this on purpose — a theme picker is a product decision nobody has
// made, and the flag is here to answer an engineering question: does the file
// split hold up when something other than daylight asks it to?

/** The themes that exist. `daylight` is what ships. */
export type ThemeName = 'daylight' | 'midnight'

const STORAGE_KEY = 'puzpuzpuz:theme'

/**
 * The stored choice, or null when there isn't one — including when there is no
 * storage to ask.
 */
function storedTheme(): ThemeName | null {
  // A theme is not worth failing to start over. `localStorage` throws where a
  // browser blocks site data, and this runs before a single stylesheet is
  // requested, so an unguarded read takes `loadTheme()` down with it and the app
  // paints main.tsx's "could not start" instead of a page. Falling back to
  // daylight costs a midnight user their stickiness in that browser and nothing
  // else. It is the same rule the rest of the app already follows — see
  // `useStickyChoice`: storage failures are non-fatal.
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'midnight' ? 'midnight' : null
  } catch {
    return null
  }
}

/** Remember the choice, or forget it when passed null. */
function rememberTheme(theme: ThemeName | null): void {
  try {
    if (theme) window.localStorage.setItem(STORAGE_KEY, theme)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do about it: the `?theme=` in the URL still applies to THIS
    // load, it just won't survive the next navigation.
  }
}

/**
 * The URL wins over the stored choice, so a link can always override a sticky
 * one — and an explicit `?theme=daylight` clears the stored value rather than
 * merely losing to it, which is the only way back out of the spike without
 * opening devtools.
 */
function chosenTheme(): ThemeName {
  const fromUrl = new URLSearchParams(window.location.search).get('theme')
  if (fromUrl === 'midnight') {
    rememberTheme('midnight')
    return 'midnight'
  }
  if (fromUrl === 'daylight') {
    rememberTheme(null)
    return 'daylight'
  }
  return storedTheme() ?? 'daylight'
}

/**
 * Pick a theme and load ITS chain — the whole chain, and only that one.
 *
 * The chain is loaded with dynamic `import()` rather than a static one, which
 * is what lets the choice be a choice. The cost is that the theme's CSS arrives
 * a tick after the module graph rather than with it, so the caller awaits this
 * before rendering — otherwise the first paint would be an unstyled flash.
 */

export async function loadTheme(): Promise<ThemeName> {
  const theme = chosenTheme()
  if (theme === 'midnight') {
    await Promise.all([import('./dark-mode.css'), import('./midnight.css')])
  } else {
    await Promise.all([import('./light-mode.css'), import('./daylight.css')])
  }
  // Published for anything that wants to know which theme it is in.
  document.documentElement.dataset.theme = theme
  return theme
}
