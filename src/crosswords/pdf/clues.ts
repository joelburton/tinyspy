/**
 * Clue laydown + pagination. Pure-ish: takes a jsPDF doc (used only
 * for text measurement via splitTextToSize) and a region list, and
 * either renders into the doc or returns the planned positions.
 *
 * Flow: ACROSS heading → each across clue → DOWN heading → each
 * down clue. Items are placed in flow order, advancing top-down
 * within a region, then to the next region; when all regions on the
 * current page are exhausted, a new page is added with
 * `continuationCols` equal-width columns.
 */

import type { jsPDF } from 'jspdf'
import type { Clue } from '../lib/types'
import { type ClueSeg, parseClueRuns, wrapClueRuns } from '../lib/clueRuns'
import type { Rect } from './layout'
import { continuationRegions } from './layout'
import {
  CLUE_BOTTOM_MARGIN,
  CLUE_LINE_HEIGHT,
  CLUE_NUM_GUTTER,
  CLUE_RIGHT_PAD,
  CLUE_SIZE,
  FONT_SERIF,
  HEADING_BOTTOM_PAD,
  HEADING_SIZE,
} from './fonts'

export type Item =
  | { kind: 'heading'; text: 'ACROSS' | 'DOWN' }
  | { kind: 'clue'; number: number; text: string }

export type ClueItems = {
  across: Clue[]
  down: Clue[]
}

/** Build the flat flow of items in reading order. */
export function buildItems(clues: ClueItems): Item[] {
  const items: Item[] = []
  if (clues.across.length > 0) {
    items.push({ kind: 'heading', text: 'ACROSS' })
    for (const c of clues.across) items.push({ kind: 'clue', number: c.number, text: c.text })
  }
  if (clues.down.length > 0) {
    items.push({ kind: 'heading', text: 'DOWN' })
    for (const c of clues.down) items.push({ kind: 'clue', number: c.number, text: c.text })
  }
  return items
}

/** Wrapped representation of a single item, ready to be drawn. */
export type LaidOutItem = {
  item: Item
  /** Wrapped body lines as PLAIN strings (single string for a heading; the
   *  emphasis-stripped clue text for a clue). Kept for the line COUNT (→
   *  height) and as the draw fallback; `styled` carries the italics. */
  lines: string[]
  /** Clue only: each wrapped line as styled runs (`_…_` → italic), drawn
   *  segment-by-segment so `<i>`/`<em>` clue markup prints as real italics. */
  styled?: ClueSeg[][]
  /** Total vertical space the item takes including bottom margin. */
  height: number
}

/**
 * Measure each item against a given region width. `doc` must already
 * have a font/size set for measurement — we re-set as needed (Times
 * 9.5 for clues, Times-Bold 10 for headings).
 */
export function measureItems(doc: jsPDF, items: Item[], regionWidth: number): LaidOutItem[] {
  const out: LaidOutItem[] = []
  const textWidth = Math.max(10, regionWidth - CLUE_NUM_GUTTER - CLUE_RIGHT_PAD)

  for (const item of items) {
    if (item.kind === 'heading') {
      out.push({
        item,
        lines: [item.text],
        height: HEADING_SIZE + HEADING_BOTTOM_PAD,
      })
      continue
    }
    doc.setFontSize(CLUE_SIZE)
    // Styled word-wrap (via jsPDF metrics) so `_…_` runs print italic and a
    // hyphenated emphasized word (Guardian's "Heigh-Ho") never orphans a
    // fragment across a line break. `lines` is the plain-string projection —
    // used only for the line COUNT (height) and the no-italics draw fallback.
    const measure = (text: string, italic: boolean) => {
      doc.setFont(FONT_SERIF, italic ? 'italic' : 'normal')
      return doc.getTextWidth(text)
    }
    const styled = wrapClueRuns(parseClueRuns(item.text), textWidth, measure)
    const lines = styled.map((line) => line.map((s) => s.text).join(''))
    out.push({
      item,
      lines,
      styled,
      height: styled.length * CLUE_LINE_HEIGHT + CLUE_BOTTOM_MARGIN,
    })
  }
  return out
}

/** A single positioned item placement (page + rect + content). */
export type Placement = {
  page: number
  region: Rect
  /** Y offset within the region (top of the item). */
  y: number
  item: LaidOutItem
}

/**
 * Pagination state machine. Walks `items`, placing each into the
 * current region until full, then advancing through regions and new
 * pages.
 *
 * Orphan rule: a heading is held back if its immediate next clue
 * wouldn't fit alongside it in the current region — they advance
 * together.
 */
export function paginate(
  laidOut: LaidOutItem[],
  pageOneRegions: Rect[],
  continuationCols: number,
): Placement[] {
  const placements: Placement[] = []
  let page = 1
  let regions = pageOneRegions
  let regionIdx = 0
  let yInRegion = 0

  const advanceRegion = () => {
    regionIdx += 1
    if (regionIdx >= regions.length) {
      page += 1
      regions = continuationRegions(continuationCols)
      regionIdx = 0
    }
    yInRegion = 0
  }

  for (let i = 0; i < laidOut.length; i++) {
    const item = laidOut[i]!
    let needed = item.height
    // Orphan rule: heading followed by a clue must have room for both.
    if (
      item.item.kind === 'heading' &&
      i + 1 < laidOut.length &&
      laidOut[i + 1]!.item.kind === 'clue'
    ) {
      needed += laidOut[i + 1]!.height
    }
    // If the current region can't fit `needed`, advance — but only
    // if the region has had at least one item placed (so we don't
    // skip empty regions endlessly on a too-tall item).
    while (
      regionIdx < regions.length &&
      regions[regionIdx]!.h > 0 &&
      yInRegion + needed > regions[regionIdx]!.h &&
      yInRegion > 0
    ) {
      advanceRegion()
    }
    // Empty / zero-height region: skip past it.
    while (regions[regionIdx] && regions[regionIdx]!.h <= 0) {
      advanceRegion()
    }

    placements.push({
      page,
      region: regions[regionIdx]!,
      y: yInRegion,
      item,
    })
    yInRegion += item.height
  }
  return placements
}

/**
 * Draw the placements into the document. Adds new pages as needed.
 * Caller is responsible for the items being on page 1 already
 * (so we only call `addPage` between page boundaries).
 */
export function drawPlacements(doc: jsPDF, placements: Placement[]): void {
  let currentPage = 1
  for (const p of placements) {
    while (currentPage < p.page) {
      doc.addPage()
      currentPage += 1
    }
    drawItem(doc, p)
  }
}

function drawItem(doc: jsPDF, p: Placement): void {
  const { region, y, item } = p
  if (item.item.kind === 'heading') {
    doc.setFont(FONT_SERIF, 'bold')
    doc.setFontSize(HEADING_SIZE)
    const baseline = region.y + y + HEADING_SIZE
    doc.text(item.item.text, region.x, baseline)
    // Thin underline under the heading text.
    doc.setLineWidth(0.4)
    const ulY = baseline + 2
    const ulW = doc.getTextWidth(item.item.text)
    doc.line(region.x, ulY, region.x + ulW, ulY)
    return
  }

  // Clue: number in gutter, body text right of gutter.
  doc.setFont(FONT_SERIF, 'bold')
  doc.setFontSize(CLUE_SIZE)
  const numText = String(item.item.number)
  // Right-align the number inside the gutter, baseline aligned with
  // the first line of body text.
  const firstBaseline = region.y + y + CLUE_SIZE
  doc.text(numText, region.x + CLUE_NUM_GUTTER - 2, firstBaseline, { align: 'right' })

  doc.setFontSize(CLUE_SIZE)
  const textX = region.x + CLUE_NUM_GUTTER
  let lineBaseline = firstBaseline
  if (item.styled) {
    // Draw each line segment-by-segment, switching the font style per run so
    // the `_…_` emphasis prints as real italics (jsPDF draws one style per
    // `text()` call). x advances by each segment's measured width.
    for (const line of item.styled) {
      let cx = textX
      for (const seg of line) {
        doc.setFont(FONT_SERIF, seg.italic ? 'italic' : 'normal')
        doc.text(seg.text, cx, lineBaseline)
        cx += doc.getTextWidth(seg.text)
      }
      lineBaseline += CLUE_LINE_HEIGHT
    }
  } else {
    doc.setFont(FONT_SERIF, 'normal')
    for (const line of item.lines) {
      doc.text(line, textX, lineBaseline)
      lineBaseline += CLUE_LINE_HEIGHT
    }
  }
}
