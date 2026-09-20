// cs-audited-pdf

/**
 * Tests for the track family's layout. drawInTracks owns three rules a
 * per-game printer cannot see going wrong: the width comes from the cap and
 * not from how many tracks a page holds, a page break resets the tallest
 * column, and a wide-board game may lower the cap.
 */

import { describe, expect, it } from 'vitest'
import { fakePd } from './fakeJsPdf'
import { drawInTracks, MAX_TRACKS, type Track } from './columns'

/** Run four tracks and collect what each was handed, plus what came back. */
function layFour(maxTracks?: number) {
  const { pd, calls } = fakePd()
  const tracks: Track[] = []
  const ends = [700, 500, 600, 100]
  const out = drawInTracks(pd, ends, (end, t) => {
    tracks.push(t)
    return end
  }, maxTracks)
  return { pd, calls, tracks, out }
}

describe('drawInTracks', () => {
  it('hands every track the same width, from the cap — a lone track on a second page too', () => {
    const { tracks, calls } = layFour()
    expect(calls.filter((c) => c.m === 'addPage')).toHaveLength(1)
    expect(new Set(tracks.map((t) => t.width)).size).toBe(1)
    // (612 − 2·28 − 2·18) / 3
    expect(tracks[0].width).toBeCloseTo((556 - 36) / MAX_TRACKS)
    // The fourth starts a new page at the first slot.
    expect(tracks[3].x).toBe(28)
  })

  it('lays tracks out left to right with a gutter between', () => {
    const { tracks } = layFour()
    const w = tracks[0].width
    expect(tracks.slice(0, 3).map((t) => t.x)).toEqual([28, 28 + w + 18, 28 + 2 * (w + 18)])
  })

  it('gives every track the page geometry it draws within', () => {
    const { tracks, pd } = layFour()
    expect(tracks.every((t) => t.top === pd.contentTop && t.bottom === pd.pageBottom)).toBe(true)
  })

  it('reports the tallest column on the LAST page, not the tallest ever', () => {
    // Page one ends at 700; page two's lone track ends at 100 — the Setup
    // recap goes under THAT, on the page the cursor is on.
    const { out } = layFour()
    expect(out.bottom).toBe(100)
    expect(out.left).toBe(28)
    expect(out.width).toBe(556)
  })

  it('takes a lower cap for a wide board', () => {
    const { tracks, calls } = layFour(2)
    expect(calls.filter((c) => c.m === 'addPage')).toHaveLength(1)
    expect(tracks[0].width).toBeCloseTo((556 - 18) / 2)
    expect(tracks[2].x).toBe(28) // the third opens page two
  })

  it('draws nothing and adds no page for no tracks', () => {
    const { pd, calls } = fakePd()
    const out = drawInTracks(pd, [], () => 0)
    expect(calls).toHaveLength(0)
    expect(out.bottom).toBe(pd.contentTop)
  })
})
