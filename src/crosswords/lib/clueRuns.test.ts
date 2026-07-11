import { describe, expect, it } from 'vitest'
import { parseClueRuns, wrapClueRuns } from './clueRuns'

/** A fake text measure: 1 unit per character (roman == italic here). Lets us
 *  test the wrap arithmetic without jsPDF. */
const perChar = (t: string) => t.length

describe('parseClueRuns', () => {
  it('splits _…_ markers into italic runs, stripping the underscores', () => {
    expect(parseClueRuns('Jaunty singer of _Heigh-Ho_? (5)')).toEqual([
      { text: 'Jaunty singer of ', italic: false },
      { text: 'Heigh-Ho', italic: true },
      { text: '? (5)', italic: false },
    ])
  })
  it('leaves plain text and a lone underscore untouched', () => {
    expect(parseClueRuns('Plain (4)')).toEqual([{ text: 'Plain (4)', italic: false }])
    expect(parseClueRuns('a _ b')).toEqual([{ text: 'a _ b', italic: false }])
  })
})

describe('wrapClueRuns', () => {
  it('keeps an italic+roman fragment ("Heigh-Ho?") as ONE word (no mid-emphasis break)', () => {
    // width 8 forces a break after "Heigh-Ho?" (9 chars) can't share a line —
    // but the italic "Heigh-Ho" and roman "?" must stay together on their line.
    const lines = wrapClueRuns(parseClueRuns('of _Heigh-Ho_? go'), 9, perChar)
    // The middle line holds the whole styled word, both segs intact.
    const withEmphasis = lines.find((l) => l.some((s) => s.italic))!
    expect(withEmphasis.map((s) => `${s.italic ? 'i:' : ''}${s.text}`)).toEqual(['i:Heigh-Ho', '?'])
  })

  it('wraps on spaces by width and re-inserts single spaces', () => {
    const lines = wrapClueRuns([{ text: 'one two three', italic: false }], 7, perChar)
    // "one two" (7) fits; "three" wraps.
    expect(lines.map((l) => l.map((s) => s.text).join(''))).toEqual(['one two', 'three'])
  })

  it('never returns empty', () => {
    expect(wrapClueRuns([], 100, perChar)).toEqual([[]])
  })
})
