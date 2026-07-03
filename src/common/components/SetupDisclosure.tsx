import type { ReactNode } from 'react'
import shared from './PlayArea.module.css'

/**
 * The info-column "Setup options" disclosure — a closed-by-default `<details>`
 * that recaps the game's chosen settings while playing. The wrapper (the
 * `<details class="infoSetup">` + the "Setup options" summary + the `<ul>`) is
 * identical in every game; only the `<li>` rows differ, so pass them as children.
 */
export function SetupDisclosure({ children }: { children: ReactNode }) {
  return (
    <details className={shared.infoSetup}>
      <summary>Setup options</summary>
      <ul>{children}</ul>
    </details>
  )
}
