/**
 * Pick a theme and load ITS chain — the whole chain, and only that one.
 *
 * A theme declares what it is built from and something imports it. The base is
 * never an unconditional default, and that rule is the reason this file exists
 * rather than a `[data-theme]` attribute with both stylesheets loaded: if
 * daylight were always present, every role midnight forgot would resolve to a
 * plausible LIGHT hex on a dark page — quieter than an undefined token and much
 * worse, because nothing would look broken enough to investigate. Loading one
 * chain means a forgotten role resolves to nothing at all, which is loud.
 * (plans/css-system-2.md §3.)
 *
 * ⚠️ MIDNIGHT IS A SPIKE, behind a flag, and is not finished design. Reach it
 * with `?theme=midnight`; the choice sticks in localStorage so it survives the
 * in-app navigation that follows, and `?theme=daylight` clears it. There is no
 * UI for this on purpose — a theme picker is a product decision nobody has
 * made, and the flag is here to answer an engineering question: does the file
 * split hold up when something other than daylight asks it to?
 *
 * The chain is loaded with dynamic `import()` rather than a static one, which
 * is what lets the choice be a choice. The cost is that the theme's CSS arrives
 * a tick after the module graph rather than with it, so the caller awaits this
 * before rendering — otherwise the first paint would be an unstyled flash.
 *
 * The theme-INDEPENDENT half of the chain (fixed.css, base.css, utilities.css)
 * stays a static import in main.tsx. It is the same under every theme, so there
 * is nothing here to decide about it.
 */

/** The themes that exist. `daylight` is what ships. */
export type ThemeName = 'daylight' | 'midnight'

const STORAGE_KEY = 'pup-theme'

/**
 * The URL wins over the stored choice, so a link can always override a sticky
 * one — and an explicit `?theme=daylight` clears the stored value rather than
 * merely losing to it, which is the only way back out of the spike without
 * opening devtools.
 */
function chosenTheme(): ThemeName {
  const fromUrl = new URLSearchParams(window.location.search).get('theme')
  if (fromUrl === 'midnight') {
    window.localStorage.setItem(STORAGE_KEY, 'midnight')
    return 'midnight'
  }
  if (fromUrl === 'daylight') {
    window.localStorage.removeItem(STORAGE_KEY)
    return 'daylight'
  }
  return window.localStorage.getItem(STORAGE_KEY) === 'midnight' ? 'midnight' : 'daylight'
}

export async function loadTheme(): Promise<ThemeName> {
  const theme = chosenTheme()
  if (theme === 'midnight') {
    await import('./dark-mode.css')
    await import('./midnight.css')
  } else {
    await import('./light-mode.css')
    await import('./daylight.css')
  }
  // Published for anything that wants to know which theme it is in — the
  // palette page's toggle will, once there is a second theme worth toggling to.
  document.documentElement.dataset.theme = theme
  return theme
}
