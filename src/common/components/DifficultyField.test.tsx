import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DifficultyField } from './DifficultyField'

describe('DifficultyField', () => {
  it('lists all six bands as "N: Label: SAMPLES" and disables out-of-range', () => {
    render(
      <DifficultyField
        label="Difficulty"
        length={5}
        minDifficulty={2}
        maxDifficulty={4}
        value={3}
        onChange={() => {}}
      />,
    )
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(6)
    expect(options[0]).toHaveTextContent('1: Universal: HAPPY CHAIR BLOOM TULIP ALARM')
    // Bands outside [2, 4] are shown but disabled; inside are selectable.
    expect(options[0]).toBeDisabled() // band 1 < min
    expect(options[1]).toBeEnabled() // band 2
    expect(options[3]).toBeEnabled() // band 4
    expect(options[4]).toBeDisabled() // band 5 > max
  })

  it('reports the chosen band as a number', async () => {
    const onChange = vi.fn()
    render(
      <DifficultyField
        label="Difficulty"
        length={2}
        minDifficulty={1}
        maxDifficulty={6}
        value={1}
        onChange={onChange}
      />,
    )
    await userEvent.selectOptions(screen.getByRole('combobox'), '4')
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('shows length-appropriate samples (2-letter set)', () => {
    render(
      <DifficultyField length={2} minDifficulty={1} maxDifficulty={6} value={1} onChange={() => {}} />,
    )
    expect(screen.getAllByRole('option')[1]).toHaveTextContent('2: Common: AX EX OW BI YO')
  })

  it('drops the 2-letter words for the "3+" length', () => {
    render(
      <DifficultyField length="3+" minDifficulty={1} maxDifficulty={6} value={1} onChange={() => {}} />,
    )
    // Band 1 open is "OX CAT MILK HAPPY JUMP"; the 3+ set drops OX.
    const band1 = screen.getAllByRole('option')[0]
    expect(band1).toHaveTextContent('1: Universal: CAT MILK HAPPY JUMP')
    expect(band1.textContent).not.toContain('OX')
  })

  it('prepends an always-enabled extra option (wordle "0: Wordle")', () => {
    render(
      <DifficultyField
        label="Answer source"
        length={5}
        minDifficulty={1}
        maxDifficulty={6}
        value={0}
        onChange={() => {}}
        extraLowOption={{ value: 0, label: 'Wordle' }}
      />,
    )
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(7) // 0 + bands 1..6
    expect(options[0]).toHaveTextContent('0: Wordle')
    expect(options[0]).toBeEnabled()
  })

  it('disables the whole control when asked (stackdown is locked to band 1)', () => {
    render(
      <DifficultyField
        length={5}
        minDifficulty={1}
        maxDifficulty={1}
        value={1}
        onChange={() => {}}
        disabled
      />,
    )
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
