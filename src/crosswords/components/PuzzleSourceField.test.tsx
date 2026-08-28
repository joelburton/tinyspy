// cs-unmet

/**
 * WHICH PUZZLE — the caption, and the field a refusal lands on.
 *
 * Two things are worth pinning here and nothing else is.
 *
 * **The caption**, because it is the only account of a choice once the picker
 * that made it has closed. The tabs kept their answer on screen; this design
 * trades that for a sentence, and a sentence that says "NYT" without the date
 * would lose exactly the fact the player opened the picker to learn.
 *
 * **The field name**, because it is what F50
 * (`puzzle-source-picks-in-a-dialog`) exists to give crosswords. Before it,
 * every message about a puzzle went to the form's bottom line — there was no
 * control carrying a `name` for the errors object to key on.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PuzzleSourceField } from './PuzzleSourceField'
import { summarize } from '../lib/puzzleSummary'
import { errorUnder } from '../../common/components/fields/errorUnder'
import { expectFieldContract } from '../../common/components/fields/fieldContract'
import type { PuzzleChoice } from '../lib/setup'

// jsdom doesn't implement scrollIntoView, and SelectionList keeps its cursor
// row in view with it — reached now that a picker takes focus on open.
Element.prototype.scrollIntoView = vi.fn()

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../db', () => ({ db: { rpc: mockRpc } }))

const BASE: PuzzleChoice = { source: 'library' }

function draw(value: Partial<PuzzleChoice> = {}, error?: string) {
  const onChange = vi.fn()
  const view = render(
    <PuzzleSourceField
      name="source"
      value={{ ...BASE, ...value }}
      onChange={onChange}
      seenBy={['self']}
      clubHandle="moths"
      error={error}
    />,
  )
  return { ...view, onChange }
}

// The SHARED contract, the same one the twelve components in
// `common/components/fields` are held to. It lives in a game folder, which is
// exactly why it needs saying out loud: `fieldTests.test.ts` only reads
// `common/components/fields`, so nothing would have noticed this field taking
// its own ad-hoc props and quietly dropping `help`, `entryHelp` and `disabled`.
expectFieldContract((props) => render(
  <PuzzleSourceField
    value={BASE}
    onChange={() => {}}
    seenBy={[]}
    clubHandle="moths"
    {...props}
  />,
))

beforeEach(() => {
  mockRpc.mockReset()
  mockRpc.mockResolvedValue({ data: null })
})

describe('the puzzle caption', () => {
  // `summarize` directly: the caption is a pure function of the setup plus the
  // resolved date, and testing it here says what each source READS AS without
  // standing up four pickers to produce the values.
  const say = (values: Partial<PuzzleChoice>, resolved?: string | null, title?: string) =>
    summarize({ ...BASE, ...values }, resolved, title ?? null)

  it('asks for a choice before one is made', () => {
    expect(say({ source: 'library' })).toBe('Puzzle: choose one')
    expect(say({ source: 'guardian' })).toBe('Puzzle: choose one')
    expect(say({ source: 'upload' })).toBe('Puzzle: choose one')
  })

  it('names a library puzzle and its author', () => {
    expect(say({ source: 'library', puzzle_id: 'p1' }, null, 'Bee Season · Patrick Berry'))
      .toBe('Puzzle: Bee Season · Patrick Berry')
  })

  it('names the NYT weekday AND the date it resolved to', () => {
    // The whole reason the caption is load-bearing. "NYT Monday" alone would
    // drop the fact the player opened the picker to learn.
    expect(say({ source: 'nyt', weekday: 1 }, '2026-08-24'))
      .toBe('Puzzle: NYT Monday · 2026-08-24')
  })

  it('says a weekday is used up rather than leaving it blank', () => {
    expect(say({ source: 'nyt', weekday: 1 }, null)).toBe('Puzzle: NYT Monday · none left')
  })

  it('says it is still asking, which is not the same as none left', () => {
    // Three states, not two: before the answer lands this must not read as a
    // refusal. `undefined` is "we have not been told"; `null` is "there is
    // nothing".
    expect(say({ source: 'nyt', weekday: 1 }, undefined)).toBe('Puzzle: NYT Monday · looking…')
  })

  it('drops the weekday when an explicit date overrides it', () => {
    // The two answer one question, so naming both would suggest they combine.
    expect(say({ source: 'nyt', weekday: 1, date: '2026-08-24' }))
      .toBe('Puzzle: NYT 2026-08-24')
  })

  it('names a Guardian series by its label, not its slug', () => {
    expect(say({ source: 'guardian', series: 'quiptic' })).toBe('Puzzle: Guardian Quiptic')
  })

  it('names an upload by BOTH its puzzle and its file', () => {
    // The title is what the puzzle IS; the filename is what you would check to
    // know you grabbed the right one.
    expect(
      say({
        source: 'upload',
        filename: 'moth.puz',
        board: { meta: { title: 'Bee Season' }, solution: [] } as never,
      }),
    ).toBe('Puzzle: Bee Season · moth.puz')
  })

  it('falls back to the filename when a file carries no title', () => {
    // Common in .puz — the title is often absent or machine-written.
    expect(
      say({ source: 'upload', filename: 'moth.puz', board: { meta: {}, solution: [] } as never }),
    ).toBe('Puzzle: moth.puz')
  })
})

describe('the field', () => {
  it('offers the four sources', async () => {
    draw()
    for (const name of ['Library', 'NYT', 'Guardian', 'Upload']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('carries a refusal under its own name', () => {
    // What F50 (`puzzle-source-picks-in-a-dialog`) bought. The button row is on
    // screen whichever source was chosen, so this message is always beside a
    // control rather than on the dialog's bottom line.
    draw({}, 'Pick a puzzle to start.')
    expect(errorUnder('source')).toBe('Pick a puzzle to start.')
  })

  it('opens a picker rather than switching a tab', async () => {
    const user = userEvent.setup()
    const { onChange } = draw()

    await user.click(screen.getByRole('button', { name: 'Guardian' }))

    // Pressing a source button chooses NOTHING on its own — the picker does.
    // The tabs it replaces wrote `source` on click, which is why a half-made
    // choice could sit in `setup` while you looked at a different tab.
    expect(onChange).not.toHaveBeenCalled()
    // The Guardian picker is up, showing its series.
    expect(screen.getByText('Quiptic')).toBeInTheDocument()
  })

  it('renders a picker OUTSIDE its own tree, or it paints under the setup dialog', async () => {
    // The bug this exists for looked like the layer system failing: the screen
    // dimmed and nothing appeared on top. A blocking modal asks for z-index
    // 5000 against the setup dialog's 2200, but z-index only ranks siblings
    // within a stacking context — and the setup panel is draggable, so react-rnd
    // inlines a `transform`, which makes one. A picker rendered as a child is
    // trapped inside 2200; its scrim is fixed-position and dims anyway.
    //
    // jsdom has no layout and cannot see a stacking context, so this asserts the
    // thing that CAUSES it: the picker must not be a descendant of the field.
    const user = userEvent.setup()
    const { container } = draw()

    await user.click(screen.getByRole('button', { name: 'Guardian' }))

    const picker = screen.getByRole('group', { name: 'Guardian series' })
    expect(picker).toBeInTheDocument()
    expect(container.contains(picker)).toBe(false)
  })

  it('moves focus INTO the picker, or Escape closes the setup dialog instead', async () => {
    // The bug this exists for: you open a picker by CLICKING a source button, so
    // that button holds focus — and it lives in the setup dialog, not the modal.
    // Escape is answered by "the panel focus is in, else the topmost"
    // (`usePanelEscape`), so focus left behind means one Escape closes the SETUP
    // dialog, and the picker vanishes with it, because a field inside that
    // dialog is what renders it. Two panels, one key, both gone.
    //
    // `SelectionList`'s own `autoFocus` cannot do this: it yields to anything
    // already focused, which is right for a list on a page and wrong inside a
    // modal that owns the keyboard.
    const user = userEvent.setup()
    draw()

    await user.click(screen.getByRole('button', { name: 'Guardian' }))

    const picker = screen.getByRole('group', { name: 'Guardian series' })
    expect(picker.contains(document.activeElement)).toBe(true)
  })

  it('only asks which date a weekday resolves to when that is the question', () => {
    // A library game has no weekday to resolve, and asking anyway would spend a
    // round trip per setup dialog for an answer nothing reads.
    draw({ source: 'library' })
    expect(mockRpc).not.toHaveBeenCalled()

    draw({ source: 'nyt', weekday: 1 })
    expect(mockRpc).toHaveBeenCalledWith('next_nyt_date_for_club', { seen_by: ['self'], dow: 1 })
  })

  it('does not ask when an explicit date has already answered it', () => {
    draw({ source: 'nyt', weekday: 1, date: '2026-08-24' })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
