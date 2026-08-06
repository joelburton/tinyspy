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
  ended: 'Ended',
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
/**
 * The full-size viewer, on BLACK.
 *
 * Clicking a thumbnail used to open the PNG directly, which the browser draws
 * on its own white background — and since most of these screenshots are a white
 * app on a white page, the edge of the image was invisible. You couldn't tell
 * where the viewport stopped, which is the one thing you're looking for when
 * checking how close something sits to the bottom of a phone.
 *
 * So the link goes here instead: a black page with the image centred on it, so
 * the boundary is unmissable. One page for all of them, taking the file as a
 * query param, rather than a generated wrapper per shot.
 */
export function renderViewer(): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>gallery — view</title>
<style>
  /* BLACK here on purpose, and it is not a "muted background": the whole job of
     this page is to make the white screenshot's edges visible, which needs the
     highest possible contrast against them. Text stays pure white on it. */
  html, body { margin: 0; height: 100%; background: #000000; }
  body { display: flex; align-items: center; justify-content: center; }
  img { max-width: 100vw; max-height: 100vh; display: block; }
  .err { color: #ffffff; font: 16px/1.4 system-ui, sans-serif; padding: 2rem; }
</style>
<script>
  const file = new URLSearchParams(location.search).get('img')
  if (file) {
    const img = document.createElement('img')
    img.src = file
    img.alt = file
    document.addEventListener('DOMContentLoaded', () => document.body.append(img))
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      const p = document.createElement('p')
      p.className = 'err'
      p.textContent = 'No ?img= given. Open a tile from index.html.'
      document.body.append(p)
    })
  }
</script>
`
}

/** Heading label for each capture technology, in the order they're shown. */
const TECH: Array<{ key: string; label: string }> = [
  { key: 'desktop', label: 'Desktop' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'pdf', label: 'PDF' },
]

/**
 * @param brands codename → player-facing brand, for the "SnakeBox (letterboxed)"
 *   headings. Both names: the sheet is read by someone thinking in brands and
 *   edited by someone thinking in code names.
 */
export function renderIndex(
  shots: Shot[],
  stamp: string,
  brands: Record<string, string>,
): string {
  const modes: Array<'coop' | 'compete'> = ['coop', 'compete']
  const title = (g: string) => `${brands[g] ?? g} (${g})`
  // Alphabetical by BRAND — that's the name on the heading and in the jump
  // list, so it's the one someone scans for. A game with no brand declared
  // sorts by its code name, which is what its heading shows anyway.
  const games = [...new Set(shots.map((s) => s.game))].sort((a, b) =>
    (brands[a] ?? a).localeCompare(brands[b] ?? b),
  )

  const at = (game: string, mode: string, phase: string, viewport: string) =>
    shots.find(
      (s) =>
        s.game === game &&
        s.cell.mode === mode &&
        s.cell.phase === phase &&
        s.viewport === viewport,
    )

  /** Does this game have anything under (tech, mode)? */
  const has = (game: string, tech: string, mode: string) =>
    PHASES.some((phase) => {
      const shot = at(game, mode, phase, tech)
      // A game with NO declared cell for a mode simply doesn't HAVE that mode
      // (bananagrams is compete-only, codenamesduet coop-only), so its heading
      // goes rather than sitting over four holes: a hole means "nobody has
      // looked at this state", which would be a lie about a mode that can't be
      // played at all.
      return shot && !(shot.file === null && shot.missing === 'no cell declared')
    })

  const strip = (game: string, tech: string, mode: string) =>
    PHASES.map((phase) => {
      const shot = at(game, mode, phase, tech)
      const body = !shot?.file
        ? `<div class="hole">${shot?.missing ?? 'not captured'}</div>`
        : shot.file.endsWith('.pdf')
          ? `<a href="${shot.file}" target="_blank" class="paper"><span class="paperMark">PDF</span><span class="paperName">${shot.file}</span></a>`
          : `<a href="viewer.html?img=${encodeURIComponent(shot.file)}" target="_blank"><img src="${shot.file}" loading="lazy" alt="${game} ${mode} ${phase} ${tech}"></a>`
      const note = shot?.cell.note ? `<div class="note">${shot.cell.note}</div>` : ''
      return `<figure>
        ${body}
        <figcaption>${LABEL[phase]}${note}</figcaption>
      </figure>`
    }).join('')

  const sections = games
    .map((game) => {
      const techBlocks = TECH.map(({ key, label }) => {
        const modeBlocks = modes
          .filter((mode) => has(game, key, mode))
          .map(
            (mode) => `<h4>${mode === 'coop' ? 'Co-op' : 'Compete'}</h4>
              <div class="strip">${strip(game, key, mode)}</div>`,
          )
          .join('')
        if (!modeBlocks) return ''
        return `<h3 id="${game}-${key}">${label}</h3>${modeBlocks}`
      }).join('')
      return `<section class="game" id="${game}"><h2>${title(game)}</h2>${techBlocks}</section>`
    })
    .join('')

  // The jump list: a row per game, with a link straight to each of its three
  // technology blocks. Fifteen games x three blocks is a lot of scrolling, and
  // "show me every game's mobile" is a question this answers in one click.
  const nav = games
    .map(
      (g) => `<li><a class="navGame" href="#${g}">${title(g)}</a>${TECH.map(
        ({ key, label }) => ` <a class="navTech" href="#${g}-${key}">${label}</a>`,
      ).join('')}</li>`,
    )
    .join('')

  return `<!doctype html>
<meta charset="utf-8">
<title>PuzPuzPuz — game gallery</title>
<style>
  /* WHITE background, BLACK text. Every text colour on this page is #000 and
     the page itself is #fff — no muted greys, no dimmed captions, no faded
     "secondary" text.
     Grey-on-grey is a readability failure before it is a style, and a page
     whose entire job is "look carefully at these images and read what's under
     them" has no business making any of its labels harder to read than the
     rest. Structure is carried by weight, size, borders and spacing, which
     cost no contrast. If something here needs de-emphasising, change its SIZE
     or WEIGHT — do not reach for grey. */
  :root { color-scheme: light; }
  body { margin: 0; padding: 1.5rem; background: #ffffff;
         font: 14px/1.4 system-ui, -apple-system, sans-serif; color: #000000; }
  h1 { margin: 0 0 .25rem; font-size: 1.4rem; color: #000000; }
  .stamp { color: #000000; margin-bottom: .75rem; }
  /* Fifteen games is a lot of scrolling; the jump list makes "show me
     stackdown" one click rather than a hunt. */
  .nav { list-style: none; margin: 0 0 2rem; padding: 0; }
  .nav li { display: flex; align-items: baseline; gap: .4rem; padding: .15rem 0; }
  .navGame { font-weight: 700; color: #000000; text-decoration: none;
             min-width: 20rem; }
  .navGame:hover { text-decoration: underline; }
  .navTech { font-size: .8rem; padding: .1rem .5rem; border: 1px solid #000000;
             border-radius: 999px; text-decoration: none; color: #000000;
             background: #ffffff; }
  .navTech:hover { background: #000000; color: #ffffff; }
  .game { scroll-margin-top: 1rem; }
  h2 { margin: 3rem 0 .25rem; font-size: 1.25rem; color: #000000;
       border-bottom: 2px solid #000000; padding-bottom: .3rem; }
  h3 { margin: 1.5rem 0 .5rem; font-size: 1rem; font-weight: 700; color: #000000;
       scroll-margin-top: 1rem; }
  h4 { margin: 1rem 0 .5rem; font-size: .8rem; font-weight: 700; color: #000000;
       text-transform: uppercase; letter-spacing: .06em; }
  /* Four phases across — one game's whole arc, left to right. */
  .strip { display: flex; gap: .75rem; }
  figure { margin: 0; flex: 0 0 auto; width: 240px; }
  figure img { width: 100%; height: 190px; object-fit: contain; object-position: top;
               border: 1px solid #000000; border-radius: 6px;
               background: #ffffff; display: block; }
  /* A printout's tile is a link, not a preview: an <embed> wraps every tile in
     the browser's PDF viewer, a lot of machinery for a thumbnail nobody reads
     at 240px. Same box as the others so the row stays aligned. */
  .paper { height: 190px; border: 1px solid #000000; border-radius: 6px;
           background: #ffffff; display: flex; flex-direction: column;
           align-items: center; justify-content: center; gap: .4rem;
           text-decoration: none; color: #000000; }
  .paper:hover { background: #ffffff; outline: 2px solid #000000; }
  .paperMark { font: 700 .95rem/1 system-ui; letter-spacing: .12em;
               border: 2px solid #000000; border-radius: 4px; padding: .45rem .6rem; }
  .paperName { font-size: .7rem; color: #000000; max-width: 90%; overflow: hidden;
               text-overflow: ellipsis; white-space: nowrap; }
  /* A missing tile is marked by a DASHED border and its own words, not by
     dimming — a hole is information ("nobody has looked at this state"), so it
     has to be as readable as everything else. */
  .hole { width: 100%; height: 190px; border: 1px dashed #000000; border-radius: 6px;
          display: flex; align-items: center; justify-content: center; text-align: center;
          padding: .5rem; color: #000000; font-size: .75rem; background: #ffffff; }
  figcaption { margin-top: .35rem; font-weight: 700; color: #000000; }
  .note { font-weight: 400; color: #000000; font-size: .8rem; }
</style>
<h1>PuzPuzPuz — game gallery</h1>
<div class="stamp">${stamp} · ${shots.filter((s) => s.file).length} of ${shots.length} tiles captured</div>
<ul class="nav">${nav}</ul>
${sections}
`
}
