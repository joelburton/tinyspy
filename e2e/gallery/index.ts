import type { Cell, Phase } from './types'
import { PHASES } from './types'

/** One photographed (or missing) tile. */
export type Shot = {
  game: string
  cell: Cell
  viewport: string
  /** Path relative to the gallery root, or null when the capture failed. */
  file: string | null
  /** Why it's missing — an error, or "this game has no such state". */
  missing?: string
}

const TITLE: Record<Phase, string> = {
  fresh: 'Fresh — nobody has moved',
  mid: 'Mid-game — some moves in, nothing decided',
  won: 'Won — terminal, the players did it',
  lost: 'Lost — terminal, they did not',
}

/**
 * The contact sheet.
 *
 * **Grouped by CELL, not by game** — this is the whole point (docs/gallery-plan.md).
 * The instinct is a page per game, but the question this tool answers is
 * cross-game consistency, so the useful page puts every game's "coop / mid-game
 * / desktop" side by side. A page per game answers a question nobody has.
 *
 * Holes are drawn, not closed: a game with no `lost` cell shows an explicit
 * empty tile, because "nobody has looked at this state" is information.
 */
export function renderIndex(shots: Shot[], stamp: string): string {
  const games = [...new Set(shots.map((s) => s.game))].sort()
  const viewports = [...new Set(shots.map((s) => s.viewport))]
  const modes: Array<'coop' | 'compete'> = ['coop', 'compete']

  const at = (game: string, mode: string, phase: string, viewport: string) =>
    shots.find(
      (s) =>
        s.game === game &&
        s.cell.mode === mode &&
        s.cell.phase === phase &&
        s.viewport === viewport,
    )

  const sections = viewports
    .map((vp) =>
      modes
        .map((mode) => {
          const rows = PHASES.map((phase) => {
            const tiles = games
              .map((game) => {
                const shot = at(game, mode, phase, vp)
                const body = shot?.file
                  ? `<a href="${shot.file}" target="_blank"><img src="${shot.file}" loading="lazy" alt="${game} ${mode} ${phase} ${vp}"></a>`
                  : `<div class="hole">${shot?.missing ?? 'not captured'}</div>`
                const note = shot?.cell.note ? `<div class="note">${shot.cell.note}</div>` : ''
                return `<figure class="${shot?.file ? '' : 'empty'}">
                  ${body}
                  <figcaption>${game}${note}</figcaption>
                </figure>`
              })
              .join('')
            return `<section>
              <h3>${TITLE[phase]}</h3>
              <div class="strip">${tiles}</div>
            </section>`
          }).join('')
          return `<h2>${vp} · ${mode === 'coop' ? 'Co-op' : 'Compete'}</h2>${rows}`
        })
        .join(''),
    )
    .join('')

  return `<!doctype html>
<meta charset="utf-8">
<title>PuzPuzPuz — game gallery</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 1.5rem; background: #fafafa;
         font: 14px/1.4 system-ui, -apple-system, sans-serif; color: #222; }
  h1 { margin: 0 0 .25rem; font-size: 1.4rem; }
  .stamp { color: #666; margin-bottom: 1.5rem; }
  h2 { margin: 2.5rem 0 .5rem; font-size: 1.1rem; border-bottom: 2px solid #ccc;
       padding-bottom: .3rem; }
  h3 { margin: 1.25rem 0 .5rem; font-size: .8rem; font-weight: 600;
       text-transform: uppercase; letter-spacing: .06em; color: #555; }
  /* One horizontal strip per state, so the eye compares ACROSS games — the
     comparison this tool exists for. */
  .strip { display: flex; gap: .75rem; overflow-x: auto; padding-bottom: .5rem; }
  figure { margin: 0; flex: 0 0 auto; width: 240px; }
  /* A fixed BOX with contain, not a fluid width: PDFs are portrait and
     screenshots landscape, so sizing by width alone made a paper tile three
     times the height of the one beside it and left every caption on a
     different line. One box height per strip keeps the row scannable, which
     is the entire job of a contact sheet. */
  figure img { width: 100%; height: 190px; object-fit: contain; object-position: top;
               border: 1px solid #ccc; border-radius: 6px;
               background: #fff; display: block; }
  figure.empty { opacity: .55; }
  .hole { width: 100%; height: 190px; border: 1px dashed #bbb; border-radius: 6px;
          display: flex; align-items: center; justify-content: center; text-align: center;
          padding: .5rem; color: #888; font-size: .75rem; background: #f2f2f2; }
  figcaption { margin-top: .35rem; font-weight: 600; }
  .note { font-weight: 400; color: #666; font-size: .8rem; }
</style>
<h1>PuzPuzPuz — game gallery</h1>
<div class="stamp">${stamp} · ${shots.filter((s) => s.file).length} of ${shots.length} tiles captured</div>
${sections}
`
}
