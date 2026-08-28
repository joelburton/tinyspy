// cs-unmet

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ManualBoardField } from './ManualBoardField'

/**
 * The field that writes a board down (see ManualBoardField.tsx). What is
 * asserted here is the SEPARATOR CONTRACT, because it is the one thing about
 * this field that a caller cannot see and cannot get right on its own.
 *
 * The field inserts the dashes, so it must also ignore them on the way in.
 * A caller storing what it is handed — which letterboxed does, and which is the
 * ordinary way to write a controlled input — otherwise feeds the field its own
 * output, and each render groups the previous grouping: the dashes multiply
 * from the fifth letter on.
 *
 * Deliberately NOT asserted: any class name. `vite.config.ts` sets `css: false`
 * for vitest, so a CSS module fabricates whatever name it is asked for.
 */

/** A caller that stores exactly what the field hands it — the shape that makes
 *  a separator bug visible, and the shape letterboxed actually uses. */
function Harness({ groups }: { groups?: number[] }) {
  const [value, setValue] = useState('')
  return (
    <ManualBoardField
      name="custom_board"
      value={value}
      onChange={setValue}
      placeholder="ABC-DEF-GHI-JKL"
      chars={15}
      groups={groups}
    />
  )
}

describe('ManualBoardField separators', () => {
  it('groups as you type, without re-grouping its own dashes', async () => {
    const user = userEvent.setup()
    render(<Harness groups={[3, 3, 3, 3]} />)
    const box = screen.getByRole('textbox')

    await user.type(box, 'BICAEMYUKLRF')

    expect(box).toHaveValue('BIC-AEM-YUK-LRF')
  })

  it('takes a board pasted in any written form', async () => {
    const user = userEvent.setup()

    for (const pasted of ['BIC-AEM-YUK-LRF', 'BIC AEM YUK LRF', 'BICAEMYUKLRF']) {
      const { unmount } = render(<Harness groups={[3, 3, 3, 3]} />)
      const box = screen.getByRole('textbox')
      await user.click(box)
      await user.paste(pasted)
      expect(box, `pasted as "${pasted}"`).toHaveValue('BIC-AEM-YUK-LRF')
      unmount()
    }
  })

  it('leaves the text alone when no grouping is asked for', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const box = screen.getByRole('textbox')

    await user.type(box, 'MOTH')

    expect(box).toHaveValue('MOTH')
  })

  it('hands the caller the raw keystroke result, not the grouped text', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ManualBoardField
        name="custom_board"
        value="BICAEM"
        onChange={onChange}
        placeholder="ABC-DEF-GHI-JKL"
        chars={15}
        groups={[3, 3, 3, 3]}
      />,
    )
    const box = screen.getByRole('textbox')
    // The field is showing "BIC-AEM"; typing Y makes the DOM value "BIC-AEMY",
    // and that is what the caller hears. Cleaning it is the caller's job — each
    // game's rules differ — and the next render regroups whatever it stores.
    await user.type(box, 'Y')

    expect(onChange).toHaveBeenCalledWith('BIC-AEMY')
  })
})
