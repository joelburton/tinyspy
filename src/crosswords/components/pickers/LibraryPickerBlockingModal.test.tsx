// cs-unmet

/**
 * The library picker — choosing closes it.
 *
 * That is the rule the whole design rests on (plans/areas/forms.md → F50
 * `puzzle-source-picks-in-a-dialog`), and it is the one thing here a refactor
 * could quietly undo: put the list back on `selected`/`onSelect` and everything
 * still renders, still highlights, still looks right — and starting a game
 * costs a press it did not cost as a tab.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LibraryPickerBlockingModal } from './LibraryPickerBlockingModal'

// jsdom doesn't implement scrollIntoView, and SelectionList keeps the cursor
// row in view with it — same stub PlayArea.test.tsx uses for ClueLists.
Element.prototype.scrollIntoView = vi.fn()

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../../db', () => ({ db: { rpc: mockRpc } }))

const ROWS = [
  { id: 'p1', title: 'Bee Season', author: 'Patrick Berry', status: 'unplayed' },
  { id: 'p2', title: 'Cross Purposes', author: 'Robyn Weintraub', status: 'solved' },
]

/** An `ok` envelope as the wire carries one — all nine keys, because `runRpc`
 *  reads the SHAPE and not just the arm. */
const library = (puzzles: unknown[]) => ({
  data: {
    type: 'ok', data: { result: 'library', puzzles },
    outcome: null, severity: null, message: null,
    field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
  status: 200,
})

const onPick = vi.fn()
const onClose = vi.fn()

function draw() {
  return render(
    <LibraryPickerBlockingModal clubHandle="moths" onPick={onPick} onClose={onClose} />,
  )
}

beforeEach(() => {
  onPick.mockReset()
  onClose.mockReset()
  mockRpc.mockReset()
  mockRpc.mockResolvedValue(library(ROWS))
})

describe('the library picker', () => {
  it('lists the club’s library, asked for by club', async () => {
    draw()
    await waitFor(() => expect(screen.getByText(/Bee Season/)).toBeInTheDocument())
    expect(mockRpc).toHaveBeenCalledWith('library_for_club', { target_club: 'moths' })
  })

  it('picks the puzzle you click, and hands back the whole row', async () => {
    // The row, not just its id: the caption names the puzzle, and the title
    // exists nowhere else once this closes.
    const user = userEvent.setup()
    draw()
    await waitFor(() => expect(screen.getByText(/Bee Season/)).toBeInTheDocument())

    await user.click(screen.getByText(/Bee Season/))

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', title: 'Bee Season' }))
  })

  it('picks with RETURN, the same as a click', async () => {
    // The reason the list is on `onActivate`. Arrow to a row, press Return,
    // done — rather than Return recording a choice that a second press then
    // has to confirm.
    const user = userEvent.setup()
    draw()
    await waitFor(() => expect(screen.getByText(/Bee Season/)).toBeInTheDocument())

    // Focused explicitly: the list's own autoFocus yields when it has no layout
    // box, and jsdom gives it none. The keys are what this is about.
    screen.getByRole('group', { name: 'Puzzle library' }).focus()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }))
  })

  it('filters by title or author without changing what a pick means', async () => {
    const user = userEvent.setup()
    draw()
    await waitFor(() => expect(screen.getByText(/Bee Season/)).toBeInTheDocument())

    await user.type(screen.getByLabelText('Filter puzzles'), 'weintraub')

    expect(screen.queryByText(/Bee Season/)).not.toBeInTheDocument()
    await user.click(screen.getByText(/Cross Purposes/))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }))
  })

  it('says the library is empty as a fact, not as a command', async () => {
    // A shell command here would tell a friend on production to run something
    // they cannot. Filling the library is Joel's job, not the player's.
    mockRpc.mockResolvedValue(library([]))
    draw()

    await waitFor(() => expect(screen.getByText('No puzzles found.')).toBeInTheDocument())
  })

  it('distinguishes “still loading” from “nothing there”', async () => {
    mockRpc.mockReturnValue(new Promise(() => {}))
    draw()

    expect(screen.getByText('Loading puzzles…')).toBeInTheDocument()
    expect(screen.queryByText('No puzzles found.')).not.toBeInTheDocument()
  })

  it('cancels without picking', async () => {
    const user = userEvent.setup()
    draw()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })
})
