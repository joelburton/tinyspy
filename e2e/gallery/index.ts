import type { Cell, Phase } from './types'
import { PHASES } from './types'

/** One photographed (or missing) tile. */
export type Shot = {
  game: string
  cell: Cell
  /** 'desktop' | 'mobile' | 'pdf' — paper rides this axis so it groups like a
   *  viewport, which is what it is: another way of looking at the same state. */
  viewport: string
  /** Path relative to the gallery root, or null when there's nothing to show. */
  file: string | null
  /** Why it's missing — an error, or that nobody asked for this one. */
  missing?: string
}

/** Column headings. Short, because the row is four of them side by side. */
const LABEL: Record<Phase, string> = {
  fresh: 'Start',
  mid: 'Midway',
  won: 'End — won',
  lost: 'End — lost',
}

/**
 * The contact sheet.
 *
 * **A game per section, its PHASES across.** Each game gets an `<h2>`, then a
 * row per viewport+mode whose four tiles run fresh → mid → won → lost.
 *
 * The first version had this the other way up — a strip per state with every
 * game side by side — reasoning that the tool is for CROSS-GAME consistency.
 * The reasoning was right and the layout still wrong, for something that only
 * bites at scale: fifteen games in a strip is fifteen tiles wide, so comparing
 * them means dragging a scrollbar sideways. Four phases fit any screen, which
 * hands the cross-game comparison to VERTICAL scrolling — the thing browsers
 * are good at. You still read one position across games; you just scroll down
 * to do it, and each game's whole arc lands in a single row for free.
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

  const sections = games
    .map((game) => {
      const rows = viewports
        .flatMap((vp) =>
          modes.map((mode) => {
            const cells = PHASES.map((phase) => at(game, mode, phase, vp))
            // A game with NO declared cell for a mode simply doesn't HAVE that
            // mode (bananagrams is compete-only, codenamesduet coop-only), so
            // the row goes rather than drawing four holes: a hole means "nobody
            // has looked at this state", which would be a lie about a mode the
            // game can't be played in. Same for a paper row nobody asked to print.
            if (cells.every((c) => !c || (!c.file && c.missing === 'no cell declared'))) return ''
            if (vp === 'pdf' && cells.every((c) => !c?.file)) return ''

            const tiles = PHASES.map((phase) => {
              const shot = at(game, mode, phase, vp)
              const body = !shot?.file
                ? `<div class="hole">${shot?.missing ?? 'not captured'}</div>`
                : shot.file.endsWith('.pdf')
                  ? `<a href="${shot.file}" target="_blank" class="paper"><span class="paperMark">PDF</span><span class="paperName">${shot.file}</span></a>`
                  : `<a href="${shot.file}" target="_blank"><img src="${shot.file}" loading="lazy" alt="${game} ${mode} ${phase} ${vp}"></a>`
              const note = shot?.cell.note ? `<div class="note">${shot.cell.note}</div>` : ''
              return `<figure class="${shot?.file ? '' : 'empty'}">
                ${body}
                <figcaption>${LABEL[phase]}${note}</figcaption>
              </figure>`
            }).join('')

            return `<h3>${vp} · ${mode === 'coop' ? 'Co-op' : 'Compete'}</h3>
              <div class="strip">${tiles}</div>`
          }),
        )
        .join('')
      return `<section class="game" id="${game}"><h2>${game}</h2>${rows}</section>`
    })
    .join('')

  const nav = games.map((g) => `<a href="#${g}">${g}</a>`).join('')

  return `<!doctype html>
<meta charset="utf-8">
<title>PuzPuzPuz — game gallery</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 1.5rem; background: #fafafa;
         font: 14px/1.4 system-ui, -apple-system, sans-serif; color: #222; }
  h1 { margin: 0 0 .25rem; font-size: 1.4rem; }
  .stamp { color: #666; margin-bottom: .75rem; }
  /* Fifteen games is a lot of scrolling; the jump list makes "show me
     stackdown" one click rather than a hunt. */
  .nav { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: 1.5rem; }
  .nav a { font-size: .8rem; padding: .2rem .5rem; border: 1px solid #ccc;
           border-radius: 999px; text-decoration: none; color: #444; background: #fff; }
  .nav a:hover { border-color: #888; }
  .game { scroll-margin-top: 1rem; }
  h2 { margin: 2.5rem 0 .25rem; font-size: 1.25rem; border-bottom: 2px solid #ccc;
       padding-bottom: .3rem; }
  h3 { margin: 1.25rem 0 .5rem; font-size: .8rem; font-weight: 600;
       text-transform: uppercase; letter-spacing: .06em; color: #555; }
  /* Four phases across — one game's whole arc, left to right. */
  .strip { display: flex; gap: .75rem; }
  figure { margin: 0; flex: 0 0 auto; width: 240px; }
  figure img { width: 100%; height: 190px; object-fit: contain; object-position: top;
               border: 1px solid #ccc; border-radius: 6px;
               background: #fff; display: block; }
  /* A printout's tile is a link, not a preview: an <embed> wraps every tile in
     the browser's PDF viewer, a lot of machinery for a thumbnail nobody reads
     at 240px. Same box as the others so the row stays aligned. */
  .paper { height: 190px; border: 1px solid #ccc; border-radius: 6px; background: #fff;
           display: flex; flex-direction: column; align-items: center;
           justify-content: center; gap: .4rem; text-decoration: none; color: #444; }
  .paper:hover { border-color: #888; }
  .paperMark { font: 600 .95rem/1 system-ui; letter-spacing: .12em;
               border: 2px solid #bbb; border-radius: 4px; padding: .45rem .6rem; }
  .paperName { font-size: .7rem; color: #888; max-width: 90%; overflow: hidden;
               text-overflow: ellipsis; white-space: nowrap; }
  figure.empty { opacity: .55; }
  .hole { width: 100%; height: 190px; border: 1px dashed #bbb; border-radius: 6px;
          display: flex; align-items: center; justify-content: center; text-align: center;
          padding: .5rem; color: #888; font-size: .75rem; background: #f2f2f2; }
  figcaption { margin-top: .35rem; font-weight: 600; }
  .note { font-weight: 400; color: #666; font-size: .8rem; }
</style>
<h1>PuzPuzPuz — game gallery</h1>
<div class="stamp">${stamp} · ${shots.filter((s) => s.file).length} of ${shots.length} tiles captured</div>
<div class="nav">${nav}</div>
${sections}
`
}
