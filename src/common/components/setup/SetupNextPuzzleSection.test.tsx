// cs-unmet

/**
 * WHAT START WILL PLAY (see SetupNextPuzzleSection.tsx) — connections' and
 * strands' puzzle line, and the only setup field that goes and asks.
 *
 * Two three-state values run it, and both exist because collapsing them lost a
 * real distinction: "we have not asked yet" has to look different from "we
 * asked and there is nothing", or the instant between typing a date and the
 * answer arriving reads as a refusal.
 *
 * The other rule worth holding is what an override says to the parent.
 * Clearing the date does not send an empty string — it sends `undefined`, and
 * the ABSENCE of `setup.puzzle_id` is what tells `create_game` to choose for
 * itself. An empty string would be a puzzle id nothing matches.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SetupNextPuzzleSection } from './SetupNextPuzzleSection'

const DERIVED = { id: 'p1', label: '2026-08-20: soup, spoon' }
const BY_DATE = { id: 'p2', label: '2026-08-27: moth, lamp' }

const load = vi.fn()
const loadByDate = vi.fn()
const onPick = vi.fn()

function draw(seenBy = ['self', 'moth']) {
  render(
    <SetupNextPuzzleSection
      brand="Connections"
      seenBy={seenBy}
      load={load}
      loadByDate={loadByDate}
      onPick={onPick}
      errors={{}}
    />,
  )
}

const dateBox = () => document.querySelector('[name="puzzle_id"]') as HTMLInputElement
const type = (value: string) => fireEvent.change(dateBox(), { target: { value } })

beforeEach(() => {
  load.mockReset()
  loadByDate.mockReset()
  onPick.mockReset()
  load.mockResolvedValue(DERIVED)
  loadByDate.mockResolvedValue(BY_DATE)
})

describe('SetupNextPuzzleSection — what it says Start will play', () => {
  it("names the puzzle the server derived, once it has one", async () => {
    draw()
    await waitFor(() => expect(screen.getByText(`Puzzle: ${DERIVED.label}`)).toBeInTheDocument())
  })

  it('says it is still asking, rather than saying there is nothing', async () => {
    // The distinction the two three-state values exist for: before the answer
    // lands, this must not read as "none left".
    load.mockReturnValue(new Promise(() => {}))
    draw()

    expect(screen.getByText(/loading; please wait/)).toBeInTheDocument()
    expect(screen.queryByText(/none left/)).not.toBeInTheDocument()
  })

  it('says the archive is used up when the server has nothing', async () => {
    load.mockResolvedValue(null)
    draw()

    await waitFor(() => expect(screen.getByText('Puzzle: none left')).toBeInTheDocument())
    // A message you have to SEE, so the section opens itself rather than
    // hiding the one thing that matters behind a summary.
    expect((document.querySelector('details') as HTMLDetailsElement).open).toBe(true)
  })

  it('re-asks when the player set changes, because unchecking someone can bring a puzzle back', async () => {
    const { rerender } = render(
      <SetupNextPuzzleSection
        brand="Connections"
        seenBy={['self', 'moth']}
        load={load}
        loadByDate={loadByDate}
        onPick={onPick}
      errors={{}}
      />,
    )
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))

    rerender(
      <SetupNextPuzzleSection
        brand="Connections"
        seenBy={['self']}
        load={load}
        loadByDate={loadByDate}
        onPick={onPick}
      errors={{}}
      />,
    )
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(load).toHaveBeenLastCalledWith(['self'])
  })

  it('does not re-ask when the same player set arrives as a new array', async () => {
    // `seenBy` is a fresh array on every parent render; keying on the array
    // itself would fetch forever.
    const props = { brand: 'Connections', load, loadByDate, onPick, errors: {} }
    const { rerender } = render(<SetupNextPuzzleSection {...props} seenBy={['self']} />)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))

    rerender(<SetupNextPuzzleSection {...props} seenBy={['self']} />)
    await new Promise((r) => setTimeout(r, 0))

    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('SetupNextPuzzleSection — the date override', () => {
  it('plays the puzzle for a date you type', async () => {
    draw()
    await waitFor(() => expect(load).toHaveBeenCalled())

    type('2026-08-27')

    await waitFor(() => expect(onPick).toHaveBeenCalledWith(BY_DATE.id))
    expect(screen.getByText(`Puzzle: ${BY_DATE.label}`)).toBeInTheDocument()
  })

  it('says so when that date has no puzzle', async () => {
    loadByDate.mockResolvedValue(null)
    draw()
    await waitFor(() => expect(load).toHaveBeenCalled())

    type('2026-08-27')

    await waitFor(() => expect(screen.getByText(/nothing on 2026-08-27/)).toBeInTheDocument())
  })

  it('hands back UNDEFINED when you clear the date, not an empty id', async () => {
    // Absence is the instruction: `create_game` reads a missing `puzzle_id` as
    // "you choose". An empty string would be an id that matches nothing.
    draw()
    await waitFor(() => expect(load).toHaveBeenCalled())
    type('2026-08-27')
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(BY_DATE.id))

    type('')

    await waitFor(() => expect(onPick).toHaveBeenLastCalledWith(undefined))
  })
})
