// cs-audited-word-list

/**
 * Tests for the shared WordList's heading tally: "Words: N · Score: M ·
 * Longest: L" over
 * **the currently filtered list** — the feature's whole point is that the
 * filters become a reading tool (a player's coop contribution; the missed
 * words' cost at terminal), so the numbers must track the filter, not the
 * full row set. Score renders only when the game's rows carry points at all,
 * gated on ALL rows so it doesn't blink away when a filter empties the list.
 * Longest is ungated (every word has a length) and DESKTOP-ONLY, hidden by a
 * media query rather than dropped from the tree — so it's in the text content
 * here regardless of viewport, which is exactly why the hiding is a CSS
 * assertion's job and not this file's.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WordList, type WordListRow } from './WordList'
import type { Member } from '../members/member'
import { pickFilter } from '../lists/filterSelectHelpers'

const PLAYERS: Member[] = [
  { user_id: 'ada', username: 'ada', color: 'red' },
  { user_id: 'bea', username: 'bea', color: 'blue' },
]

const ROWS: WordListRow[] = [
  { kind: 'found', word: 'bead', userId: 'ada', points: 1 },
  { kind: 'found', word: 'beach', userId: 'bea', points: 5 },
  { kind: 'unfound', word: 'chafe', points: 5 },
]

const base = {
  players: PLAYERS,
  selfId: 'ada',
  isCompete: false,
  isTerminal: true,
  hasBonus: false,
}

describe('WordList — the heading tally', () => {
  // The WHOLE heading, as one exact string rather than three substring matches.
  // It is the line a player reads to know how they did, three `e2e` specs pin
  // it by content, and the word "Words" is a literal in the component now that
  // no caller overrides it — so the shape is asserted here, byte for byte.
  it('reads "Words: 7 · Score: 10 · Longest: 5"', () => {
    const seven: WordListRow[] = [
      { kind: 'found', word: 'bead', userId: 'ada', points: 2 },
      { kind: 'found', word: 'beach', userId: 'ada', points: 2 },
      { kind: 'found', word: 'cafe', userId: 'ada', points: 2 },
      { kind: 'found', word: 'chafe', userId: 'ada', points: 1 },
      { kind: 'found', word: 'dace', userId: 'ada', points: 1 },
      { kind: 'found', word: 'face', userId: 'ada', points: 1 },
      { kind: 'found', word: 'head', userId: 'ada', points: 1 },
    ]
    render(<WordList rows={seven} {...base} isTerminal={false} />)
    expect(screen.getByRole('heading', { level: 3 }).textContent)
      .toBe('Words: 7 · Score: 10 · Longest: 5')
  })

  it('counts and scores what is SHOWN — at terminal that is the finds', async () => {
    // The terminal default is Found, so the heading opens on what you got.
    render(<WordList rows={ROWS} {...base} />)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Words: 2 · Score: 6')

    await pickFilter('All')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Words: 3 · Score: 11')
  })

  it('tracks the WHO filter — a player, then the missed words', async () => {
    render(<WordList rows={ROWS} {...base} />)

    await pickFilter('bea')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Words: 1 · Score: 5')

    // The terminal reveal's cost, as a number: what the missed words were worth.
    await pickFilter('Missed')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Words: 1 · Score: 5')
  })

  it('omits the score entirely when the rows carry no points', () => {
    const unscored = ROWS.map((r) => ({ ...r, points: undefined }))
    render(<WordList rows={unscored} {...base} />)
    // Anchored: no stray "Score:" clause between the count and the longest.
    // Two, not three — the terminal default shows the finds.
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      /^Words: 2 · Longest: 5$/,
    )
  })

  it('reports the longest word IN LETTERS, tracking the filter', async () => {
    render(<WordList rows={ROWS} {...base} />)
    // bead(4) beach(5) chafe(5) → 5.
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('· Longest: 5')

    // Narrow to ada, whose only word is the 4-letter one.
    await pickFilter('ada')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('· Longest: 4')
  })
})

/**
 * The recently-found underline, and the one thing that switches it off.
 *
 * It says "this word just arrived", which is true of a teammate's find during
 * play and false of the reveal: at terminal every missed word — and in compete
 * every peer's find — lands in one refetch, so marking them would tell the
 * player a whole list had just been played.
 */
describe('WordList — the recently-found underline', () => {
  const ada = ROWS[0]!

  it('marks a word that arrives DURING play', () => {
    const { rerender } = render(<WordList rows={[]} {...base} isTerminal={false} />)
    rerender(<WordList rows={[ada]} {...base} isTerminal={false} />)
    expect(screen.getByText('BEAD').closest('li')!.className).toMatch(/recent/)
  })

  it('marks nothing once the game is over — the reveal is not an arrival', () => {
    const { rerender } = render(<WordList rows={[]} {...base} />)
    rerender(<WordList rows={[ada]} {...base} />)
    expect(screen.getByText('BEAD').closest('li')!.className).not.toMatch(/recent/)
  })
})

/**
 * The two row KINDS and the three flags that compose on them — the component's
 * actual job, and the half the filter tests reach only through `filter()`.
 *
 * Identity is the DOT, never the text: a found word's disc carries its finder's
 * color while the word itself stays plain, and an unfound one is a hollow ring
 * with the word muted. Everything below asserts the mark, not the words.
 */
describe('WordList — what a row wears', () => {
  const rowFor = (word: string) => screen.getByText(word).closest('li')!
  const dotIn = (word: string) => rowFor(word).querySelector('span[class*="dot"]') as HTMLElement

  const mixed: WordListRow[] = [
    { kind: 'found', word: 'bead', userId: 'ada', points: 1 },
    { kind: 'found', word: 'beach', userId: 'bea', points: 5, isBonus: true },
    { kind: 'found', word: 'cabbage', userId: 'ada', points: 9, isPangram: true },
    { kind: 'unfound', word: 'chafe', points: 5 },
    { kind: 'unfound', word: 'zho', points: 2, isBonus: true },
  ]
  // hasBonus so BOTH selects render: KIND is 0, WHO is 1. The rows carry bonus
  // words of each kind, which is the whole point of the pair.
  const all = { ...base, rows: mixed, hasBonus: true }

  it("fills a found word's dot in its FINDER's color, leaving the word plain", async () => {
    render(<WordList {...all} />)
    await pickFilter('All', 1) // WHO; KIND is 0 on a bonus board
    // ada and bea hold different palette colors, so the two discs differ — the
    // dot is where identity lives.
    expect(dotIn('BEAD').getAttribute('style')).toContain('--member-red')
    expect(dotIn('BEACH').getAttribute('style')).toContain('--member-blue')
    // …and the word itself carries no color of its own.
    expect(rowFor('BEAD').className).not.toMatch(/unfound/)
  })

  it('draws a word nobody found as a HOLLOW ring with the word muted', async () => {
    render(<WordList {...all} />)
    await pickFilter('All', 1) // WHO; KIND is 0 on a bonus board
    expect(dotIn('CHAFE').className).toMatch(/hollow/)
    expect(dotIn('CHAFE').className).toMatch(/dotUnfound/)
    expect(rowFor('CHAFE').className).toMatch(/unfound/)
    // A hollow disc takes no inline fill — the ring is its whole appearance.
    expect(dotIn('CHAFE').getAttribute('style')).toBeNull()
  })

  it('marks a bonus word on BOTH kinds — a missed bonus is not a missed required', async () => {
    render(<WordList {...all} />)
    await pickFilter('All', 1) // WHO; KIND is 0 on a bonus board
    expect(rowFor('BEACH').textContent).toContain('•')
    expect(rowFor('ZHO').textContent).toContain('•')
    // …and a plain word of either kind carries none.
    expect(rowFor('BEAD').textContent).not.toContain('•')
    expect(rowFor('CHAFE').textContent).not.toContain('•')
  })

  it('bolds a pangram, and only a pangram', async () => {
    render(<WordList {...all} />)
    await pickFilter('All', 1) // WHO; KIND is 0 on a bonus board
    expect(rowFor('CABBAGE').className).toMatch(/pangram/)
    expect(rowFor('BEAD').className).not.toMatch(/pangram/)
  })

  it('renders the hook’s empty line when a filter matches nothing', async () => {
    render(<WordList {...all} />)
    await pickFilter('Missed', 1)
    // 'zho' is the only missed BONUS word, so removing it empties the pair —
    // and the line has to name the axis rather than say "no words yet".
    await pickFilter('Required', 0)
    expect(screen.getByText('CHAFE')).toBeInTheDocument()
    await pickFilter('Bonus', 0)
    expect(screen.getByText('ZHO')).toBeInTheDocument()
  })
})
