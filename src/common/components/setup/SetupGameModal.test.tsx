// cs-unmet

/**
 * THE SETUP DIALOG (see SetupGameModal.tsx) — what it collects, and what it
 * does with it on the way out.
 *
 * It is an ordinary `<StandardForm>` now, so what is left that is its own is
 * the SEAM: the form holds one flat object keyed by field name, and
 * `create_game` takes a setup blob plus a separate list of players. Splitting
 * them is one destructure in one place, and getting it wrong sends a game's
 * roster into the setup column where nothing reads it.
 *
 * The setup BODY is a stand-in here. Every game's real one is tested in its own
 * file; what this needs from a body is that it reads `values` and writes with
 * `set`, which any of them does.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SetupGameModal } from './SetupGameModal'
import { PlayersSection } from './PlayersSection'
import { NumberField } from '../fields/NumberField'
import type { GameManifest, Member, SetupBodyProps } from '../../lib/games'
import { errorUnder } from '../fields/errorUnder'

const MESSAGE = 'The server said this exact thing.'

const MEMBERS = [
  { user_id: 'self', username: 'joel', color: 'red' },
  { user_id: 'moth', username: 'moth', color: 'blue' },
] as Member[]

/** Stands in for a game's setup body: the players picker every body renders,
 *  plus one field of its own, read and written the way a real one does. */
function Body({ values, set, members, selfId, numberOfPlayers, errors }: SetupBodyProps) {
  const v = values as { guesses: number; player_user_ids: Set<string> }
  return (
    <>
      <PlayersSection
        members={members}
        selfId={selfId}
        numberOfPlayers={numberOfPlayers}
        value={v.player_user_ids}
        onChange={(next) => set('player_user_ids', next)}
      />
      <NumberField
        name="guesses"
        chars={2}
        value={v.guesses}
        onChange={(guesses) => set('guesses', guesses)}
        error={errors.guesses}
      />
    </>
  )
}

const startGameInClub = vi.fn()
const validate = vi.fn<(setup: unknown, playerCount: number) => string | null>(() => null)

function manifest(over: Partial<GameManifest> = {}): GameManifest {
  return {
    name: 'PsychicNum',
    mode: 'coop',
    numberOfPlayers: [1, 4],
    startGameInClub,
    help: (() => null) as unknown as GameManifest['help'],
    setupForm: { Component: Body, defaults: { guesses: 7 }, validate },
    ...over,
  } as GameManifest
}

function draw(over: Partial<GameManifest> = {}, savedDefault?: unknown) {
  const onStarted = vi.fn()
  render(
    <SetupGameModal
      manifest={manifest(over)}
      members={MEMBERS}
      selfId="self"
      clubHandle="moths"
      savedDefault={savedDefault}
      onStarted={onStarted}
      onCancel={() => {}}
    />,
  )
  return onStarted
}

const start = () => screen.getByRole('button', { name: /^Start/ })

beforeEach(() => {
  startGameInClub.mockReset()
  startGameInClub.mockResolvedValue({ type: 'ok', data: { id: 'g1' } })
  validate.mockReset()
  validate.mockReturnValue(null)
})

describe('SetupGameModal — what it starts with', () => {
  it('seeds from the manifest defaults', async () => {
    draw()
    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue(7))
  })

  it("lets the club's saved setup win over them, field by field", async () => {
    // A manifest growing a NEW field stays compatible: the saved blob covers
    // what it covers, and the rest falls through to the defaults.
    draw({}, { guesses: 3 })
    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue(3))
  })

  it('starts with everyone in the club playing', async () => {
    draw()
    const boxes = await screen.findAllByRole('checkbox')
    for (const box of boxes) expect(box).toBeChecked()
  })
})

describe('SetupGameModal — the seam', () => {
  it('sends the players as their own argument, and NOT inside the setup', async () => {
    const user = userEvent.setup()
    draw()
    await waitFor(() => expect(screen.getByRole('spinbutton')).toBeInTheDocument())
    await user.click(start())

    await waitFor(() => expect(startGameInClub).toHaveBeenCalled())
    const [clubHandle, setup, players] = startGameInClub.mock.calls[0]!
    expect(clubHandle).toBe('moths')
    expect(setup).toEqual({ guesses: 7 })
    expect(setup).not.toHaveProperty('player_user_ids')
    expect(players).toEqual(['self', 'moth'])
  })

  it('sends what the body wrote, not what it started with', async () => {
    const user = userEvent.setup()
    draw()
    const box = await screen.findByRole('spinbutton')
    await user.clear(box)
    await user.type(box, '3')
    await user.click(start())

    await waitFor(() => expect(startGameInClub).toHaveBeenCalled())
    expect(startGameInClub.mock.calls[0]![1]).toEqual({ guesses: 3 })
  })

  it('drops an unchecked player from the list it sends', async () => {
    const user = userEvent.setup()
    draw()
    const boxes = await screen.findAllByRole('checkbox')
    await user.click(boxes[1]!)
    await user.click(start())

    await waitFor(() => expect(startGameInClub).toHaveBeenCalled())
    expect(startGameInClub.mock.calls[0]![2]).toEqual(['self'])
  })

  it('hands the new game id to the caller', async () => {
    const user = userEvent.setup()
    const onStarted = draw()
    await waitFor(() => expect(screen.getByRole('spinbutton')).toBeInTheDocument())
    await user.click(start())

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('g1'))
  })
})

describe('SetupGameModal — when Start is refused', () => {
  it('is blocked while the cross-field guard has something to say', async () => {
    validate.mockReturnValue('The bag is too small for that many players.')
    draw()

    await waitFor(() => expect(start()).toBeDisabled())
    expect(screen.getByText('The bag is too small for that many players.')).toBeInTheDocument()
  })

  it('is blocked while the player count is out of range', async () => {
    const user = userEvent.setup()
    draw({ numberOfPlayers: [2, 4] })
    const boxes = await screen.findAllByRole('checkbox')

    // Uncheck the one player who can be unchecked — the creator's row is
    // locked — leaving one, below the minimum of two.
    await user.click(boxes[1]!)

    await waitFor(() => expect(start()).toBeDisabled())
  })

  it('never reaches the server while it is blocked', async () => {
    validate.mockReturnValue('No.')
    const user = userEvent.setup()
    draw()
    await waitFor(() => expect(start()).toBeDisabled())
    await user.click(start())

    expect(startGameInClub).not.toHaveBeenCalled()
  })

  it("puts a refusal that names no field on the form's line", async () => {
    startGameInClub.mockResolvedValue({
      type: 'not-ok',
      severity: 'error',
      message: MESSAGE,
    })
    const user = userEvent.setup()
    draw()
    await waitFor(() => expect(screen.getByRole('spinbutton')).toBeInTheDocument())
    await user.click(start())

    await waitFor(() => expect(screen.getByText(MESSAGE)).toBeInTheDocument())
    expect(errorUnder('guesses')).not.toBe(MESSAGE)
  })

  it('puts a validation that NAMES a field under that field', async () => {
    // The whole reason the dialog became a form: `create_game` raising
    // `column = 'guesses'` reaches the box the player typed into, rather than
    // a line at the bottom that makes them work out which of six it meant.
    startGameInClub.mockResolvedValue({
      type: 'not-ok',
      severity: 'validation',
      field: 'guesses',
      message: MESSAGE,
    })
    const user = userEvent.setup()
    draw()
    await waitFor(() => expect(screen.getByRole('spinbutton')).toBeInTheDocument())
    await user.click(start())

    await waitFor(() => expect(errorUnder('guesses')).toBe(MESSAGE))
  })

  it("shows a FAULT's words on the line too, since the modal is dismissible", async () => {
    // The modal is raised on the way through `dbFetch`; this line is what is
    // left once it is dismissed, with the dialog still open behind it.
    startGameInClub.mockResolvedValue({ type: 'not-ok', severity: 'fault', message: MESSAGE })
    const user = userEvent.setup()
    draw()
    await waitFor(() => expect(screen.getByRole('spinbutton')).toBeInTheDocument())
    await user.click(start())

    await waitFor(() => expect(screen.getByText(MESSAGE)).toBeInTheDocument())
  })
})

describe('SetupGameModal — the form boundary', () => {
  it('starts the game on Enter, because Start submits the form', async () => {
    const user = userEvent.setup()
    draw()
    const box = await screen.findByRole('spinbutton')
    await user.click(box)
    await user.keyboard('{Enter}')

    await waitFor(() => expect(startGameInClub).toHaveBeenCalled())
  })
})
