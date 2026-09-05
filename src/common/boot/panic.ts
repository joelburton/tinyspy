// cs-unmet

import { diagnosticsLine } from '../supabase/dbLog'

/**
 * **The last-resort screen** — plain DOM, painted when React cannot show
 * anything: the boot failed before the first render, or a render threw with no
 * boundary above it and React unmounted the whole tree.
 *
 * Plain DOM and inline styles on purpose. On the boot path nothing has
 * rendered and the stylesheet chain may be what failed; on the render path the
 * tree is already gone, so there is no React left to host `<ErrorPage>`. Either
 * way the page is a dead end, and what a friend needs from it is one sentence,
 * the diagnostics line to screenshot, and a Reload button — a reload is the
 * only recovery from either.
 *
 * `textContent` throughout, never `innerHTML`: the detail is an error message
 * from anywhere.
 */

/** Which failure this is. It picks the sentence and names the line's `call`. */
export type PanicPhase = 'boot' | 'render'

const SENTENCE: Record<PanicPhase, string> = {
  boot: 'The app could not start. Reloading may fix it.',
  render: 'The app hit a bug and stopped. Reloading may fix it.',
}

/**
 * Paint the screen and write the same line to the console. The diagnostics
 * line is the app's standard `FAULT` format, so a screenshot of it reads like
 * every other fault's.
 */
export function showPanic(phase: PanicPhase, err: unknown): void {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  const line = diagnosticsLine('FAULT', { call: phase, severity: 'fault', detail })
  console.error(line)

  const box = document.createElement('div')
  box.setAttribute(
    'style',
    'max-width:32rem;margin:4rem auto;padding:0 1rem;font:14px system-ui,sans-serif',
  )
  const sentence = document.createElement('p')
  sentence.textContent = SENTENCE[phase]
  const diagnostics = document.createElement('p')
  diagnostics.setAttribute('style', 'color:#666;font-size:0.85em;word-break:break-word')
  diagnostics.textContent = line
  const reload = document.createElement('button')
  reload.type = 'button'
  reload.textContent = 'Reload'
  reload.setAttribute('style', 'font:inherit;padding:0.4em 1em')
  reload.addEventListener('click', () => window.location.reload())
  box.append(sentence, diagnostics, reload)
  document.body.append(box)
}

/**
 * `createRoot`'s `onUncaughtError` — a throw during render that no boundary
 * caught. React has unmounted the tree before calling this, so the `try`
 * around boot is long finished and nothing React could show a message; the
 * same painter does. The component stack is the one fact this path has that
 * boot does not, and it goes to the console rather than the screen.
 */
export function onUncaughtRender(err: unknown, info: { componentStack?: string }): void {
  if (info.componentStack) console.error('[render] component stack:', info.componentStack)
  showPanic('render', err)
}
