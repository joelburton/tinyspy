// cs-unmet

import { IconExchange } from '../icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Swap-tiles button — return some rack tiles to the bag and draw replacements
 * (scrabble's exchange). The two-way-arrows glyph at **`info`** tone (the accent
 * color, "no valence — just a different action"): swapping isn't good or bad and
 * isn't the primary move, so it reads as a distinct secondary commit alongside
 * the primary Submit. Default label **"Swap"**.
 *
 * It IS a turn-committing action (it costs the turn in compete, though unlike a
 * pass it doesn't count toward the blocked end), which is why it sits on the
 * commit side of scrabble's action
 * row next to Submit — but Submit stays the filled-accent primary, so Swap takes
 * the lighter outline+tone weight.
 */
export function ExchangeButton({
  name = 'Swap',
  icon = IconExchange,
  tone = 'normal',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} tone={tone} {...rest} />
}
