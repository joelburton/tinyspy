// cs-unmet

/**
 * The upload picker — the file is read HERE, not at Start.
 *
 * That is the fact everything else about this component follows from. The parse
 * is client-side and immediate, so a bad file is refused standing in front of
 * the drop target that caused it; and a good one can close the modal at once,
 * because by then the whole grid is in hand and there is nothing left to
 * confirm. It is also why the setup form's caption can name the puzzle AND the
 * file: both are known the moment this closes.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadPickerBlockingModal } from './UploadPickerBlockingModal'

const { mockImport } = vi.hoisted(() => ({ mockImport: vi.fn() }))
vi.mock('../../lib/importFile', () => ({ importCrosswordFile: mockImport }))

const onPick = vi.fn()
const onClose = vi.fn()

const BOARD = { meta: { title: 'Bee Season', width: 15, height: 15 }, solution: [] }

const draw = () => render(<UploadPickerBlockingModal onPick={onPick} onClose={onClose} />)

/** A file dropped on the target, which is the path a player actually takes. */
function drop(view: ReturnType<typeof draw>, name: string) {
  const file = new File(['x'], name)
  fireEvent.drop(view.getByRole('button', { name: /Drop a/ }), {
    dataTransfer: { files: [file] },
  })
}

beforeEach(() => {
  onPick.mockReset()
  onClose.mockReset()
  mockImport.mockReset()
  mockImport.mockResolvedValue(BOARD)
})

describe('the upload picker', () => {
  it('reads the file on drop and hands back the board AND its name', async () => {
    const view = draw()

    drop(view, 'moth.puz')

    await waitFor(() =>
      expect(onPick).toHaveBeenCalledWith({ board: BOARD, filename: 'moth.puz' }),
    )
  })

  it('reads a file chosen through the picker button too', async () => {
    const user = userEvent.setup()
    draw()

    await user.upload(screen.getByLabelText('Crossword file'), new File(['x'], 'moth.ipuz'))

    await waitFor(() =>
      expect(onPick).toHaveBeenCalledWith({ board: BOARD, filename: 'moth.ipuz' }),
    )
  })

  it('keeps the modal open on a bad file, saying why', async () => {
    // The only thing that holds this picker open. Everything else closes or
    // cancels — and a parse failure has to stay, because the fix is to drop a
    // different file, which you do right here.
    mockImport.mockRejectedValue(new Error('That .puz has no grid.'))
    const view = draw()

    drop(view, 'broken.puz')

    await waitFor(() => expect(screen.getByText('That .puz has no grid.')).toBeInTheDocument())
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('falls back to a plain sentence when the failure has no message', async () => {
    mockImport.mockRejectedValue('nope')
    const view = draw()

    drop(view, 'broken.puz')

    await waitFor(() => expect(screen.getByText('Could not read that file.')).toBeInTheDocument())
  })

  it('cancels without picking', async () => {
    const user = userEvent.setup()
    draw()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })
})
